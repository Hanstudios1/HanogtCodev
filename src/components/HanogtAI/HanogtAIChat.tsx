"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Maximize2, Menu as MenuIcon, MessageSquarePlus, PanelLeftOpen, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { currentWindow } from "@/lib/ai/usage";
import { openInEditor } from "@/lib/editor-bridge";
import { useI18n } from "@/lib/i18n";
import { normalizeLanguageId } from "@/lib/runtimes/languages";
import ArtifactPanel from "./ArtifactPanel";
import { artifactFileName, type ChatArtifact } from "./artifacts";
import ChatComposer from "./ChatComposer";
import ChatMessage from "./ChatMessage";
import ChatSidebar from "./ChatSidebar";
import ConnectionsDialog from "./ConnectionsDialog";
import { useHanogtChat, type ChatLaunch } from "./useHanogtChat";
import { AiAvatar, cx, ICON_BUTTON } from "./ui";
import UsageMeter from "./UsageMeter";
import WelcomeScreen from "./WelcomeScreen";

export type { ChatLaunch };

const C = {
    newChat: { TR: "Yeni sohbet", EN: "New chat" },
    fullScreen: { TR: "Tam ekranda aç", EN: "Open full screen" },
    close: { TR: "Kapat", EN: "Close" },
    chats: { TR: "Sohbetler", EN: "Chats" },
    showSidebar: { TR: "Kenar çubuğunu göster", EN: "Show sidebar" },
    engineSignedIn: { TR: "Dil modeli + Hanogt bilgi tabanı", EN: "Language model + Hanogt knowledge" },
    engineSignedOut: { TR: "Çekirdek · çevrimdışı · giriş yapınca dil modeli", EN: "Core · offline · sign in for the language model" },
    conversation: { TR: "Sohbet", EN: "Conversation" },
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

/**
 * Hanogt AI chat. `page` is the full-screen /ai experience (sidebar, centered
 * conversation, artifact panel); `panel` is the compact floating dock that can
 * open the same conversation full screen.
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

    // Switching conversations closes the artifact of the previous one (adjusted while rendering).
    if (shownConversation !== chat.activeId) {
        setShownConversation(chat.activeId);
        setArtifact(null);
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
        chat.newChat();
        setDrawerOpen(false);
        setArtifact(null);
        window.setTimeout(() => inputRef.current?.focus(), 30);
    };

    const closeConnections = useCallback(() => {
        setConnectionsOpen(false);
        window.setTimeout(() => inputRef.current?.focus(), 0);
    }, []);

    // Messages left today, for the model picker.
    const usageNow = chat.usage.usage;
    const remaining = usageNow ? { hanogt: currentWindow(usageNow.hanogt.day).remaining, own: usageNow.own ? currentWindow(usageNow.own.day).remaining : null } : null;
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
            showSignIn={!chat.signedIn && chat.status !== "loading"}
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
                className="fixed bottom-3 end-3 z-[120] flex h-[min(680px,calc(100dvh-5rem))] w-[min(440px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-2xl shadow-zinc-900/20 dark:border-white/10 dark:bg-zinc-900"
            >
                <header className="flex items-center gap-2.5 border-b border-zinc-200/80 px-3.5 py-3 dark:border-white/[0.06]">
                    <AiAvatar size="h-9 w-9" />
                    <div className="min-w-0 flex-1">
                        <h2 className="flex items-center gap-1.5 truncate text-[14.5px] font-black tracking-tight text-zinc-900 dark:text-white">
                            {active?.title || "Hanogt AI"}
                            <span className={cx("h-2 w-2 shrink-0 rounded-full", chat.signedIn ? "bg-emerald-500" : "bg-amber-500")} aria-hidden />
                        </h2>
                        <p className="truncate text-[11.5px] text-zinc-500 dark:text-zinc-400">{engineLabel}</p>
                    </div>
                    {meter}
                    <button type="button" onClick={newChat} className={ICON_BUTTON} title={tx(C.newChat)} aria-label={tx(C.newChat)}><MessageSquarePlus className="h-4.5 w-4.5" /></button>
                    <Link href="/ai" onClick={onClose} className={ICON_BUTTON} title={tx(C.fullScreen)} aria-label={tx(C.fullScreen)}><Maximize2 className="h-4.5 w-4.5" /></Link>
                    <button type="button" onClick={onClose} className={ICON_BUTTON} title={tx(C.close)} aria-label={tx(C.close)}><X className="h-5 w-5" /></button>
                </header>
                <div className="relative flex min-h-0 flex-1 flex-col">
                    {messages.length ? messageList : <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">{welcome}</div>}
                    <div className="border-t border-zinc-200/60 p-3 dark:border-white/[0.06]">{composer(false)}</div>
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

    return (
        <div className="flex h-[calc(100dvh-4rem)] overflow-hidden bg-[#fbfaf8] dark:bg-zinc-900/60">
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
                        <p className="truncate text-[14px] font-semibold text-zinc-800 dark:text-zinc-100">{active?.title || "Hanogt AI"}</p>
                        <p className="flex items-center gap-1.5 truncate text-[11px] text-zinc-500 dark:text-zinc-400"><span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", chat.signedIn ? "bg-emerald-500" : "bg-amber-500")} aria-hidden />{engineLabel}</p>
                    </div>
                    {meter}
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
