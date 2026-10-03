import { Bot, Code2, Hand, ShieldCheck, Sparkles, Zap, type LucideIcon } from "lucide-react";
import type { AgentMode } from "@/lib/ai/agent-tools";
import type { AiFailure } from "@/lib/ai/client";
import type { AiMode } from "@/lib/ai/local-engine";
import type { Copy } from "@/lib/i18n";

export const MAX_INPUT = 8_000;
/** Largest code file that can be attached to a question (characters sent are capped by the client too). */
export const MAX_ATTACHMENT_BYTES = 200_000;

export const MODES: Array<{ id: AiMode; label: Copy; description: Copy; icon: LucideIcon }> = [
    { id: "general", label: { TR: "Genel", EN: "General" }, description: { TR: "Site, kod ve oyunlar hakkında her şey", EN: "Anything about the site, code and games" }, icon: Sparkles },
    { id: "code", label: { TR: "Kod", EN: "Code" }, description: { TR: "Kod yazma, açıklama ve hata ayıklama", EN: "Writing, explaining and debugging code" }, icon: Code2 },
    { id: "security", label: { TR: "Güvenlik", EN: "Security" }, description: { TR: "Bağlantı, parola ve kod güvenliği", EN: "Link, password and code safety" }, icon: ShieldCheck },
];

export const AGENT_MODE_OPTIONS: Array<{ id: AgentMode; label: Copy; short: Copy; description: Copy; icon: LucideIcon }> = [
    {
        id: "off",
        label: { TR: "Kapalı", EN: "Off" },
        short: { TR: "Ajan: Kapalı", EN: "Agent: Off" },
        description: { TR: "Hanogt AI sitede işlem yapmaz; yalnızca nasıl yapacağını anlatır.", EN: "Hanogt AI takes no actions on the site; it only explains how to do things." },
        icon: Hand,
    },
    {
        id: "ask",
        label: { TR: "Her seferinde sor", EN: "Ask every time" },
        short: { TR: "Ajan: Sor", EN: "Agent: Ask" },
        description: { TR: "Her işlemden önce iznini ister. Profilini okumak için oturum başına bir kez sorar.", EN: "Asks before every action. Reading your profile is asked once per session." },
        icon: Bot,
    },
    {
        id: "auto_safe",
        label: { TR: "Güvenli işlemlerde otomatik", EN: "Automatic for safe actions" },
        short: { TR: "Ajan: Otomatik", EN: "Agent: Auto" },
        description: { TR: "Sayfa açmak ve kodu editörde açmak gibi zararsız işlemleri sormadan yapar; bir şey oluşturmadan önce yine sorar.", EN: "Does harmless things like opening a page or putting code in the editor without asking; still asks before creating anything." },
        icon: Zap,
    },
];

export const AGENT_NEVER: Copy = { TR: "Silme, parola, 2FA, yönetici işlemleri ve başkalarına mesaj gönderme hiçbir modda yapılmaz.", EN: "Deleting, passwords, 2FA, admin work and messaging other people are never done in any mode." };

export const STARTERS: Record<AiMode, Array<{ title: Copy; prompt: Copy }>> = {
    general: [
        { title: { TR: "Neler yapabilirsin?", EN: "What can you do?" }, prompt: { TR: "Neler yapabilirsin?", EN: "What can you do?" } },
        { title: { TR: "Platform oyunu yap", EN: "Make a platformer" }, prompt: { TR: "Bana bir platform oyunu yap", EN: "Make me a platformer game" } },
        { title: { TR: "Çalışma grubu kur", EN: "Create a study group" }, prompt: { TR: "React çalışma grubu kur", EN: "Create a React study group" } },
        { title: { TR: "Profilimi özetle", EN: "Summarise my profile" }, prompt: { TR: "Profilimde neler var?", EN: "What's on my profile?" } },
    ],
    code: [
        { title: { TR: "Hesap makinesi", EN: "Calculator" }, prompt: { TR: "Python ile hesap makinesi yaz ve editörde aç", EN: "Write a calculator in Python and open it in the editor" } },
        { title: { TR: "Yılan oyunu", EN: "Snake game" }, prompt: { TR: "HTML ile yılan oyunu yap", EN: "Make a snake game in HTML" } },
        { title: { TR: "Hatayı açıkla", EN: "Explain an error" }, prompt: { TR: "TypeError: Cannot read properties of undefined ne demek?", EN: "What does TypeError: Cannot read properties of undefined mean?" } },
        { title: { TR: "Zıplama scripti", EN: "Jump script" }, prompt: { TR: "Hanogt Engine için C# zıplama kodu yaz", EN: "Write a C# jump script for Hanogt Engine" } },
    ],
    security: [
        { title: { TR: "Bağlantı kontrolü", EN: "Check a link" }, prompt: { TR: "Bu bağlantı güvenli mi? https://", EN: "Is this link safe? https://" } },
        { title: { TR: "Parola gücü", EN: "Password strength" }, prompt: { TR: "\"Kedi2024!\" parolası güçlü mü?", EN: "Is the password \"Kitty2024!\" strong?" } },
        { title: { TR: "Hesabım çalındı", EN: "I was hacked" }, prompt: { TR: "Hesabım ele geçirildi galiba, ne yapmalıyım?", EN: "I think my account was hacked, what should I do?" } },
        { title: { TR: "2FA nasıl açılır?", EN: "Enable 2FA" }, prompt: { TR: "İki adımlı doğrulamayı nasıl açarım?", EN: "How do I turn on two-factor authentication?" } },
    ],
};

export const NOTICES: Record<AiFailure, Copy> = {
    auth_required: { TR: "Oturumun yenilenmeli; bu yanıtı Hanogt AI Çekirdeği verdi.", EN: "Your session needs to be renewed; Hanogt AI Core answered this one." },
    not_configured: { TR: "Bu sunucuda dil modeli yapılandırılmamış; yanıtı Hanogt AI Çekirdeği verdi.", EN: "No language model is configured on this server; Hanogt AI Core answered." },
    rate_limited: { TR: "Dakikalık istek sınırı doldu; yanıtı Hanogt AI Çekirdeği verdi.", EN: "The per-minute limit was reached; Hanogt AI Core answered." },
    daily_limit: { TR: "Günlük dil modeli hakkın doldu; ilk mesajından 24 saat sonra yenilenir. O zamana kadar Hanogt AI Çekirdeği yanıt veriyor.", EN: "Your daily language-model messages are used up; they renew 24 hours after your first message. Until then Hanogt AI Core answers." },
    network: { TR: "Dil modeline ulaşılamadı; yanıtı Hanogt AI Çekirdeği verdi.", EN: "The language model couldn't be reached; Hanogt AI Core answered." },
    timeout: { TR: "Dil modeli zamanında yanıt vermedi; yanıtı Hanogt AI Çekirdeği verdi.", EN: "The language model timed out; Hanogt AI Core answered." },
    upstream: { TR: "Dil modeli hizmeti hata verdi; yanıtı Hanogt AI Çekirdeği verdi.", EN: "The language model service failed; Hanogt AI Core answered." },
    aborted: { TR: "Durduruldu.", EN: "Stopped." },
    connection_invalid: { TR: "Sağlayıcı bağlantının API anahtarını kabul etmedi; anahtarını bağlantı ayarlarından kontrol et. Yanıtı Hanogt AI Çekirdeği verdi.", EN: "The provider didn't accept your connection's API key; check your key in the connection settings. Hanogt AI Core answered." },
    connection_unavailable: { TR: "Seçtiğin bağlantı artık kullanılamıyor (silinmiş ya da planın kapsamıyor), bu yüzden Hanogt AI'a dönüldü. Yanıtı Hanogt AI Çekirdeği verdi.", EN: "The connection you chose can't be used any more (deleted or not in your plan), so Hanogt AI is selected again. Hanogt AI Core answered." },
    connection_quota: { TR: "Sağlayıcı hesabının kotası ya da kredisi bitmiş; sağlayıcının panelinden kontrol et. Yanıtı Hanogt AI Çekirdeği verdi.", EN: "Your provider account is out of quota or credit; check the provider's dashboard. Hanogt AI Core answered." },
    connection_model: { TR: "Seçtiğin model sağlayıcıda bulunamadı; modeli bağlantı ayarlarından değiştir. Yanıtı Hanogt AI Çekirdeği verdi.", EN: "The provider couldn't find the model you chose; change it in the connection settings. Hanogt AI Core answered." },
    connection_rate_limited: { TR: "Sağlayıcının istek sınırına takıldın; yanıtı Hanogt AI Çekirdeği verdi.", EN: "You hit the provider's rate limit; Hanogt AI Core answered." },
    connection_daily_limit: { TR: "Kendi bağlantıların için günlük mesaj hakkın doldu; ilk mesajından 24 saat sonra yenilenir. O zamana kadar Hanogt AI Çekirdeği yanıt veriyor.", EN: "You've used the day's messages for your own connections; they renew 24 hours after your first one. Until then Hanogt AI Core answers." },
};

/** Failures caused by the person's own connection: the connection list is refreshed afterwards. */
export const CONNECTION_FAILURES: ReadonlySet<AiFailure> = new Set<AiFailure>(["connection_invalid", "connection_unavailable", "connection_quota", "connection_model"]);

export const CHAT_COPY = {
    somethingWrong: { TR: "Bir şeyler ters gitti. Lütfen tekrar dene.", EN: "Something went wrong. Please try again." },
    retryIn: { TR: "{seconds} sn sonra tekrar dene.", EN: "Try again in {seconds} s." },
    dailyLimitAt: { TR: "Günlük {limit} mesajlık Hanogt AI hakkının hepsini kullandın. Yenilenme: {time}. O zamana kadar Hanogt AI Çekirdeği yanıt veriyor.", EN: "You've used all {limit} of today's Hanogt AI messages. Renews: {time}. Until then Hanogt AI Core answers." },
    ownDailyLimitAt: { TR: "Kendi bağlantıların için günlük {limit} mesajın hepsini kullandın. Yenilenme: {time}. O zamana kadar Hanogt AI Çekirdeği yanıt veriyor.", EN: "You've used all {limit} of the day's messages for your own connections. Renews: {time}. Until then Hanogt AI Core answers." },
    upgrade: { TR: "Planını yükselt", EN: "Upgrade your plan" },
    followUpFailed: { TR: "İşlem tamamlandı, ancak dil modeline şu an ulaşılamadığı için sonucu özetleyemiyorum. Sonuç yukarıdaki kartta.", EN: "The action finished, but the language model can't be reached right now, so I can't summarise it. The result is on the card above." },
    attachTooLarge: { TR: "Bu dosya çok büyük (en fazla 200 KB).", EN: "This file is too large (200 KB at most)." },
    attachUnreadable: { TR: "Bu dosya metin olarak okunamadı.", EN: "This file couldn't be read as text." },
} satisfies Record<string, Copy>;
