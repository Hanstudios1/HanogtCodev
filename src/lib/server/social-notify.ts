import "server-only";

import { createHash } from "node:crypto";
import { dmHref, groupHref } from "@/lib/social/model";
import { deleteServerDocument, getServerDocument, patchServerDocument } from "./firebase-rest";

/*
 * Bell notifications of Hanogt Social (the header's NotificationCenter):
 * a direct message, being @mentioned in a group and a missed call. One item
 * per conversation, group or call, updated in place, so a busy chat doesn't
 * fill the list. Each person's notification settings decide (Account
 * Settings › Notifications); everything here is best effort and never fails
 * the action that caused it.
 */

type NotificationSettings = { msgNotifications?: unknown; mentionNotifications?: unknown; callNotifications?: unknown; banned?: unknown };
type SenderProfile = { username?: unknown; avatarUrl?: unknown };

const shortHash = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 24);

/** Item ids must be plain document ids: e-mails and chat ids are hashed. */
export const dmNotificationId = (chatId: string) => `dm-${shortHash(chatId)}`;
export const mentionNotificationId = (groupId: string) => `mention-${groupId}`;
export const callNotificationId = (callId: string) => `call-${callId}`;

const itemPath = (email: string, id: string) => `notifications/${email}/items/${id}`;

async function senderOf(email: string) {
    const profile = await getServerDocument<SenderProfile>(`public_profiles/${email}`).catch(() => null);
    const name = typeof profile?.username === "string" && profile.username.trim() ? profile.username.trim().slice(0, 60) : email.split("@")[0];
    const avatar = typeof profile?.avatarUrl === "string" && /^https:\/\//.test(profile.avatarUrl) ? profile.avatarUrl : null;
    return { name, avatar };
}

async function wants(email: string, setting: keyof NotificationSettings) {
    const record = await getServerDocument<NotificationSettings>(`users/${email}`).catch(() => null);
    return Boolean(record) && record?.banned !== true && record?.[setting] !== false;
}

function quiet(task: Promise<unknown>) {
    return task.then(() => undefined, (error: unknown) => console.warn("[social] notification failed:", error instanceof Error ? error.message : "unknown error"));
}

/** "Ali sent you a message": one item per conversation, the newest message's preview. */
export function notifyDirectMessage(recipient: string, from: string, chatId: string, preview: string) {
    return quiet((async () => {
        if (!(await wants(recipient, "msgNotifications"))) return;
        const sender = await senderOf(from);
        await patchServerDocument(itemPath(recipient, dmNotificationId(chatId)), {
            type: "message",
            title: `${sender.name} sana mesaj gönderdi`,
            body: preview.slice(0, 300),
            actionUrl: dmHref(from),
            fromAvatar: sender.avatar,
            read: false,
            createdAt: new Date(),
        });
    })());
}

/** Reading the conversation clears its item. */
export function clearDirectMessageNotification(reader: string, chatId: string) {
    return quiet(deleteServerDocument(itemPath(reader, dmNotificationId(chatId))));
}

/** "Ali mentioned you in Study group": one item per group for each person mentioned. */
export function notifyMentions(recipients: readonly string[], from: string, group: { id: string; name: string }, preview: string, everyone: boolean) {
    const people = [...new Set(recipients)].filter((email) => email && email !== from).slice(0, 30);
    if (!people.length) return Promise.resolve();
    return quiet((async () => {
        const sender = await senderOf(from);
        const name = group.name.slice(0, 60) || "Hanogt";
        await Promise.all(people.map(async (email) => {
            if (!(await wants(email, "mentionNotifications"))) return;
            await patchServerDocument(itemPath(email, mentionNotificationId(group.id)), {
                type: "message",
                title: everyone ? `${sender.name}, ${name} grubunda herkesi andı` : `${sender.name} seni ${name} grubunda andı`,
                body: preview.slice(0, 300),
                actionUrl: groupHref(group.id),
                fromAvatar: sender.avatar,
                read: false,
                createdAt: new Date(),
            }).catch(() => undefined);
        }));
    })());
}

/** "Missed call from Ali": the call rang out, was cancelled or couldn't reach the callee. */
export function notifyMissedCall(callee: string, caller: string, callId: string) {
    return quiet((async () => {
        if (!(await wants(callee, "callNotifications"))) return;
        const sender = await senderOf(caller);
        await patchServerDocument(itemPath(callee, callNotificationId(callId)), {
            type: "call",
            title: `${sender.name} seni aradı`,
            body: "Cevapsız arama",
            actionUrl: dmHref(caller),
            fromAvatar: sender.avatar,
            read: false,
            createdAt: new Date(),
        });
    })());
}
