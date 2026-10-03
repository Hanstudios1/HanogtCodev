"use client";

import {
    AlertTriangle,
    ArrowLeftRight,
    Bug,
    Building2,
    CheckCircle2,
    ClipboardCopy,
    CreditCard,
    ExternalLink,
    EyeOff,
    FlaskConical,
    Link2,
    ListChecks,
    PackagePlus,
    Radio,
    RefreshCw,
    Save,
    Sparkles,
    Store,
    Tags,
    Unlink,
    Webhook,
    X,
    XCircle,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { useI18n, type Copy } from "@/lib/i18n";
import { DEFAULT_BRAND, OPERATOR_LIMITS, isOperatorPublished } from "@/lib/legal-info";
import { BILLING_INTERVALS, PADDLE_STATUSES, currencyDigits, formatMoney, type BillingInterval, type BillingStep, type PaddleClientErrorStage, type PaddleEnvironment, type PaddleStatus } from "@/lib/paddle";
import { PAID_PLAN_IDS, PLAN_COPY, type PaidPlanId, type PlanCatalog } from "@/lib/plans";
import { adminPost, type ApiFailure } from "./api";
import { COMMON, PADDLE_ENVIRONMENT_COPY, PADDLE_STATUS_COPY } from "./copy";
import { formatDateTime, formatRelativeTime, useNow, type AdminResource } from "./hooks";
import type {
    AdminPaddleCatalogReport,
    AdminPaddleCatalogResponse,
    AdminPaddleClientError,
    AdminPaddleClientTokenCheck,
    AdminPaddlePrice,
    AdminPaddleResponse,
    AdminPaddleServerError,
    AdminPaddleUnlinked,
    AdminPaddleWarning,
} from "./types";
import { Badge, Button, ConfirmDialog, ErrorNotice, IconButton, INPUT_CLASS, LoadingRows, Notice, Panel, Switch, cx, useErrorText, useToast, type Tone } from "./ui";

const C = {
    // Connection
    title: { TR: "Paddle ile ödemeler", EN: "Payments with Paddle" },
    description: { TR: "Bağlantı, Paddle'a girilecek adresler ve kurulum", EN: "Connection, addresses for Paddle and setup" },
    sandboxNote: { TR: "Sandbox (test) anahtarları kullanılıyor: ödemeler test kartlarıyla yapılır, gerçek para çekilmez.", EN: "Sandbox (test) keys are in use: payments are made with test cards and no real money is charged." },
    liveNote: { TR: "Canlı anahtarlar kullanılıyor: ödemeler gerçek kartlardan tahsil edilir.", EN: "Live keys are in use: payments are charged to real cards." },
    apiKey: { TR: "API anahtarı", EN: "API key" },
    clientToken: { TR: "İstemci tarafı jeton", EN: "Client-side token" },
    webhookSecret: { TR: "Webhook gizli anahtarı", EN: "Webhook secret" },
    set: { TR: "Tanımlı", EN: "Set" },
    missing: { TR: "Eksik", EN: "Missing" },
    apiOk: { TR: "Paddle API yanıt veriyor; {count} etkin abonelik fiyatı bulundu.", EN: "The Paddle API answers; {count} active subscription prices found." },
    apiFailed: { TR: "Paddle API'ye ulaşılamadı.", EN: "Couldn't reach the Paddle API." },
    apiCode: { TR: "Hata kodu: {code}", EN: "Error code: {code}" },
    apiNoKey: { TR: "PADDLE_API_KEY tanımlı değil; fiyatlar okunamaz ve ödeme alınamaz.", EN: "PADDLE_API_KEY isn't set; prices can't be read and no payments can be taken." },
    apiUnauthorized: { TR: "API anahtarı geçersiz, iptal edilmiş ya da öbür ortama (Sandbox/Canlı) ait. Paddle'da Developer tools > Authentication bölümünden yeni bir anahtar oluşturun.", EN: "The API key is invalid, revoked or belongs to the other environment (sandbox/live). Create a new key under Developer tools > Authentication in Paddle." },
    apiForbidden: { TR: "API anahtarının bu işleme izni yok. Paddle'da anahtara ürünler, fiyatlar, müşteriler, abonelikler, işlemler ve indirimler için okuma ve yazma izni verin.", EN: "The API key isn't allowed to do this. In Paddle, give the key read and write access to products, prices, customers, subscriptions, transactions and discounts." },
    apiRateLimited: { TR: "Paddle'ın istek sınırına ulaşıldı; biraz sonra yenileyin.", EN: "Paddle's rate limit was reached; refresh in a moment." },
    apiNetwork: { TR: "Paddle'a bağlanılamadı (ağ hatası ya da zaman aşımı); biraz sonra yenileyin.", EN: "Couldn't connect to Paddle (network error or timeout); refresh in a moment." },
    apiServer: { TR: "Paddle geçici bir hata verdi; biraz sonra yenileyin.", EN: "Paddle had a temporary error; refresh in a moment." },
    apiOther: { TR: "Paddle isteği reddetti; ayrıntı hata kodunda.", EN: "Paddle refused the request; the error code has the details." },
    tokenActive: { TR: "İstemci tarafı jeton bu Paddle hesabında etkin; Paddle.js onunla başlayabilir.", EN: "The client-side token is active in this Paddle account; Paddle.js can start with it." },
    tokenActiveNamed: { TR: "İstemci tarafı jeton bu Paddle hesabında etkin ({name}); Paddle.js onunla başlayabilir.", EN: "The client-side token is active in this Paddle account ({name}); Paddle.js can start with it." },
    tokenRevoked: { TR: "Vercel'deki NEXT_PUBLIC_PADDLE_CLIENT_TOKEN Paddle'da iptal edilmiş; ödeme ekranı bu jetonla açılmaz. {env} hesabının Developer tools > Authentication sayfasından yeni bir istemci tarafı jeton (client-side token) oluşturup Vercel'e girin ve yeniden dağıtın.", EN: "NEXT_PUBLIC_PADDLE_CLIENT_TOKEN in Vercel has been revoked in Paddle; the checkout won't open with it. Create a new client-side token under Developer tools > Authentication in the {env} account, enter it in Vercel and redeploy." },
    tokenMissing: { TR: "Vercel'deki NEXT_PUBLIC_PADDLE_CLIENT_TOKEN bu Paddle hesabında yok: büyük olasılıkla başka bir Paddle hesabına ya da öbür ortama ait, bu yüzden ödeme ekranı açılamaz. API anahtarıyla aynı {env} hesabının Developer tools > Authentication sayfasından istemci tarafı jeton (client-side token) oluşturup Vercel'e girin ve yeniden dağıtın.", EN: "NEXT_PUBLIC_PADDLE_CLIENT_TOKEN in Vercel isn't in this Paddle account: it most likely belongs to another Paddle account or to the other environment, so the checkout can't open. Create a client-side token under Developer tools > Authentication in the same {env} account as the API key, enter it in Vercel and redeploy." },
    tokenNoPermission: { TR: "İstemci tarafı jeton denetlenemedi: API anahtarının client_token.read izni yok. Paddle'da Developer tools > Authentication bölümünde API anahtarına client_token.read iznini ekleyin.", EN: "The client-side token couldn't be checked: the API key doesn't have the client_token.read permission. Add client_token.read to the API key under Developer tools > Authentication in Paddle." },
    tokenError: { TR: "İstemci tarafı jeton denetlenemedi; Paddle bir hata döndürdü. Biraz sonra yenileyin.", EN: "The client-side token couldn't be checked; Paddle returned an error. Refresh in a moment." },
    tokenChecked: { TR: "Denetim: {time}", EN: "Checked {time}" },
    webhookLast: { TR: "Son bildirim {time} geldi ({type}).", EN: "The last notification arrived {time} ({type})." },
    webhookNone: { TR: "Henüz bildirim gelmedi.", EN: "No notification has arrived yet." },
    webhookNoSecret: { TR: "Webhook gizli anahtarı tanımlı olmadığı için bildirimler kabul edilmiyor.", EN: "Notifications are refused because the webhook secret isn't set." },
    webhookRejected: { TR: "Son reddedilen bildirim {time}: {reason}", EN: "Last refused delivery {time}: {reason}" },
    addresses: { TR: "Paddle'a verilecek adresler", EN: "Addresses to give Paddle" },
    webhookUrl: { TR: "Webhook adresi", EN: "Webhook URL" },
    webhookUrlHint: { TR: "Developer tools > Notifications > New destination: bu adresi girin, subscription.* olaylarının hepsini ve transaction.completed'ı seçin. Paddle'ın verdiği gizli anahtarı PADDLE_WEBHOOK_SECRET olarak kaydedin.", EN: "Developer tools > Notifications > New destination: enter this URL and select all subscription.* events and transaction.completed. Save the secret Paddle shows as PADDLE_WEBHOOK_SECRET." },
    paymentLink: { TR: "Varsayılan ödeme bağlantısı", EN: "Default payment link" },
    paymentLinkHint: { TR: "Checkout > Checkout settings > Default payment link alanına girin. Alan adının Paddle'da onaylanmış olması gerekir.", EN: "Enter it under Checkout > Checkout settings > Default payment link. Paddle has to approve the domain." },
    copyValue: { TR: "{name} kopyala", EN: "Copy {name}" },
    copied: { TR: "Panoya kopyalandı.", EN: "Copied to the clipboard." },
    copyFailed: { TR: "Panoya kopyalanamadı.", EN: "Couldn't copy to the clipboard." },
    setup: { TR: "Kurulum adımları", EN: "Setup steps" },
    step1: { TR: "Paddle'da Developer tools > Authentication bölümünden bir API anahtarı ve bir istemci tarafı jeton (client-side token) oluşturun. Sandbox ve canlı hesaplar ayrıdır; ikisini aynı hesaptan alın.", EN: "In Paddle, create an API key and a client-side token under Developer tools > Authentication. Sandbox and live are separate accounts; take both from the same one." },
    step2: { TR: "Vercel'de Settings > Environment Variables bölümüne şu değişkenleri ekleyin:", EN: "Add these variables in Vercel under Settings > Environment Variables:" },
    step3: { TR: "API anahtarını ve webhook gizli anahtarını asla NEXT_PUBLIC_ ile başlayan bir değişkene koymayın: o değişkenler her ziyaretçinin tarayıcısına gönderilir.", EN: "Never put the API key or the webhook secret in a variable starting with NEXT_PUBLIC_: those are sent to every visitor's browser." },
    step4: { TR: "Kaydettikten sonra yeniden dağıtın (Deployments > Redeploy); yeni değerler ancak yeni dağıtımda geçerli olur.", EN: "Redeploy after saving (Deployments > Redeploy); new values only apply to a new deployment." },
    step5: { TR: "Yukarıdaki adresleri Paddle'a girin, aşağıda fiyatları eşleyin ve Planlar ve fiyatlar bölümünde planları Görünür yapın.", EN: "Enter the addresses above in Paddle, map the prices below and make the plans Visible under Plans and prices." },
    varSecret: { TR: "gizli", EN: "secret" },
    varPublic: { TR: "tarayıcıya gider, gizli değil", EN: "sent to browsers, not secret" },
    varEnv: { TR: "isteğe bağlı: sandbox ya da production; ortam normalde anahtarlardan anlaşılır", EN: "optional: sandbox or production; normally the keys tell" },
    varTesters: { TR: "isteğe bağlı: satışlar kapalıyken satın alabilecek e-postalar (virgülle)", EN: "optional: e-mails that may buy while sales are closed (comma separated)" },

    // Sales and prices
    salesTitle: { TR: "Satış ve fiyatlar · {env}", EN: "Sales and prices · {env}" },
    salesDescription: { TR: "Buradaki her şey yalnızca {env} ortamı içindir", EN: "Everything here is for the {env} environment only" },
    mappingSandboxNote: { TR: "Bu eşleme yalnızca Sandbox içindir. Vercel'de anahtarları canlı olanlarla değiştirip yeniden dağıttığınızda canlı fiyatları ayrıca eşlemeniz gerekir: sandbox kimlikleri canlıda çalışmaz ve sandbox'taki test satın almaları canlıda hiçbir planı açmaz.", EN: "This mapping is for the sandbox only. When you replace the keys in Vercel with live ones and redeploy, map the live prices separately: sandbox IDs don't work live and sandbox test purchases unlock nothing live." },
    mappingLiveNote: { TR: "Bu eşleme canlı ortam içindir. Sandbox'taki eşleme, kuponlar ve test abonelikleri burada geçerli değildir.", EN: "This mapping is for the live environment. The sandbox mapping, coupons and test subscriptions don't apply here." },
    otherMapped: { TR: "{env} ortamında {count}/4 fiyat eşlenmiş.", EN: "{count} of 4 prices are mapped in {env}." },
    envTableTitle: { TR: "Sandbox ↔ Canlı", EN: "Sandbox ↔ Live" },
    envTableHint: { TR: "Canlıya geçerken her sandbox fiyatının canlıdaki karşılığını buradan izleyin. Salt okunur: düzenleme yalnızca etkin ortam ({env}) için yapılır.", EN: "When going live, track each sandbox price's live counterpart here. Read-only: only the active environment ({env}) can be edited." },
    envPlan: { TR: "Plan", EN: "Plan" },
    envState: { TR: "Durum", EN: "State" },
    envActive: { TR: "etkin", EN: "active" },
    missingLive: { TR: "Canlıda eksik", EN: "Missing live" },
    missingSandbox: { TR: "Sandbox'ta eksik", EN: "Missing in sandbox" },
    bothMapped: { TR: "İkisinde de var", EN: "Mapped in both" },
    notMapped: { TR: "Eşlenmemiş", EN: "Not mapped" },
    productsRow: { TR: "{plan} · ürünler", EN: "{plan} · products" },
    salesRow: { TR: "Satış", EN: "Sales" },
    salesOpenShort: { TR: "Herkese açık", EN: "Open" },
    salesClosedShort: { TR: "Kapalı", EN: "Closed" },
    envCopy: { TR: "Tabloyu kopyala", EN: "Copy the table" },
    salesClosedLabel: { TR: "Satışlar kapalı — yalnızca ekip test edebilir", EN: "Sales closed — only the team can test" },
    salesOpenLabel: { TR: "Satışlar herkese açık", EN: "Sales open to everyone" },
    salesClosedHint: { TR: "Planları yalnızca ekip üyeleri ve PADDLE_TESTER_EMAILS'teki e-postalar görüp satın alabilir; diğer herkes \"Yakında\" görür.", EN: "Only team members and the e-mails in PADDLE_TESTER_EMAILS can see and buy plans; everyone else sees \"Coming soon\"." },
    salesOpenHint: { TR: "Görünür olan ve Paddle fiyatı eşlenmiş planları herkes satın alabilir.", EN: "Anyone can buy the plans that are Visible and have a Paddle price mapped." },
    salesSwitch: { TR: "Satışları herkese aç", EN: "Open sales to everyone" },
    sandboxOpenWarning: { TR: "Sandbox'ta herkese açmak, herkesin test kartıyla bedava plan almasına izin verir.", EN: "Opening sales in the sandbox lets anyone get a plan for free with a test card." },
    openTitle: { TR: "{env} ortamında satışlar herkese açılsın mı?", EN: "Open sales to everyone in {env}?" },
    openSandboxBody: { TR: "Sandbox'ta herkese açmak, herkesin test kartıyla bedava plan almasına izin verir. Yalnızca kısa bir deneme için açın ve ardından kapatın.", EN: "Opening sales in the sandbox lets anyone get a plan for free with a test card. Only open it briefly for a test and close it again." },
    openLiveBody: { TR: "Görünür olan ve fiyatı eşlenmiş planlar herkese satılmaya başlar; ödemeler gerçek kartlardan alınır.", EN: "The Visible plans with a mapped price go on sale to everyone; payments are charged to real cards." },
    openConfirm: { TR: "Herkese aç", EN: "Open to everyone" },
    salesOpened: { TR: "Satışlar herkese açıldı.", EN: "Sales are open to everyone." },
    salesClosed: { TR: "Satışlar kapatıldı; yalnızca ekip test edebilir.", EN: "Sales closed; only the team can test." },
    ownerOnly: { TR: "Yalnızca site sahipleri değiştirebilir.", EN: "Only site owners can change this." },
    catalogTitle: { TR: "Paddle kataloğu", EN: "Paddle catalog" },
    catalogHint: { TR: "Paddle'da eksik olan Plus ve Pro ürünlerini ve fiyatlarını oluşturur ({summary}) ve eşlemeyi bunlara ayarlar. Paddle'da var olan hiçbir şey değiştirilmez, arşivlenmez ya da silinmez.", EN: "Creates the Plus and Pro products and prices missing in Paddle ({summary}) and maps them. Nothing that exists in Paddle is changed, archived or deleted." },
    catalogButton: { TR: "Paddle kataloğunu oluştur", EN: "Create the Paddle catalog" },
    catalogNeedsKey: { TR: "Önce PADDLE_API_KEY tanımlanmalı.", EN: "PADDLE_API_KEY has to be set first." },
    catalogConfirmTitle: { TR: "{env} ortamında Paddle kataloğu oluşturulsun mu?", EN: "Create the Paddle catalog in {env}?" },
    catalogConfirmBody: { TR: "Eksik ürün ve fiyatlar Paddle'da oluşturulur ve fiyat eşlemesi bunlara ayarlanır. Paddle'da var olan hiçbir şey değiştirilmez; bir dönem için farklı tutarda bir fiyat bulunursa o dönemde bir şey yapılmaz ve size bildirilir.", EN: "The missing products and prices are created in Paddle and the price mapping is set to them. Nothing that exists in Paddle is changed; if a period already has a price with another amount, nothing is done for it and you're told." },
    catalogConfirm: { TR: "Oluştur", EN: "Create" },
    catalogDone: { TR: "Paddle kataloğu hazır ve eşlendi.", EN: "The Paddle catalog is ready and mapped." },
    catalogWithConflicts: { TR: "Katalog işlendi, ancak {count} dönemde çakışma var.", EN: "The catalog was processed, but {count} periods have conflicts." },
    reportTitle: { TR: "Katalog sonucu · {env}", EN: "Catalog result · {env}" },
    productCreated: { TR: "{name}: ürün oluşturuldu", EN: "{name}: product created" },
    productReused: { TR: "{name}: ürün zaten vardı", EN: "{name}: product already existed" },
    outcomeCreated: { TR: "Oluşturuldu", EN: "Created" },
    outcomeReused: { TR: "Zaten vardı", EN: "Already there" },
    outcomeConflict: { TR: "Çakışma", EN: "Conflict" },
    conflictLine: { TR: "Paddle'da {found} var, beklenen {expected}. Hiçbir şey değiştirilmedi: fiyatı Paddle'da kendiniz düzeltin ya da aşağıdaki eşlemede elle seçin.", EN: "Paddle has {found}; {expected} was expected. Nothing was changed: fix the price in Paddle yourself or pick it in the mapping below." },
    closeReport: { TR: "Sonucu kapat", EN: "Close the result" },
    mappingTitle: { TR: "Fiyat eşlemesi", EN: "Price mapping" },
    mappingHint: { TR: "Ödeme ekranı burada seçilen Paddle fiyatlarını kullanır. Bir fiyatı değiştirdiğinizde mevcut aboneler eski fiyatla devam eder ve planlarını korur.", EN: "Checkout uses the Paddle prices chosen here. When you change a price, existing subscribers stay on the old one and keep their plan." },
    monthly: { TR: "Aylık", EN: "Monthly" },
    yearly: { TR: "Yıllık", EN: "Yearly" },
    perMonth: { TR: "aylık", EN: "monthly" },
    perYear: { TR: "yıllık", EN: "yearly" },
    monthShort: { TR: "ay", EN: "mo" },
    yearShort: { TR: "yıl", EN: "yr" },
    none: { TR: "— Seçilmedi —", EN: "— Not set —" },
    suggestedMark: { TR: "önerilen", EN: "suggested" },
    suggestedBadge: { TR: "Önerilen, kaydedilmedi", EN: "Suggested, not saved" },
    suggestionsApplied: { TR: "Boş alanlar Paddle'daki adlara ve hanogt_plan özel verisine göre dolduruldu; kontrol edip kaydedin.", EN: "Empty slots were filled in from the names and hanogt_plan custom data in Paddle; check them and save." },
    notInPaddle: { TR: "Paddle'da etkin değil", EN: "not active in Paddle" },
    missingPrice: { TR: "Kayıtlı fiyat Paddle'da etkin değil ya da başka bir döneme ait; satış için başka bir fiyat seçin.", EN: "The saved price isn't active in Paddle or has another period; pick another price to sell." },
    noPrices: { TR: "Paddle'da bu döneme uygun etkin fiyat yok.", EN: "Paddle has no active price for this period." },
    trial: { TR: "{days} gün deneme", EN: "{days}-day trial" },
    manualNotice: { TR: "Paddle'dan fiyat listesi alınamadı; kimlikleri elle girebilirsiniz (Paddle > Catalog > Prices, pri_ ile başlar). Kaydederken yalnızca biçimleri denetlenir.", EN: "The price list couldn't be read from Paddle; you can enter the IDs by hand (Paddle > Catalog > Prices, they start with pri_). Only their form is checked when saving." },
    invalidId: { TR: "pri_ ile başlayan bir kimlik girin.", EN: "Enter an ID starting with pri_." },
    matches: { TR: "Sitedeki fiyatla aynı ({price}).", EN: "Matches the site's price ({price})." },
    mismatch: { TR: "Paddle'daki fiyat {paddle}, sitede beklenen {site}.", EN: "The price in Paddle is {paddle}; the site expects {site}." },
    noSitePrice: { TR: "Sitede bu dönem için fiyat yok; Planlar ve fiyatlar bölümünden girin.", EN: "The site has no price for this period; enter it under Plans and prices." },
    mismatchSummary: { TR: "{count} fiyat sitedekiyle uyuşmuyor. Paddle'ın ön incelemesi sitedeki fiyatların Paddle kataloğuyla aynı olmasını bekler.", EN: "{count} prices differ from the site's. Paddle's review expects the site's prices to match the Paddle catalog." },
    save: { TR: "Fiyat eşlemesini kaydet", EN: "Save the price mapping" },
    saved: { TR: "Fiyat eşlemesi kaydedildi.", EN: "Price mapping saved." },
    lastSaved: { TR: "Son değişiklik: {who} · {time}", EN: "Last change: {who} · {time}" },

    // Checkout errors browsers reported
    errorsTitle: { TR: "Son ödeme ekranı hataları", EN: "Recent checkout errors" },
    errorsDescription: { TR: "Planlar sayfasında ödeme ekranı açılamadığında tarayıcıların bildirdikleri", EN: "What browsers reported when the checkout couldn't open on the Plans page" },
    errorsHint: { TR: "En yeni 10 kayıt tutulur. Kimin bildirdiği saklanmaz; yalnızca aşama, hata metni, engellenen adres, tarayıcı ve ortam.", EN: "The newest 10 are kept. Who reported them isn't stored; only the stage, the error text, the blocked address, the browser and the environment." },
    errorsEmpty: { TR: "Henüz bildirilen bir hata yok.", EN: "No errors have been reported yet." },
    errorsEmptyHint: { TR: "Planlar sayfasında ödeme ekranı açılamazsa nedeni burada görünür.", EN: "If the checkout can't open on the Plans page, the reason shows up here." },
    openPlans: { TR: "Planlar sayfasını yeni sekmede aç", EN: "Open the Plans page in a new tab" },
    blockedAddress: { TR: "Engellenen adres: {url}", EN: "Blocked address: {url}" },
    errorCode: { TR: "Paddle kodu: {code}", EN: "Paddle code: {code}" },
    // Billing requests that failed on the server
    serverTitle: { TR: "Son sunucu hataları", EN: "Recent server errors" },
    serverDescription: { TR: "Ödeme ve abonelik isteklerinin sunucuda başarısız olduğu anlar", EN: "When checkout and subscription requests failed on the server" },
    serverHint: { TR: "En yeni 10 kayıt tutulur. Kimin isteği olduğu saklanmaz; yalnızca istek, adım, HTTP durumu, kod, süre ve ayrıntı. Planlar sayfasındaki \"Hata kodu\" satırı da aynı bilgiyi gösterir.", EN: "The newest 10 are kept. Whose request it was isn't stored; only the request, step, HTTP status, code, duration and detail. The \"Error code\" line on the Plans page shows the same." },
    serverEmpty: { TR: "Sunucuda başarısız olan bir ödeme isteği yok.", EN: "No billing request has failed on the server." },
    serverEmptyHint: { TR: "Bir ödeme isteği sunucuda başarısız olursa hangi adımda ve neden olduğu burada görünür.", EN: "If a billing request fails on the server, the step and the reason show up here." },
    serverLine: { TR: "HTTP {status} · {code} · {seconds} sn", EN: "HTTP {status} · {code} · {seconds} s" },
    paddleAnswered: { TR: "Paddle'ın yanıtı: HTTP {status}", EN: "Paddle answered: HTTP {status}" },
    paddleUnreached: { TR: "Paddle'a ulaşılamadı", EN: "Paddle wasn't reached" },
    routeCheckout: { TR: "Ödeme başlatma", EN: "Starting a checkout" },
    routeSubscription: { TR: "Abonelik işlemi: {action}", EN: "Subscription action: {action}" },
    stepUnknown: { TR: "Adım bilinmiyor", EN: "Unknown step" },

    // Business details
    legalTitle: { TR: "İşletme bilgileri", EN: "Business details" },
    legalDescription: { TR: "Kullanım Şartları, Gizlilik ve İade metinlerinde görünür", EN: "Shown in the Terms, Privacy and Refund texts" },
    legalHint: { TR: "Paddle'ın site onayı için Kullanım Şartları'nda yasal adın görünmesi gerekiyor.", EN: "Paddle's website review needs the legal name to appear in the Terms of Use." },
    published: { TR: "Yasal metinlerde görünüyor", EN: "Shown in the legal texts" },
    notPublished: { TR: "Görünmüyor: yasal ad ve iletişim e-postası gerekli", EN: "Not shown: legal name and contact e-mail needed" },
    legalOwnerOnly: { TR: "Bu bilgileri yalnızca site sahipleri değiştirebilir.", EN: "Only site owners can change these details." },
    legalSave: { TR: "İşletme bilgilerini kaydet", EN: "Save business details" },
    legalSaved: { TR: "İşletme bilgileri kaydedildi.", EN: "Business details saved." },
    legalUpdated: { TR: "Son güncelleme: {time}", EN: "Last updated {time}" },

    // Unlinked subscriptions
    unlinkedTitle: { TR: "Eşleşmeyen abonelikler", EN: "Unlinked subscriptions" },
    unlinkedDescription: { TR: "Paddle'da bir hesapla eşleştirilemeyen abonelikler", EN: "Paddle subscriptions no account could be matched to" },
    unlinkedHint: { TR: "Ödeme başka bir e-postayla yapıldığında ya da abonelik Paddle'da elle oluşturulduğunda olur. Doğru hesaba bağlayın; plan hemen açılır. Yoksaydığınız kayıt, Paddle o abonelik için yeni bir bildirim gönderirse yeniden görünür.", EN: "This happens when someone paid with another e-mail or the subscription was made in Paddle by hand. Link it to the right account and the plan unlocks at once. A dismissed entry comes back if Paddle sends a new notification for it." },
    unlinkedEmpty: { TR: "Eşleşmeyen abonelik yok.", EN: "No unlinked subscriptions." },
    customerEmail: { TR: "Paddle'daki e-posta: {email}", EN: "E-mail at Paddle: {email}" },
    seen: { TR: "Görülme: {time}", EN: "Seen {time}" },
    accountEmail: { TR: "Bağlanacak hesabın e-postası", EN: "E-mail of the account to link" },
    link: { TR: "Hesaba bağla", EN: "Link to account" },
    linked: { TR: "Abonelik hesaba bağlandı.", EN: "Subscription linked to the account." },
    dismiss: { TR: "Yoksay", EN: "Dismiss" },
    dismissed: { TR: "Kayıt yoksayıldı.", EN: "Entry dismissed." },
    openInPaddle: { TR: "Paddle'da aç", EN: "Open in Paddle" },
} satisfies Record<string, Copy>;

const WARNINGS: Record<AdminPaddleWarning, Copy> = {
    key_token_mismatch: { TR: "API anahtarı ile istemci tarafı jeton farklı ortamlara ait (biri Sandbox, biri Canlı). İkisini de aynı ortamdan alın.", EN: "The API key and the client-side token belong to different environments (one sandbox, one live). Take both from the same environment." },
    environment_override_ignored: { TR: "NEXT_PUBLIC_PADDLE_ENV anahtarlarla çelişiyor; anahtarların ortamı kullanılıyor. Değişkeni düzeltin ya da silin.", EN: "NEXT_PUBLIC_PADDLE_ENV contradicts the keys; the keys' environment is used. Fix or delete the variable." },
    public_secret: { TR: "NEXT_PUBLIC_ ile başlayan bir değişkende gizli anahtar var; hemen silin ve anahtarı Paddle'da yenileyin.", EN: "A secret key is in a variable starting with NEXT_PUBLIC_; delete it right away and rotate the key in Paddle." },
    token_is_api_key: { TR: "İstemci tarafı jeton yerine bir API anahtarı girilmiş ve bu değer tarayıcılara gönderiliyor. Değişkene Paddle'daki istemci tarafı jetonu (test_ ya da live_ ile başlar) girin ve API anahtarını Paddle'da hemen yenileyin.", EN: "An API key was entered instead of the client-side token, and that value is sent to browsers. Put the client-side token (starting with test_ or live_) in the variable and rotate the API key in Paddle right away." },
    api_key_format: { TR: "PADDLE_API_KEY beklenen biçimde değil (pdl_sdbx_apikey_… ya da pdl_live_apikey_…). Değeri Paddle'dan yeniden kopyalayın.", EN: "PADDLE_API_KEY doesn't look right (pdl_sdbx_apikey_… or pdl_live_apikey_…). Copy it from Paddle again." },
    client_token_format: { TR: "İstemci tarafı jeton beklenen biçimde değil (test_… ya da live_…).", EN: "The client-side token doesn't look right (test_… or live_…)." },
    webhook_secret_format: { TR: "PADDLE_WEBHOOK_SECRET beklenen biçimde değil (pdl_ntfset_…). Paddle'da Developer tools > Notifications bölümünden bildirim hedefinin gizli anahtarını kopyalayın.", EN: "PADDLE_WEBHOOK_SECRET doesn't look right (pdl_ntfset_…). Copy the notification destination's secret from Developer tools > Notifications in Paddle." },
};

/** Secrets ending up in browsers need action at once. */
const URGENT_WARNINGS: readonly AdminPaddleWarning[] = ["public_secret", "token_is_api_key"];

/** Why the webhook refused a delivery (site_config/paddle_status.lastRejectedReason). */
const REJECTIONS: Record<string, Copy> = {
    ip_not_allowed: { TR: "Paddle'ın bildirim adreslerinden gelmedi (IP izin listesi).", EN: "It didn't come from Paddle's notification addresses (IP allowlist)." },
    signature_missing: { TR: "Paddle imzası yoktu.", EN: "It had no Paddle signature." },
    signature_malformed: { TR: "Paddle imzası okunamadı.", EN: "Its Paddle signature couldn't be read." },
    signature_expired: { TR: "İmza beş dakikadan eskiydi; sunucu saati kaymış ya da bildirim yeniden gönderilmiş olabilir.", EN: "The signature was more than five minutes old; the server clock may be off or the delivery was replayed." },
    signature_mismatch: { TR: "İmza tutmadı: PADDLE_WEBHOOK_SECRET, Paddle'daki bildirim hedefinin gizli anahtarıyla aynı değil (ya da öbür ortamın anahtarı).", EN: "The signature didn't match: PADDLE_WEBHOOK_SECRET isn't the secret of the notification destination in Paddle (or it's the other environment's)." },
};

/** The stages of a reported checkout failure (site_config/paddle_status.clientErrors), with what they usually mean. */
const CLIENT_ERROR_STAGES: Record<PaddleClientErrorStage, { label: Copy; tone: Tone; hint?: Copy }> = {
    blocked: {
        label: { TR: "Betik engellendi", EN: "Script blocked" },
        tone: "amber",
        hint: { TR: "Paddle.js tarayıcıya ulaşmadı: reklam engelleyici, tarayıcı koruması ya da ağ. Engellenen adres paddle.com'daysa sitenin güvenlik politikası (CSP) da olabilir.", EN: "Paddle.js didn't reach the browser: an ad blocker, browser protection or the network. If the blocked address is on paddle.com, it may also be the site's security policy (CSP)." },
    },
    missing: {
        label: { TR: "Paddle.js eksik", EN: "Paddle.js missing" },
        tone: "red",
        hint: { TR: "Betik yüklendi ama Paddle'ın nesnesi oluşmadı; tarayıcı eklentisi betiği bozmuş olabilir.", EN: "The script loaded but Paddle's object wasn't created; a browser extension may have broken the script." },
    },
    init: {
        label: { TR: "Başlatılamadı", EN: "Couldn't start" },
        tone: "red",
        hint: { TR: "Paddle.js başlatılırken hata verdi; çoğunlukla istemci tarafı jeton başka bir Paddle hesabına ya da öbür ortama aittir (yukarıdaki jeton denetimine bakın).", EN: "Paddle.js failed while starting; usually the client-side token belongs to another Paddle account or to the other environment (see the token check above)." },
    },
    open: {
        label: { TR: "Açılamadı", EN: "Couldn't open" },
        tone: "red",
        hint: { TR: "Paddle.js başladı ama ödeme ekranını açarken hata verdi.", EN: "Paddle.js started but failed while opening the checkout." },
    },
    checkout_error: { label: { TR: "Ödeme ekranı hatası", EN: "Checkout error" }, tone: "red" },
    checkout_failed: { label: { TR: "Ödeme ekranı başarısız", EN: "Checkout failed" }, tone: "red" },
    payment_error: { label: { TR: "Ödeme hatası", EN: "Payment error" }, tone: "zinc" },
    request: {
        label: { TR: "İstek yanıtsız kaldı", EN: "Request got no answer" },
        tone: "amber",
        hint: { TR: "Tarayıcının ödeme isteğine kodumuz yanıt veremedi. http_504: Vercel isteği süre sınırında kesti (aynı anda \"Son sunucu hataları\"nda kayıt yoksa sunucu Paddle'ı ya da veritabanını beklerken kesilmiştir). network: istek sunucuya ulaşmadı (bağlantı, reklam engelleyici, VPN).", EN: "Our code couldn't answer the browser's billing request. http_504: Vercel cut the request at its time limit (with nothing under \"Recent server errors\" at that moment, the server was waiting on Paddle or the database). network: the request never reached the server (connection, ad blocker, VPN)." },
    },
};

/** What a failed billing route was doing (site_config/paddle_status.serverErrors). */
const SERVER_STEPS: Record<BillingStep, Copy> = {
    catalog: { TR: "Plan kataloğu okunurken", EN: "Reading the plan catalog" },
    settings: { TR: "Paddle ayarları okunurken", EN: "Reading the Paddle settings" },
    subscription: { TR: "Abonelik kaydı okunurken", EN: "Reading the subscription record" },
    customer: { TR: "Paddle müşterisi bulunurken", EN: "Finding the Paddle customer" },
    transaction: { TR: "Ödeme işlemi oluşturulurken", EN: "Creating the checkout transaction" },
    portal: { TR: "Müşteri portalı açılırken", EN: "Opening the customer portal" },
    preview: { TR: "Plan değişikliği hesaplanırken", EN: "Previewing the plan change" },
    change: { TR: "Plan değiştirilirken", EN: "Changing the plan" },
    keep: { TR: "İptal geri alınırken", EN: "Undoing the cancellation" },
};

/** What the usual codes of a failed billing request mean. */
const SERVER_CODE_HINTS: Record<string, Copy> = {
    timeout: { TR: "Paddle 8 saniye içinde yanıt vermedi. Paddle'ın durum sayfasına bakın; Planlar sayfası bir kez kendiliğinden yeniden dener.", EN: "Paddle didn't answer within 8 seconds. Check Paddle's status page; the Plans page retries once by itself." },
    network_error: { TR: "Sunucu Paddle'a bağlanamadı (DNS ya da ağ).", EN: "The server couldn't connect to Paddle (DNS or network)." },
    unexpected_response: { TR: "Paddle beklenmedik bir yanıt verdi (JSON değil).", EN: "Paddle gave an unexpected answer (not JSON)." },
    database_error: { TR: "Firestore isteği başarısız oldu: günlük kota dolmuş, hizmet hesabının yetkisi eksik ya da kısa bir kesinti olabilir. Bulut Sağlığı sekmesine bakın.", EN: "A Firestore request failed: the daily quota may be used up, the service account may lack permission, or there may be a brief outage. See the Cloud Health tab." },
    internal_error: { TR: "Sunucu kodunda beklenmedik bir hata. Ayrıntı ve saatle Vercel günlüklerinde arayın.", EN: "An unexpected error in the server code. Search the Vercel logs with the detail and the time." },
    customer_linked_elsewhere: { TR: "Bu e-postanın Paddle müşterisi başka bir hesaba bağlı.", EN: "The Paddle customer of this e-mail is linked to another account." },
    forbidden: { TR: "API anahtarının bu işlem için izni yok; Paddle'da anahtarın izinlerine bakın.", EN: "The API key isn't allowed to do this; check the key's permissions in Paddle." },
};

const ENV_VARIABLES: Array<{ name: string; note: Copy }> = [
    { name: "PADDLE_API_KEY", note: C.varSecret },
    { name: "NEXT_PUBLIC_PADDLE_CLIENT_TOKEN", note: C.varPublic },
    { name: "PADDLE_WEBHOOK_SECRET", note: C.varSecret },
    { name: "NEXT_PUBLIC_PADDLE_ENV", note: C.varEnv },
    { name: "PADDLE_TESTER_EMAILS", note: C.varTesters },
];

const STATUS_TONES: Record<PaddleStatus, Tone> = { active: "emerald", trialing: "sky", past_due: "amber", paused: "zinc", canceled: "red" };

function isPaddleStatus(value: string): value is PaddleStatus {
    return (PADDLE_STATUSES as readonly string[]).includes(value);
}

/** A Paddle subscription status as a badge (also used in the person view). */
export function PaddleStatusBadge({ status }: { status: string }) {
    const { tx } = useI18n();
    if (!isPaddleStatus(status)) return <Badge>{status || "—"}</Badge>;
    return <Badge tone={STATUS_TONES[status]}>{tx(PADDLE_STATUS_COPY[status])}</Badge>;
}

export function PaddleEnvironmentBadge({ environment }: { environment: PaddleEnvironment }) {
    const { tx } = useI18n();
    return <Badge tone={environment === "sandbox" ? "amber" : "emerald"} icon={environment === "sandbox" ? FlaskConical : Radio}>{tx(PADDLE_ENVIRONMENT_COPY[environment])}</Badge>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** "3 minutes ago", or the date while the clock hasn't started. */
function useWhen() {
    const { locale } = useI18n();
    const now = useNow();
    return (iso: string) => formatRelativeTime(iso, now, locale) || formatDateTime(iso, locale);
}

function useClipboard() {
    const { tx } = useI18n();
    const toast = useToast();
    return async (value: string) => {
        try {
            await navigator.clipboard.writeText(value);
            toast("success", tx(C.copied));
        } catch {
            toast("error", tx(C.copyFailed));
        }
    };
}

/** A price in major units (20 → "$20.00"). */
function formatMajor(value: number, currency: string, locale: string) {
    try {
        return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
    } catch {
        return `${value} ${currency}`;
    }
}

type PriceCheck = { kind: "match" | "mismatch" | "noSitePrice"; paddle: string; site: string };

/** Paddle's amount for a slot against the price the site shows for it. */
function checkPrice(price: AdminPaddlePrice, catalog: PlanCatalog, plan: PaidPlanId, interval: BillingInterval, locale: string): PriceCheck {
    const expected = catalog.plans[plan][interval === "month" ? "monthly" : "yearly"];
    const paddle = formatMoney(price.amount, price.currency, locale);
    if (expected === null) return { kind: "noSitePrice", paddle, site: "" };
    const same = price.currency === catalog.currency && Math.round(expected * 10 ** currencyDigits(catalog.currency)) === Number(price.amount);
    return { kind: same ? "match" : "mismatch", paddle, site: formatMajor(expected, catalog.currency, locale) };
}

function apiProblem(error: { status: number; code: string }): Copy {
    if (error.code === "not_configured") return C.apiNoKey;
    if (error.status === 401) return C.apiUnauthorized;
    if (error.status === 403) return C.apiForbidden;
    if (error.status === 429) return C.apiRateLimited;
    if (error.status === 0) return C.apiNetwork;
    if (error.status >= 500) return C.apiServer;
    return C.apiOther;
}

const LABEL = "block text-[12px] font-semibold text-zinc-500 dark:text-zinc-400";

/** The four slots of the mapping: Plus and Pro, monthly and yearly. */
const SLOTS: Array<{ plan: PaidPlanId; interval: BillingInterval }> = PAID_PLAN_IDS.flatMap((plan) => BILLING_INTERVALS.map((interval) => ({ plan, interval })));

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

function Tick({ ok, label, name }: { ok: boolean; label: string; name: string }) {
    const { tx } = useI18n();
    const Icon = ok ? CheckCircle2 : XCircle;
    return (
        <li className="flex items-start gap-2.5 rounded-2xl border border-zinc-100 bg-zinc-50/70 px-3 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
            <Icon className={cx("mt-0.5 h-4.5 w-4.5 shrink-0", ok ? "text-emerald-500" : "text-red-500")} aria-hidden="true" />
            <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-bold text-zinc-800 dark:text-zinc-100">
                    {label}
                    <Badge tone={ok ? "emerald" : "red"}>{tx(ok ? C.set : C.missing)}</Badge>
                </p>
                <code className="mt-0.5 block break-all text-[11px] text-zinc-500" dir="ltr">{name}</code>
            </div>
        </li>
    );
}

function AddressRow({ label, value, hint }: { label: string; value: string; hint: string }) {
    const { tx } = useI18n();
    const copy = useClipboard();
    return (
        <li className="rounded-2xl border border-zinc-100 px-3 py-2.5 dark:border-white/[0.06]">
            <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-bold text-zinc-500">{label}</p>
                    <code className="block break-all text-[13px] font-semibold text-zinc-800 dark:text-zinc-100" dir="ltr">{value}</code>
                </div>
                <IconButton icon={ClipboardCopy} label={tx(C.copyValue, { name: label })} onClick={() => void copy(value)} />
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">{hint}</p>
        </li>
    );
}

/** Whether the client-side token is one of the API key's account, and what to do when it isn't. */
function ClientTokenCheck({ check, environment }: { check: AdminPaddleClientTokenCheck; environment: PaddleEnvironment }) {
    const { tx } = useI18n();
    const when = useWhen();
    const active = check.result === "active";
    // Revoked or missing: the checkout can't open. No permission or an error: unknown.
    const broken = check.result === "revoked" || check.result === "missing";
    const Icon = active ? CheckCircle2 : broken ? XCircle : AlertTriangle;
    const copy = {
        active: check.name ? C.tokenActiveNamed : C.tokenActive,
        revoked: C.tokenRevoked,
        missing: C.tokenMissing,
        no_permission: C.tokenNoPermission,
        error: C.tokenError,
    }[check.result];
    return (
        <div className="flex items-start gap-2 text-zinc-700 dark:text-zinc-200">
            <Icon className={cx("mt-0.5 h-4 w-4 shrink-0", active ? "text-emerald-500" : broken ? "text-red-500" : "text-amber-500")} aria-hidden="true" />
            <div className="min-w-0">
                <p className={cx(!active && "font-semibold", broken && "text-red-700 dark:text-red-300")}>{tx(copy, { env: tx(PADDLE_ENVIRONMENT_COPY[environment]), name: check.name ?? "" })}</p>
                <p className="mt-0.5 flex flex-wrap gap-x-3 text-[11.5px] text-zinc-500">
                    <span>{tx(C.tokenChecked, { time: when(check.checkedAt) })}</span>
                    {check.code ? <span className="font-mono" dir="ltr">{tx(C.apiCode, { code: check.code })}</span> : null}
                </p>
            </div>
        </div>
    );
}

function ConnectionPanel({ data, loading, onReload }: { data: AdminPaddleResponse; loading: boolean; onReload: () => void }) {
    const { tx } = useI18n();
    const when = useWhen();
    const { config, api, status, clientTokenCheck } = data;
    const sandbox = config.environment === "sandbox";
    const rejectedLater = Boolean(status.lastRejectedAt && (!status.lastEventAt || Date.parse(status.lastRejectedAt) > Date.parse(status.lastEventAt)));
    const rejection = status.lastRejectedReason ? REJECTIONS[status.lastRejectedReason] : undefined;
    const tokenBroken = clientTokenCheck?.result === "missing" || clientTokenCheck?.result === "revoked";
    const ready = config.apiKey && config.clientToken && config.webhookSecret && api.ok && !tokenBroken;

    return (
        <Panel
            title={tx(C.title)}
            description={tx(C.description)}
            icon={CreditCard}
            actions={(
                <>
                    <PaddleEnvironmentBadge environment={config.environment} />
                    <Button size="sm" icon={RefreshCw} busy={loading} onClick={onReload}>{tx(COMMON.refresh)}</Button>
                </>
            )}
        >
            <Notice tone={sandbox ? "info" : "success"}>{tx(sandbox ? C.sandboxNote : C.liveNote)}</Notice>
            {config.warnings.length ? (
                <div className="mt-3 space-y-2">
                    {config.warnings.map((warning) => (
                        <Notice key={warning} tone={URGENT_WARNINGS.includes(warning) ? "error" : "warning"}>{tx(WARNINGS[warning])}</Notice>
                    ))}
                </div>
            ) : null}
            <ul className="mt-4 grid gap-2 sm:grid-cols-3">
                <Tick ok={config.apiKey} label={tx(C.apiKey)} name="PADDLE_API_KEY" />
                <Tick ok={config.clientToken} label={tx(C.clientToken)} name="NEXT_PUBLIC_PADDLE_CLIENT_TOKEN" />
                <Tick ok={config.webhookSecret} label={tx(C.webhookSecret)} name="PADDLE_WEBHOOK_SECRET" />
            </ul>
            <div className="mt-4 space-y-2 text-[13px] leading-relaxed">
                {api.ok ? (
                    <p className="flex items-start gap-2 text-zinc-700 dark:text-zinc-200"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />{tx(C.apiOk, { count: data.prices.length })}</p>
                ) : api.error ? (
                    <div className="flex items-start gap-2 text-zinc-700 dark:text-zinc-200">
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden="true" />
                        <div className="min-w-0">
                            <p className="font-semibold">{tx(C.apiFailed)} {tx(apiProblem(api.error))}</p>
                            <p className="mt-0.5 font-mono text-[11.5px] text-zinc-500" dir="ltr">{tx(C.apiCode, { code: `${api.error.status || "network"} ${api.error.code}` })}</p>
                        </div>
                    </div>
                ) : null}
                {clientTokenCheck ? <ClientTokenCheck check={clientTokenCheck} environment={config.environment} /> : null}
                <p className="flex items-start gap-2 text-zinc-700 dark:text-zinc-200">
                    <Webhook className={cx("mt-0.5 h-4 w-4 shrink-0", status.lastEventAt ? "text-emerald-500" : "text-zinc-400")} aria-hidden="true" />
                    <span>
                        {status.lastEventAt ? tx(C.webhookLast, { time: when(status.lastEventAt), type: status.lastEventType ?? "—" }) : tx(C.webhookNone)}
                        {!config.webhookSecret ? <span className="ms-1 font-semibold text-red-600 dark:text-red-400">{tx(C.webhookNoSecret)}</span> : null}
                    </span>
                </p>
                {status.lastRejectedAt ? (
                    <p className={cx("flex items-start gap-2", rejectedLater ? "font-semibold text-amber-800 dark:text-amber-200" : "text-zinc-500")}>
                        <AlertTriangle className={cx("mt-0.5 h-4 w-4 shrink-0", rejectedLater ? "text-amber-500" : "text-zinc-400")} aria-hidden="true" />
                        <span>{tx(C.webhookRejected, { time: when(status.lastRejectedAt), reason: rejection ? tx(rejection) : status.lastRejectedReason ?? "—" })}</span>
                    </p>
                ) : null}
            </div>
            <h3 className="mt-5 text-[13px] font-black uppercase tracking-wide text-zinc-500">{tx(C.addresses)}</h3>
            <ul className="mt-2 grid gap-2 lg:grid-cols-2">
                <AddressRow label={tx(C.webhookUrl)} value={data.urls.webhook} hint={tx(C.webhookUrlHint)} />
                <AddressRow label={tx(C.paymentLink)} value={data.urls.paymentLink} hint={tx(C.paymentLinkHint)} />
            </ul>
            <details className="group mt-4 rounded-2xl border border-zinc-100 px-4 py-3 dark:border-white/[0.06]" open={!ready}>
                <summary className="flex cursor-pointer list-none items-center gap-2 text-[13px] font-bold text-zinc-800 dark:text-zinc-100">
                    <ListChecks className="h-4 w-4 text-indigo-500" aria-hidden="true" />{tx(C.setup)}
                </summary>
                <ol className="mt-3 list-decimal space-y-2 ps-5 text-[13px] leading-relaxed text-zinc-700 marker:font-bold marker:text-zinc-400 dark:text-zinc-300">
                    <li>{tx(C.step1)}</li>
                    <li>
                        {tx(C.step2)}
                        <ul className="mt-1.5 space-y-1">
                            {ENV_VARIABLES.map((variable) => (
                                <li key={variable.name} className="flex flex-wrap items-baseline gap-x-2">
                                    <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-[12px] font-bold text-zinc-800 dark:bg-white/[0.06] dark:text-zinc-100" dir="ltr">{variable.name}</code>
                                    <span className="text-[12px] text-zinc-500">{tx(variable.note)}</span>
                                </li>
                            ))}
                        </ul>
                    </li>
                    <li className="font-semibold text-red-700 dark:text-red-300">{tx(C.step3)}</li>
                    <li>{tx(C.step4)}</li>
                    <li>{tx(C.step5)}</li>
                </ol>
            </details>
        </Panel>
    );
}

// ---------------------------------------------------------------------------
// Billing requests that failed on the server
// ---------------------------------------------------------------------------

function ServerErrorRow({ entry }: { entry: AdminPaddleServerError }) {
    const { tx, locale } = useI18n();
    const when = useWhen();
    const [route, action] = entry.route.split(":");
    const seconds = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(entry.ms / 1000);
    const hint = SERVER_CODE_HINTS[entry.code];
    return (
        <li className="py-3">
            <div className="flex flex-wrap items-center gap-2">
                <Badge tone={entry.status === 502 ? "amber" : "red"}>{entry.step ? tx(SERVER_STEPS[entry.step]) : tx(C.stepUnknown)}</Badge>
                <PaddleEnvironmentBadge environment={entry.environment} />
                <time dateTime={entry.at} title={formatDateTime(entry.at, locale)} className="text-[12px] text-zinc-500">{when(entry.at)}</time>
                <span className="text-[12px] text-zinc-500">{route === "subscription" && action ? tx(C.routeSubscription, { action }) : tx(C.routeCheckout)}</span>
            </div>
            <p className="mt-1.5 font-mono text-[12px] font-semibold text-zinc-800 dark:text-zinc-100" dir="ltr">{tx(C.serverLine, { status: entry.status, code: entry.code, seconds })}</p>
            {entry.paddleStatus !== null ? <p className="mt-0.5 text-[12px] text-zinc-500">{entry.paddleStatus ? tx(C.paddleAnswered, { status: entry.paddleStatus }) : tx(C.paddleUnreached)}</p> : null}
            {entry.detail ? <p className="mt-1 break-all font-mono text-[12px] text-zinc-700 dark:text-zinc-200" dir="ltr">{entry.detail}</p> : null}
            {hint ? <p className="mt-1 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">{tx(hint)}</p> : null}
        </li>
    );
}

function ServerErrorsPanel({ errors }: { errors: AdminPaddleServerError[] }) {
    const { tx } = useI18n();
    return (
        <Panel title={tx(C.serverTitle)} description={tx(C.serverDescription)} icon={AlertTriangle} actions={errors.length ? <Badge tone="red">{errors.length}</Badge> : undefined}>
            <p className="text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">{tx(C.serverHint)}</p>
            {errors.length === 0 ? (
                <div className="mt-3 flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-zinc-200 px-4 py-6 text-center dark:border-white/10">
                    <CheckCircle2 className="h-6 w-6 text-emerald-500" aria-hidden="true" />
                    <p className="text-[13px] font-bold text-zinc-800 dark:text-zinc-100">{tx(C.serverEmpty)}</p>
                    <p className="text-[12px] text-zinc-500 dark:text-zinc-400">{tx(C.serverEmptyHint)}</p>
                </div>
            ) : (
                <ul className="mt-2 divide-y divide-zinc-100 dark:divide-white/[0.06]">
                    {errors.map((entry, index) => <ServerErrorRow key={`${entry.at}-${index}`} entry={entry} />)}
                </ul>
            )}
        </Panel>
    );
}

// ---------------------------------------------------------------------------
// Checkout errors browsers reported
// ---------------------------------------------------------------------------

function ClientErrorRow({ entry }: { entry: AdminPaddleClientError }) {
    const { tx, locale } = useI18n();
    const when = useWhen();
    const stage = CLIENT_ERROR_STAGES[entry.stage];
    return (
        <li className="py-3">
            <div className="flex flex-wrap items-center gap-2">
                <Badge tone={stage.tone}>{tx(stage.label)}</Badge>
                <PaddleEnvironmentBadge environment={entry.environment} />
                <time dateTime={entry.at} title={formatDateTime(entry.at, locale)} className="text-[12px] text-zinc-500">{when(entry.at)}</time>
                <span className="text-[12px] text-zinc-500" dir="ltr">{entry.browser}</span>
            </div>
            {entry.message ? <p className="mt-1.5 break-all font-mono text-[12px] text-zinc-700 dark:text-zinc-200" dir="ltr">{entry.message}</p> : null}
            {entry.blockedUrl ? <p className="mt-1 break-all text-[12px] font-semibold text-amber-800 dark:text-amber-200">{tx(C.blockedAddress, { url: entry.blockedUrl })}</p> : null}
            {entry.code ? <p className="mt-0.5 font-mono text-[11.5px] text-zinc-500" dir="ltr">{tx(C.errorCode, { code: entry.code })}</p> : null}
            {stage.hint ? <p className="mt-1 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">{tx(stage.hint)}</p> : null}
        </li>
    );
}

function ClientErrorsPanel({ errors }: { errors: AdminPaddleClientError[] }) {
    const { tx } = useI18n();
    return (
        <Panel title={tx(C.errorsTitle)} description={tx(C.errorsDescription)} icon={Bug} actions={errors.length ? <Badge tone="amber">{errors.length}</Badge> : undefined}>
            <p className="text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">{tx(C.errorsHint)}</p>
            {errors.length === 0 ? (
                <div className="mt-3 flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-zinc-200 px-4 py-6 text-center dark:border-white/10">
                    <CheckCircle2 className="h-6 w-6 text-emerald-500" aria-hidden="true" />
                    <p className="text-[13px] font-bold text-zinc-800 dark:text-zinc-100">{tx(C.errorsEmpty)}</p>
                    <p className="text-[12px] text-zinc-500 dark:text-zinc-400">{tx(C.errorsEmptyHint)}</p>
                    <a href="/plans" target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-[12.5px] font-semibold text-indigo-600 hover:underline dark:text-indigo-300">
                        {tx(C.openPlans)}<ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                </div>
            ) : (
                <ul className="mt-2 divide-y divide-zinc-100 dark:divide-white/[0.06]">
                    {errors.map((entry, index) => <ClientErrorRow key={`${entry.at}-${index}`} entry={entry} />)}
                </ul>
            )}
        </Panel>
    );
}

// ---------------------------------------------------------------------------
// Sales gate, catalog and price mapping (configured environment)
// ---------------------------------------------------------------------------

function SalesGate({ data, onChanged }: { data: AdminPaddleResponse; onChanged: (next: AdminPaddleResponse) => void }) {
    const { tx } = useI18n();
    const toast = useToast();
    const errorText = useErrorText();
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<ApiFailure | null>(null);
    const open = data.salesOpen;
    const sandbox = data.config.environment === "sandbox";
    const env = tx(PADDLE_ENVIRONMENT_COPY[data.config.environment]);

    const submit = async (next: boolean) => {
        setBusy(true);
        setError(null);
        const result = await adminPost<AdminPaddleResponse>("/api/admin/paddle", { action: "setSalesOpen", open: next });
        setBusy(false);
        if (!result.ok) {
            setError(result);
            if (!next) toast("error", errorText(result));
            return false;
        }
        onChanged(result.data);
        toast("success", tx(next ? C.salesOpened : C.salesClosed));
        return true;
    };

    return (
        <div className={cx("rounded-2xl border p-4", open ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/25 dark:bg-emerald-500/[0.06]" : "border-amber-200 bg-amber-50/60 dark:border-amber-500/25 dark:bg-amber-500/[0.06]")}>
            <div className="flex flex-wrap items-center gap-3">
                <Store className={cx("h-5 w-5 shrink-0", open ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-300")} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-black text-zinc-900 dark:text-white">{tx(open ? C.salesOpenLabel : C.salesClosedLabel)}</p>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">{tx(open ? C.salesOpenHint : C.salesClosedHint)}</p>
                </div>
                {data.owner ? (
                    <Switch
                        checked={open}
                        busy={busy}
                        label={tx(C.salesSwitch)}
                        onChange={(next) => {
                            if (next) {
                                setError(null);
                                setConfirming(true);
                            } else {
                                void submit(false);
                            }
                        }}
                    />
                ) : (
                    <span className="text-[12px] text-zinc-500">{tx(C.ownerOnly)}</span>
                )}
            </div>
            {sandbox ? (
                <p className={cx("mt-2 flex items-start gap-1.5 text-[12px] leading-relaxed", open ? "font-bold text-red-700 dark:text-red-300" : "text-zinc-500 dark:text-zinc-400")}>
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{tx(C.sandboxOpenWarning)}
                </p>
            ) : null}
            <ConfirmDialog
                open={confirming}
                onClose={() => {
                    if (!busy) setConfirming(false);
                }}
                onConfirm={async () => {
                    if (await submit(true)) setConfirming(false);
                }}
                title={tx(C.openTitle, { env })}
                description={tx(sandbox ? C.openSandboxBody : C.openLiveBody)}
                confirmLabel={tx(C.openConfirm)}
                icon={Store}
                tone={sandbox ? "danger" : "default"}
                busy={busy}
                error={error}
            />
        </div>
    );
}

function CatalogReportView({ report, onClose }: { report: AdminPaddleCatalogReport; onClose: () => void }) {
    const { tx, locale } = useI18n();
    const outcome = { created: { tone: "emerald", copy: C.outcomeCreated }, reused: { tone: "zinc", copy: C.outcomeReused }, conflict: { tone: "amber", copy: C.outcomeConflict } } as const;
    return (
        <div className="mt-3 rounded-2xl border border-zinc-200 p-3 dark:border-white/10">
            <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] font-black text-zinc-900 dark:text-white">{tx(C.reportTitle, { env: tx(PADDLE_ENVIRONMENT_COPY[report.environment]) })}</p>
                <IconButton icon={X} label={tx(C.closeReport)} onClick={onClose} />
            </div>
            <ul className="mt-2 space-y-1 text-[12.5px] text-zinc-700 dark:text-zinc-300">
                {report.products.map((product) => (
                    <li key={product.productId} className="flex flex-wrap items-center gap-2">
                        <span>{tx(product.created ? C.productCreated : C.productReused, { name: tx(PLAN_COPY[product.plan].name) })}</span>
                        <code className="text-[11px] text-zinc-500" dir="ltr">{product.productId}</code>
                    </li>
                ))}
            </ul>
            <ul className="mt-2 divide-y divide-zinc-100 text-[12.5px] dark:divide-white/[0.06]">
                {report.prices.map((entry) => (
                    <li key={`${entry.plan}-${entry.interval}`} className="py-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold">{tx(PLAN_COPY[entry.plan].name)} · {tx(entry.interval === "month" ? C.monthly : C.yearly)}</span>
                            <Badge tone={outcome[entry.outcome].tone}>{tx(outcome[entry.outcome].copy)}</Badge>
                            <span className="tabular-nums text-zinc-500">{formatMoney(entry.expected.amount, entry.expected.currency, locale)}</span>
                            {entry.priceId ? <code className="text-[11px] text-zinc-500" dir="ltr">{entry.priceId}</code> : null}
                        </div>
                        {entry.outcome === "conflict" ? (
                            <p className="mt-1 leading-relaxed text-amber-800 dark:text-amber-200">
                                {tx(C.conflictLine, {
                                    found: entry.found.map((price) => formatMoney(price.amount, price.currency, locale)).join(", "),
                                    expected: formatMoney(entry.expected.amount, entry.expected.currency, locale),
                                })}
                            </p>
                        ) : null}
                    </li>
                ))}
            </ul>
        </div>
    );
}

function CatalogCreator({ data, onChanged }: { data: AdminPaddleResponse; onChanged: (next: AdminPaddleResponse) => void }) {
    const { tx, locale } = useI18n();
    const toast = useToast();
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<ApiFailure | null>(null);
    const [report, setReport] = useState<AdminPaddleCatalogReport | null>(null);
    const expected = data.expectedPrices;
    const env = tx(PADDLE_ENVIRONMENT_COPY[data.config.environment]);
    const summary = PAID_PLAN_IDS.map((plan) => `${tx(PLAN_COPY[plan].name)} ${formatMoney(expected[plan].month, expected.currency, locale)}/${tx(C.monthShort)}, ${formatMoney(expected[plan].year, expected.currency, locale)}/${tx(C.yearShort)}`).join("; ");

    const create = async () => {
        setBusy(true);
        setError(null);
        const result = await adminPost<AdminPaddleCatalogResponse>("/api/admin/paddle", { action: "createCatalog" });
        setBusy(false);
        if (!result.ok) {
            setError(result);
            return;
        }
        setConfirming(false);
        const { report: next, ...payload } = result.data;
        setReport(next);
        onChanged(payload);
        const conflicts = next.prices.filter((entry) => entry.outcome === "conflict").length;
        toast(conflicts ? "info" : "success", conflicts ? tx(C.catalogWithConflicts, { count: conflicts }) : tx(C.catalogDone));
    };

    return (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-4 dark:border-white/15">
            <div className="flex flex-wrap items-center gap-3">
                <PackagePlus className="h-5 w-5 shrink-0 text-indigo-500" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-black text-zinc-900 dark:text-white">{tx(C.catalogTitle)}</p>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">{tx(C.catalogHint, { summary })}</p>
                    {!data.config.apiKey ? <p className="mt-1 text-[12px] font-semibold text-amber-700 dark:text-amber-300">{tx(C.catalogNeedsKey)}</p> : null}
                </div>
                <Button
                    icon={PackagePlus}
                    size="sm"
                    disabled={!data.config.apiKey}
                    onClick={() => {
                        setError(null);
                        setConfirming(true);
                    }}
                >
                    {tx(C.catalogButton)}
                </Button>
            </div>
            {report ? <CatalogReportView report={report} onClose={() => setReport(null)} /> : null}
            <ConfirmDialog
                open={confirming}
                onClose={() => {
                    if (!busy) setConfirming(false);
                }}
                onConfirm={() => void create()}
                title={tx(C.catalogConfirmTitle, { env })}
                description={tx(C.catalogConfirmBody)}
                confirmLabel={tx(C.catalogConfirm)}
                icon={PackagePlus}
                tone="default"
                busy={busy}
                error={error}
            />
        </div>
    );
}

type Draft = Record<PaidPlanId, Record<BillingInterval, string>>;
type Mapping = AdminPaddleResponse["mapping"];

const PRICE_ID = /^pri_[a-z0-9]{10,64}$/;

/** The saved mapping, with suggestions in the empty slots while Paddle's list is there. */
function draftOf(data: AdminPaddleResponse): Draft {
    const slot = (plan: PaidPlanId, interval: BillingInterval) => data.mapping[plan][interval] ?? (data.api.ok ? data.suggestions[plan][interval] : null) ?? "";
    return { plus: { month: slot("plus", "month"), year: slot("plus", "year") }, pro: { month: slot("pro", "month"), year: slot("pro", "year") } };
}

function mappingOf(draft: Draft): Mapping {
    const value = (text: string) => text.trim() || null;
    return { plus: { month: value(draft.plus.month), year: value(draft.plus.year) }, pro: { month: value(draft.pro.month), year: value(draft.pro.year) } };
}

function PriceMapping({ data, catalog, onSaved }: { data: AdminPaddleResponse; catalog: PlanCatalog | null; onSaved: (next: AdminPaddleResponse) => void }) {
    const { tx, locale } = useI18n();
    const toast = useToast();
    const errorText = useErrorText();
    const when = useWhen();
    const [draft, setDraft] = useState(() => draftOf(data));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<ApiFailure | null>(null);
    const manual = !data.api.ok;
    const byId = new Map(data.prices.map((price) => [price.id, price]));
    const mapping = mappingOf(draft);
    const dirty = JSON.stringify(mapping) !== JSON.stringify(data.mapping);
    const unsavedSuggestion = (plan: PaidPlanId, interval: BillingInterval) => {
        const value = mapping[plan][interval];
        return Boolean(value) && value === data.suggestions[plan][interval] && value !== data.mapping[plan][interval];
    };
    const invalid = (plan: PaidPlanId, interval: BillingInterval) => {
        const value = mapping[plan][interval];
        return value !== null && !PRICE_ID.test(value);
    };
    const checks = SLOTS.map(({ plan, interval }) => {
        const price = byId.get(mapping[plan][interval] ?? "");
        return price && catalog ? checkPrice(price, catalog, plan, interval, locale) : null;
    });
    const mismatches = checks.filter((check) => check?.kind === "mismatch").length;
    const periodText = (price: AdminPaddlePrice) => (price.interval === "month" ? tx(C.perMonth) : price.interval === "year" ? tx(C.perYear) : price.cycle);
    const optionLabel = (price: AdminPaddlePrice, suggested: boolean) => [
        price.productName || price.description || price.id,
        formatMoney(price.amount, price.currency, locale),
        periodText(price),
        price.trialDays ? tx(C.trial, { days: price.trialDays }) : "",
        suggested ? tx(C.suggestedMark) : "",
    ].filter(Boolean).join(" · ");

    const save = async (event: FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        const result = await adminPost<AdminPaddleResponse>("/api/admin/paddle", { action: "setPrices", prices: mapping });
        setBusy(false);
        if (!result.ok) {
            setError(result);
            return;
        }
        toast("success", tx(C.saved));
        onSaved(result.data);
    };

    return (
        <form onSubmit={(event) => void save(event)} className="rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
            <p className="flex items-center gap-2 text-[14px] font-black text-zinc-900 dark:text-white"><Tags className="h-4 w-4 text-indigo-500" aria-hidden="true" />{tx(C.mappingTitle)}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">{tx(C.mappingHint)}</p>
            {manual ? <Notice tone="warning" className="mt-3">{tx(C.manualNotice)}</Notice> : null}
            {SLOTS.some(({ plan, interval }) => unsavedSuggestion(plan, interval)) ? <Notice tone="info" className="mt-3">{tx(C.suggestionsApplied)}</Notice> : null}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {SLOTS.map(({ plan, interval }, index) => {
                    const value = draft[plan][interval];
                    const id = `paddle-price-${plan}-${interval}`;
                    const options = data.prices.filter((price) => price.interval === interval);
                    const selected = byId.get(value.trim()) ?? null;
                    const unknown = !manual && Boolean(value) && !selected;
                    const bad = manual && invalid(plan, interval);
                    const check = checks[index];
                    const update = (next: string) => setDraft((current) => ({ ...current, [plan]: { ...current[plan], [interval]: next } }));
                    return (
                        <div key={id} className="rounded-2xl border border-zinc-100 p-3 dark:border-white/[0.06]">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <label htmlFor={id} className="text-[13px] font-bold text-zinc-800 dark:text-zinc-100">{tx(PLAN_COPY[plan].name)} · {tx(interval === "month" ? C.monthly : C.yearly)}</label>
                                {unsavedSuggestion(plan, interval) ? <Badge tone="sky" icon={Sparkles}>{tx(C.suggestedBadge)}</Badge> : null}
                            </div>
                            {manual ? (
                                <input
                                    id={id}
                                    value={value}
                                    onChange={(event) => update(event.target.value)}
                                    placeholder="pri_…"
                                    dir="ltr"
                                    spellCheck={false}
                                    autoComplete="off"
                                    aria-invalid={bad || undefined}
                                    className={cx(INPUT_CLASS, "mt-1.5 font-mono text-[12.5px]", bad && "border-red-400 focus:border-red-500 focus:ring-red-500/20")}
                                />
                            ) : (
                                <select id={id} value={value} onChange={(event) => update(event.target.value)} className={cx(INPUT_CLASS, "mt-1.5")}>
                                    <option value="">{tx(C.none)}</option>
                                    {unknown ? <option value={value}>{`${value} · ${tx(C.notInPaddle)}`}</option> : null}
                                    {options.map((price) => <option key={price.id} value={price.id}>{optionLabel(price, price.id === data.suggestions[plan][interval])}</option>)}
                                </select>
                            )}
                            {selected ? <p className="mt-1 truncate font-mono text-[11px] text-zinc-500" dir="ltr">{selected.id}</p> : null}
                            {bad ? <p className="mt-1 text-[11.5px] font-semibold text-red-600 dark:text-red-400">{tx(C.invalidId)}</p> : null}
                            {unknown ? <p className="mt-1 text-[11.5px] font-semibold text-amber-700 dark:text-amber-300">{tx(C.missingPrice)}</p> : null}
                            {!manual && !options.length ? <p className="mt-1 text-[11.5px] text-zinc-500">{tx(C.noPrices)}</p> : null}
                            {check ? (
                                <p className={cx("mt-1 text-[12px] font-semibold", check.kind === "match" ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300")}>
                                    {check.kind === "match" ? tx(C.matches, { price: check.paddle }) : check.kind === "mismatch" ? tx(C.mismatch, { paddle: check.paddle, site: check.site }) : tx(C.noSitePrice)}
                                </p>
                            ) : null}
                        </div>
                    );
                })}
            </div>
            {mismatches ? <Notice tone="warning" className="mt-3">{tx(C.mismatchSummary, { count: mismatches })}</Notice> : null}
            {error ? <p role="alert" className="mt-3 text-[12.5px] font-semibold text-red-600 dark:text-red-400">{errorText(error)}</p> : null}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <span className="text-[11.5px] text-zinc-500">{data.mappingUpdatedAt ? tx(C.lastSaved, { who: data.mappingUpdatedBy ?? "—", time: when(data.mappingUpdatedAt) }) : null}</span>
                <Button type="submit" variant="primary" size="sm" icon={Save} busy={busy} disabled={!dirty || SLOTS.some(({ plan, interval }) => invalid(plan, interval))}>{tx(C.save)}</Button>
            </div>
        </form>
    );
}

/** Both environments side by side, read-only: what still has to be mapped live. */
function EnvironmentTable({ data }: { data: AdminPaddleResponse }) {
    const { tx } = useI18n();
    const copy = useClipboard();
    const { sandbox, production } = data.environments;
    const active = data.config.environment;
    const heading = (environment: PaddleEnvironment) => `${tx(PADDLE_ENVIRONMENT_COPY[environment])}${environment === active ? ` (${tx(C.envActive)})` : ""}`;
    const state = (inSandbox: boolean, live: boolean) => (inSandbox && !live
        ? <Badge tone="amber">{tx(C.missingLive)}</Badge>
        : !inSandbox && live ? <Badge tone="sky">{tx(C.missingSandbox)}</Badge>
            : inSandbox && live ? <Badge tone="emerald">{tx(C.bothMapped)}</Badge> : <Badge>{tx(C.notMapped)}</Badge>);
    const ids = (values: readonly string[]) => (values.length ? values.join(", ") : "—");
    const table = [
        ["slot", "sandbox", "live"],
        ...SLOTS.map(({ plan, interval }) => [`${plan}.${interval}`, sandbox.prices[plan][interval] ?? "", production.prices[plan][interval] ?? ""]),
        ...PAID_PLAN_IDS.map((plan) => [`${plan}.products`, sandbox.products[plan].join(","), production.products[plan].join(",")]),
    ].map((row) => row.join("\t")).join("\n");
    const cell = "py-1.5 pe-3 align-top";
    return (
        <details className="rounded-2xl border border-zinc-200 p-4 dark:border-white/10" open>
            <summary className="flex cursor-pointer list-none items-center gap-2 text-[14px] font-black text-zinc-900 dark:text-white">
                <ArrowLeftRight className="h-4 w-4 text-indigo-500" aria-hidden="true" />{tx(C.envTableTitle)}
            </summary>
            <p className="mt-1 text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">{tx(C.envTableHint, { env: tx(PADDLE_ENVIRONMENT_COPY[active]) })}</p>
            <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[36rem] text-[12px]">
                    <thead>
                        <tr className="text-[11px] uppercase tracking-wide text-zinc-400">
                            <th scope="col" className={cx(cell, "text-start font-bold")}>{tx(C.envPlan)}</th>
                            <th scope="col" className={cx(cell, "text-start font-bold")}>{heading("sandbox")}</th>
                            <th scope="col" className={cx(cell, "text-start font-bold")}>{heading("production")}</th>
                            <th scope="col" className={cx(cell, "text-start font-bold")}>{tx(C.envState)}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
                        {SLOTS.map(({ plan, interval }) => {
                            const inSandbox = sandbox.prices[plan][interval];
                            const live = production.prices[plan][interval];
                            return (
                                <tr key={`${plan}-${interval}`}>
                                    <th scope="row" className={cx(cell, "text-start font-semibold text-zinc-700 dark:text-zinc-200")}>{tx(PLAN_COPY[plan].name)} · {tx(interval === "month" ? C.monthly : C.yearly)}</th>
                                    <td className={cx(cell, "break-all font-mono text-zinc-600 dark:text-zinc-300")} dir="ltr">{inSandbox ?? "—"}</td>
                                    <td className={cx(cell, "break-all font-mono text-zinc-600 dark:text-zinc-300")} dir="ltr">{live ?? "—"}</td>
                                    <td className={cell}>{state(Boolean(inSandbox), Boolean(live))}</td>
                                </tr>
                            );
                        })}
                        {PAID_PLAN_IDS.map((plan) => (
                            <tr key={`${plan}-products`}>
                                <th scope="row" className={cx(cell, "text-start font-semibold text-zinc-700 dark:text-zinc-200")}>{tx(C.productsRow, { plan: tx(PLAN_COPY[plan].name) })}</th>
                                <td className={cx(cell, "break-all font-mono text-zinc-600 dark:text-zinc-300")} dir="ltr">{ids(sandbox.products[plan])}</td>
                                <td className={cx(cell, "break-all font-mono text-zinc-600 dark:text-zinc-300")} dir="ltr">{ids(production.products[plan])}</td>
                                <td className={cell}>{state(sandbox.products[plan].length > 0, production.products[plan].length > 0)}</td>
                            </tr>
                        ))}
                        <tr>
                            <th scope="row" className={cx(cell, "text-start font-semibold text-zinc-700 dark:text-zinc-200")}>{tx(C.salesRow)}</th>
                            <td className={cell}>{tx(sandbox.salesOpen ? C.salesOpenShort : C.salesClosedShort)}</td>
                            <td className={cell}>{tx(production.salesOpen ? C.salesOpenShort : C.salesClosedShort)}</td>
                            <td className={cell} />
                        </tr>
                    </tbody>
                </table>
            </div>
            <div className="mt-3 flex justify-end">
                <Button size="sm" icon={ClipboardCopy} onClick={() => void copy(table)}>{tx(C.envCopy)}</Button>
            </div>
        </details>
    );
}

function SalesPanel({ data, catalog, onChanged }: { data: AdminPaddleResponse; catalog: PlanCatalog | null; onChanged: (next: AdminPaddleResponse) => void }) {
    const { tx } = useI18n();
    const environment = data.config.environment;
    const env = tx(PADDLE_ENVIRONMENT_COPY[environment]);
    const otherEnvironment = environment === "sandbox" ? "production" : "sandbox";
    const other = tx(PADDLE_ENVIRONMENT_COPY[otherEnvironment]);
    const otherMapped = SLOTS.filter(({ plan, interval }) => data.environments[otherEnvironment].prices[plan][interval]).length;
    // A new draft whenever what the server says changes (after a save or a refresh with other data).
    const mappingKey = [JSON.stringify(data.mapping), JSON.stringify(data.suggestions), data.api.ok].join("|");
    return (
        <Panel
            title={tx(C.salesTitle, { env })}
            description={tx(C.salesDescription, { env })}
            icon={Store}
            actions={<PaddleEnvironmentBadge environment={environment} />}
        >
            <Notice tone={environment === "sandbox" ? "info" : "success"}>
                {tx(environment === "sandbox" ? C.mappingSandboxNote : C.mappingLiveNote)} {tx(C.otherMapped, { env: other, count: otherMapped })}
            </Notice>
            <div className="mt-4 space-y-4">
                <SalesGate data={data} onChanged={onChanged} />
                {data.owner ? <CatalogCreator data={data} onChanged={onChanged} /> : null}
                <PriceMapping key={mappingKey} data={data} catalog={catalog} onSaved={onChanged} />
                <EnvironmentTable data={data} />
            </div>
        </Panel>
    );
}

// ---------------------------------------------------------------------------
// Business details (site_config/legal)
// ---------------------------------------------------------------------------

const LEGAL_KEYS = ["legalName", "brand", "contactEmail", "address", "taxId", "kep"] as const;
type LegalKey = (typeof LEGAL_KEYS)[number];

const LEGAL_FIELDS: Record<LegalKey, { label: Copy; placeholder: Copy; hint?: Copy; email?: boolean; optional?: boolean; wide?: boolean }> = {
    legalName: {
        label: { TR: "Yasal ad", EN: "Legal name" },
        placeholder: { TR: "Ör. Ad Soyad ya da Şirket Unvanı A.Ş.", EN: "E.g. Full Name or Company Ltd." },
        hint: { TR: "Şirket unvanı; şahıs işletmesinde ad ve soyad.", EN: "The company's trade name; for a sole proprietorship, your full name." },
    },
    brand: { label: { TR: "Marka", EN: "Brand" }, placeholder: { TR: DEFAULT_BRAND, EN: DEFAULT_BRAND } },
    contactEmail: { label: { TR: "İletişim e-postası", EN: "Contact e-mail" }, placeholder: { TR: "destek@ornek.com", EN: "support@example.com" }, email: true },
    address: { label: { TR: "Adres", EN: "Address" }, placeholder: { TR: "Mahalle, cadde, no, ilçe / il", EN: "Street, number, district / city" }, wide: true },
    taxId: { label: { TR: "VKN / MERSİS no", EN: "Tax ID / MERSIS no" }, placeholder: { TR: "Yayımlamak isterseniz", EN: "If you want it published" }, optional: true },
    kep: { label: { TR: "KEP adresi", EN: "KEP address" }, placeholder: { TR: "ornek@hs01.kep.tr", EN: "name@hs01.kep.tr" }, email: true, optional: true },
};

function LegalPanel({ data, onSaved }: { data: AdminPaddleResponse; onSaved: (next: AdminPaddleResponse) => void }) {
    const { tx } = useI18n();
    const toast = useToast();
    const errorText = useErrorText();
    const when = useWhen();
    const legal = data.legal;
    const [draft, setDraft] = useState<Record<LegalKey, string>>(() => ({ legalName: legal.legalName, brand: legal.brand, contactEmail: legal.contactEmail, address: legal.address, taxId: legal.taxId, kep: legal.kep }));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<ApiFailure | null>(null);
    const editable = data.owner;
    const published = isOperatorPublished(legal);

    const save = async (event: FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        const result = await adminPost<AdminPaddleResponse>("/api/admin/paddle", { action: "setLegal", ...draft });
        setBusy(false);
        if (!result.ok) {
            setError(result);
            return;
        }
        toast("success", tx(C.legalSaved));
        onSaved(result.data);
    };

    return (
        <Panel title={tx(C.legalTitle)} description={tx(C.legalDescription)} icon={Building2} actions={<Badge tone={published ? "emerald" : "amber"}>{tx(published ? C.published : C.notPublished)}</Badge>}>
            <Notice tone="info">{tx(C.legalHint)}</Notice>
            {!editable ? <p className="mt-3 text-[12.5px] font-semibold text-zinc-500">{tx(C.legalOwnerOnly)}</p> : null}
            <form onSubmit={(event) => void save(event)} className="mt-4 grid gap-3 sm:grid-cols-2">
                {LEGAL_KEYS.map((key) => {
                    const field = LEGAL_FIELDS[key];
                    return (
                        <label key={key} className={cx(LABEL, field.wide && "sm:col-span-2")}>
                            {tx(field.label)}
                            {field.optional ? <span className="ms-1 font-normal text-zinc-400">{tx(COMMON.optional)}</span> : null}
                            <input
                                type={field.email ? "email" : "text"}
                                value={draft[key]}
                                onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
                                maxLength={OPERATOR_LIMITS[key]}
                                placeholder={tx(field.placeholder)}
                                disabled={!editable}
                                dir={field.email ? "ltr" : undefined}
                                className={cx(INPUT_CLASS, "mt-1")}
                            />
                            {field.hint ? <span className="mt-1 block text-[11.5px] font-normal text-zinc-400">{tx(field.hint)}</span> : null}
                        </label>
                    );
                })}
                {error ? <p role="alert" className="text-[12.5px] font-semibold text-red-600 sm:col-span-2 dark:text-red-400">{errorText(error)}</p> : null}
                <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
                    <span className="text-[11.5px] text-zinc-500">{legal.updatedAt ? tx(C.legalUpdated, { time: when(legal.updatedAt) }) : null}</span>
                    {editable ? <Button type="submit" variant="primary" size="sm" icon={Save} busy={busy}>{tx(C.legalSave)}</Button> : null}
                </div>
            </form>
        </Panel>
    );
}

// ---------------------------------------------------------------------------
// Subscriptions without an account
// ---------------------------------------------------------------------------

function UnlinkedRow({ entry, base, onChanged }: { entry: AdminPaddleUnlinked; base: string; onChanged: (next: AdminPaddleResponse) => void }) {
    const { tx } = useI18n();
    const toast = useToast();
    const errorText = useErrorText();
    const when = useWhen();
    const [email, setEmail] = useState(entry.customerEmail ?? "");
    const [busy, setBusy] = useState<"link" | "dismiss" | null>(null);
    const inputId = `paddle-unlinked-${entry.subscriptionId}`;

    const act = async (kind: "link" | "dismiss") => {
        setBusy(kind);
        const result = await adminPost<AdminPaddleResponse>("/api/admin/paddle", kind === "link"
            ? { action: "link", subscriptionId: entry.subscriptionId, email: email.trim() }
            : { action: "dismissUnlinked", subscriptionId: entry.subscriptionId });
        setBusy(null);
        if (!result.ok) {
            toast("error", errorText(result));
            return;
        }
        toast("success", tx(kind === "link" ? C.linked : C.dismissed));
        onChanged(result.data);
    };

    return (
        <li className="py-3">
            <div className="flex flex-wrap items-center gap-2">
                <a
                    href={`${base}/subscriptions-v2/${entry.subscriptionId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={tx(C.openInPaddle)}
                    className="inline-flex items-center gap-1 font-mono text-[12.5px] font-bold text-indigo-600 hover:underline dark:text-indigo-300"
                    dir="ltr"
                >
                    {entry.subscriptionId}<ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
                <PaddleStatusBadge status={entry.status} />
                {entry.plan ? <Badge tone={entry.plan === "pro" ? "fuchsia" : "indigo"}>{tx(PLAN_COPY[entry.plan].name)}</Badge> : null}
                {entry.seenAt ? <span className="text-[12px] text-zinc-500">{tx(C.seen, { time: when(entry.seenAt) })}</span> : null}
            </div>
            {entry.customerEmail ? <p className="mt-1 text-[12.5px] text-zinc-600 dark:text-zinc-300">{tx(C.customerEmail, { email: entry.customerEmail })}</p> : null}
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    void act("link");
                }}
                className="mt-2 flex flex-wrap gap-2"
            >
                <label className="sr-only" htmlFor={inputId}>{tx(C.accountEmail)}</label>
                <input id={inputId} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={tx(C.accountEmail)} required dir="ltr" className={cx(INPUT_CLASS, "h-8 min-w-[12rem] flex-1 py-1 text-[13px]")} />
                <Button type="submit" size="sm" icon={Link2} busy={busy === "link"} disabled={!email.trim() || busy !== null}>{tx(C.link)}</Button>
                <Button size="sm" variant="ghost" icon={EyeOff} busy={busy === "dismiss"} disabled={busy !== null} onClick={() => void act("dismiss")}>{tx(C.dismiss)}</Button>
            </form>
        </li>
    );
}

function UnlinkedPanel({ data, onChanged }: { data: AdminPaddleResponse; onChanged: (next: AdminPaddleResponse) => void }) {
    const { tx } = useI18n();
    return (
        <Panel title={tx(C.unlinkedTitle)} description={tx(C.unlinkedDescription)} icon={Unlink} actions={data.unlinked.length ? <Badge tone="amber">{data.unlinked.length}</Badge> : undefined}>
            <p className="text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">{tx(C.unlinkedHint)}</p>
            {data.unlinked.length === 0 ? <p className="mt-3 text-[13px] text-zinc-500">{tx(C.unlinkedEmpty)}</p> : (
                <ul className="mt-2 divide-y divide-zinc-100 dark:divide-white/[0.06]">
                    {data.unlinked.map((entry) => <UnlinkedRow key={entry.subscriptionId} entry={entry} base={data.dashboard.base} onChanged={onChanged} />)}
                </ul>
            )}
        </Panel>
    );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

/**
 * Admin › Subscriptions, Paddle side: connection and setup (with the
 * client-side token check), the checkout errors browsers reported, the sales
 * gate, the catalog and price mapping of the configured environment, business
 * details for the legal texts and subscriptions without an account.
 * `catalog` (the site's prices) lets the mapping flag Paddle prices that differ.
 */
export default function PaddleCard({ resource, catalog }: { resource: AdminResource<AdminPaddleResponse>; catalog: PlanCatalog | null }) {
    const data = resource.data;
    const replace = (next: AdminPaddleResponse) => resource.mutate(() => next);
    if (!data) return resource.error ? <ErrorNotice error={resource.error} onRetry={resource.reload} /> : <LoadingRows rows={3} />;
    return (
        <div className="space-y-6">
            {resource.error ? <ErrorNotice error={resource.error} onRetry={resource.reload} /> : null}
            <ConnectionPanel data={data} loading={resource.loading} onReload={resource.reload} />
            <ServerErrorsPanel errors={data.serverErrors ?? []} />
            <ClientErrorsPanel errors={data.clientErrors ?? []} />
            <SalesPanel data={data} catalog={catalog} onChanged={replace} />
            <LegalPanel key={data.legal.updatedAt ?? "new"} data={data} onSaved={replace} />
            <UnlinkedPanel data={data} onChanged={replace} />
        </div>
    );
}
