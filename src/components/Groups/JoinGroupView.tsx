"use client";

import { motion } from "framer-motion";
import { AlertTriangle, ArrowRight, Ban, Clock, Link2Off, LogIn, ShieldCheck, UserPlus, UsersRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import Header from "@/components/Header";
import { useRawSession } from "@/components/Provider";
import { useI18n, type Copy } from "@/lib/i18n";
import { GROUP_COLORS, getGroupTemplate, inviteLinkPath, isInviteToken, toMillis, type GroupJoinPreview } from "@/lib/groups";
import { groupHref } from "@/lib/social/model";
import { GroupRequestError, groupsApi, useGroupErrorText } from "./api";
import { Spinner, UserAvatar, cx, relativeTime } from "./ui";

const C = {
    invited: { TR: "Bir gruba davet edildin", EN: "You've been invited to a group" },
    invitedBy: { TR: "{name} seni davet ediyor", EN: "{name} invited you" },
    members: { TR: "{count}/{max} üye", EN: "{count}/{max} members" },
    expires: { TR: "Bağlantı {time} sona eriyor", EN: "Link expires {time}" },
    noExpiry: { TR: "Süresiz bağlantı", EN: "Link never expires" },
    join: { TR: "Gruba katıl", EN: "Join the group" },
    joining: { TR: "Katılınıyor…", EN: "Joining…" },
    open: { TR: "Gruba git", EN: "Open the group" },
    alreadyMember: { TR: "Zaten bu grubun üyesisin.", EN: "You're already a member of this group." },
    full: { TR: "Bu grup 25 üye sınırına ulaştı; şu anda katılamazsın.", EN: "This group has reached its 25-member limit, so you can't join right now." },
    banned: { TR: "Bu gruba katılman yöneticiler tarafından engellenmiş.", EN: "The admins have blocked you from joining this group." },
    privacy: { TR: "Katıldığında grup üyeleri kullanıcı adını, profil fotoğrafını ve e-posta adresini görebilir.", EN: "When you join, group members can see your username, profile photo and e-mail address." },
    signInTitle: { TR: "Daveti görmek için giriş yap", EN: "Sign in to see the invitation" },
    signInText: { TR: "Grup davetleri yalnızca Hanogt hesabı olan kişilere açılır. Giriş yaptıktan sonra bu sayfaya geri döneceksin.", EN: "Group invitations open only for people with a Hanogt account. You'll come back to this page after signing in." },
    signIn: { TR: "Giriş yap", EN: "Sign in" },
    signUp: { TR: "Hesap oluştur", EN: "Create an account" },
    invalidTitle: { TR: "Davet bağlantısı geçersiz", EN: "Invalid invite link" },
    unavailableTitle: { TR: "Bu davet kullanılamıyor", EN: "This invitation can't be used" },
    backToGroups: { TR: "Hanogt Social'a dön", EN: "Back to Hanogt Social" },
    loading: { TR: "Davet yükleniyor", EN: "Loading the invitation" },
    joinFailed: { TR: "Gruba katılınamadı.", EN: "Couldn't join the group." },
} satisfies Record<string, Copy>;

export default function JoinGroupView({ token }: { token: string }) {
    const { data: session, status } = useRawSession();
    const router = useRouter();
    const { tx, locale } = useI18n();
    const errorText = useGroupErrorText();
    const validToken = isInviteToken(token);
    const signedIn = Boolean(session?.user?.email);
    const [preview, setPreview] = useState<GroupJoinPreview | null>(null);
    const [failure, setFailure] = useState<{ code: string; text: string } | null>(null);
    const [busy, setBusy] = useState(false);
    const [joinError, setJoinError] = useState("");
    const [now] = useState(() => Date.now());

    useEffect(() => {
        if (!signedIn || !validToken) return;
        let active = true;
        groupsApi.joinPreview(token)
            .then((result) => { if (active) setPreview(result.preview); })
            .catch((error: unknown) => {
                if (active) setFailure({ code: error instanceof GroupRequestError ? error.code : "server_error", text: errorText(error) });
            });
        return () => { active = false; };
    }, [errorText, signedIn, token, validToken]);

    const join = async () => {
        if (!preview || busy) return;
        setBusy(true);
        setJoinError("");
        try {
            const result = await groupsApi.join(token);
            router.push(groupHref(result.groupId));
        } catch (error) {
            setJoinError(errorText(error, C.joinFailed));
            setBusy(false);
        }
    };

    const callback = encodeURIComponent(inviteLinkPath(validToken ? token : ""));
    let body: ReactNode;
    if (!validToken) {
        body = <Problem icon={<Link2Off className="h-7 w-7" aria-hidden />} title={tx(C.invalidTitle)} text={tx({ TR: "Bağlantıyı eksiksiz kopyaladığından emin ol veya davet edenden yeni bir bağlantı iste.", EN: "Make sure you copied the whole link, or ask for a new one." })} />;
    } else if (status === "loading") {
        body = <div className="flex justify-center py-16" aria-busy="true" aria-label={tx(C.loading)}><Spinner className="h-7 w-7 text-indigo-500" /></div>;
    } else if (!signedIn) {
        body = (
            <div className="p-7 text-center sm:p-9">
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500 to-fuchsia-600 text-white shadow-xl shadow-indigo-500/25"><UsersRound className="h-8 w-8" aria-hidden /></span>
                <h1 className="mt-5 text-2xl font-black tracking-tight">{tx(C.signInTitle)}</h1>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-zinc-500 dark:text-zinc-400">{tx(C.signInText)}</p>
                <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
                    <Link href={`/login?callbackUrl=${callback}`} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-3 font-bold text-white shadow-lg shadow-indigo-600/25 transition hover:-translate-y-0.5"><LogIn className="h-5 w-5" aria-hidden />{tx(C.signIn)}</Link>
                    <Link href={`/signup?callbackUrl=${callback}`} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-200 px-5 py-3 font-semibold transition hover:bg-zinc-100 dark:border-white/10 dark:hover:bg-zinc-800"><UserPlus className="h-5 w-5" aria-hidden />{tx(C.signUp)}</Link>
                </div>
            </div>
        );
    } else if (failure) {
        const expired = failure.code === "link_expired" || failure.code === "link_exhausted";
        body = <Problem icon={expired ? <Clock className="h-7 w-7" aria-hidden /> : <Link2Off className="h-7 w-7" aria-hidden />} title={tx(C.unavailableTitle)} text={failure.text} />;
    } else if (!preview) {
        body = <div className="flex justify-center py-16" aria-busy="true" aria-label={tx(C.loading)}><Spinner className="h-7 w-7 text-indigo-500" /></div>;
    } else {
        const palette = GROUP_COLORS[preview.color];
        const template = preview.template ? getGroupTemplate(preview.template) : null;
        const blocked = preview.banned || (preview.full && !preview.alreadyMember);
        body = (
            <div>
                <div className={cx("relative overflow-hidden bg-gradient-to-br px-7 pb-8 pt-9 text-center text-white", palette.gradient)}>
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_0%,rgba(255,255,255,0.35),transparent_55%)]" aria-hidden />
                    <p className="relative text-xs font-bold uppercase tracking-[0.18em] text-white/80">{tx(C.invited)}</p>
                    <span className="relative mx-auto mt-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-white/20 text-5xl shadow-xl ring-1 ring-white/30 backdrop-blur">{preview.emoji}</span>
                    <h1 className="relative mt-4 break-words text-2xl font-black tracking-tight sm:text-3xl">{preview.name}</h1>
                    {template && <p className="relative mt-1 text-sm font-semibold text-white/85">{template.emoji} {tx(template.name)}</p>}
                </div>
                <div className="space-y-5 p-6 sm:p-7">
                    {preview.description && <p className="whitespace-pre-line break-words text-center text-sm leading-6 text-zinc-600 dark:text-zinc-300">{preview.description}</p>}
                    <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-semibold">
                        <span className="inline-flex items-center gap-2 rounded-full bg-zinc-100 py-1 pe-3 ps-1 text-zinc-700 dark:bg-white/10 dark:text-zinc-200"><UserAvatar name={preview.inviter.username} src={preview.inviter.avatarUrl} size="xs" />{tx(C.invitedBy, { name: preview.inviter.username })}</span>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1.5 text-zinc-700 dark:bg-white/10 dark:text-zinc-200"><UsersRound className="h-3.5 w-3.5" aria-hidden />{tx(C.members, { count: preview.memberCount, max: preview.membersMax })}</span>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1.5 text-zinc-700 dark:bg-white/10 dark:text-zinc-200"><Clock className="h-3.5 w-3.5" aria-hidden />{preview.expiresAt ? tx(C.expires, { time: relativeTime(toMillis(preview.expiresAt), now, locale) }) : tx(C.noExpiry)}</span>
                    </div>
                    {preview.alreadyMember && <p className="rounded-2xl bg-emerald-500/10 px-4 py-3 text-center text-sm font-semibold text-emerald-800 dark:text-emerald-300">{tx(C.alreadyMember)}</p>}
                    {preview.banned && <p className="flex items-center justify-center gap-2 rounded-2xl bg-red-500/10 px-4 py-3 text-center text-sm font-semibold text-red-700 dark:text-red-300"><Ban className="h-4 w-4" aria-hidden />{tx(C.banned)}</p>}
                    {!preview.banned && preview.full && !preview.alreadyMember && <p className="flex items-center justify-center gap-2 rounded-2xl bg-amber-500/10 px-4 py-3 text-center text-sm font-semibold text-amber-800 dark:text-amber-300"><AlertTriangle className="h-4 w-4" aria-hidden />{tx(C.full)}</p>}
                    {joinError && <p className="rounded-2xl bg-red-500/10 px-4 py-3 text-center text-sm text-red-700 dark:text-red-300" role="alert">{joinError}</p>}
                    {preview.alreadyMember ? (
                        <Link href={groupHref(preview.groupId)} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-900 px-5 py-3.5 font-bold text-white transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">{tx(C.open)}<ArrowRight className="h-5 w-5 rtl:rotate-180" aria-hidden /></Link>
                    ) : (
                        <button type="button" onClick={() => void join()} disabled={busy || blocked} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-3.5 font-bold text-white shadow-lg shadow-indigo-600/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
                            {busy ? <Spinner className="h-5 w-5" /> : <UserPlus className="h-5 w-5" aria-hidden />}{busy ? tx(C.joining) : tx(C.join)}
                        </button>
                    )}
                    {!preview.alreadyMember && <p className="flex items-start justify-center gap-1.5 text-center text-xs text-zinc-500 dark:text-zinc-400"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{tx(C.privacy)}</p>}
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-dvh bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-white">
            <Header />
            <main id="main-content" className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 pb-16 pt-24">
                <div className="pointer-events-none absolute -top-32 start-1/4 h-80 w-80 rounded-full bg-indigo-500/15 blur-3xl" aria-hidden />
                <div className="pointer-events-none absolute bottom-0 end-1/4 h-72 w-72 rounded-full bg-fuchsia-500/10 blur-3xl" aria-hidden />
                <motion.div initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.35, ease: "easeOut" }} className="relative w-full max-w-md overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-2xl dark:border-white/10 dark:bg-zinc-900">
                    {body}
                </motion.div>
                <Link href="/social" className="absolute bottom-6 text-sm font-semibold text-zinc-500 underline-offset-4 hover:text-indigo-600 hover:underline dark:text-zinc-400 dark:hover:text-indigo-300">{tx(C.backToGroups)}</Link>
            </main>
        </div>
    );
}

function Problem({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
    return (
        <div className="p-8 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">{icon}</span>
            <h1 className="mt-5 text-xl font-black">{title}</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-zinc-500 dark:text-zinc-400">{text}</p>
        </div>
    );
}
