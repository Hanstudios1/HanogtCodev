"use client";

import { AnimatePresence, motion } from "framer-motion";
import { KeyRound, Maximize2, Menu as MenuIcon, MessageSquarePlus, PanelLeftOpen, Settings2, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AiMessage } from "@/lib/ai/conversations";
import { codeBlocks } from "@/lib/ai/file-edit";
import { currentWindow } from "@/lib/ai/usage";
import { openInEditor } from "@/lib/editor-bridge";
import { useI18n } from "@/lib/i18n";
import { normalizeLanguageId } from "@/lib/runtimes/languages";
import ArtifactPanel from "./ArtifactPanel";
import { artifactFileName, artifactId, isArtifactCode, type ChatArtifact } from "./artifacts";
import ChatComposer from "./ChatComposer";
import ChatMessage from "./ChatMessage";
import ChatSidebar from "./ChatSidebar";
import ConnectionsDialog from "./ConnectionsDialog";
import { proposalOf } from "./proposals";
import RecentChats from "./RecentChats";
import SignInGate from "./SignInGate";
import { useHanogtChat, type ChatLaunch } from "./useHanogtChat";
import { AiAvatar, cx, ICON_BUTTON } from "./ui";
import UsageMeter from "./UsageMeter";
import { stopSpeaking } from "./voice";
import WelcomeScreen from "./WelcomeScreen";

export type { ChatLaunch };

const C = {
    newChat: { TR: "Yeni sohbet", EN: "New chat" },
    fullScreen: { TR: "Tam ekranda aç", EN: "Open full screen" },
    close: { TR: "Kapat", EN: "Close" },
    chats: { TR: "Sohbetler", EN: "Chats" },
    showSidebar: { TR: "Kenar çubuğunu göster", EN: "Show sidebar" },
    engineSignedIn: { TR: "Hanogt AI modeli + Hanogt bilgi tabanı", EN: "Hanogt AI model + Hanogt knowledge" },
    engineSignedOut: { TR: "Giriş yapman gerekiyor", EN: "Sign in required" },
    conversation: { TR: "Sohbet", EN: "Conversation" },
    settings: { TR: "Hanogt AI ayarları", EN: "Hanogt AI settings" },
    api: { TR: "API ve bağlantılar", EN: "API and connections" },
};

// Desktop sidebar visibility is a per-browser preference.
const SIDEBAR_KEY = "hanogt-ai:sidebar-hidden:v1";
const SIDEBAR_EVENT = "hanogt-ai:sidebar";
function readSidebarHidden() {
    try {
        return window.localStorage.getItem(SIDEBAR_KEY) === "1";
    } catch {
        return false;
    }
}
function subscribeSidebar(listener: () => void) {
    window.addEventListener(SIDEBAR_EVENT, listener);
    return () => window.removeEventListener(SIDEBAR_EVENT, listener);
}
function setSidebarHidden(hidden: boolean) {
    try {
        window.localStorage.setItem(SIDEBAR_KEY, hidden ? "1" : "0");
    } catch {
        // Convenience only.
    }
    window.dispatchEvent(new Event(SIDEBAR_EVENT));
}

// Artifacts open by themselves only where the side panel fits next to the conversation.
const WIDE = "(min-width: 1024px)";
function subscribeWide(listener: () => void) {
    const query = window.matchMedia(WIDE);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
}
const readWide = () => window.matchMedia(WIDE).matches;

/** The artifact a finished answer would open: its last long code block or web page (not a change to the open file, which has its own card). */
function answerArtifact(message: AiMessage): ChatArtifact | null {
    if (message.role !== "assistant" || message.error || !message.content || proposalOf(message)) return null;
    const blocks = codeBlocks(message.content).filter((block) => isArtifactCode(block.lang, block.code));
    const block = blocks[blocks.length - 1];
    return block ? { id: artifactId(block.lang, block.code), language: block.lang, code: block.code } : null;
}

/**
 * Hanogt AI chat. `page` is the full-screen /ai experience (sidebar with
 * chats and tasks, centered conversation on paper, artifact panel); `panel`
 * is the compact floating dock that can switch between recent chats and open
 * the same conversation full screen.
 */
export default function HanogtAIChat({ variant, onClose, launch }: { variant: "panel" | "page"; onClose?: () => void; launch?: ChatLaunch }) {
    const { tx, dir } = useI18n();
    const chat = useHanogtChat({ variant, onClose, launch });
    const { messages, streaming, busy, active } = chat;
    const [artifact, setArtifact] = useState<ChatArtifact | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [connectionsOpen, setConnectionsOpen] = useState(false);
    const sidebarHidden = useSyncExternalStore(subscribeSidebar, readSidebarHidden, () => false);
    const listRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const stickToBottom = useRef(true);
    const [shownConversation, setShownConversation] = useState<string | null>(chat.activeId);
    const wide = useSyncExternalStore(subscribeWide, readWide, () => false);
    const streamingId = streaming?.messageId ?? null;
    const [watchedId, setWatchedId] = useState<string | null>(null);

    // Switching conversations closes the artifact of the previous one (adjusted while rendering).
    if (shownConversation !== chat.activeId) {
        setShownConversation(chat.activeId);
        setArtifact(null);
    }

    // When an answer finishes with a long piece of code or a web page, it opens in the side panel (a setting).
    if (streamingId !== null && watchedId !== streamingId) setWatchedId(streamingId);
    if (streamingId === null && watchedId !== null) {
        setWatchedId(null);
        const finished = messages.find((message) => message.id === watchedId);
        const next = variant === "page" && wide && chat.settings?.autoOpenArtifacts !== false && finished ? answerArtifact(finished) : null;
        if (next) setArtifact(next);
    }

    // Keep the newest message in view unless the user scrolled up.
    useEffect(() => {
        const list = listRef.current;
        if (list && stickToBottom.current) list.scrollTop = list.scrollHeight;
    }, [messages.length, streaming?.text, messages]);

    useEffect(() => {
        inputRef.current?.focus();
    }, [chat.activeId, launch?.nonce]);

    const onScroll = () => {
        const list = listRef.current;
        if (list) stickToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    };

    const closePanelOnNavigate = useCallback(() => {
        if (variant === "panel" && window.matchMedia("(max-width: 639px)").matches) onClose?.();
    }, [onClose, variant]);

    const openCodeInEditor = useCallback((language: string, code: string) => {
        // An unknown fence language opens as plain text; if the hand-off can't be made, the code is copied instead.
        const id = normalizeLanguageId(language) ? language : "plaintext";
        const result = openInEditor({ name: artifactFileName(id), language: id, code }, { navigate: chat.navigate });
        if (!result.ok) void navigator.clipboard?.writeText(code).catch(() => undefined);
    }, [chat.navigate]);

    const send = () => {
        stickToBottom.current = true;
        void chat.ask(chat.input);
    };

    const pick = (prompt: string) => {
        // Prompts that need the user's own input (a link) only fill the composer.
        if (prompt.endsWith("https://")) {
            chat.setInput(prompt);
            window.setTimeout(() => inputRef.current?.focus(), 0);
            return;
        }
        stickToBottom.current = true;
        void chat.ask(prompt);
    };

    const newChat = () => {
        stopSpeaking();
        chat.newChat();
        setDrawerOpen(false);
        setArtifact(null);
        window.setTimeout(() => inputRef.current?.focus(), 30);
    };

    // An answer being read aloud stops when the chat goes away.
    useEffect(() => () => stopSpeaking(), []);

    const closeConnections = useCallback(() => {
        setConnectionsOpen(false);
        window.setTimeout(() => inputRef.current?.focus(), 0);
    }, []);

    // Messages left in the plan's window (own connections use it too), for the model picker.
    const usageNow = chat.usage.usage;
    const remaining = usageNow ? { hanogt: currentWindow(usageNow.hanogt.window).remaining } : null;
    // Signed-out visitors see the sign-in gate instead of the chat (once the session is known).
    const gated = chat.status === "unauthenticated";
    const meter = <UsageMeter handle={chat.usage} variant={variant} onNavigate={closePanelOnNavigate} />;

    const lastAssistantId = [...messages].reverse().find((message) => message.role === "assistant")?.id;
    const lastUserId = [...messages].reverse().find((message) => message.role === "user")?.id;
    const engineLabel = tx(chat.signedIn ? C.engineSignedIn : C.engineSignedOut);

    const composer = (hero: boolean) => (
        <ChatComposer
            variant={variant}
            hero={hero}
            inputRef={inputRef}
            input={chat.input}
            setInput={chat.setInput}
            busy={busy}
            onSend={send}
            onStop={chat.stop}
            onEscape={variant === "panel" ? onClose : undefined}
            mode={chat.mode}
            onModeChange={chat.switchMode}
            agentMode={chat.agent.mode}
            onAgentModeChange={chat.agent.setMode}
            grantedCount={chat.agent.granted.length}
            onResetGrants={chat.agent.revokeAll}
            attachment={chat.attachment}
            onAttach={(file) => void chat.attachFile(file)}
            onRemoveAttachment={() => chat.setAttachment(null)}
            attachError={chat.attachError}
            sendShortcut={chat.settings?.sendShortcut}
            dictationLanguage={chat.settings?.dictationLanguage}
            editorContext={chat.editorContext}
            hasEditorFile={chat.hasEditorFile}
            attachEditorFile={chat.attachEditorFile}
            onToggleEditorFile={() => chat.setAttachEditorFile(!chat.attachEditorFile)}
            connections={chat.connections.available ? {
                items: chat.connections.items,
                selectedId: chat.connections.selectedId,
                onSelect: chat.connections.select,
                onManage: () => setConnectionsOpen(true),
                remaining,
            } : null}
        />
    );

    // Own provider connections (Plus/Pro); a portal, so it covers the page from the panel too.
    const connectionsDialog = connectionsOpen && chat.connections.available
        ? <ConnectionsDialog connections={chat.connections} onClose={closeConnections} onNavigate={closePanelOnNavigate} />
        : null;

    const messageList = (
        <div
            ref={listRef}
            onScroll={onScroll}
            className={cx("scrollbar-thin min-h-0 flex-1 overflow-y-auto", variant === "page" ? "px-4 pb-6 pt-6 sm:px-6" : "px-3.5 py-4")}
            role="log"
            aria-live="polite"
            aria-busy={busy}
            aria-label={tx(C.conversation)}
        >
            <div className={cx("mx-auto space-y-6", variant === "page" ? "max-w-3xl" : "")}>
                {messages.map((message) => (
                    <ChatMessage
                        key={message.id}
                        message={message}
                        streamingText={streaming?.messageId === message.id ? streaming.text : null}
                        live={streaming?.messageId === message.id ? { text: streaming.thinking, steps: streaming.steps, seconds: streaming.thinkingSeconds } : undefined}
                        onContinue={() => {
                            stickToBottom.current = true;
                            void chat.continueAnswer(message.id);
                        }}
                        variant={variant}
                        busy={busy}
                        isLastAssistant={message.id === lastAssistantId}
                        isLastUser={message.id === lastUserId}
                        agentMode={chat.agent.mode}
                        signedIn={chat.signedIn}
                        onFeedback={(value) => chat.setFeedback(message.id, value)}
                        onRegenerate={chat.regenerate}
                        onEdit={(text) => {
                            stickToBottom.current = true;
                            chat.editLast(text);
                        }}
                        onApprove={(callId, args, remember) => chat.agent.approve(message.id, callId, args, remember)}
                        onDeny={(callId) => chat.agent.deny(message.id, callId)}
                        onOpenInEditor={openCodeInEditor}
                        onOpenArtifact={setArtifact}
                        onNavigate={closePanelOnNavigate}
                        editorPresent={chat.editorPresent}
                        onApplyEdit={(force) => chat.applyEdit(message.id, force)}
                        onDismissEdit={() => chat.dismissEdit(message.id)}
                        answerFont={chat.settings?.answerFont ?? "serif"}
                        speechOptions={{ voiceName: chat.settings?.answerVoice || undefined, rate: chat.settings?.answerVoiceRate }}
                    />
                ))}
            </div>
        </div>
    );

    const welcome = (
        <WelcomeScreen
            variant={variant}
            mode={chat.mode}
            userName={chat.userName}
            onPick={pick}
            onNavigate={closePanelOnNavigate}
            composer={variant === "page" ? composer(true) : undefined}
        />
    );

    // ------------------------------------------------------------------ floating panel
    if (variant === "panel") {
        return (
            <motion.div
                initial={{ opacity: 0, y: 24, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 24, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 320, damping: 28 }}
                role="dialog"
                aria-label="Hanogt AI"
                className="fixed bottom-3 end-3 z-[120] flex h-[min(680px,calc(100dvh-5rem))] w-[min(440px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-3xl border border-ai-line bg-ai-paper shadow-2xl shadow-zinc-900/20"
            >
                <header className="flex items-center gap-2 border-b border-ai-line px-3 py-2.5">
                    <motion.span className="inline-flex shrink-0" whileHover={{ rotate: [0, -10, 10, 0], transition: { duration: 0.5 } }} animate={busy ? { scale: [1, 1.08, 1] } : { scale: 1 }} transition={busy ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" } : undefined}>
                        <AiAvatar size={30} />
                    </motion.span>
                    <div className="min-w-0 flex-1">
                        {gated ? (
                            <h2 className="truncate px-1.5 text-[14.5px] font-bold tracking-tight text-ai-ink">Hanogt AI</h2>
                        ) : (
                            <RecentChats conversations={chat.conversations} activeId={chat.activeId} title={active?.title || "Hanogt AI"} onSelect={chat.selectConversation} onNavigate={onClose} />
                        )}
                        <p className="flex items-center gap-1.5 truncate px-1.5 text-[11px] text-ai-muted"><span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", chat.signedIn ? "bg-emerald-500" : "bg-amber-500")} aria-hidden />{engineLabel}</p>
                    </div>
                    {meter}
                    {!gated ? <Link href="/ai/settings" onClick={closePanelOnNavigate} className={ICON_BUTTON} title={tx(C.settings)} aria-label={tx(C.settings)}><Settings2 className="h-4.5 w-4.5" /></Link> : null}
                    <button type="button" onClick={newChat} className={ICON_BUTTON} title={tx(C.newChat)} aria-label={tx(C.newChat)}><MessageSquarePlus className="h-4.5 w-4.5" /></button>
                    <Link href="/ai" onClick={onClose} className={ICON_BUTTON} title={tx(C.fullScreen)} aria-label={tx(C.fullScreen)}><Maximize2 className="h-4.5 w-4.5" /></Link>
                    <button type="button" onClick={onClose} className={ICON_BUTTON} title={tx(C.close)} aria-label={tx(C.close)}><X className="h-5 w-5" /></button>
                </header>
                <div className="relative flex min-h-0 flex-1 flex-col">
                    {gated ? (
                        <div className="scrollbar-thin flex min-h-0 flex-1 items-center overflow-y-auto"><SignInGate variant="panel" onNavigate={onClose} /></div>
                    ) : (
                        <>
                            {messages.length ? messageList : <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">{welcome}</div>}
                            <div className="border-t border-ai-line p-3">{composer(false)}</div>
                        </>
                    )}
                    <AnimatePresence>
                        {artifact ? <ArtifactPanel key={artifact.id} artifact={artifact} variant="panel" onClose={() => setArtifact(null)} onOpenInEditor={openCodeInEditor} /> : null}
                    </AnimatePresence>
                </div>
                {connectionsDialog}
            </motion.div>
        );
    }

    // ------------------------------------------------------------------ full page
    const sidebar = (mobile: boolean) => (
        <ChatSidebar
            conversations={chat.conversations}
            activeId={chat.activeId}
            streamingId={streamingId}
            onSelect={(id) => {
                chat.selectConversation(id);
                setDrawerOpen(false);
            }}
            onNew={newChat}
            onRename={chat.rename}
            onDelete={chat.remove}
            onClearAll={chat.clearAll}
            onCollapse={mobile ? undefined : () => setSidebarHidden(true)}
            onClose={mobile ? () => setDrawerOpen(false) : undefined}
        />
    );

    if (gated) {
        return (
            <div className="flex h-[calc(100dvh-4rem)] items-center justify-center overflow-y-auto bg-ai-paper">
                <SignInGate variant="page" />
            </div>
        );
    }

    return (
        <div className="flex h-[calc(100dvh-4rem)] overflow-hidden bg-ai-paper">
            {!sidebarHidden ? <div className="hidden lg:flex">{sidebar(false)}</div> : null}
            <AnimatePresence>
                {drawerOpen ? (
                    <motion.div className="fixed inset-0 z-50 flex bg-black/40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawerOpen(false)}>
                        <motion.div
                            initial={{ x: dir === "rtl" ? "100%" : "-100%" }}
                            animate={{ x: 0 }}
                            exit={{ x: dir === "rtl" ? "100%" : "-100%" }}
                            transition={{ type: "spring", stiffness: 340, damping: 34 }}
                            onClick={(event) => event.stopPropagation()}
                            className="h-full rtl:ms-auto"
                            role="dialog"
                            aria-modal="true"
                            aria-label={tx(C.chats)}
                        >
                            {sidebar(true)}
                        </motion.div>
                    </motion.div>
                ) : null}
            </AnimatePresence>
            <section className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center gap-2 px-3 py-2.5 sm:px-4">
                    <button type="button" onClick={() => setDrawerOpen(true)} className={cx(ICON_BUTTON, "lg:hidden")} title={tx(C.chats)} aria-label={tx(C.chats)}><MenuIcon className="h-5 w-5" /></button>
                    {sidebarHidden ? <button type="button" onClick={() => setSidebarHidden(false)} className={cx(ICON_BUTTON, "hidden lg:inline-flex")} title={tx(C.showSidebar)} aria-label={tx(C.showSidebar)}><PanelLeftOpen className="h-5 w-5" /></button> : null}
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold text-ai-ink">{active?.title || "Hanogt AI"}</p>
                        <p className="flex items-center gap-1.5 truncate text-[11px] text-ai-muted"><span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", chat.signedIn ? "bg-emerald-500" : "bg-amber-500")} aria-hidden />{engineLabel}</p>
                    </div>
                    {meter}
                    {chat.signedIn ? <Link href="/ai/api" className={ICON_BUTTON} title={tx(C.api)} aria-label={tx(C.api)} data-ai-api-button><KeyRound className="h-5 w-5" /></Link> : null}
                    {chat.signedIn ? <Link href="/ai/settings" className={ICON_BUTTON} title={tx(C.settings)} aria-label={tx(C.settings)} data-ai-settings-button><Settings2 className="h-5 w-5" /></Link> : null}
                    <button type="button" onClick={newChat} className={ICON_BUTTON} title={tx(C.newChat)} aria-label={tx(C.newChat)}><MessageSquarePlus className="h-5 w-5" /></button>
                </div>
                {messages.length ? (
                    <>
                        {messageList}
                        <div className="px-3 pb-3 sm:px-6 sm:pb-4">{composer(false)}</div>
                    </>
                ) : (
                    <div className="scrollbar-thin flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto pb-[8vh]">{welcome}</div>
                )}
            </section>
            <AnimatePresence>
                {artifact ? <ArtifactPanel key={artifact.id} artifact={artifact} variant="page" onClose={() => setArtifact(null)} onOpenInEditor={openCodeInEditor} /> : null}
            </AnimatePresence>
            {connectionsDialog}
        </div>
    );
}
