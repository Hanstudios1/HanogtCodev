import "server-only";

import { after } from "next/server";
import {
    BOT_NAMES,
    BOT_SENDERS,
    GROUP_LIMITS,
    WELCOME_MESSAGE_MAX,
    canModerate,
    channelKey,
    cleanMultiLine,
    cleanSingleLine,
    fillVars,
    isGroupId,
    outranks,
    readSlowmode,
    sanitizeCustomCommands,
    tokenizeMessage,
    type GroupBot,
    type GroupRole,
} from "@/lib/groups";
import { GROUP_FEATURES_MAX } from "@/lib/plans";
import { enforceHanogtAi, refundHanogtAi, type QuotaPass } from "@/lib/server/ai-usage";
import { repeatKey, scanMessage, SPAM_LIMITS } from "@/lib/server/automod";
import { autoDocumentId, commitServerMutations, createServerDocument, deleteServerDocument, getServerDocument, patchServerDocument, queryServerCollection, runServerQuery } from "@/lib/server/firebase-rest";
import { askGroupModel, groupHistoryText, GROUP_AI_HISTORY } from "@/lib/server/group-ai-bot";
import { activeMute, minutesLeft, moderationSubject, mutePath } from "@/lib/server/group-moderation";
import { removeFromVoice } from "@/lib/server/group-voice";
import { providerConfig } from "@/lib/server/hanogt-ai";
import { clearMessageTraces, refreshMessageTraces } from "@/lib/server/message-traces";
import { enforceRateLimitWithFallback } from "@/lib/server/rate-limit";
import { notifyMentions } from "@/lib/server/social-notify";
import { attachmentField, commitWithFile, deleteMessageFiles, fileWrites, type PreparedFile } from "@/lib/server/message-files";
import { deleteVoiceRecording } from "@/lib/server/social-voice";
import { sanitizeAutoMod, sanitizeCustomWords, type AutoModConfig, type AutoModRule } from "@/lib/social/automod-config";
import { BOT_EVENT_COPY, formatDuration, type BotEvent, type EphemeralReply } from "@/lib/social/bots";
import { findCommand, parseCommand, rankAtLeast, readCommandLine, RESERVED_COMMAND_NAMES, type CommandSpec } from "@/lib/social/commands";
import { ATTACHMENT_LIMITS, attachmentPreview, readMessageAttachment } from "@/lib/social/attachments";
import { readMessageGif } from "@/lib/social/gif";
import { messagePreview } from "@/lib/social/model";
import {
    GroupApiError,
    groupMembers,
    loadProfiles,
    ownDisplayName,
    profileAvatar,
    profileName,
    removeGroupMember,
    requireGroupMember,
    retryOnConflict,
    roleOf,
    strings,
    type GroupDocument,
    type GroupUser,
    type PublicProfile,
} from "./_shared";

/*
 * Writing in a group chat (every message goes through the server): mutes,
 * slash commands for the Hanogt Security Bot and Hanogt AI, the group's
 * AutoMod, slow mode, then the message itself, @mention notifications and,
 * when asked, Hanogt AI's answer (written after the response, so the sender
 * doesn't wait for the model).
 */

const messagesPath = (groupId: string) => `groups/${groupId}/messages`;
const messagePath = (groupId: string, messageId: string) => `groups/${groupId}/messages/${messageId}`;
const DAY = 86_400_000;
const WARNING_WINDOW_MS = 30 * DAY;
const AI_NAME = BOT_NAMES.ai;

type Ctx = {
    groupId: string;
    group: GroupDocument;
    role: GroupRole;
    user: GroupUser;
    language: "TR" | "EN";
    now: number;
};

type StoredMessage = Record<string, unknown> & { fromEmail?: unknown; type?: unknown; text?: unknown; voicePath?: unknown; file?: unknown; createdAt?: unknown; bot?: unknown };

/** The answer of a send: the stored message, a bot reply, and/or what only the sender sees. */
export type GroupSendResult = { success: true; message?: Record<string, unknown>; ephemeral?: EphemeralReply };

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

/** A message's channel: the first of the group's topics it names ("" is the main channel). */
export function channelOf(text: string, topics: readonly string[]) {
    if (!text.includes("#") || !topics.length) return "";
    const known = new Set(topics.map((topic) => channelKey(topic)));
    for (const segment of tokenizeMessage(text, [])) {
        if (segment.kind === "topic" && known.has(segment.topic)) return segment.topic;
    }
    return "";
}

function wire(id: string, data: Record<string, unknown>) {
    const createdAt = data.createdAt instanceof Date ? data.createdAt.toISOString() : data.createdAt;
    return { ...data, id, createdAt };
}

type MemberDirectory = { byEmail: Map<string, string>; profiles: Map<string, PublicProfile | null> };
const directoryCache = new Map<string, { at: number; members: string; directory: MemberDirectory }>();
/** A group of up to 250 members isn't read again for every message with an @ in it. */
const DIRECTORY_CACHE_MS = 60_000;

/** Names (as others see them) of the group's members, by e-mail; kept for a minute while the members stay the same. */
async function memberDirectory(groupId: string, group: GroupDocument): Promise<MemberDirectory> {
    const members = groupMembers(group);
    const key = members.join(",");
    const cached = directoryCache.get(groupId);
    if (cached && cached.members === key && Date.now() - cached.at < DIRECTORY_CACHE_MS) return cached.directory;
    const profiles = await loadProfiles(members, GROUP_FEATURES_MAX.members);
    const directory = { byEmail: new Map(members.map((email) => [email, profileName(email, profiles.get(email))])), profiles };
    directoryCache.set(groupId, { at: Date.now(), members: key, directory });
    if (directoryCache.size > 200) directoryCache.delete(directoryCache.keys().next().value!);
    return directory;
}

function emailForName(directory: Map<string, string>, username: string) {
    const wanted = username.toLocaleLowerCase("tr");
    for (const [email, name] of directory) if (name.toLocaleLowerCase("tr") === wanted) return email;
    return null;
}

/* -------------------------------------------------------------------------- */
/* Bot messages                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A message of a group bot. Notices carry an event and its values (shown in
 * each reader's language) and a Turkish text for older readers.
 */
async function postBotMessage(groupId: string, bot: GroupBot, fields: { text?: string; event?: BotEvent; vars?: Record<string, string>; replyTo?: { id: string; text: string } | null; botState?: "thinking" | "done" | "failed" }) {
    const vars = fields.vars ?? {};
    const text = fields.text ?? (fields.event ? fillVars(BOT_EVENT_COPY[fields.event].TR, { ...vars, duration: vars.ms ? formatDuration(Number(vars.ms), "TR") : "" }) : "");
    const data: Record<string, unknown> = {
        fromEmail: BOT_SENDERS[bot],
        author: BOT_NAMES[bot],
        authorAvatar: null,
        type: "text",
        bot,
        text: text.slice(0, GROUP_LIMITS.messageMax),
        createdAt: new Date(),
    };
    if (fields.event) {
        data.botEvent = fields.event;
        data.vars = vars;
    }
    if (fields.replyTo) data.replyTo = fields.replyTo;
    if (fields.botState) data.botState = fields.botState;
    const created = await createServerDocument(messagesPath(groupId), data);
    const id = created.name.split("/").pop() || "";
    return wire(id, data);
}

/* -------------------------------------------------------------------------- */
/* Warnings, mutes and reports                                                */
/* -------------------------------------------------------------------------- */

type WarningRecord = { reason?: string; by?: string; auto?: boolean; createdAt?: unknown };

const millis = (value: unknown) => {
    const time = value instanceof Date ? value.getTime() : typeof value === "string" ? Date.parse(value) : Number.NaN;
    return Number.isFinite(time) ? time : 0;
};

async function listWarnings(groupId: string, email: string) {
    const records = await queryServerCollection<WarningRecord>("group_warnings", "subject", "EQUAL", moderationSubject(groupId, email), { limit: 100 });
    return records.map((record) => ({ reason: typeof record.reason === "string" ? record.reason : "", at: millis(record.createdAt), auto: record.auto === true }))
        .sort((a, b) => b.at - a.at);
}

/** Stores a warning and returns how many the person has had in the last 30 days. */
async function addWarning(groupId: string, email: string, input: { by: string; reason: string; auto: boolean }, now = Date.now()) {
    await createServerDocument("group_warnings", {
        groupId,
        subject: moderationSubject(groupId, email),
        email,
        by: input.by,
        reason: input.reason.slice(0, 300),
        auto: input.auto,
        createdAt: new Date(now),
        // Kept half a year for the moderators' history, then removed by the TTL policy.
        expiresAt: new Date(now + 180 * DAY),
    });
    return (await listWarnings(groupId, email)).filter((warning) => now - warning.at < WARNING_WINDOW_MS).length;
}

async function setMute(groupId: string, email: string, durationMs: number, by: string, reason: string, now = Date.now()) {
    const until = new Date(now + durationMs);
    await patchServerDocument(mutePath(groupId, email), {
        groupId,
        subject: moderationSubject(groupId, email),
        email,
        until,
        by,
        reason: reason.slice(0, 300),
        createdAt: new Date(now),
        expiresAt: until,
    });
    // A time-out silences voice too: out of the channel at once (rejoining is refused while it lasts).
    await removeFromVoice(groupId, email, now).catch(() => undefined);
    return until;
}

/** Mutes a person once they reach the group's warning limit (AutoMod settings). */
async function muteAfterWarnings(ctx: Ctx, email: string, name: string, count: number, config: AutoModConfig) {
    if (config.muteAfterWarnings <= 0 || count < config.muteAfterWarnings) return;
    const ms = config.muteMinutes * 60_000;
    await setMute(ctx.groupId, email, ms, "automod", `${count} uyarı`, ctx.now);
    await postBotMessage(ctx.groupId, "security", { event: "automod_muted", vars: { target: name, ms: String(ms) } });
}

/* -------------------------------------------------------------------------- */
/* AutoMod and slow mode                                                      */
/* -------------------------------------------------------------------------- */

const automodCache = new Map<string, { at: number; config: AutoModConfig; words: string[] }>();
const AUTOMOD_CACHE_MS = 30_000;

/** The group's AutoMod settings and banned words (group_automod/{groupId}, server-only). */
export async function loadAutoMod(groupId: string, fresh = false) {
    const cached = automodCache.get(groupId);
    if (!fresh && cached && Date.now() - cached.at < AUTOMOD_CACHE_MS) return cached;
    const record = await getServerDocument<{ config?: unknown; customWords?: unknown }>(`group_automod/${groupId}`).catch(() => null);
    const entry = { at: Date.now(), config: sanitizeAutoMod(record?.config), words: sanitizeCustomWords(record?.customWords) };
    automodCache.set(groupId, entry);
    if (automodCache.size > 500) automodCache.delete(automodCache.keys().next().value!);
    return entry;
}

export function forgetAutoMod(groupId: string) {
    automodCache.delete(groupId);
}

const bursts = new Map<string, number[]>();
const repeats = new Map<string, Array<{ key: string; at: number }>>();

/** Many messages in a few seconds, or the same text again and again (per server instance). */
function looksLikeSpam(groupId: string, email: string, text: string, now: number, burst = true) {
    const id = `${groupId}:${email}`;
    if (bursts.size > 5_000) bursts.clear();
    if (repeats.size > 5_000) repeats.clear();
    // Files picked together arrive one after another; their uploads have their own rate limit.
    if (burst) {
        const times = (bursts.get(id) ?? []).filter((time) => now - time < SPAM_LIMITS.burstWindowMs);
        times.push(now);
        bursts.set(id, times);
        if (times.length > SPAM_LIMITS.burstMessages) return true;
    }
    const key = repeatKey(text);
    if (!key) return false;
    const recent = (repeats.get(id) ?? []).filter((entry) => now - entry.at < SPAM_LIMITS.repeatWindowMs);
    recent.push({ key, at: now });
    repeats.set(id, recent.slice(-20));
    return recent.filter((entry) => entry.key === key).length > SPAM_LIMITS.repeats;
}

async function stoppedByAutoMod(ctx: Ctx, name: string, rule: AutoModRule, config: AutoModConfig): Promise<never> {
    // Who was stopped and by which rule (never the text): for the moderators and the admin panel.
    void createServerDocument("automod_events", { groupId: ctx.groupId, email: ctx.user.email, rule, createdAt: new Date(ctx.now), expiresAt: new Date(ctx.now + 90 * DAY) }).catch(() => undefined);
    if (config.action === "block_warn") {
        const count = await addWarning(ctx.groupId, ctx.user.email, { by: "automod", reason: `AutoMod: ${rule}`, auto: true }, ctx.now);
        await muteAfterWarnings(ctx, ctx.user.email, name, count, config);
    }
    throw new GroupApiError(422, "automod_blocked", "Mesaj grubun AutoMod kurallarına takıldı.", { rule });
}

/**
 * AutoMod (unless the person's rank is exempt) and slow mode (moderators write
 * freely). `fileName`: a file's message (its caption is checked; the name and
 * caption make up its repeat key).
 */
async function guard(ctx: Ctx, name: string, text: string, mentions: number, channel: string, fileName: string | null = null) {
    const automod = await loadAutoMod(ctx.groupId);
    const exempt = automod.config.exempt.includes(ctx.role);
    if (automod.config.enabled && !exempt) {
        const verdict = scanMessage({ text, mentions }, automod.config, automod.words);
        if (!verdict.ok) await stoppedByAutoMod(ctx, name, verdict.rule, automod.config);
        const spam = fileName === null
            ? looksLikeSpam(ctx.groupId, ctx.user.email, text, ctx.now)
            : looksLikeSpam(ctx.groupId, ctx.user.email, `${fileName} ${text}`, ctx.now, false);
        if (automod.config.spam && spam) await stoppedByAutoMod(ctx, name, "spam", automod.config);
    }
    const seconds = readSlowmode(ctx.group.slowmode)[channelKey(channel)] ?? 0;
    if (seconds > 0 && !canModerate(ctx.role)) {
        const rate = await enforceRateLimitWithFallback(`slowmode:${ctx.groupId}:${channel}:${ctx.user.email}`, 1, seconds * 1000);
        if (!rate.allowed) throw new GroupApiError(429, "slowmode", "Bu kanalda yavaş mod açık.", { seconds: rate.retryAfterSeconds }, { "Retry-After": String(rate.retryAfterSeconds) });
    }
}

/* -------------------------------------------------------------------------- */
/* Hanogt AI                                                                  */
/* -------------------------------------------------------------------------- */

/** The channel's latest messages before the question, oldest first. */
async function channelHistory(groupId: string, channel: string, beforeId: string) {
    const records = await runServerQuery<StoredMessage>({
        collectionId: "messages",
        parentPath: `groups/${groupId}`,
        orderBy: [{ field: "createdAt", direction: "DESCENDING" }],
        limit: 40,
    }).catch(() => []);
    return records
        .filter((record) => record._id !== beforeId && record.type !== "system" && typeof record.text === "string" && record.text)
        .filter((record) => !channel || (record.text as string).toLocaleLowerCase("tr").includes(`#${channel}`))
        .slice(0, GROUP_AI_HISTORY)
        .reverse()
        .map((record) => ({ author: typeof record.author === "string" ? record.author : "?", text: record.text as string }));
}

/**
 * Counts the question against the asker's allowance, posts Hanogt AI's
 * "thinking" placeholder and fills it in after the response. Returns what
 * only the asker sees when Hanogt AI can't answer here.
 */
async function startAiAnswer(ctx: Ctx, question: string, asked: { id: string; text: string }, channel: string): Promise<EphemeralReply | null> {
    if (ctx.group.aiBot === false) return { kind: "ai_off" };
    if (!providerConfig()) return { kind: "ai_unavailable" };
    const pass = await enforceHanogtAi(ctx.user.email, { source: "group", onLate: keepRunning });
    if (!pass.ok) return { kind: "ai_limit", resetsAt: pass.code === "usage_limit" ? pass.resetsAt : null };
    const placeholder = await postBotMessage(ctx.groupId, "ai", { botState: "thinking", replyTo: { id: asked.id, text: messagePreview(asked.text, 100) } }).catch(async (error: unknown) => {
        await refundHanogtAi(pass, keepRunning);
        throw error;
    });
    const placeholderId = String(placeholder.id);
    after(() => answerInBackground(ctx, pass, question, asked.id, channel, placeholderId));
    return null;
}

async function answerInBackground(ctx: Ctx, pass: QuotaPass, question: string, askedId: string, channel: string, placeholderId: string) {
    const path = messagePath(ctx.groupId, placeholderId);
    try {
        const history = groupHistoryText(await channelHistory(ctx.groupId, channel, askedId));
        const answer = await askGroupModel({ question, history, language: ctx.language, plan: pass.plan });
        if (answer.ok) {
            await patchServerDocument(path, { text: answer.text, botState: "done" }, { updateFields: ["text", "botState"], exists: true });
            return;
        }
    } catch (error) {
        console.warn("[groups/ai] answer failed:", error instanceof Error ? error.message : "unknown error");
    }
    // Nothing came back: the message is given back and the placeholder says so.
    const late: Promise<unknown>[] = [];
    await refundHanogtAi(pass, (work) => late.push(work));
    await patchServerDocument(path, { botState: "failed", botEvent: "ai_failed", vars: {}, text: BOT_EVENT_COPY.ai_failed.TR }, { updateFields: ["botState", "botEvent", "vars", "text"], exists: true }).catch(() => undefined);
    await Promise.all(late);
}

/** Work the reply doesn't wait for (the function stays alive for it after responding). */
function keepRunning(work: Promise<unknown>) {
    after(() => work.then(() => undefined, () => undefined));
}

/* -------------------------------------------------------------------------- */
/* Commands                                                                   */
/* -------------------------------------------------------------------------- */

type CommandOutcome =
    | { kind: "done"; result: GroupSendResult }
    /** /ai: the question is posted like a message, then Hanogt AI answers it. */
    | { kind: "ask"; question: string };

const ephemeral = (reply: EphemeralReply): CommandOutcome => ({ kind: "done", result: { success: true, ephemeral: reply } });
const commandError = (code: string): CommandOutcome => ephemeral({ kind: "error", code });

async function deleteRecent(ctx: Ctx, channel: string, count: number, targetEmail: string | null) {
    const records = await runServerQuery<StoredMessage>({
        collectionId: "messages",
        parentPath: `groups/${ctx.groupId}`,
        orderBy: [{ field: "createdAt", direction: "DESCENDING" }],
        limit: 300,
    });
    const chosen = records
        .filter((record) => record._id !== "welcome" && record.type !== "system")
        .filter((record) => !channel || (typeof record.text === "string" && record.text.toLocaleLowerCase("tr").includes(`#${channel}`)))
        .filter((record) => !targetEmail || record.fromEmail === targetEmail)
        .slice(0, count);
    for (const record of chosen) {
        if (typeof record.voicePath === "string" && record.voicePath.startsWith(`group-voice-messages/${ctx.groupId}/`)) await deleteVoiceRecording(record.voicePath).catch(() => undefined);
    }
    // Their files go too (and free their senders' space).
    await deleteMessageFiles(chosen.map((record) => (record.file && typeof record.file === "object" ? (record.file as { id?: unknown }).id : null))).catch(() => undefined);
    for (let index = 0; index < chosen.length; index += 400) {
        await commitServerMutations(chosen.slice(index, index + 400).map((record) => ({ type: "delete" as const, path: messagePath(ctx.groupId, record._id) })));
    }
    // Replies stop quoting them and stars on them go (the messages already loaded are searched for replies).
    after(() => clearMessageTraces({ scope: "group", place: ctx.groupId, parentPath: `groups/${ctx.groupId}` }, chosen.map((record) => record._id), records.map((record) => ({ _path: messagePath(ctx.groupId, record._id), replyTo: record.replyTo }))));
    // Deleted messages leave the pinned list too.
    const ids = new Set(chosen.map((record) => record._id));
    await retryOnConflict(async () => {
        const { group } = await requireGroupMember(ctx.groupId, ctx.user.email);
        const pinned = strings(group.pinnedMessageIds);
        if (!pinned.some((id) => ids.has(id))) return;
        await patchServerDocument(`groups/${ctx.groupId}`, { pinnedMessageIds: pinned.filter((id) => !ids.has(id)) }, { updateFields: ["pinnedMessageIds"], updateTime: group._updateTime });
    }).catch(() => undefined);
    return chosen.length;
}

async function setSlowmode(ctx: Ctx, channel: string, seconds: number) {
    await retryOnConflict(async () => {
        const { group } = await requireGroupMember(ctx.groupId, ctx.user.email);
        const next = readSlowmode(group.slowmode);
        if (seconds > 0) next[channelKey(channel)] = seconds;
        else delete next[channelKey(channel)];
        await patchServerDocument(`groups/${ctx.groupId}`, { slowmode: next }, { updateFields: ["slowmode"], updateTime: group._updateTime });
    });
}

/** Moderators, admins and the owner hear about a report on their bell. */
async function notifyModerators(ctx: Ctx, reporter: string, target: string) {
    const name = typeof ctx.group.name === "string" ? ctx.group.name.slice(0, 60) : "Hanogt";
    const team = groupMembers(ctx.group).filter((email) => email !== ctx.user.email && canModerate(roleOf(ctx.group, email)));
    await Promise.all(team.slice(0, 25).map((email) => patchServerDocument(`notifications/${email}/items/report-${ctx.groupId}`, {
        type: "system",
        title: `${name} grubunda yeni bir rapor`,
        body: `${reporter}, ${target} hakkında bir rapor gönderdi.`,
        actionUrl: `/social/g/${ctx.groupId}`,
        read: false,
        createdAt: new Date(),
    }).catch(() => undefined)));
}

async function runBuiltIn(ctx: Ctx, spec: CommandSpec, rest: string, name: string, channel: string): Promise<CommandOutcome> {
    if (!rankAtLeast(ctx.role, spec.minRank)) return commandError("forbidden");
    // Commands that name someone need the members' names.
    const directory = spec.id === "help" || spec.id === "rules" || spec.id === "ai" || spec.id === "slowmode" ? null : await memberDirectory(ctx.groupId, ctx.group);
    const parsed = parseCommand(spec, rest, directory ? [...directory.byEmail.values()] : []);
    if (!parsed.ok) return commandError(parsed.problem);
    const command = parsed.command;
    const resolve = (username: string) => (directory ? emailForName(directory.byEmail, username) : null);

    switch (command.id) {
        case "help":
            return ephemeral({ kind: "help" });
        case "rules":
            return ephemeral({ kind: "rules", rules: typeof ctx.group.rules === "string" ? ctx.group.rules.slice(0, GROUP_LIMITS.messageMax) : "" });
        case "ai":
            return { kind: "ask", question: command.question };
        case "slowmode":
            await setSlowmode(ctx, channel, command.seconds);
            return { kind: "done", result: { success: true, message: await postBotMessage(ctx.groupId, "security", { event: command.seconds ? "slowmode_on" : "slowmode_off", vars: { actor: name, ms: String(command.seconds * 1000) } }) } };
        case "warnings": {
            const target = command.target ? resolve(command.target) : ctx.user.email;
            if (!target) return commandError("unknown_member");
            if (target !== ctx.user.email && !canModerate(ctx.role)) return commandError("forbidden");
            const items = await listWarnings(ctx.groupId, target);
            return ephemeral({ kind: "warnings", target: directory?.byEmail.get(target) ?? name, items: items.slice(0, 20).map((item) => ({ reason: item.reason, at: new Date(item.at).toISOString(), auto: item.auto })) });
        }
        case "report": {
            const target = resolve(command.target);
            if (!target) return commandError("unknown_member");
            if (target === ctx.user.email) return commandError("self_action");
            await createServerDocument("group_reports", {
                groupId: ctx.groupId,
                reporter: ctx.user.email,
                target,
                reason: command.reason,
                status: "open",
                createdAt: new Date(ctx.now),
                expiresAt: new Date(ctx.now + 180 * DAY),
            });
            const targetName = directory?.byEmail.get(target) ?? command.target;
            after(() => notifyModerators(ctx, name, targetName));
            return ephemeral({ kind: "reported", target: targetName });
        }
        case "purge": {
            const target = command.target ? resolve(command.target) : null;
            if (command.target && !target) return commandError("unknown_member");
            const deleted = await deleteRecent(ctx, channel, command.count, target);
            return { kind: "done", result: { success: true, message: await postBotMessage(ctx.groupId, "security", { event: "purged", vars: { actor: name, count: String(deleted) } }) } };
        }
        default:
            break;
    }

    // Commands acting on someone of a lower rank.
    const target = resolve(command.target);
    if (!target) return commandError("unknown_member");
    if (target === ctx.user.email) return commandError("self_action");
    const targetRole = roleOf(ctx.group, target);
    if (!targetRole) return commandError("unknown_member");
    if (!outranks(ctx.role, targetRole)) return commandError("cannot_moderate");
    const targetName = directory?.byEmail.get(target) ?? command.target;
    const reason = "reason" in command ? command.reason : "";
    const withReason = (vars: Record<string, string>) => (reason ? { ...vars, reason } : vars);

    switch (command.id) {
        case "warn": {
            const count = await addWarning(ctx.groupId, target, { by: ctx.user.email, reason, auto: false }, ctx.now);
            const message = await postBotMessage(ctx.groupId, "security", { event: "warned", vars: withReason({ target: targetName, actor: name, count: String(count) }) });
            const { config } = await loadAutoMod(ctx.groupId);
            await muteAfterWarnings(ctx, target, targetName, count, config);
            return { kind: "done", result: { success: true, message } };
        }
        case "mute": {
            await setMute(ctx.groupId, target, command.durationMs, ctx.user.email, reason, ctx.now);
            return { kind: "done", result: { success: true, message: await postBotMessage(ctx.groupId, "security", { event: "muted", vars: withReason({ target: targetName, actor: name, ms: String(command.durationMs) }) }) } };
        }
        case "unmute": {
            const mute = await activeMute(ctx.groupId, target, ctx.now);
            if (!mute) return ephemeral({ kind: "unmuted_none", target: targetName });
            await deleteServerDocument(mutePath(ctx.groupId, target));
            return { kind: "done", result: { success: true, message: await postBotMessage(ctx.groupId, "security", { event: "unmuted", vars: { target: targetName, actor: name } }) } };
        }
        case "kick":
        case "ban": {
            try {
                await removeGroupMember(ctx.groupId, ctx.user.email, target, command.id === "ban");
            } catch (error) {
                if (error instanceof GroupApiError) return commandError(error.code === "cannot_remove_admin" ? "cannot_moderate" : error.code);
                throw error;
            }
            await deleteServerDocument(mutePath(ctx.groupId, target)).catch(() => undefined);
            return { kind: "done", result: { success: true, message: await postBotMessage(ctx.groupId, "security", { event: command.id === "ban" ? "banned" : "kicked", vars: withReason({ target: targetName, actor: name }) }) } };
        }
        default:
            return commandError("unknown");
    }
}

/** A built-in or custom command; null when the line isn't one (it's sent as a message then). */
async function runCommand(ctx: Ctx, text: string, name: string, channel: string): Promise<CommandOutcome | null> {
    const line = readCommandLine(text);
    if (!line) return null;
    const spec = findCommand(line.name);
    if (spec) {
        const rate = await enforceRateLimitWithFallback(`groups:command:${ctx.user.email}`, 20, 60_000);
        if (!rate.allowed) throw new GroupApiError(429, "rate_limited", "Çok fazla komut.", {}, { "Retry-After": String(rate.retryAfterSeconds) });
        return runBuiltIn(ctx, spec, line.rest, name, channel);
    }
    const custom = sanitizeCustomCommands(ctx.group.customCommands, RESERVED_COMMAND_NAMES).find((command) => command.name === line.name);
    if (!custom) return null;
    const message = await postBotMessage(ctx.groupId, "security", { text: custom.response, event: "custom", vars: { actor: name, command: custom.name } });
    return { kind: "done", result: { success: true, message } };
}

/* -------------------------------------------------------------------------- */
/* Sending and editing                                                        */
/* -------------------------------------------------------------------------- */

/** The quoted message, read from the group (never a bot's thinking placeholder or a system notice). */
async function readReply(groupId: string, value: unknown) {
    const id = value && typeof value === "object" ? (value as { id?: unknown }).id : null;
    if (!isGroupId(id)) return null;
    const quoted = await getServerDocument<StoredMessage>(messagePath(groupId, id));
    if (!quoted || quoted.type === "system" || typeof quoted.fromEmail !== "string" || quoted.fromEmail === "system") return null;
    if (quoted.type === "file") {
        const attachment = readMessageAttachment(quoted.file);
        const caption = messagePreview(quoted.text, 100);
        return { id, text: attachment ? messagePreview(caption ? `${attachmentPreview(attachment)} · ${caption}` : attachmentPreview(attachment), 100) : caption };
    }
    return { id, text: quoted.type === "voice" ? "🎤" : quoted.type === "gif" ? "GIF" : messagePreview(quoted.text, 100) };
}

/** Sends a group message: text, a GIF or (with `file`) a file and its caption, written in one commit. */
export async function sendGroupMessage(user: GroupUser, groupId: string, body: Record<string, unknown>, file: PreparedFile | null = null): Promise<GroupSendResult> {
    const { group, role } = await requireGroupMember(groupId, user.email);
    const now = Date.now();
    const ctx: Ctx = { groupId, group, role, user, language: body.language === "EN" ? "EN" : groupLanguageOf(group), now };
    const mute = await activeMute(groupId, user.email, now);
    if (mute) throw new GroupApiError(403, "muted", "Bu grupta susturuldunuz.", { minutes: minutesLeft(mute.until, now) });

    const gif = !file && body.type === "gif" ? readMessageGif(body.gif) : null;
    if (!file && body.type === "gif" && !gif) throw new GroupApiError(400, "invalid_request", "Geçersiz GIF.");
    // A GIF's text is a short caption (the #channel it was sent in) and its title: channels, search and notifications read it.
    // A file's text is its caption (it may be empty or just the #channel).
    const text = file
        ? cleanMultiLine(body.text, ATTACHMENT_LIMITS.captionMax * 2)
        : gif ? [cleanSingleLine(body.text, 100).slice(0, 100), gif.title].filter(Boolean).join(" ") : cleanMultiLine(body.text, GROUP_LIMITS.messageMax * 2);
    if (!gif && !file && !text) throw new GroupApiError(400, "invalid_request", "Mesaj boş olamaz.");
    if (file && text.length > ATTACHMENT_LIMITS.captionMax) throw new GroupApiError(413, "payload_too_large", "Açıklama en fazla 2000 karakter olabilir.");
    if (text.length > GROUP_LIMITS.messageMax) throw new GroupApiError(413, "payload_too_large", "Mesaj en fazla 4000 karakter olabilir.");

    const name = (await ownDisplayName(user)).slice(0, 80);
    const channel = channelOf(text, strings(group.topics));
    // A forwarded message is passed on as it is: no commands, no Hanogt AI, no notifications.
    const forwarded = body.forwarded === true;
    let question: string | null = null;
    if (!gif && !file && !forwarded && text.startsWith("/")) {
        const outcome = await runCommand(ctx, text, name, channel);
        if (outcome?.kind === "done") return outcome.result;
        if (outcome?.kind === "ask") question = outcome.question;
    }

    // Mentions: who is named (for the bell and AutoMod's limit) and whether Hanogt AI is asked.
    const mentionsSomeone = !forwarded && text.includes("@");
    const directory = mentionsSomeone ? await memberDirectory(groupId, group) : null;
    const segments = mentionsSomeone ? tokenizeMessage(text, [...(directory?.byEmail.values() ?? []), AI_NAME]).filter((segment) => segment.kind === "mention") : [];
    const people = segments.filter((segment) => segment.kind === "mention" && segment.username !== AI_NAME);
    const asksAi = !file && question === null && segments.some((segment) => segment.kind === "mention" && segment.username === AI_NAME);
    if (asksAi) question = text.replace(new RegExp(`@${AI_NAME}`, "gi"), "").trim() || text;

    await guard(ctx, name, text, people.length, channel, file ? file.attachment.name : null);

    const profile = directory?.profiles.get(user.email) ?? (await loadProfiles([user.email])).get(user.email);
    const createdAt = new Date(now);
    const data: Record<string, unknown> = {
        fromEmail: user.email,
        author: name,
        authorAvatar: profileAvatar(profile),
        type: file ? "file" : gif ? "gif" : "text",
        text,
        createdAt,
    };
    if (gif) data.gif = gif;
    if (file) data.file = attachmentField(file);
    const reply = await readReply(groupId, body.replyTo);
    if (reply) data.replyTo = reply;
    if (forwarded && !file) data.forwarded = true;
    let id: string;
    if (file) {
        // The message and its file in one commit.
        id = autoDocumentId();
        const path = messagePath(groupId, id);
        await commitWithFile(file, path, [
            ...fileWrites(file, { sender: user.email, container: `group:${groupId}`, messagePath: path }, createdAt),
            { type: "create", path, data },
        ]);
    } else {
        const created = await createServerDocument(messagesPath(groupId), data);
        id = created.name.split("/").pop() || "";
    }
    const result: GroupSendResult = { success: true, message: wire(id, data) };

    if (people.length && directory) {
        const everyone = people.some((segment) => segment.kind === "mention" && segment.everyone);
        const named = everyone
            ? groupMembers(group)
            : people.flatMap((segment) => (segment.kind === "mention" ? [emailForName(directory.byEmail, segment.username)] : [])).filter((email): email is string => Boolean(email));
        // @everyone from moderators and up reaches the whole group (up to 250 people); anyone else's reaches at most 30.
        const reach = everyone && canModerate(role) ? GROUP_FEATURES_MAX.members : undefined;
        const preview = file ? messagePreview(text ? `${attachmentPreview(file.attachment)} · ${text}` : attachmentPreview(file.attachment), 160) : messagePreview(text, 160);
        after(() => notifyMentions(named, user.email, { id: groupId, name: typeof group.name === "string" ? group.name : "Hanogt" }, preview, everyone, reach));
    }
    if (question !== null) {
        const refusal = await startAiAnswer(ctx, question, { id, text }, channel);
        if (refusal) result.ephemeral = refusal;
    }
    return result;
}

/** The group's own welcome text from the Hanogt Security Bot when someone joins ("{name}" is the newcomer). Best effort. */
export async function postWelcomeMessage(groupId: string, group: { welcomeMessage?: string }, name: string) {
    const template = cleanMultiLine(group.welcomeMessage, WELCOME_MESSAGE_MAX).slice(0, WELCOME_MESSAGE_MAX);
    if (!template) return;
    await postBotMessage(groupId, "security", { text: template.replace(/\{name\}/g, name.slice(0, 60)), event: "welcome", vars: { name: name.slice(0, 60) } })
        .catch((error: unknown) => console.warn("[groups] welcome message failed:", error instanceof Error ? error.message : "unknown error"));
}

function groupLanguageOf(group: GroupDocument): "TR" | "EN" {
    return group.contentLanguage === "en" ? "EN" : "TR";
}

/** Authors edit their own text messages; muted people can't, and AutoMod checks the new text. */
export async function editGroupMessage(user: GroupUser, groupId: string, messageId: string, value: unknown) {
    const text = cleanMultiLine(value, GROUP_LIMITS.messageMax * 2);
    if (!text) throw new GroupApiError(400, "invalid_request", "Mesaj boş olamaz.");
    if (text.length > GROUP_LIMITS.messageMax) throw new GroupApiError(413, "payload_too_large", "Mesaj en fazla 4000 karakter olabilir.");
    const { group, role } = await requireGroupMember(groupId, user.email);
    const now = Date.now();
    const mute = await activeMute(groupId, user.email, now);
    if (mute) throw new GroupApiError(403, "muted", "Bu grupta susturuldunuz.", { minutes: minutesLeft(mute.until, now) });
    const ctx: Ctx = { groupId, group, role, user, language: groupLanguageOf(group), now };
    const automod = await loadAutoMod(groupId);
    if (automod.config.enabled && !automod.config.exempt.includes(role)) {
        const verdict = scanMessage({ text, mentions: (text.match(/@/g) ?? []).length }, automod.config, automod.words);
        if (!verdict.ok) await stoppedByAutoMod(ctx, (await ownDisplayName(user)).slice(0, 80), verdict.rule, automod.config);
    }
    const path = messagePath(groupId, messageId);
    const changed = await retryOnConflict(async () => {
        const message = await getServerDocument<StoredMessage>(path);
        if (!message) throw new GroupApiError(404, "message_not_found", "Mesaj bulunamadı.");
        if (message.fromEmail !== user.email || message.type !== "text") throw new GroupApiError(403, "forbidden", "Yalnızca kendi metin mesajlarınızı düzenleyebilirsiniz.");
        if (message.text === text) return null;
        await patchServerDocument(path, { text, edited: true, editedAt: new Date() }, { updateFields: ["text", "edited", "editedAt"], updateTime: message._updateTime });
        return message;
    });
    // Replies quote the new words and stars show them.
    if (changed) after(() => refreshMessageTraces({ scope: "group", place: groupId, parentPath: `groups/${groupId}` }, messageId, { ...changed, text }, messagePreview(text, 100)));
    return { success: true };
}

