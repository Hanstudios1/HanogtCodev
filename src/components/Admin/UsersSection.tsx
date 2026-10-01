"use client";

import { motion } from "framer-motion";
import { Ban, Crown, KeyRound, Lock, RefreshCw, ShieldCheck, UserCheck, UserCog, Users } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { adminPost, adminRequest, type ApiFailure } from "./api";
import { COMMON, ROLE_COPY, ROLE_DESCRIPTION_COPY } from "./copy";
import { useAdminResource, useDebouncedValue } from "./hooks";
import {
    SUSPEND_REASON_MAX,
    type AdminUser,
    type AdminUserActionResponse,
    type AdminUsersResponse,
    type AssignableRole,
    type UserRole,
} from "./types";
import {
    Avatar, Badge, Button, ConfirmDialog, EmptyState, ErrorNotice, FOCUS_RING, LoadingRows, Panel, RelativeTime, SearchInput, SectionHeader, TextArea,
    cx, useErrorText, useToast,
} from "./ui";
import { ROLE_TONES } from "./tones";

type DialogState =
    | { kind: "suspend" | "unsuspend"; user: AdminUser }
    | { kind: "role"; user: AdminUser; role: AssignableRole };

/** The stored role as it appears among the assignable ones ("user" when none). */
function assignableRole(user: AdminUser): AssignableRole {
    return user.role === "admin" || user.role === "moderator" ? user.role : "user";
}

export function RoleBadge({ role }: { role: UserRole }) {
    const { tx } = useI18n();
    return <Badge tone={ROLE_TONES[role]} icon={role === "owner" ? Crown : role === "user" ? undefined : ShieldCheck}>{tx(ROLE_COPY[role])}</Badge>;
}

function UserRow({ user, self, onAction }: { user: AdminUser; self: boolean; onAction: (dialog: DialogState) => void }) {
    const { tx } = useI18n();
    const name = user.username || user.nickname || user.email.split("@")[0];
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
                        <p>{tx({ TR: "Katıldı", EN: "Joined" })}: <RelativeTime iso={user.createdAt} className="font-semibold text-zinc-700 dark:text-zinc-300" /></p>
                        <p>{tx({ TR: "Son görülme", EN: "Last seen" })}: <RelativeTime iso={user.lastSeenAt ?? user.lastLoginAt} className="font-semibold text-zinc-700 dark:text-zinc-300" /></p>
                    </div>
                )}
            </div>
            <div className="flex flex-wrap items-center gap-2 md:justify-end">
                {user.isOwner ? (
                    <span className="inline-flex items-center gap-1 text-[12px] text-zinc-400"><Lock className="h-3.5 w-3.5" aria-hidden="true" />{tx({ TR: "Ortam değişkeniyle korunuyor", EN: "Protected by environment" })}</span>
                ) : null}
                {user.assignableRoles.length ? (
                    <Button size="sm" icon={UserCog} onClick={() => onAction({ kind: "role", user, role: assignableRole(user) })}>{tx({ TR: "Rol", EN: "Role" })}</Button>
                ) : null}
                {user.canSuspend ? (
                    user.suspended
                        ? <Button size="sm" variant="success" icon={UserCheck} onClick={() => onAction({ kind: "unsuspend", user })}>{tx({ TR: "Askıyı kaldır", EN: "Unsuspend" })}</Button>
                        : <Button size="sm" variant="ghost" icon={Ban} className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10" onClick={() => onAction({ kind: "suspend", user })}>{tx({ TR: "Askıya al", EN: "Suspend" })}</Button>
                ) : null}
            </div>
        </li>
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

    const openDialog = (next: DialogState) => {
        setDialog(next);
        setReason("");
        setActionError(null);
    };
    const closeDialog = () => {
        if (!busy) setDialog(null);
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
                description={tx({ TR: "Hesapları bulun, askıya alın veya ekip rollerini yönetin.", EN: "Find accounts, suspend them or manage staff roles." })}
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
                            {list.map((user) => <UserRow key={user.email} user={user} self={user.email === selfEmail} onAction={openDialog} />)}
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
