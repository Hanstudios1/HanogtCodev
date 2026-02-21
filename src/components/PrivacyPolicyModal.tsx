"use client";

import { useState, useEffect } from "react";

interface PrivacyPolicyModalProps {
    onAccept: () => void;
}

export default function PrivacyPolicyModal({ onAccept }: PrivacyPolicyModalProps) {
    const [rejected, setRejected] = useState(false);

    const handleAccept = () => {
        localStorage.setItem("hanogt_privacy_accepted", "true");
        onAccept();
    };

    const handleReject = () => {
        setRejected(true);
    };

    if (rejected) {
        return (
            <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center p-4">
                <div className="bg-zinc-900 rounded-2xl p-10 max-w-lg text-center border border-zinc-700 shadow-2xl">
                    <div className="w-16 h-16 mx-auto mb-6 bg-red-500/20 rounded-full flex items-center justify-center">
                        <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-4">Erişim Reddedildi</h2>
                    <p className="text-zinc-400 text-lg leading-relaxed">
                        Üzgünüz, Kurallarımıza Ve Gizlilik Politikamıza Uymayı Reddettiniz!
                        <br /><br />
                        Daha Sonra Tekrar Deneyiniz.
                    </p>
                    <button
                        onClick={() => window.location.href = "/"}
                        className="mt-8 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-2xl font-medium transition-all"
                    >
                        Ana Sayfaya Dön
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4">
            <div className="bg-zinc-900 rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col border border-zinc-700 shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="p-6 border-b border-zinc-700 bg-zinc-900">
                    <h1 className="text-2xl md:text-3xl font-bold text-white text-center">
                        Hanogt Codev Gizlilik Politikası Ve Kurallarımız
                    </h1>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-6 md:p-8 text-zinc-300 leading-relaxed">
                    <section className="mb-6">
                        <h2 className="text-xl font-bold text-white mb-3">1. Giriş</h2>
                        <p>
                            Hanogt Codev ("Platform", "Biz", "Şirket") olarak, kullanıcılarımızın gizliliğine son derece önem vermekteyiz.
                            Bu Gizlilik Politikası, platformumuzu kullanırken kişisel verilerinizin nasıl toplandığını, kullanıldığını
                            ve korunduğunu açıklamaktadır.
                        </p>
                    </section>

                    <section className="mb-6">
                        <h2 className="text-xl font-bold text-white mb-3">2. Toplanan Veriler</h2>
                        <p className="mb-3">Hanogt Codev, aşağıdaki bilgileri toplayabilir:</p>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li>E-posta adresi (hesap oluşturma ve oturum açma amacıyla)</li>
                            <li>Kullanıcı adı ve profil bilgileri</li>
                            <li>Oluşturduğunuz projeler ve kod dosyaları</li>
                            <li>Oturum bilgileri ve tercihler (tema, dil vb.)</li>
                        </ul>
                    </section>

                    <section className="mb-6">
                        <h2 className="text-xl font-bold text-white mb-3">3. Verilerin Kullanımı</h2>
                        <p className="mb-3 font-semibold text-green-400">
                            ✓ Kişisel verileriniz hiçbir koşulda üçüncü taraflarla paylaşılmayacak veya satılmayacaktır.
                        </p>
                        <p className="mb-3">Topladığımız veriler yalnızca aşağıdaki amaçlarla kullanılır:</p>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li>Hesabınızı oluşturmak ve yönetmek</li>
                            <li>Projelerinizi güvenli bir şekilde saklamak</li>
                            <li>Platform deneyiminizi kişiselleştirmek</li>
                            <li>Teknik destek sağlamak</li>
                        </ul>
                    </section>

                    <section className="mb-6">
                        <h2 className="text-xl font-bold text-white mb-3">4. Veri Güvenliği</h2>
                        <p className="mb-3">
                            Tüm kullanıcı verileri, yalnızca <span className="font-semibold text-blue-400">özel ve güvenli sunucularımızda</span> saklanmaktadır.
                            Verileriniz endüstri standardı şifreleme yöntemleriyle korunmaktadır.
                        </p>
                        <p>
                            Sunucularımız düzenli olarak güvenlik denetimlerinden geçirilmekte ve yetkisiz erişime karşı
                            sürekli izlenmektedir.
                        </p>
                    </section>

                    <section className="mb-6">
                        <h2 className="text-xl font-bold text-white mb-3">5. Çerezler ve Yerel Depolama</h2>
                        <p>
                            Platform, oturum bilgilerinizi ve tercihlerinizi saklamak için tarayıcınızın yerel depolama
                            özelliğini (localStorage) kullanmaktadır. Bu veriler yalnızca sizin cihazınızda saklanır
                            ve üçüncü taraflarla paylaşılmaz.
                        </p>
                    </section>

                    <section className="mb-6">
                        <h2 className="text-xl font-bold text-white mb-3">6. Kullanım Kuralları</h2>
                        <p className="mb-3">Platformumuzu kullanırken aşağıdaki kurallara uymanız gerekmektedir:</p>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li>Yasalara aykırı içerik oluşturmamak</li>
                            <li>Başkalarının haklarını ihlal etmemek</li>
                            <li>Platformun güvenliğini tehlikeye atacak eylemlerden kaçınmak</li>
                            <li>Spam veya kötü amaçlı yazılım paylaşmamak</li>
                        </ul>
                    </section>

                    <section className="mb-6">
                        <h2 className="text-xl font-bold text-white mb-3">7. Hesap Silme</h2>
                        <p>
                            Hesabınızı istediğiniz zaman silme hakkına sahipsiniz. Hesabınız silindiğinde,
                            tüm kişisel verileriniz ve projeleriniz sunucularımızdan kalıcı olarak kaldırılacaktır.
                        </p>
                    </section>

                    <section className="mb-6">
                        <h2 className="text-xl font-bold text-white mb-3">8. Politika Değişiklikleri</h2>
                        <p>
                            Bu Gizlilik Politikası zaman zaman güncellenebilir. Önemli değişiklikler yapıldığında
                            kullanıcılarımız bilgilendirilecektir.
                        </p>
                    </section>

                    <section className="mb-6">
                        <h2 className="text-xl font-bold text-white mb-3">9. İletişim</h2>
                        <p>
                            Gizlilik politikamız veya verilerinizle ilgili sorularınız için bizimle
                            iletişime geçebilirsiniz.
                        </p>
                    </section>

                    <div className="mt-8 p-4 bg-zinc-800 rounded-xl text-center text-sm text-zinc-400">
                        <p>Bu gizlilik politikası en son <strong>29 Aralık 2025</strong> tarihinde güncellenmiştir.</p>
                    </div>
                </div>

                {/* Footer with Buttons */}
                <div className="p-6 border-t border-zinc-700 bg-zinc-900 flex flex-col sm:flex-row gap-4 justify-center">
                    <button
                        onClick={handleAccept}
                        className="px-8 py-4 bg-white hover:bg-zinc-200 text-black font-bold rounded-2xl transition-all shadow-lg text-lg"
                    >
                        Okudum, Kabul Ediyorum
                    </button>
                    <button
                        onClick={handleReject}
                        className="px-8 py-4 bg-black hover:bg-zinc-800 text-white font-bold rounded-2xl transition-all border border-zinc-600 text-lg"
                    >
                        Hayır, Kabul Etmiyorum
                    </button>
                </div>
            </div>
        </div>
    );
}
