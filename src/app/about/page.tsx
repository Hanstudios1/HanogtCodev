"use client";

import { useI18n } from "@/lib/i18n";
import Link from "next/link";
import { ArrowLeft, Shield, Code, Sparkles, Users, Building2 } from "lucide-react";

export default function AboutPage() {
    const { t } = useI18n();

    return (
        <div className="min-h-screen bg-white dark:bg-black text-zinc-900 dark:text-white transition-colors">
            {/* Header */}
            <header className="py-6 border-b border-zinc-200 dark:border-zinc-800">
                <div className="max-w-4xl mx-auto px-6 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                        <span>{t("back_button") || "Geri"}</span>
                    </Link>
                    <Link href="/" className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">
                        Hanogt Codev
                    </Link>
                    <div className="w-16"></div>
                </div>
            </header>

            {/* Content */}
            <main className="max-w-4xl mx-auto px-6 py-12">
                <h1 className="text-3xl md:text-4xl font-bold text-center mb-10">
                    {t("about_title") || "Hakkımızda"}
                </h1>

                <div className="prose prose-zinc dark:prose-invert prose-lg max-w-none">
                    {/* Company Info */}
                    <section className="mb-10">
                        <div className="flex items-center gap-3 mb-4">
                            <Building2 className="w-8 h-8 text-blue-500" />
                            <h2 className="text-2xl font-bold text-blue-500 dark:text-blue-400 m-0">
                                {t("about_company_title") || "HanStudios"}
                            </h2>
                        </div>
                        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                            {t("about_company_text") || "Hanogt Codev, HanStudios tarafından geliştirilen yenilikçi bir çevrimiçi kod editörü platformudur. Yazılım geliştirmeyi herkes için erişilebilir kılmak amacıyla yola çıktık. Misyonumuz, geliştiricilere ve öğrencilere güçlü, güvenli ve kullanıcı dostu bir kodlama ortamı sunmaktır."}
                        </p>
                    </section>

                    {/* What We Do */}
                    <section className="mb-10">
                        <div className="flex items-center gap-3 mb-4">
                            <Code className="w-8 h-8 text-green-500" />
                            <h2 className="text-2xl font-bold text-green-500 dark:text-green-400 m-0">
                                {t("about_purpose_title") || "Ne Yapıyoruz?"}
                            </h2>
                        </div>
                        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed mb-4">
                            {t("about_purpose_text") || "Hanogt Codev, 16'dan fazla programlama dilini destekleyen çevrimiçi bir kod editörüdür. Platform sayesinde:"}
                        </p>
                        <ul className="list-disc list-inside space-y-2 ml-4 text-zinc-600 dark:text-zinc-300">
                            <li>{t("about_feature_1") || "Herhangi bir kurulum yapmadan tarayıcınızda kod yazabilirsiniz"}</li>
                            <li>{t("about_feature_2") || "Kodlarınızı bulutta güvenle saklayabilirsiniz"}</li>
                            <li>{t("about_feature_3") || "Projelerinizi farklı cihazlardan erişebilirsiniz"}</li>
                            <li>{t("about_feature_4") || "Hanogt Security Bot ile güvenli kodlama yapabilirsiniz"}</li>
                        </ul>
                    </section>

                    {/* Future Plans - Hanogt AI */}
                    <section className="mb-10">
                        <div className="flex items-center gap-3 mb-4">
                            <Sparkles className="w-8 h-8 text-purple-500" />
                            <h2 className="text-2xl font-bold text-purple-500 dark:text-purple-400 m-0">
                                {t("about_future_title") || "Gelecek Planlarımız"}
                            </h2>
                        </div>
                        <div className="bg-purple-100 dark:bg-purple-900/30 border border-purple-300 dark:border-purple-700 rounded-xl p-6 mb-4">
                            <h3 className="text-xl font-bold text-purple-700 dark:text-purple-400 mb-2">
                                🤖 Hanogt AI
                            </h3>
                            <p className="text-purple-700 dark:text-purple-300">
                                {t("about_ai_text") || "Yakın gelecekte Hanogt AI adlı yapay zeka asistanımızı geliştirmeyi ve yayınlamayı planlıyoruz. Hanogt AI, kodlama sürecinizi hızlandıracak, hataları tespit edecek ve öneriler sunacaktır."}
                            </p>
                        </div>
                    </section>

                    {/* Subscriptions */}
                    <section className="mb-10">
                        <div className="flex items-center gap-3 mb-4">
                            <Users className="w-8 h-8 text-orange-500" />
                            <h2 className="text-2xl font-bold text-orange-500 dark:text-orange-400 m-0">
                                {t("about_subscription_title") || "Üyelik ve Abonelikler"}
                            </h2>
                        </div>
                        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                            {t("about_subscription_text") || "Şirketimizin sürdürülebilirliğini sağlamak ve daha iyi hizmetler sunabilmek adına platformumuzda çeşitli üyelik ve abonelik seçenekleri sunmaktayız. Bu sayede hem ücretsiz hem de premium özelliklerle kullanıcılarımıza hizmet verebiliyoruz."}
                        </p>
                    </section>

                    {/* Security */}
                    <section className="mb-10">
                        <div className="flex items-center gap-3 mb-4">
                            <Shield className="w-8 h-8 text-red-500" />
                            <h2 className="text-2xl font-bold text-red-500 dark:text-red-400 m-0">
                                {t("about_security_title") || "Güvenlik"}
                            </h2>
                        </div>
                        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                                {t("about_security_text") || "Güvenlik çok katmanlı uygulanır. Hanogt Security Bot sunucu taraflı bir statik ön-elemedir; antivirüs veya kusursuz tespit garantisi değildir. Asıl koruma oturum, yetki, oran sınırı ve izole çalıştırıcı kontrollerinden gelir."}
                        </p>
                    </section>

                    {/* Contact */}
                    <div className="mt-12 p-6 bg-zinc-100 dark:bg-zinc-900 rounded-xl text-center border border-zinc-200 dark:border-zinc-800">
                        <p className="text-zinc-600 dark:text-zinc-400 mb-2">
                            {t("about_contact") || "Sorularınız mı var?"}
                        </p>
                        <Link href="/feedback" className="text-blue-500 hover:text-blue-600 font-medium">
                            {t("about_feedback_link") || "Geri Bildirim sayfamızı ziyaret edin →"}
                        </Link>
                    </div>
                </div>

                {/* Back to Home */}
                <div className="mt-12 text-center">
                    <Link
                        href="/"
                        className="inline-block px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl transition-all shadow-lg"
                    >
                        {t("back_to_home") || "Ana Sayfaya Dön"}
                    </Link>
                </div>
            </main>

            {/* Footer */}
            <footer className="py-8 border-t border-zinc-200 dark:border-zinc-800 mt-12">
                <div className="max-w-4xl mx-auto px-6 text-center text-zinc-500">
                    <p>© 2026 Hanogt Codev by HanStudios. {t("all_rights_reserved") || "Tüm hakları saklıdır."}</p>
                </div>
            </footer>
        </div>
    );
}
