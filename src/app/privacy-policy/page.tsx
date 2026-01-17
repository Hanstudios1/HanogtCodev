"use client";

import { useI18n } from "@/lib/i18n";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPolicyPage() {
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
                    {t("pp_title") || "Gizlilik Politikası"}
                </h1>

                <div className="prose prose-zinc dark:prose-invert prose-lg max-w-none">
                    <section className="mb-8">
                        <h2 className="text-2xl font-bold mb-4 text-blue-500 dark:text-blue-400">
                            1. {t("pp_intro_title") || "Giriş"}
                        </h2>
                        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                            {t("pp_intro_text") || "Hanogt Codev olarak kullanıcılarımızın gizliliğine son derece önem vermekteyiz. Bu Gizlilik Politikası, platformumuzu kullanırken kişisel verilerinizin nasıl toplandığını, kullanıldığını ve korunduğunu açıklamaktadır."}
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-bold mb-4 text-blue-500 dark:text-blue-400">
                            2. {t("pp_data_title") || "Toplanan Veriler"}
                        </h2>
                        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed mb-4">
                            {t("pp_data_intro") || "Platformumuz aşağıdaki bilgileri toplamaktadır:"}
                        </p>
                        <ul className="list-disc list-inside space-y-2 ml-4 text-zinc-600 dark:text-zinc-300">
                            <li>{t("pp_data_1") || "E-posta adresi (hesap oluşturma ve kimlik doğrulama amacıyla)"}</li>
                            <li>{t("pp_data_2") || "Kullanıcı adı ve profil bilgileri"}</li>
                            <li>{t("pp_data_3") || "Oluşturduğunuz projeler ve kod dosyaları"}</li>
                            <li>{t("pp_data_4") || "Oturum bilgileri, tercihler ve platform kullanım verileri"}</li>
                        </ul>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-bold mb-4 text-blue-500 dark:text-blue-400">
                            3. {t("pp_usage_title") || "Verilerin Kullanımı"}
                        </h2>
                        <div className="bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded-xl p-4 mb-4">
                            <p className="text-green-700 dark:text-green-400 font-semibold text-lg">
                                ✓ {t("pp_no_share") || "Kişisel verileriniz hiçbir koşulda üçüncü taraflarla paylaşılmaz veya satılmaz."}
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
                            {t("pp_security_text") || "Tüm kullanıcı verileri güvenli sunucularımızda saklanmaktadır. Verileriniz endüstri standardı şifreleme yöntemleriyle korunmaktadır."}
                        </p>
                        <div className="bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700 rounded-xl p-4">
                            <p className="text-blue-700 dark:text-blue-400 font-medium">
                                🛡️ {t("pp_hanogt_bot") || "Platform, Hanogt Security Bot tarafından 7/24 izlenmekte ve zararlı aktivitelere karşı korunmaktadır."}
                            </p>
                        </div>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-bold mb-4 text-blue-500 dark:text-blue-400">
                            5. {t("pp_cookies_title") || "Çerezler ve Yerel Depolama"}
                        </h2>
                        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                            {t("pp_cookies_text") || "Platform, oturum bilgilerinizi ve tercihlerinizi saklamak için tarayıcınızın yerel depolama özelliğini kullanmaktadır. Bu veriler yalnızca sizin cihazınızda saklanır ve üçüncü taraflarla paylaşılmaz."}
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-bold mb-4 text-red-500 dark:text-red-400">
                            6. {t("pp_prohibited_title") || "Yasaklanan Aktiviteler"}
                        </h2>
                        <div className="bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-xl p-4 mb-4">
                            <p className="text-red-700 dark:text-red-400 font-semibold">
                                ⚠️ {t("pp_prohibited_warning") || "Aşağıdaki aktiviteler kesinlikle yasaktır ve hesap kalıcı olarak kapatılır:"}
                            </p>
                        </div>
                        <ul className="list-disc list-inside space-y-2 ml-4 text-zinc-600 dark:text-zinc-300">
                            <li>{t("pp_prohibited_1") || "Zararlı, virüslü veya kötü amaçlı kod yazmak ve çalıştırmak"}</li>
                            <li>{t("pp_prohibited_2") || "Platformu siber saldırı amacıyla kullanmak"}</li>
                            <li>{t("pp_prohibited_3") || "Başkalarının verilerine yetkisiz erişim sağlamaya çalışmak"}</li>
                            <li>{t("pp_prohibited_4") || "Yasalara aykırı içerik oluşturmak veya paylaşmak"}</li>
                        </ul>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-bold mb-4 text-blue-500 dark:text-blue-400">
                            7. {t("pp_delete_title") || "Hesap Silme"}
                        </h2>
                        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                            {t("pp_delete_text") || "Hesabınızı istediğiniz zaman Hesap Ayarları sayfasından silebilirsiniz. Hesabınız silindiğinde, tüm kişisel verileriniz ve projeleriniz sunucularımızdan kalıcı olarak kaldırılır."}
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
                            {t("pp_contact_text") || "Gizlilik politikamız veya verilerinizle ilgili sorularınız için hesap ayarlarınız üzerinden veya iletişim kanallarımız aracılığıyla bize ulaşabilirsiniz."}
                        </p>
                    </section>

                    <div className="mt-12 p-6 bg-zinc-100 dark:bg-zinc-900 rounded-xl text-center border border-zinc-200 dark:border-zinc-800">
                        <p className="text-zinc-500 dark:text-zinc-400">
                            {t("pp_updated") || "Son güncelleme tarihi:"} <strong className="text-zinc-900 dark:text-white">17 Ocak 2026</strong>
                        </p>
                    </div>
                </div>

                {/* Related Links */}
                <div className="mt-8 flex justify-center gap-4 flex-wrap">
                    <Link
                        href="/terms-of-use"
                        className="px-6 py-2 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 rounded-lg text-sm transition-colors"
                    >
                        {t("terms_of_use") || "Kullanım Şartları"}
                    </Link>
                    <Link
                        href="/disclosure"
                        className="px-6 py-2 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 rounded-lg text-sm transition-colors"
                    >
                        {t("disclosure_text") || "Aydınlatma Metni"}
                    </Link>
                </div>

                {/* Back to Home */}
                <div className="mt-8 text-center">
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
                    <p>© 2026 Hanogt Codev. {t("all_rights_reserved") || "Tüm hakları saklıdır."}</p>
                </div>
            </footer>
        </div>
    );
}
