"use client";

import { useI18n } from "@/lib/i18n";
import Link from "next/link";

export default function PrivacyPolicyPage() {
    const { t } = useI18n();

    return (
        <div className="min-h-screen bg-white dark:bg-black text-zinc-900 dark:text-white transition-colors">
            {/* Header */}
            <header className="py-6 border-b border-zinc-200 dark:border-zinc-800">
                <div className="max-w-4xl mx-auto px-6">
                    <Link href="/" className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">
                        Hanogt Codev
                    </Link>
                </div>
            </header>

            {/* Content */}
            <main className="max-w-4xl mx-auto px-6 py-12">
                <h1 className="text-3xl md:text-4xl font-bold text-center mb-10">
                    {t("pp_title") || "Hanogt Codev Gizlilik Politikası Ve Kurallarımız"}
                </h1>

                <div className="prose prose-zinc dark:prose-invert prose-lg max-w-none">
                    <section className="mb-8">
                        <h2 className="text-2xl font-bold mb-4 text-blue-500 dark:text-blue-400">
                            1. {t("pp_intro_title") || "Giriş"}
                        </h2>
                        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                            {t("pp_intro_text") || "Hanogt Codev (\"Platform\", \"Biz\", \"Şirket\") olarak, kullanıcılarımızın gizliliğine son derece önem vermekteyiz. Bu Gizlilik Politikası, platformumuzu kullanırken kişisel verilerinizin nasıl toplandığını, kullanıldığını ve korunduğunu açıklamaktadır."}
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-bold mb-4 text-blue-500 dark:text-blue-400">
                            2. {t("pp_data_title") || "Toplanan Veriler"}
                        </h2>
                        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed mb-4">
                            {t("pp_data_intro") || "Hanogt Codev, aşağıdaki bilgileri toplayabilir:"}
                        </p>
                        <ul className="list-disc list-inside space-y-2 ml-4 text-zinc-600 dark:text-zinc-300">
                            <li>{t("pp_data_1") || "E-posta adresi (hesap oluşturma ve oturum açma amacıyla)"}</li>
                            <li>{t("pp_data_2") || "Kullanıcı adı ve profil bilgileri"}</li>
                            <li>{t("pp_data_3") || "Oluşturduğunuz projeler ve kod dosyaları"}</li>
                            <li>{t("pp_data_4") || "Oturum bilgileri ve tercihler (tema, dil vb.)"}</li>
                        </ul>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-bold mb-4 text-blue-500 dark:text-blue-400">
                            3. {t("pp_usage_title") || "Verilerin Kullanımı"}
                        </h2>
                        <div className="bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded-xl p-4 mb-4">
                            <p className="text-green-700 dark:text-green-400 font-semibold text-lg">
                                ✓ {t("pp_no_share") || "Kişisel verileriniz hiçbir koşulda üçüncü taraflarla paylaşılmayacak veya satılmayacaktır."}
                            </p>
                        </div>
                        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed mb-4">
                            {t("pp_usage_intro") || "Topladığımız veriler yalnızca aşağıdaki amaçlarla kullanılır:"}
                        </p>
                        <ul className="list-disc list-inside space-y-2 ml-4 text-zinc-600 dark:text-zinc-300">
                            <li>{t("pp_usage_1") || "Hesabınızı oluşturmak ve yönetmek"}</li>
                            <li>{t("pp_usage_2") || "Projelerinizi güvenli bir şekilde saklamak"}</li>
                            <li>{t("pp_usage_3") || "Platform deneyiminizi kişiselleştirmek"}</li>
                            <li>{t("pp_usage_4") || "Teknik destek sağlamak"}</li>
                        </ul>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-bold mb-4 text-blue-500 dark:text-blue-400">
                            4. {t("pp_security_title") || "Veri Güvenliği"}
                        </h2>
                        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed mb-4">
                            {t("pp_security_text") || "Tüm kullanıcı verileri, yalnızca özel ve güvenli sunucularımızda saklanmaktadır. Verileriniz endüstri standardı şifreleme yöntemleriyle korunmaktadır."}
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-bold mb-4 text-blue-500 dark:text-blue-400">
                            5. {t("pp_cookies_title") || "Çerezler ve Yerel Depolama"}
                        </h2>
                        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                            {t("pp_cookies_text") || "Platform, oturum bilgilerinizi ve tercihlerinizi saklamak için tarayıcınızın yerel depolama özelliğini (localStorage) kullanmaktadır. Bu veriler yalnızca sizin cihazınızda saklanır."}
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-bold mb-4 text-blue-500 dark:text-blue-400">
                            6. {t("pp_rules_title") || "Kullanım Kuralları"}
                        </h2>
                        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed mb-4">
                            {t("pp_rules_intro") || "Platformumuzu kullanırken aşağıdaki kurallara uymanız gerekmektedir:"}
                        </p>
                        <ul className="list-disc list-inside space-y-2 ml-4 text-zinc-600 dark:text-zinc-300">
                            <li>{t("pp_rule_1") || "Yasalara aykırı içerik oluşturmamak"}</li>
                            <li>{t("pp_rule_2") || "Başkalarının haklarını ihlal etmemek"}</li>
                            <li>{t("pp_rule_3") || "Platformun güvenliğini tehlikeye atacak eylemlerden kaçınmak"}</li>
                            <li>{t("pp_rule_4") || "Spam veya kötü amaçlı yazılım paylaşmamak"}</li>
                        </ul>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-bold mb-4 text-blue-500 dark:text-blue-400">
                            7. {t("pp_delete_title") || "Hesap Silme"}
                        </h2>
                        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                            {t("pp_delete_text") || "Hesabınızı istediğiniz zaman silme hakkına sahipsiniz. Hesabınız silindiğinde, tüm kişisel verileriniz ve projeleriniz sunucularımızdan kalıcı olarak kaldırılacaktır."}
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-bold mb-4 text-blue-500 dark:text-blue-400">
                            8. {t("pp_changes_title") || "Politika Değişiklikleri"}
                        </h2>
                        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                            {t("pp_changes_text") || "Bu Gizlilik Politikası zaman zaman güncellenebilir. Önemli değişiklikler yapıldığında kullanıcılarımız bilgilendirilecektir."}
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-bold mb-4 text-blue-500 dark:text-blue-400">
                            9. {t("pp_contact_title") || "İletişim"}
                        </h2>
                        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                            {t("pp_contact_text") || "Gizlilik politikamız veya verilerinizle ilgili sorularınız için bizimle iletişime geçebilirsiniz."}
                        </p>
                    </section>

                    <div className="mt-12 p-6 bg-zinc-100 dark:bg-zinc-900 rounded-xl text-center border border-zinc-200 dark:border-zinc-800">
                        <p className="text-zinc-500 dark:text-zinc-400">
                            {t("pp_updated") || "Bu gizlilik politikası en son"} <strong className="text-zinc-900 dark:text-white">31 Aralık 2025</strong> {t("pp_updated_suffix") || "tarihinde güncellenmiştir."}
                        </p>
                    </div>
                </div>

                {/* Back to Home */}
                <div className="mt-12 text-center">
                    <Link
                        href="/"
                        className="inline-block px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-full transition-all shadow-lg"
                    >
                        {t("back_to_home") || "Ana Sayfaya Dön"}
                    </Link>
                </div>
            </main>

            {/* Footer */}
            <footer className="py-8 border-t border-zinc-200 dark:border-zinc-800 mt-12">
                <div className="max-w-4xl mx-auto px-6 text-center text-zinc-500">
                    <p>© 2025 Hanogt Codev. {t("all_rights_reserved") || "Tüm hakları saklıdır."}</p>
                </div>
            </footer>
        </div>
    );
}
