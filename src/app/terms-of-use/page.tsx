"use client";

import { useI18n } from "@/lib/i18n";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function TermsOfUsePage() {
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
                    {t("terms_title") || "Kullanım Şartları"}
                </h1>

                <div className="prose prose-zinc dark:prose-invert prose-lg max-w-none">
                    <section className="mb-8">
                        <h2 className="text-2xl font-bold mb-4 text-blue-500 dark:text-blue-400">
                            1. {t("terms_acceptance_title") || "Kabul ve Onay"}
                        </h2>
                        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                            {t("terms_acceptance_text") || "Hanogt Codev platformuna üye olarak veya platformu kullanarak işbu Kullanım Şartları'nı okuduğunuzu, anladığınızı ve kabul ettiğinizi beyan etmiş sayılırsınız. Bu şartları kabul etmiyorsanız, platformu kullanmayınız."}
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-bold mb-4 text-blue-500 dark:text-blue-400">
                            2. {t("terms_service_title") || "Hizmet Tanımı"}
                        </h2>
                        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                            {t("terms_service_text") || "Hanogt Codev, kullanıcılara çevrimiçi kod yazma, düzenleme, çalıştırma ve paylaşma imkânı sunan bir yazılım geliştirme platformudur. Platform, eğitim ve profesyonel amaçlarla kullanılabilir."}
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-bold mb-4 text-blue-500 dark:text-blue-400">
                            3. {t("terms_user_resp_title") || "Kullanıcı Sorumlulukları"}
                        </h2>
                        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed mb-4">
                            {t("terms_user_resp_intro") || "Kullanıcılar aşağıdaki hususlara uymakla yükümlüdür:"}
                        </p>
                        <ul className="list-disc list-inside space-y-2 ml-4 text-zinc-600 dark:text-zinc-300">
                            <li>{t("terms_resp_1") || "Doğru ve güncel bilgi sağlamak"}</li>
                            <li>{t("terms_resp_2") || "Hesap güvenliğini korumak ve şifresini gizli tutmak"}</li>
                            <li>{t("terms_resp_3") || "Yürürlükteki yasalara ve mevzuata uymak"}</li>
                            <li>{t("terms_resp_4") || "Üçüncü şahısların haklarını ihlal etmemek"}</li>
                            <li>{t("terms_resp_5") || "Platformun normal işleyişini bozmamak"}</li>
                        </ul>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-bold mb-4 text-red-500 dark:text-red-400">
                            4. {t("terms_prohibited_title") || "Yasaklanan Eylemler"}
                        </h2>
                        <div className="bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-xl p-4 mb-4">
                            <p className="text-red-700 dark:text-red-400 font-semibold">
                                ⚠️ {t("terms_prohibited_warning") || "Aşağıdaki eylemler kesinlikle yasaktır ve hesap kalıcı olarak kapatılır:"}
                            </p>
                        </div>
                        <ul className="list-disc list-inside space-y-2 ml-4 text-zinc-600 dark:text-zinc-300">
                            <li>{t("terms_prohibited_1") || "Zararlı, virüslü veya kötü amaçlı kod yazmak ve çalıştırmak"}</li>
                            <li>{t("terms_prohibited_2") || "Platformu siber saldırı amacıyla kullanmak"}</li>
                            <li>{t("terms_prohibited_3") || "Başkalarının verilerine yetkisiz erişim sağlamaya çalışmak"}</li>
                            <li>{t("terms_prohibited_4") || "Yasadışı içerik oluşturmak veya paylaşmak"}</li>
                            <li>{t("terms_prohibited_5") || "Spam veya toplu mesaj göndermek"}</li>
                            <li>{t("terms_prohibited_6") || "Telif hakkı ihlali yapmak"}</li>
                        </ul>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-bold mb-4 text-blue-500 dark:text-blue-400">
                            5. {t("terms_security_title") || "Güvenlik ve Hanogt Bot"}
                        </h2>
                        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                            {t("terms_security_text") || "Platform, Hanogt Security Bot tarafından 7/24 izlenmektedir. Zararlı kod aktivitesi tespit edildiğinde, ilgili hesap herhangi bir uyarı yapılmaksızın kalıcı olarak engellenebilir. Bu karar kesindir ve itiraz edilemez."}
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-bold mb-4 text-blue-500 dark:text-blue-400">
                            6. {t("terms_ip_title") || "Fikri Mülkiyet"}
                        </h2>
                        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                            {t("terms_ip_text") || "Kullanıcıların oluşturduğu projeler ve kodlar kendilerine aittir. Hanogt Codev markası, logosu ve platform tasarımı üzerindeki tüm haklar şirkete aittir ve izinsiz kullanılamaz."}
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-bold mb-4 text-blue-500 dark:text-blue-400">
                            7. {t("terms_liability_title") || "Sorumluluk Sınırı"}
                        </h2>
                        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                            {t("terms_liability_text") || "Hanogt Codev, platformun kesintisiz veya hatasız çalışacağını garanti etmez. Kullanıcıların platformu kullanımından doğan doğrudan veya dolaylı zararlardan sorumlu tutulamaz."}
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-bold mb-4 text-blue-500 dark:text-blue-400">
                            8. {t("terms_termination_title") || "Fesih"}
                        </h2>
                        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                            {t("terms_termination_text") || "Hanogt Codev, bu şartların ihlali halinde kullanıcı hesabını askıya alabilir veya kalıcı olarak kapatabilir. Kullanıcılar da istedikleri zaman hesaplarını silebilir."}
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-bold mb-4 text-blue-500 dark:text-blue-400">
                            9. {t("terms_law_title") || "Uygulanacak Hukuk"}
                        </h2>
                        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                            {t("terms_law_text") || "Bu Kullanım Şartları, Türkiye Cumhuriyeti yasalarına tabi olup, uyuşmazlıklarda Türkiye Cumhuriyeti mahkemeleri yetkilidir."}
                        </p>
                    </section>

                    <div className="mt-12 p-6 bg-zinc-100 dark:bg-zinc-900 rounded-xl text-center border border-zinc-200 dark:border-zinc-800">
                        <p className="text-zinc-500 dark:text-zinc-400">
                            {t("terms_updated") || "Son güncelleme tarihi:"} <strong className="text-zinc-900 dark:text-white">{t("update_date") || "17 Ocak 2026"}</strong>
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
                    <p>© 2026 Hanogt Codev. {t("all_rights_reserved") || "Tüm hakları saklıdır."}</p>
                </div>
            </footer>
        </div>
    );
}
