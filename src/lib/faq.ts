import type { Copy } from "@/lib/i18n";
import { PLAN_AI_CONNECTIONS, PLAN_AI_LIMITS, PLAN_PROJECT_LIMITS } from "@/lib/plans";
import { LANGUAGES, LANGUAGE_STATS } from "@/lib/runtimes/languages";

export type Faq = { id: string; category: Copy; question: Copy; answer: Copy };

/** FAQ categories in display order (the page offers them as filters). */
const CATEGORY = {
    support: { TR: "Destek", EN: "Support" },
    account: { TR: "Hesap ve güvenlik", EN: "Account & security" },
    billing: { TR: "Planlar ve ödemeler", EN: "Plans & billing" },
    code: { TR: "Kod editörü", EN: "Code editor" },
    ai: { TR: "Hanogt AI", EN: "Hanogt AI" },
    engine: { TR: "Oyun motoru", EN: "Game engine" },
    community: { TR: "Topluluk", EN: "Community" },
    privacy: { TR: "Gizlilik ve KVKK", EN: "Privacy & KVKK" },
    news: { TR: "Haberler", EN: "News" },
    languages: { TR: "Diller", EN: "Languages" },
} satisfies Record<string, Copy>;

export const FAQ_CATEGORIES: readonly Copy[] = Object.values(CATEGORY);

// Counts come from the language registry, so the answer never goes stale.
const LANGUAGE_COUNTS = {
    total: LANGUAGES.length,
    highlighted: LANGUAGE_STATS.highlighted,
    usable: LANGUAGE_STATS.usable,
    runnable: LANGUAGE_STATS.runnable,
    preview: LANGUAGE_STATS.preview,
    browser: LANGUAGES.filter((language) => language.engine === "browser").length,
    server: LANGUAGES.filter((language) => language.engine === "server").length,
};

// Plan limits come from src/lib/plans.ts too; null means unlimited.
const limit = (value: number | null) => value ?? "∞";
const PLAN_NUMBERS = {
    aiFree: PLAN_AI_LIMITS.free.perDay,
    aiPlus: PLAN_AI_LIMITS.plus.perDay,
    aiPro: PLAN_AI_LIMITS.pro.perDay,
    codeFree: limit(PLAN_PROJECT_LIMITS.free.code),
    gameFree: limit(PLAN_PROJECT_LIMITS.free.game),
    codePlus: limit(PLAN_PROJECT_LIMITS.plus.code),
    gamePlus: limit(PLAN_PROJECT_LIMITS.plus.game),
    connectionsPlus: PLAN_AI_CONNECTIONS.plus,
    connectionsPro: PLAN_AI_CONNECTIONS.pro,
};

/** Frequently asked questions: shown on /feedback and used by Hanogt AI's knowledge base. */
export const FAQS: Faq[] = [
    {
        id: "support-ticket",
        category: CATEGORY.support,
        question: { TR: "Ekibe nasıl destek talebi gönderirim?", EN: "How do I send a support ticket to the team?" },
        answer: {
            TR: "Bu sayfadaki Talep oluştur bölümünde altı kategoriden birini seçin: Şikayet, İstek (KVKK başvuruları dahil), Güvenlik Açığı, Ban Kaldırma İsteği, Soru ya da Geri Bildirim. Ardından başlık ve açıklama yazıp gönderin. Talepler herkese açık panoda görünmez; yalnızca siz ve Hanogt ekibi görürsünüz. Taleplerim listesinde durumu (Açık, İnceleniyor, Yanıtlandı, Çözüldü, Kapatıldı) izleyebilir, ekibin yanıtlarını okuyup ek mesaj yazabilir, talebi kapatabilir veya yeniden açabilirsiniz. Talep göndermek için giriş yapmanız gerekir.",
            EN: "Pick one of the six categories under Create a ticket on this page: Complaint, Request (including KVKK requests), Security vulnerability, Unban request, Question or Feedback. Then write a title and a description and send it. Tickets never appear on the public board: only you and the Hanogt team can see them. In My tickets you can follow the status (Open, In review, Answered, Resolved, Closed), read the team's replies, write back, and close or reopen the ticket. You need to be signed in to send one.",
        },
    },
    {
        id: "support-reply",
        category: CATEGORY.support,
        question: { TR: "Talebime yanıt geldiğini nasıl anlarım?", EN: "How do I know the team replied to my ticket?" },
        answer: {
            TR: "Ekip yanıt verdiğinde talep Yanıtlandı durumuna geçer ve Taleplerim listesinde \"Yeni yanıt\" işareti görünür. Bir talebin bağlantısını (/feedback?ticket=…) açtığınızda konuşma doğrudan açılır. Ekip yanıtları kişisel bir hesap adıyla değil, \"Hanogt Ekibi\" adıyla gösterilir. Sorun sürüyorsa aynı talebe yazmaya devam edin; çözülen ya da kapatılan bir talebi yeniden açabilirsiniz.",
            EN: "When the team replies, the ticket switches to Answered and a \"New reply\" marker appears in My tickets. Opening a ticket's link (/feedback?ticket=…) takes you straight to the conversation. Replies are shown as \"Hanogt Team\", never under a staff member's personal account. If the problem persists, keep writing in the same ticket; resolved or closed tickets can be reopened.",
        },
    },
    {
        id: "security-report",
        category: CATEGORY.support,
        question: { TR: "Bir güvenlik açığını nasıl bildiririm?", EN: "How do I report a security vulnerability?" },
        answer: {
            TR: "Talep oluştur bölümünde Güvenlik Açığı kategorisini seçin, isterseniz önem derecesini belirtin ve yeniden üretme adımlarını yazın. Bu talepler yalnızca ekibe gider, yüksek öncelikle incelenir ve size özel olarak yanıt verilir. Sorumlu açıklama için: açığı herkese açık panoda ya da başka bir yerde yayımlamayın, yalnızca kendi hesabınızla test edin, başkalarının verilerine erişmeyin ve hizmeti aksatacak denemeler (DoS, spam) yapmayın. Gerçek parola, API anahtarı ya da kişisel veri eklemeyin.",
            EN: "Choose the Security vulnerability category under Create a ticket, optionally set the severity, and write the steps to reproduce it. These tickets go to the team only, are reviewed with high priority and are answered privately. For responsible disclosure: don't publish the issue on the public board or anywhere else, test only with your own account, don't access other people's data and don't run tests that disrupt the service (DoS, spam). Don't include real passwords, API keys or personal data.",
        },
    },
    {
        id: "bug-report",
        category: CATEGORY.support,
        question: { TR: "İyi bir hata bildirimi nasıl yazılır?", EN: "How do I write a good bug report?" },
        answer: {
            TR: "Şikayet kategorisini seçip konu olarak \"Hizmet / site\" seçeneğini işaretleyin. Açıklamaya ne beklediğinizi, ne olduğunu ve hatayı yeniden üretme adımlarını sırayla yazın; hatanın göründüğü sayfanın adresini İçerik bağlantısı alanına ekleyebilirsiniz. \"Teknik bilgileri ekle\" kutusunu işaretlerseniz tarayıcı bilginiz (user agent) ve geldiğiniz sayfa da talebe eklenir; bu bilgileri yalnızca ekip görür. Ekran görüntüsü yerine hata mesajının metnini yapıştırmak çoğu zaman daha hızlı çözüm sağlar.",
            EN: "Choose the Complaint category and pick \"Service / site\" as the subject. In the description, write what you expected, what happened and the steps to reproduce it in order; you can put the address of the page where it happens in the Link to the content field. If you tick \"Add technical details\", your browser information (user agent) and the page you came from are attached too; only the team can see them. Pasting the error message as text often gets a faster fix than a screenshot.",
        },
    },
    {
        id: "complaint",
        category: CATEGORY.support,
        question: { TR: "Bir kullanıcıyı ya da içeriği nasıl şikayet ederim?", EN: "How do I complain about a user or content?" },
        answer: {
            TR: "Talep oluştur bölümünde Şikayet kategorisini seçin. İsterseniz şikayetin konusunu (kullanıcı, içerik, grup, hizmet / site ya da diğer), şikayet ettiğiniz kullanıcının adını ve içeriğin bağlantısını ekleyin; ne olduğunu ve ne zaman olduğunu açıklamaya yazın. Şikayetler herkese açık panoda görünmez; talebi yalnızca siz ve ekip görürsünüz. Ekip şikayeti inceler ve yanıtını Taleplerim'de bulursunuz.",
            EN: "Choose the Complaint category under Create a ticket. If you like, add what it's about (a user, content, a group, the service / site or something else), the name of the user you're complaining about and a link to the content; describe what happened and when. Complaints never appear on the public board: only you and the team can see the ticket. The team reviews it, and you'll find the reply under My tickets.",
        },
    },
    {
        id: "unban",
        category: CATEGORY.support,
        question: { TR: "Bir yasağın kaldırılmasını nasıl isterim?", EN: "How do I ask for a ban to be lifted?" },
        answer: {
            TR: "Talep oluştur bölümünde Ban Kaldırma İsteği kategorisini seçin, neyden yasaklandığınızı (hesap, grup ya da diğer) işaretleyin, grup yasağında grubun adını yazın ve yasağın neden kaldırılması gerektiğini açıklayın. Bu talepler yüksek öncelikle incelenir. Hesabınız askıya alındıysa giriş yapamazsınız: giriş sayfasında hesabınızla giriş yapmayı denediğinizde itiraz formu açılır. Hesabın size ait olduğunu şifrenizle (açıksa iki adımlı doğrulamayla birlikte) ya da Google ile kanıtladıktan sonra itirazınız aynı kategoride ekibe ulaşır; hesabınız yeniden açılırsa yanıtı Taleplerim'de görürsünüz.",
            EN: "Choose the Unban request category under Create a ticket, mark what you were banned from (account, group or other), give the group's name for a group ban and explain why the ban should be lifted. These tickets are reviewed with high priority. If your account is suspended you can't sign in: the appeal form opens on the sign-in page when you try to sign in with your account. Once you prove the account is yours with its password (plus two-step verification, if enabled) or with Google, your appeal reaches the team in the same category; if the account is reinstated, you'll find the reply under My tickets.",
        },
    },
    {
        id: "board",
        category: CATEGORY.support,
        question: { TR: "Topluluk panosu ile destek talebi arasındaki fark nedir?", EN: "What's the difference between the community board and a support ticket?" },
        answer: {
            TR: "Topluluk panosundaki sorular ve geri bildirimler herkese açıktır: herkes okuyabilir, giriş yapan kullanıcılar beğenip yorum yazabilir ve ekip resmî yanıt verebilir. Hesap sorunları, şikayetler, ban kaldırma istekleri, kişisel bilgiler, KVKK başvuruları ve güvenlik açıkları içinse yalnızca sizin ve ekibin gördüğü destek talebini kullanın.",
            EN: "Questions and feedback on the community board are public: anyone can read them, signed-in users can like and comment, and the team can reply officially. For account problems, complaints, unban requests, personal information, KVKK requests and security vulnerabilities, use a support ticket, which only you and the team can see.",
        },
    },
    {
        id: "password",
        category: CATEGORY.account,
        question: { TR: "Parolam nasıl korunuyor?", EN: "How is my password protected?" },
        answer: {
            TR: "Parolanın açık hâli saklanmaz. Sunucuda benzersiz tuz ve scrypt ile tek yönlü karma üretilir; kimlik bilgileri profil verilerinden ayrı tutulur.",
            EN: "Your password is never stored in plain text. The server derives a one-way scrypt hash with a unique salt, and credentials are kept apart from profile data.",
        },
    },
    {
        id: "two-factor",
        category: CATEGORY.account,
        question: { TR: "İki adımlı doğrulamayı nasıl açarım?", EN: "How do I turn on two-step verification?" },
        answer: {
            TR: "Hesap Ayarları > Güvenlik bölümünde iki adımlı doğrulamayı açın: QR kodu bir doğrulama uygulamasıyla (Google Authenticator, Microsoft Authenticator, Authy vb.) okutun ve uygulamanın ürettiği 6 haneli kodla onaylayın. Ardından 10 tek kullanımlık kurtarma kodu verilir; bunları güvenli bir yere kaydedin. Bundan sonra e-posta ve şifreyle girişte bu kod da istenir. Google ile giriş yapan hesaplar Google'ın kendi iki adımlı doğrulamasıyla korunur. Doğrulama uygulamanızı ve kurtarma kodlarınızı kaybederseniz, oturumunuzun hâlâ açık olduğu bir cihazdan İstek kategorisinde destek talebi açın; kimliğiniz doğrulandıktan sonra ekip iki adımlı doğrulamayı sıfırlayabilir.",
            EN: "Turn on two-step verification in Account Settings > Security: scan the QR code with an authenticator app (Google Authenticator, Microsoft Authenticator, Authy and so on) and confirm with the 6-digit code it shows. You then get 10 single-use recovery codes; keep them somewhere safe. From then on, signing in with e-mail and password also asks for the code. Accounts that sign in with Google are protected by Google's own two-step verification. If you lose both your authenticator and your recovery codes, open a support ticket in the Request category from a device where you're still signed in; once your identity is verified, the team can reset two-step verification.",
        },
    },
    {
        id: "bot",
        category: CATEGORY.account,
        question: { TR: "Security Bot hesabımı otomatik olarak kalıcı engeller mi?", EN: "Will Security Bot ban my account automatically?" },
        answer: {
            TR: "Hayır. Yüksek riskli istek anlık olarak durdurulur ve asgari kayıt oluşturulur. Kalıcı yaptırım otomatik regex sonucuyla verilmez; inceleme ve itiraz yolu vardır. Otomatik bir karara itiraz etmek için İstek kategorisinde, size bir yasak uygulandıysa Ban Kaldırma İsteği kategorisinde destek talebi açabilirsiniz; hesabınız askıya alındıysa giriş sayfasındaki itiraz formunu kullanın.",
            EN: "No. A high-risk request is stopped on the spot with a minimal log entry. Permanent action is never taken from an automatic pattern match; there is a review and appeal path. To object to an automated decision, open a support ticket in the Request category; if you were banned, use the Unban request category, and if your account is suspended, use the appeal form on the sign-in page.",
        },
    },
    {
        id: "plans-included",
        category: CATEGORY.billing,
        question: { TR: "Plus ve Pro planlarında neler var?", EN: "What do the Plus and Pro plans include?" },
        answer: {
            TR: "Hanogt Codev'in tamamı Ücretsiz planda kullanılabilir; Plus ve Pro daha yüksek sınırlar ve öncelik getirir: Hanogt AI ile günde {aiFree} yerine Plus'ta {aiPlus}, Pro'da {aiPro} mesaj; Ücretsiz plandaki {codeFree} kod ve {gameFree} oyun projesi yerine Plus'ta {codePlus} kod ve {gamePlus} oyun projesi, Pro'da sınırsız proje; Hanogt AI'a kendi API anahtarınızla Plus'ta en fazla {connectionsPlus}, Pro'da {connectionsPro} yapay zekâ sağlayıcısı bağlama ve destek taleplerinde öncelik. “Planlanıyor” olarak işaretli özellikler henüz sunulmaz. Güncel liste ve fiyatlar Planlar sayfasındadır (/plans).",
            EN: "All of Hanogt Codev is available on the Free plan; Plus and Pro add higher limits and priority: {aiPlus} (Plus) or {aiPro} (Pro) Hanogt AI messages a day instead of {aiFree}; {codePlus} code and {gamePlus} game projects on Plus and unlimited projects on Pro, instead of {codeFree} and {gameFree} on Free; up to {connectionsPlus} (Plus) or {connectionsPro} (Pro) AI providers connected to Hanogt AI with your own API keys; and priority on support tickets. Features marked “Planned” aren't offered yet. The current list and prices are on the Plans page (/plans).",
            vars: PLAN_NUMBERS,
        },
    },
    {
        id: "plans-buy",
        category: CATEGORY.billing,
        question: { TR: "Bir planı nasıl satın alırım?", EN: "How do I buy a plan?" },
        answer: {
            TR: "Giriş yapın, Planlar sayfasında (/plans) aylık veya yıllık ödemeyi seçin ve planın satın alma düğmesine basın. Ödeme ekranı Paddle'ın güvenli penceresinde açılır. Ödeme tamamlanınca planınız genellikle birkaç saniye içinde etkinleşir ve uygulama içi bir bildirim alırsınız; açılmazsa Fiyatlandırma sayfasındaki “Ödememi kontrol et”e basın, ödemeniz Paddle'dan doğrulanıp planınız açılır (yeniden ödeme yapmayın). Bir planda fiyat ya da satın alma düğmesi görünmüyorsa o plan henüz satışta değildir; “Açılınca haber ver” ile haber alabilirsiniz.",
            EN: "Sign in, choose monthly or yearly billing on the Plans page (/plans) and press the plan's buy button. The checkout opens in Paddle's secure window. Once the payment is complete, your plan is usually active within seconds and you get an in-app notification; if it isn't, press “Check my payment” on the Pricing page and your payment is confirmed with Paddle and the plan unlocked (don't pay again). If a plan shows no price or buy button, it isn't on sale yet; press “Notify me when it opens” to hear when it is.",
        },
    },
    {
        id: "plans-payment",
        category: CATEGORY.billing,
        question: { TR: "Ödemeyi kim alıyor, hangi ödeme yöntemlerini kullanabilirim?", EN: "Who takes the payment, and which payment methods can I use?" },
        answer: {
            TR: "Ödemeleri Kayıtlı Satıcımız (Merchant of Record) Paddle.com alır; kart bilgileriniz Hanogt Codev'e hiç ulaşmaz. Kullanabileceğiniz yöntemler ödeme ekranında listelenir ve ülkenize göre değişir (ör. banka ve kredi kartları, PayPal, Apple Pay veya Google Pay). KDV gibi vergiler bulunduğunuz ülkeye göre Paddle tarafından hesaplanır ve ödemeden önce toplam tutarla birlikte gösterilir. Ödemeler ABD doları (USD) cinsinden alınır; kartınız başka bir para birimindeyse bankanız tutarı çevirir ve kur farkı ya da masraf yansıtabilir.",
            EN: "Payments are taken by Paddle.com, our Merchant of Record; your card details never reach Hanogt Codev. The methods available to you are listed at checkout and depend on your country (for example debit and credit cards, PayPal, Apple Pay or Google Pay). Taxes such as VAT are calculated by Paddle for your country and shown with the total before you pay. Payments are taken in US dollars (USD); if your card is in another currency, your bank converts the amount and may pass on exchange-rate differences or fees.",
        },
    },
    {
        id: "plans-invoice",
        category: CATEGORY.billing,
        question: { TR: "Faturamı veya makbuzumu nereden alırım?", EN: "Where do I get my invoice or receipt?" },
        answer: {
            TR: "Her ödemeden sonra Paddle, satın alırken kullandığınız e-posta adresine bir makbuz gönderir. Faturalarınızı ve ödeme geçmişinizi Planlar sayfasındaki “Aboneliği yönet” düğmesiyle açılan Paddle müşteri portalından indirebilirsiniz; şirket adı veya vergi numarası gibi fatura bilgilerini ödeme ekranında ekleyebilirsiniz. Satıcı Paddle olduğu için faturayı Paddle düzenler; banka ekstrenizde ödeme genellikle “PADDLE.NET” ile başlayan bir açıklamayla görünür.",
            EN: "After every payment, Paddle e-mails a receipt to the address you used for the purchase. You can download your invoices and payment history in Paddle's customer portal, which opens with the “Manage subscription” button on the Plans page; invoice details such as a company name or tax number can be added at checkout. Because Paddle is the seller, Paddle issues the invoice; on your bank statement the payment usually appears with a description starting with “PADDLE.NET”.",
        },
    },
    {
        id: "plans-cancel",
        category: CATEGORY.billing,
        question: { TR: "Aboneliğimi nasıl iptal ederim?", EN: "How do I cancel my subscription?" },
        answer: {
            TR: "Planlar sayfasında “Aboneliği yönet”e basın ve Paddle'ın müşteri portalında aboneliğinizi iptal edin; isterseniz paddle.net üzerinden de iptal edebilirsiniz. İptal, ödediğiniz dönemin sonunda geçerli olur: o güne kadar avantajlarınız sürer, sonra Ücretsiz plana geçersiniz ve yeniden ücret alınmaz. Dönem bitmeden fikrinizi değiştirirseniz iptali Planlar sayfasından geri alabilirsiniz. Projeleriniz ve verileriniz silinmez.",
            EN: "Press “Manage subscription” on the Plans page and cancel your subscription in Paddle's customer portal; you can also cancel at paddle.net. Cancellation takes effect at the end of the period you paid for: your benefits last until then, after which you move to the Free plan and aren't charged again. If you change your mind before the period ends, you can undo the cancellation on the Plans page. Your projects and data aren't deleted.",
        },
    },
    {
        id: "plans-refund",
        category: CATEGORY.billing,
        question: { TR: "İade alabilir miyim?", EN: "Can I get a refund?" },
        answer: {
            TR: "Evet. Bir aboneliğin ilk ödemesinden sonraki 14 gün içinde, gerekçe göstermeden tam iade isteyebilirsiniz. Yenileme ödemeleri; iptaliniz işlenmediği hâlde ya da hatayla alındıysa veya bizden kaynaklanan bir sorun yüzünden planı kullanamadıysanız, ödemeden sonraki 14 gün içinde iade edilir. İadeyi paddle.net üzerinden veya İstek kategorisinde destek talebiyle isteyebilirsiniz; Paddle tutarı ödemenin yapıldığı yönteme iade eder ve tutar genellikle 5–10 iş günü içinde hesabınıza geçer. Ayrıntılar İade Politikası'ndadır (/refund-policy).",
            EN: "Yes. Within 14 days of a subscription's first payment you can ask for a full refund without giving a reason. Renewal payments are refunded if you ask within 14 days of the payment and it was charged even though your cancellation wasn't processed, was charged by mistake, or you couldn't use the plan because of a problem caused by us. Ask at paddle.net or with a support ticket in the Request category; Paddle refunds the original payment method and the money usually reaches you within 5–10 business days. The details are in the Refund Policy (/refund-policy).",
        },
    },
    {
        id: "plans-change",
        category: CATEGORY.billing,
        question: { TR: "Planımı veya ödeme dönemimi değiştirebilir miyim?", EN: "Can I change my plan or billing period?" },
        answer: {
            TR: "Evet. Planlar sayfasından Plus ile Pro arasında ya da aylık ile yıllık ödeme arasında geçebilirsiniz. Ücret, dönemin kalan süresi için orantılı hesaplanır: değişiklik ek ödeme gerektiriyorsa fark hemen tahsil edilir, lehinize bir tutar kalırsa Paddle'da kredi olarak sonraki ödemelerinizden düşülür. Onaylamadan önce tutar gösterilir ve yeni planın avantajları hemen başlar.",
            EN: "Yes. On the Plans page you can switch between Plus and Pro, or between monthly and yearly billing. The fee is prorated for the rest of the period: if the change costs more, the difference is charged right away; if an amount is left in your favour, it becomes a credit at Paddle that is taken off your next payments. The amount is shown before you confirm, and the new plan's benefits start immediately.",
        },
    },
    {
        id: "plans-coupon",
        category: CATEGORY.billing,
        question: { TR: "Kupon (indirim) kodumu nerede kullanırım?", EN: "Where do I use a coupon (discount) code?" },
        answer: {
            TR: "Fiyatlandırma sayfasında “Kupon kodun var mı?”ya basıp kodunuzu yazın ve Uygula'ya basın: indirimli tutar planın üzerinde, ödeme ekranında da indirim olarak görünür. Kodu ödeme ekranındaki “İndirim ekle” ile de girebilirsiniz. Kodun hangi planlarda ve kaç ödeme için (yalnızca ilk ödeme, her ödeme ya da ilk birkaç ödeme) geçerli olduğu kod uygulanınca yazılır. Kod, ödeme tamamlanmadan önce girilmelidir; kuponlar yeni aboneliklerde geçerlidir, mevcut aboneliğe ya da plan değişikliğine uygulanmaz.",
            EN: "On the Pricing page, press “Have a coupon code?”, enter your code and press Apply: the discounted amount shows on the plan and as a discount at checkout. You can also enter the code with “Add discount” at checkout. Which plans the code works for and for how many payments (the first only, every payment or the first few) is shown once it's applied. The code must be entered before the payment is completed; coupons apply to new subscriptions, not to an existing one or to plan changes.",
        },
    },
    {
        id: "plans-failed-payment",
        category: CATEGORY.billing,
        question: { TR: "Ödemem alınamazsa ne olur?", EN: "What happens if a payment fails?" },
        answer: {
            TR: "Paddle ödemeyi bir süre boyunca yeniden dener ve size e-posta gönderir; biz de uygulama içinde bildiririz. Bu sürede plan avantajlarınız devam eder. Planlar sayfasındaki “Ödeme yöntemini güncelle” ya da “Aboneliği yönet” ile kartınızı güncelleyebilirsiniz. Denemelerin hiçbiri başarılı olmazsa abonelik sona erer ve Ücretsiz plana geçersiniz; verileriniz silinmez.",
            EN: "Paddle retries the payment for a while and e-mails you, and we notify you in the app. Your plan benefits continue meanwhile. You can update your card with “Update payment method” or “Manage subscription” on the Plans page. If none of the retries succeeds, the subscription ends and you move to the Free plan; your data isn't deleted.",
        },
    },
    {
        id: "plans-account-deletion",
        category: CATEGORY.billing,
        question: { TR: "Hesabımı silersem aboneliğime ne olur?", EN: "What happens to my subscription if I delete my account?" },
        answer: {
            TR: "Etkin aboneliğiniz hemen iptal edilir ve kalan süre için kendiliğinden iade yapılmaz. İlk ödemeden sonraki 14 gün içindeyseniz önce iade isteyin; hesap silindikten sonra da paddle.net üzerinden, satın alırken kullandığınız e-posta adresiyle başvurabilirsiniz.",
            EN: "Your active subscription is cancelled immediately and no refund is made automatically for the remaining time. If you are within 14 days of the first payment, ask for a refund first; after the account is deleted, you can still apply at paddle.net with the e-mail address you used for the purchase.",
        },
    },
    {
        id: "runner",
        category: CATEGORY.code,
        question: { TR: "Kodum nerede çalıştırılıyor?", EN: "Where does my code run?" },
        answer: {
            TR: "JavaScript, TypeScript, Python, SQL (SQLite), Lua, Scheme, Brainfuck, Prolog, Forth, BASIC, Befunge, Whitespace ve MIPS doğrudan tarayıcınızda, ayrı bir Web Worker içinde çalışır; YAML, TOML, XML, INI, .env, CSV ve JSON dosyaları da tarayıcıda doğrulanır, SVG, Mermaid ve LaTeX tarayıcıda önizlenir. Bu kod hiçbir sunucuya gitmez ve giriş gerektirmez. Derlenen diller (C, C++, C#, Java, Go, Rust ve diğerleri) giriş yaptığınızda, Hanogt Security taramasından sonra Hanogt sunucusunda değil, izole bir derleyici hizmetinde (yöneticinin kendi çalıştırıcısı ya da herkese açık Wandbox) çalıştırılır.",
            EN: "JavaScript, TypeScript, Python, SQL (SQLite), Lua, Scheme, Brainfuck, Prolog, Forth, BASIC, Befunge, Whitespace and MIPS run right in your browser, inside a separate Web Worker; YAML, TOML, XML, INI, .env, CSV and JSON files are validated there too, and SVG, Mermaid and LaTeX are previewed in the browser. That code never reaches a server and needs no sign-in. Compiled languages (C, C++, C#, Java, Go, Rust and more) run when you are signed in: they are screened by Hanogt Security and then run in an isolated compiler service (the operator's own runner or the public Wandbox), never on Hanogt's servers.",
        },
    },
    {
        id: "code-languages",
        category: CATEGORY.code,
        question: { TR: "Hangi programlama dillerini kullanabilirim?", EN: "Which programming languages can I use?" },
        answer: {
            TR: "Kod editörü düz metin dahil {total} dili tanır ve {highlighted} tanesini sözdizimi vurgulamasıyla gösterir. Bunların {usable} tanesini çalıştırabilir ya da önizleyebilirsiniz: {runnable} dil çalışır ({browser} tanesi doğrudan tarayıcınızda, {server} tanesi izole derleyici hizmetinde) ve {preview} dil (HTML, CSS, Markdown) canlı önizlemede görüntülenir. Geri kalanlar (ör. YAML, TOML, Dockerfile, Dart, Solidity) vurgulamayla düzenlenebilir.",
            EN: "The code editor knows {total} languages including plain text and highlights the syntax of {highlighted} of them. You can run or preview {usable} of them: {runnable} languages run ({browser} right in your browser, {server} on the isolated compiler service) and {preview} (HTML, CSS, Markdown) render in the live preview. The rest (such as YAML, TOML, Dockerfile, Dart and Solidity) can be edited with highlighting.",
            vars: LANGUAGE_COUNTS,
        },
    },
    {
        id: "files",
        category: CATEGORY.code,
        question: { TR: "Çoklu dosya projeleri gerçekten ayrı mı saklanıyor?", EN: "Are multi-file projects really stored as separate files?" },
        answer: {
            TR: "Evet. Proje meta verisi ile her dosya ayrı Firestore alt belgesinde tutulur; düzenleyicideki sekmeler tek bir JSON alanına sıkıştırılmaz.",
            EN: "Yes. Project metadata and every file are kept in separate Firestore sub-documents; editor tabs aren't squeezed into a single JSON field.",
        },
    },
    {
        id: "media-publish",
        category: CATEGORY.code,
        question: { TR: "Kodumu editörden Hanogt Media'da nasıl yayınlarım?", EN: "How do I publish my code to Hanogt Media from the editor?" },
        answer: {
            TR: "Kod Editörü'nde projeniz açıkken yayınlama penceresini açın (Hanogt Media'da yayınla). Paylaşmak istediğiniz dosyaları (en fazla 50) seçin; başlık, açıklama, en fazla 6 etiket ve lisans (Tüm hakları saklıdır, MIT, Apache-2.0 veya GPL-3.0) belirleyin. Kod yayınlanmadan önce Hanogt Security taramasından geçer; tehlikeli bulunan kod yayınlanmaz. Yayınlanan projeler herkese açıktır ve indirilebilir; dilediğiniz zaman güncelleyebilir ya da kaldırabilirsiniz.",
            EN: "With your project open in the Code Editor, open the publish dialog (Publish to Hanogt Media). Pick the files to share (up to 50) and set a title, a description, up to 6 tags and a license (All rights reserved, MIT, Apache-2.0 or GPL-3.0). The code goes through a Hanogt Security scan first; code found to be dangerous isn't published. Published projects are public and can be downloaded; you can update or remove them whenever you like.",
        },
    },
    {
        id: "ai",
        category: CATEGORY.ai,
        question: { TR: "Hanogt AI nedir, mesajlarım nereye gider?", EN: "What is Hanogt AI and where do my messages go?" },
        answer: {
            TR: "Hanogt AI sitenin yapay zeka asistanıdır; Genel, Kod ve Güvenlik modları vardır. Giriş yaptığınızda sorularınız, sunucuda yapılandırılmış büyük dil modeline Hanogt bilgi tabanından seçilen notlarla birlikte gönderilir; sohbetleriniz bizim sunucularımızda saklanmaz. Giriş yapmadıysanız ya da model kullanılamıyorsa cihazınızda çalışan eğitilmiş Hanogt AI Çekirdeği yanıt verir ve hiçbir şey gönderilmez.",
            EN: "Hanogt AI is the site's AI assistant, with General, Code and Security modes. When you are signed in, your questions go to the large language model configured on the server, together with notes picked from the Hanogt knowledge base; your chats aren't stored on our servers. When you are signed out or the model is unavailable, the trained Hanogt AI Core answers on your device and nothing is sent.",
        },
    },
    {
        id: "ai-agent",
        category: CATEGORY.ai,
        question: { TR: "Hanogt AI'ın ajan modu ne yapar?", EN: "What does Hanogt AI's agent mode do?" },
        answer: {
            TR: "Ajan modunda Hanogt AI yalnızca yanıt vermekle kalmaz, sizin için adım atabilir: sitede arama yapar, sayfaları açar, yazdığı kodu Kod Editörü'nde açar, izin verirseniz profil bilgilerinizi okur ve onayladığınızda yeni bir grup ya da oyun projesi oluşturur. Hesabınızda bir şey oluşturan her işlemden önce bir onay kartı gösterilir ve işlemler tarayıcınızda kendi oturumunuzla çalışır. Silme, şifre ya da iki adımlı doğrulama değişikliği, yönetici işleri ve başkalarına mesaj gönderme gibi işlemleri ajan hiçbir zaman yapmaz.",
            EN: "In agent mode Hanogt AI doesn't just answer, it can take steps for you: it searches the site, opens pages, opens the code it wrote in the Code Editor, reads your profile if you allow it and creates a new group or game project once you approve. Every action that creates something on your account shows a confirmation card first, and actions run in your browser with your own session. The agent never deletes anything, changes passwords or two-step verification, does admin work or messages other people.",
        },
    },
    {
        id: "engine",
        category: CATEGORY.engine,
        question: { TR: "Oyun scriptlerim nerede çalışıyor?", EN: "Where do my game scripts run?" },
        answer: {
            TR: "C# ve C++ scriptleri tarayıcınızdaki HanogtScript sanal makinesinde yorumlanır; eval kullanılmaz, scriptler yalnızca motor API'lerine erişebilir ve sonsuz döngüler komut bütçesiyle durdurulur.",
            EN: "C# and C++ scripts are interpreted by the HanogtScript virtual machine in your browser. Nothing is eval'd, scripts can only reach engine APIs, and infinite loops are stopped by an instruction budget.",
        },
    },
    {
        id: "engine-v3",
        category: CATEGORY.engine,
        question: { TR: "Hanogt Engine V3'te neler var?", EN: "What's new in Hanogt Engine V3?" },
        answer: {
            TR: "Hanogt Engine V3 sprite sayfaları ve kare seçimi, karo haritaları (tilemap), yumuşatma eğrili anahtar kare animasyonları ve düğme, panel ve ilerleme çubuğu gibi ekran arayüzü bileşenleri getiriyor. Önceki sürümlerle kaydedilen projeler açıldığında otomatik olarak V3'e taşınır; mevcut ayarlarınız korunur ve yeni alanlar varsayılan değerleriyle eklenir.",
            EN: "Hanogt Engine V3 brings sprite sheets with frame selection, tilemaps, keyframe animation with easing curves and on-screen UI components such as buttons, panels and progress bars. Projects saved with earlier versions are moved to V3 automatically when you open them; your settings are kept and the new fields get their defaults.",
        },
    },
    {
        id: "arcade",
        category: CATEGORY.engine,
        question: { TR: "Oyunumu Arcade'de nasıl yayınlarım?", EN: "How do I publish my game on the Arcade?" },
        answer: {
            TR: "Oyun motorunda Yayınla düğmesine basın. Oyun derlenir ve güvenlik taramasından geçer; yayınlanan oyunlar Arcade'de herkese açıktır, oynanabilir ve beğenilebilir; yayınlarken “Remikslemelere izin ver” seçeneğini açarsanız başkaları da kopyasını düzenleyebilir. Oyununuzu istediğiniz zaman yayından kaldırabilirsiniz.",
            EN: "Press Publish in the game engine. The game is compiled and goes through a security scan; published games are public on the Arcade, where people can play and like them; if you turn on “Allow remixes” when publishing, others can edit a copy too. You can take your game down any time.",
        },
    },
    {
        id: "groups",
        category: CATEGORY.community,
        question: { TR: "Grup nasıl kurarım ve arkadaşlarımı nasıl davet ederim?", EN: "How do I create a group and invite friends?" },
        answer: {
            TR: "Gruplar sayfasında Yeni grup'a basın ve üç adımlı sihirbazda bir şablon seçin (boş, çalışma grubu, oyun geliştirme, açık kaynak, sınıf, hackathon). Grup başlangıç dosyaları, kurallar ve sabitlenmiş bir karşılama mesajıyla açılır. Arkadaşlarınızı doğrudan davet edebilir ya da süreli, kullanım sınırlı ve istediğiniz an iptal edebileceğiniz bir davet bağlantısı paylaşabilirsiniz. Grup sohbetinde sabitleme, tepkiler, @bahsetme ve arama; dosyalarda yeniden adlandırma, ZIP indirme ve editörde açma vardır.",
            EN: "Press New group on the Groups page and pick a template in the three-step wizard (blank, study group, game dev, open source, classroom, hackathon). The group opens with starter files, rules and a pinned welcome message. Invite friends directly or share an invite link that expires, has a usage limit and can be revoked any time. Group chat has pins, reactions, @mentions and search; files can be renamed, downloaded as a ZIP and opened in the editor.",
        },
    },
    {
        id: "calls",
        category: CATEGORY.community,
        question: { TR: "Sesli aramalar kaydediliyor mu?", EN: "Are voice calls recorded?" },
        answer: {
            TR: "Hayır. WebRTC arama sesi kaydedilmez. Geçici SDP/ICE bağlantı belgeleri görüşme bitince silinir ve kısa süreli sona erme bilgisi taşır.",
            EN: "No. WebRTC call audio is never recorded. Temporary SDP/ICE connection documents are deleted when the call ends and carry a short expiry.",
        },
    },
    {
        id: "turn",
        category: CATEGORY.community,
        question: { TR: "Arama neden bazı ağlarda bağlanmıyor?", EN: "Why don't calls connect on some networks?" },
        answer: {
            TR: "Kurumsal ağlar ve sıkı NAT yapıları TURN sunucusu gerektirebilir. Yönetici TURN yapılandırmasını tamamlamadıysa uygulama bunu arama ekranında açıkça belirtir.",
            EN: "Corporate networks and strict NATs may need a TURN server. If the operator hasn't configured one, the call screen says so.",
        },
    },
    {
        id: "voice",
        category: CATEGORY.community,
        question: { TR: "Sesli mesajlar nasıl saklanıyor?", EN: "How are voice messages stored?" },
        answer: {
            TR: "Kayıt, mesajla birlikte yalnızca sunucunun erişebildiği ayrı bir veritabanı koleksiyonunda saklanır; tarayıcılar ona doğrudan ulaşamaz. Sunucu her dinlemede sohbetin ya da grubun üyesi olduğunu kontrol eder. Mesaj, sohbet, grup ya da hesap silinince kayıt da silinir.",
            EN: "The recording is kept with its message in a separate database collection only the server can reach; browsers can't read it directly. Every time it's played, the server checks that you belong to the chat or group. Deleting the message, chat, group or account deletes the recording too.",
        },
    },
    {
        id: "data",
        category: CATEGORY.privacy,
        question: { TR: "Verilerimi nasıl indirebilir veya silebilirim?", EN: "How can I download or delete my data?" },
        answer: {
            TR: "Hesap Ayarları'ndaki \"Verilerimi indir\" ile hesabınız, projeleriniz, oyunlarınız ve paylaşımlarınız tek bir JSON dosyası olarak iner; kimlik bilgileri ve şifre özetleri dosyaya eklenmez. \"Hesabı sil\" hesabınızı ve size ait verileri (projeler, oyunlar, Media paylaşımları, mesajlar, grup üyelikleri, destek talepleri) kalıcı olarak siler; bu işlem geri alınamaz.",
            EN: "\"Download my data\" in Account Settings gives you your account, projects, games and posts as a single JSON file; credentials and password hashes are left out. \"Delete account\" permanently deletes your account and your data (projects, games, Media posts, messages, group memberships, support tickets); this can't be undone.",
        },
    },
    {
        id: "kvkk",
        category: CATEGORY.privacy,
        question: { TR: "KVKK kapsamındaki haklarımı nasıl kullanırım?", EN: "How do I exercise my rights under KVKK?" },
        answer: {
            TR: "KVKK'nın 11. maddesindeki haklarınız (bilgi alma, düzeltme, silme, itiraz vb.) için bu sayfada İstek kategorisinde bir destek talebi oluşturun ve hangi hakkınızı kullanmak istediğinizi yazın. Başvurunuz hesabınızın e-posta adresiyle doğrulanır, yalnızca ekip tarafından görülür ve en geç 30 gün içinde ücretsiz sonuçlandırılır. Verilerinizi indirmek ya da hesabınızı silmek için Hesap Ayarları'ndaki seçenekleri hemen kullanabilirsiniz.",
            EN: "For your rights under Article 11 of KVKK (Turkey's data protection law: access, correction, deletion, objection and so on), open a support ticket in the Request category on this page and say which right you want to exercise. Your request is verified with your account's e-mail address, is seen by the team only and is concluded free of charge within 30 days at the latest. To download your data or delete your account right away, use the options in Account Settings.",
        },
    },
    {
        id: "news",
        category: CATEGORY.news,
        question: { TR: "Hanogt News haberleri nereden geliyor?", EN: "Where does Hanogt News get its stories?" },
        answer: {
            TR: "Haberler güvenilir yayıncıların herkese açık RSS/Atom akışlarından toplanır; yalnızca başlık, kısa özet ve kaynağa bağlantı gösterilir. Yapay zeka sıralaması yalnızca topluluk oylarından hesaplanır.",
            EN: "Stories are collected from trusted publishers' public RSS/Atom feeds; only the headline, a short excerpt and a link to the source are shown. The AI leaderboard is computed from community votes only.",
        },
    },
    {
        id: "languages",
        category: CATEGORY.languages,
        question: { TR: "Arayüzü kendi dilimde kullanabilir miyim?", EN: "Can I use the interface in my language?" },
        answer: {
            TR: "Evet. Üst menüdeki dil seçiciden sağdan sola Arapça, Farsça, İbranice ve Urduca dahil 50 dil arasından seçim yapabilirsiniz. Yasal metinlerin bağlayıcı sürümü Türkçedir.",
            EN: "Yes. Pick one of 50 languages, including right-to-left Arabic, Persian, Hebrew and Urdu, from the language menu at the top. The Turkish version of the legal texts is the binding one.",
        },
    },
];
