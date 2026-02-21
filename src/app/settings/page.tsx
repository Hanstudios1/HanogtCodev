"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Settings, ArrowLeft, Type, Palette, Code, Terminal, Eye, Keyboard, Moon, Sun, Sparkles, Zap, Braces, MousePointer, AlignLeft, Space, WrapText } from "lucide-react";
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
    const [autoCloseBrackets, setAutoCloseBrackets] = useState(true);
    const [autoCloseQuotes, setAutoCloseQuotes] = useState(true);
    const [formatOnPaste, setFormatOnPaste] = useState(false);
    const [highlightActiveLine, setHighlightActiveLine] = useState(true);
    const [renderIndentGuides, setRenderIndentGuides] = useState(true);
    const [cursorBlinking, setCursorBlinking] = useState("blink");

    // NEW Settings
    const [lineHeight, setLineHeight] = useState(1.6);
    const [autocomplete, setAutocomplete] = useState(true);
    const [snippetSuggestions, setSnippetSuggestions] = useState(true);
    const [parameterHints, setParameterHints] = useState(true);
    const [hoverInfo, setHoverInfo] = useState(true);
    const [linkedEditing, setLinkedEditing] = useState(true);
    const [insertFinalNewline, setInsertFinalNewline] = useState(false);
    const [renderWhitespace, setRenderWhitespace] = useState("none");
    const [autoIndent, setAutoIndent] = useState("advanced");
    const [stickyScroll, setStickyScroll] = useState(true);
    const [formatOnType, setFormatOnType] = useState(false);
    const [codeLens, setCodeLens] = useState(true);
    const [inlineSuggest, setInlineSuggest] = useState(true);

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
            setAutoCloseBrackets(settings.autoCloseBrackets ?? true);
            setAutoCloseQuotes(settings.autoCloseQuotes ?? true);
            setFormatOnPaste(settings.formatOnPaste ?? false);
            setHighlightActiveLine(settings.highlightActiveLine ?? true);
            setRenderIndentGuides(settings.renderIndentGuides ?? true);
            setCursorBlinking(settings.cursorBlinking || "blink");
            // NEW
            setLineHeight(settings.lineHeight ?? 1.6);
            setAutocomplete(settings.autocomplete ?? true);
            setSnippetSuggestions(settings.snippetSuggestions ?? true);
            setParameterHints(settings.parameterHints ?? true);
            setHoverInfo(settings.hoverInfo ?? true);
            setLinkedEditing(settings.linkedEditing ?? true);
            setInsertFinalNewline(settings.insertFinalNewline ?? false);
            setRenderWhitespace(settings.renderWhitespace || "none");
            setAutoIndent(settings.autoIndent || "advanced");
            setStickyScroll(settings.stickyScroll ?? true);
            setFormatOnType(settings.formatOnType ?? false);
            setCodeLens(settings.codeLens ?? true);
            setInlineSuggest(settings.inlineSuggest ?? true);
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
            cursorBlinking,
            // NEW
            lineHeight,
            autocomplete,
            snippetSuggestions,
            parameterHints,
            hoverInfo,
            linkedEditing,
            insertFinalNewline,
            renderWhitespace,
            autoIndent,
            stickyScroll,
            formatOnType,
            codeLens,
            inlineSuggest
        };
        localStorage.setItem("hanogt_editor_settings", JSON.stringify(settings));
    };

    useEffect(() => {
        saveSettings();
    }, [fontSize, tabSize, wordWrap, lineNumbers, minimap, autoSave, theme, fontFamily, bracketPairColorization, cursorStyle, smoothScrolling, autoCloseBrackets, autoCloseQuotes, formatOnPaste, highlightActiveLine, renderIndentGuides, cursorBlinking, lineHeight, autocomplete, snippetSuggestions, parameterHints, hoverInfo, linkedEditing, insertFinalNewline, renderWhitespace, autoIndent, stickyScroll, formatOnType, codeLens, inlineSuggest]);

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

    const cursorBlinkings = [
        { value: "blink", label: t("cursor_blink") || "Normal" },
        { value: "smooth", label: t("cursor_smooth") || "Yumuşak" },
        { value: "expand", label: t("cursor_expand") || "Genişle" },
        { value: "phase", label: t("cursor_phase") || "Faz" },
        { value: "solid", label: t("cursor_solid") || "Sabit" }
    ];

    const whitespaceOptions = [
        { value: "none", label: t("whitespace_none") || "Gizle" },
        { value: "boundary", label: t("whitespace_boundary") || "Sınır" },
        { value: "all", label: t("whitespace_all") || "Tümü" }
    ];

    const autoIndentOptions = [
        { value: "none", label: t("indent_none") || "Yok" },
        { value: "keep", label: t("indent_keep") || "Koru" },
        { value: "brackets", label: t("indent_brackets") || "Parantez" },
        { value: "advanced", label: t("indent_advanced") || "Gelişmiş" }
    ];

    // Toggle switch component
    const ToggleSwitch = ({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) => (
        <button
            onClick={onToggle}
            className={`w-12 h-6 rounded-full transition-all flex-shrink-0 ${enabled ? "bg-blue-600" : "bg-zinc-300 dark:bg-zinc-700"}`}
        >
            <div className={`w-5 h-5 bg-white rounded-full transition-all ${enabled ? "translate-x-6" : "translate-x-0.5"}`} />
        </button>
    );

    // Setting row with description
    const SettingRow = ({ label, desc, children, border = true }: { label: string; desc?: string; children: React.ReactNode; border?: boolean }) => (
        <div className={`flex items-center justify-between py-4 ${border ? "border-b border-zinc-100 dark:border-zinc-800" : ""}`}>
            <div className="pr-4">
                <span className="block">{label}</span>
                {desc && <span className="text-sm text-zinc-500">{desc}</span>}
            </div>
            {children}
        </div>
    );

    const handleReset = () => {
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
        setAutoCloseBrackets(true);
        setAutoCloseQuotes(true);
        setFormatOnPaste(false);
        setHighlightActiveLine(true);
        setRenderIndentGuides(true);
        setCursorBlinking("blink");
        setLineHeight(1.6);
        setAutocomplete(true);
        setSnippetSuggestions(true);
        setParameterHints(true);
        setHoverInfo(true);
        setLinkedEditing(true);
        setInsertFinalNewline(false);
        setRenderWhitespace("none");
        setAutoIndent("advanced");
        setStickyScroll(true);
        setFormatOnType(false);
        setCodeLens(true);
        setInlineSuggest(true);
    };

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

                {/* ===== APPEARANCE SECTION ===== */}
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
                    <SettingRow label={t("minimap") || "Mini Harita"} desc={t("minimap_desc") || "Kod genel görünümünü sağ tarafta göster"}>
                        <ToggleSwitch enabled={minimap} onToggle={() => setMinimap(!minimap)} />
                    </SettingRow>

                    {/* Line Height */}
                    <div className="py-4 border-b border-zinc-100 dark:border-zinc-800">
                        <label className="block text-sm font-medium text-zinc-500 mb-2">
                            {t("line_height") || "Satır Yüksekliği"}: {lineHeight.toFixed(1)}
                        </label>
                        <input
                            type="range"
                            min="1.2"
                            max="2.4"
                            step="0.1"
                            value={lineHeight}
                            onChange={(e) => setLineHeight(Number(e.target.value))}
                            className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                        <div className="flex justify-between text-xs text-zinc-400 mt-1">
                            <span>{t("compact") || "Sıkışık"} (1.2)</span>
                            <span>{t("spacious") || "Geniş"} (2.4)</span>
                        </div>
                    </div>

                    {/* Cursor Blinking */}
                    <div className="flex items-center justify-between py-4">
                        <div className="flex items-center gap-3">
                            <MousePointer className="w-5 h-5" />
                            <span>{t("cursor_blinking") || "İmleç Animasyonu"}</span>
                        </div>
                        <select
                            value={cursorBlinking}
                            onChange={(e) => setCursorBlinking(e.target.value)}
                            className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            {cursorBlinkings.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>
                </section>

                {/* ===== FONT SECTION ===== */}
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

                {/* ===== CODE SETTINGS SECTION ===== */}
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
                    <SettingRow label={t("word_wrap") || "Kelime Kaydırma"}>
                        <ToggleSwitch enabled={wordWrap} onToggle={() => setWordWrap(!wordWrap)} />
                    </SettingRow>

                    {/* Line Numbers Toggle */}
                    <SettingRow label={t("line_numbers") || "Satır Numaraları"}>
                        <ToggleSwitch enabled={lineNumbers} onToggle={() => setLineNumbers(!lineNumbers)} />
                    </SettingRow>

                    {/* Bracket Pair Colorization */}
                    <SettingRow label={t("bracket_colorization") || "Parantez Renklendirme"} desc={t("bracket_colorization_desc") || "Eşleşen parantezleri farklı renklerle göster"}>
                        <ToggleSwitch enabled={bracketPairColorization} onToggle={() => setBracketPairColorization(!bracketPairColorization)} />
                    </SettingRow>

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

                {/* ===== INTELLISENSE / SMART CODE SECTION ===== */}
                <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-yellow-500" />
                        {t("smart_code") || "Akıllı Kod Özellikleri"}
                    </h2>

                    {/* Autocomplete */}
                    <SettingRow label={t("autocomplete") || "Otomatik Tamamlama"} desc={t("autocomplete_desc") || "Yazarken kod önerilerini göster"}>
                        <ToggleSwitch enabled={autocomplete} onToggle={() => setAutocomplete(!autocomplete)} />
                    </SettingRow>

                    {/* Inline Suggestions */}
                    <SettingRow label={t("inline_suggest") || "Satır İçi Öneriler"} desc={t("inline_suggest_desc") || "Ghost text olarak otomatik tamamlama önerileri"}>
                        <ToggleSwitch enabled={inlineSuggest} onToggle={() => setInlineSuggest(!inlineSuggest)} />
                    </SettingRow>

                    {/* Snippet Suggestions */}
                    <SettingRow label={t("snippet_suggestions") || "Snippet Önerileri"} desc={t("snippet_suggestions_desc") || "Hazır kod parçacıklarını öner"}>
                        <ToggleSwitch enabled={snippetSuggestions} onToggle={() => setSnippetSuggestions(!snippetSuggestions)} />
                    </SettingRow>

                    {/* Parameter Hints */}
                    <SettingRow label={t("parameter_hints") || "Parametre İpuçları"} desc={t("parameter_hints_desc") || "Fonksiyon parametrelerini otomatik göster"}>
                        <ToggleSwitch enabled={parameterHints} onToggle={() => setParameterHints(!parameterHints)} />
                    </SettingRow>

                    {/* Hover Info */}
                    <SettingRow label={t("hover_info") || "Fare Üstü Bilgi"} desc={t("hover_info_desc") || "Fare ile üzerine gelince detaylı bilgi göster"}>
                        <ToggleSwitch enabled={hoverInfo} onToggle={() => setHoverInfo(!hoverInfo)} />
                    </SettingRow>

                    {/* Code Lens */}
                    <SettingRow label={t("code_lens") || "CodeLens"} desc={t("code_lens_desc") || "Referans ve bilgi satırlarını kodun üstünde göster"}>
                        <ToggleSwitch enabled={codeLens} onToggle={() => setCodeLens(!codeLens)} />
                    </SettingRow>

                    {/* Linked Editing */}
                    <SettingRow label={t("linked_editing") || "Bağlantılı Düzenleme"} desc={t("linked_editing_desc") || "HTML etiketlerini eş zamanlı düzenle"} border={false}>
                        <ToggleSwitch enabled={linkedEditing} onToggle={() => setLinkedEditing(!linkedEditing)} />
                    </SettingRow>
                </section>

                {/* ===== ADVANCED SECTION ===== */}
                <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                        <Terminal className="w-5 h-5 text-orange-500" />
                        {t("advanced_settings") || "Gelişmiş Ayarlar"}
                    </h2>

                    {/* Auto Save Toggle */}
                    <SettingRow label={t("auto_save") || "Otomatik Kaydetme"} desc={t("auto_save_desc") || "Kod değişikliklerini otomatik kaydet"}>
                        <ToggleSwitch enabled={autoSave} onToggle={() => setAutoSave(!autoSave)} />
                    </SettingRow>

                    {/* Smooth Scrolling Toggle */}
                    <SettingRow label={t("smooth_scrolling") || "Yumuşak Kaydırma"} desc={t("smooth_scrolling_desc") || "Editör içinde yumuşak kaydırma"}>
                        <ToggleSwitch enabled={smoothScrolling} onToggle={() => setSmoothScrolling(!smoothScrolling)} />
                    </SettingRow>

                    {/* Sticky Scroll */}
                    <SettingRow label={t("sticky_scroll") || "Yapışkan Kaydırma"} desc={t("sticky_scroll_desc") || "Kaydırırken sınıf/fonksiyon başlıklarını sabit tut"}>
                        <ToggleSwitch enabled={stickyScroll} onToggle={() => setStickyScroll(!stickyScroll)} />
                    </SettingRow>

                    {/* Auto Close Brackets Toggle */}
                    <SettingRow label={t("auto_close_brackets") || "Otomatik Parantez Kapatma"} desc={t("auto_close_brackets_desc") || "( [ { karakterlerini otomatik kapat"}>
                        <ToggleSwitch enabled={autoCloseBrackets} onToggle={() => setAutoCloseBrackets(!autoCloseBrackets)} />
                    </SettingRow>

                    {/* Auto Close Quotes Toggle */}
                    <SettingRow label={t("auto_close_quotes") || "Otomatik Tırnak Kapatma"} desc={t("auto_close_quotes_desc") || "' \" karakterlerini otomatik kapat"}>
                        <ToggleSwitch enabled={autoCloseQuotes} onToggle={() => setAutoCloseQuotes(!autoCloseQuotes)} />
                    </SettingRow>

                    {/* Format On Paste Toggle */}
                    <SettingRow label={t("format_on_paste") || "Yapıştırırken Biçimlendir"} desc={t("format_on_paste_desc") || "Yapıştırılan kodu otomatik biçimlendir"}>
                        <ToggleSwitch enabled={formatOnPaste} onToggle={() => setFormatOnPaste(!formatOnPaste)} />
                    </SettingRow>

                    {/* Format On Type */}
                    <SettingRow label={t("format_on_type") || "Yazarken Biçimlendir"} desc={t("format_on_type_desc") || "Satır sonunda otomatik kodu biçimlendir"}>
                        <ToggleSwitch enabled={formatOnType} onToggle={() => setFormatOnType(!formatOnType)} />
                    </SettingRow>

                    {/* Highlight Active Line Toggle */}
                    <SettingRow label={t("highlight_active_line") || "Aktif Satırı Vurgula"} desc={t("highlight_active_line_desc") || "Geçerli satırı vurgula"}>
                        <ToggleSwitch enabled={highlightActiveLine} onToggle={() => setHighlightActiveLine(!highlightActiveLine)} />
                    </SettingRow>

                    {/* Render Indent Guides Toggle */}
                    <SettingRow label={t("indent_guides") || "Girinti Kılavuzları"} desc={t("indent_guides_desc") || "Görsel girinti çizgileri göster"}>
                        <ToggleSwitch enabled={renderIndentGuides} onToggle={() => setRenderIndentGuides(!renderIndentGuides)} />
                    </SettingRow>

                    {/* Insert Final Newline */}
                    <SettingRow label={t("insert_final_newline") || "Dosya Sonu Yeni Satır"} desc={t("insert_final_newline_desc") || "Kaydederken dosya sonuna otomatik yeni satır ekle"}>
                        <ToggleSwitch enabled={insertFinalNewline} onToggle={() => setInsertFinalNewline(!insertFinalNewline)} />
                    </SettingRow>

                    {/* Render Whitespace */}
                    <div className="flex items-center justify-between py-4 border-b border-zinc-100 dark:border-zinc-800">
                        <div className="pr-4">
                            <span className="block">{t("render_whitespace") || "Boşlukları Göster"}</span>
                            <span className="text-sm text-zinc-500">{t("render_whitespace_desc") || "Boşluk ve tab karakterlerini görünür yap"}</span>
                        </div>
                        <select
                            value={renderWhitespace}
                            onChange={(e) => setRenderWhitespace(e.target.value)}
                            className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            {whitespaceOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Auto Indent */}
                    <div className="flex items-center justify-between py-4">
                        <div className="pr-4">
                            <span className="block">{t("auto_indent") || "Otomatik Girinti"}</span>
                            <span className="text-sm text-zinc-500">{t("auto_indent_desc") || "Yeni satırda otomatik girinti"}</span>
                        </div>
                        <select
                            value={autoIndent}
                            onChange={(e) => setAutoIndent(e.target.value)}
                            className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            {autoIndentOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>
                </section>

                {/* Reset Button */}
                <button
                    onClick={handleReset}
                    className="w-full mt-6 px-6 py-3 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold rounded-2xl transition-all"
                >
                    {t("reset_settings") || "Ayarları Sıfırla"}
                </button>
            </main>
        </div>
    );
}
