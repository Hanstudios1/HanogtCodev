"use client";

import { useRouter } from "next/navigation";
import { ShieldAlert, XCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface BannedModalProps {
    isOpen: boolean;
    onClose?: () => void;
    reason?: string;
}

export default function BannedModal({ isOpen, onClose, reason }: BannedModalProps) {
    const router = useRouter();
    const { t } = useI18n();

    if (!isOpen) return null;

    const handleOkClick = () => {
        if (onClose) onClose();
        router.push("/");
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-gradient-to-br from-red-950 to-black border-2 border-red-600 rounded-2xl p-8 max-w-lg w-full mx-4 shadow-2xl shadow-red-500/20 animate-pulse-slow">
                {/* Shield Icon */}
                <div className="flex justify-center mb-6">
                    <div className="relative">
                        <ShieldAlert className="w-24 h-24 text-red-500" />
                        <XCircle className="w-10 h-10 text-red-600 absolute -bottom-1 -right-1 bg-black rounded-full" />
                    </div>
                </div>

                {/* Title */}
                <h1 className="text-3xl font-bold text-center text-red-500 mb-4">
                    🛡️ HANOGT BOT
                </h1>

                <h2 className="text-xl font-bold text-center text-white mb-6">
                    {t("permanently_banned") || "SONSUZA DEK BANLANDINIZ!"}
                </h2>

                {/* Message */}
                <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 mb-6">
                    <p className="text-center text-red-200 text-sm mb-3">
                        {t("ban_reason_label") || "Ban Sebebi:"}
                    </p>
                    <p className="text-center text-white font-medium">
                        {reason || t("malicious_code_reason") || "Kötü amaçlı, zararlı veya virüslü kod yazdığınız ve çalıştırdığınız için"}
                    </p>
                </div>

                {/* Warning Message */}
                <div className="text-center mb-6">
                    <p className="text-red-300 text-sm leading-relaxed">
                        {t("ban_permanent_message") ||
                            "Bu hesap Hanogt Security Bot tarafından tespit edilen zararlı kod aktivitesi nedeniyle kalıcı olarak engellenmiştir. Bu karar geri alınamaz."}
                    </p>
                </div>

                {/* Bot Signature */}
                <div className="flex items-center justify-center gap-2 mb-6 text-zinc-400 text-xs">
                    <ShieldAlert className="w-4 h-4" />
                    <span>Hanogt Security Bot v1.0</span>
                </div>

                {/* OK Button */}
                <button
                    onClick={handleOkClick}
                    className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                >
                    {t("ok") || "Tamam"}
                </button>
            </div>
        </div>
    );
}
