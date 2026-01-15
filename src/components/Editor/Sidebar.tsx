"use client";

import { useState } from "react";
import { Save, Download, FileText, Settings, ArrowLeft, Bot, X } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";

interface SidebarProps {
    onSave: () => void;
    onDownload: () => void;
    aiAdminMode: boolean;
    onAiAdminModeChange: (enabled: boolean) => void;
}

export default function Sidebar({ onSave, onDownload, aiAdminMode, onAiAdminModeChange }: SidebarProps) {
    const { t } = useI18n();
    const [showSettings, setShowSettings] = useState(false);

    return (
        <>
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
                    {/* AI Admin Mode Indicator */}
                    {aiAdminMode && (
                        <div className="mb-2 flex items-center gap-2 p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                            <Bot className="w-4 h-4 text-purple-600" />
                            <span className="hidden lg:block text-xs text-purple-600 font-medium">AI Tam Yetki</span>
                        </div>
                    )}

                    <button
                        onClick={() => setShowSettings(true)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 transition-all"
                    >
                        <Settings className="w-5 h-5" />
                        <span className="hidden lg:block">{t("settings")}</span>
                    </button>
                </div>
            </div>

            {/* Settings Modal */}
            {showSettings && (
                <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 w-full max-w-md shadow-2xl border border-zinc-200 dark:border-zinc-800">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                <Settings className="w-5 h-5" />
                                {t("settings")}
                            </h2>
                            <button
                                onClick={() => setShowSettings(false)}
                                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* AI Admin Mode Toggle */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800 rounded-xl">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                                        <Bot className="w-5 h-5 text-purple-600" />
                                    </div>
                                    <div>
                                        <div className="font-medium">AI Tam Yetki Modu</div>
                                        <div className="text-xs text-zinc-500">
                                            AI onay istemeden işlem yapabilir
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => onAiAdminModeChange(!aiAdminMode)}
                                    className={`relative w-12 h-6 rounded-full transition-colors ${aiAdminMode ? "bg-purple-600" : "bg-zinc-300 dark:bg-zinc-600"
                                        }`}
                                >
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${aiAdminMode ? "left-7" : "left-1"
                                        }`} />
                                </button>
                            </div>

                            {aiAdminMode && (
                                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-sm text-yellow-800 dark:text-yellow-200">
                                    ⚠️ AI tam yetkiyle çalışırken tüm kod değişiklikleri otomatik uygulanır!
                                </div>
                            )}
                        </div>

                        <button
                            onClick={() => setShowSettings(false)}
                            className="w-full mt-6 py-3 bg-zinc-900 dark:bg-white text-white dark:text-black rounded-xl font-medium hover:opacity-90 transition-opacity"
                        >
                            Tamam
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
