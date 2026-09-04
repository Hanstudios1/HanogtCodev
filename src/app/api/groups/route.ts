import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/server/active-session";
import {
    commitServerPatches,
    deleteServerDocument,
    deleteServerStorageObject,
    getServerDocument,
    listServerCollection,
    patchServerDocument,
    queryServerCollection,
} from "@/lib/server/firebase-rest";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";

type Group = {
    name?: string;
    description?: string;
    ownerEmail?: string;
    admins?: string[];
    members?: string[];
    createdAt?: string;
    updatedAt?: string;
    projectName?: string;
};
type GroupFile = { name?: string; lang?: string; code?: string; order?: number };
type GroupMessage = { voicePath?: string };
type GroupInvite = { groupId?: string; groupName?: string; fromEmail?: string; toEmail?: string; status?: string; expiresAt?: string };

const cleanText = (value: unknown, max: number) => typeof value === "string" ? value.trim().replace(/\0/g, "").slice(0, max) : "";
const cleanEmail = (value: unknown) => {
    const email = cleanText(value, 254).toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
};
const inviteId = (groupId: string, email: string) => `${groupId}_${createHash("sha256").update(email).digest("hex").slice(0, 32)}`;

async function memberProfiles(members: string[]) {
    return Promise.all(members.map(async (email) => {
        const profile = await getServerDocument<{ username?: string; avatarUrl?: string; customStatus?: string; isOnline?: boolean; lastSeenAt?: string }>(`public_profiles/${email}`);
        return {
            email,
            username: profile?.username || email.split("@")[0],
            avatarUrl: profile?.avatarUrl || null,
            customStatus: profile?.customStatus || "",
            isOnline: Boolean(profile?.isOnline),
            lastSeenAt: profile?.lastSeenAt || null,
        };
    }));
}

export async function GET(request: NextRequest) {
    const activeSession = await getActiveSession();
    if (!activeSession) return NextResponse.json({ error: "Etkin oturum gerekli." }, { status: 401 });
    const { email } = activeSession;
    const id = cleanText(request.nextUrl.searchParams.get("id"), 100);
    try {
        if (id) {
            const group = await getServerDocument<Group>(`groups/${id}`);
            if (!group || !group.members?.includes(email)) return NextResponse.json({ error: "Grup bulunamadı veya erişiminiz yok." }, { status: 404 });
            const members = await memberProfiles(group.members);
            return NextResponse.json({
                group: { id, name: group.name, description: group.description, ownerEmail: group.ownerEmail, admins: group.admins || [], projectName: group.projectName, createdAt: group.createdAt },
                members,
            }, { headers: jsonSecurityHeaders() });
        }
        const [groups, inviteRecords] = await Promise.all([
            queryServerCollection<Group>("groups", "members", "ARRAY_CONTAINS", email, { limit: 100 }),
            queryServerCollection<GroupInvite>("group_invites", "toEmail", "EQUAL", email, { limit: 100 }),
        ]);
        return NextResponse.json({
            groups: groups
                .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
                .map((group) => ({ id: group._id, name: group.name, description: group.description, ownerEmail: group.ownerEmail, memberCount: group.members?.length || 0, projectName: group.projectName, updatedAt: group.updatedAt || group.createdAt })),
            invites: inviteRecords
                .filter((invite) => invite.status === "pending" && (!invite.expiresAt || new Date(invite.expiresAt).getTime() > Date.now()))
                .map((invite) => ({ id: invite._id, groupId: invite.groupId, groupName: invite.groupName, fromEmail: invite.fromEmail, expiresAt: invite.expiresAt })),
        }, { headers: jsonSecurityHeaders() });
    } catch {
        return NextResponse.json({ error: "Gruplar yüklenemedi." }, { status: 503 });
    }
}

export async function POST(request: NextRequest) {
    if (!isSameOrigin(request)) return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403 });
    const activeSession = await getActiveSession();
    if (!activeSession) return NextResponse.json({ error: "Etkin oturum gerekli." }, { status: 401 });
    const { email, user } = activeSession;
    const rate = await enforceRateLimit(`groups:${email}`, 30, 60_000);
    if (!rate.allowed) return NextResponse.json({ error: "Çok fazla grup işlemi. Biraz sonra tekrar deneyin." }, { status: 429 });
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = cleanText(body.action, 30);

    try {
        if (action === "create") {
            const name = cleanText(body.name, 80);
            const description = cleanText(body.description, 500);
            if (name.length < 2) return NextResponse.json({ error: "Grup adı en az 2 karakter olmalıdır." }, { status: 400 });
            const projectId = cleanText(body.projectId, 100);
            let files: Array<GroupFile & { _id: string; _path: string }> = [];
            let projectName = "Ortak çalışma alanı";
            if (projectId) {
                const project = await getServerDocument<{ email?: string; name?: string }>(`projects/${projectId}`);
                if (!project || project.email !== email) return NextResponse.json({ error: "Başlangıç projesi bulunamadı." }, { status: 404 });
                files = await listServerCollection<GroupFile>(`projects/${projectId}/files`, 50);
                projectName = project.name || projectName;
            }
            if (!files.length) files = [{ _id: "000-main", _path: "", name: "main.js", lang: "javascript", code: "console.log('Merhaba Hanogt grubu!');", order: 0 }];
            const id = randomUUID();
            const now = new Date();
            await commitServerPatches([
                {
                    path: `groups/${id}`,
                    data: { name, description, ownerEmail: email, admins: [email], members: [email], projectName, createdAt: now, updatedAt: now, schemaVersion: 1 },
                    exists: false,
                },
                ...files.map((file, index) => ({
                    path: `groups/${id}/files/${String(index).padStart(3, "0")}`,
                    data: { name: cleanText(file.name, 120) || `file-${index + 1}`, lang: cleanText(file.lang, 30) || "text", code: String(file.code || "").slice(0, 500_000), order: index, updatedBy: email, updatedAt: now },
                    exists: false,
                })),
            ]);
            return NextResponse.json({ success: true, id }, { status: 201, headers: jsonSecurityHeaders() });
        }

        if (action === "accept-invite" || action === "reject-invite") {
            const groupId = cleanText(body.groupId, 100);
            const id = inviteId(groupId, email);
            const invite = await getServerDocument<GroupInvite>(`group_invites/${id}`);
            if (!invite || invite.toEmail !== email || invite.groupId !== groupId || invite.status !== "pending" || (invite.expiresAt && new Date(invite.expiresAt).getTime() <= Date.now())) {
                return NextResponse.json({ error: "Geçerli grup daveti bulunamadı." }, { status: 404 });
            }
            if (action === "reject-invite") {
                await patchServerDocument(`group_invites/${id}`, { status: "rejected", resolvedAt: new Date() }, { updateTime: invite._updateTime });
                return NextResponse.json({ success: true }, { headers: jsonSecurityHeaders() });
            }
            const invitedGroup = await getServerDocument<Group>(`groups/${groupId}`);
            if (!invitedGroup || (invitedGroup.members?.length || 0) >= 25) return NextResponse.json({ error: "Grup bulunamadı veya üye sınırı dolu." }, { status: 409 });
            await commitServerPatches([
                { path: `groups/${groupId}`, data: { members: [...new Set([...(invitedGroup.members || []), email])], updatedAt: new Date() }, updateFields: ["members", "updatedAt"], updateTime: invitedGroup._updateTime },
                { path: `group_invites/${id}`, data: { status: "accepted", resolvedAt: new Date() }, updateFields: ["status", "resolvedAt"], updateTime: invite._updateTime },
            ]);
            return NextResponse.json({ success: true }, { headers: jsonSecurityHeaders() });
        }

        const groupId = cleanText(body.groupId, 100);
        const group = groupId ? await getServerDocument<Group>(`groups/${groupId}`) : null;
        if (!group || !group.members?.includes(email)) return NextResponse.json({ error: "Grup bulunamadı veya erişiminiz yok." }, { status: 404 });

        if (action === "add-member") {
            const targetEmail = cleanEmail(body.targetEmail);
            if (!targetEmail || targetEmail === email) return NextResponse.json({ error: "Geçersiz kullanıcı." }, { status: 400 });
            if (!user.friends?.includes(targetEmail)) return NextResponse.json({ error: "Yalnızca arkadaşlarınızı gruba ekleyebilirsiniz." }, { status: 403 });
            if ((group.members?.length || 0) >= 25) return NextResponse.json({ error: "Grup 25 üye sınırına ulaştı." }, { status: 409 });
            if (!group.members?.includes(targetEmail)) {
                const target = await getServerDocument(`users/${targetEmail}`);
                if (!target) return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });
                const id = inviteId(groupId, targetEmail);
                await patchServerDocument(`group_invites/${id}`, {
                    groupId,
                    groupName: group.name || "Hanogt grubu",
                    fromEmail: email,
                    toEmail: targetEmail,
                    status: "pending",
                    createdAt: new Date(),
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
                });
            }
            return NextResponse.json({ success: true, invited: true }, { headers: jsonSecurityHeaders() });
        }
        if (action === "remove-member") {
            const targetEmail = cleanEmail(body.targetEmail);
            const canManage = group.ownerEmail === email || group.admins?.includes(email);
            if (!canManage || !targetEmail || targetEmail === group.ownerEmail) return NextResponse.json({ error: "Bu üyeyi çıkarma yetkiniz yok." }, { status: 403 });
            await patchServerDocument(`groups/${groupId}`, { members: (group.members || []).filter((item) => item !== targetEmail), admins: (group.admins || []).filter((item) => item !== targetEmail), updatedAt: new Date() }, { updateTime: group._updateTime });
            return NextResponse.json({ success: true }, { headers: jsonSecurityHeaders() });
        }
        if (action === "set-admin") {
            const targetEmail = cleanEmail(body.targetEmail);
            if (group.ownerEmail !== email || !targetEmail || targetEmail === group.ownerEmail || !group.members?.includes(targetEmail)) {
                return NextResponse.json({ error: "Rol değiştirme yetkiniz yok." }, { status: 403 });
            }
            const enabled = body.enabled === true;
            const admins = enabled
                ? [...new Set([...(group.admins || []), targetEmail])]
                : (group.admins || []).filter((item) => item !== targetEmail);
            await patchServerDocument(`groups/${groupId}`, { admins, updatedAt: new Date() }, { updateTime: group._updateTime });
            return NextResponse.json({ success: true }, { headers: jsonSecurityHeaders() });
        }
        if (action === "rename") {
            if (group.ownerEmail !== email && !group.admins?.includes(email)) return NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 });
            const name = cleanText(body.name, 80);
            const description = cleanText(body.description, 500);
            if (name.length < 2) return NextResponse.json({ error: "Grup adı çok kısa." }, { status: 400 });
            await patchServerDocument(`groups/${groupId}`, { name, description, updatedAt: new Date() }, { updateTime: group._updateTime });
            return NextResponse.json({ success: true }, { headers: jsonSecurityHeaders() });
        }
        if (action === "leave") {
            if (group.ownerEmail === email) return NextResponse.json({ error: "Grup sahibi ayrılmadan önce grubu silmelidir." }, { status: 409 });
            await patchServerDocument(`groups/${groupId}`, { members: (group.members || []).filter((item) => item !== email), admins: (group.admins || []).filter((item) => item !== email), updatedAt: new Date() }, { updateTime: group._updateTime });
            return NextResponse.json({ success: true }, { headers: jsonSecurityHeaders() });
        }
        if (action === "delete") {
            if (group.ownerEmail !== email) return NextResponse.json({ error: "Yalnızca grup sahibi silebilir." }, { status: 403 });
            const [files, messages] = await Promise.all([
                listServerCollection(`groups/${groupId}/files`, 100),
                listServerCollection<GroupMessage>(`groups/${groupId}/messages`, 1000),
            ]);
            await Promise.all(messages.map((message) => message.voicePath ? deleteServerStorageObject(message.voicePath).catch(() => undefined) : Promise.resolve()));
            await Promise.all([...files, ...messages].map((item) => deleteServerDocument(item._path)));
            const invites = await queryServerCollection("group_invites", "groupId", "EQUAL", groupId, { limit: 1000 });
            await Promise.all(invites.map((invite) => deleteServerDocument(invite._path)));
            await deleteServerDocument(`groups/${groupId}`);
            return NextResponse.json({ success: true }, { headers: jsonSecurityHeaders() });
        }
        return NextResponse.json({ error: "Geçersiz işlem." }, { status: 400 });
    } catch (error) {
        const conflict = error instanceof Error && "status" in error && (error as Error & { status?: number }).status === 409;
        return NextResponse.json({ error: conflict ? "Grup başka bir cihazda güncellendi; tekrar deneyin." : "Grup işlemi tamamlanamadı." }, { status: conflict ? 409 : 500 });
    }
}
