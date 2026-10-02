"use client";

import { AlertTriangle, ChevronDown, ChevronUp, Eye, LoaderCircle, Maximize2, Minimize2, Monitor, RefreshCw, Smartphone, Tablet, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n, type Copy } from "@/lib/i18n";
import { renderLatex } from "@/lib/runtimes/latex";
import { renderMarkdown } from "@/lib/runtimes/markdown";
import {
    PREVIEW_HOST_SOURCE, buildCssShowcase, buildLiveShell, buildMarkdownDocument, buildSvgDocument, buildWebPreview, createPreviewToken,
    isLivePreviewKind, parsePreviewMessage, resolvePreviewTarget,
    type LivePreviewKind, type LivePreviewPayload, type PreviewKind, type PreviewLogLevel, type PreviewSourceFile,
} from "@/lib/runtimes/web-preview";

interface WebPreviewProps {
    files: PreviewSourceFile[];
    activeFile?: PreviewSourceFile;
    /** Lines returned by prompt() inside the page. */
    stdin: string;
    dark: boolean;
    /** Changes when the page asks for a fresh render (Run / Preview). */
    reloadKey: number;
}

type BuiltDocument =
    | { kind: Exclude<PreviewKind, LivePreviewKind>; html: string; token: string; name: string; missing: string[]; payload?: undefined }
    | { kind: LivePreviewKind; html: string; token: string; name: string; missing: string[]; payload: LivePreviewPayload }
    | null;
type LogEntry = { id: number; level: PreviewLogLevel; text: string };

const DEVICES = { desktop: "100%", tablet: "768px", mobile: "375px" } as const;
type Device = keyof typeof DEVICES;

const C = {
    title: { TR: "Önizleme", EN: "Preview" },
    live: { TR: "Canlı", EN: "Live" },
    autoRefresh: { TR: "Yazdıkça yenile", EN: "Refresh as you type" },
    refresh: { TR: "Yenile", EN: "Refresh" },
    fullscreen: { TR: "Tam ekran", EN: "Fullscreen" },
    exitFullscreen: { TR: "Tam ekrandan çık", EN: "Exit fullscreen" },
    desktop: { TR: "Masaüstü genişliği", EN: "Desktop width" },
    tablet: { TR: "Tablet genişliği (768 px)", EN: "Tablet width (768 px)" },
    mobile: { TR: "Telefon genişliği (375 px)", EN: "Phone width (375 px)" },
    console: { TR: "Konsol", EN: "Console" },
    clearConsole: { TR: "Konsolu temizle", EN: "Clear console" },
    noLogs: { TR: "console.log çıktıları burada görünür.", EN: "console.log output appears here." },
    nothing: { TR: "Önizlenecek dosya yok. HTML, CSS, Markdown, SVG, Mermaid veya LaTeX dosyası ekleyin ya da Web projesi şablonuyla başlayın.", EN: "Nothing to preview. Add an HTML, CSS, Markdown, SVG, Mermaid or LaTeX file, or start from the Web project template." },
    missing: { TR: "Projede bulunmayan dosyalar: {files}", EN: "Files not in this project: {files}" },
    sandboxNote: { TR: "Sayfa korumalı bir çerçevede çalışır: dış betikler, stiller ve ağ istekleri engellenir; resimler https üzerinden yüklenebilir.", EN: "The page runs in a sandboxed frame: external scripts, styles and network requests are blocked; images can load over https." },
    frameTitle: { TR: "Önizleme: {name}", EN: "Preview: {name}" },
    emptyMarkdown: { TR: "Bu Markdown dosyası boş.", EN: "This Markdown file is empty." },
    loadingMermaid: { TR: "Mermaid diyagram motoru yükleniyor…", EN: "Loading the Mermaid diagram engine…" },
    loadingLatex: { TR: "KaTeX matematik motoru yükleniyor…", EN: "Loading the KaTeX math engine…" },
    loadFailed: { TR: "Önizleme motoru yüklenemedi ({message}).", EN: "The preview engine could not be loaded ({message})." },
    retry: { TR: "Tekrar dene", EN: "Try again" },
    mermaidError: { TR: "Diyagram çizilemedi", EN: "The diagram could not be drawn" },
    latexError: { TR: "Formül işlenemedi", EN: "The formula could not be rendered" },
    errorLine: { TR: "{line}. satır", EN: "line {line}" },
    emptyDiagram: { TR: "Henüz gösterilecek bir şey yok; diyagramınızı yazmaya başlayın.", EN: "Nothing to show yet; start writing your diagram." },
    emptyDocument: { TR: "Bu belge boş.", EN: "This document is empty." },
    unsupported: { TR: "Önizlemede desteklenmeyenler: {list}", EN: "Not supported in the preview: {list}" },
    svgInvalid: { TR: "Bu SVG iyi biçimli değil", EN: "This SVG is not well-formed" },
    svgNotSvg: { TR: "Kök öğe <svg> olmalıdır.", EN: "The root element must be <svg>." },
    svgLocation: { TR: "{line}. satır, {column}. sütun", EN: "line {line}, column {column}" },
    svgNamespace: { TR: "önizleme için xmlns eklendi", EN: "xmlns was added for the preview" },
    svgNote: { TR: "SVG içindeki betikler önizlemede çalışmaz.", EN: "Scripts inside the SVG do not run in the preview." },
} satisfies Record<string, Copy>;

const SANDBOX: Record<PreviewKind, string> = {
    // Scripts and form events, but no same-origin access, top navigation, popups or modals.
    web: "allow-scripts allow-forms",
    // Static documents: links may open in a new tab, nothing else.
    markdown: "allow-popups allow-popups-to-escape-sandbox",
    css: "",
    svg: "",
    // Library frames run their own inline script (Mermaid / KaTeX) and nothing else.
    mermaid: "allow-scripts",
    latex: "allow-scripts",
};

const LOG_STYLES: Record<PreviewLogLevel, string> = {
    log: "text-zinc-700 dark:text-zinc-200",
    debug: "text-zinc-500 dark:text-zinc-400",
    info: "text-sky-700 dark:text-sky-300",
    warn: "text-amber-700 dark:text-amber-300 bg-amber-500/5",
    error: "text-red-600 dark:text-red-400 bg-red-500/5",
};

// ------------------------------------------------------------ library assets
/** Same-origin files copied to /public/runtimes by scripts/copy-runtimes.mjs. */
const LIVE_ASSETS: Record<LivePreviewKind, { script: string; css?: string }> = {
    mermaid: { script: "/runtimes/mermaid/mermaid.min.js" },
    latex: { script: "/runtimes/katex/katex.min.js", css: "/runtimes/katex/katex.css" },
};

const assetCache = new Map<string, Promise<string>>();

/** Downloads a library once per page; failed downloads can be retried. */
function loadAsset(url: string): Promise<string> {
    let promise = assetCache.get(url);
    if (!promise) {
        promise = fetch(url, { credentials: "same-origin" }).then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.text();
        });
        promise.catch(() => assetCache.delete(url));
        assetCache.set(url, promise);
    }
    return promise;
}

type LiveAssets = { kind: LivePreviewKind; script: string; css: string };
type Shown = { doc: BuiltDocument; version: number };

/** Which file a document shows ("" for none). */
function identityOf(doc: BuiltDocument) {
    return doc ? `${doc.kind}:${doc.name}` : "";
}

/** Same frame (only the Mermaid/LaTeX source changed) keeps the version, so the iframe is not recreated. */
function advance(current: Shown, next: BuiltDocument): Shown {
    const sameFrame = Boolean(current.doc && next && current.doc.payload && next.payload && current.doc.html === next.html);
    return { doc: next, version: sameFrame ? current.version : current.version + 1 };
}

/** Loads the library of a Mermaid or LaTeX preview only when such a file is previewed. */
function useLiveAssets(kind: PreviewKind | null) {
    const [state, setState] = useState<{ kind: LivePreviewKind | null; assets: LiveAssets | null; error: string | null }>({ kind: null, assets: null, error: null });
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        if (!isLivePreviewKind(kind)) return;
        let cancelled = false;
        const urls = LIVE_ASSETS[kind];
        Promise.all([loadAsset(urls.script), urls.css ? loadAsset(urls.css) : Promise.resolve("")]).then(
            ([script, css]) => {
                if (!cancelled) setState({ kind, assets: { kind, script, css }, error: null });
            },
            (error: unknown) => {
                if (!cancelled) setState({ kind, assets: null, error: error instanceof Error ? error.message : String(error) });
            },
        );
        return () => {
            cancelled = true;
        };
    }, [kind, attempt]);
    const current = isLivePreviewKind(kind) && state.kind === kind ? state : null;
    const retry = useCallback(() => {
        setState({ kind: null, assets: null, error: null });
        setAttempt((value) => value + 1);
    }, []);
    return { assets: current?.assets ?? null, error: current?.error ?? null, retry };
}

export default function WebPreview({ files, activeFile, stdin, dark, reloadKey }: WebPreviewProps) {
    const { tx, language } = useI18n();
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [device, setDevice] = useState<Device>("desktop");
    const [fullscreen, setFullscreen] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [consoleOpen, setConsoleOpen] = useState(true);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const nextLogId = useRef(1);

    const labels = useMemo(() => ({
        title: tx({ TR: "Başlık", EN: "Heading" }),
        paragraph: tx({ TR: "Bu paragraf stil dosyanızla biçimlendirilir.", EN: "This paragraph is styled by your stylesheet." }),
        button: tx({ TR: "Düğme", EN: "Button" }),
        input: tx({ TR: "Metin kutusu", EN: "Text field" }),
        box: tx({ TR: ".box sınıfı", EN: ".box class" }),
        card: tx({ TR: ".card sınıfı", EN: ".card class" }),
        listItem: tx({ TR: "Öğe", EN: "Item" }),
        quote: tx({ TR: "Bir alıntı.", EN: "A quotation." }),
    }), [tx]);
    const svgLabels = useMemo(() => ({
        invalid: tx(C.svgInvalid),
        notSvg: tx(C.svgNotSvg),
        location: tx(C.svgLocation),
        namespaceAdded: tx(C.svgNamespace),
        note: tx(C.svgNote),
    }), [tx]);
    const emptyMarkdown = tx(C.emptyMarkdown);

    const target = useMemo(() => resolvePreviewTarget(files, activeFile), [files, activeFile]);
    const liveKind: LivePreviewKind | null = target && isLivePreviewKind(target.kind) ? target.kind : null;
    const { assets, error: assetError, retry } = useLiveAssets(target?.kind ?? null);
    const liveLabels = useMemo(() => ({
        error: tx(liveKind === "latex" ? C.latexError : C.mermaidError),
        line: tx(C.errorLine),
        empty: tx(liveKind === "latex" ? C.emptyDocument : C.emptyDiagram),
        unsupported: tx(C.unsupported),
    }), [tx, liveKind]);
    // The frame of a Mermaid/LaTeX preview is rebuilt only when the library, theme or labels change;
    // edits to the file are sent to the running frame instead.
    const shell = useMemo(() => {
        if (!liveKind || !assets || assets.kind !== liveKind) return null;
        const token = createPreviewToken();
        return { token, html: buildLiveShell(liveKind, { token, dark, library: assets.script, css: assets.css, labels: liveLabels }) };
    }, [liveKind, assets, dark, liveLabels]);
    const latexLocale = language === "TR" ? "tr" : "en";

    // Rebuilding is cheap string work; applying it to the frame is debounced.
    const live = useMemo<BuiltDocument>(() => {
        if (!target) return null;
        if (target.kind === "mermaid" || target.kind === "latex") {
            if (!shell) return null;
            const payload: LivePreviewPayload = target.kind === "mermaid"
                ? { kind: "mermaid", code: target.file.code }
                : (() => {
                    const rendered = renderLatex(target.file.code, { locale: latexLocale });
                    return { kind: "latex", html: rendered.html, macros: rendered.macros, warnings: rendered.warnings };
                })();
            return { kind: target.kind, html: shell.html, token: shell.token, name: target.file.name, missing: [], payload };
        }
        const token = createPreviewToken();
        if (target.kind === "web") {
            const result = buildWebPreview(files, target.file, { token, stdin, dark });
            return { html: result.html, token, kind: "web", name: target.file.name, missing: result.missing };
        }
        if (target.kind === "markdown") {
            return { html: buildMarkdownDocument(renderMarkdown(target.file.code), { dark, emptyText: emptyMarkdown }), token, kind: "markdown", name: target.file.name, missing: [] };
        }
        if (target.kind === "svg") {
            return { html: buildSvgDocument(target.file.code, { dark, labels: svgLabels }), token, kind: "svg", name: target.file.name, missing: [] };
        }
        return { html: buildCssShowcase(target.file.code, { dark, labels }), token, kind: "css", name: target.file.name, missing: [] };
    }, [target, shell, files, stdin, dark, labels, svgLabels, emptyMarkdown, latexLocale]);

    const [shown, setShown] = useState<Shown>(() => ({ doc: live, version: 0 }));
    const liveRef = useRef(live);
    useEffect(() => {
        liveRef.current = live;
        // Edits are debounced; another file (or the first document once a library has loaded)
        // is shown at once. Without auto refresh the page only changes on Refresh, unless
        // nothing is shown yet.
        const delay = identityOf(live) === identityOf(shown.doc) ? 350 : 0;
        const timer = window.setTimeout(() => setShown((current) => (current.doc === live || (!autoRefresh && current.doc) ? current : advance(current, live))), delay);
        return () => window.clearTimeout(timer);
    }, [live, autoRefresh, shown.doc]);

    // Run / Preview from the page always renders the latest code.
    const lastReloadKey = useRef(reloadKey);
    useEffect(() => {
        if (lastReloadKey.current === reloadKey) return;
        lastReloadKey.current = reloadKey;
        const timer = window.setTimeout(() => setShown((current) => ({ doc: liveRef.current, version: current.version + 1 })), 0);
        return () => window.clearTimeout(timer);
    }, [reloadKey]);

    const refresh = () => setShown((current) => ({ doc: liveRef.current, version: current.version + 1 }));
    const doc = shown.doc;
    const tokenRef = useRef<string | null>(null);
    const shownRef = useRef(shown);
    /** The live frame window that is listening (it said "ready" or finished loading). */
    const readyFrame = useRef<Window | null>(null);
    /** What was last sent, so "ready" and the load event do not render the same source twice. */
    const lastPosted = useRef<{ frame: Window; payload: LivePreviewPayload } | null>(null);
    useEffect(() => {
        tokenRef.current = doc?.token ?? null;
        shownRef.current = shown;
    }, [doc, shown]);

    /** Sends the current Mermaid/LaTeX source to the live frame once it is listening. */
    const postPayload = useCallback(() => {
        const current = shownRef.current.doc;
        const frame = iframeRef.current?.contentWindow;
        if (!frame || !current?.payload || readyFrame.current !== frame) return;
        if (lastPosted.current?.frame === frame && lastPosted.current.payload === current.payload) return;
        lastPosted.current = { frame, payload: current.payload };
        frame.postMessage({ source: PREVIEW_HOST_SOURCE, token: current.token, type: "render", payload: current.payload }, "*");
    }, []);

    useEffect(() => {
        if (doc?.payload) postPayload();
    }, [doc, postPayload]);

    /** Inline scripts have run once a srcdoc frame has loaded, so its listener is in place. */
    const onFrameLoad = useCallback(() => {
        const frame = iframeRef.current?.contentWindow;
        if (!frame || !shownRef.current.doc?.payload) return;
        readyFrame.current = frame;
        postPayload();
    }, [postPayload]);

    useEffect(() => {
        const onMessage = (event: MessageEvent) => {
            // Only the current preview frame (an opaque "null" origin) may talk to us.
            if (!iframeRef.current || event.source !== iframeRef.current.contentWindow || !tokenRef.current) return;
            const message = parsePreviewMessage(event.data, tokenRef.current);
            if (!message) return;
            if (message.type === "ready" || message.type === "clear") {
                setLogs([]);
                if (message.type === "ready") {
                    // Whichever comes first, "ready" or the load event, sends the source once.
                    readyFrame.current = iframeRef.current.contentWindow;
                    postPayload();
                }
                return;
            }
            const entry: LogEntry = { id: nextLogId.current++, level: message.level, text: message.args.join(" ") };
            setLogs((current) => [...current.slice(-499), entry]);
        };
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, [postPayload]);

    const errorCount = logs.filter((log) => log.level === "error").length;
    const loadingLive = Boolean(liveKind && !shell);
    const deviceButton = (id: Device, label: Copy, Icon: typeof Monitor) => (
        <button type="button" onClick={() => setDevice(id)} aria-pressed={device === id} className={`rounded-lg p-1.5 transition ${device === id ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"}`} title={tx(label)} aria-label={tx(label)}>
            <Icon className="h-4 w-4" aria-hidden />
        </button>
    );

    return (
        <div className={`flex min-h-0 flex-col bg-white dark:bg-zinc-950 ${fullscreen ? "fixed inset-0 z-[75]" : "h-full"}`}>
            <div className="flex flex-wrap items-center gap-1 border-b border-zinc-200 px-2 py-1.5 dark:border-white/10">
                <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                    <Eye className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="truncate">{doc ? doc.name : tx(C.title)}</span>
                    {autoRefresh && doc && <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300">{tx(C.live)}</span>}
                </span>
                <div className="ms-auto flex items-center gap-0.5">
                    {deviceButton("desktop", C.desktop, Monitor)}
                    {deviceButton("tablet", C.tablet, Tablet)}
                    {deviceButton("mobile", C.mobile, Smartphone)}
                    <label className="mx-1 hidden cursor-pointer items-center gap-1.5 text-[11px] text-zinc-500 sm:flex dark:text-zinc-400">
                        <input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} className="h-3.5 w-3.5 accent-indigo-600" />
                        {tx(C.autoRefresh)}
                    </label>
                    <button type="button" onClick={refresh} className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100" title={tx(C.refresh)} aria-label={tx(C.refresh)}>
                        <RefreshCw className="h-4 w-4" aria-hidden />
                    </button>
                    <button type="button" onClick={() => setFullscreen((value) => !value)} className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100" title={tx(fullscreen ? C.exitFullscreen : C.fullscreen)} aria-label={tx(fullscreen ? C.exitFullscreen : C.fullscreen)}>
                        {fullscreen ? <Minimize2 className="h-4 w-4" aria-hidden /> : <Maximize2 className="h-4 w-4" aria-hidden />}
                    </button>
                </div>
            </div>

            {doc?.missing.length ? (
                <p className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-800 dark:text-amber-200">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {tx(C.missing, { files: doc.missing.join(", ") })}
                </p>
            ) : null}

            <div className="flex min-h-0 flex-1 justify-center overflow-auto bg-zinc-100 p-2 dark:bg-zinc-900">
                {loadingLive ? (
                    <div className="flex max-w-sm flex-col items-center justify-center gap-3 px-4 text-center text-sm text-zinc-500 dark:text-zinc-400" role="status">
                        {assetError ? (
                            <>
                                <AlertTriangle className="h-8 w-8 text-amber-500" aria-hidden />
                                <p>{tx(C.loadFailed, { message: assetError })}</p>
                                <button type="button" onClick={retry} className="rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500">{tx(C.retry)}</button>
                            </>
                        ) : (
                            <>
                                <LoaderCircle className="h-8 w-8 animate-spin" aria-hidden />
                                <p>{tx(liveKind === "latex" ? C.loadingLatex : C.loadingMermaid)}</p>
                            </>
                        )}
                    </div>
                ) : doc ? (
                    <iframe
                        key={`${shown.version}-${doc.kind}`}
                        ref={iframeRef}
                        title={tx(C.frameTitle, { name: doc.name })}
                        srcDoc={doc.html}
                        sandbox={SANDBOX[doc.kind]}
                        referrerPolicy="no-referrer"
                        onLoad={onFrameLoad}
                        style={{ width: DEVICES[device], maxWidth: "100%" }}
                        className="h-full min-h-64 rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-white/10"
                    />
                ) : (
                    <div className="flex max-w-sm flex-col items-center justify-center gap-3 px-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
                        <Eye className="h-8 w-8" aria-hidden />
                        <p>{tx(C.nothing)}</p>
                    </div>
                )}
            </div>

            {doc?.kind === "web" && (
                <div className={`flex flex-col border-t border-zinc-200 dark:border-white/10 ${consoleOpen ? "h-36 sm:h-44" : ""}`}>
                    <div className="flex items-center gap-2 px-2 py-1">
                        <button type="button" onClick={() => setConsoleOpen((value) => !value)} className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10" aria-expanded={consoleOpen}>
                            {consoleOpen ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronUp className="h-3.5 w-3.5" aria-hidden />}
                            {tx(C.console)}
                            {logs.length > 0 && <span className="rounded-full bg-zinc-500/15 px-1.5 text-[10px] tabular-nums">{logs.length}</span>}
                            {errorCount > 0 && <span className="rounded-full bg-red-500/15 px-1.5 text-[10px] tabular-nums text-red-600 dark:text-red-400">{errorCount}</span>}
                        </button>
                        <p className="hidden min-w-0 flex-1 truncate text-[10px] text-zinc-400 lg:block">{tx(C.sandboxNote)}</p>
                        <button type="button" onClick={() => setLogs([])} className="ms-auto rounded-lg p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200" title={tx(C.clearConsole)} aria-label={tx(C.clearConsole)}>
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                    </div>
                    {consoleOpen && (
                        <div className="min-h-0 flex-1 overflow-auto px-2 pb-2 font-mono text-[12px] leading-5" role="log" aria-live="polite">
                            {logs.length === 0 ? (
                                <p className="px-1 italic text-zinc-400">{tx(C.noLogs)}</p>
                            ) : logs.map((log) => (
                                <div key={log.id} className={`whitespace-pre-wrap break-words rounded px-1 ${LOG_STYLES[log.level]}`}>{log.text}</div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
