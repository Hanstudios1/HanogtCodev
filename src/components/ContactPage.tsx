"use client";

import { Building2, CreditCard, LifeBuoy, Mail, ShieldCheck } from "lucide-react";
import Link from "next/link";
import Header from "@/components/Header";
import SiteFooter from "@/components/SiteFooter";
import { useI18n, type Copy } from "@/lib/i18n";
import { isOperatorPublished, type OperatorInfo } from "@/lib/legal-info";

const C = {
    title: { TR: "İletişim", EN: "Contact" },
    subtitle: { TR: "Sorunu en hızlı çözecek kanalı seç. Hesabınla ilgili her konu için destek talebi açman, yanıtları da takip etmeni sağlar.", EN: "Pick the channel that solves it fastest. A support ticket lets you follow the answer for anything about your account." },
    support: { TR: "Destek talebi", EN: "Support ticket" },
    supportText: { TR: "Şikâyet, istek, güvenlik açığı, ban kaldırma, soru ya da geri bildirim: Hanogt ekibi talebini panelden yanıtlar ve bildirim alırsın.", EN: "Complaints, requests, security reports, ban appeals, questions or feedback: the Hanogt team answers from its panel and you get notified." },
    supportCta: { TR: "Destek talebi aç", EN: "Open a ticket" },
    email: { TR: "E-posta", EN: "E-mail" },
    emailText: { TR: "Genel sorular, iş birlikleri ve hukuki yazışmalar için:", EN: "For general questions, partnerships and legal correspondence:" },
    emailSoon: { TR: "İletişim e-postası yakında burada yayımlanacak; o zamana kadar destek talebi kanalını kullanabilirsin.", EN: "The contact e-mail will be published here soon; until then please use a support ticket." },
    billing: { TR: "Ödeme ve faturalar", EN: "Payments and invoices" },
    billingText: { TR: "Plus ve Pro siparişleri Kayıtlı Satıcımız (Merchant of Record) Paddle.com tarafından yürütülür. Fatura, ödeme ve iade soruları için paddle.net'i kullanabilir ya da Planlar sayfasındaki \"Aboneliği yönet\"e basabilirsin.", EN: "Plus and Pro orders are handled by Paddle.com, our Merchant of Record. For invoices, payments and refunds use paddle.net or press \"Manage subscription\" on the Plans page." },
    refund: { TR: "İade Politikası", EN: "Refund Policy" },
    privacy: { TR: "Kişisel veriler (KVKK)", EN: "Personal data (KVKK)" },
    privacyText: { TR: "Kişisel verilerinle ilgili başvurularını KVKK Aydınlatma Metni'nde açıklanan yollarla iletebilirsin.", EN: "You can send requests about your personal data as described in the KVKK disclosure." },
    disclosure: { TR: "KVKK Aydınlatma Metni", EN: "KVKK disclosure" },
    operator: { TR: "İşletmeci", EN: "Operator" },
    taxId: { TR: "VKN / MERSİS", EN: "Tax / MERSIS no." },
    kep: { TR: "KEP", EN: "Registered e-mail (KEP)" },
} satisfies Record<string, Copy>;

const card = "rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900";
const link = "font-semibold text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-300";

export default function ContactPage({ operator }: { operator: OperatorInfo }) {
    const { tx } = useI18n();
    const published = isOperatorPublished(operator);
    return (
        <div className="min-h-dvh bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-white">
            <Header />
            <main id="main-content" className="mx-auto max-w-5xl px-4 pb-24 pt-32 sm:px-6">
                <h1 className="text-4xl font-black tracking-tight sm:text-5xl">{tx(C.title)}</h1>
                <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-zinc-600 dark:text-zinc-400">{tx(C.subtitle)}</p>
                <div className="mt-10 grid gap-5 md:grid-cols-2">
                    <section className={card} aria-labelledby="contact-support">
                        <LifeBuoy className="h-6 w-6 text-violet-500" aria-hidden />
                        <h2 id="contact-support" className="mt-3 text-xl font-black">{tx(C.support)}</h2>
                        <p className="mt-2 text-[14.5px] leading-relaxed text-zinc-600 dark:text-zinc-400">{tx(C.supportText)}</p>
                        <Link href="/feedback" className="mt-4 inline-flex h-10 items-center rounded-xl bg-zinc-900 px-4 text-[14px] font-bold text-white dark:bg-white dark:text-zinc-900">{tx(C.supportCta)}</Link>
                    </section>
                    <section className={card} aria-labelledby="contact-email">
                        <Mail className="h-6 w-6 text-indigo-500" aria-hidden />
                        <h2 id="contact-email" className="mt-3 text-xl font-black">{tx(C.email)}</h2>
                        {operator.contactEmail ? (
                            <p className="mt-2 text-[14.5px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                                {tx(C.emailText)}{" "}
                                <a href={`mailto:${operator.contactEmail}`} className={link}>{operator.contactEmail}</a>
                            </p>
                        ) : (
                            <p className="mt-2 text-[14.5px] leading-relaxed text-zinc-600 dark:text-zinc-400">{tx(C.emailSoon)}</p>
                        )}
                    </section>
                    <section className={card} aria-labelledby="contact-billing">
                        <CreditCard className="h-6 w-6 text-emerald-500" aria-hidden />
                        <h2 id="contact-billing" className="mt-3 text-xl font-black">{tx(C.billing)}</h2>
                        <p className="mt-2 text-[14.5px] leading-relaxed text-zinc-600 dark:text-zinc-400">{tx(C.billingText)}</p>
                        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[14px]">
                            <a href="https://paddle.net" target="_blank" rel="noopener noreferrer" className={link}>paddle.net</a>
                            <Link href="/refund-policy" className={link}>{tx(C.refund)}</Link>
                        </p>
                    </section>
                    <section className={card} aria-labelledby="contact-privacy">
                        <ShieldCheck className="h-6 w-6 text-sky-500" aria-hidden />
                        <h2 id="contact-privacy" className="mt-3 text-xl font-black">{tx(C.privacy)}</h2>
                        <p className="mt-2 text-[14.5px] leading-relaxed text-zinc-600 dark:text-zinc-400">{tx(C.privacyText)}</p>
                        <Link href="/disclosure" className={`mt-3 inline-block text-[14px] ${link}`}>{tx(C.disclosure)}</Link>
                    </section>
                </div>
                {published ? (
                    <section className={`${card} mt-5`} aria-labelledby="contact-operator">
                        <Building2 className="h-6 w-6 text-amber-500" aria-hidden />
                        <h2 id="contact-operator" className="mt-3 text-xl font-black">{tx(C.operator)}</h2>
                        <dl className="mt-3 grid gap-x-6 gap-y-2 text-[14.5px] sm:grid-cols-[auto_1fr]">
                            <dt className="font-semibold text-zinc-500">{operator.brand}</dt>
                            <dd>{operator.legalName}</dd>
                            {operator.address ? <><dt className="sr-only">Address</dt><dd className="sm:col-start-2">{operator.address}</dd></> : null}
                            {operator.taxId ? <><dt className="font-semibold text-zinc-500">{tx(C.taxId)}</dt><dd>{operator.taxId}</dd></> : null}
                            {operator.kep ? <><dt className="font-semibold text-zinc-500">{tx(C.kep)}</dt><dd>{operator.kep}</dd></> : null}
                        </dl>
                    </section>
                ) : null}
            </main>
            <SiteFooter />
        </div>
    );
}
