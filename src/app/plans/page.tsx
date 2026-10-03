"use client";

import { motion } from "framer-motion";
import { Bell, BellRing, Check, Clock, CreditCard, Crown, LoaderCircle, PartyPopper, RefreshCw, ShieldCheck, Sparkles, Ticket, Zap } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import Header from "@/components/Header";
import ChangePlanDialog from "@/components/Plans/ChangePlanDialog";
import { PaddleLoadError, checkoutEventError, closeCheckout, failureMessage, getPaddle, onPaddleEvent, openCheckout } from "@/components/Plans/paddle-js";
import { useRawSession } from "@/components/Provider";
import SiteFooter from "@/components/SiteFooter";
import { useI18n, type Copy } from "@/lib/i18n";
import {
    checkoutLocale,
    formatMoney,
    yearlySavingsPercent,
    type BillingErrorCode,
    type BillingInterval,
    type PaddleClientErrorStage,
    type PlanChangePreview,
} from "@/lib/paddle";
import {
    DEFAULT_PLAN_CATALOG,
    PLAN_AI_LIMITS,
    PLAN_COPY,
    PLAN_IDS,
    couponAmount,
    discountedPrice,
    normalizeCouponCode,
    type CouponRecur,
    type CouponView,
    type PaidPlanId,
    type PaddleSyncResponse,
    type PlanId,
    type PlansResponse,
} from "@/lib/plans";

const C = {
    badge: { TR: "Yakında", EN: "Coming soon" },
    badgeOpen: { TR: "Planlar açıldı", EN: "Plans are open" },
    title: { TR: "Hanogt Codev Planları", EN: "Hanogt Codev Plans" },
    subtitle: { TR: "Hanogt Codev ücretsiz kalacak. Daha fazlasını isteyenler için Plus ve Pro hazırlanıyor; şu anda ödeme alınmıyor ve hiçbir kart bilgisi istenmiyor.", EN: "Hanogt Codev stays free. Plus and Pro are being prepared for people who want more; no payments are taken right now and no card details are asked for." },
    subtitleOpen: { TR: "Hanogt Codev ücretsiz kalacak. Daha çok Hanogt AI ve destekte öncelik isteyenler için Plus ve Pro. Ödemeler Paddle üzerinden güvenle alınır; kart bilgilerin bize ulaşmaz.", EN: "Hanogt Codev stays free. Plus and Pro are for people who want more Hanogt AI and priority support. Payments are handled securely by Paddle; your card details never reach us." },
    subtitleSubscriber: { TR: "Aboneliğin Paddle üzerinden yönetilir. Yeni satışlar şu anda kapalı; mevcut aboneliğin bundan etkilenmez.", EN: "Your subscription is managed through Paddle. New sales are closed right now; your subscription isn't affected." },
    yourPlan: { TR: "Planın: {plan}", EN: "Your plan: {plan}" },
    assigned: { TR: "Hanogt ekibi tarafından tanımlandı", EN: "Assigned by the Hanogt team" },
    paidMonthly: { TR: "Aylık abonelik", EN: "Monthly subscription" },
    paidYearly: { TR: "Yıllık abonelik", EN: "Yearly subscription" },
    paidOther: { TR: "Abonelik", EN: "Subscription" },
    until: { TR: "{date} tarihine kadar", EN: "until {date}" },
    renews: { TR: "Sonraki ödeme: {date}", EN: "Next payment: {date}" },
    endsAt: { TR: "Aboneliğin {date} tarihinde sona erecek; avantajların o güne kadar sürer.", EN: "Your subscription ends on {date}; your benefits last until then." },
    keep: { TR: "Vazgeç, aboneliğim devam etsin", EN: "Undo, keep my subscription" },
    pastDue: { TR: "Son ödemen alınamadı. Paddle ödemeyi birkaç kez daha deneyecek; avantajların bu sürede devam eder.", EN: "Your last payment didn't go through. Paddle will try again a few times; your benefits continue meanwhile." },
    updatePayment: { TR: "Ödeme yöntemini güncelle", EN: "Update payment method" },
    paused: { TR: "Aboneliğin duraklatıldı; avantajların sürdürünce geri gelir.", EN: "Your subscription is paused; your benefits come back when you resume it." },
    resume: { TR: "Aboneliği sürdür", EN: "Resume subscription" },
    resumeCharge: { TR: "Sürdürünce yeni ödeme dönemi bugün başlar ve Paddle {plan} planının ücretini kayıtlı ödeme yönteminden hemen alır.", EN: "When you resume, a new billing period starts today and Paddle charges the {plan} plan to your saved payment method right away." },
    resumeFree: { TR: "Ödediğin dönem {date} tarihine kadar sürüyor; şimdi sürdürürsen ücret alınmaz.", EN: "Your paid period runs until {date}; resuming now costs nothing." },
    resumeConfirm: { TR: "Onayla ve sürdür", EN: "Confirm and resume" },
    resumeCancel: { TR: "Vazgeç", EN: "Cancel" },
    resumed: { TR: "Aboneliğin sürdürüldü; {plan} planın yeniden etkin.", EN: "Your subscription is resumed; your {plan} plan is active again." },
    ended: { TR: "Önceki aboneliğin sona erdi.", EN: "Your previous subscription has ended." },
    manage: { TR: "Aboneliği yönet", EN: "Manage subscription" },
    manageHint: { TR: "Fatura, ödeme yöntemi ve iptal Paddle'ın güvenli müşteri portalında.", EN: "Invoices, payment method and cancellation are in Paddle's secure customer portal." },
    cancelSubscription: { TR: "Ücretsiz plana dönmek için aboneliği iptal et", EN: "Cancel your subscription to go back to Free" },
    blocked: { TR: "Plan avantajların şu anda kullanıma kapalı. Bir sorun olduğunu düşünüyorsan destek talebi aç.", EN: "Your plan benefits are switched off right now. If you think that's a mistake, open a support ticket." },
    aiToday: { TR: "Bugün Hanogt AI: {used} / {limit} mesaj", EN: "Hanogt AI today: {used} / {limit} messages" },
    monthly: { TR: "Aylık", EN: "Monthly" },
    yearly: { TR: "Yıllık", EN: "Yearly" },
    save: { TR: "%{percent} tasarruf", EN: "Save {percent}%" },
    perMonth: { TR: "/ay", EN: "/month" },
    perYearShort: { TR: "/yıl", EN: "/year" },
    perYear: { TR: "Yıllık {price}", EN: "{price} per year" },
    monthlyEquivalent: { TR: "Aylık {price} karşılığı", EN: "{price} a month" },
    onlyInterval: { TR: "Bu plan şimdilik yalnızca {interval} ödemeyle satılıyor.", EN: "This plan is sold with {interval} billing only for now." },
    priceAtCheckout: { TR: "Fiyat ödeme ekranında gösterilir", EN: "The price is shown at checkout" },
    trial: { TR: "{days} gün ücretsiz dene", EN: "{days}-day free trial" },
    priceSoon: { TR: "Fiyat yakında açıklanacak", EN: "Price to be announced" },
    forever: { TR: "her zaman", EN: "forever" },
    current: { TR: "Şu anki planın", EN: "Your current plan" },
    startFree: { TR: "Ücretsiz başla", EN: "Start for free" },
    buyPlus: { TR: "Plus'a geç", EN: "Get Plus" },
    buyPro: { TR: "Pro'ya geç", EN: "Get Pro" },
    upgradePro: { TR: "Pro'ya yükselt", EN: "Upgrade to Pro" },
    switchPlus: { TR: "Plus'a geç", EN: "Switch to Plus" },
    switchYearly: { TR: "Yıllık ödemeye geç", EN: "Switch to yearly" },
    switchMonthly: { TR: "Aylık ödemeye geç", EN: "Switch to monthly" },
    ownSubscription: { TR: "Kendi aboneliğini başlat", EN: "Start your own subscription" },
    signInToBuy: { TR: "Giriş yap ve satın al", EN: "Sign in to buy" },
    payFirst: { TR: "Önce ödeme yöntemini güncelle", EN: "Update your payment method first" },
    unavailableBlocked: { TR: "Kullanıma kapalı", EN: "Not available" },
    notify: { TR: "Açılınca haber ver", EN: "Notify me when it opens" },
    notified: { TR: "Haber vereceğiz", EN: "We'll let you know" },
    notifyHint: { TR: "Bildirimden çıkmak için tekrar bas.", EN: "Press again to stop the notification." },
    signInToNotify: { TR: "Haber almak için giriş yap", EN: "Sign in to get notified" },
    planned: { TR: "Planlanıyor", EN: "Planned" },
    popular: { TR: "En kapsamlı", EN: "Most complete" },
    discount: { TR: "%{percent} indirim", EN: "{percent}% off" },
    activating: { TR: "Ödemen alındı, planın etkinleştiriliyor…", EN: "Payment received, activating your plan…" },
    welcome: { TR: "Hoş geldin! {plan} planın etkin.", EN: "Welcome! Your {plan} plan is active." },
    activationSlow: { TR: "Ödemen alındı; planın birkaç dakika içinde etkinleşecek. Hemen denemek için \"Ödememi kontrol et\"e bas.", EN: "Payment received; your plan will be active within a few minutes. To try right away, press \"Check my payment\"." },
    checkPayment: { TR: "Ödememi kontrol et", EN: "Check my payment" },
    checkPaymentHint: { TR: "Ödeme yaptın ama planın değişmedi mi?", EN: "Paid, but your plan didn't change?" },
    paymentNotFound: { TR: "Paddle'da bu hesaba ait tamamlanmış bir ödeme bulunamadı. Ödeme ekranını tamamladıysan birkaç dakika sonra tekrar dene; sürerse destek talebi oluştur.", EN: "Paddle has no completed payment for this account. If you finished the checkout, try again in a few minutes; if it persists, open a support ticket." },
    paymentPending: { TR: "Ödemen alındı, Paddle aboneliğini oluşturuyor. Planın birkaç saniye içinde açılacak; yeniden ödeme yapmana gerek yok.", EN: "Your payment went through and Paddle is creating your subscription. Your plan will be active in a few seconds; there's no need to pay again." },
    changed: { TR: "Planın değişti: {plan}.", EN: "Your plan changed: {plan}." },
    kept: { TR: "Aboneliğin devam ediyor.", EN: "Your subscription will continue." },
    failed: { TR: "İşlem tamamlanamadı. Biraz sonra tekrar dene.", EN: "That didn't work. Try again in a moment." },
    retrying: { TR: "İlk deneme olmadı, bir kez daha deneniyor…", EN: "The first try didn't work; trying once more…" },
    networkFailed: { TR: "Sunucuya ulaşılamadı. İnternet bağlantını kontrol et; reklam engelleyici, tarayıcı koruması ya da VPN kullanıyorsan bu site için kapatıp tekrar dene.", EN: "Couldn't reach the server. Check your connection; if you use an ad blocker, browser protection or a VPN, turn it off for this site and try again." },
    serverTimeout: { TR: "Sunucu zamanında yanıt vermedi; ödeme sağlayıcısı ya da veritabanı şu an yavaş. Biraz sonra tekrar dene.", EN: "The server didn't answer in time; the payment provider or the database is slow right now. Try again in a moment." },
    databaseFailed: { TR: "Hesap bilgilerine şu an ulaşılamıyor (veritabanı yanıt vermedi). Biraz sonra tekrar dene.", EN: "Your account details can't be reached right now (the database didn't answer). Try again in a moment." },
    reloadPage: { TR: "İstek bu sayfadan doğrulanamadı. Sayfayı yenileyip tekrar dene.", EN: "The request couldn't be verified from this page. Refresh the page and try again." },
    noSubscription: { TR: "Bu hesapta etkin bir abonelik bulunamadı. Sayfayı yenile.", EN: "No active subscription was found on this account. Refresh the page." },
    noChange: { TR: "Değiştirilecek bir şey yok; sayfayı yenile.", EN: "There's nothing to change; refresh the page." },
    reference: { TR: "Hata kodu: {ref}", EN: "Error code: {ref}" },
    couponQuestion: { TR: "Kupon kodun var mı?", EN: "Have a coupon code?" },
    couponLabel: { TR: "Kupon kodu", EN: "Coupon code" },
    couponApply: { TR: "Uygula", EN: "Apply" },
    couponSignIn: { TR: "Kupon kullanmak için giriş yap", EN: "Sign in to use a coupon" },
    couponSignInCode: { TR: "{code} kuponunu kullanmak için giriş yap", EN: "Sign in to use the coupon {code}" },
    couponSubscribed: { TR: "Kuponlar yeni aboneliklerde geçerlidir; mevcut aboneliğine ve plan değişikliklerine uygulanmaz.", EN: "Coupons apply to new subscriptions, not to your current one or to plan changes." },
    couponApplied: { TR: "{code} uygulandı: %{percent} indirim · {plans} · {payments}", EN: "{code} applied: {percent}% off · {plans} · {payments}" },
    couponRemove: { TR: "Kaldır", EN: "Remove" },
    couponAllPlans: { TR: "Plus ve Pro", EN: "Plus and Pro" },
    couponFirst: { TR: "ilk ödemede", EN: "on the first payment" },
    couponAll: { TR: "her ödemede", EN: "on every payment" },
    couponCount: { TR: "ilk {count} ödemede", EN: "on the first {count} payments" },
    couponOnCard: { TR: "{code} kuponuyla, {payments}", EN: "With {code}, {payments}" },
    couponInvalid: { TR: "Bu kupon kodu geçerli değil. Kodu kontrol edip tekrar dene.", EN: "This coupon code isn't valid. Check the code and try again." },
    couponExpired: { TR: "Bu kuponun süresi dolmuş.", EN: "This coupon has expired." },
    couponUsedUp: { TR: "Bu kuponun kullanım hakkı dolmuş.", EN: "This coupon has no uses left." },
    couponPlan: { TR: "Bu kupon seçtiğin planda geçerli değil.", EN: "This coupon isn't valid for the plan you picked." },
    failureTeam: { TR: "Ekip için: bu isteğin ayrıntısı Yönetici Paneli › Abonelikler › Paddle bölümündeki \"Son sunucu hataları\" listesinde (yanıt hiç gelmediyse \"Son ödeme ekranı hataları\"nda) ve Vercel günlüklerinde.", EN: "For the team: the details of this request are under Admin Panel › Subscriptions › Paddle in \"Recent server errors\" (or, when no answer came at all, in \"Recent checkout errors\") and in the Vercel logs." },
    testMode: { TR: "Test modu: satışlar henüz herkese açık değil; bu sayfayı yalnızca Hanogt ekibi ve test kullanıcıları satın alınabilir görüyor.", EN: "Test mode: sales aren't open to everyone yet; only the Hanogt team and testers see these plans as buyable." },
    sandbox: { TR: "Paddle sandbox: gerçek ödeme alınmaz, test kartıyla dene (4242 4242 4242 4242).", EN: "Paddle sandbox: no real payments; use a test card (4242 4242 4242 4242)." },
    alreadySubscribed: { TR: "Zaten bir aboneliğin var; planını bu sayfadan değiştirebilirsin.", EN: "You already have a subscription; you can change your plan on this page." },
    subscriptionPaused: { TR: "Duraklatılmış bir aboneliğin var; yenisini almak yerine onu sürdürebilirsin.", EN: "You have a paused subscription; resume it instead of buying a new one." },
    customerUnverified: { TR: "Bu e-posta adresiyle Paddle'da daha önce açılmış bir müşteri kaydı var. Güvenliğin için hesabının e-postasını doğrulamamız gerekiyor: bir kez Google ile giriş yap ya da destek talebi aç, ekibimiz kaydı hesabına bağlasın.", EN: "Paddle already has a customer record with this e-mail address. For your security we need to verify your account's address: sign in with Google once, or open a support ticket so our team can link the record to your account." },
    customerConflict: { TR: "Bu hesabın Paddle müşteri kaydı başka bir hesaba bağlı. Destek talebi aç; ekibimiz düzeltsin.", EN: "This account's Paddle customer record is linked to another account. Open a support ticket so our team can sort it out." },
    paymentDeclined: { TR: "Paddle kayıtlı ödeme yönteminden ücreti alamadı (kart reddedildi). Ödeme yöntemini güncelleyip tekrar dene.", EN: "Paddle couldn't charge your saved payment method (card declined). Update it and try again." },
    reload: { TR: "Sayfayı yenile", EN: "Refresh the page" },
    paymentLinkSignedOut: { TR: "Ödemen alındı, teşekkürler. Plan, ödemeyi yaptığın e-postayla açılmış Hanogt hesabında etkinleşir; görmek için giriş yap.", EN: "Payment received, thank you. The plan becomes active on the Hanogt account with the e-mail you paid with; sign in to see it." },
    paymentLinkDone: { TR: "Ödemen alındı, teşekkürler.", EN: "Payment received, thank you." },
    paymentMethodError: { TR: "Seçilen ödeme yöntemi kullanılamadı. Başka bir yöntem dene; sorun sürerse destek talebi aç.", EN: "The chosen payment method can't be used. Try another one; if it keeps happening, open a support ticket." },
    staffPlanHigher: { TR: "Daha yüksek bir plan ekip tarafından tanımlandı", EN: "A higher plan was assigned by the team" },
    changeInPortal: { TR: "Bu abonelik bu sayfadan değiştirilemiyor; \"Aboneliği yönet\"i kullan.", EN: "This subscription can't be changed on this page; use \"Manage subscription\"." },
    planUnavailable: { TR: "Bu plan şu anda satışta değil.", EN: "This plan isn't on sale right now." },
    billingUnavailable: { TR: "Ödemeler şu anda kapalı. Biraz sonra tekrar dene.", EN: "Payments are switched off right now. Try again later." },
    rateLimited: { TR: "Çok fazla deneme oldu. Bir dakika sonra tekrar dene.", EN: "Too many attempts. Try again in a minute." },
    signedOut: { TR: "Oturumun sona ermiş; yeniden giriş yap.", EN: "Your session has ended; please sign in again." },
    paddleError: { TR: "Paddle şu anda yanıt vermiyor ({code}). Biraz sonra tekrar dene.", EN: "Paddle isn't responding right now ({code}). Try again in a moment." },
    paddleRefused: { TR: "Paddle isteği kabul etmedi ({code}). Biraz sonra tekrar dene; sorun sürerse destek talebi aç.", EN: "Paddle didn't accept the request ({code}). Try again in a moment; if it keeps happening, open a support ticket." },
    paddleBlocked: { TR: "Ödeme ekranı yüklenemedi: Paddle'ın ödeme betiği tarayıcına ulaşmadı. Reklam engelleyici, tarayıcının izleme koruması ya da ağ ayarların (ör. kurum ağı, VPN, DNS filtresi) cdn.paddle.com adresini engelliyor olabilir. Bu site için izin verip tekrar dene.", EN: "The checkout couldn't load: Paddle's checkout script didn't reach your browser. An ad blocker, your browser's tracking protection or your network (e.g. a work network, VPN or DNS filter) may be blocking cdn.paddle.com. Allow it for this site and try again." },
    paddleBlockedUrl: { TR: "Ödeme ekranı yüklenemedi: tarayıcın {url} adresini engelledi. Reklam ya da betik engelleyiciyi veya tarayıcının izleme korumasını bu site için kapatıp tekrar dene; sorun sürerse destek talebi aç.", EN: "The checkout couldn't load: your browser blocked {url}. Turn off your ad or script blocker or your browser's tracking protection for this site and try again; if it keeps happening, open a support ticket." },
    paddleStart: { TR: "Ödeme ekranı başlatılamadı: Paddle yüklendi ama çalıştırılamadı. Biraz sonra tekrar dene; sorun sürerse destek talebi aç.", EN: "The checkout couldn't start: Paddle loaded but couldn't be started. Try again in a moment; if it keeps happening, open a support ticket." },
    paddleStartTeam: { TR: "Ekip için: Vercel'deki istemci tarafı jeton (NEXT_PUBLIC_PADDLE_CLIENT_TOKEN) başka bir Paddle hesabına ya da öbür ortama (Sandbox/Canlı) ait olabilir. Yönetici Paneli › Abonelikler › Paddle bölümündeki jeton denetimine bakın.", EN: "For the team: the client-side token in Vercel (NEXT_PUBLIC_PADDLE_CLIENT_TOKEN) may belong to another Paddle account or to the other environment (sandbox/live). See the token check under Admin Panel › Subscriptions › Paddle." },
    paddleOpen: { TR: "Ödeme ekranı açılamadı. Sayfayı yenileyip tekrar dene; sorun sürerse destek talebi aç.", EN: "The checkout couldn't open. Refresh the page and try again; if it keeps happening, open a support ticket." },
    checkoutError: { TR: "Ödeme ekranı bir hata bildirdi: {detail}", EN: "The checkout reported an error: {detail}" },
    checkoutErrorGeneric: { TR: "Ödeme ekranında bir hata oluştu. Tekrar dene; sorun sürerse destek talebi aç.", EN: "Something went wrong in the checkout. Try again; if it keeps happening, open a support ticket." },
    checkoutValidationTeam: { TR: "Ekip için: Paddle ödeme ekranını açarken isteğin bir alanını kabul etmedi (alanlar yukarıda). Olası nedenlerden biri, tarayıcıdaki istemci tarafı jetonun (NEXT_PUBLIC_PADDLE_CLIENT_TOKEN) işlemi oluşturan API anahtarından farklı bir Paddle hesabına ya da ortama ait olması; Yönetici Paneli › Abonelikler › Paddle'daki jeton denetimine bak.", EN: "For the team: Paddle refused a field of the request while opening the checkout (the fields are above). One possible cause is a client-side token (NEXT_PUBLIC_PADDLE_CLIENT_TOKEN) from another Paddle account or environment than the API key that created the transaction; see the token check under Admin Panel › Subscriptions › Paddle." },
    technical: { TR: "Teknik ayrıntı: {stage}: {message}", EN: "Technical detail: {stage}: {message}" },
    unavailable: { TR: "Plan bilgileri şu anda alınamıyor; aşağıdaki fiyatlar henüz kesinleşmedi.", EN: "Plan details can't be loaded right now; the prices below aren't final yet." },
    taxNote: { TR: "Fiyatlara bulunduğun ülkenin vergileri dahildir; kesin tutar ödeme ekranında gösterilir. Ödemeler, Kayıtlı Satıcımız (Merchant of Record) Paddle.com tarafından alınır.", EN: "Prices include the taxes of your country; the exact amount is shown at checkout. Payments are taken by Paddle.com, our Merchant of Record." },
    refundPolicy: { TR: "İade Politikası", EN: "Refund Policy" },
    terms: { TR: "Kullanım Şartları", EN: "Terms of Use" },
    faqTitle: { TR: "Sık sorulanlar", EN: "Questions" },
    q1: { TR: "Ödeme ne zaman başlayacak?", EN: "When will payments start?" },
    a1: { TR: "Henüz bir tarih yok. Planlar açıldığında bu sayfada, güncelleme günlüğünde ve \"Açılınca haber ver\" dediysen bildirimlerinde duyuracağız. O güne kadar hiçbir ücret alınmaz.", EN: "There's no date yet. When plans open we'll announce it on this page, in the changelog and, if you pressed \"Notify me\", in your notifications. Until then nothing is charged." },
    q2: { TR: "Ücretsiz plan kalkacak mı?", EN: "Will the free plan go away?" },
    a2: { TR: "Hayır. Kod editörü, oyun motoru, Arcade, Media, Hanogt Social ve Hanogt AI ücretsiz planda kalmaya devam edecek.", EN: "No. The code editor, the game engine, the Arcade, Media, Hanogt Social and Hanogt AI stay in the free plan." },
    q3: { TR: "Kupon kodum var, ne yapmalıyım?", EN: "I have a coupon code. What do I do?" },
    a3: { TR: "Kodunu sakla; planlar açıldığında satın alma sırasında kullanabileceksin. Kuponların bitiş tarihi kupon verilirken belirtilir.", EN: "Keep it; you'll be able to use it at checkout once plans open. A coupon's expiry date is given with the coupon." },
    q4: { TR: "Planım nasıl tanımlandı?", EN: "How did I get a plan?" },
    a4: { TR: "Ekip; testçilere, katkı verenlere ve yarışma kazananlarına planı elle tanımlayabilir. Bugün planın canlı avantajı daha yüksek Hanogt AI sınırı ve destek taleplerinde önceliktir.", EN: "The team can assign a plan by hand to testers, contributors and contest winners. Today, a plan's live benefits are a higher Hanogt AI limit and priority on support tickets." },
    bq1: { TR: "Ödemeyi kim alıyor?", EN: "Who takes the payment?" },
    ba1: { TR: "Ödemeler Paddle üzerinden alınır. Paddle.com, Hanogt Codev siparişlerinin Kayıtlı Satıcısıdır (Merchant of Record): ödemeyi alır, faturayı keser ve vergileri hesaplar. Kart bilgilerin Hanogt Codev'e hiç ulaşmaz.", EN: "Payments go through Paddle. Paddle.com is the Merchant of Record for Hanogt Codev orders: it takes the payment, issues the invoice and handles taxes. Your card details never reach Hanogt Codev." },
    bq2: { TR: "Aboneliğimi nasıl iptal ederim?", EN: "How do I cancel?" },
    ba2: { TR: "Bu sayfada \"Aboneliği yönet\"e bas; Paddle'ın müşteri portalından aboneliğini iptal edebilirsin. İptal, ödediğin dönemin sonunda geçerli olur ve o güne kadar avantajların sürer.", EN: "Press \"Manage subscription\" on this page and cancel in Paddle's customer portal. Cancellation takes effect at the end of the period you paid for, and your benefits last until then." },
    bq3: { TR: "İade alabilir miyim?", EN: "Can I get a refund?" },
    ba3: { TR: "Bir aboneliğin ilk ödemesinden sonraki 14 gün içinde iade isteyebilirsin. Ayrıntılar İade Politikası'nda.", EN: "You can ask for a refund within 14 days of a subscription's first payment. The details are in the Refund Policy." },
    bq4: { TR: "Planımı değiştirebilir miyim?", EN: "Can I change my plan?" },
    ba4: { TR: "Evet. Plus ile Pro arasında ya da aylık ile yıllık ödeme arasında geçebilirsin. Kalan süren için fark orantılı hesaplanır ve onaylamadan önce gösterilir.", EN: "Yes. You can move between Plus and Pro, or between monthly and yearly billing. The difference for the rest of your period is prorated and shown before you confirm." },
    bq5: { TR: "Kupon kodumu nerede kullanırım?", EN: "Where do I use a coupon code?" },
    ba5: { TR: "Bu sayfada \"Kupon kodun var mı?\"ya bas, kodunu yazıp Uygula'ya bas: indirimli tutar planın üzerinde, ödeme ekranında da indirim olarak görünür. İstersen kodu ödeme ekranındaki \"İndirim ekle\"ye de yazabilirsin. Kuponun hangi planda ve kaç ödemede geçerli olduğu kod uygulanınca yazılır. Kuponlar yeni aboneliklerde geçerlidir; mevcut aboneliğe ya da plan değişikliğine uygulanmaz.", EN: "On this page press \"Have a coupon code?\", enter it and press Apply: the discounted amount shows on the plan and as a discount at checkout. You can also enter it with \"Add discount\" at checkout. Which plan and how many payments it covers is shown once it's applied. Coupons apply to new subscriptions, not to an existing one or to plan changes." },
} satisfies Record<string, Copy>;

const ACCENT: Record<PlanId, { ring: string; icon: typeof Zap; gradient: string }> = {
    free: { ring: "border-zinc-200 dark:border-white/10", icon: Sparkles, gradient: "from-zinc-500 to-zinc-700" },
    plus: { ring: "border-indigo-300/70 dark:border-indigo-400/30", icon: Zap, gradient: "from-indigo-500 to-sky-500" },
    pro: { ring: "border-transparent", icon: Crown, gradient: "from-fuchsia-500 to-amber-500" },
};

const PLAN_RANK: Record<PlanId, number> = { free: 0, plus: 1, pro: 2 };

type Notice = {
    tone: "info" | "success" | "error";
    copy: Copy;
    vars?: Record<string, string | number>;
    /** For the team and testers only: what to check. */
    hint?: Copy;
    /** For the team and testers only: the stage that failed and Paddle's own words. */
    technical?: { stage: string; message: string };
    /** Under every failed request: what failed, how and where ("unavailable/database_error · HTTP 500 · subscription · 2.1 s"). */
    reference?: string;
    /** A button under the message: ask Paddle about the payment now, resume a paused subscription, update the payment method or reload. */
    action?: "checkPayment" | "resume" | "updatePayment" | "reload";
} | null;

/** Paddle checkout events the page reports, as stages of POST /api/paddle/client-error. */
const EVENT_STAGES: Partial<Record<string, PaddleClientErrorStage>> = {
    "checkout.error": "checkout_error",
    "checkout.failed": "checkout_failed",
    // A declined card: Paddle explains it inside its own frame and lets the person try again.
    "checkout.payment.failed": "payment_error",
    // No usable payment method (e.g. none offered for the country): the page says so too.
    "checkout.payment.error": "payment_error",
};

type ClientErrorReport = { stage: PaddleClientErrorStage; message: string; blockedUrl?: string | null; code?: string | null };

/** Fire and forget: the team sees it under Admin › Subscriptions › Paddle. */
function postClientError(report: ClientErrorReport) {
    void fetch("/api/paddle/client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        keepalive: true,
        body: JSON.stringify(report),
    }).catch(() => undefined);
}

const ERROR_COPY: Partial<Record<BillingErrorCode, Copy>> = {
    already_subscribed: C.alreadySubscribed,
    subscription_paused: C.subscriptionPaused,
    customer_unverified: C.customerUnverified,
    customer_conflict: C.customerConflict,
    payment_declined: C.paymentDeclined,
    payment_pending: C.paymentPending,
    plan_unavailable: C.planUnavailable,
    plan_blocked: C.blocked,
    billing_unavailable: C.billingUnavailable,
    rate_limited: C.rateLimited,
    unauthorized: C.signedOut,
    forbidden_origin: C.reloadPage,
    invalid_request: C.reloadPage,
    no_subscription: C.noSubscription,
    no_change: C.noChange,
    coupon_invalid: C.couponInvalid,
    coupon_expired: C.couponExpired,
    coupon_used_up: C.couponUsedUp,
    coupon_plan: C.couponPlan,
};

async function fetchPlans(): Promise<PlansResponse | null> {
    try {
        const response = await fetch("/api/plans", { cache: "no-store", credentials: "same-origin" });
        return response.ok ? await response.json() as PlansResponse : null;
    } catch {
        return null;
    }
}

/** A billing request that failed, with everything the page and the team need to tell why. */
type RequestFailure = {
    ok: false;
    /** Our error code; "network": no answer at all; "timeout": the server (504) or the page gave up waiting. */
    error: BillingErrorCode | "network" | "timeout";
    /** HTTP status; null when no answer came. */
    status: number | null;
    /** False when the answer wasn't ours (no answer, or an error page such as Vercel's 504). */
    json: boolean;
    /** The route's code: Paddle's error code, "database_error" or "internal_error". */
    code?: string;
    /** What the route was doing (catalog, subscription, customer, transaction…). */
    step?: string;
    /** Paddle's HTTP status (0: Paddle wasn't reached). */
    paddleStatus?: number;
    /** Only for the team, testers and the sandbox. */
    detail?: string;
    /** How long the request took. */
    ms: number;
};

type RequestResult<T> = { ok: true; data: T } | RequestFailure;

/** Longer than the billing routes may run (60 s), so the server's own answer comes first. */
const REQUEST_TIMEOUT_MS = 70_000;
const RETRY_DELAY_MS = 1_500;
/** After a checkout: how long and how often the page asks the server to check the payment with Paddle. */
const SYNC_WINDOW_MS = 120_000;
const SYNC_DELAYS_MS = [1_500, 2_500, 4_000, 6_000] as const;

async function postJson<T>(url: string, body: unknown): Promise<RequestResult<T>> {
    const started = Date.now();
    let response: Response;
    try {
        response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify(body),
            signal: typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(REQUEST_TIMEOUT_MS) : undefined,
        });
    } catch (error) {
        const timedOut = error instanceof DOMException && error.name === "TimeoutError";
        return { ok: false, error: timedOut ? "timeout" : "network", status: null, json: false, ms: Date.now() - started };
    }
    const isJson = (response.headers.get("content-type") ?? "").includes("application/json");
    const payload = isJson ? await response.json().catch(() => null) as unknown : null;
    const fields = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : null;
    if (response.ok && fields) return { ok: true, data: fields as T };
    const text = (value: unknown, max: number) => (typeof value === "string" && value ? value.slice(0, max) : undefined);
    return {
        ok: false,
        error: (text(fields?.error, 40) as BillingErrorCode | undefined) ?? (response.status === 504 ? "timeout" : "unavailable"),
        status: response.status,
        json: Boolean(fields),
        code: text(fields?.code, 80),
        step: text(fields?.step, 40),
        paddleStatus: typeof fields?.paddleStatus === "number" ? fields.paddleStatus : undefined,
        detail: text(fields?.detail, 300),
        ms: Date.now() - started,
    };
}

/** Worth one more try: no answer, a timeout, or a failure on the way (ours or Paddle's) rather than a refusal. */
function retryable(result: RequestFailure) {
    if (result.error === "network") return true;
    // The server's 504, not the page's own 70 seconds.
    if (result.error === "timeout") return result.status !== null;
    if (!result.json) return (result.status ?? 0) >= 500;
    if (result.error === "unavailable") return true;
    if (result.error === "paddle_error") return result.paddleStatus === undefined || result.paddleStatus === 0 || result.paddleStatus === 429 || result.paddleStatus >= 500;
    return false;
}

/** One line that tells the team what failed: "unavailable/database_error · HTTP 500 · subscription · 2.1 s". */
function failureReference(result: RequestFailure) {
    return [
        result.code && result.code !== result.error ? `${result.error}/${result.code}` : result.error,
        result.status ? `HTTP ${result.status}` : null,
        result.paddleStatus !== undefined ? `Paddle ${result.paddleStatus || "-"}` : null,
        result.step ?? null,
        `${(result.ms / 1000).toFixed(1)} s`,
    ].filter(Boolean).join(" · ");
}

/** For the team: what to fix in Paddle when it names a setup problem. */
const PADDLE_SETUP_HINTS: Record<string, Copy> = {
    transaction_default_checkout_url_not_set: { TR: "Ekip için: Paddle'da varsayılan ödeme bağlantısı tanımlı değil. Paddle › Checkout › Checkout settings › Default payment link alanına https://hanogtcodev.com/plans yazıp kaydet (sandbox ve canlı hesapta ayrı ayrı).", EN: "For the team: no default payment link is set in Paddle. Enter https://hanogtcodev.com/plans under Paddle › Checkout › Checkout settings › Default payment link and save (separately for sandbox and live)." },
    transaction_checkout_url_domain_is_not_approved: { TR: "Ekip için: ödeme bağlantısının alan adı Paddle'da onaylı değil. Paddle › Checkout › Request domain approval bölümünden hanogtcodev.com için onay iste.", EN: "For the team: the payment link's domain isn't approved in Paddle. Request approval for hanogtcodev.com under Paddle › Checkout › Request domain approval." },
    transaction_checkout_not_enabled: { TR: "Ekip için: bu Paddle hesabında ödeme ekranı henüz açılmamış; Paddle'daki hesap doğrulama (onboarding) adımlarını tamamla.", EN: "For the team: checkout isn't enabled on this Paddle account yet; finish Paddle's account verification (onboarding)." },
    paddle_billing_not_enabled: { TR: "Ekip için: bu Paddle hesabında Paddle Billing açık değil (Classic hesap). Billing hesabının anahtarlarını kullan.", EN: "For the team: Paddle Billing isn't enabled on this Paddle account (a Classic account). Use a Billing account's keys." },
    forbidden: { TR: "Ekip için: Paddle API anahtarının bu işlem için izni yok. Paddle › Developer tools › Authentication bölümünde anahtara Transactions ve Customers yazma izni ver.", EN: "For the team: the Paddle API key isn't allowed to do this. Give the key write access to Transactions and Customers under Paddle › Developer tools › Authentication." },
    entity_not_found: { TR: "Ekip için: fiyat ya da müşteri bu Paddle hesabında bulunamadı (öbür ortamın kimliği olabilir). Yönetici Paneli › Abonelikler › Paddle bölümünde fiyat eşleştirmesini kontrol et.", EN: "For the team: the price or customer wasn't found in this Paddle account (it may be the other environment's id). Check the price mapping under Admin Panel › Subscriptions › Paddle." },
};

/** Answers that explain themselves; everything else also shows its error code. */
const EXPECTED_ERRORS: ReadonlySet<RequestFailure["error"]> = new Set(["already_subscribed", "payment_pending", "subscription_paused", "customer_unverified", "customer_conflict", "payment_declined", "plan_unavailable", "plan_blocked", "rate_limited", "unauthorized", "no_subscription", "no_change", "coupon_invalid", "coupon_expired", "coupon_used_up", "coupon_plan"]);
/** Answers whose notice offers a button. */
const ERROR_ACTIONS: Partial<Record<RequestFailure["error"], NonNullable<Notice>["action"]>> = {
    subscription_paused: "resume",
    payment_declined: "updatePayment",
    forbidden_origin: "reload",
    invalid_request: "reload",
    no_subscription: "reload",
    no_change: "reload",
};
/** sessionStorage: the customer portal was opened; back on this page the subscription is re-read from Paddle. */
const PORTAL_VISIT_KEY = "hanogt:paddle-portal-visit";
const COUPON_ERRORS: ReadonlySet<RequestFailure["error"]> = new Set(["coupon_invalid", "coupon_expired", "coupon_used_up", "coupon_plan"]);

/** The code of a /plans?coupon=CODE link (from a campaign); "" without one. Read on the client only. */
const readLinkCoupon = () => (new URLSearchParams(window.location.search).get("coupon") ?? "").trim().slice(0, 40);
const noSubscription = () => () => undefined;

/** Sign-in that comes back here, with a link's coupon code kept so it applies afterwards. */
function loginHref(linkCoupon: string) {
    const back = linkCoupon ? `/plans?coupon=${encodeURIComponent(linkCoupon)}` : "/plans";
    return `/login?callbackUrl=${encodeURIComponent(back)}`;
}

/** How many payments a coupon covers, in words ("on the first payment"). */
function couponPayments(recur: CouponRecur): { copy: Copy; vars?: Record<string, number> } {
    return recur === "first" ? { copy: C.couponFirst } : recur === "all" ? { copy: C.couponAll } : { copy: C.couponCount, vars: { count: recur } };
}

/** The notice for a failed request; `team` (staff, testers, the sandbox) also get the detail and where to look. */
function failureNotice(result: RequestFailure, team: boolean): NonNullable<Notice> {
    const paddleDown = result.paddleStatus === undefined || result.paddleStatus === 0 || result.paddleStatus === 429 || result.paddleStatus >= 500;
    const copy =
        result.error === "network" ? C.networkFailed
            : result.error === "timeout" ? C.serverTimeout
                : result.error === "paddle_error" ? (paddleDown ? C.paddleError : C.paddleRefused)
                    : result.code === "database_error" ? C.databaseFailed
                        : ERROR_COPY[result.error] ?? C.failed;
    const ours = result.error === "network" || result.error === "timeout" || result.error === "unavailable" || result.error === "paddle_error";
    return {
        tone: "error",
        copy,
        vars: result.error === "paddle_error" ? { code: result.code ?? "?" } : undefined,
        hint: team ? (result.error === "paddle_error" && result.code ? PADDLE_SETUP_HINTS[result.code] : undefined) ?? (ours ? C.failureTeam : undefined) : undefined,
        technical: team && result.detail ? { stage: result.step ?? "server", message: result.detail } : undefined,
        reference: EXPECTED_ERRORS.has(result.error) ? undefined : failureReference(result),
        action: ERROR_ACTIONS[result.error],
    };
}

export default function PlansPage() {
    const { tx, locale, language } = useI18n();
    const auth = useRawSession();
    const signedIn = auth.status === "authenticated";
    const [data, setData] = useState<PlansResponse | null>(null);
    const [failed, setFailed] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [notice, setNotice] = useState<Notice>(null);
    const noticeRef = useRef<HTMLDivElement>(null);
    const [period, setPeriod] = useState<BillingInterval>("month");
    const [change, setChange] = useState<{ plan: PaidPlanId; interval: BillingInterval; preview: PlanChangePreview | null; error: string } | null>(null);
    const [activating, setActivating] = useState<PaidPlanId | null>(null);
    const [reload, setReload] = useState(0);
    // A coupon the server accepted; the checkout of a plan it covers carries it.
    const [coupon, setCoupon] = useState<CouponView | null>(null);
    const [couponOpen, setCouponOpen] = useState(false);
    const [couponInput, setCouponInput] = useState("");
    const [couponError, setCouponError] = useState<Copy | null>(null);
    const couponFromLink = useRef(false);
    const linkCoupon = useSyncExternalStore(noSubscription, readLinkCoupon, () => "");
    const signInHref = loginHref(linkCoupon);
    const purchased = useRef<PaidPlanId | null>(null);
    // The person picked Monthly or Yearly themselves; until then a subscriber sees their own billing period.
    const periodTouched = useRef(false);
    const [resumeOpen, setResumeOpen] = useState(false);

    useEffect(() => {
        if (auth.status === "loading") return;
        let active = true;
        void fetchPlans().then((payload) => {
            if (!active) return;
            setData(payload);
            setFailed(!payload);
            const own = payload?.me?.billing;
            if (own?.entitled && own.interval && !periodTouched.current) setPeriod(own.interval);
        });
        return () => {
            active = false;
        };
    }, [auth.status, reload]);

    const catalog = data?.catalog ?? DEFAULT_PLAN_CATALOG;
    const checkout = data?.checkout ?? null;
    const me = data?.me ?? null;
    const billing = me?.billing ?? null;
    // The server decides (the grace after a period end included), so the page never offers changes Paddle would refuse.
    const liveSubscription = Boolean(billing?.plan && billing.entitled);
    // What the Paddle event handlers read: they're registered once.
    const pageState = useRef({ signedIn, liveSubscription });
    useEffect(() => {
        pageState.current = { signedIn, liveSubscription };
    }, [signedIn, liveSubscription]);
    const onSale = (plan: PaidPlanId) => checkout?.onSale[plan] ?? [];
    const anyOnSale = onSale("plus").length > 0 || onSale("pro").length > 0;

    // The team and testers (and anyone in the sandbox, where nothing is charged) also see why Paddle failed.
    const diagnostics = Boolean(checkout && (checkout.testMode || checkout.environment === "sandbox" || me?.isStaff));
    const reported = useRef(new Set<string>());

    /** Tells the team about a failure, once per page view and kind (the route keeps no names). */
    const report = useCallback((entry: ClientErrorReport) => {
        if (!signedIn) return;
        const key = `${entry.stage}:${entry.code ?? ""}`;
        if (reported.current.has(key)) return;
        reported.current.add(key);
        postClientError(entry);
    }, [signedIn]);

    /** A failure of getPaddle or openCheckout, in words for its stage. */
    const showPaddleFailure = useCallback((error: unknown) => {
        const failure = error instanceof PaddleLoadError ? error : new PaddleLoadError("init", failureMessage(error));
        const starting = failure.stage === "missing" || failure.stage === "init";
        setNotice({
            tone: "error",
            copy: failure.stage === "blocked" ? (failure.blockedUrl ? C.paddleBlockedUrl : C.paddleBlocked) : starting ? C.paddleStart : C.paddleOpen,
            vars: failure.blockedUrl ? { url: failure.blockedUrl } : undefined,
            hint: diagnostics && starting ? C.paddleStartTeam : undefined,
            technical: diagnostics ? { stage: failure.stage, message: failure.message } : undefined,
        });
        report({ stage: failure.stage, message: failure.message, blockedUrl: failure.blockedUrl });
    }, [diagnostics, report]);

    /** Shows why a billing request failed; when our code never answered, the team hears about it from here. */
    const showRequestFailure = useCallback((route: string, result: RequestFailure) => {
        setNotice(failureNotice(result, diagnostics));
        if (result.json) return; // The route logged and kept it itself.
        const code = result.error === "network" ? "network" : result.status ? `http_${result.status}` : "timeout";
        report({ stage: "request", code, message: `POST /api/paddle/${route}: ${result.status ? `HTTP ${result.status}` : result.error}, ${(result.ms / 1000).toFixed(1)} s` });
    }, [diagnostics, report]);

    /** A request that may simply be tried again (opening a checkout or the portal): once, after a short pause. */
    const postWithRetry = async <T,>(url: string, body: unknown): Promise<RequestResult<T>> => {
        const first = await postJson<T>(url, body);
        if (first.ok || !retryable(first)) return first;
        setNotice({ tone: "info", copy: C.retrying });
        await new Promise((resolve) => window.setTimeout(resolve, RETRY_DELAY_MS));
        const second = await postJson<T>(url, body);
        if (second.ok) setNotice(null);
        return second;
    };

    // Paddle sends payment links (the default payment link, /plans?_ptxn=…); Paddle.js opens them itself.
    // Customers get Paddle.js right away too, so Paddle Retain can reach them (pwCustomer).
    const customerId = me?.paddleCustomerId ?? null;
    useEffect(() => {
        if (!checkout) return;
        const paymentLink = new URLSearchParams(window.location.search).has("_ptxn");
        if (!paymentLink && !customerId) return;
        getPaddle(checkout, { customerId, debug: checkout.testMode }).catch((error: unknown) => {
            // Loaded only for Paddle Retain it fails quietly; a payment link someone opened doesn't.
            if (paymentLink) showPaddleFailure(error);
        });
    }, [checkout, customerId, showPaddleFailure]);

    useEffect(() => {
        /** A payment link (?_ptxn=…) is done with: a refresh mustn't open the same transaction again. */
        const forgetPaymentLink = () => {
            const url = new URL(window.location.href);
            if (!url.searchParams.has("_ptxn")) return;
            url.searchParams.delete("_ptxn");
            window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
        };
        onPaddleEvent((event) => {
            if (event.name === "checkout.closed") {
                forgetPaymentLink();
                return;
            }
            if (event.name === "checkout.completed") {
                forgetPaymentLink();
                const { signedIn: isSignedIn, liveSubscription: subscribed } = pageState.current;
                // A payment link paid without signing in: there's no account here to follow up.
                if (!isSignedIn) {
                    setNotice({ tone: "success", copy: C.paymentLinkSignedOut });
                    return;
                }
                // A payment link for a subscription that already runs (e.g. a past-due invoice): no "welcome".
                if (!purchased.current && subscribed) {
                    setNotice({ tone: "success", copy: C.paymentLinkDone });
                    setReload((value) => value + 1);
                    return;
                }
                setActivating(purchased.current ?? "plus");
                return;
            }
            const stage = EVENT_STAGES[event.name ?? ""];
            if (!stage) return;
            const error = checkoutEventError(event);
            report({ stage, message: error.message, code: error.code || null });
            // A declined card is explained by Paddle inside its own frame, where another card can be tried.
            if (event.name === "checkout.payment.failed") return;
            // No usable payment method: Paddle's frame may say little, so the page says it too.
            if (event.name === "checkout.payment.error") {
                setNotice({ tone: "error", copy: C.paymentMethodError, technical: diagnostics ? { stage, message: error.message } : undefined });
                return;
            }
            // A checkout that can't start leaves only Paddle's "Something went wrong" over the page.
            if (stage === "checkout_error") closeCheckout();
            setNotice({
                tone: "error",
                copy: error.text ? C.checkoutError : C.checkoutErrorGeneric,
                vars: error.text ? { detail: error.text } : undefined,
                hint: diagnostics && error.code === "validation" ? C.checkoutValidationTeam : undefined,
                technical: diagnostics ? { stage, message: error.message } : undefined,
            });
        });
        return () => onPaddleEvent(null);
    }, [diagnostics, report]);

    // The notice sits above the plans; after a click lower down it may be out of sight.
    useEffect(() => {
        if (notice?.tone === "error") noticeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, [notice]);

    // Back from the portal with the browser's back button, the page comes from its cache with the
    // portal button still busy: free the buttons and read the plan again.
    useEffect(() => {
        const onShow = (event: PageTransitionEvent) => {
            if (!event.persisted) return;
            setBusy(null);
            setReload((value) => value + 1);
        };
        window.addEventListener("pageshow", onShow);
        return () => window.removeEventListener("pageshow", onShow);
    }, []);

    // Back from Paddle's customer portal (a cancellation, a new card): ask Paddle about the subscription now
    // instead of waiting for its notification.
    const hasAccount = Boolean(data?.me);
    useEffect(() => {
        if (!hasAccount) return;
        let visited = 0;
        try {
            visited = Number(window.sessionStorage.getItem(PORTAL_VISIT_KEY) || 0);
            window.sessionStorage.removeItem(PORTAL_VISIT_KEY);
        } catch {
            // Storage blocked: Paddle's notification updates the page later.
        }
        if (!visited || Date.now() - visited > 60 * 60_000) return;
        let active = true;
        void postJson<PaddleSyncResponse>("/api/paddle/sync", { refresh: true }).then(async (result) => {
            if (!active || !result.ok) return;
            const payload = await fetchPlans();
            if (active && payload) setData(payload);
        });
        return () => {
            active = false;
        };
    }, [hasAccount]);

    // After a checkout: ask the server to check the payment with Paddle until the plan is active.
    // Paddle's notification usually gets there first; this also works when it's late or never arrives.
    useEffect(() => {
        if (!activating) return;
        let stopped = false;
        let timer = 0;
        let attempt = 0;
        let delay: number = SYNC_DELAYS_MS[0];
        const started = Date.now();
        const welcome = (plan: PaidPlanId) => {
            setActivating(null);
            setNotice({ tone: "success", copy: C.welcome, vars: { plan: PLAN_COPY[plan].name.EN } });
        };
        const tick = async () => {
            attempt += 1;
            const result = await postJson<PaddleSyncResponse>("/api/paddle/sync", {});
            if (stopped) return;
            if (result.ok && result.data.state === "active") {
                const payload = await fetchPlans();
                if (stopped) return;
                if (payload) setData(payload);
                welcome(result.data.billing?.plan ?? activating);
                return;
            }
            // Signed out for real, or a page the server can't verify: stop. A 401 while this page still has its
            // session (or a 503 when the database didn't answer) is a hiccup: keep following the payment.
            const signedOut = !result.ok && result.error === "unauthorized" && !pageState.current.signedIn;
            if (!result.ok && (signedOut || result.error === "forbidden_origin")) {
                setActivating(null);
                setNotice({ tone: "error", copy: signedOut ? C.signedOut : C.reloadPage, action: signedOut ? undefined : "reload" });
                return;
            }
            if (Date.now() - started >= SYNC_WINDOW_MS) {
                // The notification may have got there meanwhile.
                const payload = await fetchPlans();
                if (stopped) return;
                if (payload) setData(payload);
                const live = payload?.me?.billing?.plan && payload.me.billing.entitled ? payload.me.billing.plan : null;
                if (live) welcome(live);
                else {
                    setActivating(null);
                    setNotice({ tone: "info", copy: C.activationSlow, action: "checkPayment" });
                }
                return;
            }
            delay = !result.ok && result.error === "rate_limited" ? Math.min(delay * 2, 20_000) : SYNC_DELAYS_MS[Math.min(attempt, SYNC_DELAYS_MS.length - 1)];
            timer = window.setTimeout(() => void tick(), delay);
        };
        timer = window.setTimeout(() => void tick(), delay);
        return () => {
            stopped = true;
            window.clearTimeout(timer);
        };
    }, [activating]);

    const money = (value: number) => {
        try {
            return new Intl.NumberFormat(locale, { style: "currency", currency: catalog.currency, maximumFractionDigits: value % 1 ? 2 : 0 }).format(value);
        } catch {
            return `$${value}`;
        }
    };
    const date = (iso: string) => {
        try {
            return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
        } catch {
            return iso.slice(0, 10);
        }
    };
    const checkoutSettings = () => ({
        theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
        ...(checkoutLocale(language) ? { locale: checkoutLocale(language) } : {}),
    });
    const intervalFor = (plan: PaidPlanId) => (onSale(plan).includes(period) ? period : onSale(plan)[0] ?? period);

    const toggleWaitlist = async (plan: PaidPlanId) => {
        if (!me) return;
        const join = !me.waitlist.includes(plan);
        setBusy(`waitlist:${plan}`);
        setNotice(null);
        const result = await postJson<{ waitlist?: PaidPlanId[] }>("/api/plans", { action: "waitlist", plan, join });
        if (result.ok && Array.isArray(result.data.waitlist)) {
            const waitlist = result.data.waitlist;
            setData((current) => (current?.me ? { ...current, me: { ...current.me, waitlist } } : current));
        } else {
            setNotice(result.ok ? { tone: "error", copy: C.failed } : failureNotice(result, diagnostics));
        }
        setBusy(null);
    };

    // Only a new subscription's checkout carries a coupon: plan changes don't, so a subscriber sees no coupon prices.
    const couponFor = (plan: PaidPlanId) => (!liveSubscription && coupon && (coupon.plan === "any" || coupon.plan === plan) ? coupon : null);

    const applyCoupon = async (value: string) => {
        const code = value.trim().toUpperCase();
        if (!code) return;
        setBusy("coupon");
        setCouponError(null);
        const result = await postJson<{ coupon: CouponView }>("/api/paddle/coupon", { code });
        setBusy(null);
        if (result.ok) {
            setCoupon(result.data.coupon);
            setCouponInput("");
            setCouponOpen(false);
            return;
        }
        setCouponOpen(true);
        setCouponInput(code);
        setCouponError(failureNotice(result, diagnostics).copy);
    };

    const submitCoupon = (event: FormEvent) => {
        event.preventDefault();
        void applyCoupon(couponInput);
    };

    // A link with ?coupon=CODE (e.g. from a campaign) applies the code once the visitor is signed in.
    useEffect(() => {
        if (!signedIn || !checkout || liveSubscription || couponFromLink.current || !linkCoupon) return;
        couponFromLink.current = true;
        void Promise.resolve().then(() => applyCoupon(linkCoupon));
    });

    const startCheckout = async (plan: PaidPlanId) => {
        if (!checkout) return;
        setBusy(`checkout:${plan}`);
        setNotice(null);
        const applied = couponFor(plan);
        const result = await postWithRetry<{ transactionId: string }>("/api/paddle/checkout", { plan, interval: intervalFor(plan), ...(applied ? { coupon: applied.code } : {}) });
        if (!result.ok) {
            showRequestFailure("checkout", result);
            // A subscription the page didn't know about (or a paused one) is stored now: show it.
            if (result.error === "already_subscribed" || result.error === "subscription_paused") setReload((value) => value + 1);
            // Paid already, Paddle is still creating the subscription: follow it up like a completed checkout.
            if (result.error === "payment_pending") setActivating(plan);
            // A coupon that stopped working meanwhile (expired, used up) is taken off; the plan can still be bought.
            if (COUPON_ERRORS.has(result.error)) setCoupon(null);
            setBusy(null);
            return;
        }
        try {
            const settings = checkoutSettings();
            const paddle = await getPaddle(checkout, { settings, customerId, debug: checkout.testMode });
            purchased.current = plan;
            openCheckout(paddle, result.data.transactionId, settings);
        } catch (error) {
            showPaddleFailure(error);
        }
        setBusy(null);
    };

    const openPortal = async (target: "overview" | "updatePayment" | "cancel") => {
        setBusy("portal");
        setNotice(null);
        const result = await postWithRetry<{ overview: string; updatePayment: string | null; cancel: string | null }>("/api/paddle/subscription", { action: "portal" });
        if (result.ok) {
            try {
                window.sessionStorage.setItem(PORTAL_VISIT_KEY, String(Date.now()));
            } catch {
                // Storage blocked: Paddle's notification updates the page later.
            }
            window.location.assign(result.data[target] ?? result.data.overview);
            return;
        }
        showRequestFailure("subscription", result);
        setBusy(null);
    };

    /** "Check my payment": the server asks Paddle about the account's purchase now. */
    const checkPayment = async () => {
        setBusy("sync");
        setNotice(null);
        const result = await postJson<PaddleSyncResponse>("/api/paddle/sync", {});
        setBusy(null);
        if (!result.ok) {
            showRequestFailure("sync", result);
            return;
        }
        if (result.data.state === "active") {
            const payload = await fetchPlans();
            if (payload) setData(payload);
            setNotice({ tone: "success", copy: C.welcome, vars: { plan: PLAN_COPY[result.data.billing?.plan ?? "plus"].name.EN } });
            return;
        }
        if (result.data.state === "pending") {
            setActivating(result.data.billing?.plan ?? purchased.current ?? "plus");
            return;
        }
        setNotice({ tone: "info", copy: C.paymentNotFound, action: "checkPayment" });
    };

    const keepSubscription = async () => {
        setBusy("keep");
        setNotice(null);
        const result = await postJson("/api/paddle/subscription", { action: "keep" });
        if (result.ok) {
            setNotice({ tone: "success", copy: C.kept });
            setReload((value) => value + 1);
        } else {
            showRequestFailure("subscription", result);
        }
        setBusy(null);
    };

    /** Resumes the paused subscription (the server finds it; nothing is taken from the page). */
    const resumeSubscription = async () => {
        setBusy("resume");
        setNotice(null);
        const result = await postJson<{ plan?: PlanId; billing?: { plan?: PaidPlanId | null } | null }>("/api/paddle/subscription", { action: "resume" });
        setBusy(null);
        if (result.ok) {
            setResumeOpen(false);
            const plan = result.data.billing?.plan ?? billing?.plan ?? "plus";
            setNotice({ tone: "success", copy: C.resumed, vars: { plan: PLAN_COPY[plan].name.EN } });
            setReload((value) => value + 1);
            return;
        }
        showRequestFailure("subscription", result);
    };

    /** The button of a notice. */
    const noticeAction = (action: NonNullable<Notice>["action"]) => {
        if (action === "checkPayment") return void checkPayment();
        if (action === "updatePayment") return void openPortal("updatePayment");
        if (action === "reload") return window.location.reload();
        if (action === "resume") {
            setResumeOpen(true);
            setReload((value) => value + 1);
        }
    };

    /** A failure as one sentence for the plan change dialog, with its error code. */
    const failureText = (result: RequestFailure) => {
        const failure = failureNotice(result, diagnostics);
        return [tx(failure.copy, failure.vars), failure.reference ? tx(C.reference, { ref: failure.reference }) : ""].filter(Boolean).join(" ");
    };

    const openChange = async (plan: PaidPlanId) => {
        const interval = intervalFor(plan);
        setNotice(null);
        setChange({ plan, interval, preview: null, error: "" });
        const result = await postJson<{ preview: PlanChangePreview }>("/api/paddle/subscription", { action: "preview", plan, interval });
        setChange((current) => {
            if (!current || current.plan !== plan || current.interval !== interval) return current;
            if (result.ok) return { ...current, preview: result.data.preview };
            return { ...current, error: failureText(result) };
        });
    };

    const confirmChange = async () => {
        if (!change) return;
        setBusy("change");
        const result = await postJson("/api/paddle/subscription", { action: "change", plan: change.plan, interval: change.interval });
        if (result.ok) {
            setNotice({ tone: "success", copy: C.changed, vars: { plan: PLAN_COPY[change.plan].name.EN } });
            setChange(null);
            setReload((value) => value + 1);
        } else {
            setChange((current) => (current ? { ...current, error: failureText(result) } : current));
        }
        setBusy(null);
    };

    const savings = checkout ? Math.max(yearlySavingsPercent(checkout.prices.plus.month, checkout.prices.plus.year), yearlySavingsPercent(checkout.prices.pro.month, checkout.prices.pro.year)) : 0;
    const showPeriodToggle = anyOnSale && (onSale("plus").length > 1 || onSale("pro").length > 1);
    // A subscriber gets the answers about billing even while sales are closed ("nothing is charged" isn't true for them).
    const faq = anyOnSale || liveSubscription ? [[C.bq1, C.ba1], [C.bq2, C.ba2], [C.bq3, C.ba3], [C.bq4, C.ba4], [C.bq5, C.ba5], [C.q2, C.a2]] : [[C.q1, C.a1], [C.q2, C.a2], [C.q3, C.a3], [C.q4, C.a4]];
    const primaryButton = (gradient: string) => `flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r text-[14px] font-bold text-white shadow-lg transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60 ${gradient}`;
    const quietButton = "inline-flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200 px-3.5 py-2 text-[13px] font-bold transition hover:bg-zinc-50 disabled:opacity-60 dark:border-white/10 dark:hover:bg-white/5";

    const paidButton = (plan: PaidPlanId, gradient: string, current: boolean) => {
        const interval = intervalFor(plan);
        const loading = busy === `checkout:${plan}`;
        if (!me) {
            return <Link href={signInHref} className={primaryButton(gradient)}><CreditCard className="h-4 w-4" aria-hidden />{tx(C.signInToBuy)}</Link>;
        }
        if (me.blocked) return <p className="flex h-11 items-center justify-center rounded-xl border border-zinc-200 text-[14px] font-bold text-zinc-500 dark:border-white/10">{tx(C.unavailableBlocked)}</p>;
        const muted = (text: Copy) => <p className="flex min-h-11 items-center justify-center rounded-xl border border-zinc-200 px-3 text-center text-[13px] font-bold text-zinc-500 dark:border-white/10">{tx(text)}</p>;
        if (liveSubscription && billing?.plan) {
            // A period other than monthly or yearly (e.g. a quarterly price set up in Paddle): only the portal changes it.
            if (!billing.interval) return billing.plan === plan ? <p className="flex h-11 items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-[14px] font-bold text-emerald-700 dark:text-emerald-300">{tx(C.current)}</p> : muted(C.changeInPortal);
            if (billing.plan === plan && billing.interval === interval) return <p className="flex h-11 items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-[14px] font-bold text-emerald-700 dark:text-emerald-300">{tx(C.current)}</p>;
            if (billing.pastDue) return muted(C.payFirst);
            const label = billing.plan === plan ? (interval === "year" ? C.switchYearly : C.switchMonthly) : PLAN_RANK[plan] > PLAN_RANK[billing.plan] ? C.upgradePro : C.switchPlus;
            return (
                <button type="button" onClick={() => void openChange(plan)} disabled={busy !== null || change !== null} className={primaryButton(gradient)}>
                    {label === C.upgradePro ? <Crown className="h-4 w-4" aria-hidden /> : <Zap className="h-4 w-4" aria-hidden />}{tx(label)}
                </button>
            );
        }
        // A paused subscription is resumed, not bought again (the server refuses a second one anyway).
        if (billing?.paused) return muted(C.subscriptionPaused);
        // A lasting plan from the team that is higher already: buying this one would change nothing.
        if (me.source === "staff" && !me.expiresAt && PLAN_RANK[me.plan] > PLAN_RANK[plan]) return muted(C.staffPlanHigher);
        const buy = (
            <button type="button" onClick={() => void startCheckout(plan)} disabled={busy !== null || activating !== null} className={primaryButton(gradient)}>
                {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <CreditCard className="h-4 w-4" aria-hidden />}
                {tx(plan === "pro" ? C.buyPro : C.buyPlus)}
            </button>
        );
        if (current) {
            return (
                <>
                    <p className="flex h-11 items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-[14px] font-bold text-emerald-700 dark:text-emerald-300">{tx(C.current)}</p>
                    <button type="button" onClick={() => void startCheckout(plan)} disabled={busy !== null || activating !== null} className="mt-2 w-full text-center text-[12.5px] font-semibold text-indigo-600 underline-offset-2 hover:underline disabled:opacity-60 dark:text-indigo-300">
                        {loading ? <LoaderCircle className="me-1 inline h-3.5 w-3.5 animate-spin" aria-hidden /> : null}{tx(C.ownSubscription)}
                    </button>
                </>
            );
        }
        return buy;
    };

    const waitlistButton = (plan: PaidPlanId, gradient: string) => {
        const waiting = Boolean(me?.waitlist.includes(plan));
        if (!me) return <Link href={signInHref} className={primaryButton(gradient)}><Bell className="h-4 w-4" aria-hidden />{tx(C.signInToNotify)}</Link>;
        return (
            <>
                <button
                    type="button"
                    onClick={() => void toggleWaitlist(plan)}
                    disabled={busy !== null}
                    aria-pressed={waiting}
                    className={waiting ? "flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-[14px] font-bold text-emerald-700 transition disabled:opacity-60 dark:text-emerald-300" : primaryButton(gradient)}
                >
                    {busy === `waitlist:${plan}` ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : waiting ? <BellRing className="h-4 w-4" aria-hidden /> : <Bell className="h-4 w-4" aria-hidden />}
                    {tx(waiting ? C.notified : C.notify)}
                </button>
                {waiting ? <p className="mt-1.5 text-center text-[11.5px] text-zinc-500">{tx(C.notifyHint)}</p> : null}
            </>
        );
    };

    const sourceDetail = () => {
        if (!me || me.plan === "free") return null;
        if (me.source === "paddle" && billing) return <span className="font-medium text-zinc-500 dark:text-zinc-400"> · {tx(billing.interval === "year" ? C.paidYearly : billing.interval === "month" ? C.paidMonthly : C.paidOther)}</span>;
        return <span className="font-medium text-zinc-500 dark:text-zinc-400"> · {tx(C.assigned)}{me.expiresAt ? ` · ${tx(C.until, { date: date(me.expiresAt) })}` : ""}</span>;
    };

    return (
        <div className="min-h-dvh bg-white text-zinc-900 dark:bg-zinc-950 dark:text-white">
            <Header />
            <main id="main-content">
                <section className="relative overflow-hidden">
                    <div className="absolute inset-0 bg-grid opacity-60 mask-fade-b" />
                    <div className="absolute -left-24 top-16 h-80 w-80 rounded-full bg-indigo-500/20 blur-3xl animate-float" />
                    <div className="absolute -right-24 top-24 h-80 w-80 rounded-full bg-fuchsia-500/15 blur-3xl animate-float" style={{ animationDelay: "-3s" }} />
                    <div className="relative mx-auto max-w-4xl px-4 pb-10 pt-32 text-center sm:px-6">
                        {anyOnSale ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[12px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                                <ShieldCheck className="h-3.5 w-3.5" aria-hidden />{tx(C.badgeOpen)}
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[12px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-300">
                                <Clock className="h-3.5 w-3.5" aria-hidden />{tx(C.badge)}
                            </span>
                        )}
                        {checkout && anyOnSale && (checkout.testMode || checkout.environment === "sandbox") ? (
                            <div className="mx-auto mt-4 flex max-w-xl flex-col gap-1 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-[12.5px] font-semibold text-amber-800 dark:text-amber-200" role="note">
                                {checkout.testMode ? <p>{tx(C.testMode)}</p> : null}
                                {checkout.environment === "sandbox" ? <p>{tx(C.sandbox)}</p> : null}
                            </div>
                        ) : null}
                        <h1 className="mt-5 text-5xl font-black tracking-tight sm:text-6xl">{tx(C.title)}</h1>
                        <p className="mx-auto mt-5 max-w-2xl text-[17px] leading-relaxed text-zinc-600 dark:text-zinc-400">{tx(anyOnSale ? C.subtitleOpen : liveSubscription ? C.subtitleSubscriber : C.subtitle)}</p>
                        {me ? (
                            <div className="mx-auto mt-7 inline-flex max-w-full flex-col items-center gap-2 rounded-2xl border border-zinc-200 bg-white/80 px-5 py-3.5 text-[14px] backdrop-blur dark:border-white/10 dark:bg-white/[0.04]">
                                <p className="font-bold">{tx(C.yourPlan, { plan: tx(PLAN_COPY[me.plan].name) })}{sourceDetail()}</p>
                                {me.blocked ? <p className="text-[13px] text-rose-600 dark:text-rose-400">{tx(C.blocked)}</p> : null}
                                {activating ? <p className="flex items-center gap-2 text-[13px] font-semibold text-indigo-600 dark:text-indigo-300" role="status"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />{tx(C.activating)}</p> : null}
                                {me.checkoutPending && !liveSubscription && !activating && notice?.action !== "checkPayment" ? (
                                    <p className="flex flex-wrap items-center justify-center gap-x-2 text-[12.5px] text-zinc-500 dark:text-zinc-400" data-checkout-pending>
                                        {tx(C.checkPaymentHint)}
                                        <button type="button" onClick={() => void checkPayment()} disabled={busy !== null} className="inline-flex items-center gap-1 font-bold text-indigo-600 underline-offset-2 hover:underline disabled:opacity-60 dark:text-indigo-300">
                                            {busy === "sync" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}{tx(C.checkPayment)}
                                        </button>
                                    </p>
                                ) : null}
                                {billing?.endsAt ? (
                                    <div className="flex max-w-md flex-col items-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-[13px] text-amber-800 dark:text-amber-200">
                                        <p>{tx(C.endsAt, { date: date(billing.endsAt) })}</p>
                                        <button type="button" onClick={() => void keepSubscription()} disabled={busy !== null} className="font-bold underline underline-offset-2 disabled:opacity-60">
                                            {busy === "keep" ? <LoaderCircle className="me-1 inline h-3.5 w-3.5 animate-spin" aria-hidden /> : null}{tx(C.keep)}
                                        </button>
                                    </div>
                                ) : null}
                                {billing?.pastDue ? (
                                    <div className="flex max-w-md flex-col items-center gap-2 rounded-xl bg-rose-500/10 px-3 py-2 text-[13px] text-rose-700 dark:text-rose-300">
                                        <p>{tx(C.pastDue)}</p>
                                        <button type="button" onClick={() => void openPortal("updatePayment")} disabled={busy !== null} className="font-bold underline underline-offset-2 disabled:opacity-60">{tx(C.updatePayment)}</button>
                                    </div>
                                ) : null}
                                {billing?.paused ? (
                                    <div className="flex max-w-md flex-col items-center gap-2 rounded-xl bg-zinc-500/10 px-3 py-2 text-[13px] text-zinc-700 dark:text-zinc-300" data-paused>
                                        <p>{tx(C.paused)}</p>
                                        {resumeOpen ? (
                                            <>
                                                <p className="text-[12.5px]">{billing.periodEndsAt ? tx(C.resumeFree, { date: date(billing.periodEndsAt) }) : tx(C.resumeCharge, { plan: tx(PLAN_COPY[billing.plan ?? "plus"].name) })}</p>
                                                <div className="flex flex-wrap items-center justify-center gap-3">
                                                    <button type="button" onClick={() => void resumeSubscription()} disabled={busy !== null} className="inline-flex items-center gap-1.5 font-bold underline underline-offset-2 disabled:opacity-60" data-resume-confirm>
                                                        {busy === "resume" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}{tx(C.resumeConfirm)}
                                                    </button>
                                                    <button type="button" onClick={() => setResumeOpen(false)} disabled={busy !== null} className="font-semibold opacity-80 hover:opacity-100 disabled:opacity-50">{tx(C.resumeCancel)}</button>
                                                </div>
                                            </>
                                        ) : (
                                            <button type="button" onClick={() => setResumeOpen(true)} disabled={busy !== null} className="font-bold underline underline-offset-2 disabled:opacity-60" data-resume>{tx(C.resume)}</button>
                                        )}
                                    </div>
                                ) : null}
                                {billing?.canceled && me.source !== "paddle" ? <p className="text-[12.5px] text-zinc-500">{tx(C.ended)}</p> : null}
                                {billing?.renewsAt && !billing.pastDue ? <p className="text-[12.5px] text-zinc-500">{tx(C.renews, { date: date(billing.renewsAt) })}</p> : null}
                                {me.canManageBilling ? (
                                    <button type="button" onClick={() => void openPortal("overview")} disabled={busy !== null} className={quietButton} title={tx(C.manageHint)}>
                                        {busy === "portal" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <CreditCard className="h-3.5 w-3.5" aria-hidden />}{tx(C.manage)}
                                    </button>
                                ) : null}
                                <div className="w-64 max-w-full">
                                    <p className="text-[12.5px] text-zinc-500 dark:text-zinc-400">{tx(C.aiToday, { used: me.aiUsedToday, limit: me.aiLimits.perDay })}</p>
                                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={me.aiLimits.perDay} aria-valuenow={Math.min(me.aiUsedToday, me.aiLimits.perDay)}>
                                        <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500" style={{ width: `${Math.min(100, (me.aiUsedToday / Math.max(1, me.aiLimits.perDay)) * 100)}%` }} />
                                    </div>
                                </div>
                            </div>
                        ) : null}
                        {failed ? <p className="mx-auto mt-5 max-w-xl text-[13px] text-zinc-500">{tx(C.unavailable)}</p> : null}
                    </div>
                </section>

                <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
                    {showPeriodToggle ? (
                        <div className="mb-6 flex justify-center">
                            <div role="radiogroup" aria-label={`${tx(C.monthly)} / ${tx(C.yearly)}`} className="inline-flex rounded-2xl border border-zinc-200 bg-zinc-50 p-1 dark:border-white/10 dark:bg-white/[0.04]">
                                {(["month", "year"] as const).map((value) => (
                                    <button
                                        key={value}
                                        type="button"
                                        role="radio"
                                        aria-checked={period === value}
                                        onClick={() => {
                                            periodTouched.current = true;
                                            setPeriod(value);
                                        }}
                                        className={`flex items-center gap-2 rounded-xl px-4 py-2 text-[14px] font-bold transition ${period === value ? "bg-white text-zinc-900 shadow dark:bg-zinc-800 dark:text-white" : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"}`}
                                    >
                                        {tx(value === "month" ? C.monthly : C.yearly)}
                                        {value === "year" && savings > 0 ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-black text-emerald-700 dark:text-emerald-300">{tx(C.save, { percent: savings })}</span> : null}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : null}
                    {anyOnSale ? (
                        <div className="mx-auto mb-5 flex max-w-2xl flex-col items-center gap-2" data-coupon>
                            {!me ? (
                                <Link href={signInHref} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-indigo-600 hover:underline dark:text-indigo-300">
                                    <Ticket className="h-4 w-4" aria-hidden />{normalizeCouponCode(linkCoupon) ? tx(C.couponSignInCode, { code: normalizeCouponCode(linkCoupon) }) : tx(C.couponSignIn)}
                                </Link>
                            ) : liveSubscription ? (
                                <p className="inline-flex items-center gap-1.5 text-center text-[12.5px] text-zinc-500 dark:text-zinc-400" data-coupon-subscribed>
                                    <Ticket className="h-4 w-4 shrink-0" aria-hidden />{tx(C.couponSubscribed)}
                                </p>
                            ) : coupon ? (
                                <p className="flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-emerald-500/10 px-4 py-2 text-center text-[13.5px] font-semibold text-emerald-700 dark:text-emerald-300" data-coupon-applied>
                                    <Ticket className="h-4 w-4 shrink-0" aria-hidden />
                                    <span>{tx(C.couponApplied, { code: coupon.code, percent: coupon.percentOff, plans: coupon.plan === "any" ? tx(C.couponAllPlans) : tx(PLAN_COPY[coupon.plan].name), payments: tx(couponPayments(coupon.recur).copy, couponPayments(coupon.recur).vars) })}</span>
                                    <button type="button" onClick={() => setCoupon(null)} disabled={busy !== null} className="font-bold underline underline-offset-2 hover:no-underline">{tx(C.couponRemove)}</button>
                                </p>
                            ) : couponOpen ? (
                                <form onSubmit={submitCoupon} className="flex w-full max-w-sm gap-2">
                                    <input
                                        value={couponInput}
                                        onChange={(event) => {
                                            setCouponInput(event.target.value.toUpperCase());
                                            setCouponError(null);
                                        }}
                                        maxLength={24}
                                        placeholder="HANOGT20"
                                        aria-label={tx(C.couponLabel)}
                                        autoComplete="off"
                                        spellCheck={false}
                                        autoFocus
                                        className="h-10 min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 font-mono text-[14px] font-bold uppercase tracking-wide outline-none transition focus:border-indigo-400 dark:border-white/10 dark:bg-zinc-900"
                                    />
                                    <button type="submit" disabled={busy !== null || !couponInput.trim()} className={quietButton}>
                                        {busy === "coupon" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Ticket className="h-3.5 w-3.5" aria-hidden />}{tx(C.couponApply)}
                                    </button>
                                </form>
                            ) : (
                                <button type="button" onClick={() => setCouponOpen(true)} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-indigo-600 hover:underline dark:text-indigo-300">
                                    <Ticket className="h-4 w-4" aria-hidden />{tx(C.couponQuestion)}
                                </button>
                            )}
                            {couponError ? <p role="alert" className="text-center text-[12.5px] font-semibold text-rose-600 dark:text-rose-300">{tx(couponError)}</p> : null}
                        </div>
                    ) : null}
                    {notice ? (
                        <div ref={noticeRef} role={notice.tone === "error" ? "alert" : "status"} className={`mx-auto mb-5 max-w-2xl scroll-mt-24 rounded-2xl px-4 py-3 text-center text-[13.5px] font-semibold ${notice.tone === "error" ? "bg-rose-500/10 text-rose-700 dark:text-rose-300" : notice.tone === "success" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"}`}>
                            <p className="flex items-center justify-center gap-2">
                                {notice.tone === "success" ? <PartyPopper className="h-4 w-4 shrink-0" aria-hidden /> : null}{tx(notice.copy, notice.vars)}
                            </p>
                            {notice.hint ? <p className="mt-2 text-[12.5px] font-medium opacity-90">{tx(notice.hint)}</p> : null}
                            {notice.technical ? <p className="mt-2 break-all font-mono text-[11.5px] font-medium opacity-80">{tx(C.technical, notice.technical)}</p> : null}
                            {notice.reference ? <p className="mt-1.5 break-all font-mono text-[11.5px] font-medium opacity-75" data-error-reference>{tx(C.reference, { ref: notice.reference })}</p> : null}
                            {notice.action ? (
                                <button type="button" onClick={() => noticeAction(notice.action)} disabled={busy !== null} className="mt-2 inline-flex items-center gap-1.5 font-bold underline underline-offset-2 disabled:opacity-60" data-check-payment={notice.action === "checkPayment" ? "" : undefined} data-notice-action={notice.action}>
                                    {busy === "sync" || (busy === "portal" && notice.action === "updatePayment") ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
                                    {tx(notice.action === "checkPayment" ? C.checkPayment : notice.action === "resume" ? C.resume : notice.action === "updatePayment" ? C.updatePayment : C.reload)}
                                </button>
                            ) : null}
                        </div>
                    ) : null}
                    <div className="grid gap-5 md:grid-cols-3 md:items-stretch">
                        {PLAN_IDS.map((plan, index) => {
                            const accent = ACCENT[plan];
                            const Icon = accent.icon;
                            const copy = PLAN_COPY[plan];
                            const paid = plan === "free" ? null : plan;
                            const selling = paid ? onSale(paid).length > 0 : false;
                            const interval = paid ? intervalFor(paid) : period;
                            const live = paid && selling ? checkout?.prices[paid][interval] ?? null : null;
                            const price = paid ? catalog.plans[paid] : null;
                            const monthly = price ? discountedPrice(price.monthly, price.discountPercent) : null;
                            const yearly = price ? discountedPrice(price.yearly, price.discountPercent) : null;
                            const current = me?.plan === plan;
                            const card = (
                                <div className={`relative flex h-full flex-col rounded-[1.6rem] border bg-white p-6 shadow-sm dark:bg-zinc-900 ${accent.ring}`}>
                                    {plan === "pro" ? <span className="absolute -top-3 start-6 rounded-full bg-gradient-to-r from-fuchsia-500 to-amber-500 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-white shadow-lg">{tx(C.popular)}</span> : null}
                                    <div className="flex items-center justify-between gap-3">
                                        <span className={`grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-lg ${accent.gradient}`}><Icon className="h-5 w-5" aria-hidden /></span>
                                        {paid && !selling ? <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-amber-700 dark:text-amber-300">{tx(C.badge)}</span> : null}
                                        {live?.trialDays ? <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-emerald-700 dark:text-emerald-300">{tx(C.trial, { days: live.trialDays })}</span> : null}
                                    </div>
                                    <h2 className="mt-4 text-2xl font-black">{tx(copy.name)}</h2>
                                    <p className="mt-1 min-h-[2.75rem] text-[14px] leading-snug text-zinc-500 dark:text-zinc-400">{tx(copy.tagline)}</p>
                                    <div className="mt-4 min-h-[4.5rem]">
                                        {plan === "free" ? (
                                            <p className="flex items-baseline gap-1.5"><span className="text-4xl font-black">{money(0)}</span><span className="text-[13px] text-zinc-500">{tx(C.forever)}</span></p>
                                        ) : selling ? (
                                            live ? (
                                                <>
                                                    <p className="flex flex-wrap items-baseline gap-x-2">
                                                        {paid && couponFor(paid) ? (
                                                            <span className="text-4xl font-black tabular-nums" data-coupon-price>{formatMoney(couponAmount(live.amount, couponFor(paid)!.percentOff), live.currency, locale)}</span>
                                                        ) : (
                                                            <span className="text-4xl font-black tabular-nums">{live.total}</span>
                                                        )}
                                                        <span className="text-[13px] text-zinc-500">{tx(interval === "year" ? C.perYearShort : C.perMonth)}</span>
                                                        {paid && couponFor(paid) ? <span className="text-[15px] text-zinc-400 line-through tabular-nums">{formatMoney(live.amount, live.currency, locale)}</span> : null}
                                                    </p>
                                                    {paid && couponFor(paid) ? (
                                                        <p className="mt-1 text-[12.5px] font-bold text-emerald-700 dark:text-emerald-300">{tx(C.couponOnCard, { code: couponFor(paid)!.code, payments: tx(couponPayments(couponFor(paid)!.recur).copy, couponPayments(couponFor(paid)!.recur).vars) })}</p>
                                                    ) : null}
                                                    {interval === "year" ? <p className="mt-1 text-[12.5px] text-zinc-500">{tx(C.monthlyEquivalent, { price: formatMoney(Number(paid && couponFor(paid) ? couponAmount(live.amount, couponFor(paid)!.percentOff) : live.amount) / 12, live.currency, locale) })}</p> : null}
                                                    {interval !== period ? <p className="mt-1 text-[12px] text-zinc-500">{tx(C.onlyInterval, { interval: tx(interval === "year" ? C.yearly : C.monthly).toLocaleLowerCase(locale) })}</p> : null}
                                                </>
                                            ) : (
                                                <p className="pt-2 text-[15px] font-bold text-zinc-500 dark:text-zinc-400">{tx(C.priceAtCheckout)}</p>
                                            )
                                        ) : monthly !== null ? (
                                            <>
                                                <p className="flex flex-wrap items-baseline gap-x-2">
                                                    <span className="text-4xl font-black tabular-nums">{money(monthly)}</span>
                                                    <span className="text-[13px] text-zinc-500">{tx(C.perMonth)}</span>
                                                    {price && price.discountPercent > 0 && price.monthly !== null ? <span className="text-[14px] text-zinc-400 line-through tabular-nums">{money(price.monthly)}</span> : null}
                                                </p>
                                                <p className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-zinc-500">
                                                    {yearly !== null ? <span>{tx(C.perYear, { price: money(yearly) })}</span> : null}
                                                    {price && price.discountPercent > 0 ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-bold text-emerald-700 dark:text-emerald-300">{tx(C.discount, { percent: price.discountPercent })}</span> : null}
                                                </p>
                                            </>
                                        ) : (
                                            <p className="pt-2 text-[15px] font-bold text-zinc-500 dark:text-zinc-400">{tx(C.priceSoon)}</p>
                                        )}
                                    </div>
                                    <ul className="mt-5 flex-1 space-y-2.5 text-[14px]">
                                        {copy.features.map((feature) => (
                                            <li key={feature.text.EN} className="flex items-start gap-2.5">
                                                <span className={`mt-0.5 grid h-4.5 w-4.5 shrink-0 place-items-center rounded-full ${feature.planned ? "bg-zinc-200 text-zinc-500 dark:bg-white/10" : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"}`}><Check className="h-3 w-3" strokeWidth={3} aria-hidden /></span>
                                                <span className="leading-snug text-zinc-700 dark:text-zinc-300">
                                                    {tx(feature.text)}
                                                    {feature.planned ? <span className="ms-1.5 rounded bg-zinc-100 px-1.5 py-0.5 text-[10.5px] font-bold uppercase text-zinc-500 dark:bg-white/10 dark:text-zinc-400">{tx(C.planned)}</span> : null}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="mt-6">
                                        {plan === "free" ? (
                                            current ? (
                                                <p className="flex h-11 items-center justify-center rounded-xl border border-zinc-200 text-[14px] font-bold text-zinc-500 dark:border-white/10">{tx(C.current)}</p>
                                            ) : liveSubscription && !billing?.endsAt ? (
                                                <button type="button" onClick={() => void openPortal("cancel")} disabled={busy !== null} className="flex min-h-11 w-full items-center justify-center rounded-xl border border-zinc-200 px-3 text-center text-[13px] font-bold text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-60 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5">{tx(C.cancelSubscription)}</button>
                                            ) : (
                                                <Link href={signedIn ? "/dashboard" : "/signup"} className="flex h-11 items-center justify-center rounded-xl bg-zinc-900 text-[14px] font-bold text-white transition hover:-translate-y-0.5 dark:bg-white dark:text-zinc-900">{tx(C.startFree)}</Link>
                                            )
                                        ) : selling ? (
                                            paidButton(plan, accent.gradient, current)
                                        ) : current ? (
                                            <p className="flex h-11 items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-[14px] font-bold text-emerald-700 dark:text-emerald-300">{tx(C.current)}</p>
                                        ) : (
                                            waitlistButton(plan, accent.gradient)
                                        )}
                                    </div>
                                </div>
                            );
                            return (
                                <motion.div key={plan} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.08, duration: 0.45 }} className="h-full">
                                    {plan === "pro" ? <div className="h-full rounded-[1.7rem] bg-gradient-to-br from-fuchsia-500 via-violet-500 to-amber-500 p-[1.5px] shadow-xl shadow-fuchsia-500/15">{card}</div> : card}
                                </motion.div>
                            );
                        })}
                    </div>
                    <p className="mt-6 flex items-center justify-center gap-2 text-center text-[12.5px] text-zinc-500 dark:text-zinc-400">
                        <Ticket className="h-4 w-4" aria-hidden />
                        {tx({ TR: "Hanogt AI sınırları: Ücretsiz {free}, Plus {plus}, Pro {pro} mesaj/gün.", EN: "Hanogt AI limits: Free {free}, Plus {plus}, Pro {pro} messages/day." }, { free: PLAN_AI_LIMITS.free.perDay, plus: PLAN_AI_LIMITS.plus.perDay, pro: PLAN_AI_LIMITS.pro.perDay })}
                    </p>
                    {anyOnSale ? (
                        <p className="mx-auto mt-3 max-w-2xl text-center text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                            {tx(C.taxNote)}{" "}
                            <Link href="/refund-policy" className="font-semibold text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-300">{tx(C.refundPolicy)}</Link>
                            {" · "}
                            <Link href="/terms-of-use" className="font-semibold text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-300">{tx(C.terms)}</Link>
                        </p>
                    ) : null}
                </section>

                <section aria-labelledby="plans-faq" className="mx-auto max-w-3xl px-4 pb-24 sm:px-6">
                    <h2 id="plans-faq" className="text-center text-3xl font-black tracking-tight">{tx(C.faqTitle)}</h2>
                    <div className="mt-8 space-y-3">
                        {faq.map(([question, answer]) => (
                            <details key={question.EN} className="group rounded-2xl border border-zinc-200 bg-zinc-50 p-5 open:bg-white dark:border-white/10 dark:bg-white/[0.03] dark:open:bg-zinc-900">
                                <summary className="cursor-pointer list-none text-[15.5px] font-bold marker:hidden">{tx(question)}</summary>
                                <p className="mt-3 text-[14.5px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                                    {tx(answer)}
                                    {answer === C.ba3 ? <> <Link href="/refund-policy" className="font-semibold text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-300">{tx(C.refundPolicy)}</Link></> : null}
                                </p>
                            </details>
                        ))}
                    </div>
                </section>
            </main>
            <SiteFooter />
            {change && billing?.plan && billing.interval ? (
                <ChangePlanDialog
                    from={{ name: tx(PLAN_COPY[billing.plan].name), interval: billing.interval }}
                    to={{ name: tx(PLAN_COPY[change.plan].name), interval: change.interval }}
                    preview={change.preview}
                    error={change.error}
                    busy={busy === "change"}
                    endsAt={billing.endsAt}
                    onConfirm={() => void confirmChange()}
                    onClose={() => setChange(null)}
                />
            ) : null}
        </div>
    );
}
