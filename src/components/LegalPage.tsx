"use client";

import { MotionConfig, motion } from "framer-motion";
import { Building2, Check, ChevronDown, Clock, ExternalLink, FileText, History, Languages, Link2, ListOrdered, Printer, Scale, Search, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import Header from "@/components/Header";
import SiteFooter from "@/components/SiteFooter";
import { formatCopy, useI18n, type Copy } from "@/lib/i18n";
import { LEGAL_CHANGES, LEGAL_EFFECTIVE_DATE, LEGAL_VERSION, OPERATOR_LABELS } from "@/lib/legal";
import { isOperatorPublished, type OperatorInfo } from "@/lib/legal-info";

/**
 * Text of a legal document: { TR, EN } copy (the Turkish text prevails; other
 * languages come from the copy packs). Table cells may also be plain strings,
 * shown verbatim, for names and identifiers such as cookie keys.
 *
 * Copy may contain internal links written as [label](/path#anchor) and links
 * to other sites written as [label](https://…), which open in a new tab.
 */
export type LegalCell = Copy | string;

export type LegalSection = {
    /** Stable anchor (#id) that other pages link to; don't rename existing ids. */
    id: string;
    title: Copy;
    paragraphs?: Copy[];
    items?: Copy[];
    table?: { head: Copy[]; rows: LegalCell[][] };
    /** Paragraphs shown after the list and the table. */
    after?: Copy[];
    note?: Copy;
};

export type LegalHighlight = { title: Copy; text: Copy };

export type LegalDocumentPath = "/privacy-policy" | "/disclosure" | "/terms-of-use" | "/refund-policy";

const HISTORY_ID = "version-history";
/** Anchor of the operator card; the texts link to it only once the details are published. */
const OPERATOR_ID = "operator";

const UI = {
    contents: { TR: "İçindekiler", EN: "Contents" },
    oneSection: { TR: "1 bölüm", EN: "1 section" },
    sectionCount: { TR: "{count} bölüm", EN: "{count} sections" },
    search: { TR: "Metinde ara", EN: "Search this document" },
    searchPlaceholder: { TR: "Metinde ara…", EN: "Search this document…" },
    clearSearch: { TR: "Aramayı temizle", EN: "Clear search" },
    oneMatch: { TR: "1 bölüm eşleşti", EN: "1 section matches" },
    manyMatches: { TR: "{count} bölüm eşleşti", EN: "{count} sections match" },
    noMatch: { TR: "Eşleşen bölüm yok. Başka bir kelime deneyin.", EN: "No section matches. Try another word." },
    print: { TR: "Yazdır / PDF", EN: "Print / PDF" },
    version: { TR: "Sürüm {version}", EN: "Version {version}" },
    effective: { TR: "Yürürlük: {date}", EN: "Effective: {date}" },
    readingTime: { TR: "~{minutes} dk okuma", EN: "~{minutes} min read" },
    atAGlance: { TR: "Bir bakışta", EN: "At a glance" },
    related: { TR: "İlgili metinler", EN: "Related documents" },
    copyLink: { TR: "Bölüm bağlantısını kopyala", EN: "Copy a link to this section" },
    copied: { TR: "Bağlantı kopyalandı", EN: "Link copied" },
    copyFallback: { TR: "Bağlantı adres çubuğuna eklendi", EN: "The link is now in the address bar" },
    history: { TR: "Sürüm geçmişi", EN: "Version history" },
    currentVersion: { TR: "Güncel", EN: "Current" },
    sources: { TR: "Resmî mevzuat kaynakları", EN: "Official legislation sources" },
    sourcesText: { TR: "Metinler hazırlanırken aşağıdaki resmî kaynaklar esas alınmıştır. Bağlantılar resmî sitelerde Türkçe olarak açılır; mevzuat değiştikçe metinler güncellenir.", EN: "These official sources were used in preparing the texts. The links open on official websites, in Turkish; the texts are updated as the law changes." },
    prevails: { TR: "Bu metnin Türkçe sürümü esas alınır.", EN: "The Turkish version of this text prevails." },
    translationNote: { TR: "Diğer dillerdeki sürümler bilgilendirme amaçlı çevirilerdir; henüz çevrilmemiş bölümler İngilizce gösterilir.", EN: "Versions in other languages are translations provided for information; any part not yet translated is shown in English." },
    showingOriginal: { TR: "Şu anda bağlayıcı Türkçe metni okuyorsunuz.", EN: "You are now reading the binding Turkish text." },
    showOriginal: { TR: "Türkçe aslını göster", EN: "Show the Turkish original" },
    showTranslation: { TR: "Çeviriye dön", EN: "Back to the translation" },
    newTab: { TR: "(yeni sekmede açılır)", EN: "(opens in a new tab)" },
    operator: { TR: "İşletmeci", EN: "Operator" },
    operatorText: { TR: "Hanogt Codev'i işleten ve bu metinlerde “Hanogt” veya “biz” olarak anılan taraf.", EN: "The party that operates Hanogt Codev, called “Hanogt” or “we” in these texts." },
} satisfies Record<string, Copy>;

const RELATED: ReadonlyArray<{ href: LegalDocumentPath; label: Copy; hint: Copy }> = [
    { href: "/privacy-policy", label: { TR: "Gizlilik Politikası", EN: "Privacy Policy" }, hint: { TR: "Veriler, aktarımlar, saklama ve haklarınız", EN: "Data, transfers, retention and your rights" } },
    { href: "/disclosure", label: { TR: "KVKK Aydınlatma Metni", EN: "KVKK Information Notice" }, hint: { TR: "KVKK m.10 kapsamında bilgilendirme", EN: "Information under KVKK Art. 10" } },
    { href: "/terms-of-use", label: { TR: "Kullanım Şartları", EN: "Terms of Use" }, hint: { TR: "Hesap, içerik ve kullanım kuralları", EN: "Account, content and rules of use" } },
    { href: "/refund-policy", label: { TR: "İade Politikası", EN: "Refund Policy" }, hint: { TR: "Abonelik iadeleri, iptal ve Paddle", EN: "Subscription refunds, cancellation and Paddle" } },
];

const SOURCES: ReadonlyArray<{ href: string; label: Copy }> = [
    { href: "https://www.mevzuat.gov.tr/mevzuatmetin/1.5.6698.pdf", label: { TR: "6698 sayılı Kişisel Verilerin Korunması Kanunu", EN: "Law No. 6698 on the Protection of Personal Data (KVKK)" } },
    { href: "https://www.resmigazete.gov.tr/eskiler/2018/03/20180310-5.htm", label: { TR: "Aydınlatma Yükümlülüğü Tebliği", EN: "Communiqué on the Duty to Inform" } },
    { href: "https://www.kvkk.gov.tr/", label: { TR: "Kişisel Verileri Koruma Kurumu", EN: "Personal Data Protection Authority (KVKK)" } },
    { href: "https://www.mevzuat.gov.tr/mevzuatmetin/1.5.6502.pdf", label: { TR: "6502 sayılı Tüketicinin Korunması Hakkında Kanun", EN: "Consumer Protection Law No. 6502" } },
    { href: "https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=20237&MevzuatTur=7&MevzuatTertip=5", label: { TR: "Mesafeli Sözleşmeler Yönetmeliği", EN: "Distance Contracts Regulation" } },
    { href: "https://www.mevzuat.gov.tr/mevzuatmetin/1.5.6563.pdf", label: { TR: "6563 sayılı Elektronik Ticaretin Düzenlenmesi Hakkında Kanun", EN: "Law No. 6563 on the Regulation of Electronic Commerce" } },
    { href: "https://www.mevzuat.gov.tr/mevzuatmetin/1.5.6098.pdf", label: { TR: "6098 sayılı Türk Borçlar Kanunu", EN: "Turkish Code of Obligations No. 6098" } },
    { href: "https://www.mevzuat.gov.tr/mevzuatmetin/1.5.5846.pdf", label: { TR: "5846 sayılı Fikir ve Sanat Eserleri Kanunu", EN: "Law No. 5846 on Intellectual and Artistic Works" } },
    { href: "https://www.mevzuat.gov.tr/mevzuatmetin/1.5.5651.pdf", label: { TR: "5651 sayılı İnternet Kanunu", EN: "Internet Law No. 5651" } },
];

// Colours are forced for paper: the dark theme and the gradient header would
// otherwise print light text on white. Sections hidden by a search still print.
const PRINT_CSS = `@media print {
  .hanogt-legal, .hanogt-legal * { color: #111 !important; background: transparent !important; box-shadow: none !important; text-shadow: none !important; }
  .hanogt-legal [data-legal-card] { border: 1px solid #d4d4d8 !important; }
  .hanogt-legal article, .hanogt-legal section { break-inside: auto !important; }
  .hanogt-legal h2 { break-after: avoid; }
  .hanogt-legal li, .hanogt-legal tr { break-inside: avoid; }
  .hanogt-legal a { text-decoration: underline !important; }
}`;

// ---------------------------------------------------------------------------
// Text helpers: internal links and accent-insensitive search
// ---------------------------------------------------------------------------

/** [label](/path) for pages of this site and [label](https://…) for other sites; nothing else becomes a link. */
const LINK_PATTERN = /\[([^\]]+)\]\((\/[^)\s]*|https:\/\/[^)\s]+)\)/g;

function stripLinks(text: string) {
    return text.replace(LINK_PATTERN, "$1");
}

type FoldedText = { folded: string; starts: number[]; ends: number[] };

const foldCache = new Map<string, FoldedText>();

/** One search character per code point: lower case without accents, so "kvkk basvuru" finds "KVKK başvuru". */
function foldChar(char: string) {
    const code = char.charCodeAt(0);
    if (code < 128) return code >= 65 && code <= 90 ? String.fromCharCode(code + 32) : char;
    if (char === "ı" || char === "İ") return "i";
    const lower = char.toLowerCase();
    const base = lower.normalize("NFD").replace(/\p{M}+/gu, "");
    if (base && Array.from(base).length === 1) return base;
    return Array.from(lower).length === 1 ? lower : char;
}

/** Folded text plus, for each folded code unit, the original start and end offsets (used to highlight matches). */
function foldText(text: string): FoldedText {
    const cached = foldCache.get(text);
    if (cached) return cached;
    let folded = "";
    const starts: number[] = [];
    const ends: number[] = [];
    for (let index = 0; index < text.length;) {
        const char = String.fromCodePoint(text.codePointAt(index) ?? 0);
        const next = index + char.length;
        const mapped = foldChar(char);
        for (let unit = 0; unit < mapped.length; unit += 1) {
            starts.push(index);
            ends.push(next);
        }
        folded += mapped;
        index = next;
    }
    const result = { folded, starts, ends };
    if (foldCache.size > 4_000) foldCache.clear();
    foldCache.set(text, result);
    return result;
}

function foldQuery(query: string) {
    return foldText(query.trim().replace(/\s+/g, " ")).folded;
}

/** Text with the matches of an already folded needle wrapped in <mark>. */
function Marked({ text, needle }: { text: string; needle: string }) {
    if (!needle) return <>{text}</>;
    const { folded, starts, ends } = foldText(text);
    const parts: ReactNode[] = [];
    let cursor = 0;
    for (let from = folded.indexOf(needle); from !== -1; from = folded.indexOf(needle, from + needle.length)) {
        const start = starts[from];
        const end = ends[from + needle.length - 1];
        if (start < cursor) continue;
        if (start > cursor) parts.push(<Fragment key={`t${cursor}`}>{text.slice(cursor, start)}</Fragment>);
        parts.push(<mark key={`m${start}`} className="rounded bg-amber-200/80 px-0.5 text-inherit dark:bg-amber-400/30">{text.slice(start, end)}</mark>);
        cursor = end;
    }
    if (!parts.length) return <>{text}</>;
    if (cursor < text.length) parts.push(<Fragment key={`t${cursor}`}>{text.slice(cursor)}</Fragment>);
    return <>{parts}</>;
}

const LINK_CLASS = "font-semibold text-indigo-700 underline decoration-indigo-300 underline-offset-2 transition hover:decoration-indigo-600 dark:text-indigo-300 dark:decoration-indigo-500/50 dark:hover:decoration-indigo-300";

/** Plain text with [label](/path) and [label](https://…) links and search highlights. */
function RichText({ text, needle }: { text: string; needle: string }) {
    const { tx } = useI18n();
    const parts: ReactNode[] = [];
    let cursor = 0;
    for (const match of text.matchAll(LINK_PATTERN)) {
        const index = match.index ?? 0;
        if (index > cursor) parts.push(<Marked key={`t${cursor}`} text={text.slice(cursor, index)} needle={needle} />);
        parts.push(match[2].startsWith("/") ? (
            <Link key={`l${index}`} href={match[2]} className={LINK_CLASS}>
                <Marked text={match[1]} needle={needle} />
            </Link>
        ) : (
            <a key={`l${index}`} href={match[2]} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
                <Marked text={match[1]} needle={needle} />
                <ExternalLink className="ms-0.5 inline h-3 w-3 align-[-0.1em]" aria-hidden />
                <span className="sr-only"> {tx(UI.newTab)}</span>
            </a>
        ));
        cursor = index + match[0].length;
    }
    if (!parts.length) return <Marked text={text} needle={needle} />;
    if (cursor < text.length) parts.push(<Marked key={`t${cursor}`} text={text.slice(cursor)} needle={needle} />);
    return <>{parts}</>;
}

function sectionText(section: LegalSection, show: (value: LegalCell) => string) {
    const parts: LegalCell[] = [
        section.title,
        ...(section.paragraphs ?? []),
        ...(section.items ?? []),
        ...(section.table ? [...section.table.head, ...section.table.rows.flat()] : []),
        ...(section.after ?? []),
        ...(section.note ? [section.note] : []),
    ];
    return parts.map(show).join("\n");
}

const turkish = (value: LegalCell) => (typeof value === "string" ? value : value.TR);

function prefersReducedMotion() {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Plain left click: let the page handle it. Modified clicks keep the browser's behaviour (new tab…). */
function isPlainClick(event: MouseEvent) {
    return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LegalPage({
    eyebrow,
    title,
    summary,
    sections,
    notice,
    highlights = [],
    current,
    operator,
}: {
    eyebrow: Copy;
    title: Copy;
    summary: Copy;
    sections: LegalSection[];
    notice?: Copy;
    highlights?: LegalHighlight[];
    current: LegalDocumentPath;
    /** Who operates the service (Admin Panel); shown as a card once published. */
    operator?: OperatorInfo;
}) {
    const { language, tx } = useI18n();
    const [originalRequested, setOriginalRequested] = useState(false);
    // The Turkish text prevails; readers of a translation can switch to it in place.
    // `format` and `show` render the document (text and in-document labels) in that mode.
    const showOriginal = originalRequested && language !== "TR";
    const format = useCallback((copy: Copy, vars?: Record<string, string | number>) => (showOriginal ? formatCopy(copy.TR, vars) : tx(copy, vars)), [showOriginal, tx]);
    const show = useCallback((value: LegalCell) => (typeof value === "string" ? value : format(value)), [format]);
    const contentLanguage = showOriginal ? { lang: "tr", dir: "ltr" as const } : {};

    const [query, setQuery] = useState("");
    const deferredQuery = useDeferredValue(query);
    const needle = useMemo(() => foldQuery(deferredQuery), [deferredQuery]);
    const searchIndex = useMemo(() => sections.map((section) => foldText(stripLinks(sectionText(section, show))).folded), [sections, show]);
    const matched = useMemo(() => (needle ? sections.filter((_, index) => searchIndex[index].includes(needle)) : sections), [needle, sections, searchIndex]);
    const matchedIds = useMemo(() => new Set(matched.map((section) => section.id)), [matched]);
    const minutes = useMemo(() => Math.max(1, Math.round(sections.reduce((sum, section) => sum + sectionText(section, turkish).split(/\s+/).length, 0) / 200)), [sections]);

    const [active, setActive] = useState(sections[0]?.id ?? "");
    const [tocOpen, setTocOpen] = useState(false);
    const [asideOutOfView, setAsideOutOfView] = useState(false);
    const [copied, setCopied] = useState<{ id: string; ok: boolean } | null>(null);
    const copyTimer = useRef<number | undefined>(undefined);
    const asideRef = useRef<HTMLElement>(null);
    const tocButtonRef = useRef<HTMLButtonElement>(null);
    const tocListRef = useRef<HTMLOListElement>(null);

    // Scroll spy: the first visible section in document order is the active one.
    const spyKey = [...matched.map((section) => section.id), HISTORY_ID].join("|");
    useEffect(() => {
        const ids = spyKey.split("|");
        const visible = new Set<string>();
        const observer = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting) visible.add(entry.target.id);
                else visible.delete(entry.target.id);
            }
            const first = ids.find((id) => visible.has(id));
            if (first) setActive(first);
        }, { rootMargin: "-96px 0px -60% 0px" });
        for (const id of ids) {
            const element = document.getElementById(id);
            if (element) observer.observe(element);
        }
        return () => observer.disconnect();
    }, [spyKey]);

    // Keep the active entry visible inside the scrollable table of contents (desktop).
    useEffect(() => {
        const list = tocListRef.current;
        if (!list || list.scrollHeight <= list.clientHeight + 1) return;
        const link = list.querySelector<HTMLElement>(`[data-toc-id="${active}"]`);
        if (!link) return;
        const top = link.offsetTop;
        const bottom = top + link.offsetHeight;
        if (top < list.scrollTop) list.scrollTop = Math.max(0, top - 8);
        else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight + 8;
    }, [active]);

    // On small screens a floating button brings the contents back once they scroll away.
    useEffect(() => {
        const aside = asideRef.current;
        if (!aside) return;
        const observer = new IntersectionObserver(([entry]) => setAsideOutOfView(!entry.isIntersecting && entry.boundingClientRect.top < 0));
        observer.observe(aside);
        return () => observer.disconnect();
    }, []);

    const goTo = (id: string) => {
        // Close the mobile list first so the layout no longer shifts under the scroll target.
        flushSync(() => {
            setTocOpen(false);
            setActive(id);
        });
        const target = document.getElementById(id);
        if (!target) return;
        target.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
        target.focus({ preventScroll: true });
        window.history.pushState(null, "", `#${id}`);
    };

    const openContents = () => {
        flushSync(() => setTocOpen(true));
        asideRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
        tocButtonRef.current?.focus({ preventScroll: true });
    };

    const copyLink = async (id: string) => {
        const url = `${window.location.origin}${window.location.pathname}#${id}`;
        let ok = true;
        try {
            await navigator.clipboard.writeText(url);
        } catch {
            // Clipboard access can be blocked; the address bar then carries the link.
            ok = false;
            window.history.replaceState(null, "", `#${id}`);
        }
        setCopied({ id, ok });
        window.clearTimeout(copyTimer.current);
        copyTimer.current = window.setTimeout(() => setCopied(null), 2000);
    };

    const tocEntry = (id: string, label: ReactNode, number: ReactNode) => (
        <li key={id}>
            <a
                href={`#${id}`}
                data-toc-id={id}
                onClick={(event) => {
                    if (!isPlainClick(event)) return;
                    event.preventDefault();
                    goTo(id);
                }}
                aria-current={active === id ? "location" : undefined}
                className={`relative flex gap-3 rounded-xl px-3 py-2 text-[13.5px] leading-snug transition ${active === id ? "bg-indigo-500/10 font-semibold text-indigo-700 dark:text-indigo-300" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[0.05] dark:hover:text-white"}`}
            >
                <span className="w-5 shrink-0 tabular-nums text-zinc-400">{number}</span>
                <span className="min-w-0">{label}</span>
            </a>
        </li>
    );

    const sectionCountText = matched.length === 1 ? tx(UI.oneSection) : tx(UI.sectionCount, { count: matched.length });
    const statusText = needle ? (matched.length === 0 ? tx(UI.noMatch) : matched.length === 1 ? tx(UI.oneMatch) : tx(UI.manyMatches, { count: matched.length })) : "";

    // Until the owner publishes the operator's details, the texts' own "not published yet" notice applies.
    const operatorFields: Array<{ key: string; label: Copy; value: string; href?: string }> = operator && isOperatorPublished(operator)
        ? [
            { key: "name", label: OPERATOR_LABELS.legalName, value: operator.legalName },
            { key: "brand", label: OPERATOR_LABELS.brand, value: operator.brand },
            { key: "email", label: OPERATOR_LABELS.contactEmail, value: operator.contactEmail, href: `mailto:${operator.contactEmail}` },
            { key: "address", label: OPERATOR_LABELS.address, value: operator.address },
            { key: "tax", label: OPERATOR_LABELS.taxId, value: operator.taxId },
            { key: "kep", label: OPERATOR_LABELS.kep, value: operator.kep },
        ].filter((field) => field.value)
        : [];

    return (
        <MotionConfig reducedMotion="user">
            <div className="hanogt-legal min-h-dvh bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-white">
                <style href="hanogt-legal-print" precedence="default">{PRINT_CSS}</style>
                <div className="print:hidden"><Header /></div>
                <main id="main-content" className="px-4 pb-16 pt-24 sm:px-6">
                    <div className="mx-auto max-w-6xl">
                        {language !== "TR" ? (
                            <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm leading-6 text-indigo-900 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-100 sm:flex-row sm:items-center">
                                <div className="flex min-w-0 flex-1 items-start gap-3">
                                    <Languages className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                                    <div className="min-w-0">
                                        <p className="font-semibold">{tx(UI.prevails)}</p>
                                        <p className="text-[13px] opacity-90">{tx(showOriginal ? UI.showingOriginal : UI.translationNote)}</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setOriginalRequested((value) => !value)}
                                    aria-pressed={showOriginal}
                                    className="shrink-0 rounded-xl border border-indigo-300 bg-white px-4 py-2 text-[13px] font-semibold text-indigo-800 transition hover:bg-indigo-100 dark:border-indigo-400/40 dark:bg-indigo-500/15 dark:text-indigo-100 dark:hover:bg-indigo-500/25"
                                >
                                    {tx(showOriginal ? UI.showTranslation : UI.showOriginal)}
                                </button>
                            </div>
                        ) : null}

                        <motion.header {...contentLanguage} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} data-legal-card className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-sm dark:border-white/[0.08] dark:bg-zinc-900">
                            <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-700 p-6 text-white sm:p-10">
                                <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" aria-hidden />
                                <div className="relative">
                                    <div className="mb-5 flex items-center justify-between gap-3">
                                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15"><Scale className="h-6 w-6" aria-hidden /></div>
                                        <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold transition hover:bg-white/25">
                                            <Printer className="h-4 w-4" aria-hidden />{format(UI.print)}
                                        </button>
                                    </div>
                                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-100">{show(eyebrow)}</p>
                                    <h1 className="mt-3 max-w-4xl break-words text-3xl font-black tracking-tight sm:text-5xl">{show(title)}</h1>
                                    <p className="mt-5 max-w-3xl text-sm leading-7 text-indigo-50 sm:text-base">{show(summary)}</p>
                                    <div className="mt-6 flex flex-wrap gap-2 text-xs text-indigo-50">
                                        <span className="rounded-full bg-white/10 px-3 py-1.5">{format(UI.version, { version: LEGAL_VERSION })}</span>
                                        <span className="rounded-full bg-white/10 px-3 py-1.5">{format(UI.effective, { date: show(LEGAL_EFFECTIVE_DATE) })}</span>
                                        <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5"><Clock className="h-3 w-3" aria-hidden />{format(UI.readingTime, { minutes })}</span>
                                        <span className="rounded-full bg-white/10 px-3 py-1.5">Türkiye · KVKK</span>
                                    </div>
                                </div>
                            </div>
                            {notice ? (
                                <div className="flex gap-3 border-t border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                                    <p><RichText text={show(notice)} needle="" /></p>
                                </div>
                            ) : null}
                        </motion.header>

                        {operatorFields.length ? (
                            <motion.section
                                {...contentLanguage}
                                id={OPERATOR_ID}
                                tabIndex={-1}
                                aria-labelledby="legal-operator-title"
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                data-legal-card
                                className="mt-6 scroll-mt-24 rounded-2xl border border-zinc-200 bg-white p-5 outline-none dark:border-white/[0.08] dark:bg-zinc-900 sm:p-6"
                            >
                                <div className="flex items-start gap-3">
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300"><Building2 className="h-4 w-4" aria-hidden /></span>
                                    <div className="min-w-0">
                                        <h2 id="legal-operator-title" className="text-[15px] font-bold text-zinc-900 dark:text-white">{format(UI.operator)}</h2>
                                        <p className="text-[12.5px] leading-snug text-zinc-500 dark:text-zinc-400">{format(UI.operatorText)}</p>
                                    </div>
                                </div>
                                <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                                    {operatorFields.map((field) => (
                                        <div key={field.key} className="min-w-0">
                                            <dt className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{format(field.label)}</dt>
                                            <dd className="mt-0.5 break-words text-[13.5px] leading-6 text-zinc-800 dark:text-zinc-100">
                                                {field.href ? <a href={field.href} className={LINK_CLASS}>{field.value}</a> : field.value}
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                            </motion.section>
                        ) : null}

                        {highlights.length ? (
                            <section {...contentLanguage} className="mt-6" aria-labelledby="legal-highlights-title">
                                <h2 id="legal-highlights-title" className="mb-3 text-[13px] font-black uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">{format(UI.atAGlance)}</h2>
                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                    {highlights.map((highlight, index) => (
                                        <motion.div key={highlight.title.EN} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * index }} data-legal-card className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/[0.08] dark:bg-zinc-900">
                                            <p className="flex items-center gap-2 text-[14px] font-bold text-zinc-900 dark:text-white"><Check className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden />{show(highlight.title)}</p>
                                            <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">{show(highlight.text)}</p>
                                        </motion.div>
                                    ))}
                                </div>
                            </section>
                        ) : null}

                        <div className="mt-8 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-8">
                            <aside ref={asideRef} className="h-fit scroll-mt-20 space-y-4 print:hidden lg:sticky lg:top-24">
                                <div role="search" className="rounded-2xl border border-zinc-200 bg-white p-3 dark:border-white/[0.08] dark:bg-zinc-900">
                                    <label htmlFor="legal-search" className="sr-only">{tx(UI.search)}</label>
                                    <div className="relative">
                                        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
                                        <input
                                            id="legal-search"
                                            type="search"
                                            value={query}
                                            onChange={(event) => setQuery(event.target.value)}
                                            onKeyDown={(event) => {
                                                if (event.key === "Escape" && query) {
                                                    event.preventDefault();
                                                    setQuery("");
                                                }
                                            }}
                                            placeholder={tx(UI.searchPlaceholder)}
                                            autoComplete="off"
                                            spellCheck={false}
                                            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2.5 pe-9 ps-9 text-[14px] text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:focus:bg-zinc-900 [&::-webkit-search-cancel-button]:appearance-none"
                                        />
                                        {query ? (
                                            <button type="button" onClick={() => setQuery("")} aria-label={tx(UI.clearSearch)} title={tx(UI.clearSearch)} className="absolute end-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/[0.06] dark:hover:text-white">
                                                <X className="h-4 w-4" aria-hidden />
                                            </button>
                                        ) : null}
                                    </div>
                                    <p role="status" className={statusText ? "mt-2 px-1 text-[12.5px] text-zinc-500 dark:text-zinc-400" : "sr-only"}>{statusText}</p>
                                </div>

                                <nav aria-label={tx(UI.contents)} className="rounded-2xl border border-zinc-200 bg-white p-2 dark:border-white/[0.08] dark:bg-zinc-900">
                                    {/* Phones: a collapsible list. Wide screens: always open, so a plain heading. */}
                                    <button
                                        ref={tocButtonRef}
                                        type="button"
                                        onClick={() => setTocOpen((open) => !open)}
                                        aria-expanded={tocOpen}
                                        aria-controls="legal-toc-list"
                                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start transition hover:bg-zinc-100 dark:hover:bg-white/[0.05] lg:hidden"
                                    >
                                        <ListOrdered className="h-4 w-4 shrink-0 text-indigo-500" aria-hidden />
                                        <span className="flex-1 text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{tx(UI.contents)}</span>
                                        <span className="text-[11px] tabular-nums text-zinc-400">{sectionCountText}</span>
                                        <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-400 transition ${tocOpen ? "rotate-180" : ""}`} aria-hidden />
                                    </button>
                                    <p className="hidden items-center gap-3 px-3 py-2 lg:flex">
                                        <ListOrdered className="h-4 w-4 shrink-0 text-indigo-500" aria-hidden />
                                        <span className="flex-1 text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{tx(UI.contents)}</span>
                                        <span className="text-[11px] tabular-nums text-zinc-400">{sectionCountText}</span>
                                    </p>
                                    <ol
                                        id="legal-toc-list"
                                        ref={tocListRef}
                                        {...contentLanguage}
                                        className={`${tocOpen ? "block" : "hidden"} scrollbar-thin relative mt-1 space-y-0.5 lg:block lg:max-h-[calc(100dvh-19rem)] lg:overflow-y-auto`}
                                    >
                                        {sections.map((section, index) => (matchedIds.has(section.id) ? tocEntry(section.id, show(section.title), String(index + 1).padStart(2, "0")) : null))}
                                        {tocEntry(HISTORY_ID, format(UI.history), <History className="mt-0.5 h-3.5 w-3.5" aria-hidden />)}
                                    </ol>
                                </nav>

                                <div className="rounded-2xl border border-zinc-200 bg-white p-2 dark:border-white/[0.08] dark:bg-zinc-900">
                                    <p className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{tx(UI.related)}</p>
                                    {RELATED.filter((entry) => entry.href !== current).map((entry) => (
                                        <Link key={entry.href} href={entry.href} className="flex items-start gap-3 rounded-xl px-3 py-2 transition hover:bg-zinc-100 dark:hover:bg-white/[0.05]">
                                            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" aria-hidden />
                                            <span className="min-w-0">
                                                <span className="block text-[13.5px] font-semibold text-zinc-800 dark:text-zinc-100">{tx(entry.label)}</span>
                                                <span className="block text-[12px] leading-snug text-zinc-500 dark:text-zinc-400">{tx(entry.hint)}</span>
                                            </span>
                                        </Link>
                                    ))}
                                </div>
                            </aside>

                            <article {...contentLanguage} className="min-w-0 space-y-4">
                                {needle && matched.length === 0 ? (
                                    <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500 print:hidden dark:border-white/[0.12] dark:bg-zinc-900 dark:text-zinc-400">
                                        <p>{tx(UI.noMatch)}</p>
                                        <button type="button" onClick={() => setQuery("")} className="mt-3 rounded-xl bg-indigo-600 px-4 py-2 font-semibold text-white transition hover:bg-indigo-500">{tx(UI.clearSearch)}</button>
                                    </div>
                                ) : null}

                                {sections.map((section, index) => {
                                    const hidden = !matchedIds.has(section.id);
                                    const copiedHere = copied?.id === section.id;
                                    return (
                                        <section
                                            key={section.id}
                                            id={section.id}
                                            tabIndex={-1}
                                            aria-labelledby={`${section.id}-title`}
                                            data-legal-card
                                            className={`group scroll-mt-24 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm outline-none transition-shadow hover:shadow-md dark:border-white/[0.08] dark:bg-zinc-900 sm:p-8 ${hidden ? "hidden print:block" : ""}`}
                                        >
                                            <div className="mb-4 flex items-start gap-3 sm:mb-5 sm:gap-4">
                                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-sm font-bold text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">{index + 1}</span>
                                                <h2 id={`${section.id}-title`} className="min-w-0 flex-1 break-words pt-1 text-lg font-bold leading-snug sm:text-xl"><Marked text={show(section.title)} needle={needle} /></h2>
                                                <button
                                                    type="button"
                                                    onClick={() => void copyLink(section.id)}
                                                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-indigo-600 focus-visible:opacity-100 dark:hover:bg-white/[0.06] pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100"
                                                    aria-label={format(UI.copyLink)}
                                                    title={format(UI.copyLink)}
                                                >
                                                    {copiedHere ? <Check className="h-4 w-4 text-emerald-500" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}
                                                </button>
                                            </div>
                                            <div className="space-y-4 break-words text-[14px] leading-7 text-zinc-600 dark:text-zinc-300">
                                                {section.paragraphs?.map((paragraph) => <p key={paragraph.EN}><RichText text={show(paragraph)} needle={needle} /></p>)}
                                                {section.items ? (
                                                    <ul className="space-y-2.5">
                                                        {section.items.map((item) => (
                                                            <li key={item.EN} className="flex gap-3">
                                                                <span className="mt-[0.7rem] h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" aria-hidden />
                                                                <span className="min-w-0"><RichText text={show(item)} needle={needle} /></span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                ) : null}
                                                {section.table ? <LegalTable table={section.table} caption={show(section.title)} show={show} needle={needle} /> : null}
                                                {section.after?.map((paragraph) => <p key={paragraph.EN}><RichText text={show(paragraph)} needle={needle} /></p>)}
                                                {section.note ? <p className="rounded-xl bg-indigo-500/[0.07] px-4 py-3 text-[13px] leading-6 text-indigo-900 dark:text-indigo-200"><RichText text={show(section.note)} needle={needle} /></p> : null}
                                            </div>
                                        </section>
                                    );
                                })}

                                <section id={HISTORY_ID} tabIndex={-1} aria-labelledby="legal-history-title" data-legal-card className="scroll-mt-24 rounded-2xl border border-zinc-200 bg-white p-5 outline-none dark:border-white/[0.08] dark:bg-zinc-900 sm:p-8">
                                    <h2 id="legal-history-title" className="flex items-center gap-2 text-lg font-bold"><History className="h-5 w-5 text-indigo-500" aria-hidden />{format(UI.history)}</h2>
                                    <ol className="mt-4 space-y-5 border-s-2 border-indigo-500/20 ps-5">
                                        {LEGAL_CHANGES.map((change, index) => (
                                            <li key={change.version} className="relative">
                                                <span className="absolute -start-[27px] top-1.5 h-3 w-3 rounded-full bg-indigo-500 ring-4 ring-white dark:ring-zinc-900" aria-hidden />
                                                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] font-bold text-zinc-900 dark:text-white">
                                                    {format(UI.version, { version: change.version })}
                                                    <span className="font-normal text-zinc-500 dark:text-zinc-400">· {show(change.date)}</span>
                                                    {index === 0 ? <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">{format(UI.currentVersion)}</span> : null}
                                                </p>
                                                <ul className="mt-1.5 space-y-1.5 text-[13px] leading-6 text-zinc-600 dark:text-zinc-400">
                                                    {change.items.map((item) => <li key={item.EN} className="flex gap-2"><span aria-hidden>•</span><span className="min-w-0">{show(item)}</span></li>)}
                                                </ul>
                                            </li>
                                        ))}
                                    </ol>
                                </section>

                                <section data-legal-card className="rounded-2xl border border-zinc-200 bg-zinc-950 p-5 text-zinc-300 dark:border-white/[0.08] sm:p-8" aria-labelledby="legal-sources-title">
                                    <div className="flex items-center gap-3 text-white"><FileText className="h-5 w-5 shrink-0 text-indigo-400" aria-hidden /><h2 id="legal-sources-title" className="text-lg font-bold">{format(UI.sources)}</h2></div>
                                    <p className="mt-3 text-sm leading-6 text-zinc-400">{format(UI.sourcesText)}</p>
                                    <div className="mt-5 grid gap-2 sm:grid-cols-2">
                                        {SOURCES.map((source) => (
                                            <a key={source.href} href={source.href} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-4 py-3 text-sm transition hover:bg-white/10">
                                                <span className="min-w-0">{show(source.label)}</span>
                                                <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
                                            </a>
                                        ))}
                                    </div>
                                </section>
                            </article>
                        </div>
                    </div>
                </main>

                {asideOutOfView ? (
                    <button
                        type="button"
                        onClick={openContents}
                        className="fixed bottom-4 end-4 z-40 inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 transition hover:bg-indigo-500 print:hidden lg:hidden"
                    >
                        <ListOrdered className="h-4 w-4" aria-hidden />{tx(UI.contents)}
                    </button>
                ) : null}
                <p role="status" className="sr-only">{copied ? tx(copied.ok ? UI.copied : UI.copyFallback) : ""}</p>
                <div className="print:hidden"><SiteFooter /></div>
            </div>
        </MotionConfig>
    );
}

/** A table on wide screens and in print; one card per row on phones. */
function LegalTable({ table, caption, show, needle }: { table: NonNullable<LegalSection["table"]>; caption: string; show: (value: LegalCell) => string; needle: string }) {
    const head = table.head.map(show);
    const rowKey = (row: LegalCell[]) => row.map((cell) => (typeof cell === "string" ? cell : cell.EN)).join("|");
    return (
        <>
            <div className="scrollbar-thin hidden overflow-x-auto rounded-xl border border-zinc-200 dark:border-white/[0.08] sm:block">
                <table className="w-full text-start text-[13px] leading-6">
                    <caption className="sr-only">{caption}</caption>
                    <thead className="bg-zinc-50 dark:bg-white/[0.04]">
                        <tr>{head.map((cell) => <th key={cell} scope="col" className="px-3 py-2.5 text-start align-bottom font-bold text-zinc-800 dark:text-zinc-100">{cell}</th>)}</tr>
                    </thead>
                    <tbody>
                        {table.rows.map((row) => (
                            <tr key={rowKey(row)} className="border-t border-zinc-100 align-top dark:border-white/[0.06]">
                                {row.map((cell, cellIndex) => (cellIndex === 0
                                    ? <th key={cellIndex} scope="row" className="px-3 py-2.5 text-start font-semibold text-zinc-800 dark:text-zinc-100"><RichText text={show(cell)} needle={needle} /></th>
                                    : <td key={cellIndex} className="px-3 py-2.5"><RichText text={show(cell)} needle={needle} /></td>))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <ul className="space-y-3 sm:hidden">
                {table.rows.map((row) => (
                    <li key={rowKey(row)} className="rounded-xl border border-zinc-200 p-3 dark:border-white/[0.08]">
                        <p className="font-semibold leading-6 text-zinc-800 dark:text-zinc-100"><RichText text={show(row[0])} needle={needle} /></p>
                        <dl className="mt-2 space-y-2">
                            {row.slice(1).map((cell, cellIndex) => (
                                <div key={cellIndex}>
                                    <dt className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{head[cellIndex + 1]}</dt>
                                    <dd className="text-[13px] leading-6"><RichText text={show(cell)} needle={needle} /></dd>
                                </div>
                            ))}
                        </dl>
                    </li>
                ))}
            </ul>
        </>
    );
}
