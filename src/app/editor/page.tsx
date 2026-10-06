"use client";

import {
    ChevronDown, ClipboardCopy, Command, Copy as CopyIcon, Download, ExternalLink, Eye, FilePlus2, FolderDown, Keyboard, Languages, Link2, ListOrdered,
    LoaderCircle, MessageSquareCode, MoreVertical, PanelRightClose, PanelRightOpen, Pencil, Play, Redo2, RefreshCw, Replace, Save, Search, Send,
    Settings, Share2, Square, SquarePen, Sun, Terminal, TextSelect, Trash2, Undo2, Upload, UsersRound, Wand2,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type SetStateAction } from "react";
import type { editor } from "monaco-editor";
import AIAssistant from "@/components/Editor/AIAssistant";
import CodeEditor from "@/components/Editor/CodeEditor";
import CollabButton from "@/components/Editor/CollabButton";
import CollabCodeEditor from "@/components/Editor/CollabCodeEditor";
import CollabDialogs from "@/components/Editor/CollabDialogs";
import CollabPanel from "@/components/Editor/CollabPanel";
import CollabStartDialog from "@/components/Editor/CollabStartDialog";
import CommandPalette, { type PaletteCommand } from "@/components/Editor/CommandPalette";
import Console, { type ConsoleTab } from "@/components/Editor/Console";
import EditorTabs from "@/components/Editor/EditorTabs";
import LanguageIcon from "@/components/Editor/LanguageIcon";
import MediaPublishButton, { MEDIA_BUTTON_COPY } from "@/components/Editor/MediaPublishButton";
import { useConfirm } from "@/components/Editor/Modal";
import NewFileDialog, { EngineBadge, LanguagePickerDialog, type NewFileRequest } from "@/components/Editor/NewFileDialog";
import PublishDialog from "@/components/Editor/PublishDialog";
import SaveDialog from "@/components/Editor/SaveDialog";
import ShareDialog from "@/components/Editor/ShareDialog";
import ShortcutsDialog from "@/components/Editor/ShortcutsDialog";
import Sidebar, { SIDEBAR_COPY } from "@/components/Editor/Sidebar";
import StatusBar, { type SaveState } from "@/components/Editor/StatusBar";
import { ToastViewport, useToasts } from "@/components/Editor/Toasts";
import ToolbarMenu, { type ToolbarMenuItem, type ToolbarMenuSection } from "@/components/Editor/ToolbarMenu";
import WebPreview from "@/components/Editor/WebPreview";
import {
    MAX_TABS, buildProjectZip, buildSnippetFile, downloadName, readUploadedFiles, triggerDownload, uniqueFileName,
    type UploadIssue,
} from "@/components/Editor/editor-files";
import { EDIT_SHORTCUTS, formatShortcut, isTypingTarget, shortcutText, useIsMac } from "@/components/Editor/keyboard";
import { MediaApiError, mediaAction, mediaErrorText } from "@/components/Editor/media-api";
import { mediaPostPath, ownerTag, parseMediaPublication, type MediaPublication } from "@/components/Editor/media-publish";
import type { HistoryEntry, RunEntry, RunState } from "@/components/Editor/run-types";
import { storedPublication, useMediaPublication } from "@/components/Editor/useMediaPublication";
import { useFirebaseBridge, useRawSession } from "@/components/Provider";
import { publishAiContext } from "@/lib/ai/context-store";
import { useApplyRequests, type ApplyRequest } from "@/lib/ai/editor-apply";
import { COLLAB_COPY, COLLAB_ERROR_COPY, COLLAB_NOTICE_COPY, collabNoticeToast } from "@/lib/collab/copy";
import type { CollabFileContent } from "@/lib/collab/doc";
import type { CollabClosed } from "@/lib/collab/session-client";
import { COLLAB_PARAM, sharedFileIds, useEditorCollab } from "@/lib/collab/use-editor-collab";
import { EDITOR_IMPORT_PARAM, consumeEditorImportBundle, type EditorImportError } from "@/lib/editor-bridge";
import { readEditorSettings, useEditorSettings } from "@/lib/editor-settings";
import { useI18n, type Copy } from "@/lib/i18n";
import type { MonacoApi } from "@/lib/monaco";
import { useMyPlan } from "@/lib/plan-client";
import { PLAN_COPY, PLAN_RUN_LIMITS, nextPlanUp } from "@/lib/plans";
import {
    BROWSER_LANGUAGES, PLAINTEXT_LANGUAGE, ensureFileExtension, fileExtensionFor, getLanguage, isProgramLanguage,
    languageFromFileName, normalizeLanguageId, type LanguageInfo,
} from "@/lib/runtimes/languages";
import type { ProjectTemplate } from "@/lib/runtimes/templates";
import { resolvePreviewTarget } from "@/lib/runtimes/web-preview";
import { getProjects, getProjectsFromCloud, saveProject, saveProjectToCloud } from "@/lib/storage";
import { useTheme } from "@/lib/theme";
import { executeProjectSecure } from "@/services/piston";

interface EditorTab {
    id: string;
    name: string;
    lang: string;
    code: string;
    isSaved: boolean;
}

type StoredTab = { name?: unknown; lang?: unknown; code?: unknown; id?: unknown; isSaved?: unknown };
type GameScriptResponse = { id: string; name: string; language: "csharp" | "cpp"; content: string; revision?: string | null };
type DialogName = "new" | "palette" | "shortcuts" | "share" | "save" | "language" | "publish" | "collab" | null;
/** An editor command shown in the Edit menu and the command palette. */
type EditorCommand = { id: string; label: string; icon: ReactNode; shortcut?: string; hint?: string; keywords?: string; disabled?: boolean; danger?: boolean; run: () => void };

/**
 * Unsaved work survives reloads here (only in this browser). The value stays a
 * plain array of tabs because Groups adds files to it ("Open in the Editor").
 */
const RECOVERY_KEY = "hanogt_unsaved_tabs";
/**
 * The cloud project the recovered tabs belong to: { projectId, projectName, tabIds }.
 * An unsaved draft that was published to Media also keeps its post here (`publication`).
 */
const RECOVERY_PROJECT_KEY = "hanogt_unsaved_project";
const PANEL_WIDTH_KEY = "hanogt_editor_panel_width";
const GAME_LANGUAGES = ["csharp", "cpp"] as const;

let tabSequence = 0;
/** Unique tab id; a bare timestamp collided when two tabs were created in the same millisecond. */
const newTabId = () => `tab-${Date.now().toString(36)}-${(tabSequence += 1)}`;

/** Identifies what the loader opened (project, game script, user…). */
const loadKeyOf = (...parts: Array<string | null>) => parts.map((part) => part ?? "").join("|");

/** Normalises tabs from saved projects, old recovery data and imports. */
function toTab(file: StoredTab, isSaved: boolean, id = newTabId()): EditorTab | null {
    if (typeof file.code !== "string") return null;
    const rawName = typeof file.name === "string" ? file.name.trim().slice(0, 120) : "";
    const lang = normalizeLanguageId(typeof file.lang === "string" ? file.lang : "") ?? languageFromFileName(rawName)?.id ?? PLAINTEXT_LANGUAGE.id;
    return { id, name: rawName || (getLanguage(lang)?.defaultFileName ?? "untitled.txt"), lang, code: file.code, isSaved };
}

function readStorage(key: string): string | null {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function writeStorage(key: string, value: string | null) {
    try {
        if (value === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, value);
    } catch {
        // Storage is unavailable; recovery is a convenience only.
    }
}

/**
 * Reads the recovered tabs. They keep their cloud project (and the Media post
 * of a published draft) only when they are exactly the tabs that were open in
 * it (files added by Groups start a new project).
 */
function readRecovery(email: string): { tabs: EditorTab[]; projectId: number | null; projectName: string; publication: MediaPublication | null } | null {
    const raw = readStorage(RECOVERY_KEY);
    if (!raw) return null;
    try {
        const data = JSON.parse(raw) as unknown;
        const list = (Array.isArray(data) ? data : []).slice(0, MAX_TABS).filter((item): item is StoredTab => Boolean(item) && typeof item === "object");
        const tabs = list.map((item) => toTab(item, item.isSaved === true)).filter((tab): tab is EditorTab => Boolean(tab));
        if (!tabs.length) return null;
        let projectId: number | null = null;
        let projectName = "";
        let publication: MediaPublication | null = null;
        try {
            const meta = JSON.parse(readStorage(RECOVERY_PROJECT_KEY) ?? "null") as { projectId?: unknown; projectName?: unknown; tabIds?: unknown; publication?: unknown } | null;
            const storedIds = list.map((item) => item.id);
            const sameTabs = Array.isArray(meta?.tabIds) && meta.tabIds.length === storedIds.length && meta.tabIds.every((id, index) => id === storedIds[index]);
            if (sameTabs && typeof meta?.projectId === "number" && Number.isFinite(meta.projectId)) {
                projectId = meta.projectId;
                projectName = typeof meta.projectName === "string" ? meta.projectName.slice(0, 120) : "";
            }
            // A published draft's post, for the account that published it.
            const owner = (meta?.publication as { owner?: unknown } | undefined)?.owner;
            if (sameTabs && email && owner === ownerTag(email)) publication = parseMediaPublication(meta?.publication);
        } catch {
            // No usable project link; the tabs open as a new project.
        }
        return { tabs, projectId, projectName, publication };
    } catch {
        return null;
    }
}

/** Monaco model URI; the extension lets the TypeScript service treat .tsx/.jsx files correctly. */
function modelPath(tab: EditorTab) {
    const fromName = languageFromFileName(tab.name);
    const dot = tab.name.lastIndexOf(".");
    const extension = fromName?.id === tab.lang && dot > 0 ? tab.name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9+#_-]/g, "") : fileExtensionFor(tab.lang);
    return `inmemory://hanogt/${tab.id}.${extension || "txt"}`;
}

const C = {
    loading: { TR: "Editör hazırlanıyor…", EN: "Preparing the editor…" },
    run: { TR: "Çalıştır", EN: "Run" },
    runAll: { TR: "Tümünü çalıştır ({count})", EN: "Run all ({count})" },
    runActive: { TR: "Yalnızca bu dosyayı çalıştır", EN: "Run this file only" },
    running: { TR: "Çalışıyor…", EN: "Running…" },
    validate: { TR: "Doğrula", EN: "Validate" },
    preview: { TR: "Önizle", EN: "Preview" },
    stop: { TR: "Durdur", EN: "Stop" },
    runMenu: { TR: "Çalıştırma seçenekleri", EN: "Run options" },
    notRunnable: { TR: "{language} yalnızca düzenleme ve sözdizimi vurgulama destekler; bu dil çalıştırılamaz.", EN: "{language} supports editing and syntax highlighting only; it can't be run." },
    console: { TR: "Konsol", EN: "Console" },
    previewPanel: { TR: "Önizleme", EN: "Preview" },
    showPanel: { TR: "Çıktı panelini göster", EN: "Show the output panel" },
    hidePanel: { TR: "Çıktı panelini gizle", EN: "Hide the output panel" },
    resize: { TR: "Panel genişliğini değiştir", EN: "Resize the panel" },
    gameScript: { TR: "Oyun scripti", EN: "Game script" },
    more: { TR: "Diğer işlemler", EN: "More actions" },
    dropFiles: { TR: "Dosyaları açmak için bırakın (metin veya ZIP, dosya başına 500 KB)", EN: "Drop files to open them (text or ZIP, 500 KB per file)" },
    format: { TR: "Belgeyi biçimlendir", EN: "Format document" },
    noFormatter: { TR: "{language} için yerleşik bir biçimlendirici yok.", EN: "There is no built-in formatter for {language}." },
    formatted: { TR: "Belge biçimlendirildi.", EN: "Document formatted." },
    changeLanguage: { TR: "Dil modunu değiştir", EN: "Change language mode" },
    renameFile: { TR: "Dosyayı yeniden adlandır", EN: "Rename file" },
    toggleTheme: { TR: "Açık/koyu temayı değiştir", EN: "Toggle light/dark theme" },
    settings: { TR: "Editör ayarları", EN: "Editor settings" },
    switchTo: { TR: "Sekmeye geç", EN: "Switch to tab" },
    actions: { TR: "İşlemler", EN: "Actions" },
    files: { TR: "Açık dosyalar", EN: "Open files" },
    newIn: { TR: "Yeni dosya", EN: "New file" },
    newInLanguage: { TR: "Yeni {language} dosyası", EN: "New {language} file" },
    signInToSave: { TR: "Projeyi buluta kaydetmek için giriş yapın. Kaydedilmemiş sekmeleriniz bu tarayıcıda korunur.", EN: "Sign in to save the project to the cloud. Your unsaved tabs are kept in this browser." },
    signIn: { TR: "Giriş yap", EN: "Sign in" },
    saved: { TR: "Proje kaydedildi.", EN: "Project saved." },
    savedGame: { TR: "Oyun scripti güvenli proje alanına kaydedildi.", EN: "The game script was saved to the secure project storage." },
    saveFailed: { TR: "Proje buluta kaydedilemedi. Değişiklikleriniz açık sekmelerde korunuyor.", EN: "The project couldn't be saved to the cloud. Your changes are kept in the open tabs." },
    projectLimit: { TR: "Planının kod projesi sınırına ulaştın ({limit}). Eski bir projeyi silerek yer açabilir ya da planını yükseltebilirsin; değişiklikler açık sekmelerde korunuyor.", EN: "You've reached your plan's limit of {limit} code projects. Delete an old project or upgrade your plan; your changes are kept in the open tabs." },
    seePlans: { TR: "Fiyatlandırma", EN: "Pricing" },
    gameSaveFailed: { TR: "Oyun scripti kaydedilemedi; değişiklikler açık sekmede korunuyor.", EN: "The game script couldn't be saved; your changes are kept in the open tab." },
    gameLanguages: { TR: "Oyun scriptleri yalnızca C# veya C++ olabilir.", EN: "Game scripts can only be C# or C++." },
    gameLoadFailed: { TR: "Oyun scripti yüklenemedi.", EN: "The game script couldn't be loaded." },
    dashboard: { TR: "Panele git", EN: "Open dashboard" },
    generalProject: { TR: "Genel projem", EN: "My project" },
    languageProject: { TR: "{language} projem", EN: "My {language} project" },
    closeUnsavedTitle: { TR: "Kaydedilmemiş değişiklikler", EN: "Unsaved changes" },
    closeUnsaved: { TR: "{name} kaydedilmedi. Sekmeyi kapatırsanız değişiklikler kaybolur.", EN: "{name} isn't saved. Closing the tab discards the changes." },
    closeManyUnsaved: { TR: "{count} sekmede kaydedilmemiş değişiklik var. Kapatırsanız bu değişiklikler kaybolur.", EN: "{count} tabs have unsaved changes. Closing them discards those changes." },
    closeConfirm: { TR: "Kapat", EN: "Close" },
    nameEmpty: { TR: "Dosya adı boş olamaz.", EN: "The file name can't be empty." },
    nameInvalid: { TR: "Dosya adında / veya \\ kullanılamaz.", EN: "File names can't contain / or \\." },
    nameTaken: { TR: "Bu adla açık bir dosya zaten var.", EN: "A file with this name is already open." },
    languageChanged: { TR: "Dil {language} olarak değiştirildi.", EN: "Language changed to {language}." },
    tooManyTabs: { TR: "En fazla {count} dosya açık olabilir.", EN: "At most {count} files can be open." },
    tooManyRuns: { TR: "Planında tek seferde en fazla {count} dosya çalışır; ilk {count} dosya çalıştırıldı.", EN: "Your plan runs at most {count} files at once; the first {count} were run." },
    tooManyRunsUpgrade: { TR: "Planında tek seferde en fazla {count} dosya çalışır; ilk {count} dosya çalıştırıldı. {plan} ile {more} dosyaya kadar çalıştırabilirsin.", EN: "Your plan runs at most {count} files at once; the first {count} were run. {plan} runs up to {more}." },
    uploadIssues: { TR: "{count} dosya açılamadı: {list}", EN: "{count} files couldn't be opened: {list}" },
    uploaded: { TR: "{count} dosya açıldı.", EN: "{count} files opened." },
    gameNoFiles: { TR: "Oyun scripti düzenlenirken yeni dosya açılamaz.", EN: "New files can't be opened while editing a game script." },
    importDone: { TR: "{name} editörde açıldı (kaydedilmedi).", EN: "{name} was opened in the editor (not saved yet)." },
    zipFailed: { TR: "ZIP dosyası oluşturulamadı.", EN: "The ZIP file couldn't be created." },
    autoSaveOff: { TR: "Otomatik kaydetme kapalı (Ayarlar).", EN: "Auto save is off (Settings)." },
    autoSaveLater: { TR: "Otomatik kaydetme, proje ilk kez kaydedildikten sonra çalışır.", EN: "Auto save starts after the project is saved once." },
    autoSaveDelay: { TR: "Otomatik kaydetme: {seconds} sn sonra", EN: "Auto save: after {seconds} s" },
    autoSaveFocus: { TR: "Otomatik kaydetme: odak değişince", EN: "Auto save: on focus change" },
    stdinFromTemplate: { TR: "Şablonun örnek girdisi Girdi sekmesine yazıldı.", EN: "The template's sample input was added to the Input tab." },
    previewOnly: { TR: "Bu dosya çalıştırılmaz; Önizleme panelinde görüntülenir.", EN: "This file isn't executed; it's shown in the Preview panel." },
    duplicateSuffix: { TR: "kopya", EN: "copy" },
    paletteSave: { TR: "Kaydet", EN: "Save" },
    paletteDownload: { TR: "Bu dosyayı indir", EN: "Download this file" },
    paletteDownloadProject: { TR: "Projeyi ZIP olarak indir", EN: "Download the project as ZIP" },
    paletteUpload: { TR: "Dosya yükle", EN: "Upload files" },
    paletteShare: { TR: "Kod parçacığını paylaş", EN: "Share snippet" },
    paletteShortcuts: { TR: "Klavye kısayolları", EN: "Keyboard shortcuts" },
    palettePanel: { TR: "Çıktı panelini aç/kapat", EN: "Toggle the output panel" },
    paletteInput: { TR: "Program girdisini düzenle", EN: "Edit program input" },
    monacoPalette: { TR: "Editör komutları (F1)", EN: "Editor commands (F1)" },
    withShortcut: { TR: "{label} ({shortcut})", EN: "{label} ({shortcut})" },
    uploadIssue: { TR: "{name} ({reason})", EN: "{name} ({reason})" },
    nameTooLong: { TR: "Dosya adı en fazla 120 karakter olabilir.", EN: "File names can be at most 120 characters long." },
    quickActions: { TR: "Hızlı işlemler", EN: "Quick actions" },
    monacoRun: { TR: "Hanogt: Çalıştır", EN: "Hanogt: Run" },
    monacoRunActive: { TR: "Hanogt: Yalnızca bu dosyayı çalıştır", EN: "Hanogt: Run this file only" },
    monacoSave: { TR: "Hanogt: Kaydet", EN: "Hanogt: Save" },
    monacoQuickActions: { TR: "Hanogt: Hızlı işlemler", EN: "Hanogt: Quick actions" },
    panel: { TR: "Panel", EN: "Panel" },
    editMenu: { TR: "Düzenle", EN: "Edit" },
    editGroup: { TR: "Düzenleme", EN: "Editing" },
    fileGroup: { TR: "Dosya", EN: "File" },
    mediaGroup: { TR: "Hanogt Media", EN: "Hanogt Media" },
    undo: { TR: "Geri al", EN: "Undo" },
    redo: { TR: "Yinele", EN: "Redo" },
    find: { TR: "Bul", EN: "Find" },
    replace: { TR: "Bul ve değiştir", EN: "Find and replace" },
    goToLine: { TR: "Satıra git", EN: "Go to line" },
    toggleComment: { TR: "Yorum satırı aç/kapat", EN: "Toggle line comment" },
    selectAll: { TR: "Tümünü seç", EN: "Select all" },
    copyAll: { TR: "Tüm kodu kopyala", EN: "Copy all code" },
    copiedAll: { TR: "{name} panoya kopyalandı.", EN: "{name} was copied to the clipboard." },
    copyFailed: { TR: "Panoya kopyalanamadı; tarayıcınız pano erişimine izin vermiyor olabilir.", EN: "Couldn't copy to the clipboard; your browser may not allow clipboard access." },
    duplicateFile: { TR: "Dosyayı çoğalt", EN: "Duplicate file" },
    deleteFile: { TR: "Dosyayı sil", EN: "Delete file" },
    deleteTitle: { TR: "Dosya silinsin mi?", EN: "Delete the file?" },
    deleteMessage: { TR: "{name} bu çalışma alanından kaldırılacak ve içindeki kod silinecek.", EN: "{name} will be removed from this workspace and its code deleted." },
    deleteMessageProject: { TR: "{name} projeden kaldırılacak. Proje kaydedildiğinde buluttaki kopyası da silinir.", EN: "{name} will be removed from the project. Its cloud copy is deleted when you save the project." },
    deleted: { TR: "{name} silindi.", EN: "{name} was deleted." },
    lastFile: { TR: "Son dosya silinemez; önce yeni bir dosya oluşturun.", EN: "The last file can't be deleted; create another file first." },
    importDoneMany: { TR: "{count} dosya editörde açıldı (kaydedilmedi).", EN: "{count} files were opened in the editor (not saved yet)." },
    importSkipped: { TR: "{count} dosya açılamadı (çok büyük veya okunamadı).", EN: "{count} files couldn't be opened (too large or unreadable)." },
    unpublishTitle: { TR: "Yayından kaldırılsın mı?", EN: "Unpublish the post?" },
    unpublishMessage: { TR: "“{title}” Hanogt Media'dan kaldırılacak; beğenileri ve yorumları da silinir. Editördeki kodunuz etkilenmez.", EN: "“{title}” will be removed from Hanogt Media together with its likes and comments. The code in the editor isn't affected." },
    unpublished: { TR: "Yayın Media'dan kaldırıldı.", EN: "The post was removed from Media." },
    alreadyUnpublished: { TR: "Yayın zaten kaldırılmış.", EN: "The post had already been removed." },
    linkCopied: { TR: "Yayın bağlantısı kopyalandı.", EN: "The post link was copied." },
    editorNotReady: { TR: "Editör henüz hazır değil.", EN: "The editor isn't ready yet." },
    collabRemoveTitle: { TR: "Dosya herkes için kaldırılsın mı?", EN: "Remove the file for everyone?" },
    collabRemoveMessage: { TR: "{name} canlı oturumdaki herkes için kaldırılacak.", EN: "{name} will be removed for everyone in the live session." },
    collabRemoveMany: { TR: "{count} dosya canlı oturumdaki herkes için kaldırılacak.", EN: "{count} files will be removed for everyone in the live session." },
    collabRemove: { TR: "Kaldır", EN: "Remove" },
    collabFinalSaved: { TR: "Canlı oturum bitti; kodun son hâli projene kaydedildi.", EN: "The live session ended; the final code was saved to your project." },
    collabFinalLocal: { TR: "Canlı oturum bitti; kodun son hâli editörde. Projene kaydetmeyi unutma.", EN: "The live session ended; the final code is in the editor. Remember to save it." },
    collabKept: { TR: "{count} dosya editörüne eklendi (kaydedilmedi).", EN: "{count} files were added to your editor (not saved yet)." },
    collabPublishOwner: { TR: "Oturumdaki kodu yalnızca oturum sahibi yayınlayabilir.", EN: "Only the session's owner can publish its code." },
    collabAutoSave: { TR: "Canlı oturum: değişiklikler anında paylaşılır", EN: "Live session: changes are shared instantly" },
} satisfies Record<string, Copy>;

const ISSUE_LABELS: Record<UploadIssue["reason"], Copy> = {
    too_large: { TR: "500 KB'tan büyük", EN: "larger than 500 KB" },
    binary: { TR: "metin değil", EN: "not a text file" },
    unreadable: { TR: "okunamadı", EN: "unreadable" },
    limit: { TR: "sekme sınırı doldu", EN: "tab limit reached" },
    zip_failed: { TR: "ZIP açılamadı", EN: "invalid ZIP" },
};

const IMPORT_ERRORS: Record<EditorImportError, Copy> = {
    invalid_payload: { TR: "Açılacak kod okunamadı.", EN: "The code to open couldn't be read." },
    empty_code: { TR: "Açılacak kod boş.", EN: "The code to open is empty." },
    too_large: { TR: "Kod editörde açmak için çok büyük (en fazla 500 KB).", EN: "The code is too large to open in the editor (500 KB max)." },
    unsupported_language: { TR: "Kodun dili tanınmadı.", EN: "The code's language isn't supported." },
    storage_unavailable: { TR: "Tarayıcı depolaması kullanılamadığı için kod açılamadı.", EN: "The code couldn't be opened because browser storage is unavailable." },
    not_found: { TR: "Açılacak kod bulunamadı; bağlantı daha önce kullanılmış olabilir.", EN: "The code to open wasn't found; the link may have been used already." },
    expired: { TR: "Açma isteğinin süresi doldu; lütfen tekrar deneyin.", EN: "The request to open the code expired; please try again." },
};

function EditorContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const initialLang = searchParams.get("lang");
    const projectId = searchParams.get("id");
    const gameProjectId = searchParams.get("gameProject") || searchParams.get("gameProjectId");
    const requestedGameScriptId = searchParams.get("gameScript") || searchParams.get("scriptId");
    const requestedGameScriptName = searchParams.get("scriptName") || "";
    const requestedReturn = searchParams.get("returnTo") || "";
    const importId = searchParams.get(EDITOR_IMPORT_PARAM);
    const backHref = requestedReturn.startsWith("/game-engine") ? requestedReturn : "/dashboard";
    const isGameMode = Boolean(gameProjectId);
    const { data: session, status: sessionStatus } = useSession();
    const sessionEmail = session?.user?.email || "";
    // How many files one run starts at once: Free 8, Plus 25, Pro 75 (the server counts its own files a minute).
    const plan = useMyPlan(sessionEmail || null);
    const maxRunFiles = PLAN_RUN_LIMITS[plan].files;
    const { tx, language: uiLanguage, dir } = useI18n();
    const { theme: siteTheme, toggle: toggleSiteTheme } = useTheme();
    const settings = useEditorSettings();
    const mac = useIsMac();
    const { toasts, push: toast, dismiss: dismissToast } = useToasts();
    const [confirmDialog, confirm] = useConfirm();

    // The loader reads the latest translator without re-running on language changes.
    const txRef = useRef(tx);
    useEffect(() => {
        txRef.current = tx;
    }, [tx]);
    // Remembers which (project, user) combination is loaded so a session
    // refresh does not wipe the open tabs and the user's unsaved code.
    const loadedKeyRef = useRef<string | null>(null);

    /** The page's own tabs. During a live session the editor shows the session's files instead (`tabs` below). */
    const [localTabs, setLocalTabs] = useState<EditorTab[]>([]);
    const [activeTabId, setActiveTabId] = useState("");
    const [ready, setReady] = useState(false);
    const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);
    const [currentProjectName, setCurrentProjectName] = useState("");
    const [wasOriginallyMultiTab, setWasOriginallyMultiTab] = useState<boolean | null>(null);
    const [currentGameScriptId, setCurrentGameScriptId] = useState<string | null>(requestedGameScriptId);
    const [gameScriptRevision, setGameScriptRevision] = useState<string | null>(null);
    /** A name for an unsaved workspace opened from elsewhere (a Media post's title). */
    const [importedTitle, setImportedTitle] = useState("");
    /** A file was deleted; the workspace counts as changed until it is saved. */
    const [structureDirty, setStructureDirty] = useState(false);

    // Live session ("Ekiple düzenle", src/lib/collab): while one is shown, the
    // tabs are the session's files and tab changes go to the shared document.
    // Collaboration goes through /api/collab, so it follows the NextAuth session itself, not the Firebase bridge.
    const bridge = useFirebaseBridge();
    const rawSession = useRawSession();
    const finishCollabRef = useRef<(closed: CollabClosed) => void>(() => undefined);
    const startedCollabRef = useRef<() => void>(() => undefined);
    const collab = useEditorCollab({
        enabled: rawSession.status === "authenticated" && !isGameMode,
        realtime: bridge.ready,
        requestedId: searchParams.get(COLLAB_PARAM),
        onActivateFile: setActiveTabId,
        onNotice: (notice) => toast(collabNoticeToast(notice, txRef.current)),
        onError: (code) => toast({ tone: code === "not_found" || code === "ended" ? "warning" : "error", message: txRef.current(COLLAB_ERROR_COPY[code]) }),
        onStarted: () => startedCollabRef.current(),
        onClosed: (closed) => finishCollabRef.current(closed),
    });
    const collabFiles = collab.files;
    const collabTabs = useMemo<EditorTab[] | null>(() => (collab.active && collabFiles
        ? collabFiles.map((file) => ({ id: file.id, name: file.name, lang: file.lang, code: file.code, isSaved: true }))
        : null), [collab.active, collabFiles]);
    const tabs = collabTabs ?? localTabs;
    const tabsRef = useRef(tabs);
    useEffect(() => {
        tabsRef.current = tabs;
    }, [tabs]);
    const collabSessionRef = collab.sessionRef;
    /** Changes the tabs: the live session's files while one is shown (only the intended change is applied), else the page's own. */
    const setTabs = useCallback((value: SetStateAction<EditorTab[]>) => {
        const live = collabSessionRef.current;
        if (live && !live.isClosed && live.getState().files) {
            const base = tabsRef.current;
            live.applyTabChanges(base, typeof value === "function" ? value(base) : value);
            return;
        }
        setLocalTabs(value);
    }, [collabSessionRef]);

    // The workspace's Hanogt Media post: saved projects and game scripts are
    // remembered by key, unsaved drafts with the recovered tabs.
    const workspaceKey = isGameMode
        ? (gameProjectId && currentGameScriptId ? `game:${gameProjectId}:${currentGameScriptId}` : null)
        : currentProjectId !== null ? `project:${currentProjectId}` : null;
    const { publication, setPublication, record: recordPublication, forget: forgetPublication } = useMediaPublication(sessionEmail, workspaceKey);
    const [publishKey, setPublishKey] = useState(0);
    const [unpublishing, setUnpublishing] = useState(false);

    const [stdin, setStdin] = useState("");
    const [run, setRun] = useState<RunState | null>(null);
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const runCounter = useRef(0);
    const abortRef = useRef<AbortController | null>(null);

    const [panelTab, setPanelTab] = useState<"console" | "preview" | "team">("console");
    const [consoleTab, setConsoleTab] = useState<ConsoleTab>("output");
    const [panelOpen, setPanelOpen] = useState(true);
    const [panelWidth, setPanelWidth] = useState(440);
    const [previewKey, setPreviewKey] = useState(0);
    const [dialog, setDialog] = useState<DialogName>(null);
    const [saveDialog, setSaveDialog] = useState<{ key: number; defaultName: string }>({ key: 0, defaultName: "" });
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState(false);
    const savingRef = useRef(false);
    const [renameRequest, setRenameRequest] = useState<{ id: string; nonce: number } | null>(null);
    const [dragDepth, setDragDepth] = useState(0);
    const [menuOpen, setMenuOpen] = useState<"run" | "more" | null>(null);
    const [editorInstance, setEditorInstance] = useState<editor.IStandaloneCodeEditor | null>(null);
    const [monacoInstance, setMonacoInstance] = useState<MonacoApi | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const splitRef = useRef<HTMLDivElement>(null);
    const runMenuRef = useRef<HTMLDivElement>(null);
    const moreMenuRef = useRef<HTMLDivElement>(null);
    const pendingReveal = useRef<{ tabId: string; line: number; column?: number } | null>(null);
    const consumedImports = useRef(new Set<string>());

    const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
    /** The tab shown in the editor (falls back to the first tab if the selection is stale). */
    const shownTabId = activeTab?.id ?? "";
    const activeLanguage: LanguageInfo = (activeTab && getLanguage(activeTab.lang)) || PLAINTEXT_LANGUAGE;
    const isWebProject = tabs.some((tab) => tab.lang === "html");
    const modShortcut = (key: string, shift = false) => formatShortcut(shift ? ["Mod", "Shift", key] : ["Mod", key], mac);

    // The open file goes to Hanogt AI (the dock and its "attach the open file" switch), a moment after typing stops,
    // with the errors of its last run and the names of the other files (sent only when the AI settings allow).
    const aiCode = activeTab?.code;
    const aiLanguage = activeTab?.lang;
    const aiFileName = activeTab?.name;
    const aiTabId = activeTab?.id;
    const aiRunErrors = useMemo(() => {
        const job = run?.status === "done" ? run.entries.find((entry) => entry.tabId === aiTabId)?.job : null;
        if (!job || (job.run.code === 0 && !job.run.stderr.trim() && !job.failure)) return "";
        return (job.run.stderr.trim() || job.run.output).slice(-3_000);
    }, [run, aiTabId]);
    const aiOtherFiles = useMemo(() => tabs.filter((tab) => tab.id !== aiTabId).map((tab) => tab.name).join("\n"), [tabs, aiTabId]);
    useEffect(() => {
        const timer = window.setTimeout(() => publishAiContext(aiFileName === undefined ? { path: "/editor" } : {
            code: aiCode,
            language: aiLanguage,
            fileName: aiFileName,
            path: "/editor",
            tabId: aiTabId,
            ...(aiRunErrors ? { consoleErrors: aiRunErrors } : {}),
            ...(aiOtherFiles ? { projectFiles: aiOtherFiles.split("\n") } : {}),
        }), 300);
        return () => window.clearTimeout(timer);
    }, [aiCode, aiLanguage, aiFileName, aiTabId, aiRunErrors, aiOtherFiles]);
    useEffect(() => () => publishAiContext(null), []);

    // ------------------------------------------------------------------ loading
    useEffect(() => {
        const stored = Number(readStorage(PANEL_WIDTH_KEY));
        if (!Number.isFinite(stored) || stored < 280) return;
        const frame = window.requestAnimationFrame(() => setPanelWidth(Math.min(stored, 1200)));
        return () => window.cancelAnimationFrame(frame);
    }, []);

    useEffect(() => {
        if (sessionStatus === "loading") return;
        const loadKey = loadKeyOf(sessionEmail, initialLang, projectId, gameProjectId, requestedGameScriptId, requestedGameScriptName);
        if (loadedKeyRef.current === loadKey) return;
        loadedKeyRef.current = loadKey;
        const stillCurrent = () => loadedKeyRef.current === loadKey;
        const translate = txRef.current;
        const open = (next: EditorTab[], project?: { id: number | null; name: string; multi: boolean | null }, published: MediaPublication | null = null) => {
            if (!stillCurrent()) return;
            setLocalTabs(next);
            setActiveTabId(next[0]?.id ?? "");
            if (project) {
                setCurrentProjectId(project.id);
                setCurrentProjectName(project.name);
                setWasOriginallyMultiTab(project.multi);
            }
            setPublication(published);
            setImportedTitle("");
            setStructureDirty(false);
            setReady(true);
        };
        const projectTabs = (project: { files?: Array<{ name: string; lang: string; code: string }>; isMultiTab?: boolean; lang: string; code: string; name: string }): EditorTab[] | null => {
            if (project.files?.length) return project.files.map((file) => toTab(file, true)).filter((tab): tab is EditorTab => Boolean(tab));
            if (project.isMultiTab || project.lang === "multi") {
                try {
                    const parsed = JSON.parse(project.code) as StoredTab[];
                    const list = parsed.map((file) => toTab(file, true)).filter((tab): tab is EditorTab => Boolean(tab));
                    if (list.length) return list;
                } catch (error) {
                    console.error("Error parsing multi-tab project:", error);
                }
            }
            const single = toTab({ name: project.name, lang: project.lang, code: project.code }, true);
            return single ? [single] : null;
        };

        const load = async () => {
            if (gameProjectId && sessionEmail) {
                try {
                    if (requestedGameScriptId) {
                        const response = await fetch(`/api/game-projects/${encodeURIComponent(gameProjectId)}/scripts/${encodeURIComponent(requestedGameScriptId)}`, { cache: "no-store" });
                        const payload = await response.json() as { script?: GameScriptResponse; error?: string };
                        if (!response.ok || !payload.script) throw new Error(payload.error || "");
                        const script = payload.script;
                        if (!stillCurrent()) return;
                        setCurrentGameScriptId(script.id);
                        setGameScriptRevision(script.revision || null);
                        open([{ id: `game-script-${script.id}`, name: script.name, lang: script.language, code: script.content, isSaved: true }], { id: null, name: script.name, multi: false }, storedPublication(sessionEmail, `game:${gameProjectId}:${script.id}`));
                        return;
                    }
                    const language = normalizeLanguageId(initialLang) === "cpp" ? "cpp" : "csharp";
                    const name = requestedGameScriptName || (language === "cpp" ? "GameScript.cpp" : "GameScript.cs");
                    open([{ id: newTabId(), name, lang: language, code: getLanguage(language)?.template ?? "", isSaved: false }], { id: null, name, multi: false });
                    return;
                } catch (error) {
                    toast({ tone: "error", message: error instanceof Error && error.message ? error.message : translate(C.gameLoadFailed) });
                }
            }

            if (projectId && sessionEmail) {
                try {
                    const project = (await getProjectsFromCloud(sessionEmail)).find((item) => String(item.id) === projectId);
                    const loaded = project ? projectTabs(project) : null;
                    if (project && loaded?.length) {
                        open(loaded, { id: Number(project.id), name: project.name, multi: loaded.length > 1 }, storedPublication(sessionEmail, `project:${Number(project.id)}`));
                        return;
                    }
                } catch (error) {
                    console.error("Error loading from cloud:", error);
                }
                const local = getProjects(sessionEmail).find((item) => String(item.id) === projectId);
                const loaded = local ? projectTabs(local) : null;
                if (local && loaded?.length) {
                    open(loaded, { id: local.id, name: local.name, multi: loaded.length > 1 }, storedPublication(sessionEmail, `project:${local.id}`));
                    return;
                }
            }

            // Recovered tabs are restored when no specific project or language was requested.
            const recovery = !projectId && !initialLang ? readRecovery(sessionEmail) : null;
            if (recovery) {
                const published = recovery.projectId === null ? recovery.publication : storedPublication(sessionEmail, `project:${recovery.projectId}`) ?? recovery.publication;
                open(recovery.tabs, { id: recovery.projectId, name: recovery.projectName, multi: recovery.projectId === null ? null : recovery.tabs.length > 1 }, published);
                return;
            }
            if (importId && !initialLang) {
                // The import effect below adds the file; no default tab is needed.
                open([]);
                return;
            }
            const language = getLanguage(normalizeLanguageId(initialLang) ?? readEditorSettings().defaultLanguage) ?? getLanguage("javascript")!;
            open([{ id: newTabId(), name: language.defaultFileName, lang: language.id, code: language.template, isSaved: false }]);
            if (language.engine === "preview") setPanelTab("preview");
        };
        void load();
    }, [initialLang, projectId, gameProjectId, requestedGameScriptId, requestedGameScriptName, sessionEmail, sessionStatus, importId, toast, setPublication]);

    // Code opened from another page (Hanogt AI, Groups, Media…) through src/lib/editor-bridge.ts.
    // The entry is consumed once; the result waits in a ref because removing the
    // parameter from the URL re-renders the page before the timer below fires.
    const pendingImport = useRef<ReturnType<typeof consumeEditorImportBundle> | "game" | null>(null);
    useEffect(() => {
        if (!ready) return;
        if (importId && !consumedImports.current.has(importId)) {
            consumedImports.current.add(importId);
            pendingImport.current = isGameMode ? "game" : consumeEditorImportBundle(importId);
            const url = new URL(window.location.href);
            url.searchParams.delete(EDITOR_IMPORT_PARAM);
            window.history.replaceState(null, "", url);
        }
        if (!pendingImport.current) return;
        const timer = window.setTimeout(() => {
            const result = pendingImport.current;
            pendingImport.current = null;
            if (!result) return;
            if (result === "game") {
                toast({ tone: "warning", message: tx(C.gameNoFiles) });
                return;
            }
            const current = tabsRef.current;
            if (!result.ok) {
                toast({ tone: "error", message: tx(IMPORT_ERRORS[result.error]) });
                if (!current.length) {
                    const fallback = getLanguage("javascript")!;
                    const tab = { id: newTabId(), name: fallback.defaultFileName, lang: fallback.id, code: fallback.template, isSaved: false };
                    setTabs([tab]);
                    setActiveTabId(tab.id);
                }
                return;
            }
            const { files, title, mediaPostId, skipped } = result.bundle;
            if (skipped) toast({ tone: "warning", message: tx(C.importSkipped, { count: skipped }) });
            if (current.length >= MAX_TABS) {
                toast({ tone: "error", message: tx(C.tooManyTabs, { count: MAX_TABS }) });
                return;
            }
            const names = current.map((item) => item.name);
            const room = MAX_TABS - current.length;
            const added: EditorTab[] = files.slice(0, room).map((file) => {
                const name = uniqueFileName(file.name, names);
                names.push(name);
                return { id: newTabId(), name, lang: file.language, code: file.code, isSaved: false };
            });
            if (files.length > room) toast({ tone: "warning", message: tx(C.tooManyTabs, { count: MAX_TABS }) });
            setTabs([...current, ...added]);
            setActiveTabId(added[0].id);
            if (!current.length) {
                // An empty editor: the files form a new, unsaved workspace. A Media
                // project keeps its title, and its owner can update the same post.
                setImportedTitle(title ?? "");
                if (mediaPostId) setPublication({ postId: mediaPostId, title: title ?? "", at: new Date().toISOString() });
            }
            if (added.some((tab) => getLanguage(tab.lang)?.engine === "preview")) setPanelTab("preview");
            toast({ tone: "success", message: added.length === 1 ? tx(C.importDone, { name: added[0].name }) : tx(C.importDoneMany, { count: added.length }) });
        }, 0);
        return () => window.clearTimeout(timer);
    }, [ready, importId, isGameMode, toast, tx, setPublication, setTabs]);

    // Unsaved tabs survive a reload (not for game scripts, which have their own storage,
    // nor a live session's files, which belong to the session).
    useEffect(() => {
        if (!ready || isGameMode || collabTabs) return;
        const timer = window.setTimeout(() => {
            if (!tabs.length || tabs.every((tab) => tab.isSaved)) {
                writeStorage(RECOVERY_KEY, null);
                writeStorage(RECOVERY_PROJECT_KEY, null);
                return;
            }
            // Same shape as before (output/isRunning included) for older readers.
            const serialized = JSON.stringify(tabs.map(({ id, name, lang, code, isSaved }) => ({ id, name, lang, code, output: [], isRunning: false, isSaved })));
            const fits = serialized.length <= 1_000_000;
            writeStorage(RECOVERY_KEY, fits ? serialized : null);
            // Saved projects remember their Media post by project id; a draft keeps it here.
            const draftPublication = publication && workspaceKey === null && sessionEmail ? { ...publication, owner: ownerTag(sessionEmail) } : null;
            const meta = currentProjectId !== null || draftPublication
                ? { projectId: currentProjectId, projectName: currentProjectName, tabIds: tabs.map((tab) => tab.id), ...(draftPublication ? { publication: draftPublication } : {}) }
                : null;
            writeStorage(RECOVERY_PROJECT_KEY, fits && meta ? JSON.stringify(meta) : null);
        }, 500);
        return () => window.clearTimeout(timer);
    }, [tabs, ready, isGameMode, collabTabs, currentProjectId, currentProjectName, publication, workspaceKey, sessionEmail]);

    // ------------------------------------------------------------------ tabs
    const updateTabs = useCallback((updater: (current: EditorTab[]) => EditorTab[]) => setTabs(updater), [setTabs]);

    const addTabs = useCallback((files: Array<{ name: string; lang: string; code: string }>, activate = true) => {
        const current = tabsRef.current;
        if (isGameMode) {
            toast({ tone: "warning", message: tx(C.gameNoFiles) });
            return [];
        }
        const room = MAX_TABS - current.length;
        if (room <= 0) {
            toast({ tone: "error", message: tx(C.tooManyTabs, { count: MAX_TABS }) });
            return [];
        }
        const names = current.map((tab) => tab.name);
        const added = files.slice(0, room).map((file) => {
            const name = uniqueFileName(file.name, names);
            names.push(name);
            return { id: newTabId(), name, lang: file.lang, code: file.code, isSaved: false };
        });
        if (files.length > room) toast({ tone: "warning", message: tx(C.tooManyTabs, { count: MAX_TABS }) });
        setTabs([...current, ...added]);
        if (activate && added[0]) setActiveTabId(added[0].id);
        return added;
    }, [isGameMode, setTabs, toast, tx]);

    const handleCodeChange = useCallback((value: string | undefined) => {
        const code = value ?? "";
        setTabs((current) => current.map((tab) => (tab.id === shownTabId && tab.code !== code ? { ...tab, code, isSaved: false } : tab)));
    }, [setTabs, shownTabId]);

    // "Apply to editor" from Hanogt AI: the tab on screen changes through Monaco, so Undo takes it back;
    // another tab is changed directly and brought to the front. A file that changed since Hanogt AI read it is only
    // overwritten once the person confirms in the chat.
    useApplyRequests((request: ApplyRequest) => {
        const target = (request.tabId ? tabs.find((tab) => tab.id === request.tabId) : undefined) ?? tabs.find((tab) => tab.name === request.fileName);
        if (!target) return "missing";
        if (target.code !== request.base && !request.force) return "changed";
        const model = target.id === shownTabId ? editorInstance?.getModel() : null;
        if (model && editorInstance) {
            editorInstance.pushUndoStop();
            editorInstance.executeEdits("hanogt-ai", [{ range: model.getFullModelRange(), text: request.code, forceMoveMarkers: true }]);
            editorInstance.pushUndoStop();
        } else {
            setTabs((current) => current.map((tab) => (tab.id === target.id ? { ...tab, code: request.code, isSaved: false } : tab)));
            setActiveTabId(target.id);
        }
        return "applied";
    });

    /** Removes tabs (never the last one) and activates a neighbour of the active tab when it goes. */
    const removeTabs = useCallback((ids: string[]) => {
        const current = tabsRef.current;
        const remaining = current.filter((tab) => !ids.includes(tab.id));
        if (!remaining.length || remaining.length === current.length) return false;
        setTabs(remaining);
        setActiveTabId((active) => {
            if (!ids.includes(active)) return active;
            const index = current.findIndex((tab) => tab.id === active);
            const neighbour = current.slice(index + 1).find((tab) => !ids.includes(tab.id)) ?? [...current.slice(0, index)].reverse().find((tab) => !ids.includes(tab.id));
            return neighbour?.id ?? remaining[0].id;
        });
        return true;
    }, [setTabs]);

    const closeTabs = useCallback(async (ids: string[]) => {
        const current = tabsRef.current;
        const closing = current.filter((tab) => ids.includes(tab.id));
        if (!closing.length || closing.length >= current.length) return;
        if (collabTabs) {
            // In a live session a closed tab is a file removed for everyone.
            const accepted = await confirm({
                title: tx(C.collabRemoveTitle),
                message: closing.length === 1 ? tx(C.collabRemoveMessage, { name: closing[0].name }) : tx(C.collabRemoveMany, { count: closing.length }),
                confirmLabel: tx(C.collabRemove),
                destructive: true,
            });
            if (accepted) removeTabs(ids);
            return;
        }
        const unsaved = readEditorSettings().confirmCloseUnsaved ? closing.filter((tab) => !tab.isSaved) : [];
        if (unsaved.length) {
            const accepted = await confirm({
                title: tx(C.closeUnsavedTitle),
                message: unsaved.length === 1 ? tx(C.closeUnsaved, { name: unsaved[0].name }) : tx(C.closeManyUnsaved, { count: unsaved.length }),
                confirmLabel: tx(C.closeConfirm),
                destructive: true,
            });
            if (!accepted) return;
        }
        removeTabs(ids);
    }, [collabTabs, confirm, removeTabs, tx]);

    /** "Delete file": always confirmed, and the project counts as changed until it is saved. */
    const deleteTab = useCallback(async (id: string) => {
        const tab = tabsRef.current.find((item) => item.id === id);
        if (!tab) return;
        if (tabsRef.current.length < 2) {
            toast({ tone: "info", message: tx(C.lastFile) });
            return;
        }
        const accepted = await confirm({
            title: tx(C.deleteTitle),
            message: tx(currentProjectId !== null ? C.deleteMessageProject : C.deleteMessage, { name: tab.name }),
            confirmLabel: tx(C.deleteFile),
            destructive: true,
        });
        if (!accepted || !removeTabs([id])) return;
        setStructureDirty(true);
        toast({ tone: "info", message: tx(C.deleted, { name: tab.name }) });
    }, [confirm, currentProjectId, removeTabs, toast, tx]);

    const renameTab = useCallback((id: string, rawName: string): string | null => {
        const name = rawName.trim().replace(/\s+/g, " ");
        if (!name) return tx(C.nameEmpty);
        if (/[\\/\u0000-\u001f]/.test(name)) return tx(C.nameInvalid);
        if (name.length > 120) return tx(C.nameTooLong);
        const current = tabsRef.current;
        if (current.some((tab) => tab.id !== id && tab.name.toLowerCase() === name.toLowerCase())) return tx(C.nameTaken);
        const detected = languageFromFileName(name);
        const target = current.find((tab) => tab.id === id);
        if (!target) return null;
        const switchLanguage = Boolean(detected && detected.id !== target.lang && !isGameMode);
        setTabs(current.map((tab) => (tab.id === id ? { ...tab, name, lang: switchLanguage && detected ? detected.id : tab.lang, isSaved: false } : tab)));
        if (switchLanguage && detected) toast({ tone: "info", message: tx(C.languageChanged, { language: detected.name }) });
        return null;
    }, [isGameMode, setTabs, toast, tx]);

    const duplicateTab = useCallback((id: string) => {
        const current = tabsRef.current;
        const index = current.findIndex((tab) => tab.id === id);
        if (index < 0 || isGameMode) return;
        if (current.length >= MAX_TABS) {
            toast({ tone: "error", message: tx(C.tooManyTabs, { count: MAX_TABS }) });
            return;
        }
        const source = current[index];
        const dot = source.name.lastIndexOf(".");
        const base = dot > 0 ? `${source.name.slice(0, dot)}-${tx(C.duplicateSuffix)}${source.name.slice(dot)}` : `${source.name}-${tx(C.duplicateSuffix)}`;
        const copy: EditorTab = { ...source, id: newTabId(), name: uniqueFileName(base, current.map((tab) => tab.name)), isSaved: false };
        setTabs([...current.slice(0, index + 1), copy, ...current.slice(index + 1)]);
        setActiveTabId(copy.id);
    }, [isGameMode, setTabs, toast, tx]);

    const reorderTabs = useCallback((fromId: string, toId: string) => {
        updateTabs((current) => {
            const from = current.findIndex((tab) => tab.id === fromId);
            const to = current.findIndex((tab) => tab.id === toId);
            if (from < 0 || to < 0 || from === to) return current;
            const next = [...current];
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            return next;
        });
    }, [updateTabs]);

    const changeLanguage = useCallback((language: string) => {
        const current = tabsRef.current;
        const target = current.find((tab) => tab.id === shownTabId);
        const info = getLanguage(language);
        if (!target || !info || target.lang === language) return;
        let name = target.name;
        // "main.py" switched to JavaScript becomes "main.js"; other names keep their spelling.
        if (languageFromFileName(name)?.id === target.lang && !isGameMode) {
            const dot = name.lastIndexOf(".");
            const stem = dot > 0 ? name.slice(0, dot) : name;
            name = uniqueFileName(ensureFileExtension(stem, info.id), current.filter((tab) => tab.id !== target.id).map((tab) => tab.name));
        }
        setTabs(current.map((tab) => (tab.id === target.id ? { ...tab, lang: info.id, name, isSaved: false } : tab)));
        toast({ tone: "info", message: tx(C.languageChanged, { language: info.name }) });
    }, [shownTabId, isGameMode, setTabs, toast, tx]);

    const createFile = useCallback((request: NewFileRequest) => {
        const added = addTabs([{ name: request.name, lang: request.language, code: request.code }]);
        setDialog(null);
        if (!added.length) return;
        if (request.stdin) {
            setStdin(request.stdin);
            toast({ tone: "info", message: tx(C.stdinFromTemplate) });
        }
        if (getLanguage(request.language)?.engine === "preview") {
            setPanelOpen(true);
            setPanelTab("preview");
        }
    }, [addTabs, toast, tx]);

    const createProject = useCallback((template: ProjectTemplate) => {
        const added = addTabs(template.files.map((file) => ({ name: file.name, lang: file.language, code: file.code })));
        setDialog(null);
        if (!added.length) return;
        setPanelOpen(true);
        setPanelTab(template.kind === "web" || template.kind === "docs" ? "preview" : "console");
    }, [addTabs]);

    // ------------------------------------------------------------------ running
    const programTabs = useMemo(() => tabs.filter((tab) => isProgramLanguage(tab.lang) && tab.code.trim() && !(isWebProject && tab.lang === "javascript")), [tabs, isWebProject]);
    const previewFiles = useMemo(() => tabs.map((tab) => ({ name: tab.name, language: tab.lang, code: tab.code })), [tabs]);
    const previewActive = useMemo(() => previewFiles.find((file) => file.name === activeTab?.name), [previewFiles, activeTab?.name]);
    const hasPreview = useMemo(() => resolvePreviewTarget(previewFiles, previewActive) !== null, [previewFiles, previewActive]);
    const activeIsValidator = activeLanguage.tool === "validator";
    const activeIsProgram = isProgramLanguage(activeLanguage.id) && !(isWebProject && activeLanguage.id === "javascript");
    const isRunning = run?.status === "running";

    const runMode: "validate" | "programs" | "preview" | "none" = activeIsValidator
        ? "validate"
        : programTabs.length
            ? "programs"
            : hasPreview ? "preview" : "none";
    const notRunnableReason = runMode === "none" ? tx(C.notRunnable, { language: activeLanguage.name }) : null;

    const showPreview = useCallback(() => {
        setPanelOpen(true);
        setPanelTab("preview");
        setPreviewKey((key) => key + 1);
    }, []);

    const startRun = useCallback(async (targets: EditorTab[]) => {
        if (!targets.length || abortRef.current) return;
        const limited = targets.slice(0, maxRunFiles);
        if (targets.length > maxRunFiles) {
            const upgrade = nextPlanUp(plan);
            toast({
                tone: "warning",
                message: upgrade ? tx(C.tooManyRunsUpgrade, { count: maxRunFiles, plan: tx(PLAN_COPY[upgrade].name), more: PLAN_RUN_LIMITS[upgrade].files }) : tx(C.tooManyRuns, { count: maxRunFiles }),
                ...(upgrade ? { action: { label: tx(C.seePlans), href: "/plans" } } : {}),
            });
        }
        const id = (runCounter.current += 1);
        const controller = new AbortController();
        abortRef.current = controller;
        const started = Date.now();
        const entries: RunEntry[] = limited.map((tab) => ({ tabId: tab.id, name: tab.name, language: tab.lang, engine: BROWSER_LANGUAGES.has(tab.lang) ? "browser" : "server", job: null }));
        setRun({ id, status: "running", startedAt: started, entries, loading: null });
        setPanelOpen(true);
        setPanelTab("console");
        setConsoleTab("output");
        const update = (change: (state: RunState) => RunState) => setRun((current) => (current && current.id === id ? change(current) : current));
        try {
            const result = await executeProjectSecure(limited.map((tab) => ({ name: tab.name, language: tab.lang, code: tab.code })), {
                stdin,
                locale: uiLanguage === "TR" ? "tr" : "en",
                indent: settings.tabSize,
                signal: controller.signal,
                onStatus: (status) => update((state) => ({ ...state, loading: status })),
                onJob: (job, index) => update((state) => ({ ...state, loading: job.language === "python" ? null : state.loading, entries: state.entries.map((entry, position) => (position === index ? { ...entry, job } : entry)) })),
            });
            const jobs = result.response?.jobs ?? [];
            update((state) => ({ ...state, status: "done", finishedAt: Date.now(), loading: null, security: result.blocked ? result.securityCheck : undefined }));
            setHistory((previous) => [{
                id,
                at: Date.now(),
                label: limited.map((tab) => tab.name).join(", "),
                count: limited.length,
                ok: !result.blocked && jobs.length === limited.length && jobs.every((job) => !job.failure && job.run.code === 0),
                durationMs: Date.now() - started,
            }, ...previous].slice(0, 50));
        } catch (error) {
            update((state) => ({ ...state, status: "done", finishedAt: Date.now(), loading: null, error: error instanceof Error ? error.message : String(error) }));
        } finally {
            if (abortRef.current === controller) abortRef.current = null;
        }
    }, [maxRunFiles, plan, settings.tabSize, stdin, toast, tx, uiLanguage]);

    const handleRun = useCallback(() => {
        if (isRunning) return;
        if (runMode === "validate" && activeTab) {
            void startRun([activeTab]);
            return;
        }
        if (runMode === "programs") {
            // The active file runs first when there are more than the plan runs at once.
            const ordered = activeIsProgram && activeTab ? [activeTab, ...programTabs.filter((tab) => tab.id !== activeTab.id)] : programTabs;
            if (isWebProject) setPreviewKey((key) => key + 1);
            void startRun(ordered);
            return;
        }
        if (runMode === "preview") {
            showPreview();
            return;
        }
        if (notRunnableReason) toast({ tone: "info", message: notRunnableReason });
    }, [activeIsProgram, activeTab, isRunning, isWebProject, notRunnableReason, programTabs, runMode, showPreview, startRun, toast]);

    const handleRunActive = useCallback(() => {
        if (isRunning || !activeTab) return;
        if (activeIsProgram || activeIsValidator) {
            void startRun([activeTab]);
            return;
        }
        if (activeLanguage.engine === "preview" || (isWebProject && activeLanguage.id === "javascript")) {
            showPreview();
            return;
        }
        toast({ tone: "info", message: tx(C.notRunnable, { language: activeLanguage.name }) });
    }, [activeIsProgram, activeIsValidator, activeLanguage, activeTab, isRunning, isWebProject, showPreview, startRun, toast, tx]);

    const stopRun = useCallback(() => abortRef.current?.abort(), []);

    const revealLine = useCallback((line: number, column = 1) => {
        if (!editorInstance) return;
        const model = editorInstance.getModel();
        const target = Math.min(Math.max(1, line), model?.getLineCount() ?? line);
        editorInstance.setPosition({ lineNumber: target, column: Math.max(1, column) });
        editorInstance.revealLineInCenter(target);
        editorInstance.focus();
    }, [editorInstance]);

    const goToLine = useCallback((tabId: string, line: number, column?: number) => {
        if (!tabsRef.current.some((tab) => tab.id === tabId)) return;
        if (tabId === shownTabId) {
            revealLine(line, column);
            return;
        }
        pendingReveal.current = { tabId, line, column };
        setActiveTabId(tabId);
    }, [shownTabId, revealLine]);

    useEffect(() => {
        const pending = pendingReveal.current;
        if (!pending || pending.tabId !== shownTabId || !editorInstance) return;
        const frame = window.requestAnimationFrame(() => {
            pendingReveal.current = null;
            revealLine(pending.line, pending.column);
        });
        return () => window.cancelAnimationFrame(frame);
    }, [shownTabId, editorInstance, revealLine]);

    // ------------------------------------------------------------------ saving
    // A live session's changes are shared at once; its final content is saved when it ends.
    const canAutoSave = Boolean(sessionEmail) && !collabTabs && (isGameMode ? Boolean(currentGameScriptId) : currentProjectId !== null);
    const hasUnsaved = structureDirty || tabs.some((tab) => !tab.isSaved);

    const completeSave = useCallback(async (projectName: string, projectIdToUse: number | null, silent = false): Promise<boolean> => {
        if (!sessionEmail || savingRef.current) return false;
        savingRef.current = true;
        setSaving(true);
        setSaveError(false);
        // Optional clean-ups from the settings page.
        const prepared = tabsRef.current.map((tab) => {
            let code = tab.code;
            if (settings.trimTrailingWhitespace) code = code.replace(/[ \t]+$/gm, "");
            if (settings.insertFinalNewline && code && !code.endsWith("\n")) code += "\n";
            return code === tab.code ? tab : { ...tab, code };
        });
        if (prepared.some((tab, index) => tab !== tabsRef.current[index])) setTabs(prepared);
        const fingerprint = (tab: EditorTab) => `${tab.name}\u0000${tab.lang}\u0000${tab.code}`;
        const snapshot = new Map(prepared.map((tab) => [tab.id, fingerprint(tab)]));
        const markSaved = (rename?: string) => setTabs((current) => current.map((tab, index) => {
            if (snapshot.get(tab.id) !== fingerprint(tab)) return tab;
            const name = rename && index === 0 ? rename : tab.name;
            return tab.isSaved && name === tab.name ? tab : { ...tab, name, isSaved: true };
        }));
        try {
            if (gameProjectId) {
                const scriptTab = prepared[0];
                if (!scriptTab || !GAME_LANGUAGES.includes(scriptTab.lang as typeof GAME_LANGUAGES[number])) {
                    toast({ tone: "error", message: tx(C.gameLanguages) });
                    setSaveError(true);
                    return false;
                }
                const endpoint = currentGameScriptId
                    ? `/api/game-projects/${encodeURIComponent(gameProjectId)}/scripts/${encodeURIComponent(currentGameScriptId)}`
                    : `/api/game-projects/${encodeURIComponent(gameProjectId)}/scripts`;
                const response = await fetch(endpoint, {
                    method: currentGameScriptId ? "PATCH" : "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        name: scriptTab.name || projectName,
                        language: scriptTab.lang,
                        content: scriptTab.code,
                        ...(currentGameScriptId && gameScriptRevision ? { revision: gameScriptRevision } : {}),
                    }),
                });
                const payload = await response.json().catch(() => ({})) as { script?: GameScriptResponse; error?: string };
                if (!response.ok || !payload.script) {
                    toast({ tone: "error", message: payload.error || tx(C.gameSaveFailed) });
                    setSaveError(true);
                    return false;
                }
                setCurrentGameScriptId(payload.script.id);
                setGameScriptRevision(payload.script.revision || null);
                setCurrentProjectName(payload.script.name);
                setStructureDirty(false);
                markSaved(payload.script.name);
                // The new id goes into the URL (reloads reopen this script) without reloading the open tab.
                loadedKeyRef.current = loadKeyOf(sessionEmail, initialLang, projectId, gameProjectId, payload.script.id, requestedGameScriptName);
                const url = new URL(window.location.href);
                url.searchParams.set("gameScript", payload.script.id);
                url.searchParams.delete("scriptId");
                window.history.replaceState(null, "", url);
                if (!silent) toast({ tone: "success", message: tx(C.savedGame) });
                return true;
            }
            const finalProjectId = projectIdToUse || Date.now();
            const projectData = {
                id: finalProjectId,
                name: projectName,
                lang: prepared.length === 1 ? prepared[0].lang : "multi",
                code: prepared[0]?.code || "",
                date: new Date().toLocaleDateString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
                isMultiTab: prepared.length > 1,
                files: prepared.map((tab, order) => ({ name: tab.name, lang: tab.lang, code: tab.code, order })),
            };
            const cloudSaved = await saveProjectToCloud(sessionEmail, { ...projectData, id: String(projectData.id) });
            if (!cloudSaved.ok) {
                if (cloudSaved.reason === "limit") toast({ tone: "warning", message: tx(C.projectLimit, { limit: cloudSaved.limit }), action: { label: tx(C.seePlans), href: "/plans" } });
                else toast({ tone: "error", message: tx(C.saveFailed) });
                setSaveError(true);
                return false;
            }
            saveProject(sessionEmail, projectData);
            setWasOriginallyMultiTab(prepared.length > 1);
            setCurrentProjectId(finalProjectId);
            setCurrentProjectName(projectName);
            setStructureDirty(false);
            markSaved();
            if (!silent) toast({ tone: "success", message: tx(C.saved), action: { label: tx(C.dashboard), href: "/dashboard" } });
            return true;
        } catch (error) {
            console.error("Error saving:", error);
            toast({ tone: "error", message: tx(isGameMode ? C.gameSaveFailed : C.saveFailed) });
            setSaveError(true);
            return false;
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
    }, [currentGameScriptId, gameProjectId, gameScriptRevision, initialLang, isGameMode, projectId, requestedGameScriptName, sessionEmail, setTabs, settings.insertFinalNewline, settings.trimTrailingWhitespace, toast, tx]);

    const handleSave = useCallback(() => {
        if (!sessionEmail) {
            toast({ tone: "warning", message: tx(C.signInToSave), action: { label: tx(C.signIn), href: `/login?callbackUrl=${encodeURIComponent("/editor")}` } });
            return;
        }
        // A participant's own project must not receive the session's files.
        if (collabTabs && collab.role !== "owner") {
            toast({ tone: "info", message: tx(COLLAB_NOTICE_COPY.saveParticipant) });
            return;
        }
        if (isGameMode) {
            void completeSave(currentProjectName || tabsRef.current[0]?.name || "GameScript", null);
            return;
        }
        const multi = tabsRef.current.length > 1;
        const convertingToMulti = wasOriginallyMultiTab === false && multi;
        if (!currentProjectId || convertingToMulti) {
            const first = tabsRef.current[0];
            const suggested = importedTitle || (multi || !first ? tx(C.generalProject) : tx(C.languageProject, { language: getLanguage(first.lang)?.name ?? first.lang }));
            setSaveDialog((previous) => ({ key: previous.key + 1, defaultName: suggested }));
            setDialog("save");
            return;
        }
        void completeSave(currentProjectName, currentProjectId);
    }, [collab.role, collabTabs, completeSave, currentProjectId, currentProjectName, importedTitle, isGameMode, sessionEmail, toast, tx, wasOriginallyMultiTab]);

    // Auto save (settings page): after a pause or when the editor loses focus.
    // After a failed automatic save the same content is not retried until it changes.
    const failedAutoSave = useRef<EditorTab[] | null>(null);
    const autoSave = useCallback(() => {
        void completeSave(currentProjectName, currentProjectId, true).then((ok) => {
            failedAutoSave.current = ok ? null : tabsRef.current;
        });
    }, [completeSave, currentProjectId, currentProjectName]);

    useEffect(() => {
        if (settings.autoSave !== "afterDelay" || !canAutoSave || !hasUnsaved || saving || failedAutoSave.current === tabs) return;
        const timer = window.setTimeout(autoSave, settings.autoSaveDelay);
        return () => window.clearTimeout(timer);
    }, [tabs, settings.autoSave, settings.autoSaveDelay, canAutoSave, hasUnsaved, saving, autoSave]);

    const focusSaveRef = useRef<() => void>(() => undefined);
    useEffect(() => {
        focusSaveRef.current = () => {
            const current = tabsRef.current;
            if (settings.autoSave === "onFocusChange" && canAutoSave && (structureDirty || current.some((tab) => !tab.isSaved)) && !savingRef.current && failedAutoSave.current !== current) autoSave();
        };
    });
    useEffect(() => {
        const onBlur = () => focusSaveRef.current();
        const onVisibility = () => {
            if (document.visibilityState === "hidden") focusSaveRef.current();
        };
        window.addEventListener("blur", onBlur);
        document.addEventListener("visibilitychange", onVisibility);
        const subscription = editorInstance?.onDidBlurEditorWidget(onBlur);
        return () => {
            window.removeEventListener("blur", onBlur);
            document.removeEventListener("visibilitychange", onVisibility);
            subscription?.dispose();
        };
    }, [editorInstance]);

    // ------------------------------------------------------------------ files
    const downloadTab = useCallback((id?: string) => {
        const tab = tabsRef.current.find((item) => item.id === (id ?? shownTabId)) ?? tabsRef.current[0];
        if (!tab) return;
        triggerDownload(new Blob([tab.code], { type: "text/plain;charset=utf-8" }), downloadName(tab.name, tab.lang));
    }, [shownTabId]);

    const downloadProject = useCallback(async () => {
        const current = tabsRef.current;
        if (current.length <= 1) {
            downloadTab();
            return;
        }
        try {
            const blob = await buildProjectZip(current);
            const base = (currentProjectName || "hanogt-project").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim().slice(0, 100) || "hanogt-project";
            triggerDownload(blob, `${base}.zip`);
        } catch (error) {
            console.error("Error creating ZIP:", error);
            toast({ tone: "error", message: tx(C.zipFailed) });
        }
    }, [currentProjectName, downloadTab, toast, tx]);

    const downloadSnippet = useCallback(() => {
        const tab = tabsRef.current.find((item) => item.id === shownTabId);
        if (!tab) return;
        const base = downloadName(tab.name, tab.lang).replace(/\.[^.]+$/, "");
        triggerDownload(new Blob([buildSnippetFile(tab)], { type: "application/json" }), `${base}.hanogt.json`);
    }, [shownTabId]);

    const openFiles = useCallback(async (files: File[]) => {
        if (!files.length) return;
        if (isGameMode) {
            toast({ tone: "warning", message: tx(C.gameNoFiles) });
            return;
        }
        const { files: loaded, issues } = await readUploadedFiles(files, MAX_TABS - tabsRef.current.length);
        const added = loaded.length ? addTabs(loaded.map((file) => ({ name: file.name, lang: file.language, code: file.code }))) : [];
        if (added.length > 1) toast({ tone: "success", message: tx(C.uploaded, { count: added.length }) });
        if (issues.length) {
            const list = issues.slice(0, 4).map((issue) => tx(C.uploadIssue, { name: issue.name, reason: tx(ISSUE_LABELS[issue.reason]) })).join(", ");
            toast({ tone: "warning", message: tx(C.uploadIssues, { count: issues.length, list: issues.length > 4 ? `${list}, …` : list }) });
        }
        if (added.some((tab) => getLanguage(tab.lang)?.engine === "preview")) setPanelTab("preview");
    }, [addTabs, isGameMode, toast, tx]);

    const formatDocument = useCallback(async () => {
        const action = editorInstance?.getAction("editor.action.formatDocument");
        if (!editorInstance || !action || !action.isSupported()) {
            toast({ tone: "info", message: tx(C.noFormatter, { language: activeLanguage.name }) });
            return;
        }
        editorInstance.focus();
        await action.run();
    }, [activeLanguage.name, editorInstance, toast, tx]);

    // ------------------------------------------------------------------ editing
    /** Runs a Monaco command (undo, actions.find…) as if its shortcut was pressed in the editor. */
    const runEditorCommand = useCallback((command: string) => {
        if (!editorInstance) {
            toast({ tone: "info", message: tx(C.editorNotReady) });
            return;
        }
        editorInstance.focus();
        // A live session's editor undoes only this browser's own changes (CollabCodeEditor).
        const collabAction = command === "undo" || command === "redo" ? editorInstance.getAction(`hanogt.collab.${command}`) : null;
        if (collabAction) {
            void collabAction.run();
            return;
        }
        editorInstance.trigger("hanogt", command, null);
    }, [editorInstance, toast, tx]);

    const copyAll = useCallback(async () => {
        const tab = tabsRef.current.find((item) => item.id === shownTabId);
        if (!tab) return;
        try {
            await navigator.clipboard.writeText(tab.code);
            toast({ tone: "success", message: tx(C.copiedAll, { name: tab.name }) });
        } catch {
            toast({ tone: "error", message: tx(C.copyFailed) });
        }
    }, [shownTabId, toast, tx]);

    const startRename = useCallback((id: string) => setRenameRequest((previous) => ({ id, nonce: (previous?.nonce ?? 0) + 1 })), []);

    // ------------------------------------------------------------------ media
    const openPublish = useCallback(() => {
        // The code of someone else's live session isn't the participant's to publish.
        if (collabTabs && collab.role !== "owner") {
            toast({ tone: "info", message: tx(C.collabPublishOwner) });
            return;
        }
        // A new key gives the dialog a fresh form and a fresh security check every time.
        setPublishKey((key) => key + 1);
        setDialog("publish");
    }, [collab.role, collabTabs, toast, tx]);

    const copyPublicationLink = useCallback(async () => {
        if (!publication) return;
        try {
            await navigator.clipboard.writeText(new URL(mediaPostPath(publication.postId), window.location.origin).href);
            toast({ tone: "success", message: tx(C.linkCopied) });
        } catch {
            toast({ tone: "error", message: tx(C.copyFailed) });
        }
    }, [publication, toast, tx]);

    const unpublish = useCallback(async () => {
        if (!publication || unpublishing) return;
        const accepted = await confirm({
            title: tx(C.unpublishTitle),
            message: tx(C.unpublishMessage, { title: publication.title || tx(C.generalProject) }),
            confirmLabel: tx(MEDIA_BUTTON_COPY.unpublish),
            destructive: true,
        });
        if (!accepted) return;
        setUnpublishing(true);
        try {
            await mediaAction({ action: "delete", postId: publication.postId });
            forgetPublication(publication.postId);
            toast({ tone: "success", message: tx(C.unpublished) });
        } catch (error) {
            if (error instanceof MediaApiError && error.code === "not_found") {
                forgetPublication(publication.postId);
                toast({ tone: "info", message: tx(C.alreadyUnpublished) });
            } else {
                toast({ tone: "error", message: mediaErrorText(error, tx) });
            }
        } finally {
            setUnpublishing(false);
        }
    }, [confirm, forgetPublication, publication, toast, tx, unpublishing]);

    // ------------------------------------------------------------------ live session
    const collabSignedIn = rawSession.status === "authenticated";
    const openCollab = useCallback(() => {
        if (!collabSignedIn) {
            toast({ tone: "warning", message: tx(COLLAB_COPY.signInRequired), action: { label: tx(C.signIn), href: `/login?callbackUrl=${encodeURIComponent("/editor")}` } });
            return;
        }
        if (isGameMode) {
            toast({ tone: "info", message: tx(COLLAB_COPY.gameMode) });
            return;
        }
        setDialog("collab");
    }, [collabSignedIn, isGameMode, toast, tx]);

    const openTeamPanel = useCallback(() => {
        setPanelOpen(true);
        setPanelTab("team");
    }, []);

    const copyCollabLink = useCallback(async () => {
        const id = collabSessionRef.current?.id;
        if (!id) return;
        try {
            await navigator.clipboard.writeText(new URL(`/editor?${COLLAB_PARAM}=${encodeURIComponent(id)}`, window.location.origin).href);
            toast({ tone: "success", message: tx(COLLAB_COPY.linkCopied) });
        } catch {
            toast({ tone: "error", message: tx(COLLAB_COPY.copyFailed) });
        }
    }, [collabSessionRef, toast, tx]);

    /** "Kopyayı sakla": a participant keeps the session's final files as unsaved tabs. */
    const keepCollabCopy = useCallback((files: CollabFileContent[]) => {
        const added = addTabs(files.map((file) => ({ name: file.name, lang: file.lang, code: file.code })));
        if (added.length) toast({ tone: "success", message: tx(C.collabKept, { count: added.length }) });
    }, [addTabs, toast, tx]);

    /** The tab that was open before a live session; it comes back afterwards. */
    const localActiveRef = useRef("");
    useEffect(() => {
        if (!collabTabs) localActiveRef.current = activeTabId;
    }, [collabTabs, activeTabId]);

    useEffect(() => {
        startedCollabRef.current = () => {
            setPanelOpen(true);
            setPanelTab("team");
        };
        finishCollabRef.current = (closed) => {
            const restore = localActiveRef.current;
            if (closed.role !== "owner" || closed.reason !== "ended") {
                if (restore) setActiveTabId(restore);
                setPanelTab((current) => (current === "team" ? "console" : current));
                return;
            }
            // The owner's tabs that went into the session get the final content; the others stay as they were.
            const shared = new Set(sharedFileIds(closed.id) ?? closed.files.map((file) => file.id));
            const finals = new Map(closed.files.map((file) => [file.id, file]));
            const merged: EditorTab[] = [];
            for (const tab of localTabs) {
                if (!shared.has(tab.id)) {
                    merged.push(tab);
                    continue;
                }
                const file = finals.get(tab.id);
                if (!file) continue;
                finals.delete(tab.id);
                merged.push(file.code === tab.code && file.name === tab.name && file.lang === tab.lang ? tab : { ...tab, name: file.name, lang: file.lang, code: file.code, isSaved: false });
            }
            for (const file of finals.values()) merged.push({ id: file.id, name: file.name, lang: file.lang, code: file.code, isSaved: false });
            const next = merged.slice(0, MAX_TABS);
            setPanelTab((current) => (current === "team" ? "console" : current));
            if (!next.length) return;
            const changed = next.length !== localTabs.length || next.some((tab, index) => tab !== localTabs[index]);
            setLocalTabs(next);
            tabsRef.current = next;
            if (!next.some((tab) => tab.id === activeTabId)) setActiveTabId(next.find((tab) => tab.id === restore)?.id ?? next[0].id);
            if (!changed) return;
            setStructureDirty(true);
            if (sessionEmail && currentProjectId !== null) {
                void completeSave(currentProjectName, currentProjectId, true).then((ok) => {
                    if (ok) toast({ tone: "success", message: tx(C.collabFinalSaved) });
                });
            } else {
                toast({ tone: "info", message: tx(C.collabFinalLocal), action: { label: tx(C.paletteSave), onClick: () => actionsRef.current.save() } });
            }
        };
    });

    // Saving yourself (button, menu, palette, Ctrl+S): format first and run afterwards when the settings ask for it.
    const plainSaveRef = useRef(handleSave);
    const plainRunRef = useRef(handleRun);
    useEffect(() => {
        plainSaveRef.current = handleSave;
        plainRunRef.current = handleRun;
    });
    const saveCommand = useCallback(async () => {
        const current = readEditorSettings();
        const format = current.formatOnSave ? editorInstance?.getAction("editor.action.formatDocument") : null;
        if (format?.isSupported()) {
            await format.run().catch(() => undefined);
            // The formatted text reaches the tabs through the editor's change event and a render.
            await new Promise((resolve) => window.setTimeout(resolve, 60));
        }
        plainSaveRef.current();
        if (current.runOnSave) plainRunRef.current();
    }, [editorInstance]);
    const saveNow = useCallback(() => void saveCommand(), [saveCommand]);

    // ------------------------------------------------------------------ keyboard
    const actionsRef = useRef({ run: handleRun, runActive: handleRunActive, save: saveNow, palette: () => setDialog("palette"), switchTab: (index: number) => void index });
    useEffect(() => {
        actionsRef.current = {
            run: handleRun,
            runActive: handleRunActive,
            save: saveNow,
            palette: () => setDialog((current) => (current === "palette" ? null : "palette")),
            switchTab: (index: number) => {
                const tab = tabsRef.current[index - 1];
                if (tab) setActiveTabId(tab.id);
            },
        };
    });

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.isComposing) return;
            const mod = mac ? event.metaKey : event.ctrlKey;
            const key = event.key.toLowerCase();
            if (mod && !event.altKey && !event.shiftKey && key === "s") {
                event.preventDefault();
                actionsRef.current.save();
            } else if (mod && !event.altKey && key === "enter") {
                event.preventDefault();
                if (event.shiftKey) actionsRef.current.runActive();
                else actionsRef.current.run();
            } else if (mod && !event.altKey && !event.shiftKey && key === "k") {
                event.preventDefault();
                actionsRef.current.palette();
            } else if (event.altKey && !event.ctrlKey && !event.metaKey && /^Digit[1-9]$/.test(event.code) && !isTypingTarget(event.target)) {
                event.preventDefault();
                actionsRef.current.switchTab(Number(event.code.slice(5)));
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [mac]);

    // Inside Monaco the same shortcuts must win over its defaults (Ctrl+Enter, Ctrl+K chords).
    useEffect(() => {
        if (!editorInstance || !monacoInstance) return;
        const monaco = monacoInstance;
        const mod = monaco.KeyMod.CtrlCmd;
        const disposables = [
            editorInstance.addAction({ id: "hanogt.run", label: tx(C.monacoRun), keybindings: [mod | monaco.KeyCode.Enter], run: () => actionsRef.current.run() }),
            editorInstance.addAction({ id: "hanogt.runActive", label: tx(C.monacoRunActive), keybindings: [mod | monaco.KeyMod.Shift | monaco.KeyCode.Enter], run: () => actionsRef.current.runActive() }),
            editorInstance.addAction({ id: "hanogt.save", label: tx(C.monacoSave), keybindings: [mod | monaco.KeyCode.KeyS], run: () => actionsRef.current.save() }),
            editorInstance.addAction({ id: "hanogt.palette", label: tx(C.monacoQuickActions), keybindings: [mod | monaco.KeyCode.KeyK], run: () => actionsRef.current.palette() }),
            monaco.editor.registerCommand("hanogt.switchTab", (_accessor: unknown, index: unknown) => actionsRef.current.switchTab(Number(index))),
            ...Array.from({ length: 9 }, (_, offset) => monaco.editor.addKeybindingRule({ keybinding: monaco.KeyMod.Alt | (monaco.KeyCode.Digit1 + offset), command: "hanogt.switchTab", commandArgs: offset + 1 })),
        ];
        return () => disposables.forEach((disposable) => disposable.dispose());
    }, [editorInstance, monacoInstance, tx]);

    // Free the Monaco models of closed tabs.
    useEffect(() => {
        if (!monacoInstance) return;
        const live = new Set(tabs.map((tab) => monacoInstance.Uri.parse(modelPath(tab)).toString()));
        const current = editorInstance?.getModel()?.uri.toString();
        for (const model of monacoInstance.editor.getModels()) {
            const uri = model.uri;
            if (uri.scheme === "inmemory" && uri.authority === "hanogt" && !live.has(uri.toString()) && uri.toString() !== current) model.dispose();
        }
    }, [tabs, monacoInstance, editorInstance]);

    const handleEditorMount = useCallback((instance: editor.IStandaloneCodeEditor, monaco: MonacoApi) => {
        setEditorInstance(instance);
        setMonacoInstance(monaco);
    }, []);

    // Menus close on an outside click/tap or Escape.
    useEffect(() => {
        if (!menuOpen) return;
        const container = menuOpen === "run" ? runMenuRef.current : moreMenuRef.current;
        const onPointerDown = (event: PointerEvent) => {
            if (container && event.target instanceof Node && container.contains(event.target)) return;
            setMenuOpen(null);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            setMenuOpen(null);
            container?.querySelector<HTMLButtonElement>("button[aria-haspopup]")?.focus();
        };
        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [menuOpen]);

    // ------------------------------------------------------------------ panel resizing
    const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
        const container = splitRef.current;
        if (!container) return;
        event.preventDefault();
        const rect = container.getBoundingClientRect();
        const move = (moveEvent: PointerEvent) => {
            const raw = dir === "rtl" ? moveEvent.clientX - rect.left : rect.right - moveEvent.clientX;
            setPanelWidth(Math.round(Math.min(Math.max(raw, 280), rect.width * 0.7)));
        };
        const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            setPanelWidth((width) => {
                writeStorage(PANEL_WIDTH_KEY, String(width));
                return width;
            });
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    };

    // ------------------------------------------------------------------ commands
    // One list feeds the toolbar's Edit menu and the command palette.
    const editCommands = useMemo<EditorCommand[]>(() => {
        const noEditor = !editorInstance;
        const icon = (Icon: typeof Undo2) => <Icon className="h-4 w-4" aria-hidden />;
        return [
            { id: "undo", label: tx(C.undo), icon: icon(Undo2), shortcut: shortcutText(EDIT_SHORTCUTS.undo, mac), keywords: "undo geri al", disabled: noEditor, run: () => runEditorCommand("undo") },
            { id: "redo", label: tx(C.redo), icon: icon(Redo2), shortcut: shortcutText(EDIT_SHORTCUTS.redo, mac), keywords: "redo yinele ileri al", disabled: noEditor, run: () => runEditorCommand("redo") },
            { id: "find", label: tx(C.find), icon: icon(Search), shortcut: shortcutText(EDIT_SHORTCUTS.find, mac), keywords: "find search ara bul", disabled: noEditor, run: () => runEditorCommand("actions.find") },
            { id: "replace", label: tx(C.replace), icon: icon(Replace), shortcut: shortcutText(EDIT_SHORTCUTS.replace, mac), keywords: "replace değiştir", disabled: noEditor, run: () => runEditorCommand("editor.action.startFindReplaceAction") },
            { id: "goto-line", label: tx(C.goToLine), icon: icon(ListOrdered), shortcut: shortcutText(EDIT_SHORTCUTS.gotoLine, mac), keywords: "go to line satıra git", disabled: noEditor, run: () => runEditorCommand("editor.action.gotoLine") },
            { id: "comment", label: tx(C.toggleComment), icon: icon(MessageSquareCode), shortcut: shortcutText(EDIT_SHORTCUTS.comment, mac), keywords: "comment yorum", disabled: noEditor, run: () => runEditorCommand("editor.action.commentLine") },
            { id: "format", label: tx(C.format), icon: icon(Wand2), shortcut: shortcutText(EDIT_SHORTCUTS.format, mac), keywords: "format prettier biçim", disabled: noEditor, run: () => void formatDocument() },
            { id: "select-all", label: tx(C.selectAll), icon: icon(TextSelect), shortcut: shortcutText(EDIT_SHORTCUTS.selectAll, mac), keywords: "select all seç", disabled: noEditor, run: () => runEditorCommand("editor.action.selectAll") },
            { id: "copy-all", label: tx(C.copyAll), icon: icon(ClipboardCopy), keywords: "copy clipboard kopyala pano", run: () => void copyAll() },
        ];
    }, [copyAll, editorInstance, formatDocument, mac, runEditorCommand, tx]);

    const fileCommands = useMemo<EditorCommand[]>(() => {
        const icon = (Icon: typeof Save) => <Icon className="h-4 w-4" aria-hidden />;
        const id = activeTab?.id;
        return [
            { id: "save", label: tx(C.paletteSave), icon: icon(Save), shortcut: formatShortcut(["Mod", "S"], mac), keywords: "save kaydet", run: saveNow },
            { id: "rename", label: tx(C.renameFile), hint: activeTab?.name, icon: icon(Pencil), keywords: "rename yeniden adlandır", disabled: !id, run: () => id && startRename(id) },
            { id: "duplicate", label: tx(C.duplicateFile), hint: activeTab?.name, icon: icon(CopyIcon), keywords: "duplicate copy çoğalt kopya", disabled: !id || isGameMode || tabs.length >= MAX_TABS, run: () => id && duplicateTab(id) },
            { id: "language", label: tx(C.changeLanguage), hint: activeLanguage.name, icon: icon(Languages), keywords: "language mode dil", run: () => setDialog("language") },
            { id: "download", label: tx(C.paletteDownload), icon: icon(Download), keywords: "download indir", run: () => downloadTab() },
            { id: "download-project", label: tx(C.paletteDownloadProject), icon: icon(FolderDown), keywords: "zip download indir", run: () => void downloadProject() },
            { id: "share", label: tx(C.paletteShare), icon: icon(Share2), keywords: "share paylaş snippet markdown", run: () => setDialog("share") },
            { id: "delete", label: tx(C.deleteFile), hint: activeTab?.name, icon: icon(Trash2), keywords: "delete remove sil kaldır", danger: true, disabled: !id || tabs.length < 2, run: () => id && void deleteTab(id) },
        ];
    }, [activeLanguage.name, activeTab?.id, activeTab?.name, deleteTab, downloadProject, downloadTab, duplicateTab, saveNow, isGameMode, mac, startRename, tabs.length, tx]);

    const mediaCommands = useMemo<EditorCommand[]>(() => {
        const icon = (Icon: typeof Send) => <Icon className="h-4 w-4" aria-hidden />;
        if (!publication) {
            return [{ id: "media-publish", label: tx(MEDIA_BUTTON_COPY.publish), icon: icon(Send), keywords: "media publish share yayınla paylaş topluluk", run: openPublish }];
        }
        return [
            { id: "media-update", label: tx(MEDIA_BUTTON_COPY.update), hint: publication.title, icon: icon(RefreshCw), keywords: "media publish update yayını güncelle", run: openPublish },
            { id: "media-view", label: tx(MEDIA_BUTTON_COPY.view), icon: icon(ExternalLink), keywords: "media open view görüntüle", run: () => window.open(mediaPostPath(publication.postId), "_blank", "noopener,noreferrer") },
            { id: "media-copy-link", label: tx(MEDIA_BUTTON_COPY.copyLink), icon: icon(ClipboardCopy), keywords: "media link url bağlantı", run: () => void copyPublicationLink() },
            { id: "media-unpublish", label: tx(MEDIA_BUTTON_COPY.unpublish), icon: icon(Trash2), keywords: "media unpublish delete yayından kaldır sil", danger: true, disabled: unpublishing, run: () => void unpublish() },
        ];
    }, [copyPublicationLink, openPublish, publication, tx, unpublish, unpublishing]);

    const teamCommands = useMemo<EditorCommand[]>(() => {
        const icon = (Icon: typeof UsersRound) => <Icon className="h-4 w-4" aria-hidden />;
        if (isGameMode) return [];
        if (!collab.session) {
            return [{ id: "collab-start", label: tx(COLLAB_COPY.button), hint: tx(COLLAB_COPY.buttonHint), icon: icon(UsersRound), keywords: "collaborate live share pair team ekip birlikte canlı ortak eşli", disabled: collab.busy !== null, run: openCollab }];
        }
        return [
            { id: "collab-panel", label: tx(COLLAB_COPY.openPanel), hint: collab.title, icon: icon(UsersRound), keywords: "team chat voice ekip sohbet sesli canlı", run: openTeamPanel },
            { id: "collab-link", label: tx(COLLAB_COPY.copyLink), icon: icon(Link2), keywords: "invite link davet bağlantı", run: () => void copyCollabLink() },
        ];
    }, [collab.busy, collab.session, collab.title, copyCollabLink, isGameMode, openCollab, openTeamPanel, tx]);

    const toMenuItem = ({ id, label, icon, shortcut, disabled, danger, run }: EditorCommand): ToolbarMenuItem => ({ id, label, icon, shortcut, disabled, danger, onSelect: run });
    const editMenuSections: ToolbarMenuSection[] = [
        { id: "edit", label: tx(C.editGroup), items: editCommands.map(toMenuItem) },
        { id: "file", label: tx(C.fileGroup), items: fileCommands.map(toMenuItem) },
        { id: "team", label: tx(COLLAB_COPY.group), items: teamCommands.map(toMenuItem) },
    ];

    // ------------------------------------------------------------------ palette
    const paletteCommands = useMemo<PaletteCommand[]>(() => {
        const actions = tx(C.actions);
        const toPalette = (group: string) => ({ id, label, hint, shortcut, icon, disabled, keywords, run }: EditorCommand): PaletteCommand => ({ id, group, label, hint, shortcut, icon, disabled, keywords, run });
        const commands: PaletteCommand[] = [
            {
                id: "run", group: actions, label: runMode === "validate" ? tx(C.validate) : runMode === "preview" ? tx(C.preview) : programTabs.length > 1 ? tx(C.runAll, { count: Math.min(programTabs.length, maxRunFiles) }) : tx(C.run),
                shortcut: modShortcut("Enter"), icon: <Play className="h-4 w-4" aria-hidden />, disabled: runMode === "none" || isRunning, hint: notRunnableReason ?? undefined, keywords: "run çalıştır execute", run: handleRun,
            },
            { id: "run-active", group: actions, label: tx(C.runActive), shortcut: modShortcut("Enter", true), icon: <Play className="h-4 w-4" aria-hidden />, disabled: isRunning || !(activeIsProgram || activeIsValidator), keywords: "run file", run: handleRunActive },
            { id: "new", group: actions, label: tx(C.newIn), icon: <FilePlus2 className="h-4 w-4" aria-hidden />, disabled: isGameMode, keywords: "new file template şablon", run: () => setDialog("new") },
            { id: "upload", group: actions, label: tx(C.paletteUpload), icon: <Upload className="h-4 w-4" aria-hidden />, disabled: isGameMode, keywords: "upload open yükle aç zip", run: () => fileInputRef.current?.click() },
            { id: "panel", group: actions, label: tx(C.palettePanel), icon: <Terminal className="h-4 w-4" aria-hidden />, run: () => setPanelOpen((open) => !open) },
            { id: "input", group: actions, label: tx(C.paletteInput), icon: <Keyboard className="h-4 w-4" aria-hidden />, keywords: "stdin input girdi", run: () => { setPanelOpen(true); setPanelTab("console"); setConsoleTab("input"); } },
            ...(hasPreview ? [{ id: "preview", group: actions, label: tx(C.previewPanel), icon: <Eye className="h-4 w-4" aria-hidden />, run: showPreview }] : []),
            { id: "theme", group: actions, label: tx(C.toggleTheme), icon: <Sun className="h-4 w-4" aria-hidden />, keywords: "theme dark light tema", run: toggleSiteTheme },
            { id: "settings", group: actions, label: tx(C.settings), icon: <Settings className="h-4 w-4" aria-hidden />, keywords: "settings ayarlar font tema", run: () => router.push("/settings") },
            { id: "shortcuts", group: actions, label: tx(C.paletteShortcuts), icon: <Keyboard className="h-4 w-4" aria-hidden />, keywords: "keyboard kısayol", run: () => setDialog("shortcuts") },
            { id: "monaco", group: actions, label: tx(C.monacoPalette), shortcut: "F1", icon: <Command className="h-4 w-4" aria-hidden />, run: () => { editorInstance?.focus(); editorInstance?.trigger("hanogt", "editor.action.quickCommand", null); } },
            ...fileCommands.map(toPalette(tx(C.fileGroup))),
            ...editCommands.map(toPalette(tx(C.editGroup))),
            ...teamCommands.map(toPalette(tx(COLLAB_COPY.group))),
            ...mediaCommands.map(toPalette(tx(C.mediaGroup))),
        ];
        const fileGroup = tx(C.files);
        tabs.forEach((tab, index) => {
            commands.push({
                id: `tab-${tab.id}`, group: fileGroup, label: tab.name, hint: getLanguage(tab.lang)?.name, shortcut: index < 9 ? formatShortcut(["Alt", String(index + 1)], mac) : undefined,
                icon: <LanguageIcon language={tab.lang} size={16} />, keywords: tx(C.switchTo), run: () => setActiveTabId(tab.id),
            });
        });
        if (!isGameMode) {
            const newGroup = tx(C.newIn);
            for (const id of ["python", "javascript", "typescript", "java", "cpp", "c", "csharp", "go", "rust", "scheme", "html", "markdown"]) {
                const language = getLanguage(id);
                if (!language) continue;
                commands.push({
                    id: `new-${id}`, group: newGroup, label: tx(C.newInLanguage, { language: language.name }), icon: <LanguageIcon language={id} size={16} />,
                    run: () => createFile({ name: uniqueFileName(language.defaultFileName, tabsRef.current.map((tab) => tab.name)), language: id, code: language.template }),
                });
            }
        }
        return commands;
        // modShortcut only depends on `mac`.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tx, runMode, programTabs.length, maxRunFiles, isRunning, notRunnableReason, handleRun, activeIsProgram, activeIsValidator, handleRunActive, isGameMode, mac, hasPreview, showPreview, toggleSiteTheme, router, editorInstance, tabs, createFile, fileCommands, editCommands, teamCommands, mediaCommands]);

    // ------------------------------------------------------------------ render helpers
    // In a live session "saved" means the server has every local change.
    const saveState: SaveState = collabTabs
        ? (collab.unsynced ? "saving" : "saved")
        : saving ? "saving" : saveError && hasUnsaved ? "error" : hasUnsaved ? "unsaved" : "saved";
    const autoSaveNote = collabTabs
        ? tx(C.collabAutoSave)
        : settings.autoSave === "off"
            ? tx(C.autoSaveOff)
            : !canAutoSave
                ? tx(C.autoSaveLater)
                : settings.autoSave === "afterDelay" ? tx(C.autoSaveDelay, { seconds: settings.autoSaveDelay / 1000 }) : tx(C.autoSaveFocus);
    const runLabel = isRunning
        ? tx(C.running)
        : runMode === "validate" ? tx(C.validate)
            : runMode === "preview" ? tx(C.preview)
                : programTabs.length > 1 ? tx(C.runAll, { count: Math.min(programTabs.length, maxRunFiles) }) : tx(C.run);
    const existingNames = tabs.map((tab) => tab.name);
    const dark = siteTheme === "dark";

    const onDragEnter = (event: DragEvent<HTMLDivElement>) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setDragDepth((depth) => depth + 1);
    };
    const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        setDragDepth((depth) => Math.max(0, depth - 1));
    };
    const onDrop = (event: DragEvent<HTMLDivElement>) => {
        if (!event.dataTransfer.files.length) return;
        event.preventDefault();
        setDragDepth(0);
        void openFiles([...event.dataTransfer.files]);
    };

    const menuItem = (label: string, icon: ReactNode, onClick: () => void, options: { disabled?: boolean; hint?: string } = {}) => (
        <button type="button" role="menuitem" disabled={options.disabled} onClick={() => { setMenuOpen(null); onClick(); }} className="flex w-full items-center gap-2.5 px-3 py-2 text-start text-sm text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-200 dark:hover:bg-white/10">
            {icon}
            <span className="flex-1">{label}</span>
            {options.hint && <kbd className="font-mono text-[10px] text-zinc-400">{options.hint}</kbd>}
        </button>
    );

    if (!ready) {
        return (
            <div className="flex h-dvh items-center justify-center gap-2 bg-zinc-50 text-sm text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400" aria-busy="true">
                <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden />
                {tx(C.loading)}
            </div>
        );
    }

    return (
        <div className="flex h-dvh w-full overflow-hidden bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-white" onDragEnter={onDragEnter} onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }} onDragLeave={onDragLeave} onDrop={onDrop}>
            <Sidebar
                backHref={backHref}
                saveShortcut={modShortcut("S")}
                paletteShortcut={modShortcut("K")}
                onNewFile={isGameMode ? undefined : () => setDialog("new")}
                onUpload={isGameMode ? undefined : () => fileInputRef.current?.click()}
                onSave={saveNow}
                onDownload={() => downloadTab()}
                onDownloadProject={() => void downloadProject()}
                onShare={() => setDialog("share")}
                onPalette={() => setDialog("palette")}
                onShortcuts={() => setDialog("shortcuts")}
            />
            <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                aria-hidden
                tabIndex={-1}
                onChange={(event) => {
                    const files = event.target.files ? [...event.target.files] : [];
                    event.target.value = "";
                    void openFiles(files);
                }}
            />

            <div className="relative flex min-w-0 flex-1 flex-col">
                {activeTab ? (
                    <EditorTabs
                        tabs={tabs}
                        activeId={activeTab.id}
                        onSelect={setActiveTabId}
                        onClose={(id) => void closeTabs([id])}
                        onCloseOthers={(id) => void closeTabs(tabs.filter((tab) => tab.id !== id).map((tab) => tab.id))}
                        onCloseToRight={(id) => void closeTabs(tabs.slice(tabs.findIndex((tab) => tab.id === id) + 1).map((tab) => tab.id))}
                        onRename={renameTab}
                        onDuplicate={isGameMode ? undefined : duplicateTab}
                        onDelete={(id) => void deleteTab(id)}
                        onDownload={(id) => downloadTab(id)}
                        onReorder={reorderTabs}
                        onNew={isGameMode ? undefined : () => setDialog("new")}
                        renameRequest={renameRequest}
                    />
                ) : (
                    <div className="h-11 shrink-0 border-b border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-950" />
                )}

                {/* Toolbar */}
                <div className="flex h-12 shrink-0 items-center gap-2 border-b border-zinc-200 bg-white px-2 sm:px-3 dark:border-white/10 dark:bg-zinc-950">
                    <Link href={backHref} className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-100 md:hidden dark:text-zinc-400 dark:hover:bg-white/10" aria-label={tx(SIDEBAR_COPY.back)}>
                        <ChevronDown className="h-5 w-5 rotate-90 rtl:-rotate-90" aria-hidden />
                    </Link>
                    {activeTab && (
                        <div className="flex min-w-0 items-center gap-2">
                            <LanguageIcon language={activeTab.lang} size={20} />
                            <span className="hidden truncate text-sm font-semibold min-[480px]:inline">{collabTabs ? <span className="text-emerald-600 dark:text-emerald-400">{collab.title} / </span> : currentProjectName && !isGameMode ? <span className="text-zinc-400">{currentProjectName} / </span> : null}{activeTab.name}</span>
                            <button type="button" onClick={() => setDialog("language")} className="hidden items-center gap-1 rounded-full border border-zinc-200 px-2 py-0.5 text-[11px] text-zinc-500 transition hover:border-indigo-500/40 hover:text-zinc-800 sm:inline-flex dark:border-white/10 dark:text-zinc-400 dark:hover:text-zinc-100" title={tx(C.changeLanguage)}>
                                {activeLanguage.name}
                            </button>
                            <span className="hidden lg:inline-flex"><EngineBadge engine={activeLanguage.engine} /></span>
                            {isGameMode && <span className="rounded-full bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fuchsia-600 dark:text-fuchsia-300">{tx(C.gameScript)}</span>}
                        </div>
                    )}
                    <div className="ms-auto flex shrink-0 items-center gap-1.5">
                        <button type="button" onClick={() => setDialog("palette")} className="hidden items-center gap-2 rounded-xl border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-500 transition hover:border-indigo-500/40 hover:text-zinc-800 lg:inline-flex dark:border-white/10 dark:text-zinc-400 dark:hover:text-zinc-100" title={tx(C.quickActions)}>
                            <Command className="h-3.5 w-3.5" aria-hidden />
                            <kbd className="font-mono text-[10px]">{modShortcut("K")}</kbd>
                        </button>
                        {hasPreview && runMode !== "preview" && (
                            <button type="button" onClick={showPreview} title={tx(C.previewPanel)} className="hidden items-center gap-1.5 rounded-xl border border-zinc-200 px-2.5 py-1.5 text-xs font-semibold text-zinc-600 transition hover:border-sky-500/40 hover:text-sky-700 sm:inline-flex dark:border-white/10 dark:text-zinc-300 dark:hover:text-sky-300">
                                <Eye className="h-4 w-4" aria-hidden />
                                <span className="hidden lg:inline">{tx(C.previewPanel)}</span>
                            </button>
                        )}
                        <CollabButton collab={collab} onStart={openCollab} onOpenPanel={openTeamPanel} hidden={isGameMode} />
                        <ToolbarMenu
                            label={tx(C.editMenu)}
                            sections={editMenuSections}
                            width={300}
                            buttonClassName="inline-flex h-9 items-center gap-1 rounded-xl border border-zinc-200 px-2 text-xs font-semibold text-zinc-600 transition hover:border-indigo-500/40 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 aria-expanded:border-indigo-500/40 aria-expanded:text-zinc-900 dark:border-white/10 dark:text-zinc-300 dark:hover:text-white dark:aria-expanded:text-white"
                        >
                            <SquarePen className="h-4 w-4" aria-hidden />
                            <span className="hidden lg:inline">{tx(C.editMenu)}</span>
                            <ChevronDown className="hidden h-3.5 w-3.5 sm:block" aria-hidden />
                        </ToolbarMenu>
                        <MediaPublishButton publication={publication} onPublish={openPublish} onCopyLink={() => void copyPublicationLink()} onUnpublish={() => void unpublish()} busy={unpublishing} />
                        <div ref={runMenuRef} className="relative flex">
                            {isRunning ? (
                                <button type="button" onClick={stopRun} className="inline-flex items-center gap-2 rounded-s-2xl rounded-e-2xl bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-red-600/20 transition hover:bg-red-700">
                                    <Square className="h-4 w-4 fill-current" aria-hidden />
                                    {tx(C.stop)}
                                </button>
                            ) : (
                                <>
                                    <button
                                        type="button"
                                        onClick={handleRun}
                                        disabled={runMode === "none"}
                                        title={notRunnableReason ?? tx(C.withShortcut, { label: runLabel, shortcut: modShortcut("Enter") })}
                                        aria-describedby={notRunnableReason ? "run-disabled-reason" : undefined}
                                        className="inline-flex items-center gap-2 rounded-s-2xl bg-emerald-600 px-3.5 py-2 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500 disabled:shadow-none sm:px-4 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
                                    >
                                        {runMode === "preview" ? <Eye className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4 fill-current" aria-hidden />}
                                        <span className="hidden min-[400px]:inline">{runLabel}</span>
                                    </button>
                                    <button type="button" onClick={() => setMenuOpen((open) => (open === "run" ? null : "run"))} aria-haspopup="menu" aria-expanded={menuOpen === "run"} aria-label={tx(C.runMenu)} className="inline-flex items-center rounded-e-2xl border-s border-emerald-700/40 bg-emerald-600 px-1.5 text-white transition hover:bg-emerald-700">
                                        <ChevronDown className="h-4 w-4" aria-hidden />
                                    </button>
                                </>
                            )}
                            {notRunnableReason && <span id="run-disabled-reason" className="sr-only">{notRunnableReason}</span>}
                            {menuOpen === "run" && (
                                <div role="menu" aria-label={tx(C.runMenu)} className="absolute end-0 top-full z-[60] mt-1 w-64 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-2xl dark:border-white/10 dark:bg-zinc-900">
                                    {menuItem(runLabel, <Play className="h-4 w-4" aria-hidden />, handleRun, { disabled: runMode === "none", hint: modShortcut("Enter") })}
                                    {menuItem(tx(C.runActive), <Play className="h-4 w-4" aria-hidden />, handleRunActive, { disabled: !(activeIsProgram || activeIsValidator), hint: modShortcut("Enter", true) })}
                                    {hasPreview && menuItem(tx(C.previewPanel), <Eye className="h-4 w-4" aria-hidden />, showPreview)}
                                    {menuItem(tx(C.paletteInput), <Keyboard className="h-4 w-4" aria-hidden />, () => { setPanelOpen(true); setPanelTab("console"); setConsoleTab("input"); })}
                                </div>
                            )}
                        </div>
                        <button type="button" onClick={() => setPanelOpen((open) => !open)} className="rounded-xl p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white" aria-label={tx(panelOpen ? C.hidePanel : C.showPanel)} title={tx(panelOpen ? C.hidePanel : C.showPanel)} aria-pressed={panelOpen}>
                            {panelOpen ? <PanelRightClose className="h-5 w-5 rtl:-scale-x-100" aria-hidden /> : <PanelRightOpen className="h-5 w-5 rtl:-scale-x-100" aria-hidden />}
                        </button>
                        <div ref={moreMenuRef} className="relative md:hidden">
                            <button type="button" onClick={() => setMenuOpen((open) => (open === "more" ? null : "more"))} className="rounded-xl p-2 text-zinc-500 transition hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/10" aria-haspopup="menu" aria-expanded={menuOpen === "more"} aria-label={tx(C.more)}>
                                <MoreVertical className="h-5 w-5" aria-hidden />
                            </button>
                            {menuOpen === "more" && (
                                <div role="menu" aria-label={tx(C.more)} className="absolute end-0 top-full z-[60] mt-1 w-64 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-2xl dark:border-white/10 dark:bg-zinc-900">
                                    {!isGameMode && menuItem(tx(SIDEBAR_COPY.newFile), <FilePlus2 className="h-4 w-4" aria-hidden />, () => setDialog("new"))}
                                    {!isGameMode && menuItem(tx(SIDEBAR_COPY.upload), <Upload className="h-4 w-4" aria-hidden />, () => fileInputRef.current?.click())}
                                    {menuItem(tx(SIDEBAR_COPY.save), <Save className="h-4 w-4" aria-hidden />, saveNow)}
                                    {menuItem(tx(SIDEBAR_COPY.download), <Download className="h-4 w-4" aria-hidden />, () => downloadTab())}
                                    {menuItem(tx(SIDEBAR_COPY.downloadProject), <FolderDown className="h-4 w-4" aria-hidden />, () => void downloadProject())}
                                    {menuItem(tx(SIDEBAR_COPY.share), <Share2 className="h-4 w-4" aria-hidden />, () => setDialog("share"))}
                                    {menuItem(tx(SIDEBAR_COPY.palette), <Command className="h-4 w-4" aria-hidden />, () => setDialog("palette"))}
                                    {menuItem(tx(C.toggleTheme), <Sun className="h-4 w-4" aria-hidden />, toggleSiteTheme)}
                                    {menuItem(tx(C.settings), <Settings className="h-4 w-4" aria-hidden />, () => router.push("/settings"))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Editor and output */}
                <div ref={splitRef} className="flex min-h-0 flex-1 flex-col lg:flex-row">
                    <section className={`relative min-h-0 min-w-0 flex-1 p-1.5 sm:p-2 ${panelOpen ? "basis-[55%] lg:basis-auto" : ""}`} aria-label={activeTab?.name}>
                        {activeTab && collabTabs && collab.session ? (
                            <CollabCodeEditor
                                key={`collab-${collab.session.id}`}
                                session={collab.session}
                                fileId={activeTab.id}
                                language={activeTab.lang}
                                onMount={handleEditorMount}
                                ariaLabel={activeTab.name}
                            />
                        ) : activeTab ? (
                            <CodeEditor
                                language={activeTab.lang}
                                path={modelPath(activeTab)}
                                value={activeTab.code}
                                onChange={handleCodeChange}
                                onMount={handleEditorMount}
                                ariaLabel={activeTab.name}
                            />
                        ) : (
                            <div className="flex h-full items-center justify-center text-sm text-zinc-500"><LoaderCircle className="h-5 w-5 animate-spin" aria-hidden /></div>
                        )}
                        {dragDepth > 0 && (
                            <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-indigo-500 bg-indigo-500/10 p-4 text-center text-sm font-semibold text-indigo-700 backdrop-blur-sm dark:text-indigo-200">
                                <Upload className="me-2 h-5 w-5" aria-hidden />
                                {tx(C.dropFiles)}
                            </div>
                        )}
                    </section>
                    {panelOpen && (
                        <>
                            <div
                                role="separator"
                                aria-orientation="vertical"
                                aria-label={tx(C.resize)}
                                aria-valuenow={panelWidth}
                                aria-valuemin={280}
                                aria-valuemax={1200}
                                tabIndex={0}
                                onPointerDown={startResize}
                                onKeyDown={(event) => {
                                    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                                    event.preventDefault();
                                    const grow = (event.key === "ArrowLeft") !== (dir === "rtl");
                                    setPanelWidth((width) => {
                                        const next = Math.min(1200, Math.max(280, width + (grow ? 24 : -24)));
                                        writeStorage(PANEL_WIDTH_KEY, String(next));
                                        return next;
                                    });
                                }}
                                className="hidden w-1.5 shrink-0 cursor-col-resize bg-transparent transition hover:bg-indigo-500/40 focus-visible:bg-indigo-500/60 focus-visible:outline-none lg:block"
                            />
                            <aside className="flex min-h-0 shrink-0 basis-[45%] flex-col border-t border-zinc-200 bg-white lg:basis-auto lg:border-s lg:border-t-0 dark:border-white/10 dark:bg-zinc-950" style={{ ["--panel-width" as string]: `${panelWidth}px` }}>
                                <div className="flex h-full min-h-0 flex-col lg:w-[var(--panel-width)] lg:max-w-[70vw]">
                                    <div className="flex shrink-0 items-center gap-1 border-b border-zinc-200 px-2 py-1 dark:border-white/10" role="tablist" aria-label={tx(C.panel)}>
                                        {(["console", "preview", "team"] as const).filter((name) => name === "console" || (name === "preview" ? hasPreview : Boolean(collab.session))).map((name) => (
                                            <button key={name} type="button" role="tab" aria-selected={panelTab === name} onClick={() => setPanelTab(name)} className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${panelTab === name ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"}`}>
                                                {name === "console" ? <Terminal className="h-3.5 w-3.5" aria-hidden /> : name === "preview" ? <Eye className="h-3.5 w-3.5" aria-hidden /> : <UsersRound className="h-3.5 w-3.5" aria-hidden />}
                                                {tx(name === "console" ? C.console : name === "preview" ? C.previewPanel : COLLAB_COPY.team)}
                                                {name === "console" && isRunning && <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden />}
                                                {name === "team" && collab.chatUnread > 0 && panelTab !== "team" && (
                                                    <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-bold tabular-nums text-white">{collab.chatUnread > 9 ? "9+" : collab.chatUnread}</span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="min-h-0 flex-1">
                                        {panelTab === "team" && collab.session ? (
                                            <CollabPanel session={collab.session} visible={panelOpen} onCopyLink={() => void copyCollabLink()} />
                                        ) : panelTab === "preview" && hasPreview ? (
                                            <WebPreview files={previewFiles} activeFile={previewActive} stdin={stdin} dark={dark} reloadKey={previewKey} />
                                        ) : (
                                            <Console
                                                run={run}
                                                history={history}
                                                onClearHistory={() => setHistory([])}
                                                stdin={stdin}
                                                onStdinChange={setStdin}
                                                onClear={() => setRun(null)}
                                                onRun={handleRun}
                                                onStop={stopRun}
                                                runDisabledReason={runMode === "none" ? notRunnableReason : runMode === "preview" ? tx(C.previewOnly) : null}
                                                runShortcut={modShortcut("Enter")}
                                                onGoToLine={goToLine}
                                                tab={consoleTab}
                                                onTabChange={setConsoleTab}
                                            />
                                        )}
                                    </div>
                                </div>
                            </aside>
                        </>
                    )}
                </div>

                <StatusBar
                    editor={editorInstance}
                    monaco={monacoInstance}
                    language={activeLanguage.id}
                    engine={activeLanguage.engine}
                    onLanguageClick={() => setDialog("language")}
                    saveState={saveState}
                    autoSaveNote={autoSaveNote}
                />
                <p className="sr-only" aria-live="polite">{isRunning ? tx(C.running) : ""}</p>
            </div>

            <CommandPalette open={dialog === "palette"} onClose={() => setDialog(null)} commands={paletteCommands} />
            <CollabStartDialog
                open={dialog === "collab"}
                onClose={() => setDialog(null)}
                files={tabs}
                defaultTitle={currentProjectName || importedTitle || tx(C.generalProject)}
                busy={collab.busy === "start"}
                onStart={collab.start}
            />
            <CollabDialogs collab={collab} onKeepCopy={keepCollabCopy} />
            <NewFileDialog open={dialog === "new"} onClose={() => setDialog(null)} existingNames={existingNames} onCreateFile={createFile} onCreateProject={createProject} />
            <LanguagePickerDialog open={dialog === "language"} onClose={() => setDialog(null)} current={activeLanguage.id} onPick={changeLanguage} allowedLanguages={isGameMode ? GAME_LANGUAGES : undefined} />
            <ShortcutsDialog open={dialog === "shortcuts"} onClose={() => setDialog(null)} mac={mac} />
            <ShareDialog open={dialog === "share"} onClose={() => setDialog(null)} file={activeTab ?? null} onDownloadSnippet={downloadSnippet} onDownloadSource={() => downloadTab()} />
            <PublishDialog
                key={publishKey}
                open={dialog === "publish"}
                onClose={() => setDialog(null)}
                signedIn={Boolean(sessionEmail)}
                signInHref={`/login?callbackUrl=${encodeURIComponent("/editor")}`}
                files={tabs}
                defaultTitle={currentProjectName || importedTitle}
                publication={publication}
                onPublished={recordPublication}
                onPublicationGone={forgetPublication}
                onUnpublish={() => {
                    setDialog(null);
                    void unpublish();
                }}
            />
            <SaveDialog
                key={saveDialog.key}
                open={dialog === "save"}
                onClose={() => setDialog(null)}
                defaultName={saveDialog.defaultName}
                currentName={currentProjectName || undefined}
                saving={saving}
                onSave={(name) => {
                    void completeSave(name, currentProjectId).then((ok) => {
                        if (ok) setDialog(null);
                    });
                }}
            />
            {confirmDialog}
            <ToastViewport toasts={toasts} onDismiss={dismissToast} />
            <AIAssistant />
        </div>
    );
}

function EditorFallback() {
    const { tx } = useI18n();
    return (
        <div className="flex h-dvh items-center justify-center gap-2 bg-zinc-50 text-sm text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400" aria-busy="true">
            <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden />
            {tx(C.loading)}
        </div>
    );
}

export default function EditorPage() {
    return (
        <Suspense fallback={<EditorFallback />}>
            <EditorContent />
        </Suspense>
    );
}
