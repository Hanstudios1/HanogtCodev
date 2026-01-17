"use client";

import { useI18n } from "@/lib/i18n";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function DisclosureTextPage() {
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
                    {t("disclosure_title") || "Kişisel Verilerin Korunması Aydınlatma Metni"}
                </h1>

                <div className="prose prose-zinc dark:prose-invert prose-lg max-w-none">
                    {/* Legal Reference */}
                    <div className="bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700 rounded-xl p-4 mb-8">
                        <p className="text-blue-700 dark:text-blue-400 text-sm">
                            {t("disclosure_legal_ref") || "6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) kapsamında hazırlanmıştır."}
                        </p>
                    </div>

                    <section className="mb-8">
                        <h2 className="text-2xl font-bold mb-4 text-blue-500 dark:text-blue-400">
                            1. {t("disclosure_controller_title") || "Veri Sorumlusu"}
                        </h2>
                        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                            {t("disclosure_controller_text") || "Hanogt Codev olarak, 6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında veri sorumlusu sıfatıyla kişisel verilerinizi işlemekteyiz. Bu aydınlatma metni, veri işleme faaliyetlerimiz hakkında sizleri bilgilendirmek amacıyla hazırlanmıştır."}
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-bold mb-4 text-blue-500 dark:text-blue-400">
                            2. {t("disclosure_data_title") || "İşlenen Kişisel Veriler"}
                        </h2>
                        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed mb-4">
                            {t("disclosure_data_intro") || "Platformumuz tarafından aşağıdaki kişisel veriler işlenmektedir:"}
                        </p>
                        <ul className="list-disc list-inside space-y-2 ml-4 text-zinc-600 dark:text-zinc-300">
                            <li><strong>{t("disclosure_data_identity") || "Kimlik Bilgileri:"}</strong> {t("disclosure_data_identity_desc") || "Ad, soyad, kullanıcı adı"}</li>
                            <li><strong>{t("disclosure_data_contact") || "İletişim Bilgileri:"}</strong> {t("disclosure_data_contact_desc") || "E-posta adresi"}</li>
                            <li><strong>{t("disclosure_data_usage") || "İşlem Bilgileri:"}</strong> {t("disclosure_data_usage_desc") || "Platform kullanım geçmişi, oluşturulan projeler"}</li>
                            <li><strong>{t("disclosure_data_technical") || "Teknik Bilgiler:"}</strong> {t("disclosure_data_technical_desc") || "IP adresi, tarayıcı bilgisi, oturum verileri"}</li>
                        </ul>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-bold mb-4 text-blue-500 dark:text-blue-400">
                            3. {t("disclosure_purpose_title") || "Veri İşleme Amaçları"}
                        </h2>
                        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed mb-4">
                            {t("disclosure_purpose_intro") || "Kişisel verileriniz aşağıdaki amaçlarla işlenmektedir:"}
                        </p>
                        <ul className="list-disc list-inside space-y-2 ml-4 text-zinc-600 dark:text-zinc-300">
                            <li>{t("disclosure_purpose_1") || "Üyelik işlemlerinin gerçekleştirilmesi ve hesap yönetimi"}</li>
                            <li>{t("disclosure_purpose_2") || "Platform hizmetlerinin sunulması ve iyileştirilmesi"}</li>
                            <li>{t("disclosure_purpose_3") || "Kullanıcı destek hizmetlerinin sağlanması"}</li>
                            <li>{t("disclosure_purpose_4") || "Yasal yükümlülüklerin yerine getirilmesi"}</li>
                            <li>{t("disclosure_purpose_5") || "Platform güvenliğinin sağlanması ve zararlı aktivitelerin önlenmesi"}</li>
                        </ul>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-bold mb-4 text-blue-500 dark:text-blue-400">
                            4. {t("disclosure_legal_title") || "Hukuki Sebepler"}
                        </h2>
                        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed mb-4">
                            {t("disclosure_legal_intro") || "KVKK madde 5 ve 6 kapsamında aşağıdaki hukuki sebeplere dayanarak verileriniz işlenmektedir:"}
                        </p>
                        <ul className="list-disc list-inside space-y-2 ml-4 text-zinc-600 dark:text-zinc-300">
                            <li>{t("disclosure_legal_1") || "Açık rızanızın bulunması"}</li>
                            <li>{t("disclosure_legal_2") || "Sözleşmenin kurulması ve ifasıyla doğrudan ilgili olması"}</li>
                            <li>{t("disclosure_legal_3") || "Veri sorumlusunun hukuki yükümlülüğünü yerine getirebilmesi"}</li>
                            <li>{t("disclosure_legal_4") || "Temel hak ve özgürlüklerinize zarar vermemek kaydıyla meşru menfaatlerimiz"}</li>
                        </ul>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-bold mb-4 text-blue-500 dark:text-blue-400">
                            5. {t("disclosure_transfer_title") || "Veri Aktarımı"}
                        </h2>
                        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                            {t("disclosure_transfer_text") || "Kişisel verileriniz, KVKK'nın 8. ve 9. maddelerinde belirtilen şartlara uygun olarak, yalnızca yasal zorunluluklar çerçevesinde yetkili kamu kurum ve kuruluşlarına aktarılabilir. Bunun dışında verileriniz üçüncü taraflarla paylaşılmaz veya yurt dışına aktarılmaz."}
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-bold mb-4 text-blue-500 dark:text-blue-400">
                            6. {t("disclosure_rights_title") || "Haklarınız"}
                        </h2>
                        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed mb-4">
                            {t("disclosure_rights_intro") || "KVKK'nın 11. maddesi kapsamında aşağıdaki haklara sahipsiniz:"}
                        </p>
                        <ul className="list-disc list-inside space-y-2 ml-4 text-zinc-600 dark:text-zinc-300">
                            <li>{t("disclosure_right_1") || "Kişisel verilerinizin işlenip işlenmediğini öğrenme"}</li>
                            <li>{t("disclosure_right_2") || "İşlenmişse buna ilişkin bilgi talep etme"}</li>
                            <li>{t("disclosure_right_3") || "İşlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme"}</li>
                            <li>{t("disclosure_right_4") || "Yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme"}</li>
                            <li>{t("disclosure_right_5") || "Eksik veya yanlış işlenmişse düzeltilmesini isteme"}</li>
                            <li>{t("disclosure_right_6") || "KVKK madde 7 kapsamında silinmesini veya yok edilmesini isteme"}</li>
                            <li>{t("disclosure_right_7") || "İşlenen verilerin münhasıran otomatik sistemler aracılığıyla analiz edilmesi suretiyle aleyhinize bir sonuç ortaya çıkmasına itiraz etme"}</li>
                            <li>{t("disclosure_right_8") || "Kanuna aykırı işleme nedeniyle zarara uğramanız halinde zararın giderilmesini talep etme"}</li>
                        </ul>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-bold mb-4 text-blue-500 dark:text-blue-400">
                            7. {t("disclosure_security_title") || "Güvenlik Önlemleri"}
                        </h2>
                        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                            {t("disclosure_security_text") || "Kişisel verilerinizin hukuka aykırı olarak işlenmesini, verilerinize hukuka aykırı olarak erişilmesini önlemek ve verilerinizin muhafazasını sağlamak amacıyla uygun güvenlik düzeyini temin etmeye yönelik gerekli teknik ve idari tedbirler alınmaktadır."}
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-bold mb-4 text-blue-500 dark:text-blue-400">
                            8. {t("disclosure_contact_title") || "Başvuru"}
                        </h2>
                        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                            {t("disclosure_contact_text") || "Yukarıda belirtilen haklarınızı kullanmak için hesap ayarlarınız üzerinden veya iletişim kanallarımız aracılığıyla başvuruda bulunabilirsiniz. Başvurularınız en kısa sürede ve en geç 30 gün içinde sonuçlandırılacaktır."}
                        </p>
                    </section>

                    {/* Legal Footer */}
                    <div className="mt-12 p-6 bg-zinc-100 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
                        <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-2">
                            <strong>{t("disclosure_legal_basis") || "Yasal Dayanak:"}</strong>
                        </p>
                        <ul className="text-zinc-500 dark:text-zinc-400 text-sm list-disc list-inside">
                            <li>6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK)</li>
                            <li>Türkiye Cumhuriyeti Anayasası Madde 20 (Özel Hayatın Gizliliği)</li>
                            <li>5237 sayılı Türk Ceza Kanunu Madde 135-140 (Özel Hayata ve Hayatın Gizli Alanına Karşı Suçlar)</li>
                        </ul>
                        <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-4">
                            {t("disclosure_updated") || "Son güncelleme tarihi:"} <strong className="text-zinc-900 dark:text-white">{t("update_date") || "17 Ocak 2026"}</strong>
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
