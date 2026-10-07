"use client";

import { AlertTriangle, ChevronDown, ChevronUp, Eye, LoaderCircle, Maximize2, Minimize2, Monitor, RefreshCw, Smartphone, Tablet, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n, type Copy } from "@/lib/i18n";
import { renderLatex } from "@/lib/runtimes/latex";
import { renderMarkdown } from "@/lib/runtimes/markdown";
import {
    PREVIEW_HOST_SOURCE, buildCssShowcase, buildLiveShell, buildLogoDocument, buildMarkdownDocument, buildSvgDocument, buildWebPreview, createPreviewToken,
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
    nothing: { TR: "Önizlenecek dosya yok. HTML, CSS, Markdown, AsciiDoc, SVG, Mermaid, Graphviz, LaTeX, ABC, GLSL ya da Logo dosyası ekleyin veya Web projesi şablonuyla başlayın.", EN: "Nothing to preview. Add an HTML, CSS, Markdown, AsciiDoc, SVG, Mermaid, Graphviz, LaTeX, ABC, GLSL or Logo file, or start from the Web project template." },
    missing: { TR: "Projede bulunmayan dosyalar: {files}", EN: "Files not in this project: {files}" },
    sandboxNote: { TR: "Sayfa korumalı bir çerçevede çalışır: dış betikler, stiller ve ağ istekleri engellenir; resimler https üzerinden yüklenebilir.", EN: "The page runs in a sandboxed frame: external scripts, styles and network requests are blocked; images can load over https." },
    frameTitle: { TR: "Önizleme: {name}", EN: "Preview: {name}" },
    emptyMarkdown: { TR: "Bu Markdown dosyası boş.", EN: "This Markdown file is empty." },
    loadingMermaid: { TR: "Mermaid diyagram motoru yükleniyor…", EN: "Loading the Mermaid diagram engine…" },
    loadingLatex: { TR: "KaTeX matematik motoru yükleniyor…", EN: "Loading the KaTeX math engine…" },
    loadingGraphviz: { TR: "Graphviz çizge motoru yükleniyor…", EN: "Loading the Graphviz engine…" },
    loadingAbc: { TR: "ABC nota motoru yükleniyor…", EN: "Loading the ABC notation engine…" },
    loadingAsciidoc: { TR: "AsciiDoc motoru yükleniyor…", EN: "Loading the AsciiDoc engine…" },
    loadingGlsl: { TR: "Gölgelendirici önizlemesi hazırlanıyor…", EN: "Preparing the shader preview…" },
    loadingLogo: { TR: "Logo yorumlayıcısı yükleniyor…", EN: "Loading the Logo interpreter…" },
    loadFailed: { TR: "Önizleme motoru yüklenemedi ({message}).", EN: "The preview engine could not be loaded ({message})." },
    retry: { TR: "Tekrar dene", EN: "Try again" },
    mermaidError: { TR: "Diyagram çizilemedi", EN: "The diagram could not be drawn" },
    latexError: { TR: "Formül işlenemedi", EN: "The formula could not be rendered" },
    dotError: { TR: "Çizge çizilemedi", EN: "The graph could not be drawn" },
    abcError: { TR: "Nota yazılamadı", EN: "The music could not be rendered" },
    asciidocError: { TR: "Belge dönüştürülemedi", EN: "The document could not be converted" },
    glslError: { TR: "Gölgelendirici derlenemedi", EN: "The shader could not be compiled" },
    warnings: { TR: "Uyarılar", EN: "Warnings" },
    pause: { TR: "Duraklat", EN: "Pause" },
    play: { TR: "Oynat", EN: "Play" },
    noWebgl: { TR: "Bu tarayıcıda WebGL kullanılamıyor, bu yüzden gölgelendirici gösterilemiyor.", EN: "WebGL is not available in this browser, so the shader can't be shown." },
    emptyGraph: { TR: "Henüz gösterilecek bir şey yok; çizgenizi DOT diliyle yazmaya başlayın.", EN: "Nothing to show yet; start writing your graph in DOT." },
    emptyMusic: { TR: "Henüz gösterilecek bir şey yok; ezginizi ABC notasyonuyla yazmaya başlayın.", EN: "Nothing to show yet; start writing your tune in ABC notation." },
    emptyShader: { TR: "Henüz gösterilecek bir şey yok; bir parça gölgelendiricisi yazmaya başlayın.", EN: "Nothing to show yet; start writing a fragment shader." },
    logoOutput: { TR: "Çıktı", EN: "Output" },
    logoError: { TR: "Program bir hatayla durdu", EN: "The program stopped with an error" },
    logoStats: { TR: "Çizgi: {lines} · Adım: {steps}", EN: "Lines: {lines} · Steps: {steps}" },
    logoDrawing: { TR: "Kaplumbağanın çizimi", EN: "The turtle's drawing" },
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
    // Library frames run their own inline script (Mermaid, KaTeX, Graphviz, abcjs, WebGL) and nothing else.
    mermaid: "allow-scripts",
    latex: "allow-scripts",
    dot: "allow-scripts",
    abc: "allow-scripts",
    glsl: "allow-scripts",
    // AsciiDoc links open in a new tab, like Markdown's; the document's own markup can't run scripts.
    asciidoc: "allow-scripts allow-popups allow-popups-to-escape-sandbox",
    // Logo is drawn in the page and shown as a static SVG.
    logo: "",
};

const LOG_STYLES: Record<PreviewLogLevel, string> = {
    log: "text-zinc-700 dark:text-zinc-200",
    debug: "text-zinc-500 dark:text-zinc-400",
    info: "text-sky-700 dark:text-sky-300",
    warn: "text-amber-700 dark:text-amber-300 bg-amber-500/5",
    error: "text-red-600 dark:text-red-400 bg-red-500/5",
};

// ------------------------------------------------------------ library assets
/** Same-origin files copied to /public/runtimes by scripts/copy-runtimes.mjs (GLSL needs no library). */
const LIVE_ASSETS: Record<LivePreviewKind, { script: string; css?: string }> = {
    mermaid: { script: "/runtimes/mermaid/mermaid.min.js" },
    latex: { script: "/runtimes/katex/katex.min.js", css: "/runtimes/katex/katex.css" },
    dot: { script: "/runtimes/graphviz/graphviz.js" },
    abc: { script: "/runtimes/abcjs/abcjs-basic-min.js" },
    asciidoc: { script: "/runtimes/asciidoctor/asciidoctor.js" },
    glsl: { script: "" },
};

const LIVE_TEXTS: Record<LivePreviewKind, { loading: Copy; error: Copy; empty: Copy }> = {
    mermaid: { loading: C.loadingMermaid, error: C.mermaidError, empty: C.emptyDiagram },
    latex: { loading: C.loadingLatex, error: C.latexError, empty: C.emptyDocument },
    dot: { loading: C.loadingGraphviz, error: C.dotError, empty: C.emptyGraph },
    abc: { loading: C.loadingAbc, error: C.abcError, empty: C.emptyMusic },
    asciidoc: { loading: C.loadingAsciidoc, error: C.asciidocError, empty: C.emptyDocument },
    glsl: { loading: C.loadingGlsl, error: C.glslError, empty: C.emptyShader },
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
type LogoRuntime = typeof import("@/lib/runtimes/logo");
type Shown = { doc: BuiltDocument; version: number };

/** Which file a document shows ("" for none). */
function identityOf(doc: BuiltDocument) {
    return doc ? `${doc.kind}:${doc.name}` : "";
}

/** Same frame (only the source of a live preview changed) keeps the version, so the iframe is not recreated. */
function advance(current: Shown, next: BuiltDocument): Shown {
    const sameFrame = Boolean(current.doc && next && current.doc.payload && next.payload && current.doc.html === next.html);
    return { doc: next, version: sameFrame ? current.version : current.version + 1 };
}

/** Loads the library of a live preview (Mermaid, LaTeX, Graphviz…) only when such a file is previewed. */
function useLiveAssets(kind: PreviewKind | null) {
    const [state, setState] = useState<{ kind: LivePreviewKind | null; assets: LiveAssets | null; error: string | null }>({ kind: null, assets: null, error: null });
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        if (!isLivePreviewKind(kind)) return;
        let cancelled = false;
        const urls = LIVE_ASSETS[kind];
        Promise.all([urls.script ? loadAsset(urls.script) : Promise.resolve(""), urls.css ? loadAsset(urls.css) : Promise.resolve("")]).then(
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

/** Loads the Logo interpreter (a separate chunk) the first time a Logo file is previewed. */
function useLogoRuntime(active: boolean) {
    const [state, setState] = useState<{ runtime: LogoRuntime | null; error: string | null }>({ runtime: null, error: null });
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        if (!active || state.runtime) return;
        let cancelled = false;
        import("@/lib/runtimes/logo").then(
            (runtime) => {
                if (!cancelled) setState({ runtime, error: null });
            },
            (error: unknown) => {
                if (!cancelled) setState({ runtime: null, error: error instanceof Error ? error.message : String(error) });
            },
        );
        return () => {
            cancelled = true;
        };
    }, [active, state.runtime, attempt]);
    const retry = useCallback(() => {
        setState({ runtime: null, error: null });
        setAttempt((value) => value + 1);
    }, []);
    return { ...state, retry };
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
    const logoLabels = useMemo(() => ({
        output: tx(C.logoOutput),
        error: tx(C.logoError),
        location: tx(C.svgLocation),
        stats: tx(C.logoStats),
        drawing: tx(C.logoDrawing),
    }), [tx]);

    const target = useMemo(() => resolvePreviewTarget(files, activeFile), [files, activeFile]);
    const liveKind: LivePreviewKind | null = target && isLivePreviewKind(target.kind) ? target.kind : null;
    const { assets, error: liveAssetError, retry: retryLiveAssets } = useLiveAssets(target?.kind ?? null);
    const logo = useLogoRuntime(target?.kind === "logo");
    const assetError = target?.kind === "logo" ? logo.error : liveAssetError;
    const retry = target?.kind === "logo" ? logo.retry : retryLiveAssets;
    const liveLabels = useMemo(() => ({
        error: tx(LIVE_TEXTS[liveKind ?? "mermaid"].error),
        line: tx(C.errorLine),
        empty: tx(LIVE_TEXTS[liveKind ?? "mermaid"].empty),
        unsupported: tx(C.unsupported),
        warnings: tx(C.warnings),
        pause: tx(C.pause),
        play: tx(C.play),
        noWebgl: tx(C.noWebgl),
    }), [tx, liveKind]);
    // The frame of a live preview (Mermaid, LaTeX, Graphviz…) is rebuilt only when the library, theme
    // or labels change; edits to the file are sent to the running frame instead.
    const shell = useMemo(() => {
        if (!liveKind || !assets || assets.kind !== liveKind) return null;
        const token = createPreviewToken();
        return { token, html: buildLiveShell(liveKind, { token, dark, library: assets.script, css: assets.css, labels: liveLabels }) };
    }, [liveKind, assets, dark, liveLabels]);
    const latexLocale = language === "TR" ? "tr" : "en";

    // Rebuilding is cheap string work; applying it to the frame is debounced.
    const live = useMemo<BuiltDocument>(() => {
        if (!target) return null;
        if (isLivePreviewKind(target.kind)) {
            if (!shell) return null;
            const payload: LivePreviewPayload = target.kind === "latex"
                ? (() => {
                    const rendered = renderLatex(target.file.code, { locale: latexLocale });
                    return { kind: "latex", html: rendered.html, macros: rendered.macros, warnings: rendered.warnings };
                })()
                : { kind: target.kind, code: target.file.code };
            return { kind: target.kind, html: shell.html, token: shell.token, name: target.file.name, missing: [], payload };
        }
        const token = createPreviewToken();
        if (target.kind === "logo") {
            if (!logo.runtime) return null;
            // RANDOM draws the same picture while typing; Run / Preview rolls new numbers.
            const result = logo.runtime.runLogo(target.file.code, { locale: latexLocale, seed: reloadKey + 1 });
            const svg = logo.runtime.renderLogoSvg(result, { title: logoLabels.drawing });
            return { html: buildLogoDocument(result, target.file.code, { dark, labels: logoLabels, svg }), token, kind: "logo", name: target.file.name, missing: [] };
        }
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
    }, [target, shell, files, stdin, dark, labels, svgLabels, emptyMarkdown, latexLocale, logoLabels, reloadKey, logo.runtime]);

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

    /** Sends the current source of a live preview to its frame once the frame is listening. */
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
    const loadingLive = Boolean((liveKind && !shell) || (target?.kind === "logo" && !logo.runtime));
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
                                <p>{tx(liveKind ? LIVE_TEXTS[liveKind].loading : C.loadingLogo)}</p>
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
