"use client";

import { Save, Download, FileText, Settings, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";

interface SidebarProps {
    onSave: () => void;
    onDownload: () => void;
}

export default function Sidebar({ onSave, onDownload }: SidebarProps) {
    const { t } = useI18n();

    return (
        <div className="w-16 md:w-20 lg:w-64 h-full bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col justify-between transition-all">
            {/* Top Section */}
            <div>
                <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
                    <Link href="/dashboard" className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">
                        <ArrowLeft className="w-5 h-5 text-zinc-500" />
                    </Link>
                    <span className="font-bold text-lg hidden lg:block">Hanogt</span>
                </div>

                <nav className="p-2 space-y-2 mt-4">
                    <div className="lg:px-4 lg:py-2 text-xs font-semibold text-zinc-500 uppercase hidden lg:block">{t("my_projects")}</div>

                    <button onClick={onSave} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 transition-all font-medium group">
                        <Save className="w-5 h-5" />
                        <span className="hidden lg:block">{t("save")}</span>
                    </button>

                    <button onClick={onDownload} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition-all font-medium group">
                        <FileText className="w-5 h-5" />
                        <span className="hidden lg:block">{t("download")}</span>
                    </button>
                </nav>
            </div>

            {/* Bottom Settings */}
            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800">
                <Link href="/settings" className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 transition-all">
                    <Settings className="w-5 h-5" />
                    <span className="hidden lg:block">{t("settings")}</span>
                </Link>
            </div>
        </div>
    );
}
