"use client";

import { Brain, Check, CircleAlert, Lock, Mic, Play, ShieldCheck, Smartphone } from "lucide-react";
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
