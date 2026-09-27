"use client";

import { motion } from "framer-motion";
import { Check, Copy as CopyIcon, Dices, Eye, EyeOff, KeyRound, LoaderCircle, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useI18n, type Copy } from "@/lib/i18n";
import { checkPassword, sha1Hex } from "@/lib/security/password";

const WORDS_TR = ("elma armut kiraz kavun karpuz limon portakal muz incir erik ayva nar mandalina çilek vişne kayısı şeftali üzüm " +
    "kedi köpek aslan kaplan kartal şahin serçe balina yunus ahtapot penguen tavşan kirpi sincap ayı kurt tilki geyik zürafa fil " +
    "deniz dağ orman nehir göl çöl ada vadi bulut yağmur kar rüzgar fırtına şimşek güneş ay yıldız gezegen roket uydu kuyruklu " +
    "mavi yeşil kırmızı sarı mor turuncu pembe siyah beyaz gri altın gümüş bakır demir cam taş kum toprak ateş su hava buz " +
    "kalem defter kitap masa sandalye lamba kapı pencere anahtar saat çanta şapka ayakkabı eldiven atkı gözlük şemsiye bardak tabak " +
    "gitar piyano davul keman flüt trompet şarkı dans resim heykel film oyun bulmaca satranç top raket kale köprü kule saray " +
    "hızlı yavaş sessiz neşeli cesur akıllı parlak derin geniş sıcak soğuk tatlı ekşi yumuşak sert yeni eski küçük büyük uzun " +
    "kod piksel robot motor sunucu bulutsu algoritma değişken döngü fonksiyon dizi nesne sınıf modül paket sürüm hata çözüm").split(" ");
const WORDS_EN = ("apple pear cherry melon lemon orange banana fig plum quince grape peach apricot mango kiwi berry " +
    "cat dog lion tiger eagle hawk sparrow whale dolphin octopus penguin rabbit hedgehog squirrel bear wolf fox deer giraffe elephant " +
    "sea mountain forest river lake desert island valley cloud rain snow wind storm thunder sun moon star planet rocket comet " +
    "blue green red yellow purple orange pink black white gray gold silver copper iron glass stone sand soil fire water frost " +
    "pencil notebook book table chair lamp door window key clock bag hat shoe glove scarf glasses umbrella cup plate spoon " +
    "guitar piano drum violin flute trumpet song dance painting statue movie game puzzle chess ball racket castle bridge tower palace " +
    "quick slow quiet happy brave clever bright deep wide warm cold sweet sour soft hard fresh ancient tiny huge long " +
    "code pixel robot engine server nebula algorithm variable loop function array object class module package version bug fix").split(" ");

function randomInt(max: number) {
    const buffer = new Uint32Array(1);
    const limit = Math.floor(0x1_0000_0000 / max) * max;
    do crypto.getRandomValues(buffer); while (buffer[0] >= limit);
    return buffer[0] % max;
}

function generatePassphrase(words: string[], count: number) {
    const picked = Array.from({ length: count }, () => words[randomInt(words.length)]);
    const index = randomInt(count);
    picked[index] = picked[index].charAt(0).toLocaleUpperCase("tr") + picked[index].slice(1);
    return `${picked.join("-")}-${randomInt(90) + 10}`;
}

function generatePassword(length: number, symbols: boolean) {
    const lower = "abcdefghijkmnopqrstuvwxyz";
    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const digits = "23456789";
    const special = "!@#$%^&*-_=+?";
    const pools = [lower, upper, digits, ...(symbols ? [special] : [])];
    const all = pools.join("");
    const chars = pools.map((pool) => pool[randomInt(pool.length)]);
    while (chars.length < length) chars.push(all[randomInt(all.length)]);
    for (let index = chars.length - 1; index > 0; index -= 1) {
        const swap = randomInt(index + 1);
        [chars[index], chars[swap]] = [chars[swap], chars[index]];
    }
    return chars.join("");
}

const LEVELS: Array<{ label: Copy; color: string }> = [
    { label: { TR: "Çok zayıf", EN: "Very weak" }, color: "bg-red-600" },
    { label: { TR: "Zayıf", EN: "Weak" }, color: "bg-orange-500" },
    { label: { TR: "Orta", EN: "Fair" }, color: "bg-amber-400" },
    { label: { TR: "Güçlü", EN: "Strong" }, color: "bg-lime-500" },
    { label: { TR: "Çok güçlü", EN: "Very strong" }, color: "bg-emerald-500" },
];

type Breach = { state: "idle" | "checking" | "safe" | "pwned" | "error"; count?: number; message?: string };

export default function PasswordLab() {
    const { tx, language } = useI18n();
    const locale = language === "TR" ? "tr" : "en";
    const [password, setPassword] = useState("");
    const [visible, setVisible] = useState(false);
    const [breach, setBreach] = useState<Breach>({ state: "idle" });
    const [generated, setGenerated] = useState<string | null>(null);
    const [length, setLength] = useState(18);
    const [symbols, setSymbols] = useState(true);
    const [copied, setCopied] = useState(false);
    const report = checkPassword(password, locale);
    const level = LEVELS[report.score];

    const updatePassword = (value: string) => {
        setPassword(value);
        setBreach({ state: "idle" });
    };

    const checkBreach = async () => {
        if (!password) return;
        setBreach({ state: "checking" });
        try {
            const hash = await sha1Hex(password);
            const response = await fetch(`/api/security/pwned?prefix=${hash.slice(0, 5)}`);
            const payload = await response.json() as { entries?: Array<[string, number]>; error?: string };
            if (!response.ok || !payload.entries) throw new Error(payload.error || "error");
            const hit = payload.entries.find(([suffix]) => suffix === hash.slice(5));
            setBreach(hit ? { state: "pwned", count: hit[1] } : { state: "safe" });
        } catch (reason) {
            setBreach({ state: "error", message: reason instanceof Error && reason.message !== "error" ? reason.message : undefined });
        }
    };

    const copy = async (value: string) => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } catch {
            setCopied(false);
        }
    };

    return (
        <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-900/60">
                <label htmlFor="password-lab" className="text-[13px] font-bold text-zinc-700 dark:text-zinc-200">{tx({ TR: "Parolayı dene", EN: "Test a password" })}</label>
                <div className="relative mt-2">
                    <KeyRound className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <input
                        id="password-lab"
                        type={visible ? "text" : "password"}
                        value={password}
                        onChange={(event) => updatePassword(event.target.value)}
                        autoComplete="off"
                        spellCheck={false}
                        maxLength={128}
                        placeholder={tx({ TR: "Bir parola yaz…", EN: "Type a password…" })}
                        className="h-12 w-full rounded-xl border border-zinc-200 bg-zinc-50 pe-12 ps-10 font-mono text-[15px] text-zinc-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                    />
                    <button type="button" onClick={() => setVisible((value) => !value)} className="absolute end-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-white/10" aria-label={visible ? tx({ TR: "Gizle", EN: "Hide" }) : tx({ TR: "Göster", EN: "Show" })}>
                        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                </div>
                <div className="mt-3 grid grid-cols-5 gap-1" aria-hidden="true">
                    {LEVELS.map((entry, index) => (
                        <motion.span key={index} className={`h-2 rounded-full ${password && index <= report.score ? level.color : "bg-zinc-200 dark:bg-white/10"}`} animate={{ scaleY: password && index <= report.score ? 1 : 0.6 }} />
                    ))}
                </div>
                <p className="mt-2 text-[13px] font-bold text-zinc-700 dark:text-zinc-200" aria-live="polite">{password ? tx(level.label) : tx({ TR: "Parola bekleniyor", EN: "Waiting for a password" })}{password ? <span className="font-normal text-zinc-400"> · ~{report.entropyBits} bit</span> : null}</p>

                {password ? (
                    <>
                        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                            {[
                                { label: { TR: "Çevrimiçi saldırı", EN: "Online attack" }, value: report.crackTimes.online, hint: { TR: "10 deneme/sn", EN: "10 guesses/s" } },
                                { label: { TR: "Yavaş özet (bcrypt)", EN: "Slow hash (bcrypt)" }, value: report.crackTimes.offlineSlow, hint: { TR: "10⁴ deneme/sn", EN: "10⁴ guesses/s" } },
                                { label: { TR: "Hızlı özet (MD5)", EN: "Fast hash (MD5)" }, value: report.crackTimes.offlineFast, hint: { TR: "10¹⁰ deneme/sn", EN: "10¹⁰ guesses/s" } },
                            ].map((entry) => (
                                <div key={entry.label.EN} className="rounded-xl bg-zinc-50 p-2.5 dark:bg-white/[0.04]">
                                    <dt className="text-[11px] font-semibold text-zinc-500">{tx(entry.label)}</dt>
                                    <dd className="mt-1 text-[15px] font-black text-zinc-900 dark:text-white">{entry.value}</dd>
                                    <dd className="text-[10px] text-zinc-400">{tx(entry.hint)}</dd>
                                </div>
                            ))}
                        </dl>
                        {report.warnings.length ? (
                            <ul className="mt-4 space-y-1.5">
                                {report.warnings.map((warning, index) => <li key={index} className="flex gap-2 text-[13px] text-red-600 dark:text-red-400"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />{tx(warning)}</li>)}
                            </ul>
                        ) : null}
                        <ul className="mt-3 space-y-1.5">
                            {report.suggestions.map((suggestion, index) => <li key={index} className="flex gap-2 text-[13px] text-zinc-600 dark:text-zinc-400"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{tx(suggestion)}</li>)}
                        </ul>
                        <div className="mt-4 rounded-xl border border-zinc-200 p-3 dark:border-white/10">
                            <div className="flex items-center gap-2">
                                <button type="button" onClick={() => void checkBreach()} disabled={breach.state === "checking"} className="inline-flex h-9 items-center gap-2 rounded-lg bg-zinc-900 px-3 text-[13px] font-bold text-white transition hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-zinc-900">
                                    {breach.state === "checking" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}{tx({ TR: "Sızıntılarda ara", EN: "Check breaches" })}
                                </button>
                                <p className="text-[11.5px] leading-snug text-zinc-500">{tx({ TR: "Parolanın yalnızca SHA-1 özetinin ilk 5 karakteri gönderilir (k-anonimlik).", EN: "Only the first 5 characters of the SHA-1 hash are sent (k-anonymity)." })}</p>
                            </div>
                            {breach.state === "pwned" ? <p className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-[13px] font-semibold text-red-700 dark:text-red-300">{tx({ TR: `Bu parola bilinen veri sızıntılarında ${breach.count?.toLocaleString("tr-TR")} kez görüldü. Kullanma!`, EN: `This password appeared ${breach.count?.toLocaleString("en-US")} times in known breaches. Don't use it!` })}</p> : null}
                            {breach.state === "safe" ? <p className="mt-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-[13px] font-semibold text-emerald-700 dark:text-emerald-300">{tx({ TR: "Bilinen sızıntılarda bulunamadı. Yine de her sitede farklı parola kullan.", EN: "Not found in known breaches. Still, use a unique password per site." })}</p> : null}
                            {breach.state === "error" ? <p className="mt-2 text-[12.5px] text-amber-600 dark:text-amber-400">{breach.message ?? tx({ TR: "Sızıntı veritabanına şu anda ulaşılamıyor.", EN: "The breach database is unreachable right now." })}</p> : null}
                        </div>
                    </>
                ) : (
                    <p className="mt-4 text-[13px] leading-relaxed text-zinc-500">{tx({ TR: "Ölçüm tamamen tarayıcında yapılır; yazdığın parola hiçbir yere gönderilmez ve kaydedilmez. Yine de gerçek parolanı denemek yerine benzer bir örnek yazmanı öneririz.", EN: "The estimate runs entirely in your browser; the password is never sent or stored. Still, consider testing a similar example instead of your real password." })}</p>
                )}
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-gradient-to-br from-emerald-500/[0.06] to-teal-500/[0.06] p-5 dark:border-white/10">
                <h3 className="flex items-center gap-2 text-[15px] font-black text-zinc-900 dark:text-white"><Dices className="h-5 w-5 text-emerald-500" />{tx({ TR: "Güçlü parola üret", EN: "Generate a strong password" })}</h3>
                <p className="mt-1 text-[13px] text-zinc-600 dark:text-zinc-400">{tx({ TR: "Tarayıcının kriptografik rastgele sayı üreteci (crypto.getRandomValues) kullanılır.", EN: "Uses the browser's cryptographic random generator (crypto.getRandomValues)." })}</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setGenerated(generatePassphrase(locale === "tr" ? WORDS_TR : WORDS_EN, 5))} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-[13.5px] font-bold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-500">
                        <RefreshCw className="h-4 w-4" />{tx({ TR: "Parola cümlesi", EN: "Passphrase" })}
                    </button>
                    <button type="button" onClick={() => setGenerated(generatePassword(length, symbols))} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-emerald-600/40 bg-white text-[13.5px] font-bold text-emerald-700 transition hover:bg-emerald-50 dark:bg-zinc-900 dark:text-emerald-300 dark:hover:bg-emerald-500/10">
                        <KeyRound className="h-4 w-4" />{tx({ TR: "Rastgele parola", EN: "Random password" })}
                    </button>
                </div>
                <div className="mt-4 flex items-center gap-3 text-[13px] text-zinc-600 dark:text-zinc-300">
                    <label htmlFor="password-length" className="shrink-0 font-semibold">{tx({ TR: "Uzunluk", EN: "Length" })}: {length}</label>
                    <input id="password-length" type="range" min={10} max={48} value={length} onChange={(event) => setLength(Number(event.target.value))} className="flex-1 accent-emerald-600" />
                    <label className="flex shrink-0 items-center gap-1.5"><input type="checkbox" checked={symbols} onChange={(event) => setSymbols(event.target.checked)} className="accent-emerald-600" />{tx({ TR: "Sembol", EN: "Symbols" })}</label>
                </div>
                {generated ? (
                    <motion.div key={generated} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-xl border border-zinc-200 bg-white p-3 dark:border-white/10 dark:bg-zinc-950">
                        <p className="break-all font-mono text-[15px] font-semibold text-zinc-900 dark:text-white" dir="ltr">{generated}</p>
                        <div className="mt-2 flex items-center gap-2">
                            <button type="button" onClick={() => void copy(generated)} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-zinc-100 px-2.5 text-[12px] font-bold text-zinc-700 transition hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-200">{copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <CopyIcon className="h-3.5 w-3.5" />}{copied ? tx({ TR: "Kopyalandı", EN: "Copied" }) : tx({ TR: "Kopyala", EN: "Copy" })}</button>
                            <button type="button" onClick={() => updatePassword(generated)} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-zinc-100 px-2.5 text-[12px] font-bold text-zinc-700 transition hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-200">{tx({ TR: "Ölçere gönder", EN: "Send to meter" })}</button>
                        </div>
                    </motion.div>
                ) : null}
                <ul className="mt-5 space-y-2 text-[13px] text-zinc-600 dark:text-zinc-400">
                    <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{tx({ TR: "Parola yöneticisi kullan; tek güçlü ana parola yeter.", EN: "Use a password manager; one strong master password is enough." })}</li>
                    <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{tx({ TR: "Google ile giriş yapıyorsan Google hesabında 2 adımlı doğrulamayı aç.", EN: "If you sign in with Google, enable 2-step verification on your Google account." })}</li>
                    <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{tx({ TR: "Hanogt ekibi senden asla parola veya doğrulama kodu istemez.", EN: "The Hanogt team will never ask for your password or verification codes." })}</li>
                </ul>
            </div>
        </div>
    );
}
