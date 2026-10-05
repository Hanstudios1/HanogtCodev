"use client";

import { ArrowLeft, CloudOff, FolderOpen, Hash, Pin, RefreshCw, Search, UserPlus, UsersRound, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Spinner, cx } from "@/components/Groups/ui";
import ChatPanel, { PinnedPanel } from "@/components/Groups/workspace/ChatPanel";
import EditorPane, { SaveIndicator } from "@/components/Groups/workspace/EditorPane";
import FilesPanel from "@/components/Groups/workspace/FilesPanel";
import GettingStarted from "@/components/Groups/workspace/GettingStarted";
import { useI18n, type Copy } from "@/lib/i18n";
import { groupHref } from "@/lib/social/model";
import { useSocial } from "../context";
import { EmptyState, IconButton, MainHeader, SocialAside } from "../ui";
import { useGroupSession } from "./GroupSession";
import MemberList, { GroupUserCard } from "./MemberList";

const C = {
    loading: { TR: "Grup açılıyor", EN: "Opening the group" },
    goneTitle: { TR: "Bu gruba erişimin yok", EN: "You don't have access to this group" },
    goneText: { TR: "Grup silinmiş olabilir ya da gruptan çıkarılmış olabilirsin.", EN: "The group may have been deleted, or you may have been removed from it." },
    errorTitle: { TR: "Grup açılamadı", EN: "Couldn't open the group" },
    retry: { TR: "Tekrar dene", EN: "Try again" },
    home: { TR: "Hanogt Social'a dön", EN: "Back to Hanogt Social" },
    search: { TR: "Bu kanalda ara", EN: "Search this channel" },
    searchPlaceholder: { TR: "#{channel} içinde ara…", EN: "Search #{channel}…" },
    closeSearch: { TR: "Aramayı kapat", EN: "Close search" },
    pinned: { TR: "Sabitlenen mesajlar", EN: "Pinned messages" },
    invite: { TR: "Davet et", EN: "Invite" },
    members: { TR: "Üyeler", EN: "Members" },
    topicHint: { TR: "#{topic} etiketli mesajlar; buraya yazdıkların otomatik etiketlenir.", EN: "Messages tagged #{topic}; what you write here is tagged automatically." },
    files: { TR: "Dosyalar", EN: "Files" },
    filesText: { TR: "Ortak dosyalar canlı senkronize olur; herkes aynı dosyayı aynı anda düzenleyebilir.", EN: "Shared files sync live; everyone can edit the same file at the same time." },
    filesOfflineTitle: { TR: "Dosyalar şu anda kullanılamıyor", EN: "Files are unavailable right now" },
    filesOfflineText: { TR: "Ortak dosyalar için tarayıcının bulut bağlantısı gerekiyor. Sohbet bu sırada sunucu üzerinden çalışmaya devam ediyor.", EN: "Shared files need the browser's cloud connection. Meanwhile the chat keeps working through the server." },
    backToFiles: { TR: "Dosya listesi", EN: "File list" },
    offline: { TR: "Canlı bağlantı yok: mesajlar birkaç saniyede bir yenileniyor; ortak dosyalar bağlantı gelince açılır.", EN: "No live connection: messages refresh every few seconds; shared files open once it's back." },
} satisfies Record<string, Copy>;

/** The open group's main area: a channel (all messages or one #topic) or the shared files. */
export default function GroupView() {
    const { tx } = useI18n();
    const session = useGroupSession();
    const params = useSearchParams();
    const view = params.get("view") === "files" ? "files" : "chat";

    if (session.phase === "loading" || (session.phase === "ready" && !session.context)) {
        return (
            <main id="main-content" className="flex min-w-0 flex-1 flex-col bg-white dark:bg-zinc-900" aria-busy="true" aria-label={tx(C.loading)}>
                <MainHeader aside={false}><span className="h-4 w-40 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" /></MainHeader>
                <div className="flex flex-1 items-center justify-center"><Spinner className="h-8 w-8 text-indigo-500" /></div>
            </main>
        );
    }
    if (session.phase === "gone" || session.phase === "error" || !session.context) {
        const gone = session.phase !== "error";
        return (
            <main id="main-content" className="flex min-w-0 flex-1 flex-col bg-white dark:bg-zinc-900">
                <MainHeader aside={false}><h1 className="font-bold">{tx(gone ? C.goneTitle : C.errorTitle)}</h1></MainHeader>
                <EmptyState icon={<UsersRound className="h-8 w-8" aria-hidden />} title={tx(gone ? C.goneTitle : C.errorTitle)} text={gone ? tx(C.goneText) : session.loadError}>
                    <div className="mt-5 flex flex-wrap justify-center gap-2">
                        {!gone && <button type="button" onClick={session.retry} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500"><RefreshCw className="h-4 w-4" aria-hidden />{tx(C.retry)}</button>}
                        <Link href="/social" className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold hover:bg-zinc-100 dark:border-white/10 dark:hover:bg-white/5">{tx(C.home)}</Link>
                    </div>
                </EmptyState>
            </main>
        );
    }

    return (
        <>
            {view === "files" ? <FilesScreen /> : <ChannelScreen />}
            <SocialAside label={tx(session.panel === "pinned" ? C.pinned : C.members)}>
                {session.panel === "pinned"
                    ? <PinnedPanel messages={session.messages.messages} onJump={(id) => { session.setPanel("members"); session.jumpTo(id); }} onClose={() => session.setPanel("members")} />
                    : <MemberList />}
            </SocialAside>
            <GroupUserCard />
        </>
    );
}

function OfflineNotice() {
    const { tx } = useI18n();
    const { live } = useSocial();
    if (live) return null;
    return (
        <p className="flex shrink-0 items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-200" role="status">
            <CloudOff className="h-3.5 w-3.5 shrink-0" aria-hidden />{tx(C.offline)}
        </p>
    );
}

function ChannelScreen() {
    const { tx } = useI18n();
    const router = useRouter();
    const params = useSearchParams();
    const session = useGroupSession();
    const social = useSocial();
    const context = session.context!;
    const { group } = context;
    const topic = params.get("topic") || "";
    const mainChannel = group.contentLanguage === "en" ? "general" : "genel";
    const channel = topic || mainChannel;
    const [searchOpen, setSearchOpen] = useState(false);
    const [search, setSearch] = useState("");
    const asideShown = social.ui.wide ? !social.ui.asideCollapsed : social.ui.asideOpen;

    // Changing the channel clears the search.
    const [searchFor, setSearchFor] = useState(topic);
    if (searchFor !== topic) {
        setSearchFor(topic);
        setSearch("");
        setSearchOpen(false);
    }

    // The open channel counts as read (the channel list's unread markers), once the tab is visible.
    const list = session.messages.messages;
    const latest = list.length ? list[list.length - 1].createdAt : 0;
    const markChannelRead = session.markChannelRead;
    const channelKey = topic.toLocaleLowerCase();
    useEffect(() => {
        if (!latest) return;
        if (document.visibilityState === "visible") {
            markChannelRead(channelKey, latest);
            return;
        }
        const onVisible = () => {
            if (document.visibilityState === "visible") markChannelRead(channelKey, latest);
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => document.removeEventListener("visibilitychange", onVisible);
    }, [channelKey, latest, markChannelRead]);

    // A starred message's link (?message=…) scrolls to it once the messages are there.
    const wantedMessage = params.get("message") || "";
    const messagesLoaded = session.messages.loaded;
    const jumpTo = session.jumpTo;
    const jumpedRef = useRef("");
    useEffect(() => {
        if (!wantedMessage || !messagesLoaded || jumpedRef.current === wantedMessage) return;
        jumpedRef.current = wantedMessage;
        const timer = window.setTimeout(() => jumpTo(wantedMessage), 120);
        return () => window.clearTimeout(timer);
    }, [jumpTo, messagesLoaded, wantedMessage]);

    const showPanel = (panel: "members" | "pinned") => {
        if (session.panel === panel && asideShown) {
            social.ui.toggleAside();
            return;
        }
        session.setPanel(panel);
        if (!asideShown) social.ui.toggleAside();
    };

    return (
        <main id="main-content" className="flex min-w-0 flex-1 flex-col bg-white dark:bg-zinc-900">
            <MainHeader
                aside={false}
                actions={(
                    <>
                        <IconButton label={tx(C.search)} onClick={() => { setSearchOpen((value) => !value); setSearch(""); }} active={searchOpen} pressed={searchOpen}><Search className="h-5 w-5" aria-hidden /></IconButton>
                        <IconButton label={tx(C.pinned)} onClick={() => showPanel("pinned")} active={asideShown && session.panel === "pinned"} pressed={asideShown && session.panel === "pinned"} controls="social-aside">
                            <span className="relative"><Pin className="h-5 w-5" aria-hidden />{group.pinnedMessageIds.length > 0 && <span className="absolute -end-1.5 -top-1.5 rounded-full bg-zinc-500 px-1 text-[9px] font-bold leading-[14px] text-white">{group.pinnedMessageIds.length}</span>}</span>
                        </IconButton>
                        {context.canInvite && <IconButton label={tx(C.invite)} onClick={session.openInvite}><UserPlus className="h-5 w-5" aria-hidden /></IconButton>}
                        <IconButton label={tx(C.members)} onClick={() => showPanel("members")} active={asideShown && session.panel === "members"} pressed={asideShown && session.panel === "members"} controls="social-aside"><UsersRound className="h-5 w-5" aria-hidden /></IconButton>
                    </>
                )}
            >
                <Hash className="h-5 w-5 shrink-0 text-zinc-400" aria-hidden />
                <h1 className="shrink-0 truncate text-base font-bold">{channel}</h1>
                {(topic || group.description) && (
                    <>
                        <span className="mx-1 hidden h-5 w-px shrink-0 bg-zinc-200 dark:bg-white/10 md:block" aria-hidden />
                        <p className="hidden min-w-0 truncate text-[13px] text-zinc-500 dark:text-zinc-400 md:block" title={topic ? tx(C.topicHint, { topic }) : group.description}>{topic ? tx(C.topicHint, { topic }) : group.description}</p>
                    </>
                )}
            </MainHeader>
            <OfflineNotice />
            {searchOpen && (
                <div className="flex shrink-0 items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-white/10">
                    <label className="relative flex-1">
                        <span className="sr-only">{tx(C.search)}</span>
                        <Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
                        <input autoFocus type="search" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setSearch(""); setSearchOpen(false); } }} placeholder={tx(C.searchPlaceholder, { channel })} className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-1.5 pe-3 ps-8 text-sm outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-zinc-950" />
                    </label>
                    <IconButton label={tx(C.closeSearch)} onClick={() => { setSearch(""); setSearchOpen(false); }}><X className="h-4 w-4" aria-hidden /></IconButton>
                </div>
            )}
            {session.showGuide && session.guideOpen && (
                <div className="shrink-0 px-3 pt-2">
                    <GettingStarted steps={session.checklist} onDismiss={session.dismissGuide} dismissing={session.dismissing} />
                </div>
            )}
            <div className="relative flex min-h-0 flex-1">
                <ChatPanel
                    key={topic}
                    topic={topic}
                    onTopicChange={(next) => router.push(groupHref(context.groupId, next ? { topic: next } : {}))}
                    search={search}
                    channelName={mainChannel}
                    messages={session.messages.messages}
                    loaded={session.messages.loaded}
                    hasMore={session.messages.hasMore}
                    onLoadOlder={session.messages.loadOlder}
                    lastReadAt={session.lastReadAt}
                    visible
                    typingNames={session.typingNames}
                    onTyping={session.onTyping}
                    onStopTyping={session.stopTyping}
                    focusNonce={session.focusNonce}
                    jumpTarget={session.jumpTarget}
                    onServerChange={session.messages.refresh}
                    onOpenUser={session.openUserCard}
                />
            </div>
        </main>
    );
}

function FilesScreen() {
    const { tx } = useI18n();
    const router = useRouter();
    const params = useSearchParams();
    const session = useGroupSession();
    const { live, ui } = useSocial();
    const context = session.context!;
    const { files, loaded, saveState, flushAll, updateCode, bindEditor, setMountedFile } = session.files;
    const requested = params.get("file") || "";
    const activeFile = files.find((file) => file.id === requested) ?? (ui.wide ? files[0] ?? null : null);
    const showEditor = Boolean(requested && activeFile);

    // Ctrl/⌘+S saves every pending change at once.
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
                event.preventDefault();
                flushAll();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [flushAll]);

    const select = (fileId: string) => router.push(groupHref(context.groupId, { view: "files", file: fileId }));

    return (
        <main id="main-content" className="flex min-w-0 flex-1 flex-col bg-white dark:bg-zinc-900">
            <MainHeader
                actions={live ? <span className="hidden sm:inline-flex"><SaveIndicator state={saveState} onRetry={flushAll} /></span> : null}
            >
                <FolderOpen className="h-5 w-5 shrink-0 text-zinc-400" aria-hidden />
                <h1 className="shrink-0 text-base font-bold">{tx(C.files)}</h1>
                <span className="mx-1 hidden h-5 w-px shrink-0 bg-zinc-200 dark:bg-white/10 md:block" aria-hidden />
                <p className="hidden min-w-0 truncate text-[13px] text-zinc-500 dark:text-zinc-400 md:block">{tx(C.filesText)}</p>
            </MainHeader>
            {!live ? (
                <EmptyState icon={<CloudOff className="h-8 w-8" aria-hidden />} title={tx(C.filesOfflineTitle)} text={tx(C.filesOfflineText)} />
            ) : (
                <div className="flex min-h-0 flex-1">
                    <aside className={cx("min-h-0 w-full shrink-0 flex-col border-e border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-zinc-950 lg:flex lg:w-64", showEditor ? "hidden" : "flex")} aria-label={tx(C.files)}>
                        <FilesPanel
                            files={files}
                            loaded={loaded}
                            activeId={activeFile?.id ?? ""}
                            onSelect={select}
                            onCreate={session.createFile}
                            onRename={session.renameFile}
                            onDelete={session.deleteFile}
                            onDownload={session.downloadFile}
                            onDownloadAll={session.downloadAll}
                            onOpenInEditor={session.openInEditor}
                            zipBusy={session.zipBusy}
                            newFileOpen={session.newFile.open}
                            newFileKey={session.newFile.key}
                            onNewFile={session.openNewFile}
                            onCloseNewFile={session.closeNewFile}
                        />
                    </aside>
                    <section className={cx("min-h-0 min-w-0 flex-1 flex-col lg:flex", showEditor ? "flex" : "hidden")} aria-label={activeFile?.name}>
                        {showEditor && (
                            <Link href={groupHref(context.groupId, { view: "files" })} className="m-2 mb-0 inline-flex w-fit items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-indigo-600 hover:bg-indigo-500/10 lg:hidden dark:text-indigo-300">
                                <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />{tx(C.backToFiles)}
                            </Link>
                        )}
                        <div className="flex min-h-0 flex-1">
                            <EditorPane
                                file={activeFile}
                                loaded={loaded}
                                saveState={saveState}
                                onChange={updateCode}
                                bindEditor={bindEditor}
                                setMountedFile={setMountedFile}
                                onRetrySave={flushAll}
                                onDownload={session.downloadFile}
                                onOpenInEditor={session.openInEditor}
                                onNewFile={session.openNewFile}
                                top={session.showGuide && session.guideOpen ? <GettingStarted steps={session.checklist} onDismiss={session.dismissGuide} dismissing={session.dismissing} /> : null}
                            />
                        </div>
                    </section>
                </div>
            )}
        </main>
    );
}
