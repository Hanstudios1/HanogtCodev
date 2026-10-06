import { NextResponse, type NextRequest } from "next/server";
import { isGroupId } from "@/lib/groups";
import { FileApiError, assertFileFits, prepareFile } from "@/lib/server/message-files";
import { jsonSecurityHeaders } from "@/lib/server/request-security";
import { ATTACHMENT_LIMITS } from "@/lib/social/attachments";
import { SocialApiError, assertRateLimit, assertSameOrigin, readPartner, requireSocialUser, socialErrorResponse, socialJson } from "@/lib/social/server";
import { sendGroupMessage } from "../../groups/_messages";
import { GroupApiError, groupErrorResponse, groupJson, requireGroupUser } from "../../groups/_shared";
import { sendDirect } from "../_dm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A 4 MB file goes to Firestore in one commit.
export const maxDuration = 60;

/*
 * Files in Hanogt Social messages (lib/server/message-files.ts):
 *   POST multipart/form-data
 *        file       the file (at most the plan's size, 4 MB at most)
 *        with       the friend's e-mail (a direct message) — or —
 *        group      the group's id
 *        text       the caption (optional; in a group's topic it carries the #topic)
 *        replyTo    the id of the message it answers (optional)
 *        language   TR or EN (groups: the bots' language)
 * One file per message: the browser sends files picked together one after
 * another. Serving a file is /api/social/files/{id}.
 */

/** The file plus the caption and the multipart framing. */
const BODY_MAX = ATTACHMENT_LIMITS.maxBytes + 64 * 1024;

function filesErrorResponse(error: unknown) {
    if (error instanceof FileApiError) {
        return NextResponse.json({ ...error.extra, error: error.message, code: error.code }, { status: error.status, headers: jsonSecurityHeaders() });
    }
    if (error instanceof GroupApiError) return groupErrorResponse(error);
    return socialErrorResponse(error, "social/files");
}

const field = (form: FormData, name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
};

/** Uploads are counted on their own: a person can't fill the space or the server faster than this. */
async function assertUploadRate(email: string) {
    await assertRateLimit(`social:files:${email}`, 20);
    await assertRateLimit(`social:files-hour:${email}`, 150, 60 * 60_000);
}

/** The file checked (type, name, image) and measured against the sender's plan. */
async function readFile(email: string, upload: File) {
    if (upload.size > ATTACHMENT_LIMITS.maxBytes) throw new FileApiError(413, "attachment_too_large", "Dosya en fazla 4 MB olabilir.", { limit: ATTACHMENT_LIMITS.maxBytes });
    const prepared = prepareFile(new Uint8Array(await upload.arrayBuffer()), upload.name);
    await assertFileFits(email, prepared.bytes.byteLength);
    return prepared;
}

export async function POST(request: NextRequest) {
    try {
        assertSameOrigin(request);
        if (Number(request.headers.get("content-length") || 0) > BODY_MAX) {
            throw new FileApiError(413, "attachment_too_large", "Dosya en fazla 4 MB olabilir.", { limit: ATTACHMENT_LIMITS.maxBytes });
        }
        if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("multipart/form-data")) throw new SocialApiError(400, "invalid_request", "Geçersiz istek.");
        let form: FormData;
        try {
            form = await request.formData();
        } catch {
            throw new SocialApiError(400, "invalid_request", "Geçersiz istek gövdesi.");
        }
        const upload = form.get("file");
        if (!(upload instanceof File)) throw new SocialApiError(400, "invalid_request", "Dosya eksik.");
        const text = field(form, "text");
        const replyId = field(form, "replyTo");
        const replyTo = replyId ? { id: replyId } : null;
        const groupId = field(form, "group");

        if (groupId) {
            if (!isGroupId(groupId)) throw new GroupApiError(400, "invalid_id", "Geçersiz grup.");
            const user = await requireGroupUser();
            await assertUploadRate(user.email);
            const file = await readFile(user.email, upload);
            return groupJson(await sendGroupMessage(user, groupId, { text, replyTo, language: field(form, "language") === "EN" ? "EN" : "TR" }, file) as unknown as Record<string, unknown>, 201);
        }

        const user = await requireSocialUser();
        const partner = readPartner(field(form, "with"), user.email);
        await assertUploadRate(user.email);
        const file = await readFile(user.email, upload);
        return socialJson(await sendDirect(user, partner, { text, replyTo }, file), 201);
    } catch (error) {
        return filesErrorResponse(error);
    }
}
