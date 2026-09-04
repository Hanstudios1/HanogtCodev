"use client";

import OptimizedImage from "@/components/OptimizedImage";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ExternalLink, Send, ShieldCheck, Trash2, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";

type ChatMessage = { id: string; role: "user" | "bot"; text: string; time: string };

const ANSWERS = [
    {
        keywords: ["güven", "security", "bot", "tarama", "scan"],
        tr: "Kod çalıştırma istekleri tarayıcıya güvenmeden sunucuda denetlenir. Hanogt Security Bot yüksek güvenli kötüye kullanım imzalarını engeller; ancak antivirüs veya sandbox yerine geçmez. Asıl sınır, kimlik doğrulama, hız kotası ve izole çalıştırıcıdır.",
        en: "Execution requests are checked on the server without trusting the browser. Hanogt Security Bot blocks high-confidence abuse signatures, but it is not an antivirus product or a sandbox. Authentication, quotas, and the isolated runner remain the security boundary.",
    },
    {
        keywords: ["ban", "engel", "itiraz", "appeal", "ceza"],
        tr: "Otomatik bir eşleşme hesabı geri dönülmez biçimde engellemez. Riskli istek durdurulur ve asgari denetim kaydı oluşur. Hesap yaptırımı orantılı incelemeyle verilir; Geri Bildirim sayfasından Güvenlik İtirazı gönderebilirsiniz.",
        en: "An automated match does not irreversibly ban an account. A risky request is stopped and a minimal audit event is recorded. Account sanctions require proportionate review, and you can file a Security Appeal from Feedback.",
    },
    {
        keywords: ["şifre", "password", "parola", "hash"],
        tr: "Parolalar açık metin veya base64 olarak saklanmaz. Her parola benzersiz tuzla scrypt kullanılarak tek yönlü karmalanır ve profil verisinden ayrı, istemci erişimine kapalı koleksiyonda tutulur. Eski hesaplar başarılı girişte otomatik taşınır.",
        en: "Passwords are never stored as plaintext or base64. Each password is one-way hashed with scrypt and a unique salt, then kept in a client-inaccessible collection separate from profile data. Legacy accounts migrate after a successful login.",
    },
    {
        keywords: ["arama", "call", "webrtc", "ses", "voice"],
        tr: "Sesli aramalar WebRTC ile eşler arasında kurulur ve Hanogt tarafından kaydedilmez. Geçici SDP/ICE sinyalleşme belgeleri görüşme bitince silinir. Sesli mesajlar ise Firestore’a base64 yazılmaz; yetkili dosya depolamasında tutulur ve mesaj silinince dosyası da kaldırılır.",
        en: "Voice calls use peer-to-peer WebRTC and are not recorded by Hanogt. Temporary SDP/ICE signaling documents are deleted when the call ends. Voice messages are stored as protected files, not base64 inside Firestore, and the file is removed with the message.",
    },
    {
        keywords: ["kod", "runner", "piston", "wandbox", "çalıştır"],
        tr: "Üretim ortamı herkese açık Piston veya Wandbox yedeğine düşmez. Kod yalnızca yönetici tarafından tanımlanan, ağ ve kaynak kotaları bulunan izole bir yürütücüye gönderilir. Yürütücü yoksa özellik güvenli biçimde kapalı kalır.",
        en: "Production does not fall back to public Piston or Wandbox services. Code is sent only to an administrator-configured isolated runner with network and resource limits. If no runner exists, execution fails closed.",
    },
    {
        keywords: ["veri", "privacy", "kvkk", "gizlilik", "sil"],
        tr: "Veri kategorileri, hizmet sağlayıcıları ve saklama yaklaşımı Gizlilik Politikası ile KVKK Aydınlatma Metni’nde açıklanır. Hesap ayarlarından veri dışa aktarabilir veya silme sürecini başlatabilirsiniz.",
        en: "Data categories, providers, and retention are explained in the Privacy Policy and KVKK Notice. You can export data or start deletion from Account Settings.",
    },
    {
        keywords: ["bildir", "report", "hata", "bug", "feedback"],
        tr: "Geri Bildirim ve SSS sayfasından soru, hata, özellik önerisi, KVKK başvurusu veya güvenlik itirazı gönderebilirsiniz. Bildirime gerçek parola, erişim anahtarı ya da gereksiz kişisel veri eklemeyin.",
        en: "Use Feedback & FAQ for questions, bugs, feature requests, privacy requests, or security appeals. Never include real passwords, access keys, or unnecessary personal data.",
    },
    {
        keywords: ["media", "grup", "group", "paylaş", "share", "eğit", "train", "rıza", "consent"],
        tr: "Hanogt Media yayınları güvenlik ön-elemesinden geçer; kodunuz yalnızca siz ayrıca yayımlarsanız görünür olur. Security katkı programı varsayılan kapalıdır ve proje bazında ikinci onay ister. Ham kod kontrolsüz biçimde kendi kendine eğitime verilmez. Grup erişimi ise süreli davet, üyelik ve rol kontrolleriyle sınırlandırılır.",
        en: "Hanogt Media posts pass a security pre-check, and code is visible only after you explicitly publish it. The Security contribution program is off by default and requires a second project-level choice. Raw code is not fed into uncontrolled self-training. Group access is limited by expiring invitations, membership, and roles.",
    },
];

const QUICK_TOPICS = ["Parola güvenliği", "Kod çalıştırma", "Media ve katkı rızası", "WebRTC ve ses", "Güvenlik bildirimi"];

function answerFor(message: string, english: boolean) {
    const normalized = message.toLocaleLowerCase(english ? "en" : "tr-TR");
    const answer = ANSWERS.find((entry) => entry.keywords.some((keyword) => normalized.includes(keyword)));
    return answer ? (english ? answer.en : answer.tr) : (english
        ? "I can explain password security, code execution, WebRTC calls, privacy, account sanctions, or responsible vulnerability reporting. Please choose one of those topics."
        : "Parola güvenliği, kod çalıştırma, WebRTC aramaları, gizlilik, hesap yaptırımları veya sorumlu açık bildirimi hakkında yardımcı olabilirim. Konuyu biraz netleştirin.");
}

const time = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function SecurityBotChatWindow({ onClose }: { onClose: () => void }) {
    const { language } = useI18n();
    const english = language !== "TR";
    const [messages, setMessages] = useState<ChatMessage[]>(() => [{
        id: "welcome",
        role: "bot",
        text: english
            ? "Hello, I’m Hanogt Security Bot. I explain how the safeguards work and help you report issues responsibly. I do not make account decisions."
            : "Merhaba, ben Hanogt Security Bot. Güvenlik önlemlerinin nasıl çalıştığını açıklar ve sorunları sorumlu biçimde bildirmenize yardım ederim. Hesap yaptırımı kararı vermem.",
        time: time(),
    }]);
    const [input, setInput] = useState("");
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [messages]);

    const send = () => {
        const value = input.trim().slice(0, 500);
        if (!value) return;
        const stamp = Date.now();
        setMessages((current) => [...current,
            { id: `user-${stamp}`, role: "user", text: value, time: time() },
            { id: `bot-${stamp}`, role: "bot", text: answerFor(value, english), time: time() },
        ]);
        setInput("");
    };

    return (
        <div className="fixed bottom-5 right-4 z-[120] flex h-[min(620px,calc(100vh-7rem))] w-[min(390px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
            <header className="border-b border-zinc-200 bg-gradient-to-br from-emerald-600 to-teal-700 p-4 text-white dark:border-zinc-700">
                <div className="flex items-center gap-3">
                    <div className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-white/15"><OptimizedImage src="/hanogt-bot-logo.png" alt="" className="h-full w-full object-cover" /><span className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full border-2 border-teal-700 bg-emerald-300" /></div>
                    <div className="min-w-0 flex-1"><h2 className="truncate font-bold">Hanogt Security Bot</h2><p className="text-xs text-emerald-50">v5 · Güvenlik ve gizlilik rehberi</p></div>
                    <button onClick={() => setMessages([])} className="rounded-xl p-2 hover:bg-white/10" aria-label="Sohbeti temizle"><Trash2 className="h-4 w-4" /></button>
                    <button onClick={onClose} className="rounded-xl p-2 hover:bg-white/10" aria-label="Kapat"><X className="h-5 w-5" /></button>
                </div>
                <div className="mt-3 flex items-center gap-2 rounded-xl bg-black/10 px-3 py-2 text-[11px] text-emerald-50"><ShieldCheck className="h-3.5 w-3.5" />Sunucu denetimi · Orantılı yaptırım · İtiraz yolu</div>
            </header>

            <div className="flex-1 space-y-3 overflow-y-auto bg-zinc-50 p-4 dark:bg-zinc-950/50">
                {messages.length === 0 && <button onClick={() => setMessages([{ id: "new", role: "bot", text: english ? "How can I help with security?" : "Güvenlik konusunda nasıl yardımcı olabilirim?", time: time() }])} className="mx-auto block rounded-xl border border-dashed border-zinc-300 px-4 py-3 text-sm text-zinc-500 dark:border-zinc-700">Yeni sohbet başlat</button>}
                {messages.map((message) => <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "rounded-br-md bg-blue-600 text-white" : "rounded-bl-md border border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"}`}><p>{message.text}</p><span className={`mt-1 block text-[10px] ${message.role === "user" ? "text-blue-100" : "text-zinc-400"}`}>{message.time}</span></div></div>)}
                <div ref={endRef} />
            </div>

            <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
                <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">{QUICK_TOPICS.map((topic) => <button key={topic} onClick={() => setInput(topic)} className="whitespace-nowrap rounded-full bg-zinc-100 px-2.5 py-1 text-[10px] font-semibold text-zinc-500 hover:bg-emerald-50 hover:text-emerald-700 dark:bg-zinc-800 dark:hover:bg-emerald-950">{topic}</button>)}</div>
                <div className="flex gap-2"><input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") send(); }} maxLength={500} placeholder={english ? "Ask about security…" : "Güvenliği sor…"} className="min-w-0 flex-1 rounded-xl bg-zinc-100 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-zinc-800" /><button onClick={send} disabled={!input.trim()} className="rounded-xl bg-emerald-600 p-2.5 text-white hover:bg-emerald-700 disabled:opacity-40"><Send className="h-4 w-4" /></button></div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-400"><span>Bilgilendirme aracıdır; güvenlik hükmü vermez.</span><Link href="/feedback" className="flex items-center gap-1 text-emerald-600 hover:underline">Bildirim gönder <ExternalLink className="h-3 w-3" /></Link></div>
            </div>
        </div>
    );
}

export default function SecurityBotChat() {
    return null;
}
