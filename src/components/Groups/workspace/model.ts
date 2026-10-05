import type { OnMount } from "@monaco-editor/react";
import type { DocumentData } from "firebase/firestore";
import {
    GROUP_REACTIONS,
    WELCOME_MESSAGE_MAX,
    isGroupId,
    isGroupTemplateId,
    isMemberKey,
    isSystemEvent,
    languageFromFileName,
    readSlowmode,
    sanitizeCustomCommands,
    toMillis,
    type GroupInfo,
    type GroupMemberInfo,
    type GroupReactionKey,
    type GroupRole,
    type GroupSystemEvent,
    type GroupTemplateId,
} from "@/lib/groups";
import { RESERVED_COMMAND_NAMES } from "@/lib/social/commands";

export type MonacoEditor = Parameters<OnMount>[0];

export type GroupFileItem = {
    id: string;
    name: string;
    lang: string;
    code: string;
    order: number;
    updatedBy: string;
    updatedAt: number;
};

/**
 * The message a reply points to: its id and an excerpt copied when the reply
 * was sent (the author is looked up from the message itself when it's loaded).
 */
export type GroupReply = { id: string; text: string };

export type GroupChatMessage = {
    id: string;
    fromEmail: string;
    author: string;
    authorAvatar: string | null;
    type: "text" | "voice" | "system";
    text: string;
    voicePath: string | null;
    voiceDuration: number;
    createdAt: number;
    pending: boolean;
    event: GroupSystemEvent | null;
    vars: Record<string, string>;
    template: GroupTemplateId | null;
    reactions: Partial<Record<GroupReactionKey, string[]>>;
    replyTo: GroupReply | null;
    edited: boolean;
};

export type SaveState = "idle" | "saving" | "saved" | "error";

/** Member as shown in the workspace: roles follow the live group document. */
export type WorkspaceMember = GroupMemberInfo;

/** Live fields of the group document that clients may read directly (members only). */
export type LiveGroupFields = Partial<Pick<GroupInfo, "name" | "description" | "emoji" | "color" | "rules" | "topics" | "ownerEmail" | "admins" | "members" | "pinnedMessageIds" | "allowMemberInvites" | "onboarding" | "moderators" | "slowmode" | "aiBot" | "welcomeMessage" | "customCommands">> & {
    typing: Record<string, number>;
};

const text = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);
const stringList = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined);

export function fileFromData(id: string, data: DocumentData): GroupFileItem {
    const name = text(data.name) || id;
    return {
        id,
        name,
        lang: text(data.lang) || languageFromFileName(name),
        code: text(data.code),
        order: typeof data.order === "number" && Number.isFinite(data.order) ? data.order : 0,
        updatedBy: text(data.updatedBy),
        updatedAt: toMillis(data.updatedAt),
    };
}

export function messageFromData(id: string, data: DocumentData, pending: boolean, fallbackTime: number): GroupChatMessage {
    const reactions: Partial<Record<GroupReactionKey, string[]>> = {};
    const stored = data.reactions && typeof data.reactions === "object" ? data.reactions as Record<string, unknown> : {};
    for (const reaction of GROUP_REACTIONS) {
        const keys = stringList(stored[reaction.key])?.filter(isMemberKey);
        if (keys?.length) reactions[reaction.key] = keys;
    }
    const vars = data.vars && typeof data.vars === "object"
        ? Object.fromEntries(Object.entries(data.vars as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === "string").map(([key, value]) => [key, value.slice(0, 80)]))
        : {};
    const type = data.type === "voice" || data.type === "system" ? data.type : "text";
    const reply = data.replyTo && typeof data.replyTo === "object" ? data.replyTo as Record<string, unknown> : null;
    return {
        id,
        fromEmail: text(data.fromEmail),
        author: text(data.author).slice(0, 80) || "Hanogt",
        authorAvatar: text(data.authorAvatar) || null,
        type,
        text: text(data.text),
        voicePath: text(data.voicePath) || null,
        voiceDuration: typeof data.voiceDuration === "number" && Number.isFinite(data.voiceDuration) ? Math.max(0, Math.round(data.voiceDuration)) : 0,
        createdAt: toMillis(data.createdAt) || fallbackTime,
        pending,
        event: isSystemEvent(data.event) ? data.event : null,
        vars,
        template: isGroupTemplateId(data.template) ? data.template : null,
        reactions,
        replyTo: reply && isGroupId(reply.id) ? { id: reply.id, text: text(reply.text).slice(0, 120) } : null,
        edited: data.edited === true,
    };
}

export function liveGroupFromData(data: DocumentData): LiveGroupFields {
    const typing: Record<string, number> = {};
    if (data.typing && typeof data.typing === "object") {
        for (const [key, value] of Object.entries(data.typing as Record<string, unknown>)) {
            if (isMemberKey(key) && typeof value === "number") typing[key] = value;
        }
    }
    const onboarding = data.onboarding && typeof data.onboarding === "object" ? data.onboarding as Record<string, unknown> : null;
    return {
        name: typeof data.name === "string" ? data.name : undefined,
        description: typeof data.description === "string" ? data.description : undefined,
        emoji: typeof data.emoji === "string" ? data.emoji : undefined,
        color: typeof data.color === "string" ? data.color as GroupInfo["color"] : undefined,
        rules: typeof data.rules === "string" ? data.rules : undefined,
        topics: stringList(data.topics),
        ownerEmail: typeof data.ownerEmail === "string" ? data.ownerEmail : undefined,
        admins: stringList(data.admins),
        members: stringList(data.members),
        pinnedMessageIds: stringList(data.pinnedMessageIds),
        allowMemberInvites: typeof data.allowMemberInvites === "boolean" ? data.allowMemberInvites : undefined,
        onboarding: onboarding ? { dismissed: Boolean(onboarding.dismissed), callStarted: Boolean(onboarding.callStarted) } : undefined,
        moderators: stringList(data.moderators) ?? (data.members ? [] : undefined),
        slowmode: data.slowmode !== undefined ? readSlowmode(data.slowmode) : data.members ? {} : undefined,
        aiBot: typeof data.aiBot === "boolean" ? data.aiBot : data.members ? true : undefined,
        welcomeMessage: typeof data.welcomeMessage === "string" ? data.welcomeMessage.slice(0, WELCOME_MESSAGE_MAX) : data.members ? "" : undefined,
        customCommands: data.customCommands !== undefined ? sanitizeCustomCommands(data.customCommands, RESERVED_COMMAND_NAMES) : data.members ? [] : undefined,
        typing,
    };
}

export function roleFor(email: string, ownerEmail: string, admins: readonly string[], moderators: readonly string[] = []): GroupRole {
    if (email === ownerEmail) return "owner";
    if (admins.includes(email)) return "admin";
    if (moderators.includes(email)) return "moderator";
    return "member";
}

/** Sanitised download name; "/" folders are flattened for single-file downloads. */
export function downloadName(name: string) {
    return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim() || "file.txt";
}

export function saveBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

const MIME_BY_LANGUAGE: Record<string, string> = {
    html: "text/html", css: "text/css", javascript: "text/javascript", typescript: "text/plain", json: "application/json",
    markdown: "text/markdown", xml: "application/xml", python: "text/x-python", csharp: "text/plain",
};

export function mimeFor(lang: string) {
    return `${MIME_BY_LANGUAGE[lang] || "text/plain"};charset=utf-8`;
}

/** The Editor recovers these tabs when opened without a project (see src/app/editor/page.tsx). */
export const EDITOR_TABS_KEY = "hanogt_unsaved_tabs";
export const EDITOR_TABS_MAX = 1_000_000;
