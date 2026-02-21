"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";

interface DeleteProjectModalProps {
    projectName: string;
    onConfirm: () => void;
    onCancel: () => void;
}

export default function DeleteProjectModal({ projectName, onConfirm, onCancel }: DeleteProjectModalProps) {
    const { t } = useI18n();
    const [dontShowAgain, setDontShowAgain] = useState(false);

    const handleConfirm = () => {
        if (dontShowAgain) {
            localStorage.setItem("hanogt_skip_delete_confirm", "true");
        }
        onConfirm();
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-md w-full p-6 border border-zinc-200 dark:border-zinc-700 shadow-2xl">
                {/* Warning Icon */}
                <div className="w-16 h-16 mx-auto mb-4 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>

                <h3 className="text-xl font-bold text-center text-zinc-900 dark:text-white mb-2">
                    {t("delete_project_title") || "Gerçekten bu projeyi silmek mi istiyorsunuz?"}
                </h3>

                <p className="text-center text-zinc-500 mb-2">
                    <strong className="text-zinc-900 dark:text-white">"{projectName}"</strong>
                </p>

                <p className="text-center text-zinc-500 mb-6 text-sm">
                    {t("delete_project_warning") || "Unutma, projeyi silersen kalıcı olarak sunucularımızdan silinecektir. Bu işlem geri alınamaz."}
                </p>

                {/* Don't show again checkbox */}
                <label className="flex items-center gap-2 mb-6 cursor-pointer justify-center">
                    <input
                        type="checkbox"
                        checked={dontShowAgain}
                        onChange={(e) => setDontShowAgain(e.target.checked)}
                        className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-600 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-zinc-500">
                        {t("dont_show_again") || "Bir daha bunu bana gösterme"}
                    </span>
                </label>

                {/* Buttons */}
                <div className="flex flex-col gap-3">
                    <button
                        onClick={onCancel}
                        className="w-full px-6 py-3 bg-white dark:bg-zinc-800 text-black dark:text-white font-bold rounded-2xl border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-all"
                    >
                        {t("no_keep_project") || "Hayır, Projemi Silmeyeceğim"}
                    </button>
                    <button
                        onClick={handleConfirm}
                        className="w-full px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl transition-all"
                    >
                        {t("yes_delete_project") || "Tamam, Projemi Sonsuza Dek Kaldırın"}
                    </button>
                </div>
            </div>
        </div>
    );
}
