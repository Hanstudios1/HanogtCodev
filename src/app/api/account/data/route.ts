import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { deleteAccountData } from "@/lib/server/account-deletion";
import { getActiveSession } from "@/lib/server/active-session";
import { stringOr, toIso } from "@/lib/server/admin";
import { exportAiConnections } from "@/lib/server/ai-connections";
import { getServerDocument, listServerCollection, queryServerCollection, runServerQuery } from "@/lib/server/firebase-rest";
import { voterHash } from "@/lib/server/ai-rankings";
import { likerHash } from "@/lib/server/arcade";
import { enforceRateLimit, enforceRateLimitWithFallback } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";
import { TICKETS_COLLECTION, readTicketMessages, readTicketMeta, ticketCategory, ticketPriority, ticketStatus, type TicketRecord } from "@/lib/server/support";
import { normalizeEmail } from "@/lib/server/validate";
import { TICKET_LIMITS, ticketReference } from "@/lib/support";

// Deleting a large account takes many Firestore round trips.
export const maxDuration = 60;

/** The user's own chat messages included at most (newest conversations first). */
const CHAT_MESSAGE_BUDGET = 2_000;
const CHAT_LIMIT = 500;
const EXPORTS_PER_HOUR = 10;

type Stored = Record<string, unknown> & { _id: string };

function publicAccountData(user: Record<string, unknown> | null) {
    if (!user) return {};
    const safe = { ...user };
    delete safe.password;
    delete safe.passwordHash;
    delete safe.role;
    delete safe.securityScore;
    delete safe._updateTime;
    delete safe._path;
    delete safe._id;
    return safe;
}

const time = (value: unknown) => Date.parse(toIso(value) ?? "") || 0;

function chunks<T>(items: T[], size: number) {
    const result: T[][] = [];
    for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
    return result;
}

/** Support tickets with their conversation: staff replies carry only the team name, never a staff address. */
function exportSupportTickets(records: Array<TicketRecord & { _id: string }>) {
    return records
        .map((record) => {
            const createdAt = toIso(record.createdAt);
            return {
                id: record._id,
                reference: ticketReference(record._id),
                category: ticketCategory(record.category),
                title: stringOr(record.title, "", TICKET_LIMITS.title),
                description: stringOr(record.description, "", TICKET_LIMITS.description),
                status: ticketStatus(record.status),
                priority: ticketPriority(record.priority),
                createdAt,
                updatedAt: toIso(record.updatedAt) ?? createdAt,
                // Technical details the user chose to attach (page, browser, steps).
                meta: readTicketMeta(record),
                messages: readTicketMessages(record).map((message) => ({
                    from: message.from,
                    authorName: message.authorName,
                    text: message.text,
                    createdAt: message.createdAt,
                })),
            };
        })
        .sort((a, b) => time(b.createdAt) - time(a.createdAt));
}

/** In-app notifications; the sender's address (`fromEmail`) of other people stays out. */
function exportNotifications(records: Stored[]) {
    return records
        .map((item) => ({
            id: item._id,
            type: stringOr(item.type, "", 40) || null,
            title: stringOr(item.title, "", 200),
            body: stringOr(item.body, "", 500),
            read: item.read === true,
            createdAt: toIso(item.createdAt),
            actionUrl: typeof item.actionUrl === "string" && /^\/(?![/\\])/.test(item.actionUrl) ? item.actionUrl.slice(0, 500) : null,
        }))
        .sort((a, b) => time(b.createdAt) - time(a.createdAt));
}

/** Display names of the other chat participants; their e-mail addresses are their own personal data. */
async function participantNames(emails: string[]) {
    const names = new Map<string, string>();
    for (const group of chunks(emails, 10)) {
        await Promise.all(group.map(async (address) => {
            let profile: { username?: unknown } | null | undefined;
            try {
                profile = normalizeEmail(address) === address ? await getServerDocument<{ username?: unknown }>(`public_profiles/${address}`) : undefined;
            } catch {
                profile = undefined;
            }
            const name = typeof profile?.username === "string" ? profile.username.trim().slice(0, 100) : "";
            names.set(address, name || (profile === null ? "Silinmiş hesap" : profile ? "Hanogt kullanıcısı" : "Bilinmeyen kullanıcı"));
        }));
    }
    return names;
}

type ChatMessageRecord = { text?: unknown; type?: unknown; createdAt?: unknown };

/** The user's own messages in one chat, oldest first (without the other person's messages or quoted replies). */
async function ownChatMessages(chatId: string, email: string, limit: number) {
    const records = await runServerQuery<ChatMessageRecord>({
        collectionId: "messages",
        parentPath: `chats/${chatId}`,
        where: [{ field: "fromEmail", op: "EQUAL", value: email }],
        select: ["text", "type", "createdAt"],
        limit,
    });
    return records
        .map((message) => ({
            type: message.type === "voice" || message.type === "sticker" ? message.type : "text",
            text: stringOr(message.text, "", 4_000),
            createdAt: toIso(message.createdAt),
        }))
        .sort((a, b) => time(a.createdAt) - time(b.createdAt));
}

/**
 * Private chats: a pseudonymous reference (chat ids contain both addresses),
 * the other participants by display name and the user's own messages, at most
 * CHAT_MESSAGE_BUDGET in total, newest conversations first.
 */
async function exportPrivateChats(email: string, chats: Stored[]) {
    const ordered = [...chats].sort((a, b) => time(b.lastMessageAt ?? b.updatedAt) - time(a.lastMessageAt ?? a.updatedAt));
    const others = new Map(ordered.map((chat) => [
        chat._id,
        (Array.isArray(chat.participants) ? chat.participants : []).filter((value): value is string => typeof value === "string" && value !== email),
    ]));
    const names = await participantNames([...new Set([...others.values()].flat())]);
    const conversations: Array<{ ref: string; participants: string[]; messages: Awaited<ReturnType<typeof ownChatMessages>> }> = [];
    let budget = CHAT_MESSAGE_BUDGET;
    let truncated = chats.length >= CHAT_LIMIT;
    for (const group of chunks(ordered, 4)) {
        const share = Math.min(budget, 1_000);
        const results = share > 0 ? await Promise.all(group.map((chat) => ownChatMessages(chat._id, email, share))) : group.map(() => null);
        group.forEach((chat, index) => {
            const found = results[index];
            const messages = (found ?? []).slice(0, Math.max(0, budget));
            budget -= messages.length;
            // A full page may have left messages out; a skipped chat was not read at all.
            if (!found || found.length >= share || messages.length < found.length) truncated = true;
            conversations.push({
                ref: createHash("sha256").update(chat._id).digest("hex").slice(0, 16),
                participants: (others.get(chat._id) ?? []).map((address) => names.get(address) ?? "Bilinmeyen kullanıcı"),
                messages,
            });
        });
    }
    return { conversations, messageLimit: CHAT_MESSAGE_BUDGET, truncated };
}

export async function GET() {
    const activeSession = await getActiveSession();
    if (!activeSession) return NextResponse.json({ error: "Etkin oturum gerekli." }, { status: 401, headers: jsonSecurityHeaders() });
    const { email } = activeSession;

    try {
        const rate = await enforceRateLimitWithFallback(`account-export:${email}`, EXPORTS_PER_HOUR, 60 * 60_000);
        if (!rate.allowed) {
            return NextResponse.json({ error: "Çok fazla dışa aktarma isteği. Biraz sonra tekrar deneyin." }, { status: 429, headers: jsonSecurityHeaders({ "Retry-After": String(rate.retryAfterSeconds) }) });
        }

        const [user, projects, gameProjects, mediaPosts, groups, arcadeGames, newsComments, arcadeLikes, arenaVotes, supportTickets, notifications, chats, subscription, waitlist, aiConnections] = await Promise.all([
            getServerDocument<Record<string, unknown>>(`users/${email}`),
            queryServerCollection<Record<string, unknown>>("projects", "email", "EQUAL", email),
            queryServerCollection<Record<string, unknown>>("game_projects", "ownerEmail", "EQUAL", email),
            queryServerCollection<Record<string, unknown>>("media_posts", "ownerEmail", "EQUAL", email),
            queryServerCollection<Record<string, unknown>>("groups", "members", "ARRAY_CONTAINS", email),
            queryServerCollection<Record<string, unknown>>("arcade_games", "ownerEmail", "EQUAL", email).catch(() => []),
            queryServerCollection<Record<string, unknown>>("news_comments", "authorEmail", "EQUAL", email).catch(() => []),
            queryServerCollection<Record<string, unknown>>("arcade_likes", "liker", "EQUAL", likerHash(email)).catch(() => []),
            queryServerCollection<Record<string, unknown>>("arena_votes", "voter", "EQUAL", voterHash(email)).catch(() => []),
            queryServerCollection<TicketRecord>(TICKETS_COLLECTION, "authorEmail", "EQUAL", email),
            listServerCollection<Record<string, unknown>>(`notifications/${email}/items`),
            queryServerCollection<Record<string, unknown>>("chats", "participants", "ARRAY_CONTAINS", email, { limit: CHAT_LIMIT }),
            getServerDocument<Record<string, unknown>>(`subscriptions/${email}`).catch(() => null),
            getServerDocument<Record<string, unknown>>(`plan_waitlist/${email}`).catch(() => null),
            // Hanogt AI connections without their encrypted API keys (only the last four characters).
            exportAiConnections(email).catch(() => []),
        ]);
        const exportedProjects = await Promise.all(projects.map(async (project) => ({
            ...publicAccountData(project),
            id: project._id,
            files: (await listServerCollection<Record<string, unknown>>(`projects/${project._id}/files`))
                .map((file) => publicAccountData(file)),
        })));
        const exportedGameProjects = await Promise.all(gameProjects.map(async (project) => ({
            ...publicAccountData(project),
            id: project._id,
            scripts: (await listServerCollection<Record<string, unknown>>(`game_projects/${project._id}/scripts`))
                .map((script) => publicAccountData(script)),
        })));
        const privateChats = await exportPrivateChats(email, chats);

        return NextResponse.json({
            user: publicAccountData(user),
            projects: exportedProjects,
            gameProjects: exportedGameProjects,
            arcadeGames: arcadeGames.map((game) => ({ ...publicAccountData(game), id: game._id })),
            newsComments: newsComments.map((comment) => publicAccountData(comment)),
            arcadeLikes: arcadeLikes.map((like) => ({ gameId: like.gameId, createdAt: like.createdAt })),
            arenaVotes: arenaVotes.map((vote) => ({ category: vote.category, a: vote.a, b: vote.b, result: vote.result, day: vote.day })),
            mediaPosts: mediaPosts.map((post) => publicAccountData(post)),
            // Other members' e-mail addresses are their personal data, not the requester's:
            // the export keeps the group's own fields and only says how many members it has.
            groups: groups.map((group) => {
                const { members, admins, ownerEmail, ...rest } = publicAccountData(group) as Record<string, unknown>;
                return {
                    ...rest,
                    id: group._id,
                    memberCount: Array.isArray(members) ? members.length : 0,
                    yourRole: ownerEmail === email ? "owner" : Array.isArray(admins) && admins.includes(email) ? "admin" : "member",
                };
            }),
            supportTickets: exportSupportTickets(supportTickets),
            notifications: exportNotifications(notifications),
            // The staff member who assigned the plan is their personal data, so only the plan itself is exported.
            plan: subscription ? withoutKeys(publicAccountData(subscription) as Record<string, unknown>, ["grantedBy", "blockedBy"]) : null,
            planWaitlist: waitlist ? publicAccountData(waitlist) : null,
            aiConnections,
            privateChats,
            exportedAt: new Date().toISOString(),
            note: "Kimlik bilgileri ve parola özetleri bu dosyaya dahil edilmez. Hanogt AI bağlantılarınızın API anahtarları da eklenmez; yalnızca son dört karakterleri gösterilir. Özel sohbetlerde yalnızca sizin yazdığınız mesajlar yer alır; diğer katılımcılar görünen adlarıyla gösterilir.",
        }, { headers: jsonSecurityHeaders() });
    } catch (error) {
        console.error("[account:export]", error instanceof Error ? error.message : error);
        return NextResponse.json({ error: "Veriler şu anda dışa aktarılamadı. Lütfen biraz sonra tekrar deneyin." }, { status: 503, headers: jsonSecurityHeaders() });
    }
}

function withoutKeys(record: Record<string, unknown>, keys: readonly string[]) {
    return Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)));
}

export async function DELETE(request: NextRequest) {
    if (!isSameOrigin(request)) return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403 });
    const activeSession = await getActiveSession();
    if (!activeSession) return NextResponse.json({ error: "Etkin oturum gerekli." }, { status: 401 });
    const { email } = activeSession;
    const rate = await enforceRateLimit(`account-delete:${email}`, 2, 24 * 60 * 60_000);
    if (!rate.allowed) return NextResponse.json({ error: "Hesap silme isteği sınırı aşıldı." }, { status: 429 });

    const summary = await deleteAccountData(email, { scope: "all" });
    // The lines name steps and Firestore errors, never addresses.
    if (summary.errors.length) console.error("[account:delete] some data could not be deleted:", summary.errors);
    if (!summary.accountDeleted) {
        // The account and this session still work, so the person can simply try again.
        return NextResponse.json({ error: "Hesap silinemedi. Lütfen biraz sonra tekrar deneyin." }, { status: 503, headers: jsonSecurityHeaders() });
    }
    return NextResponse.json({ success: true, complete: summary.errors.length === 0 }, { headers: jsonSecurityHeaders() });
}
