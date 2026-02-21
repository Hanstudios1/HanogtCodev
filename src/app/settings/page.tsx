"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Settings, ArrowLeft, Type, Palette, Code, Terminal, Eye, Keyboard, Moon, Sun } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export default function EditorSettingsPage() {
    const router = useRouter();
    const { t } = useI18n();

    // Editor Settings State
    const [fontSize, setFontSize] = useState(14);
    const [tabSize, setTabSize] = useState(4);
    const [wordWrap, setWordWrap] = useState(true);
    const [lineNumbers, setLineNumbers] = useState(true);
    const [minimap, setMinimap] = useState(true);
    const [autoSave, setAutoSave] = useState(false);
    const [theme, setTheme] = useState("dark");
    const [fontFamily, setFontFamily] = useState("JetBrains Mono");
    const [bracketPairColorization, setBracketPairColorization] = useState(true);
    const [cursorStyle, setCursorStyle] = useState("line");
    const [smoothScrolling, setSmoothScrolling] = useState(true);
    // New settings
    const [autoCloseBrackets, setAutoCloseBrackets] = useState(true);
    const [autoCloseQuotes, setAutoCloseQuotes] = useState(true);
    const [formatOnPaste, setFormatOnPaste] = useState(false);
    const [highlightActiveLine, setHighlightActiveLine] = useState(true);
    const [renderIndentGuides, setRenderIndentGuides] = useState(true);
    const [cursorBlinking, setCursorBlinking] = useState("blink");

    // Load settings from localStorage
    useEffect(() => {
        const savedSettings = localStorage.getItem("hanogt_editor_settings");
        if (savedSettings) {
            const settings = JSON.parse(savedSettings);
            setFontSize(settings.fontSize || 14);
            setTabSize(settings.tabSize || 4);
            setWordWrap(settings.wordWrap ?? true);
            setLineNumbers(settings.lineNumbers ?? true);
            setMinimap(settings.minimap ?? true);
            setAutoSave(settings.autoSave ?? false);
            setTheme(settings.theme || "dark");
            setFontFamily(settings.fontFamily || "JetBrains Mono");
            setBracketPairColorization(settings.bracketPairColorization ?? true);
            setCursorStyle(settings.cursorStyle || "line");
            setSmoothScrolling(settings.smoothScrolling ?? true);
            // New settings
            setAutoCloseBrackets(settings.autoCloseBrackets ?? true);
            setAutoCloseQuotes(settings.autoCloseQuotes ?? true);
            setFormatOnPaste(settings.formatOnPaste ?? false);
            setHighlightActiveLine(settings.highlightActiveLine ?? true);
            setRenderIndentGuides(settings.renderIndentGuides ?? true);
            setCursorBlinking(settings.cursorBlinking || "blink");
        }
    }, []);

    // Save settings to localStorage whenever they change
    const saveSettings = () => {
        const settings = {
            fontSize,
            tabSize,
            wordWrap,
            lineNumbers,
            minimap,
            autoSave,
            theme,
            fontFamily,
            bracketPairColorization,
            cursorStyle,
            smoothScrolling,
            autoCloseBrackets,
            autoCloseQuotes,
            formatOnPaste,
            highlightActiveLine,
            renderIndentGuides,
            cursorBlinking
        };
        localStorage.setItem("hanogt_editor_settings", JSON.stringify(settings));
    };

    useEffect(() => {
        saveSettings();
    }, [fontSize, tabSize, wordWrap, lineNumbers, minimap, autoSave, theme, fontFamily, bracketPairColorization, cursorStyle, smoothScrolling, autoCloseBrackets, autoCloseQuotes, formatOnPaste, highlightActiveLine, renderIndentGuides, cursorBlinking]);

    const fontFamilies = [
        "JetBrains Mono",
        "Fira Code",
        "Source Code Pro",
        "Consolas",
        "Monaco",
        "Courier New"
    ];

    const cursorStyles = [
        { value: "line", label: t("cursor_line") || "Çizgi" },
        { value: "block", label: t("cursor_block") || "Blok" },
        { value: "underline", label: t("cursor_underline") || "Alt Çizgi" }
    ];

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-white">
            <main className="pt-8 px-6 max-w-2xl mx-auto pb-12">
                {/* Back Button */}
                <button
                    onClick={() => router.back()}
                    className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white mb-6 transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                    {t("back") || "Geri"}
                </button>

                <h1 className="text-3xl font-bold mb-8 flex items-center gap-3">
                    <Settings className="w-8 h-8" />
                    {t("editor_settings") || "Editör Ayarları"}
                </h1>

                {/* Appearance Section */}
                <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                        <Palette className="w-5 h-5 text-purple-500" />
                        {t("appearance") || "Görünüm"}
                    </h2>

                    {/* Theme Toggle */}
                    <div className="flex items-center justify-between py-4 border-b border-zinc-100 dark:border-zinc-800">
                        <div className="flex items-center gap-3">
                            {theme === "dark" ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                            <span>{t("theme") || "Tema"}</span>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setTheme("light")}
                                className={`px-4 py-2 rounded-lg font-medium transition-all ${theme === "light" ? "bg-blue-600 text-white" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"}`}
                            >
                                {t("light") || "Açık"}
                            </button>
                            <button
                                onClick={() => setTheme("dark")}
                                className={`px-4 py-2 rounded-lg font-medium transition-all ${theme === "dark" ? "bg-blue-600 text-white" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"}`}
                            >
                                {t("dark") || "Koyu"}
                            </button>
                        </div>
                    </div>

                    {/* Minimap Toggle */}
                    <div className="flex items-center justify-between py-4">
                        <div className="flex items-center gap-3">
                            <Eye className="w-5 h-5" />
                            <span>{t("minimap") || "Mini Harita"}</span>
                        </div>
                        <button
                            onClick={() => setMinimap(!minimap)}
                            className={`w-12 h-6 rounded-full transition-all ${minimap ? "bg-blue-600" : "bg-zinc-300 dark:bg-zinc-700"}`}
                        >
                            <div className={`w-5 h-5 bg-white rounded-full transition-all ${minimap ? "translate-x-6" : "translate-x-0.5"}`} />
                        </button>
                    </div>
                </section>

                {/* Font Section */}
                <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                        <Type className="w-5 h-5 text-blue-500" />
                        {t("font_settings") || "Yazı Tipi Ayarları"}
                    </h2>

                    {/* Font Family */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-zinc-500 mb-2">
                            {t("font_family") || "Yazı Tipi"}
                        </label>
                        <select
                            value={fontFamily}
                            onChange={(e) => setFontFamily(e.target.value)}
                            className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            {fontFamilies.map(font => (
                                <option key={font} value={font}>{font}</option>
                            ))}
                        </select>
                    </div>

                    {/* Font Size Slider */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-zinc-500 mb-2">
                            {t("font_size") || "Yazı Boyutu"}: {fontSize}px
                        </label>
                        <input
                            type="range"
                            min="10"
                            max="24"
                            value={fontSize}
                            onChange={(e) => setFontSize(Number(e.target.value))}
                            className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                        <div className="flex justify-between text-xs text-zinc-400 mt-1">
                            <span>10px</span>
                            <span>24px</span>
                        </div>
                    </div>
                </section>

                {/* Editor Section */}
                <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                        <Code className="w-5 h-5 text-green-500" />
                        {t("code_settings") || "Kod Ayarları"}
                    </h2>

                    {/* Tab Size */}
                    <div className="flex items-center justify-between py-4 border-b border-zinc-100 dark:border-zinc-800">
                        <span>{t("tab_size") || "Sekme Boyutu"}</span>
                        <div className="flex gap-2">
                            {[2, 4, 8].map(size => (
                                <button
                                    key={size}
                                    onClick={() => setTabSize(size)}
                                    className={`px-4 py-2 rounded-lg font-medium transition-all ${tabSize === size ? "bg-blue-600 text-white" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"}`}
                                >
                                    {size}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Word Wrap Toggle */}
                    <div className="flex items-center justify-between py-4 border-b border-zinc-100 dark:border-zinc-800">
                        <span>{t("word_wrap") || "Kelime Kaydırma"}</span>
                        <button
                            onClick={() => setWordWrap(!wordWrap)}
                            className={`w-12 h-6 rounded-full transition-all ${wordWrap ? "bg-blue-600" : "bg-zinc-300 dark:bg-zinc-700"}`}
                        >
                            <div className={`w-5 h-5 bg-white rounded-full transition-all ${wordWrap ? "translate-x-6" : "translate-x-0.5"}`} />
                        </button>
                    </div>

                    {/* Line Numbers Toggle */}
                    <div className="flex items-center justify-between py-4 border-b border-zinc-100 dark:border-zinc-800">
                        <span>{t("line_numbers") || "Satır Numaraları"}</span>
                        <button
                            onClick={() => setLineNumbers(!lineNumbers)}
                            className={`w-12 h-6 rounded-full transition-all ${lineNumbers ? "bg-blue-600" : "bg-zinc-300 dark:bg-zinc-700"}`}
                        >
                            <div className={`w-5 h-5 bg-white rounded-full transition-all ${lineNumbers ? "translate-x-6" : "translate-x-0.5"}`} />
                        </button>
                    </div>

                    {/* Bracket Pair Colorization */}
                    <div className="flex items-center justify-between py-4 border-b border-zinc-100 dark:border-zinc-800">
                        <span>{t("bracket_colorization") || "Parantez Renklendirme"}</span>
                        <button
                            onClick={() => setBracketPairColorization(!bracketPairColorization)}
                            className={`w-12 h-6 rounded-full transition-all ${bracketPairColorization ? "bg-blue-600" : "bg-zinc-300 dark:bg-zinc-700"}`}
                        >
                            <div className={`w-5 h-5 bg-white rounded-full transition-all ${bracketPairColorization ? "translate-x-6" : "translate-x-0.5"}`} />
                        </button>
                    </div>

                    {/* Cursor Style */}
                    <div className="flex items-center justify-between py-4">
                        <div className="flex items-center gap-3">
                            <Keyboard className="w-5 h-5" />
                            <span>{t("cursor_style") || "İmleç Stili"}</span>
                        </div>
                        <select
                            value={cursorStyle}
                            onChange={(e) => setCursorStyle(e.target.value)}
                            className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            {cursorStyles.map(style => (
                                <option key={style.value} value={style.value}>{style.label}</option>
                            ))}
                        </select>
                    </div>
                </section>

                {/* Advanced Section */}
                <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                        <Terminal className="w-5 h-5 text-orange-500" />
                        {t("advanced_settings") || "Gelişmiş Ayarlar"}
                    </h2>

                    {/* Auto Save Toggle */}
                    <div className="flex items-center justify-between py-4 border-b border-zinc-100 dark:border-zinc-800">
                        <div>
                            <span className="block">{t("auto_save") || "Otomatik Kaydetme"}</span>
                            <span className="text-sm text-zinc-500">{t("auto_save_desc") || "Kod değişikliklerini otomatik kaydet"}</span>
                        </div>
                        <button
                            onClick={() => setAutoSave(!autoSave)}
                            className={`w-12 h-6 rounded-full transition-all ${autoSave ? "bg-blue-600" : "bg-zinc-300 dark:bg-zinc-700"}`}
                        >
                            <div className={`w-5 h-5 bg-white rounded-full transition-all ${autoSave ? "translate-x-6" : "translate-x-0.5"}`} />
                        </button>
                    </div>

                    {/* Smooth Scrolling Toggle */}
                    <div className="flex items-center justify-between py-4 border-b border-zinc-100 dark:border-zinc-800">
                        <div>
                            <span className="block">{t("smooth_scrolling") || "Yumuşak Kaydırma"}</span>
                            <span className="text-sm text-zinc-500">{t("smooth_scrolling_desc") || "Editör içinde yumuşak kaydırma"}</span>
                        </div>
                        <button
                            onClick={() => setSmoothScrolling(!smoothScrolling)}
                            className={`w-12 h-6 rounded-full transition-all ${smoothScrolling ? "bg-blue-600" : "bg-zinc-300 dark:bg-zinc-700"}`}
                        >
                            <div className={`w-5 h-5 bg-white rounded-full transition-all ${smoothScrolling ? "translate-x-6" : "translate-x-0.5"}`} />
                        </button>
                    </div>

                    {/* Auto Close Brackets Toggle */}
                    <div className="flex items-center justify-between py-4 border-b border-zinc-100 dark:border-zinc-800">
                        <div>
                            <span className="block">{t("auto_close_brackets") || "Otomatik Parantez Kapatma"}</span>
                            <span className="text-sm text-zinc-500">{t("auto_close_brackets_desc") || "( [ { karakterlerini otomatik kapat"}</span>
                        </div>
                        <button
                            onClick={() => setAutoCloseBrackets(!autoCloseBrackets)}
                            className={`w-12 h-6 rounded-full transition-all ${autoCloseBrackets ? "bg-blue-600" : "bg-zinc-300 dark:bg-zinc-700"}`}
                        >
                            <div className={`w-5 h-5 bg-white rounded-full transition-all ${autoCloseBrackets ? "translate-x-6" : "translate-x-0.5"}`} />
                        </button>
                    </div>

                    {/* Auto Close Quotes Toggle */}
                    <div className="flex items-center justify-between py-4 border-b border-zinc-100 dark:border-zinc-800">
                        <div>
                            <span className="block">{t("auto_close_quotes") || "Otomatik Tırnak Kapatma"}</span>
                            <span className="text-sm text-zinc-500">{t("auto_close_quotes_desc") || "' \" karakterlerini otomatik kapat"}</span>
                        </div>
                        <button
                            onClick={() => setAutoCloseQuotes(!autoCloseQuotes)}
                            className={`w-12 h-6 rounded-full transition-all ${autoCloseQuotes ? "bg-blue-600" : "bg-zinc-300 dark:bg-zinc-700"}`}
                        >
                            <div className={`w-5 h-5 bg-white rounded-full transition-all ${autoCloseQuotes ? "translate-x-6" : "translate-x-0.5"}`} />
                        </button>
                    </div>

                    {/* Format On Paste Toggle */}
                    <div className="flex items-center justify-between py-4 border-b border-zinc-100 dark:border-zinc-800">
                        <div>
                            <span className="block">{t("format_on_paste") || "Yapıştırırken Biçimlendir"}</span>
                            <span className="text-sm text-zinc-500">{t("format_on_paste_desc") || "Yapıştırılan kodu otomatik biçimlendir"}</span>
                        </div>
                        <button
                            onClick={() => setFormatOnPaste(!formatOnPaste)}
                            className={`w-12 h-6 rounded-full transition-all ${formatOnPaste ? "bg-blue-600" : "bg-zinc-300 dark:bg-zinc-700"}`}
                        >
                            <div className={`w-5 h-5 bg-white rounded-full transition-all ${formatOnPaste ? "translate-x-6" : "translate-x-0.5"}`} />
                        </button>
                    </div>

                    {/* Highlight Active Line Toggle */}
                    <div className="flex items-center justify-between py-4 border-b border-zinc-100 dark:border-zinc-800">
                        <div>
                            <span className="block">{t("highlight_active_line") || "Aktif Satırı Vurgula"}</span>
                            <span className="text-sm text-zinc-500">{t("highlight_active_line_desc") || "Geçerli satırı vurgula"}</span>
                        </div>
                        <button
                            onClick={() => setHighlightActiveLine(!highlightActiveLine)}
                            className={`w-12 h-6 rounded-full transition-all ${highlightActiveLine ? "bg-blue-600" : "bg-zinc-300 dark:bg-zinc-700"}`}
                        >
                            <div className={`w-5 h-5 bg-white rounded-full transition-all ${highlightActiveLine ? "translate-x-6" : "translate-x-0.5"}`} />
                        </button>
                    </div>

                    {/* Render Indent Guides Toggle */}
                    <div className="flex items-center justify-between py-4">
                        <div>
                            <span className="block">{t("indent_guides") || "Girinti Kılavuzları"}</span>
                            <span className="text-sm text-zinc-500">{t("indent_guides_desc") || "Görsel girinti çizgileri göster"}</span>
                        </div>
                        <button
                            onClick={() => setRenderIndentGuides(!renderIndentGuides)}
                            className={`w-12 h-6 rounded-full transition-all ${renderIndentGuides ? "bg-blue-600" : "bg-zinc-300 dark:bg-zinc-700"}`}
                        >
                            <div className={`w-5 h-5 bg-white rounded-full transition-all ${renderIndentGuides ? "translate-x-6" : "translate-x-0.5"}`} />
                        </button>
                    </div>
                </section>

                {/* Reset Button */}
                <button
                    onClick={() => {
                        localStorage.removeItem("hanogt_editor_settings");
                        setFontSize(14);
                        setTabSize(4);
                        setWordWrap(true);
                        setLineNumbers(true);
                        setMinimap(true);
                        setAutoSave(false);
                        setTheme("dark");
                        setFontFamily("JetBrains Mono");
                        setBracketPairColorization(true);
                        setCursorStyle("line");
                        setSmoothScrolling(true);
                    }}
                    className="w-full mt-6 px-6 py-3 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold rounded-2xl transition-all"
                >
                    {t("reset_settings") || "Ayarları Sıfırla"}
                </button>
            </main>
        </div>
    );
}
