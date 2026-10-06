"use client";

import { Brain, Check, CircleAlert, Code2, Heart, Lock, MessageCircle, Mic, Play, Repeat2, ShieldCheck, Smartphone } from "lucide-react";
import { useI18n, type Copy } from "@/lib/i18n";
import ProductLogo from "@/components/ProductLogo";

/**
 * Small, static versions of the real screens for the landing page's product
 * rows: the shapes and wording follow the actual pages, without any data of
 * real people.
 */

const FRAME = "overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-900";

function Frame({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
    return (
        <div className={`${FRAME} ${className}`} aria-hidden="true">
            <div className="flex items-center gap-1.5 border-b border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-white/10 dark:bg-zinc-950">
                <span className="h-2.5 w-2.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                <span className="h-2.5 w-2.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                <span className="h-2.5 w-2.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                <span className="ms-2 truncate text-[11.5px] font-semibold text-zinc-500">{title}</span>
            </div>
            {children}
        </div>
    );
}

const P: Record<string, Copy> = {
    run: { TR: "Çalıştır", EN: "Run" },
    output: { TR: "Çıktı", EN: "Output" },
    hello: { TR: "Merhaba, Hanogt!", EN: "Hello, Hanogt!" },
    question: { TR: "Bu döngüyü nasıl hızlandırırım?", EN: "How do I make this loop faster?" },
    thought: { TR: "4 sn düşündü", EN: "Thought for 4 s" },
    answer: { TR: "Her adımda listeyi baştan aramak yerine bir küme kullan; arama O(1) olur:", EN: "Use a set instead of searching the list on every step; lookups become O(1):" },
    hierarchy: { TR: "Hiyerarşi", EN: "Hierarchy" },
    inspector: { TR: "Inspector", EN: "Inspector" },
    friend: { TR: "Deniz", EN: "Deniz" },
    online: { TR: "Çevrimiçi", EN: "Online" },
    msg1: { TR: "Oyunun yeni bölümünü Arcade'e koydum, dener misin?", EN: "I put the new level on Arcade, want to try it?" },
    msg2: { TR: "Hemen bakıyorum! Sesli arayayım mı?", EN: "Looking now! Shall I call you?" },
    voice: { TR: "Sesli mesaj · 0:12", EN: "Voice message · 0:12" },
    linkCheck: { TR: "Bağlantı kontrolü", EN: "Link check" },
    risky: { TR: "Riskli: kimlik avı belirtileri", EN: "Risky: signs of phishing" },
    reason1: { TR: "Alan adı tanınmış bir markayı taklit ediyor", EN: "The domain imitates a well-known brand" },
    reason2: { TR: "Sayfa şifre ve kart bilgisi istiyor", EN: "The page asks for a password and card details" },
    account: { TR: "Hesap güvenliği", EN: "Account security" },
    password: { TR: "Şifre", EN: "Password" },
    twoStep: { TR: "İki adımlı doğrulama", EN: "Two-step verification" },
    sessions: { TR: "Oturumlar: bu cihaz", EN: "Sessions: this device" },
    play: { TR: "Oyna", EN: "Play" },
    remix: { TR: "Remiksle", EN: "Remix" },
    game1: { TR: "Neon Koşucu", EN: "Neon Runner" },
    game2: { TR: "Kale Savunması", EN: "Castle Defense" },
    game3: { TR: "Yıldız Avcısı", EN: "Star Hunter" },
    game4: { TR: "Labirent", EN: "Maze" },
    postTitle: { TR: "Python ile hava durumu botu", EN: "A weather bot in Python" },
    postAuthor: { TR: "Ece · 2 saat önce", EN: "Ece · 2 hours ago" },
    openEditor: { TR: "Editörde aç", EN: "Open in editor" },
};

export function EditorPreview() {
    const { tx } = useI18n();
    return (
        <Frame title="main.py · Hanogt Codev">
            <div className="grid grid-cols-[2rem_1fr] font-mono text-[12px] leading-[1.7]" dir="ltr">
                <div className="select-none bg-zinc-50 py-2 pe-2 text-end text-zinc-400 dark:bg-zinc-950 dark:text-zinc-600">{[1, 2, 3, 4, 5].map((line) => <div key={line}>{line}</div>)}</div>
                <div className="overflow-hidden py-2 ps-3 text-zinc-800 dark:text-zinc-200">
                    <div><span className="text-sky-700 dark:text-sky-300">def</span> <span className="text-amber-700 dark:text-yellow-100">greet</span>(name):</div>
                    <div>    <span className="text-sky-700 dark:text-sky-300">return</span> <span className="text-emerald-700 dark:text-emerald-300">f&quot;{tx({ TR: "Merhaba", EN: "Hello" })}, {"{name}"}!&quot;</span></div>
                    <div>&nbsp;</div>
                    <div><span className="text-amber-700 dark:text-yellow-100">print</span>(greet(<span className="text-emerald-700 dark:text-emerald-300">&quot;Hanogt&quot;</span>))</div>
                    <div>&nbsp;</div>
                </div>
            </div>
            <div className="flex items-center justify-between border-t border-zinc-200 px-3 py-2 dark:border-white/10">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">{tx(P.output)}</span>
                <span className="inline-flex items-center gap-1 rounded-md bg-brand-green px-2 py-1 text-[11px] font-bold text-white"><Play className="h-3 w-3" />{tx(P.run)}</span>
            </div>
            <p className="bg-zinc-950 px-3 py-2 font-mono text-[12px] text-emerald-300" dir="ltr">{tx(P.hello)}</p>
        </Frame>
    );
}

export function AiPreview() {
    const { tx } = useI18n();
    return (
        <Frame title="Hanogt AI">
            <div className="space-y-3 p-4 text-[13px]">
                <p className="ms-auto w-fit max-w-[85%] rounded-2xl rounded-ee-md bg-zinc-100 px-3 py-2 text-zinc-800 dark:bg-white/10 dark:text-zinc-100">{tx(P.question)}</p>
                <div className="flex gap-2.5">
                    <ProductLogo product="ai" size={24} />
                    <div className="min-w-0 flex-1 space-y-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-2 py-0.5 text-[11px] font-semibold text-zinc-500 dark:border-white/10"><Brain className="h-3 w-3" />{tx(P.thought)}</span>
                        <p className="leading-relaxed text-zinc-700 dark:text-zinc-300">{tx(P.answer)}</p>
                        <pre className="overflow-hidden rounded-lg bg-zinc-950 px-3 py-2 font-mono text-[11.5px] leading-relaxed text-zinc-200" dir="ltr">{"seen = set(items)\nhits = [x for x in queries if x in seen]"}</pre>
                    </div>
                </div>
            </div>
        </Frame>
    );
}

export function EnginePreview() {
    const { tx } = useI18n();
    return (
        <Frame title="Hanogt Engine · Platformer">
            <div className="grid grid-cols-[7.5rem_1fr] text-[11.5px] sm:grid-cols-[7.5rem_1fr_8rem]">
                <div className="border-e border-zinc-200 p-2 dark:border-white/10">
                    <p className="mb-1 font-bold uppercase tracking-wider text-zinc-400">{tx(P.hierarchy)}</p>
                    {["Main Camera", "Player", "Ground", "Coin ×12"].map((item, index) => (
                        <p key={item} className={`truncate rounded px-1.5 py-0.5 ${index === 1 ? "bg-brand-green/15 font-semibold text-brand-green" : "text-zinc-600 dark:text-zinc-400"}`}>{item}</p>
                    ))}
                </div>
                <div className="relative h-36 bg-sky-100 dark:bg-slate-800">
                    <div className="absolute inset-x-0 bottom-0 h-7 bg-emerald-700/80 dark:bg-emerald-900" />
                    <div className="absolute bottom-7 left-[22%] h-6 w-6 rounded-md border-2 border-zinc-900 bg-brand-crescent" />
                    <div className="absolute bottom-7 left-[52%] h-9 w-5 rounded bg-zinc-800 dark:bg-zinc-300" />
                    <div className="absolute bottom-16 left-[68%] h-3.5 w-3.5 rounded-full border border-zinc-900 bg-amber-400" />
                    <div className="absolute bottom-[5.2rem] left-[78%] h-3.5 w-3.5 rounded-full border border-zinc-900 bg-amber-400" />
                    <div className="absolute left-[21%] top-[38%] h-12 w-8 rounded-sm border border-dashed border-sky-500" />
                </div>
                <div className="hidden border-s border-zinc-200 p-2 sm:block dark:border-white/10">
                    <p className="mb-1 font-bold uppercase tracking-wider text-zinc-400">{tx(P.inspector)}</p>
                    <p className="font-semibold text-zinc-700 dark:text-zinc-200">Transform</p>
                    {["X 2.0", "Y 0.5", "Z 0.0"].map((value) => <p key={value} className="mt-1 rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-zinc-600 dark:bg-white/5 dark:text-zinc-300" dir="ltr">{value}</p>)}
                    <p className="mt-2 font-semibold text-zinc-700 dark:text-zinc-200">Rigidbody2D</p>
                </div>
            </div>
        </Frame>
    );
}

export function SocialPreview() {
    const { tx } = useI18n();
    return (
        <Frame title="Hanogt Social">
            <div className="p-4 text-[13px]">
                <div className="flex items-center gap-2.5 border-b border-zinc-100 pb-3 dark:border-white/5">
                    <span className="relative grid h-9 w-9 place-items-center rounded-full bg-sky-600 text-[13px] font-bold text-white">D<span className="absolute -bottom-0.5 -end-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500 dark:border-zinc-900" /></span>
                    <span>
                        <span className="block font-bold text-zinc-900 dark:text-white">{tx(P.friend)}</span>
                        <span className="block text-[11.5px] text-zinc-500">{tx(P.online)}</span>
                    </span>
                </div>
                <div className="mt-3 space-y-2">
                    <p className="w-fit max-w-[85%] rounded-2xl rounded-es-md bg-zinc-100 px-3 py-2 text-zinc-800 dark:bg-white/10 dark:text-zinc-100">{tx(P.msg1)}</p>
                    <p className="ms-auto w-fit max-w-[85%] rounded-2xl rounded-ee-md bg-brand-green px-3 py-2 text-white">{tx(P.msg2)}</p>
                    <p className="inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1.5 text-[12px] font-semibold text-zinc-600 dark:bg-white/10 dark:text-zinc-300"><Mic className="h-3.5 w-3.5" />{tx(P.voice)}</p>
                </div>
            </div>
        </Frame>
    );
}

export function SecurityPreview() {
    const { tx } = useI18n();
    return (
        <Frame title="Hanogt Security">
            <div className="grid gap-3 p-4 text-[12.5px] sm:grid-cols-2">
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-500/30 dark:bg-red-500/10">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">{tx(P.linkCheck)}</p>
                    <p className="mt-1 truncate font-mono text-zinc-700 dark:text-zinc-200" dir="ltr">hanogt-giris.example</p>
                    <p className="mt-2 inline-flex items-center gap-1.5 font-bold text-red-700 dark:text-red-300"><CircleAlert className="h-4 w-4" />{tx(P.risky)}</p>
                    <ul className="mt-1.5 list-disc space-y-0.5 ps-4 text-zinc-600 dark:text-zinc-300">
                        <li>{tx(P.reason1)}</li>
                        <li>{tx(P.reason2)}</li>
                    </ul>
                </div>
                <div className="rounded-xl border border-zinc-200 p-3 dark:border-white/10">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">{tx(P.account)}</p>
                    {[{ icon: Lock, label: P.password }, { icon: ShieldCheck, label: P.twoStep }, { icon: Smartphone, label: P.sessions }].map(({ icon: Icon, label }) => (
                        <p key={label.EN} className="mt-2 flex items-center gap-2 text-zinc-700 dark:text-zinc-200">
                            <Icon className="h-4 w-4 text-zinc-400" />
                            <span className="flex-1">{tx(label)}</span>
                            <Check className="h-4 w-4 text-brand-green" />
                        </p>
                    ))}
                </div>
            </div>
        </Frame>
    );
}

/** Little scenes in the accent's colors standing in for game thumbnails. */
function GameThumb({ variant }: { variant: 0 | 1 | 2 | 3 }) {
    return (
        <div className="relative h-16 overflow-hidden rounded-lg bg-indigo-950">
            {variant === 0 ? (
                <>
                    <div className="absolute inset-x-0 bottom-0 h-3 bg-fuchsia-500/70" />
                    <div className="absolute bottom-3 left-[18%] h-4 w-4 rounded-sm bg-pink-400" />
                    <div className="absolute bottom-3 left-[55%] h-6 w-3 rounded-sm bg-violet-400" />
                    <div className="absolute bottom-9 left-[75%] h-2.5 w-2.5 rounded-full bg-amber-400" />
                </>
            ) : variant === 1 ? (
                <>
                    <div className="absolute inset-x-0 bottom-0 h-4 bg-violet-700" />
                    <div className="absolute bottom-4 left-[38%] h-8 w-7 rounded-t-md bg-indigo-400" />
                    <div className="absolute bottom-4 left-[12%] h-3 w-3 rounded-full bg-pink-400" />
                    <div className="absolute bottom-4 left-[78%] h-3 w-3 rounded-full bg-pink-400" />
                </>
            ) : variant === 2 ? (
                <>
                    {[[15, 20], [70, 35], [40, 60], [85, 70], [25, 75]].map(([x, y]) => <span key={`${x}-${y}`} className="absolute h-1 w-1 rounded-full bg-white/70" style={{ left: `${x}%`, top: `${y}%` }} />)}
                    <div className="absolute left-[45%] top-[40%] h-0 w-0 border-x-[7px] border-b-[12px] border-x-transparent border-b-pink-400" />
                    <div className="absolute left-[20%] top-[20%] h-3 w-3 rounded-full bg-amber-400" />
                </>
            ) : (
                <div className="absolute inset-2 grid grid-cols-6 gap-0.5">
                    {Array.from({ length: 18 }, (_, index) => <span key={index} className={`rounded-[2px] ${[1, 2, 4, 7, 9, 10, 13, 15, 16].includes(index) ? "bg-violet-400/80" : index === 17 ? "bg-amber-400" : index === 0 ? "bg-pink-400" : "bg-transparent"}`} />)}
                </div>
            )}
        </div>
    );
}

export function ArcadePreview() {
    const { tx } = useI18n();
    const games: Array<{ title: Copy; likes: number; variant: 0 | 1 | 2 | 3 }> = [
        { title: P.game1, likes: 128, variant: 0 },
        { title: P.game2, likes: 96, variant: 1 },
        { title: P.game3, likes: 74, variant: 2 },
        { title: P.game4, likes: 51, variant: 3 },
    ];
    return (
        <Frame title="Hanogt Arcade">
            <div className="grid grid-cols-2 gap-3 p-4">
                {games.map((game) => (
                    <div key={game.title.EN} className="rounded-xl border border-zinc-200 p-2 dark:border-white/10">
                        <GameThumb variant={game.variant} />
                        <p className="mt-2 truncate text-[12.5px] font-bold text-zinc-800 dark:text-zinc-100">{tx(game.title)}</p>
                        <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-500">
                            <span className="inline-flex items-center gap-1"><Heart className="h-3 w-3 text-pink-500" />{game.likes}</span>
                            <span className="inline-flex items-center gap-1 font-bold text-violet-600 dark:text-violet-300"><Play className="h-3 w-3" />{tx(P.play)}</span>
                        </div>
                    </div>
                ))}
            </div>
            <p className="flex items-center gap-1.5 border-t border-zinc-200 px-4 py-2 text-[11.5px] font-semibold text-zinc-500 dark:border-white/10"><Repeat2 className="h-3.5 w-3.5" />{tx(P.remix)}</p>
        </Frame>
    );
}

export function MediaPreview() {
    const { tx } = useI18n();
    return (
        <Frame title="Hanogt Media">
            <div className="p-4 text-[13px]">
                <div className="flex items-center gap-2.5">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-pink-500 text-[12px] font-bold text-white">E</span>
                    <span className="min-w-0">
                        <span className="block truncate font-bold text-zinc-900 dark:text-white">{tx(P.postTitle)}</span>
                        <span className="block text-[11.5px] text-zinc-500">{tx(P.postAuthor)}</span>
                    </span>
                </div>
                <pre className="mt-3 overflow-hidden rounded-lg bg-zinc-950 px-3 py-2 font-mono text-[11.5px] leading-relaxed text-zinc-200" dir="ltr">
                    <span className="text-violet-300">import</span> requests{"\n"}city = <span className="text-pink-300">&quot;Ankara&quot;</span>{"\n"}<span className="text-amber-200">print</span>(weather(city))
                </pre>
                <div className="mt-3 flex items-center gap-4 text-[12px] text-zinc-500">
                    <span className="inline-flex items-center gap-1"><Heart className="h-3.5 w-3.5 text-pink-500" />42</span>
                    <span className="inline-flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" />7</span>
                    <span className="ms-auto inline-flex items-center gap-1 rounded-md bg-violet-600 px-2 py-1 text-[11px] font-bold text-white"><Code2 className="h-3 w-3" />{tx(P.openEditor)}</span>
                </div>
            </div>
        </Frame>
    );
}
