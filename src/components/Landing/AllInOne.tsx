"use client";

import { AnimatePresence, motion, useInView, useMotionValue } from "framer-motion";
import { ArrowRight, Bell, Check, Cloud, Crown, Download, Gamepad2, KeyRound, Link2, Share2, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import ProductLogo from "@/components/ProductLogo";
import { CountUp } from "@/components/PublicStats";
import { prefersReducedMotion, usePrefersReducedMotion } from "@/lib/appearance";
import { ENGINE_VERSION } from "@/lib/game-engine/types";
import { LANGUAGES, useI18n, type Copy } from "@/lib/i18n";
import { PLAN_AI_LIMITS, PLAN_COLLAB_LIMITS } from "@/lib/plans";
import { PRODUCTS, type LogoId } from "@/lib/products";
import { LANGUAGE_STATS } from "@/lib/runtimes/languages";
import LiveNewsMini from "./LiveNewsMini";
import { Reveal, TiltCard } from "./motion";
import { AiPreview, ArcadePreview, EditorPreview, EnginePreview, MediaPreview, SecurityPreview, SocialPreview } from "./ProductPreviews";

/*
 * "One account, all of it" on the home page: what one Hanogt account brings,
 * a hub of the eight products around the account, an explorer that walks
 * through them one by one (it moves on by itself until someone picks one),
 * and three ways the products work together. Every claim is a real feature.
 */

const C = {
    kicker: { TR: "Hanogt'ta neler var", EN: "What's in Hanogt" },
    title: { TR: "Tek hesap, hepsi bir arada", EN: "One account, all of it" },
    sub: {
        TR: "Kod yazmak, oyun yapmak, yapay zekâya danışmak, arkadaşlarınla konuşmak ve hesabını korumak için ayrı ayrı hesap açman gerekmez. Hanogt'un sekiz ürünü tek girişle, tek planla ve birbirine bağlı olarak çalışır.",
        EN: "You don't need separate accounts to write code, make games, ask AI, talk with friends and keep your account safe. Hanogt's eight products work with one sign-in and one plan, and they're connected to each other.",
    },
    statProducts: { TR: "ürün", EN: "products" },
    statLanguages: { TR: "programlama dili", EN: "programming languages" },
    statInterface: { TR: "arayüz dili", EN: "interface languages" },
    statAccount: { TR: "hesap", EN: "account" },
    hub: { TR: "Hanogt hesabın", EN: "Your Hanogt account" },
    hubLabel: { TR: "Hesabına bağlı ürünler; birini seçince aşağıda ayrıntıları açılır", EN: "Products linked to your account; pick one to see its details below" },
    explore: { TR: "Ürünleri keşfet", EN: "Explore the products" },
    flowsTitle: { TR: "Birlikte daha güçlü", EN: "Stronger together" },
    flowsSub: { TR: "Ürünler birbirine bağlı olduğu için bir işi baştan sona tek yerde bitirirsin.", EN: "Because the products are connected, you finish a job from start to end in one place." },
} satisfies Record<string, Copy>;

type Benefit = { icon: LucideIcon; title: Copy; text: Copy };

const BENEFITS: Benefit[] = [
    { icon: KeyRound, title: { TR: "Tek giriş", EN: "One sign-in" }, text: { TR: "Google ya da şifreyle gir; iki adımlı doğrulama sekiz ürünün hepsini korur.", EN: "Sign in with Google or a password; two-step verification protects all eight products." } },
    { icon: Cloud, title: { TR: "Her cihazda aynı", EN: "The same on every device" }, text: { TR: "Projelerin, oyunların, ayarların ve Hanogt AI tercihlerin hesabınla birlikte gelir.", EN: "Your projects, games, settings and Hanogt AI preferences come with your account." } },
    { icon: Crown, title: { TR: "Tek plan, her yerde", EN: "One plan, everywhere" }, text: { TR: "Plus ve Pro avantajları editörden Engine'e, Social'dan Hanogt AI'a her üründe geçerli.", EN: "Plus and Pro benefits apply in every product, from the editor to Engine and from Social to Hanogt AI." } },
    { icon: Link2, title: { TR: "Birbirine bağlı", EN: "Connected" }, text: { TR: "Hanogt AI editördeki dosyanı görür; oyunun Arcade'e, kodun Media'ya tek tıkla gider.", EN: "Hanogt AI sees the file open in your editor; your game goes to Arcade and your code to Media in one click." } },
    { icon: Bell, title: { TR: "Tek bildirim merkezi", EN: "One notification center" }, text: { TR: "Mesajlar, bahsetmeler, cevapsız aramalar ve duyurular tek zilde toplanır.", EN: "Messages, mentions, missed calls and announcements gather in one bell." } },
    { icon: Download, title: { TR: "Verilerin senin", EN: "Your data is yours" }, text: { TR: "Reklam ve takip çerezi yok; verilerini tek tıkla indirir ya da silersin.", EN: "No ads or tracking cookies; download or delete your data in one click." } },
];

type ItemId = "editor" | "ai" | "engine" | "social" | "news" | "security" | "arcade" | "media";

type Item = {
    id: ItemId;
    logo: LogoId | null;
    icon?: LucideIcon;
    name: Copy | string;
    short: Copy | string;
    tagline: Copy;
    points: Copy[];
    stats: Array<{ value: number | string; label: Copy }>;
    href: string;
    cta: Copy;
    preview: () => ReactNode;
};

function items(): Item[] {
    const languages = LANGUAGE_STATS.usable;
    const free = PLAN_AI_LIMITS.free;
    const pro = PLAN_AI_LIMITS.pro;
    return [
        {
            id: "editor",
            logo: "hanogt",
            name: { TR: "Kod Editörü", EN: "Code Editor" },
            short: { TR: "Editör", EN: "Editor" },
            tagline: { TR: "Kurulum olmadan, tarayıcında kod yaz ve çalıştır", EN: "Write and run code in your browser, nothing to install" },
            points: [
                { TR: "{count} dili tek tıkla çalıştır", EN: "Run {count} languages in one click", vars: { count: languages } },
                { TR: "Sekmeler, projeler, otomatik tamamlama ve biçimlendirme", EN: "Tabs, projects, autocomplete and formatting" },
                { TR: "Ekiple düzenle: aynı dosyada gerçek zamanlı, sesli sohbetle", EN: "Edit together: one file, in real time, with voice chat" },
                { TR: "Projelerin bulutta; kaldığın yerden her cihazda devam et", EN: "Your projects are in the cloud; pick up on any device" },
                { TR: "Hanogt AI açık dosyanı okur, hatayı açıklar ve düzeltir", EN: "Hanogt AI reads your open file, explains errors and fixes them" },
                { TR: "Kodunu tek tıkla Media'da yayınla", EN: "Publish your code to Media in one click" },
            ],
            stats: [
                { value: languages, label: { TR: "çalışan dil", EN: "languages that run" } },
                { value: PLAN_COLLAB_LIMITS.pro.people, label: { TR: "kişiyle birlikte düzenleme (Pro)", EN: "people editing together (Pro)" } },
            ],
            href: "/editor",
            cta: { TR: "Editörü aç", EN: "Open the editor" },
            preview: () => <EditorPreview />,
        },
        {
            id: "ai",
            logo: "ai",
            name: PRODUCTS.ai.name,
            short: "AI",
            tagline: PRODUCTS.ai.tagline,
            points: [
                { TR: "Zor sorularda yanıtlamadan önce düşünür, düşünmesini gösterir", EN: "Thinks before answering hard questions and shows its thinking" },
                { TR: "Kodundaki değişikliği satır satır gösterir, editöre tek tuşla uygular", EN: "Shows the change to your code line by line and applies it to the editor in one click" },
                { TR: "Ajan modu: iznine göre grup kurar, editörü açar, oyun projesi oluşturur", EN: "Agent mode: with your permission it creates groups, opens the editor and starts game projects" },
                { TR: "Kişisel talimatlar, üslup ve kod stili ayarları", EN: "Personal instructions, tone and code style settings" },
                { TR: "Gruplarda /ai ile herkesin sorusunu yanıtlar", EN: "Answers everyone's questions in groups with /ai" },
                { TR: "Plus ve Pro'da geliştirici API'si ve kendi anahtarınla bağlantılar", EN: "A developer API and your own-key connections on Plus and Pro" },
            ],
            stats: [
                { value: free.perWindow, label: { TR: "mesaj / {days} gün (Ücretsiz)", EN: "messages / {days} days (Free)", vars: { days: free.windowDays } } },
                { value: pro.perWindow, label: { TR: "mesaj / {days} gün (Pro)", EN: "messages / {days} days (Pro)", vars: { days: pro.windowDays } } },
            ],
            href: PRODUCTS.ai.href,
            cta: { TR: "Hanogt AI'a sor", EN: "Ask Hanogt AI" },
            preview: () => <AiPreview />,
        },
        {
            id: "engine",
            logo: "engine",
            name: PRODUCTS.engine.name,
            short: "Engine",
            tagline: PRODUCTS.engine.tagline,
            points: [
                { TR: "Hiyerarşi, Inspector, sahne ve oyun görünümü", EN: "Hierarchy, Inspector, scene and game views" },
                { TR: "C# ve C++ scriptleri, güvenli bir sanal makinede", EN: "C# and C++ scripts in a safe virtual machine" },
                { TR: "2D ve 3D, fizik, parçacıklar, tilemap, arayüz ve animasyon", EN: "2D and 3D, physics, particles, tilemaps, UI and animation" },
                { TR: "Hazır şablonlarla dakikalar içinde ilk oyunun", EN: "Your first game in minutes with ready templates" },
                { TR: "Tek dosya HTML olarak dışa aktar ya da Arcade'de yayınla", EN: "Export one HTML file or publish to Arcade" },
            ],
            stats: [
                { value: `V${ENGINE_VERSION}`, label: { TR: "motor sürümü", EN: "engine version" } },
                { value: "2D + 3D", label: { TR: "tek editörde", EN: "in one editor" } },
            ],
            href: PRODUCTS.engine.href,
            cta: { TR: "Oyun yap", EN: "Make a game" },
            preview: () => <EnginePreview />,
        },
        {
            id: "social",
            logo: "social",
            name: PRODUCTS.social.name,
            short: "Social",
            tagline: PRODUCTS.social.tagline,
            points: [
                { TR: "Arkadaşlar, direkt mesajlar ve Discord benzeri gruplar", EN: "Friends, direct messages and Discord-style groups" },
                { TR: "Markdown, GIF, emoji, tepkiler, yıldızlı ve sabitlenmiş mesajlar", EN: "Markdown, GIFs, emoji, reactions, starred and pinned messages" },
                { TR: "Sesli arama ve sesli mesaj", EN: "Voice calls and voice messages" },
                { TR: "Hanogt Security Bot ve AutoMod gruplarını korur", EN: "Hanogt Security Bot and AutoMod protect your groups" },
                { TR: "Gruplarda Hanogt AI, eğik çizgi komutları ve ortak dosyalar", EN: "Hanogt AI, slash commands and shared files in groups" },
            ],
            stats: [
                { value: 2, label: { TR: "bot her grupta", EN: "bots in every group" } },
                { value: 8, label: { TR: "AutoMod kuralı", EN: "AutoMod rules" } },
            ],
            href: PRODUCTS.social.href,
            cta: { TR: "Social'a gir", EN: "Open Social" },
            preview: () => <SocialPreview />,
        },
        {
            id: "news",
            logo: "news",
            name: PRODUCTS.news.name,
            short: "News",
            tagline: PRODUCTS.news.tagline,
            points: [
                { TR: "Yapay zekâ, yazılım, oyun, güvenlik ve piyasalar", EN: "AI, software, gaming, security and markets" },
                { TR: "Canlı piyasa şeridi: döviz, altın ve kripto", EN: "A live market strip: currencies, gold and crypto" },
                { TR: "Haberlere yorum yap, yapay zekâ arenasında oy ver", EN: "Comment on stories and vote in the AI arena" },
                { TR: "Sonra oku listesi ve dakika dakika güncelleme", EN: "A read-later list and updates by the minute" },
            ],
            stats: [{ value: "7/24", label: { TR: "canlı akış", EN: "live feed" } }],
            href: PRODUCTS.news.href,
            cta: { TR: "Haberleri oku", EN: "Read the news" },
            preview: () => (
                <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-900">
                    <LiveNewsMini />
                </div>
            ),
        },
        {
            id: "security",
            logo: "security",
            name: PRODUCTS.security.name,
            short: "Security",
            tagline: PRODUCTS.security.tagline,
            points: [
                { TR: "Google ile girişten sonra şifre adımı ve iki adımlı doğrulama", EN: "A password step after Google sign-in and two-step verification" },
                { TR: "Son girişlerin ve her yerden çıkış", EN: "Your recent sign-ins and signing out everywhere" },
                { TR: "Kodun çalışmadan önce Security Bot taraması", EN: "A Security Bot scan before your code runs" },
                { TR: "Parola gücü, sızıntı ve bağlantı kontrolü", EN: "Password strength, breach and link checks" },
                { TR: "Kod Danışmanı sızmış anahtarları bulur", EN: "The Code Advisor finds leaked keys" },
            ],
            stats: [{ value: 10, label: { TR: "son giriş kaydı", EN: "recent sign-ins listed" } }],
            href: PRODUCTS.security.href,
            cta: { TR: "Güvenliğini kontrol et", EN: "Check your security" },
            preview: () => <SecurityPreview />,
        },
        {
            id: "arcade",
            logo: null,
            icon: Gamepad2,
            name: "Hanogt Arcade",
            short: "Arcade",
            tagline: { TR: "Topluluğun oyunlarını oyna, beğen ve remiksle", EN: "Play, like and remix the community's games" },
            points: [
                { TR: "Tarayıcıda, indirmeden oyna", EN: "Play in the browser, nothing to download" },
                { TR: "Beğen, remiksle ve kendi sürümünü yap", EN: "Like, remix and make your own version" },
                { TR: "Hanogt Engine'den tek tıkla yayınla", EN: "Publish from Hanogt Engine in one click" },
                { TR: "Yayından önce Security Bot taraması", EN: "A Security Bot scan before publishing" },
            ],
            stats: [],
            href: "/arcade",
            cta: { TR: "Arcade'i aç", EN: "Open Arcade" },
            preview: () => <ArcadePreview />,
        },
        {
            id: "media",
            logo: null,
            icon: Share2,
            name: "Hanogt Media",
            short: "Media",
            tagline: { TR: "Kodunu paylaş, toplulukla geliştir", EN: "Share your code and improve it with the community" },
            points: [
                { TR: "Kod projelerini açıklamasıyla yayınla", EN: "Publish code projects with a description" },
                { TR: "Yorumlar ve beğeniler", EN: "Comments and likes" },
                { TR: "Bir projeyi editörde açıp dene", EN: "Open any project in the editor and try it" },
                { TR: "İsteğe bağlı Security Bot katkı programı", EN: "An optional Security Bot contribution programme" },
            ],
            stats: [],
            href: "/media",
            cta: { TR: "Media'ya göz at", EN: "Browse Media" },
            preview: () => <MediaPreview />,
        },
    ];
}

/** A product's mark: its logo, or for Arcade and Media an icon on an accent tile. */
function Mark({ item, size }: { item: Item; size: number }) {
    if (item.logo) return <ProductLogo product={item.logo} size={size} />;
    const Icon = item.icon ?? Gamepad2;
    return (
        <span className="grid place-items-center rounded-[28%] bg-gradient-to-br from-violet-500 to-pink-500 text-white shadow-sm" style={{ width: size, height: size }}>
            <Icon style={{ width: size * 0.52, height: size * 0.52 }} aria-hidden="true" />
        </span>
    );
}

// ---------------------------------------------------------------- Account hub

const HUB_RADIUS = 38;

function nodePosition(index: number, count: number) {
    const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
    return { x: 50 + HUB_RADIUS * Math.cos(angle), y: 50 + HUB_RADIUS * Math.sin(angle) };
}

function AccountHub({ list, active, onPick }: { list: Item[]; active: ItemId; onPick: (id: ItemId) => void }) {
    const { tx } = useI18n();
    const still = usePrefersReducedMotion();
    const activeIndex = list.findIndex((item) => item.id === active);
    const target = nodePosition(activeIndex, list.length);
    return (
        <div className="relative mx-auto aspect-square w-full max-w-[26rem]" role="group" aria-label={tx(C.hubLabel)}>
            <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
                <defs>
                    {/* User space: a bounding-box gradient draws nothing on a perfectly vertical or horizontal line. */}
                    <linearGradient id="hub-line" gradientUnits="userSpaceOnUse" x1="12" y1="12" x2="88" y2="88">
                        <stop offset="0%" stopColor="var(--accent-indigo)" />
                        <stop offset="40%" stopColor="var(--accent-purple)" />
                        <stop offset="75%" stopColor="var(--accent-pink)" />
                        <stop offset="100%" stopColor="var(--accent-amber)" />
                    </linearGradient>
                </defs>
                <circle cx="50" cy="50" r={HUB_RADIUS} fill="none" stroke="var(--border-subtle)" strokeWidth="0.4" />
                <circle cx="50" cy="50" r={HUB_RADIUS * 0.55} fill="none" stroke="var(--border-subtle)" strokeWidth="0.3" strokeDasharray="1 2" />
                {list.map((item, index) => {
                    const point = nodePosition(index, list.length);
                    const on = item.id === active;
                    return (
                        <line
                            key={item.id}
                            x1="50"
                            y1="50"
                            x2={point.x}
                            y2={point.y}
                            stroke={on ? "url(#hub-line)" : "var(--border-subtle)"}
                            strokeWidth={on ? 0.9 : 0.45}
                            strokeDasharray={on ? "2 2" : "1 2.5"}
                            className={still ? undefined : "animate-dash"}
                            style={{ transition: "stroke-width 0.3s" }}
                        />
                    );
                })}
                {still ? null : (
                    <motion.circle
                        key={active}
                        r="1.3"
                        fill="var(--accent-pink)"
                        initial={{ cx: 50, cy: 50, opacity: 0 }}
                        animate={{ cx: [50, target.x], cy: [50, target.y], opacity: [0, 1, 0] }}
                        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                    />
                )}
            </svg>

            <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5">
                <span className="grid h-20 w-20 animate-pulse-ring place-items-center rounded-3xl border border-zinc-200 bg-white shadow-lg dark:border-white/10 dark:bg-zinc-900">
                    <ProductLogo product="hanogt" size={48} />
                </span>
                <span className="whitespace-nowrap rounded-full border border-zinc-200 bg-white/90 px-2.5 py-0.5 text-[11px] font-bold text-zinc-700 backdrop-blur dark:border-white/10 dark:bg-zinc-900/90 dark:text-zinc-200">{tx(C.hub)}</span>
            </div>

            {list.map((item, index) => {
                const point = nodePosition(index, list.length);
                const on = item.id === active;
                const name = typeof item.short === "string" ? item.short : tx(item.short);
                return (
                    <button
                        key={item.id}
                        type="button"
                        onClick={() => onPick(item.id)}
                        aria-pressed={on}
                        aria-label={typeof item.name === "string" ? item.name : tx(item.name)}
                        className="group absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 outline-none"
                        style={{ left: `${point.x}%`, top: `${point.y}%` }}
                    >
                        <span className={`grid place-items-center rounded-2xl border bg-white p-1.5 shadow-sm transition duration-300 group-hover:-translate-y-0.5 group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-pink-500 dark:bg-zinc-900 ${on ? "scale-110 border-pink-400/70 shadow-lg dark:border-pink-400/50" : "border-zinc-200 dark:border-white/10"}`}>
                            <Mark item={item} size={34} />
                        </span>
                        <span className={`hidden whitespace-nowrap text-[11px] font-bold sm:block ${on ? "text-gradient" : "text-zinc-500 dark:text-zinc-400"}`}>{name}</span>
                    </button>
                );
            })}
        </div>
    );
}

// ---------------------------------------------------------------- Product explorer

const STEP_MS = 7000;

function Explorer({ list, active, onPick, auto, onUserPick }: { list: Item[]; active: ItemId; onPick: (id: ItemId) => void; auto: boolean; onUserPick: (id: ItemId) => void }) {
    const { tx, locale } = useI18n();
    const root = useRef<HTMLDivElement | null>(null);
    const tabRefs = useRef(new Map<ItemId, HTMLButtonElement>());
    const inView = useInView(root, { amount: 0.35 });
    const [paused, setPaused] = useState(false);
    const progress = useMotionValue(0);
    const index = list.findIndex((item) => item.id === active);
    const item = list[index] ?? list[0];

    // The tabs move on by themselves while the explorer is on screen, until someone picks one.
    useEffect(() => {
        progress.set(0);
        if (!auto) return;
        let frame = 0;
        let last = performance.now();
        let elapsed = 0;
        const tick = (now: number) => {
            const dt = now - last;
            last = now;
            if (inView && !paused && !document.hidden) elapsed += dt;
            progress.set(Math.min(1, elapsed / STEP_MS));
            if (elapsed >= STEP_MS) {
                onPick(list[(index + 1) % list.length].id);
                return;
            }
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [auto, inView, index, list, onPick, paused, progress]);

    const focusTab = (id: ItemId) => tabRefs.current.get(id)?.focus();
    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const rtl = document.documentElement.dir === "rtl";
        const step = event.key === "ArrowRight" ? (rtl ? -1 : 1) : event.key === "ArrowLeft" ? (rtl ? 1 : -1) : 0;
        let next: number | null = null;
        if (step) next = (index + step + list.length) % list.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = list.length - 1;
        if (next === null) return;
        event.preventDefault();
        onUserPick(list[next].id);
        focusTab(list[next].id);
    };

    const name = typeof item.name === "string" ? item.name : tx(item.name);
    return (
        <div ref={root} onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
            <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-zinc-500">{tx(C.explore)}</p>
            <div role="tablist" aria-label={tx(C.explore)} onKeyDown={onKeyDown} className="scrollbar-thin -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 lg:grid lg:grid-cols-8 lg:overflow-visible">
                {list.map((entry) => {
                    const on = entry.id === item.id;
                    const label = typeof entry.short === "string" ? entry.short : tx(entry.short);
                    return (
                        <button
                            key={entry.id}
                            ref={(node) => {
                                if (node) tabRefs.current.set(entry.id, node);
                                else tabRefs.current.delete(entry.id);
                            }}
                            type="button"
                            role="tab"
                            id={`all-in-one-tab-${entry.id}`}
                            aria-selected={on}
                            aria-controls="all-in-one-panel"
                            tabIndex={on ? 0 : -1}
                            onClick={() => onUserPick(entry.id)}
                            className={`relative flex shrink-0 items-center gap-2 overflow-hidden rounded-xl border px-3 py-2.5 text-start text-[13px] font-bold transition duration-300 lg:flex-col lg:items-center lg:gap-1.5 lg:px-2 ${on ? "border-pink-400/60 bg-white text-zinc-900 shadow-md dark:border-pink-400/40 dark:bg-zinc-900 dark:text-white" : "border-zinc-200 bg-zinc-50/80 text-zinc-600 hover:-translate-y-0.5 hover:border-zinc-300 hover:text-zinc-900 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400 dark:hover:border-white/20 dark:hover:text-white"}`}
                        >
                            <Mark item={entry} size={24} />
                            <span className="whitespace-nowrap">{label}</span>
                            {on ? (
                                <motion.span
                                    aria-hidden="true"
                                    className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-[image:var(--text-gradient)] rtl:origin-right"
                                    style={{ scaleX: auto ? progress : 1 }}
                                />
                            ) : null}
                        </button>
                    );
                })}
            </div>

            <div id="all-in-one-panel" role="tabpanel" aria-labelledby={`all-in-one-tab-${item.id}`} className="mt-6 min-h-[26rem]">
                <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                        className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14"
                    >
                        <div className="min-w-0">
                            <div className="flex items-center gap-3">
                                <Mark item={item} size={44} />
                                <h3 className="text-2xl font-black tracking-tight sm:text-3xl"><span className="text-gradient animate-gradient">{name}</span></h3>
                            </div>
                            <p className="mt-3 text-[17px] leading-relaxed text-zinc-600 dark:text-zinc-400">{tx(item.tagline)}</p>
                            <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
                                {item.points.map((point, pointIndex) => (
                                    <motion.li
                                        key={point.EN}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ duration: 0.35, delay: 0.08 + pointIndex * 0.05, ease: [0.22, 1, 0.36, 1] }}
                                        className="flex items-start gap-2 text-[14.5px] leading-snug text-zinc-700 dark:text-zinc-300"
                                    >
                                        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-pink-500/10 text-pink-600 dark:text-pink-300"><Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" /></span>
                                        {tx(point)}
                                    </motion.li>
                                ))}
                            </ul>
                            {item.stats.length ? (
                                <dl className="mt-6 flex flex-wrap gap-3">
                                    {item.stats.map((stat) => (
                                        <div key={stat.label.EN} className="flex min-w-[8.5rem] flex-col rounded-2xl border border-zinc-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                                            <dt className="order-2 mt-0.5 text-[12px] font-semibold text-zinc-500">{tx(stat.label)}</dt>
                                            <dd className="text-2xl font-black leading-none"><span className="text-gradient">{typeof stat.value === "number" ? <CountUp value={stat.value} locale={locale} /> : stat.value}</span></dd>
                                        </div>
                                    ))}
                                </dl>
                            ) : null}
                            <Link href={item.href} className="btn-sheen group mt-7 inline-flex h-11 items-center gap-2 rounded-xl bg-zinc-900 px-5 text-[14.5px] font-bold text-white transition hover:-translate-y-0.5 hover:shadow-lg dark:bg-white dark:text-zinc-900 dark:[--sheen:rgba(168,85,247,0.25)]">
                                {tx(item.cta)}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" aria-hidden="true" />
                            </Link>
                        </div>
                        <div className="min-w-0"><TiltCard>{item.preview()}</TiltCard></div>
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------- Flows

type FlowStep = { item: ItemId; text: Copy };
const FLOWS: Array<{ title: Copy; steps: FlowStep[] }> = [
    {
        title: { TR: "Fikirden yayına", EN: "From idea to launch" },
        steps: [
            { item: "ai", text: { TR: "Hanogt AI'a sor", EN: "Ask Hanogt AI" } },
            { item: "editor", text: { TR: "Editörde yaz ve çalıştır", EN: "Write and run it in the editor" } },
            { item: "media", text: { TR: "Media'da paylaş", EN: "Share it on Media" } },
        ],
    },
    {
        title: { TR: "Oyundan topluluğa", EN: "From game to community" },
        steps: [
            { item: "engine", text: { TR: "Hanogt Engine'de oyunu yap", EN: "Build the game in Hanogt Engine" } },
            { item: "arcade", text: { TR: "Arcade'de yayınla", EN: "Publish it on Arcade" } },
            { item: "social", text: { TR: "Arkadaşlarınla oyna", EN: "Play it with friends" } },
        ],
    },
    {
        title: { TR: "Her adımda güvende", EN: "Safe at every step" },
        steps: [
            { item: "security", text: { TR: "İki adımlı doğrulamayı aç", EN: "Turn on two-step verification" } },
            { item: "editor", text: { TR: "Kodun çalışmadan önce taranır", EN: "Your code is scanned before it runs" } },
            { item: "social", text: { TR: "AutoMod grubunu korur", EN: "AutoMod protects your group" } },
        ],
    },
];

/** The line between two steps, with a dot travelling down it. */
function Connector({ still, delay }: { still: boolean; delay: number }) {
    return (
        <span className="relative ms-[25px] block h-5 w-0.5 rounded-full bg-zinc-200 dark:bg-white/10" aria-hidden="true">
            <span className="absolute inset-0 rounded-full bg-[image:var(--text-gradient)] opacity-60" />
            {still ? null : (
                <motion.span className="absolute left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-pink-500" animate={{ top: ["0%", "100%"] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut", delay }} />
            )}
        </span>
    );
}

function Flows({ list }: { list: Item[] }) {
    const { tx } = useI18n();
    const still = usePrefersReducedMotion();
    const byId = new Map(list.map((item) => [item.id, item]));
    return (
        <div className="mt-20">
            <Reveal className="max-w-2xl">
                <h3 className="text-2xl font-black tracking-tight sm:text-3xl">{tx(C.flowsTitle)}</h3>
                <p className="mt-2 text-[15.5px] leading-relaxed text-zinc-600 dark:text-zinc-400">{tx(C.flowsSub)}</p>
            </Reveal>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
                {FLOWS.map((flow, flowIndex) => (
                    <Reveal key={flow.title.EN} delay={flowIndex * 0.08} className="h-full">
                        <div className="h-full rounded-2xl border border-zinc-200 bg-white p-5 transition duration-300 hover:-translate-y-1 hover:shadow-lg dark:border-white/10 dark:bg-white/[0.03]">
                            <p className="text-[13px] font-black uppercase tracking-wider text-zinc-500">{tx(flow.title)}</p>
                            <ol className="mt-4">
                                {flow.steps.map((step, stepIndex) => {
                                    const item = byId.get(step.item)!;
                                    return (
                                        <li key={`${step.item}-${stepIndex}`}>
                                            {stepIndex > 0 ? <Connector still={still} delay={stepIndex * 0.25} /> : null}
                                            <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50/70 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.02]">
                                                <Mark item={item} size={28} />
                                                <span className="text-[13.5px] font-semibold text-zinc-800 dark:text-zinc-200">{tx(step.text)}</span>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ol>
                        </div>
                    </Reveal>
                ))}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------- Section

export default function AllInOne() {
    const { tx, locale } = useI18n();
    const [list] = useState(items);
    const [active, setActive] = useState<ItemId>("editor");
    const still = usePrefersReducedMotion();
    // Moves on by itself until someone picks a product (never with reduced motion).
    const [picked, setPicked] = useState(false);
    const auto = !picked && !still;
    const explorer = useRef<HTMLDivElement | null>(null);

    const pick = useCallback((id: ItemId) => setActive(id), []);
    const userPick = useCallback((id: ItemId) => {
        setPicked(true);
        setActive(id);
    }, []);
    const pickFromHub = useCallback((id: ItemId) => {
        userPick(id);
        const box = explorer.current?.getBoundingClientRect();
        if (box && (box.top > window.innerHeight * 0.6 || box.bottom < 0)) explorer.current?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    }, [userPick]);

    const headline: Array<{ value: number; label: Copy }> = [
        { value: list.length, label: C.statProducts },
        { value: LANGUAGE_STATS.usable, label: C.statLanguages },
        { value: LANGUAGES.length, label: C.statInterface },
        { value: 1, label: C.statAccount },
    ];

    return (
        <section aria-labelledby="products-title" className="relative isolate mx-auto max-w-6xl px-4 py-24 sm:px-6">
            <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
                <div className="min-w-0">
                    <Reveal>
                        <p className="text-[13px] font-bold uppercase tracking-[0.18em] text-pink-600 dark:text-pink-400">{tx(C.kicker)}</p>
                        <h2 id="products-title" className="mt-3 text-4xl font-black tracking-tight sm:text-5xl"><span className="text-gradient animate-gradient">{tx(C.title)}</span></h2>
                        <p className="mt-4 text-[17px] leading-relaxed text-zinc-600 dark:text-zinc-400">{tx(C.sub)}</p>
                    </Reveal>
                    <Reveal delay={0.08}>
                        <dl className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
                            {headline.map((stat) => (
                                <div key={stat.label.EN} className="flex flex-col rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-center dark:border-white/10 dark:bg-white/[0.03]">
                                    <dt className="order-2 mt-1 text-[11.5px] font-semibold uppercase tracking-wider text-zinc-500">{tx(stat.label)}</dt>
                                    <dd className="order-1 text-3xl font-black leading-none"><span className="text-gradient"><CountUp value={stat.value} locale={locale} /></span></dd>
                                </div>
                            ))}
                        </dl>
                    </Reveal>
                    <ul className="mt-8 grid gap-4 sm:grid-cols-2">
                        {BENEFITS.map(({ icon: Icon, title, text }, index) => (
                            <li key={title.EN}>
                                <Reveal delay={0.04 * index} y={18}>
                                    <div className="group flex gap-3">
                                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-zinc-200 bg-white text-violet-600 transition duration-300 group-hover:-rotate-6 group-hover:scale-110 group-hover:border-pink-300 group-hover:text-pink-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-violet-300 dark:group-hover:text-pink-300"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                                        <span className="min-w-0">
                                            <span className="block text-[15px] font-black text-zinc-900 dark:text-white">{tx(title)}</span>
                                            <span className="mt-0.5 block text-[13.5px] leading-snug text-zinc-600 dark:text-zinc-400">{tx(text)}</span>
                                        </span>
                                    </div>
                                </Reveal>
                            </li>
                        ))}
                    </ul>
                </div>
                <Reveal delay={0.1} className="min-w-0">
                    <AccountHub list={list} active={active} onPick={pickFromHub} />
                </Reveal>
            </div>

            <div ref={explorer} className="mt-20 scroll-mt-24 rounded-[2rem] border border-zinc-200 bg-zinc-50/60 p-4 sm:p-8 dark:border-white/[0.08] dark:bg-white/[0.02]">
                <Explorer list={list} active={active} onPick={pick} auto={auto} onUserPick={userPick} />
            </div>

            <Flows list={list} />
        </section>
    );
}
