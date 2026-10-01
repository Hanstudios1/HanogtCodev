"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock, Megaphone, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { useId, useState } from "react";
import { AnnouncementBar } from "@/components/AnnouncementBanner";
import { useI18n, type Copy } from "@/lib/i18n";
import { adminPost, type ApiFailure } from "./api";
import { COMMON, LEVEL_COPY } from "./copy";
import { formatDateTime, useAdminResource, useNow } from "./hooks";
import {
    ANNOUNCEMENT_LEVELS,
    ANNOUNCEMENT_LINK_MAX,
    ANNOUNCEMENT_TEXT_MAX,
    MAX_ACTIVE_ANNOUNCEMENTS,
    isSafeAnnouncementLink,
    type AdminAnnouncement,
    type AdminAnnouncementActionResponse,
    type AdminAnnouncementsResponse,
    type AnnouncementLevel,
} from "./types";
import {
    Badge, Button, ConfirmDialog, Dialog, EmptyState, ErrorNotice, IconButton, INPUT_CLASS, LoadingRows, Notice, RelativeTime, SectionHeader,
    Switch, TextArea, cx, useErrorText, useToast, type Tone,
} from "./ui";

type Lifecycle = "live" | "scheduled" | "expired" | "inactive";

const LIFECYCLE: Record<Lifecycle, { tone: Tone; label: Copy }> = {
    live: { tone: "emerald", label: { TR: "Yayında", EN: "Live" } },
    scheduled: { tone: "sky", label: { TR: "Planlandı", EN: "Scheduled" } },
    expired: { tone: "zinc", label: { TR: "Süresi doldu", EN: "Expired" } },
    inactive: { tone: "zinc", label: { TR: "Kapalı", EN: "Off" } },
};

const LEVEL_DOTS: Record<AnnouncementLevel, string> = { info: "bg-indigo-500", success: "bg-emerald-500", warning: "bg-amber-500", danger: "bg-red-500" };

function lifecycle(announcement: AdminAnnouncement, now: number): Lifecycle {
    const start = announcement.startsAt ? Date.parse(announcement.startsAt) : null;
    const end = announcement.endsAt ? Date.parse(announcement.endsAt) : null;
    if (end !== null && end <= now) return "expired";
    if (!announcement.active) return "inactive";
    if (start !== null && start > now) return "scheduled";
    return "live";
}

/** Same rule as the server: active and not yet ended (scheduled ones included). */
function occupiesSlot(announcement: AdminAnnouncement, now: number) {
    return announcement.active && (!announcement.endsAt || Date.parse(announcement.endsAt) > now);
}

/** ISO → value for <input type="datetime-local"> in the viewer's time zone. */
function toLocalInput(iso: string | null) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function fromLocalInput(value: string) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

type Draft = { id: string | null; tr: string; en: string; level: AnnouncementLevel; link: string; active: boolean; startsAt: string; endsAt: string };

function draftFrom(announcement: AdminAnnouncement | null): Draft {
    return announcement
        ? {
            id: announcement.id,
            tr: announcement.text.TR,
            en: announcement.text.EN,
            level: announcement.level,
            link: announcement.link ?? "",
            active: announcement.active,
            startsAt: toLocalInput(announcement.startsAt),
            endsAt: toLocalInput(announcement.endsAt),
        }
        : { id: null, tr: "", en: "", level: "info", link: "", active: true, startsAt: "", endsAt: "" };
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
    const { tx } = useI18n();
    const id = useId();
    return (
        <div>
            <label htmlFor={id} className="mb-1.5 block text-[13px] font-bold text-zinc-700 dark:text-zinc-200">
                {label}
                <span className="ms-1 font-normal text-zinc-400">{tx(COMMON.optional)}</span>
            </label>
            <div className="flex items-center gap-1.5">
                <input id={id} type="datetime-local" value={value} onChange={(event) => onChange(event.target.value)} className={cx(INPUT_CLASS, "h-10")} />
                {value ? <IconButton label={tx({ TR: "Tarihi temizle", EN: "Clear date" })} icon={X} onClick={() => onChange("")} /> : null}
            </div>
        </div>
    );
}

function AnnouncementEditor({ draft, onChange, onClose, onSaved }: {
    draft: Draft;
    onChange: (draft: Draft) => void;
    onClose: () => void;
    onSaved: (announcement: AdminAnnouncement, created: boolean) => void;
}) {
    const { tx } = useI18n();
    const linkId = useId();
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<ApiFailure | null>(null);
    const now = useNow();

    const link = draft.link.trim();
    const linkValid = !link || isSafeAnnouncementLink(link);
    const start = fromLocalInput(draft.startsAt);
    const end = fromLocalInput(draft.endsAt);
    const rangeValid = !start || !end || Date.parse(end) > Date.parse(start);
    const endValid = !draft.active || !end || Date.parse(end) > now;
    const textsValid = Boolean(draft.tr.trim() && draft.en.trim()) && draft.tr.length <= ANNOUNCEMENT_TEXT_MAX && draft.en.length <= ANNOUNCEMENT_TEXT_MAX;
    const valid = textsValid && linkValid && rangeValid && endValid;
    const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });

    const save = async () => {
        if (!valid) return;
        setSaving(true);
        setError(null);
        const result = await adminPost<AdminAnnouncementActionResponse>("/api/admin/announcements", {
            action: draft.id ? "update" : "create",
            ...(draft.id ? { id: draft.id } : {}),
            text: { TR: draft.tr.trim(), EN: draft.en.trim() },
            level: draft.level,
            link: link || null,
            active: draft.active,
            startsAt: start,
            endsAt: end,
        });
        setSaving(false);
        if (!result.ok) {
            setError(result);
            return;
        }
        if (result.data.announcement) onSaved(result.data.announcement, !draft.id);
    };

    return (
        <Dialog
            open
            onClose={onClose}
            busy={saving}
            size="lg"
            icon={Megaphone}
            title={draft.id ? tx({ TR: "Duyuruyu düzenle", EN: "Edit announcement" }) : tx({ TR: "Yeni duyuru", EN: "New announcement" })}
            description={tx({ TR: "Duyurular sitede ince bir çubuk olarak görünür; değişiklikler en geç bir dakika içinde yayılır.", EN: "Announcements appear as a slim bar across the site; changes spread within about a minute." })}
            footer={(
                <>
                    <Button variant="ghost" onClick={onClose} disabled={saving}>{tx(COMMON.cancel)}</Button>
                    <Button variant="primary" busy={saving} disabled={!valid} onClick={() => void save()}>{tx(COMMON.save)}</Button>
                </>
            )}
        >
            <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                    <TextArea label={tx({ TR: "Türkçe metin", EN: "Turkish text" })} value={draft.tr} onChange={(tr) => set({ tr })} max={ANNOUNCEMENT_TEXT_MAX} rows={3} autoFocus placeholder={tx({ TR: "Duyurunun Türkçe metni", EN: "The Turkish text of the announcement" })} />
                    <TextArea label={tx({ TR: "İngilizce metin", EN: "English text" })} value={draft.en} onChange={(en) => set({ en })} max={ANNOUNCEMENT_TEXT_MAX} rows={3} placeholder={tx({ TR: "Duyurunun İngilizce metni", EN: "The English text of the announcement" })} hint={tx({ TR: "Türkçe dışındaki tüm diller bu metni görür.", EN: "Every language other than Turkish sees this text." })} />
                </div>

                <fieldset>
                    <legend className="mb-1.5 text-[13px] font-bold text-zinc-700 dark:text-zinc-200">{tx({ TR: "Seviye", EN: "Level" })}</legend>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {ANNOUNCEMENT_LEVELS.map((level) => (
                            <label
                                key={level}
                                className={cx(
                                    "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-[13px] font-bold transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500",
                                    draft.level === level ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900" : "border-zinc-200 hover:border-zinc-300 dark:border-white/10 dark:hover:border-white/20",
                                )}
                            >
                                <input type="radio" name="announcement-level" value={level} checked={draft.level === level} onChange={() => set({ level })} className="sr-only" />
                                <span className={cx("h-2.5 w-2.5 rounded-full", LEVEL_DOTS[level])} aria-hidden="true" />
                                {tx(LEVEL_COPY[level])}
                            </label>
                        ))}
                    </div>
                </fieldset>

                <div>
                    <label htmlFor={linkId} className="mb-1.5 block text-[13px] font-bold text-zinc-700 dark:text-zinc-200">
                        {tx({ TR: "Bağlantı", EN: "Link" })}
                        <span className="ms-1 font-normal text-zinc-400">{tx(COMMON.optional)}</span>
                    </label>
                    <input
                        id={linkId}
                        value={draft.link}
                        maxLength={ANNOUNCEMENT_LINK_MAX}
                        onChange={(event) => set({ link: event.target.value })}
                        placeholder="/news  ·  https://…"
                        dir="ltr"
                        aria-invalid={!linkValid || undefined}
                        className={cx(INPUT_CLASS, "h-10", !linkValid && "border-red-400 focus:border-red-500 focus:ring-red-500/20")}
                    />
                    <p className={cx("mt-1 text-[11px]", linkValid ? "text-zinc-500" : "font-semibold text-red-500")}>
                        {tx({ TR: "Site içi yol (/ ile başlar) veya https adresi.", EN: "An in-site path (starting with /) or an https address." })}
                    </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <DateField label={tx({ TR: "Başlangıç", EN: "Starts" })} value={draft.startsAt} onChange={(startsAt) => set({ startsAt })} />
                    <DateField label={tx({ TR: "Bitiş", EN: "Ends" })} value={draft.endsAt} onChange={(endsAt) => set({ endsAt })} />
                </div>
                {!rangeValid || !endValid ? (
                    <Notice tone="warning">
                        {!rangeValid
                            ? tx({ TR: "Bitiş tarihi başlangıçtan sonra olmalı.", EN: "The end must be after the start." })
                            : tx({ TR: "Etkin bir duyurunun bitiş tarihi gelecekte olmalı.", EN: "An active announcement must end in the future." })}
                    </Notice>
                ) : null}

                <div className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 px-4 py-3 dark:border-white/10">
                    <div>
                        <p className="text-sm font-bold">{tx({ TR: "Etkin", EN: "Active" })}</p>
                        <p className="text-[12px] text-zinc-500">{tx({ TR: "Kapalı duyurular saklanır ama gösterilmez.", EN: "Inactive announcements are kept but not shown." })}</p>
                    </div>
                    <Switch checked={draft.active} onChange={(active) => set({ active })} label={tx({ TR: "Etkin", EN: "Active" })} />
                </div>

                <div className="space-y-2 rounded-2xl bg-zinc-100/80 p-4 dark:bg-white/[0.04]">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">{tx({ TR: "Önizleme", EN: "Preview" })}</p>
                    <p className="text-[11px] text-zinc-500">{tx({ TR: "Türkçe", EN: "Turkish" })}</p>
                    <AnnouncementBar level={draft.level} text={draft.tr.trim() || "…"} link={linkValid && link ? link : null} decorativeDismiss />
                    <p className="pt-1 text-[11px] text-zinc-500">{tx({ TR: "İngilizce", EN: "English" })}</p>
                    <AnnouncementBar level={draft.level} text={draft.en.trim() || "…"} link={linkValid && link ? link : null} decorativeDismiss />
                </div>

                {error ? <ErrorNotice error={error} /> : null}
            </div>
        </Dialog>
    );
}

export default function AnnouncementsSection() {
    const { tx, language, locale } = useI18n();
    const toast = useToast();
    const errorText = useErrorText();
    const now = useNow();
    const announcements = useAdminResource<AdminAnnouncementsResponse>("/api/admin/announcements");
    const [draft, setDraft] = useState<Draft | null>(null);
    const [toggling, setToggling] = useState<readonly string[]>([]);
    const [deleteTarget, setDeleteTarget] = useState<AdminAnnouncement | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<ApiFailure | null>(null);

    const list = announcements.data?.announcements ?? [];
    const maxActive = announcements.data?.maxActive ?? MAX_ACTIVE_ANNOUNCEMENTS;
    const used = list.filter((item) => occupiesSlot(item, now)).length;

    const replace = (next: AdminAnnouncement) => announcements.mutate((current) => ({
        ...current,
        announcements: current.announcements.map((item) => (item.id === next.id ? next : item)),
    }));

    const toggle = async (item: AdminAnnouncement, active: boolean) => {
        setToggling((ids) => [...ids, item.id]);
        replace({ ...item, active });
        const result = await adminPost<AdminAnnouncementActionResponse>("/api/admin/announcements", { action: "setActive", id: item.id, active });
        setToggling((ids) => ids.filter((id) => id !== item.id));
        if (!result.ok) {
            replace(item);
            toast("error", errorText(result));
            return;
        }
        if (result.data.announcement) replace(result.data.announcement);
        toast("success", active ? tx({ TR: "Duyuru açıldı.", EN: "Announcement switched on." }) : tx({ TR: "Duyuru kapatıldı.", EN: "Announcement switched off." }));
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        setDeleteError(null);
        const result = await adminPost<AdminAnnouncementActionResponse>("/api/admin/announcements", { action: "delete", id: deleteTarget.id });
        setDeleting(false);
        if (!result.ok && result.code !== "not_found") {
            setDeleteError(result);
            return;
        }
        const removedId = deleteTarget.id;
        announcements.mutate((current) => ({ ...current, announcements: current.announcements.filter((item) => item.id !== removedId) }));
        setDeleteTarget(null);
        toast("success", tx({ TR: "Duyuru silindi.", EN: "Announcement deleted." }));
    };

    const saved = (announcement: AdminAnnouncement, created: boolean) => {
        announcements.mutate((current) => ({
            ...current,
            announcements: created
                ? [announcement, ...current.announcements]
                : current.announcements.map((item) => (item.id === announcement.id ? announcement : item)),
        }));
        setDraft(null);
        toast("success", created ? tx({ TR: "Duyuru oluşturuldu.", EN: "Announcement created." }) : tx({ TR: "Duyuru güncellendi.", EN: "Announcement updated." }));
    };

    return (
        <div>
            <SectionHeader
                title={tx({ TR: "Duyurular", EN: "Announcements" })}
                description={tx({ TR: "Tüm ziyaretçilere gösterilen site geneli bildirim çubuğu.", EN: "The site-wide notice bar shown to every visitor." })}
                actions={(
                    <>
                        <Button size="sm" icon={RefreshCw} busy={announcements.loading && Boolean(announcements.data)} onClick={announcements.reload}>{tx(COMMON.refresh)}</Button>
                        <Button size="sm" variant="primary" icon={Plus} onClick={() => setDraft(draftFrom(null))}>{tx({ TR: "Yeni duyuru", EN: "New announcement" })}</Button>
                    </>
                )}
            />

            <div className="mb-5 flex flex-wrap items-center gap-4 rounded-2xl border border-zinc-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-zinc-900/70">
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">{tx({ TR: "Etkin duyuru: {used}/{max}", EN: "Active announcements: {used}/{max}" }, { used, max: maxActive })}</p>
                    <p className="text-[12px] text-zinc-500">{tx({ TR: "Ziyaretçiler önce en önemli seviyedeki duyuruyu görür; kapattıkları duyuru tekrar gösterilmez.", EN: "Visitors see the most important level first; one they dismiss isn't shown again." })}</p>
                </div>
                <div className="h-2 w-40 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={maxActive} aria-valuenow={used} aria-label={tx({ TR: "Etkin duyuru sayısı", EN: "Active announcement count" })}>
                    <div className={cx("h-full rounded-full transition-all", used >= maxActive ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${Math.min(100, (used / Math.max(1, maxActive)) * 100)}%` }} />
                </div>
            </div>

            {announcements.error ? <ErrorNotice error={announcements.error} onRetry={announcements.reload} className="mb-4" /> : null}

            {!announcements.data && announcements.loading ? (
                <LoadingRows rows={3} />
            ) : list.length === 0 ? (
                <EmptyState
                    icon={Megaphone}
                    title={tx({ TR: "Henüz duyuru yok", EN: "No announcements yet" })}
                    description={tx({ TR: "Bakım, yeni özellik veya güvenlik uyarılarını tüm ziyaretçilere duyurun.", EN: "Tell every visitor about maintenance, new features or security notices." })}
                    action={<Button variant="primary" size="sm" icon={Plus} onClick={() => setDraft(draftFrom(null))}>{tx({ TR: "İlk duyuruyu oluştur", EN: "Create the first one" })}</Button>}
                />
            ) : (
                <ul className="space-y-3">
                    <AnimatePresence initial={false}>
                        {list.map((item) => {
                            const state = lifecycle(item, now);
                            const meta = LIFECYCLE[state];
                            return (
                                <motion.li
                                    key={item.id}
                                    layout
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, x: -16 }}
                                    className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-900/60"
                                >
                                    <div className="flex flex-wrap items-center gap-2 text-[12px] text-zinc-500">
                                        <Badge tone={meta.tone}>{tx(meta.label)}</Badge>
                                        <Badge tone="zinc"><span className={cx("me-1 inline-block h-2 w-2 rounded-full", LEVEL_DOTS[item.level])} aria-hidden="true" />{tx(LEVEL_COPY[item.level])}</Badge>
                                        {item.startsAt || item.endsAt ? (
                                            <span className="inline-flex items-center gap-1">
                                                <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                                                {item.startsAt ? formatDateTime(item.startsAt, locale) : "…"} – {item.endsAt ? formatDateTime(item.endsAt, locale) : "…"}
                                            </span>
                                        ) : null}
                                        <span className="ms-auto inline-flex items-center gap-1">
                                            <span className="truncate" dir="ltr">{item.updatedBy ?? item.createdBy}</span>
                                            <span aria-hidden="true">·</span>
                                            <RelativeTime iso={item.updatedAt ?? item.createdAt} />
                                        </span>
                                    </div>
                                    <div className={cx("mt-3", state !== "live" && "opacity-70")}>
                                        <AnnouncementBar level={item.level} text={language === "TR" ? item.text.TR : item.text.EN} link={item.link} decorativeDismiss className="shadow-sm" />
                                    </div>
                                    <p className="mt-2 text-[12px] text-zinc-500" dir="auto">
                                        <span className="font-bold">{language === "TR" ? "EN" : "TR"}:</span> {language === "TR" ? item.text.EN : item.text.TR}
                                    </p>
                                    <div className="mt-3 flex flex-wrap items-center gap-2">
                                        <div className="inline-flex items-center gap-2 text-[13px] font-semibold">
                                            <Switch
                                                checked={item.active}
                                                busy={toggling.includes(item.id)}
                                                onChange={(active) => void toggle(item, active)}
                                                label={item.active ? tx({ TR: "Duyuruyu kapat", EN: "Switch off" }) : tx({ TR: "Duyuruyu aç", EN: "Switch on" })}
                                            />
                                            <span aria-hidden="true">{item.active ? tx({ TR: "Açık", EN: "On" }) : tx({ TR: "Kapalı", EN: "Off" })}</span>
                                        </div>
                                        <span className="flex-1" />
                                        <Button size="sm" icon={Pencil} onClick={() => setDraft(draftFrom(item))}>{tx({ TR: "Düzenle", EN: "Edit" })}</Button>
                                        <Button size="sm" variant="ghost" icon={Trash2} className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10" onClick={() => { setDeleteTarget(item); setDeleteError(null); }}>
                                            {tx(COMMON.delete)}
                                        </Button>
                                    </div>
                                </motion.li>
                            );
                        })}
                    </AnimatePresence>
                </ul>
            )}

            {draft ? <AnnouncementEditor draft={draft} onChange={setDraft} onClose={() => setDraft(null)} onSaved={saved} /> : null}

            <ConfirmDialog
                open={Boolean(deleteTarget)}
                onClose={() => { if (!deleting) setDeleteTarget(null); }}
                onConfirm={() => void confirmDelete()}
                busy={deleting}
                error={deleteError}
                icon={Trash2}
                title={tx({ TR: "Duyuru silinsin mi?", EN: "Delete this announcement?" })}
                description={tx({ TR: "Duyuru kalıcı olarak silinir ve ziyaretçilere artık gösterilmez.", EN: "The announcement is deleted permanently and no longer shown to visitors." })}
                confirmLabel={tx(COMMON.delete)}
            >
                {deleteTarget ? <AnnouncementBar level={deleteTarget.level} text={language === "TR" ? deleteTarget.text.TR : deleteTarget.text.EN} link={deleteTarget.link} decorativeDismiss /> : null}
            </ConfirmDialog>
        </div>
    );
}
