"use client";

import { motion } from "framer-motion";
import { Ban, Crown, History, KeyRound, Lock, RefreshCw, RotateCcw, ShieldCheck, ShieldOff, Trash2, UserCheck, UserCog, Users } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { AccountDeletionResult, DeletionScope } from "@/lib/server/account-deletion";
import { useI18n, type Copy } from "@/lib/i18n";
import { adminPost, adminRequest, type ApiFailure } from "./api";
import { COMMON, ROLE_COPY, ROLE_DESCRIPTION_COPY } from "./copy";
import { formatNumber, useAdminResource, useDebouncedValue } from "./hooks";
import {
    SUSPEND_REASON_MAX,
    type AdminUser,
    type AdminUserActionResponse,
    type AdminUsersResponse,
    type AssignableRole,
    type UserRole,
} from "./types";
import {
    Avatar, Badge, Button, ConfirmDialog, Dialog, EmptyState, ErrorNotice, FOCUS_RING, INPUT_CLASS, LoadingRows, Notice, Panel, RelativeTime, SearchInput,
    SectionHeader, Spinner, TextArea, cx, useErrorText, useToast,
} from "./ui";
import { ROLE_TONES } from "./tones";

type DialogState =
    | { kind: "suspend" | "unsuspend" | "reset2fa"; user: AdminUser }
    | { kind: "role"; user: AdminUser; role: AssignableRole };

/** The stored role as it appears among the assignable ones ("user" when none). */
function assignableRole(user: AdminUser): AssignableRole {
    return user.role === "admin" || user.role === "moderator" ? user.role : "user";
}

/** When an earlier suspension was lifted; sent by /api/admin/users next to the AdminUser fields. */
function liftedSuspensionAt(user: AdminUser) {
    const value = (user as AdminUser & { unsuspendedAt?: unknown }).unsuspendedAt;
    return typeof value === "string" && value ? value : null;
}

export function RoleBadge({ role }: { role: UserRole }) {
    const { tx } = useI18n();
    return <Badge tone={ROLE_TONES[role]} icon={role === "owner" ? Crown : role === "user" ? undefined : ShieldCheck}>{tx(ROLE_COPY[role])}</Badge>;
}

function UserRow({ user, self, onAction, onDeleteData }: { user: AdminUser; self: boolean; onAction: (dialog: DialogState) => void; onDeleteData: (user: AdminUser) => void }) {
    const { tx } = useI18n();
    const name = user.username || user.nickname || user.email.split("@")[0];
    const liftedAt = liftedSuspensionAt(user);
    return (
        <li className="grid gap-3 px-4 py-3.5 md:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] md:items-center">
            <div className="flex min-w-0 items-center gap-3">
                <span className="relative">
                    <Avatar src={user.avatarUrl} name={name} size={40} />
                    {user.isOnline ? <span role="img" aria-label={tx({ TR: "Çevrimiçi", EN: "Online" })} title={tx({ TR: "Çevrimiçi", EN: "Online" })} className="absolute -bottom-0.5 -end-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500 dark:border-zinc-900" /> : null}
                </span>
                <div className="min-w-0">
                    <p className="flex min-w-0 items-center gap-1.5 text-sm font-bold text-zinc-900 dark:text-white">
                        <span className="truncate">{name}</span>
                        {user.nickname && user.nicknameTag ? <span className="shrink-0 text-[11px] font-medium text-zinc-400">{user.nickname}#{user.nicknameTag}</span> : null}
                        {self ? <Badge tone="indigo">{tx(COMMON.you)}</Badge> : null}
                    </p>
                    <p className="truncate text-[12px] text-zinc-500" dir="ltr">{user.email}</p>
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
                <RoleBadge role={user.role} />
                {user.provider ? <Badge tone={user.provider === "google" ? "sky" : "zinc"}>{user.provider === "google" ? "Google" : tx({ TR: "E-posta", EN: "E-mail" })}</Badge> : null}
                {user.twoFactorEnabled ? <Badge tone="emerald" icon={ShieldCheck}>2FA</Badge> : null}
            </div>
            <div className="min-w-0 text-[12px] text-zinc-500">
                {user.suspended ? (
                    <div className="space-y-0.5">
                        <Badge tone="red" icon={Ban}>{tx({ TR: "Askıda", EN: "Suspended" })}</Badge>
                        {user.suspendedAt ? <p><RelativeTime iso={user.suspendedAt} />{user.suspendedBy ? <span dir="ltr"> · {user.suspendedBy}</span> : null}</p> : null}
                        {user.suspendReason ? <p className="line-clamp-2 italic" dir="auto">“{user.suspendReason}”</p> : null}
                    </div>
                ) : (
                    <div className="space-y-0.5">
                        {liftedAt ? (
                            <p className="flex flex-wrap items-center gap-1.5">
                                <Badge tone="amber" icon={History}>{tx({ TR: "Önceden askıya alınmış", EN: "Previously suspended" })}</Badge>
                                <span>{tx({ TR: "Kaldırıldı", EN: "Lifted" })}: <RelativeTime iso={liftedAt} /></span>
                            </p>
                        ) : null}
                        <p>{tx({ TR: "Katıldı", EN: "Joined" })}: <RelativeTime iso={user.createdAt} className="font-semibold text-zinc-700 dark:text-zinc-300" /></p>
                        <p>{tx({ TR: "Son görülme", EN: "Last seen" })}: <RelativeTime iso={user.lastSeenAt ?? user.lastLoginAt} className="font-semibold text-zinc-700 dark:text-zinc-300" /></p>
                    </div>
                )}
            </div>
            <div className="flex flex-wrap items-center gap-2 md:justify-end">
                {user.isOwner ? (
                    <span className="inline-flex items-center gap-1 text-[12px] text-zinc-400"><Lock className="h-3.5 w-3.5" aria-hidden="true" />{tx({ TR: "Sahip hesabı korunuyor", EN: "Owner account is protected" })}</span>
                ) : null}
                {user.assignableRoles.length ? (
                    <Button size="sm" icon={UserCog} onClick={() => onAction({ kind: "role", user, role: assignableRole(user) })}>{tx({ TR: "Rol", EN: "Role" })}</Button>
                ) : null}
                {user.canSuspend && user.twoFactorEnabled ? (
                    <Button size="sm" variant="ghost" icon={ShieldOff} onClick={() => onAction({ kind: "reset2fa", user })}>{tx({ TR: "2FA sıfırla", EN: "Reset 2FA" })}</Button>
                ) : null}
                {user.canSuspend ? (
                    user.suspended
                        ? <Button size="sm" variant="success" icon={UserCheck} onClick={() => onAction({ kind: "unsuspend", user })}>{tx({ TR: "Askıyı kaldır", EN: "Unsuspend" })}</Button>
                        : <Button size="sm" variant="ghost" icon={Ban} className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10" onClick={() => onAction({ kind: "suspend", user })}>{tx({ TR: "Askıya al", EN: "Suspend" })}</Button>
                ) : null}
                {/* Deleting data follows the same rules as suspending (server: userManagementPolicy). */}
                {user.canSuspend ? (
                    <Button size="sm" variant="ghost" icon={Trash2} className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10" onClick={() => onDeleteData(user)}>{tx({ TR: "Verileri sil", EN: "Delete data" })}</Button>
                ) : null}
            </div>
        </li>
    );
}

// ---------------------------------------------------------------------------
// Deleting a user's data
// ---------------------------------------------------------------------------

const SCOPE_OPTIONS: Array<{ scope: DeletionScope; title: Copy; description: Copy }> = [
    {
        scope: "all",
        title: { TR: "Hesabı ve tüm verileri sil", EN: "Delete the account and all data" },
        description: { TR: "Hesap kalıcı olarak kapanır ve açık oturumları sona erer.", EN: "The account is closed for good and its open sessions end." },
    },
    {
        scope: "content",
        title: { TR: "Yalnızca herkese açık içerikleri sil", EN: "Delete only public content" },
        description: { TR: "Hesap, arkadaşlar, özel sohbetler ve projeler kalır.", EN: "The account, friends, private chats and projects stay." },
    },
];

const SCOPE_DETAILS: Record<DeletionScope, { deleted: Copy[]; note: Copy }> = {
    all: {
        deleted: [
            { TR: "Hesap, giriş bilgileri ve herkese açık profil", EN: "The account, sign-in details and public profile" },
            { TR: "Özel sohbetler, sesli mesajlar ve aramalar", EN: "Private chats, voice messages and calls" },
            { TR: "Kod ve oyun projeleri, Arcade'de yayımlanan oyunlar", EN: "Code and game projects, games published on Arcade" },
            { TR: "Media gönderileri ve bunlara ait beğeni, yorum ve bildirimler", EN: "Media posts with their likes, comments and reports" },
            { TR: "Haber ve sürüm notu yorumları, beğeniler ve oylar", EN: "News and release note comments, likes and votes" },
            { TR: "Sahip olduğu gruplar; diğer gruplardan çıkarılır ve oradaki mesajları anonimleştirilir", EN: "Groups they own; they leave other groups and their messages there are anonymised" },
            { TR: "Arkadaşlıklar, istekler, geri bildirimler, destek talepleri ve bildirimler", EN: "Friendships, requests, feedback, support tickets and notifications" },
        ],
        note: { TR: "Bu e-posta adresiyle daha sonra yeniden kayıt olunabilir.", EN: "The e-mail address can be used to sign up again later." },
    },
    content: {
        deleted: [
            { TR: "Media gönderileri (dosyaları, beğenileri ve yorumlarıyla) ve başka gönderilere yazdığı yorumlar", EN: "Media posts (with their files, likes and comments) and comments on other posts" },
            { TR: "Arcade'de yayımladığı oyunlar ve beğenileri", EN: "Games published on Arcade and their likes" },
            { TR: "Haber yorumları ve sürüm notu yorumları", EN: "News comments and release note comments" },
            { TR: "Yazdığı geri bildirimler ve başka geri bildirimlere yaptığı yorumlar", EN: "Feedback posts they wrote and their comments on other posts" },
            { TR: "Grup mesajlarındaki adı ve sesli mesajları (mesajlar anonimleştirilir)", EN: "Their name and voice messages in groups (the messages are anonymised)" },
        ],
        note: { TR: "Kalanlar: hesap ve giriş bilgileri, arkadaşlar, özel sohbetler, projeler, beğeniler ve destek talepleri.", EN: "Kept: the account and sign-in, friends, private chats, projects, likes and support tickets." },
    },
};

/** Labels of the counts in the deletion summary (lib/server/account-deletion.ts), in display order. */
const KIND_COPY: Record<string, Copy> = {
    account: { TR: "Hesap", EN: "Account" },
    chats: { TR: "Sohbetler", EN: "Chats" },
    chatMessages: { TR: "Sohbet mesajları", EN: "Chat messages" },
    voiceFiles: { TR: "Ses kayıtları", EN: "Voice recordings" },
    calls: { TR: "Aramalar", EN: "Calls" },
    callCandidates: { TR: "Arama bağlantı kayıtları", EN: "Call connection records" },
    projects: { TR: "Kod projeleri", EN: "Code projects" },
    projectFiles: { TR: "Proje dosyaları", EN: "Project files" },
    gameProjects: { TR: "Oyun projeleri", EN: "Game projects" },
    gameScripts: { TR: "Oyun scriptleri", EN: "Game scripts" },
    arcadeGames: { TR: "Arcade oyunları", EN: "Arcade games" },
    arcadeLikes: { TR: "Arcade beğenileri", EN: "Arcade likes" },
    arenaVotes: { TR: "Yapay zekâ arenası oyları", EN: "AI arena votes" },
    newsComments: { TR: "Haber yorumları", EN: "News comments" },
    mediaPosts: { TR: "Media gönderileri", EN: "Media posts" },
    mediaFiles: { TR: "Media dosyaları", EN: "Media files" },
    mediaLikes: { TR: "Media beğenileri", EN: "Media likes" },
    mediaComments: { TR: "Media yorumları", EN: "Media comments" },
    mediaReports: { TR: "Media bildirimleri", EN: "Media reports" },
    securityContributions: { TR: "Güvenlik eğitimi katkıları", EN: "Security training contributions" },
    groups: { TR: "Silinen gruplar", EN: "Deleted groups" },
    groupMessages: { TR: "Grup mesajları", EN: "Group messages" },
    groupFiles: { TR: "Grup dosyaları", EN: "Group files" },
    groupRecords: { TR: "Grup davetleri, bağlantıları ve yasakları", EN: "Group invites, links and bans" },
    groupMemberships: { TR: "Ayrıldığı gruplar", EN: "Groups left" },
    groupMessagesAnonymized: { TR: "Anonimleştirilen grup mesajları", EN: "Anonymised group messages" },
    groupBansAnonymized: { TR: "Anonimleştirilen grup yasakları", EN: "Anonymised group bans" },
    friendRequests: { TR: "Arkadaşlık istekleri", EN: "Friend requests" },
    groupInvites: { TR: "Grup davetleri", EN: "Group invitations" },
    friendLinks: { TR: "Arkadaş listelerinden çıkarıldı", EN: "Removed from friend lists" },
    blockLinks: { TR: "Engel listelerinden çıkarıldı", EN: "Removed from block lists" },
    feedback: { TR: "Geri bildirimler", EN: "Feedback posts" },
    feedbackLikes: { TR: "Geri bildirim beğenileri", EN: "Feedback likes" },
    feedbackComments: { TR: "Geri bildirim yorumları", EN: "Feedback comments" },
    changelogComments: { TR: "Sürüm notu yorumları", EN: "Release note comments" },
    notifications: { TR: "Bildirimler", EN: "Notifications" },
    supportTickets: { TR: "Destek talepleri", EN: "Support tickets" },
};

const KIND_ORDER = Object.keys(KIND_COPY);

function kindRank(kind: string) {
    const index = KIND_ORDER.indexOf(kind);
    return index === -1 ? KIND_ORDER.length : index;
}

function DeletionResultView({ result }: { result: AccountDeletionResult }) {
    const { tx, locale } = useI18n();
    const counts = Object.entries(result.deleted)
        .filter(([, count]) => count > 0)
        .sort(([a], [b]) => kindRank(a) - kindRank(b));
    const failed = result.errors.length > 0;
    const accountKept = result.scope === "all" && !result.accountDeleted;
    return (
        <div className="space-y-4">
            <Notice tone={accountKept ? "error" : failed ? "warning" : "success"}>
                {accountKept
                    ? tx({ TR: "Hesap silinemedi; diğer verilerin bir kısmı silinmiş olabilir. Tekrar deneyin.", EN: "The account couldn't be deleted; some of the other data may already be gone. Try again." })
                    : failed
                        ? tx({ TR: "Silme tamamlandı ama bazı kayıtlar silinemedi. Kalanlar için tekrar deneyebilirsiniz.", EN: "The deletion finished, but some records couldn't be deleted. You can retry for the rest." })
                        : result.scope === "all"
                            ? tx({ TR: "{email} hesabı ve tüm verileri silindi.", EN: "The account {email} and all its data were deleted." }, { email: result.email })
                            : tx({ TR: "{email} kullanıcısının herkese açık içerikleri silindi.", EN: "The public content of {email} was deleted." }, { email: result.email })}
            </Notice>
            {counts.length ? (
                <div>
                    <p className="mb-2 text-[13px] font-bold text-zinc-700 dark:text-zinc-200">{tx({ TR: "Silinen ve anonimleştirilen kayıtlar", EN: "Deleted and anonymised records" })}</p>
                    <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                        {counts.map(([kind, count]) => (
                            <div key={kind} className="flex items-baseline justify-between gap-3 border-b border-zinc-100 pb-1 text-[12.5px] dark:border-white/[0.06]">
                                <dt className="min-w-0 text-zinc-600 dark:text-zinc-300">{KIND_COPY[kind] ? tx(KIND_COPY[kind]) : kind}</dt>
                                <dd className="shrink-0 font-bold tabular-nums text-zinc-900 dark:text-white">{formatNumber(count, locale)}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            ) : (
                <p className="text-[13px] text-zinc-500">{tx({ TR: "Silinecek veri bulunamadı.", EN: "No data to delete was found." })}</p>
            )}
            {failed ? (
                <details className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3 text-[12px] text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100">
                    <summary className={cx("cursor-pointer rounded font-bold", FOCUS_RING)}>{tx({ TR: "Teknik ayrıntılar ({count})", EN: "Technical details ({count})" }, { count: result.errors.length })}</summary>
                    <ul className="mt-2 space-y-1 break-words font-mono text-[11px]" dir="ltr">
                        {result.errors.map((line, index) => <li key={index}>{line}</li>)}
                    </ul>
                </details>
            ) : null}
        </div>
    );
}

/**
 * Asks what to delete (the whole account or only public content), why, and
 * for the e-mail address typed out, then shows what the server removed.
 */
function DeleteDataDialog({ open, user, onClose, onDeleted }: {
    open: boolean;
    user: AdminUser;
    onClose: (ran: boolean) => void;
    onDeleted: (result: AccountDeletionResult) => void;
}) {
    const { tx } = useI18n();
    const confirmId = useId();
    const confirmHintId = useId();
    const resultRef = useRef<HTMLDivElement>(null);
    const [scope, setScope] = useState<DeletionScope | null>(null);
    const [reason, setReason] = useState("");
    const [confirm, setConfirm] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<ApiFailure | null>(null);
    const [result, setResult] = useState<AccountDeletionResult | null>(null);

    // The form's buttons disappear with the result: move focus to it.
    useEffect(() => {
        if (result) resultRef.current?.focus();
    }, [result]);

    const confirmed = confirm.trim().toLowerCase() === user.email;
    const ready = scope !== null && reason.trim().length > 0 && reason.length <= SUSPEND_REASON_MAX && confirmed;

    const submit = async () => {
        if (!scope || busy) return;
        setBusy(true);
        setError(null);
        const response = await adminPost<AccountDeletionResult>("/api/admin/users", {
            action: "deleteData",
            email: user.email,
            scope,
            confirm: confirm.trim(),
            reason: reason.trim(),
        });
        setBusy(false);
        if (!response.ok) {
            setError(response);
            return;
        }
        setResult(response.data);
        onDeleted(response.data);
    };
    const close = () => {
        if (!busy) onClose(result !== null);
    };

    return (
        <Dialog
            open={open}
            onClose={close}
            busy={busy}
            icon={Trash2}
            tone="danger"
            title={tx({ TR: "Kullanıcı verilerini sil", EN: "Delete user data" })}
            description={tx({ TR: "{email} için kalıcı silme. Bu işlem geri alınamaz.", EN: "Permanent deletion for {email}. This can't be undone." }, { email: user.email })}
            footer={result ? (
                <>
                    {result.errors.length ? <Button variant="secondary" icon={RotateCcw} busy={busy} onClick={() => void submit()}>{tx({ TR: "Kalanları tekrar dene", EN: "Retry the rest" })}</Button> : null}
                    <Button variant="primary" onClick={close} disabled={busy}>{tx(COMMON.close)}</Button>
                </>
            ) : (
                <>
                    {/* Destructive dialogs start on "Cancel". */}
                    <Button variant="ghost" onClick={close} disabled={busy} data-autofocus>{tx(COMMON.cancel)}</Button>
                    <Button variant="danger" icon={Trash2} busy={busy} disabled={!ready} onClick={() => void submit()}>{tx({ TR: "Kalıcı olarak sil", EN: "Delete permanently" })}</Button>
                </>
            )}
        >
            {result ? (
                <div ref={resultRef} tabIndex={-1} className="outline-none">
                    <DeletionResultView result={result} />
                    {busy ? <Spinner className="mt-4" label={tx({ TR: "Tekrar deneniyor…", EN: "Retrying…" })} /> : null}
                    {error ? <ErrorNotice error={error} className="mt-4" /> : null}
                </div>
            ) : (
                <div className="space-y-4">
                    <fieldset disabled={busy}>
                        <legend className="mb-2 text-[13px] font-bold text-zinc-700 dark:text-zinc-200">{tx({ TR: "Ne silinsin?", EN: "What should be deleted?" })}</legend>
                        <div className="space-y-2">
                            {SCOPE_OPTIONS.map((option) => {
                                const checked = scope === option.scope;
                                return (
                                    <label
                                        key={option.scope}
                                        className={cx(
                                            "flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition",
                                            checked
                                                ? option.scope === "all" ? "border-red-500 bg-red-50/70 dark:border-red-400/60 dark:bg-red-500/10" : "border-amber-500 bg-amber-50/70 dark:border-amber-400/60 dark:bg-amber-500/10"
                                                : "border-zinc-200 hover:border-zinc-300 dark:border-white/10 dark:hover:border-white/20",
                                        )}
                                    >
                                        <input
                                            type="radio"
                                            name="delete-data-scope"
                                            value={option.scope}
                                            checked={checked}
                                            onChange={() => setScope(option.scope)}
                                            className={cx("mt-1 h-4 w-4", option.scope === "all" ? "accent-red-600" : "accent-amber-600", FOCUS_RING)}
                                        />
                                        <span className="min-w-0">
                                            <span className="block text-sm font-bold">{tx(option.title)}</span>
                                            <span className="mt-0.5 block text-[12px] text-zinc-500">{tx(option.description)}</span>
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                    </fieldset>
                    {scope ? (
                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-3.5 text-[12.5px] dark:border-white/10 dark:bg-white/[0.03]">
                            <p className="font-bold text-zinc-700 dark:text-zinc-200">{tx({ TR: "Silinecekler", EN: "What will be deleted" })}</p>
                            <ul className="mt-1.5 list-disc space-y-1 ps-5 text-zinc-600 dark:text-zinc-300">
                                {SCOPE_DETAILS[scope].deleted.map((line) => <li key={line.EN}>{tx(line)}</li>)}
                            </ul>
                            <p className="mt-2 text-zinc-500">{tx(SCOPE_DETAILS[scope].note)}</p>
                        </div>
                    ) : null}
                    <TextArea
                        label={tx({ TR: "Gerekçe", EN: "Reason" })}
                        value={reason}
                        onChange={setReason}
                        max={SUSPEND_REASON_MAX}
                        rows={2}
                        disabled={busy}
                        placeholder={tx({ TR: "Örn. kullanıcının e-postayla gelen silme talebi", EN: "e.g. deletion request the user sent by e-mail" })}
                        hint={tx({ TR: "Zorunlu; denetim kaydına yazılır.", EN: "Required; written to the audit log." })}
                    />
                    <div>
                        <label htmlFor={confirmId} className="mb-1.5 block text-[13px] font-bold text-zinc-700 dark:text-zinc-200">
                            {tx({ TR: "Onaylamak için e-posta adresini yazın", EN: "Type the e-mail address to confirm" })}
                        </label>
                        <input
                            id={confirmId}
                            type="text"
                            inputMode="email"
                            autoComplete="off"
                            autoCapitalize="none"
                            spellCheck={false}
                            dir="ltr"
                            value={confirm}
                            maxLength={254}
                            disabled={busy}
                            onChange={(event) => setConfirm(event.target.value)}
                            aria-describedby={confirmHintId}
                            aria-invalid={confirm.trim() && !confirmed ? true : undefined}
                            className={cx(INPUT_CLASS, "h-10 font-mono")}
                        />
                        <p id={confirmHintId} className="mt-1 break-all text-[11px] text-zinc-500">
                            {tx({ TR: "Tam olarak şunu yazın: {email}", EN: "Type exactly: {email}" }, { email: user.email })}
                        </p>
                    </div>
                    {busy ? <Spinner label={tx({ TR: "Veriler siliniyor… Bu bir dakika kadar sürebilir.", EN: "Deleting data… This can take up to a minute." })} /> : null}
                    {error ? <ErrorNotice error={error} /> : null}
                </div>
            )}
        </Dialog>
    );
}

export default function UsersSection({ selfEmail }: { selfEmail: string }) {
    const { tx } = useI18n();
    const toast = useToast();
    const errorText = useErrorText();
    const [query, setQuery] = useState("");
    const debounced = useDebouncedValue(query.trim(), 350);
    const path = `/api/admin/users?query=${encodeURIComponent(debounced)}`;
    const users = useAdminResource<AdminUsersResponse>(path);
    const [loadingMore, setLoadingMore] = useState(false);
    const [moreError, setMoreError] = useState<ApiFailure | null>(null);
    const [dialog, setDialog] = useState<DialogState | null>(null);
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState<ApiFailure | null>(null);
    // `session` remounts the delete dialog (fresh form) each time it opens; the
    // target stays set after closing so the closing animation keeps its content.
    const [deleteTarget, setDeleteTarget] = useState<{ user: AdminUser; session: number } | null>(null);
    const [deleteOpen, setDeleteOpen] = useState(false);

    const openDialog = (next: DialogState) => {
        setDialog(next);
        setReason("");
        setActionError(null);
    };
    const closeDialog = () => {
        if (!busy) setDialog(null);
    };
    const openDeleteData = (user: AdminUser) => {
        setDeleteTarget((current) => ({ user, session: (current?.session ?? 0) + 1 }));
        setDeleteOpen(true);
    };
    const onDataDeleted = (result: AccountDeletionResult) => {
        if (result.accountDeleted) {
            users.mutate((current) => ({ ...current, users: current.users.filter((user) => user.email !== result.email) }));
        }
        toast(result.errors.length ? "error" : "success", result.errors.length
            ? tx({ TR: "{email}: bazı veriler silinemedi.", EN: "{email}: some data couldn't be deleted." }, { email: result.email })
            : tx({ TR: "{email}: veriler silindi.", EN: "{email}: data deleted." }, { email: result.email }));
    };
    const closeDeleteData = (ran: boolean) => {
        setDeleteOpen(false);
        if (ran) users.reload();
    };

    const loadMore = async () => {
        const cursor = users.data?.nextCursor;
        if (!cursor) return;
        const forKey = users.dataKey;
        setLoadingMore(true);
        setMoreError(null);
        const result = await adminRequest<AdminUsersResponse>(`${path}&cursor=${encodeURIComponent(cursor)}`);
        setLoadingMore(false);
        if (!result.ok) {
            setMoreError(result);
            return;
        }
        users.mutate((current) => ({
            ...result.data,
            users: [...current.users, ...result.data.users.filter((user) => !current.users.some((existing) => existing.email === user.email))],
        }), forKey);
    };

    const submit = async () => {
        if (!dialog) return;
        setBusy(true);
        setActionError(null);
        const body: Record<string, unknown> = dialog.kind === "role"
            ? { action: "setRole", email: dialog.user.email, role: dialog.role }
            : { action: dialog.kind, email: dialog.user.email };
        if (reason.trim()) body.reason = reason.trim();
        const result = await adminPost<AdminUserActionResponse>("/api/admin/users", body);
        setBusy(false);
        if (!result.ok) {
            setActionError(result);
            return;
        }
        const updated = result.data.user;
        users.mutate((current) => ({ ...current, users: current.users.map((user) => (user.email === updated.email ? updated : user)) }));
        setDialog(null);
        if (dialog.kind === "suspend") {
            toast("success", result.data.sessionsRevoked
                ? tx({ TR: "{email} askıya alındı ve oturumları kapatıldı.", EN: "{email} was suspended and signed out." }, { email: updated.email })
                : tx({ TR: "{email} askıya alındı.", EN: "{email} was suspended." }, { email: updated.email }));
        } else if (dialog.kind === "unsuspend") {
            toast("success", tx({ TR: "{email} yeniden etkin.", EN: "{email} is active again." }, { email: updated.email }));
        } else if (dialog.kind === "reset2fa") {
            toast("success", tx({ TR: "{email} için iki adımlı doğrulama kapatıldı.", EN: "Two-step verification was turned off for {email}." }, { email: updated.email }));
        } else {
            toast("success", tx({ TR: "{email} artık {role} rolünde.", EN: "{email} now has the {role} role." }, { email: updated.email, role: tx(ROLE_COPY[updated.role]) }));
        }
    };

    const list = users.data?.users ?? [];
    const mode = users.data?.mode ?? "recent";
    const roleChanged = dialog?.kind === "role" && dialog.role !== assignableRole(dialog.user);

    return (
        <div>
            <SectionHeader
                title={tx({ TR: "Kullanıcılar", EN: "Users" })}
                description={tx({ TR: "Hesapları bulun, askıya alın, ekip rollerini yönetin veya verilerini silin.", EN: "Find accounts, suspend them, manage staff roles or delete their data." })}
                actions={<Button size="sm" icon={RefreshCw} busy={users.loading && Boolean(users.data)} onClick={users.reload}>{tx(COMMON.refresh)}</Button>}
            />
            <Panel bodyClassName="p-0">
                <div className="flex flex-col gap-2 border-b border-zinc-100 p-4 sm:flex-row sm:items-center dark:border-white/[0.06]">
                    <SearchInput
                        value={query}
                        onChange={setQuery}
                        className="flex-1"
                        label={tx({ TR: "Kullanıcı ara", EN: "Search users" })}
                        placeholder={tx({ TR: "Tam e-posta adresi veya kullanıcı adının başı…", EN: "Exact e-mail address or start of a username…" })}
                    />
                    <p className="text-[12px] text-zinc-500 sm:w-56">
                        {mode === "recent"
                            ? tx({ TR: "Arama yoksa en yeni hesaplar listelenir.", EN: "Without a search, the newest accounts are listed." })
                            : mode === "email"
                                ? tx({ TR: "E-posta ile tam eşleşme gösteriliyor.", EN: "Showing the exact e-mail match." })
                                : tx({ TR: "Kullanıcı adı ile başlayan hesaplar.", EN: "Accounts whose username starts with your search." })}
                    </p>
                </div>

                {users.error ? <ErrorNotice error={users.error} onRetry={users.reload} className="m-4" /> : null}

                {!users.data && users.loading ? (
                    <LoadingRows rows={6} className="p-4" />
                ) : list.length === 0 && !users.loading ? (
                    <div className="p-4">
                        <EmptyState
                            icon={Users}
                            title={debounced ? tx({ TR: "Eşleşen kullanıcı yok", EN: "No matching users" }) : tx({ TR: "Henüz kullanıcı yok", EN: "No users yet" })}
                            description={debounced ? tx({ TR: "E-posta adresinin tamamını veya kullanıcı adının ilk harflerini deneyin.", EN: "Try the full e-mail address or the first letters of the username." }) : undefined}
                            action={debounced ? <Button size="sm" onClick={() => setQuery("")}>{tx(COMMON.clearFilters)}</Button> : undefined}
                        />
                    </div>
                ) : (
                    <>
                        <div className="hidden grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] gap-3 border-b border-zinc-100 bg-zinc-50/60 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-zinc-500 md:grid dark:border-white/[0.06] dark:bg-white/[0.02]">
                            <span>{tx({ TR: "Kullanıcı", EN: "User" })}</span>
                            <span>{tx({ TR: "Rol", EN: "Role" })}</span>
                            <span>{tx({ TR: "Durum", EN: "Status" })}</span>
                            <span className="text-end">{tx({ TR: "İşlemler", EN: "Actions" })}</span>
                        </div>
                        <motion.ul
                            initial={{ opacity: 0 }}
                            animate={{ opacity: users.loading ? 0.6 : 1 }}
                            className="divide-y divide-zinc-100 dark:divide-white/[0.06]"
                            aria-busy={users.loading || undefined}
                        >
                            {list.map((user) => <UserRow key={user.email} user={user} self={user.email === selfEmail} onAction={openDialog} onDeleteData={openDeleteData} />)}
                        </motion.ul>
                        {users.data?.nextCursor || moreError ? (
                            <div className="flex flex-col items-center gap-2 border-t border-zinc-100 p-4 dark:border-white/[0.06]">
                                {moreError ? <p className="text-sm text-red-600 dark:text-red-400" role="alert">{errorText(moreError)}</p> : null}
                                {users.data?.nextCursor ? <Button size="sm" busy={loadingMore} onClick={() => void loadMore()}>{tx(COMMON.loadMore)}</Button> : null}
                            </div>
                        ) : null}
                    </>
                )}
            </Panel>

            {deleteTarget ? (
                <DeleteDataDialog key={deleteTarget.session} open={deleteOpen} user={deleteTarget.user} onClose={closeDeleteData} onDeleted={onDataDeleted} />
            ) : null}

            <ConfirmDialog
                open={dialog?.kind === "suspend"}
                onClose={closeDialog}
                onConfirm={() => void submit()}
                busy={busy}
                error={actionError}
                icon={Ban}
                tone="danger"
                title={tx({ TR: "Hesap askıya alınsın mı?", EN: "Suspend this account?" })}
                description={dialog ? tx({ TR: "{email} giriş yapamaz ve açık oturumları kapatılır. İçerikleri silinmez; askıyı daha sonra kaldırabilirsiniz.", EN: "{email} won't be able to sign in and open sessions are ended. Their content isn't deleted; you can lift the suspension later." }, { email: dialog.user.email }) : undefined}
                confirmLabel={tx({ TR: "Askıya al", EN: "Suspend" })}
                confirmDisabled={reason.length > SUSPEND_REASON_MAX}
            >
                <TextArea
                    label={tx({ TR: "Gerekçe", EN: "Reason" })}
                    optional
                    value={reason}
                    onChange={setReason}
                    max={SUSPEND_REASON_MAX}
                    autoFocus
                    placeholder={tx({ TR: "Örn. tekrarlanan spam paylaşımları", EN: "e.g. repeated spam posts" })}
                    hint={tx({ TR: "Yalnızca ekip görür; denetim kaydına yazılır.", EN: "Only staff can see it; it goes to the audit log." })}
                />
            </ConfirmDialog>

            <ConfirmDialog
                open={dialog?.kind === "unsuspend"}
                onClose={closeDialog}
                onConfirm={() => void submit()}
                busy={busy}
                error={actionError}
                icon={UserCheck}
                tone="success"
                title={tx({ TR: "Askı kaldırılsın mı?", EN: "Lift the suspension?" })}
                description={dialog ? tx({ TR: "{email} yeniden giriş yapabilir ve platformu kullanabilir.", EN: "{email} will be able to sign in and use the platform again." }, { email: dialog.user.email }) : undefined}
                confirmLabel={tx({ TR: "Askıyı kaldır", EN: "Unsuspend" })}
                confirmDisabled={reason.length > SUSPEND_REASON_MAX}
            >
                <TextArea
                    label={tx({ TR: "Not", EN: "Note" })}
                    optional
                    value={reason}
                    onChange={setReason}
                    max={SUSPEND_REASON_MAX}
                    rows={2}
                    hint={tx({ TR: "Denetim kaydına yazılır.", EN: "Written to the audit log." })}
                />
            </ConfirmDialog>

            <ConfirmDialog
                open={dialog?.kind === "reset2fa"}
                onClose={closeDialog}
                onConfirm={() => void submit()}
                busy={busy}
                error={actionError}
                icon={ShieldOff}
                tone="danger"
                title={tx({ TR: "İki adımlı doğrulama sıfırlansın mı?", EN: "Reset two-step verification?" })}
                description={dialog ? tx({ TR: "{email} yalnızca şifresiyle giriş yapabilecek. Bunu yalnızca kimliğini başka bir yolla doğruladığınız, doğrulama uygulamasını ve kurtarma kodlarını kaybetmiş kişiler için yapın.", EN: "{email} will be able to sign in with just the password. Only do this for people who lost their authenticator and recovery codes and whose identity you verified another way." }, { email: dialog.user.email }) : undefined}
                confirmLabel={tx({ TR: "Sıfırla", EN: "Reset" })}
                confirmDisabled={!reason.trim() || reason.length > SUSPEND_REASON_MAX}
            >
                <TextArea
                    label={tx({ TR: "Gerekçe", EN: "Reason" })}
                    value={reason}
                    onChange={setReason}
                    max={SUSPEND_REASON_MAX}
                    rows={2}
                    autoFocus
                    placeholder={tx({ TR: "Örn. destek talebi #123, kimlik e-postayla doğrulandı", EN: "e.g. support ticket #123, identity verified by e-mail" })}
                    hint={tx({ TR: "Zorunlu; denetim kaydına yazılır.", EN: "Required; written to the audit log." })}
                />
            </ConfirmDialog>

            <ConfirmDialog
                open={dialog?.kind === "role"}
                onClose={closeDialog}
                onConfirm={() => void submit()}
                busy={busy}
                error={actionError}
                icon={KeyRound}
                tone="default"
                title={tx({ TR: "Rolü değiştir", EN: "Change role" })}
                description={dialog ? tx({ TR: "{email} için ekip rolünü seçin.", EN: "Choose the staff role for {email}." }, { email: dialog.user.email }) : undefined}
                confirmLabel={tx({ TR: "Rolü kaydet", EN: "Save role" })}
                confirmDisabled={!roleChanged || reason.length > SUSPEND_REASON_MAX}
            >
                {dialog?.kind === "role" ? (
                    <div className="space-y-4">
                        <fieldset>
                            <legend className="sr-only">{tx({ TR: "Rol", EN: "Role" })}</legend>
                            <div className="space-y-2">
                                {dialog.user.assignableRoles.map((role) => {
                                    const checked = dialog.role === role;
                                    return (
                                        <label
                                            key={role}
                                            className={cx(
                                                "flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition",
                                                checked ? "border-indigo-500 bg-indigo-50/70 dark:border-indigo-400/60 dark:bg-indigo-500/10" : "border-zinc-200 hover:border-zinc-300 dark:border-white/10 dark:hover:border-white/20",
                                            )}
                                        >
                                            <input
                                                type="radio"
                                                name="admin-role"
                                                value={role}
                                                checked={checked}
                                                onChange={() => setDialog({ ...dialog, role })}
                                                className={cx("mt-1 h-4 w-4 accent-indigo-600", FOCUS_RING)}
                                            />
                                            <span className="min-w-0">
                                                <span className="flex items-center gap-2 text-sm font-bold">
                                                    {tx(ROLE_COPY[role])}
                                                    {assignableRole(dialog.user) === role ? <Badge tone="zinc">{tx({ TR: "Mevcut", EN: "Current" })}</Badge> : null}
                                                </span>
                                                <span className="mt-0.5 block text-[12px] text-zinc-500">{tx(ROLE_DESCRIPTION_COPY[role])}</span>
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                        </fieldset>
                        <TextArea
                            label={tx({ TR: "Not", EN: "Note" })}
                            optional
                            value={reason}
                            onChange={setReason}
                            max={SUSPEND_REASON_MAX}
                            rows={2}
                            hint={tx({ TR: "Denetim kaydına yazılır.", EN: "Written to the audit log." })}
                        />
                    </div>
                ) : null}
            </ConfirmDialog>
        </div>
    );
}
