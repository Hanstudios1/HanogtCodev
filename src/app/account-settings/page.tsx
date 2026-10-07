"use client";

import { ArrowLeft, ChevronRight } from "lucide-react";
import { useId, useState } from "react";
import AccountSection from "@/components/AccountSettings/AccountSection";
import { AiSection, AppearanceSection, EditorSection, MessagingSection, NotificationsSection } from "@/components/AccountSettings/AppSections";
import ConfirmDialog from "@/components/AccountSettings/ConfirmDialog";
import { C, SAVE_ERRORS } from "@/components/AccountSettings/copy";
import DataSection from "@/components/AccountSettings/DataSection";
import { plainClick } from "@/components/AccountSettings/helpers";
import PrivacySection from "@/components/AccountSettings/PrivacySection";
import ProfileSection from "@/components/AccountSettings/ProfileSection";
import SaveBar from "@/components/AccountSettings/SaveBar";
import type { SearchEntry } from "@/components/AccountSettings/search";
import { sectionInfo, type SectionId } from "@/components/AccountSettings/sections";
import SettingsNav from "@/components/AccountSettings/SettingsNav";
import StatusSection from "@/components/AccountSettings/StatusSection";
import { FOCUS, Skeleton } from "@/components/AccountSettings/ui";
import { useAccountSettings, type AccountSettingsModel } from "@/components/AccountSettings/useAccountSettings";
import { useSettingsRoute } from "@/components/AccountSettings/useSettingsRoute";
import { ToastViewport } from "@/components/Editor/Toasts";
import Header from "@/components/Header";
import PlanBadge from "@/components/PlanBadge";
import PresenceAvatar from "@/components/PresenceAvatar";
import StaffBadge, { parseStaffRole } from "@/components/StaffBadge";
import { isSafeProfileUrl } from "@/lib/account-profile";
import { useI18n } from "@/lib/i18n";
import { visiblePlanBadge } from "@/lib/plan-badge";

function SectionContent({ id, model, onNavigate }: { id: SectionId; model: AccountSettingsModel; onNavigate: (id: SectionId) => void }) {
    switch (id) {
        case "account": return <AccountSection model={model} onNavigate={onNavigate} />;
        case "profile": return <ProfileSection model={model} />;
        case "status": return <StatusSection model={model} />;
        case "privacy": return <PrivacySection model={model} />;
        case "notifications": return <NotificationsSection model={model} />;
        case "messaging": return <MessagingSection model={model} />;
        case "appearance": return <AppearanceSection model={model} />;
        case "editor": return <EditorSection model={model} />;
        case "ai": return <AiSection />;
        case "data": return <DataSection model={model} />;
    }
}

/** Phones, above the category list: who is signed in (as saved); opens "Hesabım". */
function AccountCard({ model, onOpen }: { model: AccountSettingsModel; onOpen: () => void }) {
    const { base: saved, facts } = model;
    const avatar = saved ? (isSafeProfileUrl(saved.avatarUrl.trim()) ? saved.avatarUrl.trim() : null) : model.sessionUser?.image;
    return (
        <a
            href="#account"
            onClick={(event) => { if (plainClick(event)) onOpen(); }}
            className={`flex w-full items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 text-start transition hover:border-zinc-300 dark:border-white/[0.08] dark:bg-zinc-900 dark:hover:border-white/15 ${FOCUS}`}
        >
            <PresenceAvatar src={avatar} name={model.displayName} status={model.ownStatus} size="lg" ring="bg-white dark:bg-zinc-900" />
            <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-[16px] font-semibold text-zinc-900 dark:text-white">{model.displayName}</span>
                    <StaffBadge role={parseStaffRole(facts?.staffRole)} size="sm" compactOnMobile />
                    <PlanBadge plan={visiblePlanBadge(facts?.planBadge)} size="sm" compactOnMobile />
                </span>
                {saved?.nickname ? <span className="block truncate font-mono text-[12.5px] text-zinc-500 dark:text-zinc-400" dir="ltr">{saved.nickname}#{saved.nicknameTag}</span> : null}
                <span className="block truncate text-[12.5px] text-zinc-500 dark:text-zinc-400" dir="ltr">{model.email}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400 rtl:rotate-180" aria-hidden="true" />
        </a>
    );
}

export default function AccountSettingsPage() {
    const { t, tx } = useI18n();
    const { selected, active, wide, headingRef, go, backToList, reveal, revealField } = useSettingsRoute();
    const model = useAccountSettings({ revealField });
    const [query, setQuery] = useState("");
    const headingId = useId();

    if (!model.email) {
        return (
            <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-white">
                <Header />
                <main id="main-content" className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6">
                    <Skeleton />
                </main>
            </div>
        );
    }

    const section = sectionInfo(active);
    const SectionIcon = section.icon;
    // Phones show the category list until a section is picked; wide screens always show a section.
    const listView = selected === null;
    const saveBarShown = Boolean(model.form && (model.dirty || model.saveError || model.notice));
    const showResult = (entry: SearchEntry) => (entry.target ? reveal(entry.section, entry.target) : go(entry.section));

    return (
        <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-white">
            <Header />

            <main id="main-content" className={`mx-auto max-w-6xl px-4 pt-20 sm:px-6 lg:pt-24 ${saveBarShown ? "pb-44 sm:pb-32" : "pb-16"}`}>
                <header className={listView ? "" : "max-lg:sr-only"}>
                    <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">{tx(C.title)}</h1>
                    <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-zinc-500 dark:text-zinc-400">{tx(C.subtitle)}</p>
                </header>

                <div className="mt-6 lg:mt-8 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-10">
                    <aside className={`${listView ? "" : "max-lg:hidden"} lg:sticky lg:top-24 lg:-m-1 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:p-1`}>
                        <SettingsNav
                            active={active}
                            selected={selected}
                            wide={wide}
                            query={query}
                            onQueryChange={setQuery}
                            onNavigate={go}
                            onReveal={showResult}
                            top={<AccountCard model={model} onOpen={() => go("account")} />}
                        />
                    </aside>

                    <section aria-labelledby={headingId} className={`min-w-0 ${listView ? "max-lg:hidden" : ""}`} data-account-section={active}>
                        <button type="button" onClick={backToList} className={`mb-5 inline-flex items-center gap-1.5 rounded-lg text-[14px] font-medium text-zinc-500 transition hover:text-zinc-900 lg:hidden dark:text-zinc-400 dark:hover:text-white ${FOCUS}`} data-account-back>
                            <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                            {tx(C.backToList)}
                        </button>
                        <div className="mb-6 flex items-start gap-3.5">
                            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-zinc-200 bg-white text-zinc-600 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300">
                                <SectionIcon className="h-5 w-5" aria-hidden="true" />
                            </span>
                            <div className="min-w-0 pt-0.5">
                                <h2 id={headingId} ref={headingRef} tabIndex={-1} className="text-xl font-semibold tracking-tight text-zinc-950 outline-none sm:text-2xl dark:text-white">{tx(section.label)}</h2>
                                <p className="mt-0.5 text-[13.5px] text-zinc-500 dark:text-zinc-400">{tx(section.hint)}</p>
                            </div>
                        </div>
                        <SectionContent id={active} model={model} onNavigate={go} />
                    </section>
                </div>
            </main>

            {model.form ? (
                <SaveBar
                    dirty={model.dirty}
                    changedCount={model.changedCount}
                    saving={model.saving}
                    error={model.saveError ? model.errorMessage(model.saveError, SAVE_ERRORS) : null}
                    notice={model.notice}
                    onSave={() => void model.save()}
                    onReset={model.discard}
                />
            ) : null}

            <ConfirmDialog
                name="delete"
                open={model.dialog === "delete"}
                titleId="delete-title"
                textId="delete-text"
                title={t("confirm_delete_account")}
                text={t("delete_account_permanent")}
                cancelLabel={t("cancel")}
                confirmLabel={t("confirm_delete")}
                busy={model.busyAction === "delete"}
                onCancel={() => model.openDialog(null)}
                onConfirm={() => void model.deleteAccount()}
            />
            <ConfirmDialog
                name="reset-editor"
                open={model.dialog === "resetEditor"}
                titleId="reset-editor-title"
                textId="reset-editor-text"
                title={tx(C.resetEditorTitle)}
                text={tx(C.resetEditorText)}
                cancelLabel={t("cancel")}
                confirmLabel={t("reset")}
                onCancel={() => model.openDialog(null)}
                onConfirm={() => void model.resetEditor()}
            />

            <ToastViewport toasts={model.toasts} onDismiss={model.dismissToast} />
        </div>
    );
}
