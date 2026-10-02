import type { Metadata } from "next";
import LegalPage, { type LegalHighlight, type LegalSection } from "@/components/LegalPage";
import { isOperatorPublished } from "@/lib/legal-info";
import { getOperatorInfo } from "@/lib/server/legal-info";

export const metadata: Metadata = {
    title: "İade Politikası",
    description: "Hanogt Codev Plus ve Pro aboneliklerinde ilk ödemede 14 günlük para iade güvencesi, yenileme ödemeleri, iptal, iade talebi ve Kayıtlı Satıcı Paddle üzerinden iade süreci.",
    alternates: { canonical: "/refund-policy" },
};

// The operator's details come from the Admin Panel; re-read them every few minutes.
export const revalidate = 300;

// Turkish is the authoritative text; keep every paragraph a separate { TR, EN }
// pair with plain string literals so the copy packs can translate it. Texts that
// also appear in the Terms of Use are kept identical so they share a translation.

const highlights: LegalHighlight[] = [
    {
        title: { TR: "İlk ödemede 14 gün", EN: "14 days on the first payment" },
        text: { TR: "Bir aboneliğin ilk ödemesinden sonraki 14 gün içinde, gerekçe göstermeden tam iade isteyebilirsiniz.", EN: "Within 14 days of a subscription's first payment, you can ask for a full refund without giving a reason." },
    },
    {
        title: { TR: "İstediğiniz an iptal", EN: "Cancel any time" },
        text: { TR: "İptal, ödediğiniz dönemin sonunda geçerli olur; planınız o güne kadar sürer.", EN: "Cancellation takes effect at the end of the period you paid for; your plan lasts until then." },
    },
    {
        title: { TR: "Paddle aracılığıyla", EN: "Through Paddle" },
        text: { TR: "İadeleri Kayıtlı Satıcımız Paddle, ödemenin yapıldığı yönteme yapar; tutar genellikle 5–10 iş günü içinde hesabınıza geçer.", EN: "Refunds are made by Paddle, our Merchant of Record, to the original payment method; they usually reach you within 5–10 business days." },
    },
    {
        title: { TR: "Emredici haklar saklı", EN: "Mandatory rights preserved" },
        text: { TR: "Kanun size bu politikadan daha fazla hak tanıyorsa o haklar uygulanır.", EN: "Where the law gives you more rights than this policy, those rights apply." },
    },
];

const sections = (published: boolean): LegalSection[] => [
    {
        id: "scope",
        title: { TR: "Kapsam", EN: "Scope" },
        paragraphs: [
            { TR: "Bu İade Politikası, Hanogt Codev'de Plus ve Pro planları için Paddle üzerinden satın aldığınız aylık ve yıllık abonelikler için geçerlidir. Hanogt ekibinin ücretsiz olarak tanımladığı planlar, ödeme yapılmadığından bu politikanın kapsamında değildir.", EN: "This Refund Policy applies to the monthly and yearly subscriptions for the Plus and Pro plans that you buy on Hanogt Codev through Paddle. Plans the Hanogt team assigns free of charge are not covered, because no payment is made for them." },
            { TR: "Politika, [Kullanım Şartları](/terms-of-use#cancellation) ve [Paddle Alıcı Koşulları](https://www.paddle.com/legal/checkout-buyer-terms) ile birlikte uygulanır. Bu politikanın Türkçe sürümü esas alınır.", EN: "It applies together with the [Terms of Use](/terms-of-use#cancellation) and the [Paddle Buyer Terms](https://www.paddle.com/legal/checkout-buyer-terms). The Turkish version of this policy prevails." },
        ],
    },
    {
        id: "money-back",
        title: { TR: "İlk ödemede 14 gün para iade güvencesi", EN: "14-day money-back guarantee on the first payment" },
        paragraphs: [
            { TR: "Bir aboneliğin ilk ödemesinden sonraki 14 gün içinde iade isterseniz, gerekçe göstermenize gerek olmadan ilk ödemenin tamamı iade edilir. Bu süre içinde aynı abonelik için plan değişikliğiyle ödediğiniz fark tutarları da iadeye dahildir.", EN: "If you ask for a refund within 14 days of a subscription's first payment, the whole first payment is refunded, with no need to give a reason. Any differences you paid for plan changes on the same subscription during those 14 days are refunded too." },
            { TR: "14 günlük süre, ilk ödemenin tahsil edildiği andan başlar. Abonelik ücretsiz denemeyle başladıysa süre, deneme sona erdikten sonra alınan ilk ödemeden itibaren işler. Talebinizi bu süre içinde iletmeniz yeterlidir; incelemenin süreyi aşması hakkınızı ortadan kaldırmaz.", EN: "The 14 days start when the first payment is charged. If the subscription started with a free trial, they run from the first payment taken after the trial ends. It is enough to ask within this period; you don't lose the right if the review takes longer." },
            { TR: "İade onaylandığında abonelik derhâl iptal edilir ve plan avantajları sona erer. Güvence, açık bir kötüye kullanım (ör. aynı kişinin art arda abone olup iade istemesi) bulunmadıkça herkese uygulanır; böyle bir durumda bile kanundan doğan haklarınız saklıdır.", EN: "When the refund is approved, the subscription is cancelled immediately and the plan benefits end. The guarantee applies to everyone unless there is clear abuse (for example the same person repeatedly subscribing and asking for refunds); even then, your statutory rights are preserved." },
        ],
    },
    {
        id: "renewals",
        title: { TR: "Yenileme ödemeleri", EN: "Renewal payments" },
        paragraphs: [
            { TR: "Aboneliğinizi istediğiniz zaman iptal ederek sonraki yenilemeleri önleyebilirsiniz; bu nedenle yenileme ödemelerinde iade aşağıdaki durumlarla sınırlıdır. Ödeme tarihinden itibaren 14 gün içinde talep etmeniz hâlinde şu yenileme ödemeleri iade edilir:", EN: "You can stop future renewals at any time by cancelling your subscription, so refunds of renewal payments are limited to the cases below. The following renewal payments are refunded if you ask within 14 days of the payment date:" },
        ],
        items: [
            { TR: "iptal talebiniz bizden veya Paddle'dan kaynaklanan bir nedenle işlenmediği hâlde alınan yenileme ödemesi;", EN: "a renewal charged even though your cancellation wasn't processed because of a problem on our or Paddle's side;" },
            { TR: "hatayla tahsil edilen ödemeler (ör. aynı dönem için iki kez alınan ödeme veya yanlış tutar);", EN: "payments charged by mistake (for example a payment taken twice for the same period, or a wrong amount);" },
            { TR: "bizden kaynaklanan bir sorun nedeniyle planın avantajlarını kullanamadığınız dönem için alınan yenileme ödemesi; bu durumda iade, sorunun süresine ve etkisine göre orantılı olarak ya da tam olarak yapılır.", EN: "a renewal for a period in which you couldn't use the plan's benefits because of a problem caused by us; the refund is then proportionate to how long the problem lasted and how much it affected you, or full." },
        ],
        after: [
            { TR: "Bunların dışındaki yenileme ödemelerinde iade yerine, aboneliğinizi iptal ederek ödediğiniz dönemin sonuna kadar planınızı kullanmaya devam edersiniz. Kanunun daha fazla hak tanıdığı durumlar [Kanuni haklarınız](/refund-policy#statutory-rights) bölümünde açıklanır.", EN: "For other renewal payments, instead of a refund, you can cancel your subscription and keep using your plan until the end of the period you paid for. Cases where the law gives you more rights are explained in [Your statutory rights](/refund-policy#statutory-rights)." },
        ],
    },
    {
        id: "how-to-request",
        title: { TR: "İade nasıl istenir?", EN: "How to ask for a refund" },
        paragraphs: [
            { TR: "İadeyi iki yoldan isteyebilirsiniz:", EN: "You can ask for a refund in two ways:" },
        ],
        items: [
            { TR: "[paddle.net](https://paddle.net) adresinde, satın alırken kullandığınız e-posta adresiyle siparişinizi bulup doğrudan Paddle'dan iade isteyerek;", EN: "at [paddle.net](https://paddle.net), by finding your order with the e-mail address you used for the purchase and asking Paddle for a refund directly;" },
            { TR: "giriş yaparak [Geri Bildirim ve SSS](/feedback) sayfasında “İstek” kategorisinde destek talebi oluşturarak; talebinizi inceler ve onaylanan iadeyi Paddle üzerinden başlatırız.", EN: "by signing in and creating a support ticket in the “Request” category on the [Feedback & FAQ](/feedback) page; we review it and start the approved refund through Paddle." },
        ],
        after: [
            { TR: "Talebinize hesabınızın e-posta adresini (satın alırken başka bir adres kullandıysanız onu da), Paddle makbuzundaki sipariş numarasını, ödemenin tarihini ve tutarını, yenileme ödemelerinde ise iade gerekçenizi ekleyin. Kart numarası, güvenlik kodu veya parola gibi bilgileri hiçbir zaman paylaşmayın; bunlara ihtiyacımız yoktur.", EN: "Include your account's e-mail address (and the address you used at checkout, if different), the order number on the Paddle receipt, the date and amount of the payment and, for renewal payments, why you are asking for a refund. Never share card numbers, security codes or passwords; we don't need them." },
        ],
    },
    {
        id: "processing",
        title: { TR: "İadelerin işlenmesi", EN: "How refunds are processed" },
        paragraphs: [
            { TR: "Onaylanan iadeleri Kayıtlı Satıcı olarak Paddle yapar. İade, ödemenin yapıldığı yönteme ve para birimine yapılır; başka bir karta, hesaba veya ödeme yöntemine aktarılamaz. Paddle, iade işlendiğinde size e-postayla bilgi verir.", EN: "Approved refunds are made by Paddle as the Merchant of Record. The refund goes to the original payment method and currency; it can't be sent to another card, account or payment method. Paddle e-mails you when the refund is processed." },
            { TR: "İadenin hesabınıza geçmesi bankanıza veya ödeme sağlayıcınıza bağlı olarak genellikle 5–10 iş günü sürer. İade, ödemede alınan vergileri de kapsar. Ödemeler ABD doları (USD) cinsinden alındığından, kartınız başka bir para birimindeyse bankanızın uyguladığı kur farkları ve masraflar bizim veya Paddle'ın kontrolünde değildir.", EN: "Depending on your bank or payment provider, a refund usually takes 5–10 business days to reach you. The refund also covers the taxes charged on the payment. Because payments are taken in US dollars (USD), exchange-rate differences and fees applied by your bank are outside our and Paddle's control if your card is in another currency." },
            { TR: "Kısmi iadelerde (ör. bir yenileme ödemesinin orantılı iadesinde) iade edilen tutar, talebinize verdiğimiz yanıtta veya Paddle'ın e-postasında belirtilir.", EN: "For partial refunds (for example the proportionate refund of a renewal payment), the amount refunded is stated in our reply to your request or in Paddle's e-mail." },
        ],
    },
    {
        id: "cancellation",
        title: { TR: "İptal ile iade arasındaki fark", EN: "Cancelling is not the same as a refund" },
        paragraphs: [
            { TR: "Aboneliği iptal etmek yalnızca sonraki yenilemeleri durdurur: iptal, içinde bulunulan fatura döneminin sonunda geçerli olur, plan avantajlarınız o güne kadar sürer ve kural olarak kalan süre için iade yapılmaz. İptali Planlar sayfasındaki “Aboneliği yönet” düğmesiyle veya [paddle.net](https://paddle.net) üzerinden yapabilir, dönem bitmeden geri alabilirsiniz.", EN: "Cancelling a subscription only stops future renewals: it takes effect at the end of the current billing period, your plan benefits last until then and, as a rule, there is no refund for the remaining time. You can cancel with the “Manage subscription” button on the Plans page or at [paddle.net](https://paddle.net), and undo it before the period ends." },
            { TR: "İade ise bir ödemenin geri verilmesidir ve bu politikadaki koşullara bağlıdır. İlk ödemenin iadesi onaylandığında abonelik dönem sonunu beklemeden iptal edilir. İade isterken aboneliği ayrıca iptal etmeniz gerekmez; ancak iade koşulları oluşmazsa sonraki yenilemeyi önlemek için aboneliğinizi iptal etmeyi unutmayın.", EN: "A refund, on the other hand, gives a payment back and depends on the conditions in this policy. When a refund of the first payment is approved, the subscription is cancelled without waiting for the end of the period. You don't need to cancel separately when you ask for a refund; but if the refund conditions aren't met, remember to cancel your subscription to stop the next renewal." },
        ],
    },
    {
        id: "plan-changes",
        title: { TR: "Plan değişiklikleri ve kredi", EN: "Plan changes and credit" },
        paragraphs: [
            { TR: "Plus ile Pro arasında veya aylık ile yıllık ödeme arasında geçtiğinizde ücret, içinde bulunulan dönemin kalan süresi için orantılı olarak hesaplanır. Değişiklik ek bir ödeme gerektiriyorsa fark hemen tahsil edilir. Değişiklik sonucunda lehinize bir tutar oluşursa bu tutar Paddle'da hesabınıza kredi olarak işlenir ve sonraki ödemelerinizden düşülür; bu kredi kural olarak ödeme yönteminize iade edilmez.", EN: "When you switch between Plus and Pro, or between monthly and yearly billing, the fee is prorated for the rest of the current period. If the change costs more, the difference is charged right away. If it leaves an amount in your favour, that amount is added to your account at Paddle as a credit and taken off your next payments; as a rule, this credit is not refunded to your payment method." },
            { TR: "İlk ödemeden sonraki 14 gün içinde yapılan plan değişikliği farkları para iade güvencesine dahildir. Daha sonra yapılan bir değişiklikte hatalı veya bizden kaynaklanan bir tahsilat olursa [yenileme ödemelerine](/refund-policy#renewals) ilişkin kurallar uygulanır.", EN: "Plan-change differences paid within 14 days of the first payment are covered by the money-back guarantee. If a later change leads to a charge made by mistake or caused by us, the rules on [renewal payments](/refund-policy#renewals) apply." },
        ],
    },
    {
        id: "account-deletion",
        title: { TR: "Hesabın silinmesi", EN: "Deleting your account" },
        paragraphs: [
            { TR: "Hanogt Codev hesabınızı silmeniz etkin bir aboneliği derhâl iptal eder ve plan avantajlarını sona erdirir. İçinde bulunulan dönemin kullanılmayan kısmı için kendiliğinden iade yapılmaz; iade hakkınız bu politikaya göre belirlenir.", EN: "Deleting your Hanogt Codev account cancels an active subscription immediately and ends the plan benefits. No refund is made automatically for the unused part of the current period; whether you are entitled to a refund is decided under this policy." },
            { TR: "İade hakkınız varsa (ör. ilk ödemeden sonraki 14 gün içindeyseniz) iadeyi hesabınızı silmeden önce isteyin. Hesap silindikten sonra destek talebi oluşturamazsınız; bu durumda [paddle.net](https://paddle.net) üzerinden, satın alırken kullandığınız e-posta adresiyle başvurabilirsiniz.", EN: "If you are entitled to a refund (for example within 14 days of the first payment), ask for it before deleting your account. Once the account is deleted you can't create support tickets; you can then apply at [paddle.net](https://paddle.net) with the e-mail address you used for the purchase." },
        ],
    },
    {
        id: "statutory-rights",
        title: { TR: "Kanuni haklarınız", EN: "Your statutory rights" },
        paragraphs: [
            { TR: "Bu politika; 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği ile bulunduğunuz ülkenin (ör. Avrupa Birliği veya Birleşik Krallık) tüketici mevzuatından doğan emredici haklarınızı sınırlamaz. Kanun veya [Paddle Alıcı Koşulları](https://www.paddle.com/legal/checkout-buyer-terms) size daha fazla hak tanıyorsa o haklar uygulanır.", EN: "This policy doesn't limit the mandatory rights you have under Consumer Protection Law No. 6502, the Distance Contracts Regulation or the consumer law of your country (for example the European Union or the United Kingdom). Where the law or the [Paddle Buyer Terms](https://www.paddle.com/legal/checkout-buyer-terms) give you more rights, those rights apply." },
            { TR: "Mesafeli sözleşmelerde kanuni cayma hakkı; elektronik ortamda anında ifa edilen veya cayma süresi dolmadan açık onayınızla ifasına başlanan dijital hizmetlerde kullanılamayabilir. Buna rağmen ilk ödemede 14 günlük para iade güvencesini, kanunen zorunlu olup olmadığına bakmaksızın sunuyoruz.", EN: "For distance contracts, the statutory right of withdrawal may not be available for digital services performed instantly online or begun with your express consent before the withdrawal period ends. We nevertheless offer the 14-day money-back guarantee on the first payment, whether or not the law requires it." },
            { TR: "Ücretli planın açıklanan avantajları sağlanamazsa ayıplı hizmete ilişkin kanuni seçimlik haklarınızı (ör. bedel indirimi veya sözleşmeden dönme) da kullanabilirsiniz. Tüketici hakem heyetlerine ve tüketici mahkemelerine başvuru hakkınız saklıdır; ayrıntılar [Kullanım Şartları](/terms-of-use#law)'ndadır.", EN: "If the described benefits of a paid plan aren't provided, you can also use your statutory remedies for defective services (for example a price reduction or withdrawing from the contract). Your right to apply to consumer arbitration committees and consumer courts is preserved; details are in the [Terms of Use](/terms-of-use#law)." },
        ],
    },
    {
        id: "merchant-of-record",
        title: { TR: "Kayıtlı Satıcı: Paddle", EN: "Merchant of Record: Paddle" },
        paragraphs: [
            { TR: "Siparişlerimiz çevrim içi satıcımız Paddle.com tarafından yürütülür. Paddle.com tüm siparişlerimizin Kayıtlı Satıcısıdır (Merchant of Record); müşteri hizmetleri taleplerini ve iadeleri o yürütür.", EN: "Our order process is conducted by our online reseller Paddle.com. Paddle.com is the Merchant of Record for all our orders. Paddle provides all customer service inquiries and handles returns." },
            { TR: "Paddle.com Market Limited (Birleşik Krallık), ödemeyi alan ve faturayı düzenleyen satıcıdır; iadeleri, ters ibrazları (chargeback) ve ödeme yöntemi sorunlarını yürütür. Banka ekstrenizde ödeme genellikle “PADDLE.NET” ile başlayan bir açıklamayla görünür.", EN: "Paddle.com Market Limited (United Kingdom) is the seller that takes the payment and issues the invoice; it handles refunds, chargebacks and payment method issues. On your bank statement the payment usually appears with a description starting with “PADDLE.NET”." },
            { TR: "Bir ödemeye bankanız üzerinden itiraz etmeden (ters ibraz) önce lütfen bize veya Paddle'a başvurun; sorunların çoğu bu yolla daha hızlı çözülür. Ters ibraz edilen bir ödemeye ait abonelik iptal edilebilir.", EN: "Before disputing a payment with your bank (a chargeback), please contact us or Paddle first; most issues are solved faster that way. A subscription whose payment is charged back may be cancelled." },
        ],
    },
    {
        id: "contact",
        title: { TR: "İletişim ve değişiklikler", EN: "Contact and changes" },
        paragraphs: [
            { TR: "İade ve iptalle ilgili sorularınız için giriş yaparak [Geri Bildirim ve SSS](/feedback) sayfasında “İstek” veya “Soru” kategorisinde destek talebi oluşturabilir, [İletişim](/contact) sayfasındaki kanalları kullanabilir ya da siparişinizle ilgili olarak doğrudan [paddle.net](https://paddle.net) üzerinden Paddle'a başvurabilirsiniz.", EN: "For questions about refunds and cancellations, you can sign in and create a support ticket in the “Request” or “Question” category on the [Feedback & FAQ](/feedback) page, use the channels on the [Contact](/contact) page, or contact Paddle directly about your order at [paddle.net](https://paddle.net)." },
            ...(published
                ? [{ TR: "İşletmecinin unvanı veya adı, adresi ve iletişim e-postası bu sayfanın başındaki [“İşletmeci” kartında](/refund-policy#operator) yer alır.", EN: "The operator's legal name, address and contact e-mail are in the [“Operator” card](/refund-policy#operator) at the top of this page." }]
                : []),
            { TR: "Bu politikayı güncelleyebiliriz; her sürüm, yürürlük tarihi ve değişiklik özetiyle sayfanın sonundaki sürüm geçmişinde yer alır. Değişiklikler, değişiklikten önce yapılmış ödemelere ilişkin haklarınızı aleyhinize etkilemez.", EN: "We may update this policy; each version, with its effective date and a summary of changes, is listed in the version history at the end of the page. Changes don't affect your rights regarding payments made before the change to your disadvantage." },
        ],
    },
];

export default async function RefundPolicyPage() {
    const operator = await getOperatorInfo();
    return (
        <LegalPage
            current="/refund-policy"
            eyebrow={{ TR: "Abonelikler ve iadeler", EN: "Subscriptions and refunds" }}
            title={{ TR: "İade Politikası", EN: "Refund Policy" }}
            summary={{ TR: "Paddle üzerinden satın aldığınız Plus ve Pro aboneliklerinde ne zaman ve nasıl iade alabileceğinizi, iptalin nasıl işlediğini ve iadelerin ne kadar sürede sonuçlandığını açıklar.", EN: "Explains when and how you can get a refund for Plus and Pro subscriptions bought through Paddle, how cancellation works and how long refunds take." }}
            sections={sections(isOperatorPublished(operator))}
            highlights={highlights}
            operator={operator}
            notice={{ TR: "Bu politika, kanundan doğan emredici haklarınızı sınırlamaz. Siparişleri ve iadeleri Kayıtlı Satıcımız Paddle yürütür; iadeyi [paddle.net](https://paddle.net) üzerinden veya destek talebiyle isteyebilirsiniz.", EN: "This policy doesn't limit your mandatory rights under the law. Orders and refunds are handled by Paddle, our Merchant of Record; you can ask for a refund at [paddle.net](https://paddle.net) or with a support ticket." }}
        />
    );
}
