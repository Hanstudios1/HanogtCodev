"use client";

import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useEffectEvent, useMemo, useState } from "react";
import { useToasts } from "@/components/Editor/Toasts";
import { useFirebaseBridge, useRawSession } from "@/components/Provider";
import { announceAccountSecurityChange } from "@/components/Security/account-security-store";
import { announceOwnProfile, saveOwnProfile } from "@/components/StatusMenu";
import {
    EDITABLE_ACCOUNT_KEYS, diffAccountFields, sanitizeAccountPatch,
    type AccountProfileErrorBody, type AccountProfileResponse, type EditableAccountFields,
} from "@/lib/account-profile";
import { reportPresenceOffline, useOwnStatus } from "@/lib/account-profile-client";
import { prepareSignOut } from "@/lib/ai/sign-out";
import { DEFAULT_EDITOR_SETTINGS, readEditorSettings, resetEditorSettings } from "@/lib/editor-settings";
import { useI18n, type Copy } from "@/lib/i18n";
import type { PlanBadgeState } from "@/lib/plan-badge";
import { resolvePresence } from "@/lib/presence";
import { C, FIELD_LABELS, PROBLEMS, SAVE_ERRORS } from "./copy";
import { INSTANT_FIELDS } from "./sections";

export type ProfileError = { code: string; status: number; field?: string; reason?: string };
type ProfileResult = { ok: true; data: AccountProfileResponse } | { ok: false; error: ProfileError };
type EditState = { key: string; base: EditableAccountFields; form: EditableAccountFields };
/** What the save bar says after a save or a reset (errors come from `saveError`). */
export type SaveNotice = { tone: "success" | "info"; text: string };
export type BusyAction = "export" | "delete" | "password" | "sessions" | null;
export type ConfirmDialogId = "delete" | "resetEditor";

function isProfileResponse(value: unknown): value is AccountProfileResponse {
    if (!value || typeof value !== "object") return false;
    const record = value as Partial<AccountProfileResponse>;
    return Boolean(record.account && typeof record.account.email === "string" && record.fields && typeof record.fields === "object" && record.stats);
}

async function requestProfile(init: RequestInit = {}): Promise<ProfileResult> {
    let response: Response;
    try {
        response = await fetch("/api/account/profile", { cache: "no-store", credentials: "same-origin", ...init });
    } catch {
        return { ok: false, error: { code: "network", status: 0 } };
    }
    const payload = await response.json().catch(() => null) as unknown;
    if (response.ok && isProfileResponse(payload)) return { ok: true, data: payload };
    const body = (payload && typeof payload === "object" ? payload : {}) as Partial<AccountProfileErrorBody>;
    return {
        ok: false,
        error: {
            code: typeof body.code === "string" ? body.code : "unknown",
            status: response.status,
            field: typeof body.field === "string" ? body.field : undefined,
            reason: typeof body.reason === "string" ? body.reason : undefined,
        },
    };
}

function sameField(a: unknown, b: unknown) {
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, index) => item === b[index]);
    return a === b;
}

/**
 * Everything Account Settings loads and saves, in one place. Profile and
 * settings come from /api/account/profile (server-side Firestore), so they
 * load and save even when the browser's Firebase connection is broken.
 * Form fields wait for the save bar; the status, the visibility switches,
 * the plan badge, theme and language save on their own, and the security
 * and data actions call their own endpoints.
 */
export function useAccountSettings({ revealField }: { revealField: (field: string) => void }) {
    const auth = useRawSession();
    const router = useRouter();
    const { t, tx, language } = useI18n();
    const { toasts, push: toast, dismiss: dismissToast } = useToasts();
    const bridge = useFirebaseBridge();
    const email = auth.status === "authenticated" ? auth.data?.user?.email?.toLowerCase() || null : null;
    const reportedStatus = useOwnStatus(email);

    const [reloadVersion, setReloadVersion] = useState(0);
    const loadKey = email ? `${reloadVersion}|${email}` : null;
    const [loaded, setLoaded] = useState<{ key: string; profile: AccountProfileResponse | null; error: ProfileError | null } | null>(null);
    const [edit, setEdit] = useState<EditState | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<ProfileError | null>(null);
    const [notice, setNotice] = useState<SaveNotice | null>(null);
    const [instantBusy, setInstantBusy] = useState<keyof EditableAccountFields | null>(null);

    const [busyAction, setBusyAction] = useState<BusyAction>(null);
    const [dialog, setDialog] = useState<ConfirmDialogId | null>(null);
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [passwordSet, setPasswordSet] = useState(false);

    // Only a confirmed signed-out state redirects; the session is still loading on the first render.
    useEffect(() => {
        if (auth.status === "unauthenticated") router.replace("/login?callbackUrl=%2Faccount-settings");
    }, [auth.status, router]);

    useEffect(() => {
        if (!loadKey) return;
        const controller = new AbortController();
        void requestProfile({ signal: controller.signal }).then((result) => {
            if (controller.signal.aborted) return;
            if (result.ok) {
                setLoaded({ key: loadKey, profile: result.data, error: null });
                setEdit({ key: loadKey, base: result.data.fields, form: result.data.fields });
            } else {
                setLoaded({ key: loadKey, profile: null, error: result.error });
            }
        });
        return () => controller.abort();
    }, [loadKey]);

    const current = loaded && loaded.key === loadKey ? loaded : null;
    const profile = current?.profile ?? null;
    const loadError = current?.error ?? null;
    const form = edit && edit.key === loadKey ? edit.form : null;
    const base = edit && edit.key === loadKey ? edit.base : null;
    const patch = useMemo(() => (form && base ? diffAccountFields(base, form) : {}), [base, form]);
    const changedCount = Object.keys(patch).length;
    const dirty = changedCount > 0;
    const invalidField = saveError?.code === "invalid_field" ? saveError.field ?? null : saveError?.code === "nickname_taken" ? saveError.field ?? "nickname" : null;
    const ownStatus = reportedStatus ?? (form ? resolvePresence(form.statusPreference, "active", form.showOnlineStatus) : null);
    const hasPassword = passwordSet || Boolean(profile?.account.hasPassword);

    // The save bar's message fades after a few seconds.
    useEffect(() => {
        if (!notice) return;
        const timer = window.setTimeout(() => setNotice(null), 4_000);
        return () => window.clearTimeout(timer);
    }, [notice]);

    // Leaving with unsaved changes asks first.
    useEffect(() => {
        if (!dirty) return;
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = "";
        };
        window.addEventListener("beforeunload", onBeforeUnload);
        return () => window.removeEventListener("beforeunload", onBeforeUnload);
    }, [dirty]);

    const setField = useCallback(<K extends keyof EditableAccountFields>(key: K, value: EditableAccountFields[K]) => {
        setEdit((state) => (state ? { ...state, form: { ...state.form, [key]: value } } : state));
        setSaveError((error) => (error && (error.field === key || (error.code === "nickname_taken" && (key === "nickname" || key === "nicknameTag"))) ? null : error));
        setNotice(null);
    }, []);

    /** A save outside the save bar (status menu, visibility switches): those fields follow the server, other edits stay. */
    const applyInstantSave = useCallback((data: AccountProfileResponse) => {
        setLoaded((state) => (state?.profile ? { ...state, profile: { ...state.profile, fields: data.fields, presence: data.presence } } : state));
        setEdit((state) => {
            if (!state) return state;
            const nextBase = { ...state.base } as Record<string, unknown>;
            const nextForm = { ...state.form } as Record<string, unknown>;
            for (const key of INSTANT_FIELDS) {
                nextBase[key] = data.fields[key];
                nextForm[key] = data.fields[key];
            }
            return { ...state, base: nextBase as unknown as EditableAccountFields, form: nextForm as unknown as EditableAccountFields };
        });
    }, []);

    const errorMessage = (error: ProfileError, table: Record<string, Copy>) => {
        if (error.code === "invalid_field" && error.field) {
            const label = FIELD_LABELS[error.field as keyof EditableAccountFields];
            return tx(C.fieldProblem, { field: label ? tx(label) : error.field, problem: tx(PROBLEMS[error.reason ?? "invalid"] ?? PROBLEMS.invalid) });
        }
        return tx(table[error.code] ?? table.unknown);
    };

    const save = async () => {
        if (!edit || !form || !base || saving || !email) return;
        if (!dirty) {
            setNotice({ tone: "info", text: tx(C.nothingToSave) });
            return;
        }
        const sentForm = form;
        const changes = diffAccountFields(base, sentForm);
        // Same validation as the server, so mistakes are shown without a round trip.
        const checked = sanitizeAccountPatch(changes);
        if (!checked.ok) {
            const error: ProfileError = checked.error.code === "unknown_field"
                ? { code: "unknown_field", status: 0, field: checked.error.field }
                : { code: "invalid_field", status: 0, field: checked.error.field, reason: checked.error.code };
            setSaveError(error);
            if (error.field) revealField(error.field);
            return;
        }
        setSaving(true);
        setSaveError(null);
        setNotice(null);
        const result = await requestProfile({ method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(checked.patch) });
        setSaving(false);
        if (!result.ok) {
            setSaveError(result.error);
            if (result.error.code === "invalid_field" || result.error.code === "nickname_taken") revealField(result.error.field ?? "nickname");
            return;
        }
        const fresh = result.data;
        setLoaded((state) => (state && state.key === edit.key ? { ...state, profile: fresh } : state));
        setEdit((state) => {
            if (!state || state.key !== edit.key) return state;
            const next = { ...state.form } as Record<string, unknown>;
            // Keep what was typed while the request was running.
            for (const key of EDITABLE_ACCOUNT_KEYS) {
                if (sameField(state.form[key], sentForm[key])) next[key] = fresh.fields[key];
            }
            return { ...state, base: fresh.fields, form: next as unknown as EditableAccountFields };
        });
        // The header, the status menu and the presence heartbeat pick the changes up.
        announceOwnProfile(email, fresh);
        setNotice({ tone: "success", text: tx(C.saved) });
    };

    const discard = () => {
        if (!dirty) return;
        setEdit((state) => (state ? { ...state, form: state.base } : state));
        setSaveError(null);
        setNotice({ tone: "info", text: tx(C.discarded) });
    };

    const onSaveShortcut = useEffectEvent(() => {
        void save();
    });
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "s") return;
            event.preventDefault();
            onSaveShortcut();
        };
        window.addEventListener("keydown", onKeyDown, true);
        return () => window.removeEventListener("keydown", onKeyDown, true);
    }, []);

    /** "Show online status" and "Show last seen" are saved at once: they change what others see right now. */
    const saveInstant = async (key: "showOnlineStatus" | "showLastSeen", value: boolean) => {
        if (!email || instantBusy) return;
        setInstantBusy(key);
        const result = await saveOwnProfile({ [key]: value });
        setInstantBusy(null);
        if (!result.ok) {
            toast({ tone: "error", message: tx(SAVE_ERRORS[result.code] ?? C.settingFailed) });
            return;
        }
        announceOwnProfile(email, result.data);
        applyInstantSave(result.data);
        toast({ tone: "success", message: tx(C.settingSaved) });
    };

    /** The badge switch saved: the facts follow (the preview and the header show it at once). */
    const applyPlanBadge = (planBadge: PlanBadgeState) => {
        setLoaded((state) => (state?.profile ? { ...state, profile: { ...state.profile, account: { ...state.profile.account, planBadge } } } : state));
    };

    const copyTag = async () => {
        if (!base) return;
        const handle = [base.nickname, base.nicknameTag].join("#");
        try {
            await navigator.clipboard.writeText(handle);
            toast({ tone: "success", message: tx(C.tagCopied, { tag: handle }) });
        } catch {
            toast({ tone: "error", message: tx(C.copyFailed) });
        }
    };

    const newTag = () => {
        if (!form) return;
        let tag = form.nicknameTag;
        while (tag === form.nicknameTag) tag = String(1000 + Math.floor(Math.random() * 9000));
        setField("nicknameTag", tag);
    };

    const toggleFavoriteLang = (lang: string) => {
        if (!form) return;
        const list = form.favoriteLangs;
        if (list.includes(lang)) setField("favoriteLangs", list.filter((item) => item !== lang));
        else if (list.length < 5) setField("favoriteLangs", [...list, lang]);
    };

    const signOutNow = () => {
        reportPresenceOffline();
        prepareSignOut();
        void signOut({ callbackUrl: "/" });
    };

    /** The profile couldn't be read because the session is gone: sign in again and come back here. */
    const signInAgain = () => {
        prepareSignOut();
        void signOut({ callbackUrl: "/login?callbackUrl=%2Faccount-settings" });
    };

    /** Sensitive changes need a recent sign-in (the server answers reauth_required): sign out and come back here. */
    const askToSignInAgain = (message: Copy) => {
        toast({
            tone: "warning",
            message: tx(message),
            duration: 0,
            action: {
                label: tx(C.signInAgain),
                onClick: () => {
                    reportPresenceOffline();
                    prepareSignOut();
                    void signOut({ callbackUrl: "/login?callbackUrl=%2Faccount-settings" });
                },
            },
        });
    };

    const deleteAccount = async () => {
        setBusyAction("delete");
        try {
            const response = await fetch("/api/account/data", { method: "DELETE", credentials: "same-origin" });
            if (response.status === 403) {
                const result = await response.json().catch(() => ({})) as { code?: string };
                if (result.code === "reauth_required") {
                    setDialog(null);
                    askToSignInAgain(C.reauthDelete);
                    return;
                }
            }
            if (!response.ok) throw new Error(String(response.status));
            try {
                localStorage.clear();
            } catch {
                // Storage blocked: nothing to clear.
            }
            prepareSignOut();
            await signOut({ redirect: false });
            router.push("/");
        } catch {
            toast({ tone: "error", message: t("delete_error") });
        } finally {
            setBusyAction(null);
        }
    };

    const exportData = async () => {
        setBusyAction("export");
        try {
            const response = await fetch("/api/account/data", { cache: "no-store", credentials: "same-origin" });
            const serverData = await response.json() as Record<string, unknown>;
            if (!response.ok) throw new Error(String(response.status));
            const exportData = { ...serverData, editorSettings: readEditorSettings() };
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = ["hanogt_backup_", new Date().toISOString().slice(0, 10), ".json"].join("");
            anchor.click();
            URL.revokeObjectURL(url);
            toast({ tone: "success", message: t("export_success") });
        } catch {
            toast({ tone: "error", message: t("error_occurred") });
        } finally {
            setBusyAction(null);
        }
    };

    /** Runs once the reset has been confirmed. */
    const resetEditor = async () => {
        setDialog(null);
        resetEditorSettings();
        toast({ tone: "success", message: t("editor_settings_reset") });
        // Keep the account copy in step, so other devices don't bring the old settings back.
        try {
            const response = await fetch("/api/account/preferences", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ editorSettings: DEFAULT_EDITOR_SETTINGS }),
            });
            if (!response.ok) throw new Error(String(response.status));
        } catch {
            toast({ tone: "warning", message: tx(C.editorResetFailed) });
        }
    };

    const submitPassword = async () => {
        if (newPassword.length < 10) {
            toast({ tone: "error", message: t("password_too_short") });
            return;
        }
        if (newPassword !== confirmPassword) {
            toast({ tone: "error", message: t("passwords_not_match") });
            return;
        }
        setBusyAction("password");
        try {
            const response = await fetch("/api/account/password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ currentPassword, newPassword }),
            });
            const result = await response.json().catch(() => ({})) as { error?: string; code?: string; otherSessionsSignedOut?: boolean };
            if (result.code === "reauth_required") {
                askToSignInAgain(C.reauthPassword);
                return;
            }
            if (result.code === "wrong_password") throw new Error(tx(C.passwordWrong));
            // The password route answers in Turkish only.
            if (!response.ok) throw new Error(language === "TR" && result.error ? result.error : t("error_occurred"));
            setPasswordSet(true);
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            toast({ tone: "success", message: result.otherSessionsSignedOut ? tx(C.passwordSavedOthersOut) : t("password_set_success") });
            // The 2FA card and the security summary read the account again (a first password unlocks 2FA).
            announceAccountSecurityChange();
            // The other sessions' data connections were cut, this browser's too: connect again.
            if (result.otherSessionsSignedOut) void bridge.reconnect();
        } catch (error) {
            toast({ tone: "error", message: error instanceof Error ? error.message : t("error_occurred") });
        } finally {
            setBusyAction(null);
        }
    };

    const signOutOthers = async () => {
        setBusyAction("sessions");
        try {
            const response = await fetch("/api/account/sessions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ action: "sign_out_everywhere" }),
            });
            if (response.status === 429) {
                toast({ tone: "error", message: tx(C.tooManyTries) });
                return;
            }
            if (!response.ok) throw new Error(String(response.status));
            toast({ tone: "success", message: tx(C.signOutOthersDone) });
            announceAccountSecurityChange();
            void bridge.reconnect();
        } catch {
            toast({ tone: "error", message: tx(C.signOutOthersFailed) });
        } finally {
            setBusyAction(null);
        }
    };

    const sessionUser = auth.status === "authenticated" ? auth.data?.user ?? null : null;
    // Summaries show what is saved; only the profile preview follows the unsaved form.
    const displayName = base?.username.trim() || sessionUser?.name || (email ? email.split("@")[0] : "");

    return {
        email,
        sessionUser,
        displayName,
        profile,
        facts: profile?.account ?? null,
        stats: profile?.stats ?? null,
        loadError,
        retryLoad: () => setReloadVersion((value) => value + 1),
        form,
        base,
        dirty,
        changedCount,
        saving,
        saveError,
        notice,
        fieldInvalid: (key: keyof EditableAccountFields) => invalidField === key || undefined,
        setField,
        save,
        discard,
        errorMessage,
        ownStatus,
        instantBusy,
        saveInstant,
        applyInstantSave,
        applyPlanBadge,
        copyTag,
        newTag,
        toggleFavoriteLang,
        hasPassword,
        password: { current: currentPassword, next: newPassword, confirm: confirmPassword, setCurrent: setCurrentPassword, setNext: setNewPassword, setConfirm: setConfirmPassword, submit: submitPassword },
        busyAction,
        signOutOthers,
        exportData,
        dialog,
        openDialog: setDialog,
        deleteAccount,
        resetEditor,
        signOutNow,
        signInAgain,
        toasts,
        dismissToast,
    };
}

export type AccountSettingsModel = ReturnType<typeof useAccountSettings>;
