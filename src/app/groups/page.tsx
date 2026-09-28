"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { ArrowRight, Check, Code2, LoaderCircle, Mail, MessageSquare, Plus, Sparkles, UsersRound, X } from "lucide-react";
import Header from "@/components/Header";
import { useI18n, type Copy } from "@/lib/i18n";
import { getProjectsFromCloud, type Project } from "@/lib/storage";

type Group = { id: string; name: string; description?: string; memberCount: number; projectName?: string; updatedAt?: string };
type GroupInvite = { id: string; groupId: string; groupName?: string; fromEmail?: string; expiresAt?: string };

/** Error codes set by the memoized loader; translated while rendering. */
const ERROR_CODES: Record<string, Copy> = {
    "groups:load": { TR: "Gruplar yüklenemedi.", EN: "Groups couldn't be loaded." },
};

export default function GroupsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const { tx, language } = useI18n();
    // Server messages are written in Turkish; other languages get the localized fallback.
    const serverText = (message: string | undefined, fallback: Copy) => (language === "TR" && message ? message : tx(fallback));
    const [groups, setGroups] = useState<Group[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [invites, setInvites] = useState<GroupInvite[]>([]);
    const [showCreate, setShowCreate] = useState(false);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [form, setForm] = useState({ name: "", description: "", projectId: "" });

    const load = useCallback(async () => {
        if (!session?.user) return;
        setLoading(true);
        try {
            const response = await fetch("/api/groups", { cache: "no-store" });
            const data = await response.json() as { groups?: Group[]; invites?: GroupInvite[]; error?: string };
            if (!response.ok) throw new Error(data.error || "");
            setGroups(data.groups || []);
            setInvites(data.invites || []);
        } catch (loadError) {
            console.warn("Groups could not be loaded:", loadError);
            setError("groups:load");
        } finally {
            setLoading(false);
        }
    }, [session?.user]);

    useEffect(() => {
        if (!session?.user) return;
        // Deferred to a task so the first render isn't followed by a synchronous state cascade.
        const timer = window.setTimeout(() => { void load(); }, 0);
        return () => window.clearTimeout(timer);
    }, [load, session?.user]);
    useEffect(() => {
        if (session?.user?.email) void getProjectsFromCloud(session.user.email).then(setProjects);
    }, [session?.user?.email]);

    const create = async () => {
        if (form.name.trim().length < 2) return;
        setBusy(true);
        try {
            const response = await fetch("/api/groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", ...form }) });
            const data = await response.json() as { id?: string; error?: string };
            if (!response.ok || !data.id) throw new Error(serverText(data.error, { TR: "Grup oluşturulamadı.", EN: "The group couldn't be created." }));
            router.push(`/groups/${data.id}`);
        } catch (createError) {
            setError(createError instanceof Error && createError.message ? createError.message : tx({ TR: "Grup oluşturulamadı.", EN: "The group couldn't be created." }));
        } finally {
            setBusy(false);
        }
    };

    const resolveInvite = async (invite: GroupInvite, accept: boolean) => {
        setBusy(true);
        try {
            const response = await fetch("/api/groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: accept ? "accept-invite" : "reject-invite", groupId: invite.groupId }) });
            const data = await response.json() as { error?: string };
            if (!response.ok) throw new Error(serverText(data.error, { TR: "Davet işlenemedi.", EN: "The invitation couldn't be processed." }));
            if (accept) router.push(`/groups/${invite.groupId}`);
            else await load();
        } catch (inviteError) {
            setError(inviteError instanceof Error && inviteError.message ? inviteError.message : tx({ TR: "Davet işlenemedi.", EN: "The invitation couldn't be processed." }));
        } finally {
            setBusy(false);
        }
    };

    if (status === "loading") return <div className="flex min-h-screen items-center justify-center bg-zinc-950"><LoaderCircle className="h-7 w-7 animate-spin text-blue-500" /></div>;
    if (!session?.user) {
        return <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950"><Header /><div className="mx-auto max-w-xl px-6 pt-40 text-center"><UsersRound className="mx-auto h-12 w-12 text-zinc-400" /><h1 className="mt-5 text-3xl font-black dark:text-white">{tx({ TR: "Gruplar için giriş yapın", EN: "Sign in to use Groups" })}</h1><p className="mt-3 text-zinc-500">{tx({ TR: "Ortak çalışma alanları yalnızca doğrulanmış grup üyelerine açıktır.", EN: "Shared workspaces are open to verified group members only." })}</p><button onClick={() => router.push("/login")} className="mt-7 rounded-2xl bg-blue-600 px-6 py-3 font-bold text-white">{tx({ TR: "Giriş yap", EN: "Sign in" })}</button></div></main>;
    }

    return (
        <main className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-white">
            <Header />
            <section className="relative overflow-hidden border-b border-zinc-200 pt-32 pb-14 dark:border-zinc-800">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_30%,rgba(59,130,246,.14),transparent_32%),radial-gradient(circle_at_78%_20%,rgba(16,185,129,.1),transparent_28%)]" />
                <div className="relative mx-auto flex max-w-7xl flex-col justify-between gap-7 px-6 md:flex-row md:items-end"><div><span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300"><Sparkles className="h-3.5 w-3.5" /> {tx({ TR: "Canlı ortak çalışma", EN: "Live collaboration" })}</span><h1 className="mt-5 text-4xl font-black tracking-tight sm:text-6xl">{tx({ TR: "Hanogt Grupları", EN: "Hanogt Groups" })}</h1><p className="mt-4 max-w-2xl text-lg leading-8 text-zinc-500">{tx({ TR: "Arkadaşlarınızı davet edin, aynı dosyaları canlı izleyin, proje sohbetinde yazılı veya sesli mesaj gönderin ve üyeleri WebRTC ile arayın.", EN: "Invite friends, follow the same files live, send text or voice messages in the project chat and call members over WebRTC." })}</p></div><button onClick={() => setShowCreate(true)} className="flex items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-6 py-3.5 font-bold text-white shadow-xl transition hover:-translate-y-1 dark:bg-white dark:text-zinc-950"><Plus className="h-5 w-5" />{tx({ TR: "Yeni grup", EN: "New group" })}</button></div>
            </section>
            <section className="mx-auto max-w-7xl px-6 py-10">
                {error && <button onClick={() => setError("")} className="mb-6 flex w-full items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-start text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">{ERROR_CODES[error] ? tx(ERROR_CODES[error]) : error}<X className="h-4 w-4" /></button>}
                {invites.length > 0 && <div className="mb-9 rounded-3xl border border-blue-200 bg-blue-50/80 p-5 dark:border-blue-900 dark:bg-blue-950/25"><h2 className="flex items-center gap-2 font-black text-blue-900 dark:text-blue-200"><Mail className="h-5 w-5" />{tx({ TR: "Grup davetleri", EN: "Group invitations" })}</h2><div className="mt-4 grid gap-3 md:grid-cols-2">{invites.map((invite) => <div key={invite.id} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm dark:bg-zinc-900"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white"><UsersRound className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{invite.groupName || tx({ TR: "Hanogt grubu", EN: "Hanogt group" })}</p><p className="truncate text-xs text-zinc-500">{tx({ TR: `${invite.fromEmail || "Bir arkadaşınız"} davet etti`, EN: `${invite.fromEmail || "A friend"} invited you` })}</p></div><button disabled={busy} onClick={() => resolveInvite(invite, true)} className="rounded-xl bg-emerald-500 p-2 text-white" title={tx({ TR: "Kabul et", EN: "Accept" })}><Check className="h-4 w-4" /></button><button disabled={busy} onClick={() => resolveInvite(invite, false)} className="rounded-xl bg-zinc-100 p-2 text-zinc-500 dark:bg-zinc-800" title={tx({ TR: "Reddet", EN: "Decline" })}><X className="h-4 w-4" /></button></div>)}</div></div>}
                {loading ? <div className="flex min-h-64 items-center justify-center"><LoaderCircle className="h-7 w-7 animate-spin text-blue-500" /></div> : groups.length === 0 ? <div className="rounded-3xl border border-dashed border-zinc-300 bg-white/60 py-20 text-center dark:border-zinc-700 dark:bg-zinc-900/50"><UsersRound className="mx-auto h-12 w-12 text-zinc-400" /><h2 className="mt-5 text-2xl font-black">{tx({ TR: "İlk çalışma grubunuzu kurun", EN: "Set up your first work group" })}</h2><p className="mt-2 text-zinc-500">{tx({ TR: "Mevcut bir projeyi başlangıç noktası olarak seçebilir veya boş alan açabilirsiniz.", EN: "Start from one of your projects or open an empty workspace." })}</p></div> : <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{groups.map((group, index) => <motion.button key={group.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .05 }} onClick={() => router.push(`/groups/${group.id}`)} className="group rounded-3xl border border-zinc-200 bg-white p-6 text-start shadow-sm transition hover:-translate-y-1 hover:border-blue-300 hover:shadow-xl dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-blue-900"><div className="flex items-start justify-between"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 text-white"><UsersRound className="h-6 w-6" /></div><ArrowRight className="h-5 w-5 text-zinc-400 transition group-hover:translate-x-1 group-hover:text-blue-500 rtl:rotate-180 rtl:group-hover:-translate-x-1" /></div><h2 className="mt-5 text-xl font-black">{group.name}</h2><p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-zinc-500">{group.description || tx({ TR: "Birlikte üretmek için özel çalışma alanı.", EN: "A private workspace for building together." })}</p><div className="mt-5 flex items-center justify-between border-t border-zinc-100 pt-4 text-xs font-semibold text-zinc-500 dark:border-zinc-800"><span className="flex items-center gap-1.5"><Code2 className="h-4 w-4" />{group.projectName || tx({ TR: "Ortak proje", EN: "Shared project" })}</span><span className="flex items-center gap-1.5"><MessageSquare className="h-4 w-4" />{group.memberCount} {tx({ TR: "üye", EN: "members" })}</span></div></motion.button>)}</div>}
            </section>

            {showCreate && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={() => setShowCreate(false)}><motion.div initial={{ opacity: 0, y: 16, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-lg rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"><div className="flex items-center justify-between"><div><h2 className="text-2xl font-black">{tx({ TR: "Yeni grup oluştur", EN: "Create a new group" })}</h2><p className="mt-1 text-sm text-zinc-500">{tx({ TR: "Başlangıçta yalnızca siz üye olursunuz.", EN: "You'll be the only member at first." })}</p></div><button onClick={() => setShowCreate(false)} className="rounded-xl p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"><X className="h-5 w-5" /></button></div><div className="mt-6 space-y-4"><label className="block text-sm font-semibold">{tx({ TR: "Grup adı", EN: "Group name" })}<input value={form.name} maxLength={80} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="mt-2 w-full rounded-2xl border border-zinc-200 bg-transparent px-4 py-3 outline-none focus:border-blue-500 dark:border-zinc-700" /></label><label className="block text-sm font-semibold">{tx({ TR: "Açıklama", EN: "Description" })}<textarea value={form.description} maxLength={500} rows={3} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className="mt-2 w-full resize-none rounded-2xl border border-zinc-200 bg-transparent px-4 py-3 outline-none focus:border-blue-500 dark:border-zinc-700" /></label><label className="block text-sm font-semibold">{tx({ TR: "Başlangıç projesi", EN: "Starting project" })} <span className="font-normal text-zinc-400">{tx({ TR: "(isteğe bağlı)", EN: "(optional)" })}</span><select value={form.projectId} onChange={(event) => setForm((current) => ({ ...current, projectId: event.target.value }))} className="mt-2 w-full rounded-2xl border border-zinc-200 bg-transparent px-4 py-3 outline-none dark:border-zinc-700"><option value="">{tx({ TR: "Boş JavaScript projesi", EN: "Empty JavaScript project" })}</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><button disabled={busy || form.name.trim().length < 2} onClick={create} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3.5 font-bold text-white hover:bg-blue-700 disabled:opacity-40">{busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}{tx({ TR: "Grubu oluştur", EN: "Create group" })}</button></div></motion.div></div>}
        </main>
    );
}
