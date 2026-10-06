import "server-only";

import { randomUUID } from "node:crypto";
import { FREE_SUBSCRIPTION, PLAN_ATTACHMENT_LIMITS, effectivePlan, type PlanAttachmentLimits, type PlanId } from "@/lib/plans";
import {
    ATTACHMENT_LIMITS,
    cleanFileName,
    imageSize,
    isFileId,
    jpegOrientation,
    nameForType,
    readMessageAttachment,
    sniffFile,
    stripImageMetadata,
    type MessageAttachment,
} from "@/lib/social/attachments";
import { healBeforeRefusing } from "./entitlements";
import { commitServerMutations, getServerDocument, runServerQuery } from "./firebase-rest";
import { getSubscription } from "./plans";
import { normalizeEmail } from "./validate";

/*
 * Files sent in Hanogt Social messages (lib/social/attachments.ts).
 *
 * A file is message_files/{id}: what the message shows (name, size, type,
 * an image's size), who sent it, where (`container`: "dm:<chatId>" or
 * "group:<groupId>") and in which message, with the bytes inline up to
 * 700 kB and otherwise in message_files/{id}/parts/{0…n-1} (Firestore keeps
 * at most 1 MiB in a document). It is written in the same commit as its
 * message, so neither exists without the other. Serving it checks the
 * message (still there, still this file) and that the reader is in the
 * conversation or the group. Every file counts against its sender's plan
 * (message_file_usage/{email}: bytes and files, changed with atomic
 * increments); deleting the message, the conversation's files, the group or
 * the account frees it. Only the server reads and writes these collections.
 */

const FILES = "message_files";
const USAGE = "message_file_usage";
/** Bytes kept in one document; bigger files are split into parts. */
const PART_BYTES = 700_000;
const MAX_PARTS = Math.ceil(ATTACHMENT_LIMITS.maxBytes / PART_BYTES);
const MB = 1024 * 1024;

export type FileErrorCode =
    | "attachment_empty" | "attachment_too_large" | "attachment_type" | "attachment_image" | "attachment_storage" | "attachment_unavailable";

/** Expected failures: the message is Turkish (primary language), the interface translates the code. */
export class FileApiError extends Error {
    readonly status: number;
    readonly code: FileErrorCode;
    readonly extra: Record<string, unknown>;

    constructor(status: number, code: FileErrorCode, message: string, extra: Record<string, unknown> = {}) {
        super(message);
        this.name = "FileApiError";
        this.status = status;
        this.code = code;
        this.extra = extra;
    }
}

type Mutations = Parameters<typeof commitServerMutations>[0];
type StoredFile = {
    fileId?: unknown; name?: unknown; size?: unknown; contentType?: unknown; kind?: unknown; width?: unknown; height?: unknown;
    sender?: unknown; container?: unknown; messagePath?: unknown; parts?: unknown; data?: unknown; createdAt?: unknown;
};
type StoredMessage = { file?: unknown; deleted?: unknown };

/** A checked file ready to be written with its message. */
export type PreparedFile = { bytes: Uint8Array; attachment: MessageAttachment };

const unavailable = () => new FileApiError(404, "attachment_unavailable", "Dosya bulunamadı veya silinmiş.");

/* -------------------------------------------------------------------------- */
/* Limits                                                                     */
/* -------------------------------------------------------------------------- */

/** What the sender's plan allows (a plan bought a moment ago counts: healBeforeRefusing). */
export async function attachmentLimitsFor(email: string): Promise<{ plan: PlanId; limits: PlanAttachmentLimits }> {
    const subscription = await getSubscription(email).catch(() => FREE_SUBSCRIPTION);
    const plan = effectivePlan(subscription);
    return { plan, limits: PLAN_ATTACHMENT_LIMITS[plan] };
}

/** How much the files a person sent take up. */
export async function attachmentUsageOf(email: string) {
    const stored = await getServerDocument<{ bytes?: unknown; files?: unknown }>(`${USAGE}/${normalizeEmail(email)}`);
    const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0);
    return { bytes: count(stored?.bytes), files: count(stored?.files) };
}

/**
 * Refuses a file that is too big for the sender's plan or doesn't fit in its
 * storage. A plan bought a moment ago (the payment webhook still on its way)
 * is looked up before refusing.
 */
export async function assertFileFits(email: string, size: number) {
    let { plan, limits } = await attachmentLimitsFor(email);
    const usage = await attachmentUsageOf(email);
    const fits = () => size <= limits.fileBytes && usage.bytes + size <= limits.storageBytes;
    if (!fits()) {
        const healed = await healBeforeRefusing(email).catch(() => null);
        if (healed?.upgraded) {
            plan = healed.plan;
            limits = PLAN_ATTACHMENT_LIMITS[plan];
        }
    }
    if (size > limits.fileBytes) {
        throw new FileApiError(413, "attachment_too_large", `Planında bir dosya en fazla ${Math.round(limits.fileBytes / MB)} MB olabilir.`, { plan, limit: limits.fileBytes });
    }
    if (usage.bytes + size > limits.storageBytes) {
        throw new FileApiError(413, "attachment_storage", "Gönderdiğin dosyalar için ayrılan alan doldu. Eski dosyalı mesajları silerek yer açabilir ya da planını yükseltebilirsin: /plans", { plan, used: usage.bytes, limit: limits.storageBytes });
    }
    return { plan, limits };
}

/* -------------------------------------------------------------------------- */
/* Preparing and writing                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Checks a file for a message: what it is from its bytes (programs and
 * unknown formats are refused), a safe name with the right extension, an
 * image's size (giant pictures are refused) and photos without their
 * location and camera details.
 */
export function prepareFile(input: Uint8Array, name: unknown, maxBytes: number = ATTACHMENT_LIMITS.maxBytes): PreparedFile {
    if (!input.byteLength) throw new FileApiError(400, "attachment_empty", "Dosya boş.");
    if (input.byteLength > Math.min(maxBytes, ATTACHMENT_LIMITS.maxBytes)) {
        throw new FileApiError(413, "attachment_too_large", `Dosya en fazla ${Math.round(Math.min(maxBytes, ATTACHMENT_LIMITS.maxBytes) / MB)} MB olabilir.`, { limit: maxBytes });
    }
    const clean = cleanFileName(name);
    const sniffed = sniffFile(input, clean);
    if (!sniffed) throw new FileApiError(415, "attachment_type", "Bu dosya türü gönderilemez. Görsel, video, ses, PDF, arşiv, ofis belgesi veya metin ve kod dosyası gönderebilirsin.");
    let bytes = input;
    let width: number | null = null;
    let height: number | null = null;
    if (sniffed.kind === "image") {
        const size = imageSize(input, sniffed.contentType);
        if (!size) throw new FileApiError(415, "attachment_type", "Görsel okunamadı.");
        if (size.width > ATTACHMENT_LIMITS.imageEdgeMax || size.height > ATTACHMENT_LIMITS.imageEdgeMax || size.width * size.height > ATTACHMENT_LIMITS.imagePixels) {
            throw new FileApiError(413, "attachment_image", "Görselin boyutları çok büyük.");
        }
        // A photo turned by its EXIF orientation (5–8) shows with its sides swapped.
        const turned = sniffed.contentType === "image/jpeg" && jpegOrientation(input) >= 5;
        width = turned ? size.height : size.width;
        height = turned ? size.width : size.height;
        bytes = stripImageMetadata(input, sniffed.contentType);
    }
    const id = randomUUID();
    return {
        bytes,
        attachment: { id, name: nameForType(clean, sniffed), size: bytes.byteLength, contentType: sniffed.contentType, kind: sniffed.kind, width, height },
    };
}

/** What a message stores about its file (`file`). */
export function attachmentField(file: PreparedFile) {
    const { id, name, size, contentType, kind, width, height } = file.attachment;
    return { id, name, size, contentType, kind, width, height };
}

/**
 * The file's documents and its sender's usage, to be committed with the
 * message (`messagePath`) in one go.
 */
export function fileWrites(file: PreparedFile, owner: { sender: string; container: string; messagePath: string }, createdAt: Date): Mutations {
    const { id } = file.attachment;
    const size = file.bytes.byteLength;
    const parts = size <= PART_BYTES ? 0 : Math.ceil(size / PART_BYTES);
    const record: Record<string, unknown> = {
        ...attachmentField(file),
        fileId: id,
        sender: owner.sender,
        container: owner.container,
        messagePath: owner.messagePath,
        parts,
        createdAt,
    };
    delete record.id;
    if (!parts) record.data = file.bytes;
    return [
        { type: "create", path: `${FILES}/${id}`, data: record },
        ...Array.from({ length: parts }, (_, index) => ({
            type: "create" as const,
            path: `${FILES}/${id}/parts/${index}`,
            data: { data: file.bytes.subarray(index * PART_BYTES, (index + 1) * PART_BYTES) },
        })),
        { type: "increment", path: `${USAGE}/${owner.sender}`, fields: { bytes: size, files: 1 } },
    ];
}

/**
 * Commits a message with its file. After an unclear failure (the connection
 * dropped after Firestore applied it) the file is removed unless its message
 * is there, so a file never stays without its message.
 */
export async function commitWithFile(file: PreparedFile, messagePath: string, writes: Mutations) {
    try {
        await commitServerMutations(writes);
    } catch (error) {
        const message = await getServerDocument(messagePath).catch(() => undefined);
        if (message === null) await deleteMessageFiles([file.attachment.id]).catch(() => undefined);
        throw error;
    }
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

function partCount(value: unknown) {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_PARTS ? value : null;
}

async function readBytes(id: string, record: StoredFile): Promise<Uint8Array<ArrayBuffer>> {
    const size = typeof record.size === "number" && Number.isInteger(record.size) && record.size > 0 && record.size <= ATTACHMENT_LIMITS.maxBytes ? record.size : 0;
    const parts = partCount(record.parts);
    if (!size || parts === null) throw unavailable();
    const chunks = parts === 0
        ? [record.data]
        : (await Promise.all(Array.from({ length: parts }, (_, index) => getServerDocument<{ data?: unknown }>(`${FILES}/${id}/parts/${index}`)))).map((part) => part?.data);
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        // A missing or mismatched part (e.g. while the file is being deleted): never serve a cut file.
        if (!(chunk instanceof Uint8Array) || offset + chunk.byteLength > size) throw unavailable();
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    if (offset !== size) throw unavailable();
    return bytes;
}

/** "dm:<chatId>" or "group:<groupId>" and the message path that belongs to it; null for anything else. */
function placeOf(record: StoredFile): { kind: "dm" | "group"; id: string; messagePath: string } | null {
    const container = typeof record.container === "string" ? record.container : "";
    const messagePath = typeof record.messagePath === "string" ? record.messagePath : "";
    const [kind, id = ""] = container.split(":");
    if ((kind !== "dm" && kind !== "group") || !/^[A-Za-z0-9@._+-]{1,300}$/.test(id)) return null;
    const prefix = kind === "dm" ? `chats/${id}/messages/` : `groups/${id}/messages/`;
    if (!messagePath.startsWith(prefix) || !/^[A-Za-z0-9_-]{1,64}$/.test(messagePath.slice(prefix.length))) return null;
    return { kind, id, messagePath };
}

function emails(value: unknown) {
    return Array.isArray(value) ? value.map(normalizeEmail).filter(Boolean) : [];
}

/**
 * One byte range (`bytes=a-b`, `bytes=a-` or the last n bytes, `bytes=-n`)
 * of a file of `size` bytes; null serves all of it, "unsatisfiable" when the
 * range starts past the end.
 */
function byteRange(header: string | null | undefined, size: number): { start: number; end: number } | "unsatisfiable" | null {
    const match = /^bytes=(\d{0,12})-(\d{0,12})$/.exec(header?.trim() ?? "");
    if (!match || (!match[1] && !match[2])) return null;
    if (!match[1]) {
        const length = Number(match[2]);
        return length > 0 ? { start: Math.max(0, size - length), end: size - 1 } : "unsatisfiable";
    }
    const start = Number(match[1]);
    if (match[2] && Number(match[2]) < start) return null;
    if (start >= size) return "unsatisfiable";
    return { start, end: match[2] ? Math.min(Number(match[2]), size - 1) : size - 1 };
}

export type OpenedFile = {
    status: 200 | 206 | 416;
    body: Uint8Array<ArrayBuffer>;
    contentRange: string | null;
    size: number;
    attachment: MessageAttachment;
};

/**
 * A file for someone who may see its message: a participant of the
 * conversation (former friends keep their history) or a member of the
 * group, while the message is there and still carries this file.
 */
export async function openMessageFile(email: string, id: unknown, range?: string | null): Promise<OpenedFile> {
    if (!isFileId(id)) throw unavailable();
    const record = await getServerDocument<StoredFile>(`${FILES}/${id}`);
    const place = record ? placeOf(record) : null;
    if (!record || !place) throw unavailable();
    const me = normalizeEmail(email);
    if (place.kind === "dm") {
        const chat = await getServerDocument<{ participants?: unknown }>(`chats/${place.id}`);
        const participants = emails(chat?.participants);
        if (participants.length !== 2 || !participants.includes(me)) throw unavailable();
    } else {
        const group = await getServerDocument<{ members?: unknown }>(`groups/${place.id}`);
        if (!emails(group?.members).includes(me)) throw unavailable();
    }
    const message = await getServerDocument<StoredMessage>(place.messagePath);
    const shown = message && message.deleted !== true ? readMessageAttachment(message.file) : null;
    if (!shown || shown.id !== id) throw unavailable();
    const bytes = await readBytes(id, record);
    const size = bytes.byteLength;
    const wanted = byteRange(range, size);
    if (wanted === "unsatisfiable") return { status: 416, body: new Uint8Array(0), contentRange: `bytes */${size}`, size, attachment: shown };
    if (wanted) return { status: 206, body: bytes.subarray(wanted.start, wanted.end + 1), contentRange: `bytes ${wanted.start}-${wanted.end}/${size}`, size, attachment: shown };
    return { status: 200, body: bytes, contentRange: null, size, attachment: shown };
}

/* -------------------------------------------------------------------------- */
/* Deleting                                                                   */
/* -------------------------------------------------------------------------- */

type FileSummary = { _id: string; parts?: unknown; size?: unknown; sender?: unknown };

/** The writes that delete files (with their parts) and give their senders the space back. */
function deletions(records: FileSummary[]): Mutations {
    return records.flatMap((record) => {
        // An unreadable count removes every part a file can have (deleting a missing document is fine).
        const parts = partCount(record.parts) ?? MAX_PARTS;
        const size = typeof record.size === "number" && Number.isFinite(record.size) ? Math.max(0, Math.round(record.size)) : 0;
        const sender = normalizeEmail(record.sender);
        return [
            ...Array.from({ length: parts }, (_, index) => ({ type: "delete" as const, path: `${FILES}/${record._id}/parts/${index}` })),
            { type: "delete" as const, path: `${FILES}/${record._id}` },
            ...(sender ? [{ type: "increment" as const, path: `${USAGE}/${sender}`, fields: { bytes: -size, files: -1 } }] : []),
        ];
    });
}

async function commitDeletions(records: FileSummary[]) {
    // At most 9 writes a file: 50 files stay well under a commit's 500 writes.
    for (let index = 0; index < records.length; index += 50) await commitServerMutations(deletions(records.slice(index, index + 50)));
}

/** A projection, so the files themselves aren't downloaded just to be deleted. */
async function summaries(field: "fileId" | "container" | "sender", value: string, limit = 200) {
    return runServerQuery<FileSummary>({ collectionId: FILES, where: [{ field, op: "EQUAL", value }], select: ["parts", "size", "sender"], limit });
}

/** Deletes the files of deleted messages; missing ones are skipped. */
export async function deleteMessageFiles(ids: readonly unknown[]) {
    const wanted = [...new Set(ids.filter(isFileId))];
    if (!wanted.length) return 0;
    const records = (await Promise.all(wanted.map((id) => summaries("fileId", id, 1)))).flat().filter((record) => wanted.includes(record._id));
    await commitDeletions(records);
    return records.length;
}

/** Deletes every file of a conversation or a group ("dm:<chatId>" / "group:<groupId>"), e.g. when it is deleted. */
export async function deleteContainerFiles(container: string) {
    let total = 0;
    for (let round = 0; round < 50; round += 1) {
        const records = await summaries("container", container);
        if (!records.length) break;
        await commitDeletions(records);
        total += records.length;
        if (records.length < 200) break;
    }
    return total;
}

/** Deletes every file a person sent and their usage record (account deletion). */
export async function deleteSenderFiles(email: string) {
    const sender = normalizeEmail(email);
    if (!sender) return 0;
    let total = 0;
    for (let round = 0; round < 50; round += 1) {
        const records = await summaries("sender", sender);
        if (!records.length) break;
        await commitDeletions(records);
        total += records.length;
        if (records.length < 200) break;
    }
    await commitServerMutations([{ type: "delete", path: `${USAGE}/${sender}` }]).catch(() => undefined);
    return total;
}

/** What a person's data export lists about the files they sent (never the files themselves). */
export async function listSenderFiles(email: string, limit = 2_000) {
    const records = await runServerQuery<StoredFile & { _id: string }>({
        collectionId: FILES,
        where: [{ field: "sender", op: "EQUAL", value: normalizeEmail(email) }],
        select: ["name", "size", "contentType", "container", "createdAt"],
        limit,
    }).catch(() => []);
    return records.map((record) => ({
        id: record._id,
        name: cleanFileName(record.name),
        size: typeof record.size === "number" ? record.size : 0,
        contentType: typeof record.contentType === "string" ? record.contentType : "",
        place: typeof record.container === "string" ? record.container.split(":")[0] : "",
        createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : typeof record.createdAt === "string" ? record.createdAt : null,
    }));
}
