"use client";

import { motion } from "framer-motion";
import {
    AlertTriangle, Check, ClipboardCopy, Code2, Download, Eye, MousePointer2, Palette, RotateCcw, Save, Search, Settings2, Sparkles,
    SquareTerminal, Type, Upload, X, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import CodeEditor from "@/components/Editor/CodeEditor";
import LanguageIcon from "@/components/Editor/LanguageIcon";
import { buttonClasses, useConfirm } from "@/components/Editor/Modal";
import { ToastViewport, useToasts } from "@/components/Editor/Toasts";
import { triggerDownload } from "@/components/Editor/editor-files";
import { searchKey } from "@/components/Editor/search";
import Header from "@/components/Header";
import SiteFooter from "@/components/SiteFooter";
import {
    DEFAULT_EDITOR_SETTINGS, EDITOR_FONTS, EDITOR_THEMES, SETTING_LIMITS, parseEditorSettingsFile, resetEditorSettings, resolveEditorTheme,
    saveEditorSettings, serializeEditorSettings, updateEditorSettings, useEditorSettings, type EditorSettings, type SettingsImportError,
} from "@/lib/editor-settings";
import { useI18n, type Copy } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";

// ------------------------------------------------------------------ setting definitions
type KeysOf<V> = { [K in keyof EditorSettings]-?: EditorSettings[K] extends V ? K : never }[keyof EditorSettings];
type SettingKey = Exclude<keyof EditorSettings, "version">;
type BoolKey = KeysOf<boolean>;
type NumberKey = Exclude<KeysOf<number>, "version">;
type ChoiceKey = Exclude<KeysOf<string>, "theme" | "fontFamily"> | NumberKey;

type Choice = { value: string | number; label: Copy };

type RowBase = {
    label: Copy;
    description?: Copy;
    /** Extra search words (both languages). */
    keywords?: string;
    /** Hidden while false (e.g. the wrap column when wrapping is off). */
    visible?: (settings: EditorSettings) => boolean;
};

type RowDef = RowBase & (
    | { kind: "toggle"; key: BoolKey }
    | { kind: "binary"; key: BoolKey; on: Copy; off: Copy }
    | { kind: "segmented" | "select"; key: ChoiceKey; options: readonly Choice[] }
    | { kind: "slider"; key: NumberKey; min: number; max: number; step: number; unit: Copy; scale?: number; zero?: Copy }
    | { kind: "theme"; key: "theme" }
    | { kind: "font"; key: "fontFamily" }
);

type SectionDef = { id: string; icon: LucideIcon; title: Copy; description: Copy; rows: RowDef[] };

const AUTO_CLOSING_OPTIONS: readonly Choice[] = [
    { value: "languageDefined", label: { TR: "Dile göre", EN: "Language defined" } },
    { value: "always", label: { TR: "Her zaman", EN: "Always" } },
    { value: "beforeWhitespace", label: { TR: "Yalnızca boşluktan önce", EN: "Only before whitespace" } },
    { value: "never", label: { TR: "Asla", EN: "Never" } },
];

const SECTIONS: readonly SectionDef[] = [
    {
        id: "appearance",
        icon: Palette,
        title: { TR: "Görünüm", EN: "Appearance" },
        description: { TR: "Renk teması, kılavuzlar ve editör kenarındaki yardımcılar.", EN: "Colour theme, guides and the helpers around the editor." },
        rows: [
            {
                kind: "theme", key: "theme",
                label: { TR: "Renk teması", EN: "Colour theme" },
                description: { TR: "\"Site temasını izle\", sitenin açık veya koyu moduna göre VS Açık ya da VS Koyu temayı kullanır.", EN: "\"Follow site theme\" uses VS Light or VS Dark depending on the site's light or dark mode." },
                keywords: "theme tema renk color dark light koyu açık dracula monokai nord solarized github contrast kontrast",
            },
            { kind: "toggle", key: "minimap", label: { TR: "Mini harita", EN: "Minimap" }, description: { TR: "Sağ kenarda kodun küçük bir özetini gösterir.", EN: "Shows a small overview of the code on the right edge." } },
            {
                kind: "segmented", key: "lineNumbers",
                label: { TR: "Satır numaraları", EN: "Line numbers" },
                description: { TR: "Göreli numaralar her satırın imlece uzaklığını gösterir.", EN: "Relative numbers show each line's distance from the cursor." },
                options: [
                    { value: "on", label: { TR: "Açık", EN: "On" } },
                    { value: "relative", label: { TR: "Göreli", EN: "Relative" } },
                    { value: "off", label: { TR: "Kapalı", EN: "Off" } },
                ],
            },
            {
                kind: "select", key: "renderWhitespace",
                label: { TR: "Boşlukları göster", EN: "Render whitespace" },
                description: { TR: "Boşluk ve sekme karakterlerini noktalar ve oklarla gösterir.", EN: "Draws spaces and tabs as dots and arrows." },
                keywords: "whitespace boşluk space tab",
                options: [
                    { value: "none", label: { TR: "Gösterme", EN: "None" } },
                    { value: "boundary", label: { TR: "Kelime sınırlarında", EN: "At word boundaries" } },
                    { value: "selection", label: { TR: "Yalnızca seçimde", EN: "In the selection only" } },
                    { value: "trailing", label: { TR: "Satır sonundakiler", EN: "Trailing only" } },
                    { value: "all", label: { TR: "Tümü", EN: "All" } },
                ],
            },
            { kind: "toggle", key: "highlightActiveLine", label: { TR: "Etkin satırı vurgula", EN: "Highlight the active line" } },
            { kind: "toggle", key: "bracketPairColorization", label: { TR: "Parantez çiftlerini renklendir", EN: "Bracket pair colourization" }, description: { TR: "İç içe parantezleri farklı renklerle gösterir.", EN: "Shows nested brackets in different colours." }, keywords: "bracket parantez renk" },
            { kind: "toggle", key: "bracketPairGuides", label: { TR: "Parantez kılavuzları", EN: "Bracket pair guides" }, description: { TR: "Eşleşen parantezleri dikey çizgilerle bağlar.", EN: "Connects matching brackets with vertical lines." }, keywords: "bracket guide parantez kılavuz" },
            { kind: "toggle", key: "indentGuides", label: { TR: "Girinti kılavuzları", EN: "Indentation guides" }, description: { TR: "Her girinti düzeyinde ince dikey çizgiler çizer.", EN: "Draws thin vertical lines at each indentation level." } },
            {
                kind: "select", key: "ruler",
                label: { TR: "Dikey cetvel", EN: "Vertical ruler" },
                description: { TR: "Satır uzunluğunu sınırlı tutmak için seçilen sütunda bir çizgi gösterir.", EN: "Shows a line at the chosen column to help keep lines short." },
                keywords: "ruler cetvel column sütun",
                options: [
                    { value: 0, label: { TR: "Kapalı", EN: "Off" } },
                    { value: 72, label: { TR: "72. sütun", EN: "Column 72" } },
                    { value: 80, label: { TR: "80. sütun", EN: "Column 80" } },
                    { value: 100, label: { TR: "100. sütun", EN: "Column 100" } },
                    { value: 120, label: { TR: "120. sütun", EN: "Column 120" } },
                ],
            },
            { kind: "toggle", key: "folding", label: { TR: "Kod katlama", EN: "Code folding" }, description: { TR: "Satır numaralarının yanında blokları katlamak için oklar gösterir.", EN: "Shows arrows next to the line numbers to fold blocks." } },
        ],
    },
    {
        id: "font",
        icon: Type,
        title: { TR: "Yazı tipi", EN: "Font" },
        description: { TR: "Kodun yazı tipi, boyutu ve satır aralığı.", EN: "The code font, its size and the line spacing." },
        rows: [
            {
                kind: "font", key: "fontFamily",
                label: { TR: "Yazı tipi ailesi", EN: "Font family" },
                description: { TR: "JetBrains Mono siteyle birlikte gelir. Diğerleri cihazınızda yüklüyse kullanılır; yüklü değilse JetBrains Mono'ya dönülür.", EN: "JetBrains Mono ships with the site. The others are used when installed on your device; otherwise JetBrains Mono is used." },
                keywords: "font yazı tipi jetbrains fira cascadia consolas menlo monospace",
            },
            { kind: "slider", key: "fontSize", label: { TR: "Yazı boyutu", EN: "Font size" }, min: SETTING_LIMITS.fontSize.min, max: SETTING_LIMITS.fontSize.max, step: 1, unit: { TR: "{value} px", EN: "{value} px" }, keywords: "size boyut" },
            { kind: "slider", key: "lineHeight", label: { TR: "Satır yüksekliği", EN: "Line height" }, description: { TR: "Yazı boyutunun katı olarak satır aralığı.", EN: "Line spacing as a multiple of the font size." }, min: SETTING_LIMITS.lineHeight.min, max: SETTING_LIMITS.lineHeight.max, step: 0.1, unit: { TR: "{value}×", EN: "{value}×" }, keywords: "line height satır aralık" },
            { kind: "toggle", key: "fontLigatures", label: { TR: "Bitişik harfler (ligatür)", EN: "Font ligatures" }, description: { TR: "=>, !== ve >= gibi işaretleri tek simge olarak çizer (JetBrains Mono, Fira Code ve Cascadia Code destekler).", EN: "Draws symbols such as =>, !== and >= as single glyphs (supported by JetBrains Mono, Fira Code and Cascadia Code)." }, keywords: "ligature ligatür" },
            { kind: "toggle", key: "mouseWheelZoom", label: { TR: "Fare tekerleğiyle yakınlaştır", EN: "Zoom with the mouse wheel" }, description: { TR: "Ctrl (Mac'te ⌘) basılıyken tekerlek yazı boyutunu geçici olarak değiştirir.", EN: "With Ctrl (⌘ on Mac) held, the wheel changes the font size temporarily." }, keywords: "zoom yakınlaştır" },
        ],
    },
    {
        id: "cursor",
        icon: MousePointer2,
        title: { TR: "İmleç ve kaydırma", EN: "Cursor and scrolling" },
        description: { TR: "İmlecin görünümü ve editörün kayma davranışı.", EN: "How the cursor looks and how the editor scrolls." },
        rows: [
            {
                kind: "select", key: "cursorStyle",
                label: { TR: "İmleç stili", EN: "Cursor style" },
                options: [
                    { value: "line", label: { TR: "Çizgi", EN: "Line" } },
                    { value: "line-thin", label: { TR: "İnce çizgi", EN: "Thin line" } },
                    { value: "block", label: { TR: "Blok", EN: "Block" } },
                    { value: "block-outline", label: { TR: "Blok çerçeve", EN: "Block outline" } },
                    { value: "underline", label: { TR: "Alt çizgi", EN: "Underline" } },
                    { value: "underline-thin", label: { TR: "İnce alt çizgi", EN: "Thin underline" } },
                ],
            },
            {
                kind: "select", key: "cursorBlinking",
                label: { TR: "İmleç animasyonu", EN: "Cursor blinking" },
                options: [
                    { value: "blink", label: { TR: "Yanıp sönme", EN: "Blink" } },
                    { value: "smooth", label: { TR: "Yumuşak", EN: "Smooth" } },
                    { value: "phase", label: { TR: "Faz", EN: "Phase" } },
                    { value: "expand", label: { TR: "Genişleme", EN: "Expand" } },
                    { value: "solid", label: { TR: "Sabit (yanıp sönmez)", EN: "Solid (no blinking)" } },
                ],
            },
            { kind: "toggle", key: "cursorSmoothCaretAnimation", label: { TR: "Yumuşak imleç hareketi", EN: "Smooth caret animation" }, description: { TR: "İmleç yeni konumuna atlamak yerine kayarak gider.", EN: "The cursor glides to its new position instead of jumping." } },
            { kind: "toggle", key: "smoothScrolling", label: { TR: "Yumuşak kaydırma", EN: "Smooth scrolling" } },
            { kind: "toggle", key: "stickyScroll", label: { TR: "Yapışkan kaydırma", EN: "Sticky scroll" }, description: { TR: "Kaydırırken içinde bulunduğunuz sınıf ve fonksiyon başlıklarını üstte sabit tutar.", EN: "Keeps the headers of the class and function you are in pinned to the top while scrolling." } },
            { kind: "toggle", key: "scrollBeyondLastLine", label: { TR: "Son satırın ötesine kaydır", EN: "Scroll beyond the last line" }, description: { TR: "Son satırı ekranın ortasına kadar kaydırabilmenizi sağlar.", EN: "Lets you scroll the last line up to the middle of the screen." } },
        ],
    },
    {
        id: "editing",
        icon: Code2,
        title: { TR: "Düzenleme", EN: "Editing" },
        description: { TR: "Girinti, satır kaydırma, otomatik kapatma ve biçimlendirme.", EN: "Indentation, word wrap, auto-closing and formatting." },
        rows: [
            { kind: "slider", key: "tabSize", label: { TR: "Sekme boyutu", EN: "Tab size" }, description: { TR: "Bir girinti düzeyinin genişliği.", EN: "The width of one indentation level." }, min: SETTING_LIMITS.tabSize.min, max: SETTING_LIMITS.tabSize.max, step: 1, unit: { TR: "{value} sütun", EN: "{value} columns" }, keywords: "tab indent girinti" },
            { kind: "binary", key: "insertSpaces", label: { TR: "Girinti karakteri", EN: "Indent using" }, on: { TR: "Boşluk", EN: "Spaces" }, off: { TR: "Sekme (Tab)", EN: "Tabs" }, keywords: "spaces tabs boşluk sekme indent girinti" },
            { kind: "toggle", key: "detectIndentation", label: { TR: "Girintiyi dosyadan algıla", EN: "Detect indentation from the file" }, description: { TR: "Açılan dosyanın mevcut girintisi yukarıdaki iki ayarın önüne geçer.", EN: "An opened file's existing indentation overrides the two settings above." }, keywords: "indent girinti detect" },
            {
                kind: "segmented", key: "wordWrap",
                label: { TR: "Satır kaydırma", EN: "Word wrap" },
                description: { TR: "Uzun satırları yatay kaydırma yerine alt satıra taşır.", EN: "Wraps long lines instead of scrolling horizontally." },
                keywords: "wrap kaydırma",
                options: [
                    { value: "off", label: { TR: "Kapalı", EN: "Off" } },
                    { value: "on", label: { TR: "Pencere kenarında", EN: "At the viewport" } },
                    { value: "bounded", label: { TR: "Sütunda", EN: "At a column" } },
                ],
            },
            { kind: "slider", key: "wordWrapColumn", label: { TR: "Kaydırma sütunu", EN: "Wrap column" }, min: SETTING_LIMITS.wordWrapColumn.min, max: SETTING_LIMITS.wordWrapColumn.max, step: 5, unit: { TR: "{value}. sütun", EN: "Column {value}" }, visible: (settings) => settings.wordWrap === "bounded", keywords: "wrap column" },
            { kind: "select", key: "autoClosingBrackets", label: { TR: "Parantezleri otomatik kapat", EN: "Auto-close brackets" }, description: { TR: "( [ { yazınca kapanış karakterini ekler.", EN: "Adds the closing character when you type ( [ {." }, options: AUTO_CLOSING_OPTIONS, keywords: "bracket parantez close kapat" },
            { kind: "select", key: "autoClosingQuotes", label: { TR: "Tırnakları otomatik kapat", EN: "Auto-close quotes" }, description: { TR: "' ve \" yazınca kapanış tırnağını ekler.", EN: "Adds the closing quote when you type ' or \"." }, options: AUTO_CLOSING_OPTIONS, keywords: "quote tırnak close kapat" },
            {
                kind: "select", key: "autoIndent",
                label: { TR: "Otomatik girinti", EN: "Auto indent" },
                description: { TR: "Enter'a basınca yeni satırın girintisini belirler.", EN: "Decides the indentation of a new line when you press Enter." },
                options: [
                    { value: "none", label: { TR: "Yok", EN: "None" } },
                    { value: "keep", label: { TR: "Önceki satırı koru", EN: "Keep the previous line" } },
                    { value: "brackets", label: { TR: "Parantezlere göre", EN: "Based on brackets" } },
                    { value: "advanced", label: { TR: "Gelişmiş", EN: "Advanced" } },
                    { value: "full", label: { TR: "Tam (dil kuralları)", EN: "Full (language rules)" } },
                ],
            },
            { kind: "toggle", key: "formatOnPaste", label: { TR: "Yapıştırırken biçimlendir", EN: "Format on paste" }, description: { TR: "Yapıştırılan kodu dilin biçimlendiricisiyle düzenler (JavaScript, TypeScript, JSON, HTML, CSS).", EN: "Formats pasted code with the language's formatter (JavaScript, TypeScript, JSON, HTML, CSS)." }, keywords: "format biçim paste" },
            { kind: "toggle", key: "formatOnType", label: { TR: "Yazarken biçimlendir", EN: "Format on type" }, description: { TR: "Satır sonunda veya } yazınca satırı biçimlendirir.", EN: "Formats the line when you finish it or type }." }, keywords: "format biçim type" },
            { kind: "toggle", key: "linkedEditing", label: { TR: "Bağlantılı düzenleme", EN: "Linked editing" }, description: { TR: "HTML'de açılış etiketini değiştirince kapanış etiketi de değişir.", EN: "In HTML, renaming an opening tag also renames the closing tag." }, keywords: "html tag etiket" },
        ],
    },
    {
        id: "suggestions",
        icon: Sparkles,
        title: { TR: "Öneriler ve ipuçları", EN: "Suggestions and hints" },
        description: { TR: "Otomatik tamamlama, parametre ipuçları ve fareyle bilgi.", EN: "Autocomplete, parameter hints and hover information." },
        rows: [
            { kind: "toggle", key: "quickSuggestions", label: { TR: "Yazarken öner", EN: "Suggest while typing" }, description: { TR: "Siz yazarken tamamlama listesini açar. Kapalıyken Ctrl+Boşluk ile açabilirsiniz.", EN: "Opens the completion list as you type. When off, press Ctrl+Space to open it." }, keywords: "autocomplete intellisense tamamlama" },
            { kind: "toggle", key: "suggestOnTriggerCharacters", label: { TR: "Tetikleyici karakterlerde öner", EN: "Suggest on trigger characters" }, description: { TR: "Nokta (.) gibi karakterlerden sonra önerileri gösterir.", EN: "Shows suggestions after characters such as a dot (.)." }, keywords: "autocomplete trigger" },
            { kind: "toggle", key: "snippetSuggestions", label: { TR: "Kod parçacığı önerileri", EN: "Snippet suggestions" }, description: { TR: "for, if, class gibi hazır kalıpları önerilerde gösterir.", EN: "Includes ready-made patterns such as for, if and class in suggestions." }, keywords: "snippet parçacık" },
            { kind: "toggle", key: "parameterHints", label: { TR: "Parametre ipuçları", EN: "Parameter hints" }, description: { TR: "Fonksiyon çağrısı yazarken parametre listesini gösterir.", EN: "Shows the parameter list while you type a function call." } },
            { kind: "toggle", key: "hover", label: { TR: "Üzerine gelince bilgi", EN: "Hover information" }, description: { TR: "Fare bir sembolün üzerindeyken tür ve belge bilgisini gösterir.", EN: "Shows type and documentation information when the mouse is over a symbol." }, keywords: "hover fare" },
        ],
    },
    {
        id: "saving",
        icon: Save,
        title: { TR: "Kaydetme", EN: "Saving" },
        description: { TR: "Otomatik kaydetme ve kaydederken yapılan temizlikler.", EN: "Auto save and the clean-ups applied when saving." },
        rows: [
            {
                kind: "segmented", key: "autoSave",
                label: { TR: "Otomatik kaydetme", EN: "Auto save" },
                description: { TR: "Giriş yapmışken, buluta en az bir kez kaydedilmiş projelerde ve oyun scriptlerinde çalışır.", EN: "Works while signed in, for projects and game scripts that were saved to the cloud at least once." },
                keywords: "auto save otomatik kaydet",
                options: [
                    { value: "off", label: { TR: "Kapalı", EN: "Off" } },
                    { value: "afterDelay", label: { TR: "Gecikmeyle", EN: "After a delay" } },
                    { value: "onFocusChange", label: { TR: "Odak değişince", EN: "On focus change" } },
                ],
            },
            { kind: "slider", key: "autoSaveDelay", label: { TR: "Kaydetme gecikmesi", EN: "Save delay" }, description: { TR: "Yazmayı bıraktıktan bu kadar sonra kaydedilir.", EN: "Saves this long after you stop typing." }, min: SETTING_LIMITS.autoSaveDelay.min, max: SETTING_LIMITS.autoSaveDelay.max, step: 500, scale: 1000, unit: { TR: "{value} sn", EN: "{value} s" }, visible: (settings) => settings.autoSave === "afterDelay", keywords: "delay gecikme" },
            { kind: "toggle", key: "trimTrailingWhitespace", label: { TR: "Satır sonu boşluklarını sil", EN: "Trim trailing whitespace" }, description: { TR: "Kaydederken satırların sonundaki boşlukları kaldırır.", EN: "Removes spaces at the end of lines when saving." }, keywords: "trim whitespace boşluk" },
            { kind: "toggle", key: "insertFinalNewline", label: { TR: "Sona boş satır ekle", EN: "Insert a final newline" }, description: { TR: "Kaydederken dosyanın bir satır sonuyla bitmesini sağlar.", EN: "Makes sure the file ends with a line break when saving." }, keywords: "newline satır" },
        ],
    },
];

const SECTION_KEYS: Record<string, SettingKey[]> = Object.fromEntries(SECTIONS.map((section) => [section.id, section.rows.map((row) => row.key)]));
const ALL_KEYS = Object.keys(DEFAULT_EDITOR_SETTINGS).filter((key): key is SettingKey => key !== "version");

const C = {
    eyebrow: { TR: "Kod editörü", EN: "Code editor" },
    title: { TR: "Editör ayarları", EN: "Editor settings" },
    subtitle: { TR: "Kod editörünü kendinize göre ayarlayın. Her değişiklik anında kaydedilir ve açık olan tüm editörlere uygulanır.", EN: "Make the code editor your own. Every change is saved instantly and applied to all open editors." },
    storedLocally: { TR: "Ayarlar bu cihazdaki tarayıcıda saklanır.", EN: "Settings are stored in this browser on this device." },
    storageBlocked: { TR: "Tarayıcı depolaması kullanılamıyor (ör. gizli pencere). Ayarlar yalnızca bu sayfa açıkken geçerli olur.", EN: "Browser storage is unavailable (e.g. a private window). Settings only apply while this page is open." },
    openEditor: { TR: "Editörü aç", EN: "Open the editor" },
    search: { TR: "Ayarlarda ara…", EN: "Search settings…" },
    searchLabel: { TR: "Ayarlarda ara", EN: "Search settings" },
    clearSearch: { TR: "Aramayı temizle", EN: "Clear search" },
    noResults: { TR: "\"{query}\" ile eşleşen ayar yok.", EN: "No setting matches \"{query}\"." },
    sections: { TR: "Bölümler", EN: "Sections" },
    saved: { TR: "Kaydedildi", EN: "Saved" },
    modified: { TR: "{count} ayar varsayılandan farklı", EN: "{count} settings differ from the defaults" },
    allDefault: { TR: "Tüm ayarlar varsayılan değerlerinde", EN: "All settings are at their defaults" },
    modifiedDot: { TR: "Varsayılandan farklı", EN: "Changed from the default" },
    resetRow: { TR: "Varsayılana döndür: {name}", EN: "Reset to default: {name}" },
    resetSection: { TR: "Bölümü sıfırla", EN: "Reset section" },
    sectionReset: { TR: "{name} ayarları varsayılana döndü.", EN: "{name} settings were reset to their defaults." },
    undo: { TR: "Geri al", EN: "Undo" },
    preview: { TR: "Canlı önizleme", EN: "Live preview" },
    previewHint: { TR: "Ayarlar anında uygulanır; burada yazmayı deneyebilirsiniz. Önizlemedeki değişiklikler kaydedilmez.", EN: "Settings apply instantly and you can type here to try them. Changes in the preview aren't saved." },
    previewLanguage: { TR: "Önizleme dili", EN: "Preview language" },
    resetSample: { TR: "Örneği sıfırla", EN: "Reset the sample" },
    previewEditor: { TR: "Ayar önizleme düzenleyicisi", EN: "Settings preview editor" },
    jumpToPreview: { TR: "Önizlemeye git", EN: "Go to the preview" },
    currentTheme: { TR: "Şu an: {name}", EN: "Currently: {name}" },
    builtIn: { TR: "Dahili", EN: "Built-in" },
    system: { TR: "Sistem", EN: "System" },
    backupTitle: { TR: "Yedekleme ve sıfırlama", EN: "Backup and reset" },
    backupDescription: { TR: "Ayarlarınızı bir JSON dosyasına aktarın, başka bir cihazda içe aktarın veya varsayılanlara dönün.", EN: "Export your settings to a JSON file, import them on another device or go back to the defaults." },
    export: { TR: "Dışa aktar (JSON)", EN: "Export (JSON)" },
    import: { TR: "İçe aktar", EN: "Import" },
    copyJson: { TR: "JSON'u kopyala", EN: "Copy JSON" },
    copied: { TR: "Ayarlar JSON olarak panoya kopyalandı.", EN: "The settings were copied to the clipboard as JSON." },
    copyFailed: { TR: "Panoya kopyalanamadı.", EN: "Couldn't copy to the clipboard." },
    exported: { TR: "Ayar dosyası indirildi.", EN: "The settings file was downloaded." },
    imported: { TR: "Ayarlar içe aktarıldı.", EN: "The settings were imported." },
    importHint: { TR: "Hanogt'tan dışa aktarılan ayar dosyaları ve hesap veri dışa aktarımları kabul edilir.", EN: "Accepts settings files exported from Hanogt and account data exports." },
    resetAll: { TR: "Tümünü varsayılana döndür", EN: "Reset everything" },
    resetAllTitle: { TR: "Tüm editör ayarları sıfırlansın mı?", EN: "Reset all editor settings?" },
    resetAllMessage: { TR: "Tema, yazı tipi ve diğer tüm editör tercihleri varsayılan değerlerine döner. Bu cihazdaki kayıtlı ayarlar silinir.", EN: "The theme, font and every other editor preference go back to their default values. The settings saved on this device are removed." },
    resetConfirm: { TR: "Sıfırla", EN: "Reset" },
    resetDone: { TR: "Editör ayarları varsayılana döndü.", EN: "The editor settings were reset to their defaults." },
    sliderValue: { TR: "{label}: {value}", EN: "{label}: {value}" },
} satisfies Record<string, Copy>;

const IMPORT_ERRORS: Record<SettingsImportError, Copy> = {
    too_large: { TR: "Dosya çok büyük (en fazla 64 KB).", EN: "The file is too large (64 KB max)." },
    invalid_json: { TR: "Dosya geçerli bir JSON değil.", EN: "The file isn't valid JSON." },
    invalid_format: { TR: "Bu dosya Hanogt editör ayarlarını içermiyor.", EN: "This file doesn't contain Hanogt editor settings." },
};

// ------------------------------------------------------------------ preview samples
type SampleId = "python" | "javascript" | "typescript" | "cpp" | "rust" | "html";

const SAMPLES: Record<SampleId, string> = {
    python: `from dataclasses import dataclass, field


@dataclass
class Inventory:
    owner: str
    items: dict[str, int] = field(default_factory=dict)

    def add(self, name: str, amount: int = 1) -> "Inventory":
        self.items[name] = self.items.get(name, 0) + amount
        return self

    def total(self) -> int:
        return sum(self.items.values())


def even_squares(limit: int) -> list[int]:
    return [n * n for n in range(limit) if n % 2 == 0]


inventory = Inventory("Ada").add("apple", 3).add("pear")
if inventory.total() >= 4 and even_squares(10) != []:
    print(f"{inventory.owner}: {inventory.total()} items -> {', '.join(sorted(inventory.items))}; squares = {even_squares(10)}")
`,
    javascript: `const fibonacci = (n) => (n <= 1 ? n : fibonacci(n - 1) + fibonacci(n - 2));

class Counter {
    #count = 0;

    increment(step = 1) {
        this.#count += step;
        return this;
    }

    get value() {
        return this.#count;
    }
}

const counter = new Counter().increment().increment(2);
const rows = [1, 2, 3, 4, 5].map((n) => ({ n, fib: fibonacci(n), even: n % 2 === 0 }));

if (counter.value !== 3 || rows.length >= 10) {
    throw new Error("Unexpected state");
}

console.log(\`Counter: \${counter.value}\`, rows.filter(({ even }) => even).map(({ fib }) => fib), rows.map(({ n, fib }) => \`\${n} => \${fib}\`).join(", "));
`,
    typescript: `interface Shape {
    kind: "circle" | "square";
    size: number;
}

function area(shape: Shape): number {
    switch (shape.kind) {
        case "circle":
            return Math.PI * shape.size ** 2;
        case "square":
            return shape.size * shape.size;
    }
}

const shapes: Shape[] = [
    { kind: "circle", size: 2 },
    { kind: "square", size: 3 },
];

const total = shapes.reduce((sum, shape) => sum + area(shape), 0);
const largest = shapes.filter((shape) => area(shape) >= total / shapes.length);

console.log(total.toFixed(2), largest.map((shape) => \`\${shape.kind}:\${area(shape).toFixed(1)}\`).join(" | "), shapes.length !== 0);
`,
    cpp: `#include <iostream>
#include <map>
#include <string>
#include <vector>

struct Student {
    std::string name;
    std::vector<int> grades;

    double average() const {
        if (grades.empty()) return 0.0;
        int sum = 0;
        for (int grade : grades) sum += grade;
        return static_cast<double>(sum) / grades.size();
    }
};

int main() {
    std::vector<Student> students{{"Ada", {90, 85, 100}}, {"Linus", {70, 95, 88}}};
    std::map<std::string, double> averages;
    for (const auto& student : students) {
        averages[student.name] = student.average();
    }
    for (const auto& [name, average] : averages) {
        std::cout << name << ": " << average << (average >= 90 ? " (A)" : "") << '\\n';
    }
    return 0;
}
`,
    rust: `use std::collections::HashMap;

#[derive(Debug)]
struct Word<'a> {
    text: &'a str,
    count: usize,
}

fn frequencies(text: &str) -> Vec<Word<'_>> {
    let mut counts: HashMap<&str, usize> = HashMap::new();
    for word in text.split_whitespace() {
        *counts.entry(word).or_insert(0) += 1;
    }
    let mut words: Vec<Word> = counts.into_iter().map(|(text, count)| Word { text, count }).collect();
    words.sort_by(|a, b| b.count.cmp(&a.count).then(a.text.cmp(b.text)));
    words
}

fn main() {
    for word in frequencies("to be or not to be").iter().filter(|w| w.count >= 1) {
        println!("{:>4} => {}", word.text, word.count);
    }
}
`,
    html: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Hanogt</title>
    <style>
        body { font-family: system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; }
        .card { padding: 2rem; border-radius: 1rem; color: white; background: linear-gradient(135deg, #6366f1, #d946ef); }
    </style>
</head>
<body>
    <main class="card">
        <h1 id="title">Hello!</h1>
        <button type="button" onclick="document.getElementById('title').textContent = 'Clicked'">Click</button>
    </main>
</body>
</html>
`,
};

const SAMPLE_IDS = Object.keys(SAMPLES) as SampleId[];
const SAMPLE_NAMES: Record<SampleId, string> = { python: "Python", javascript: "JavaScript", typescript: "TypeScript", cpp: "C++", rust: "Rust", html: "HTML" };
const SAMPLE_EXTENSIONS: Record<SampleId, string> = { python: "py", javascript: "js", typescript: "ts", cpp: "cpp", rust: "rs", html: "html" };

// ------------------------------------------------------------------ helpers
let storageProbe: boolean | null = null;
function storageAvailable(): boolean {
    if (storageProbe !== null) return storageProbe;
    try {
        const key = "__hanogt_settings_probe__";
        window.localStorage.setItem(key, key);
        window.localStorage.removeItem(key);
        storageProbe = true;
    } catch {
        storageProbe = false;
    }
    return storageProbe;
}
const subscribeNothing = () => () => undefined;

const sameValue = (a: unknown, b: unknown) => a === b;

/** Arrow keys, Home and End move the selection inside a radio group. */
function handleRadioKeys<T>(event: KeyboardEvent<HTMLElement>, values: readonly T[], current: T, select: (value: T) => void, rtl: boolean) {
    const index = Math.max(0, values.indexOf(current));
    let next = -1;
    if (event.key === "ArrowDown" || event.key === (rtl ? "ArrowLeft" : "ArrowRight")) next = (index + 1) % values.length;
    else if (event.key === "ArrowUp" || event.key === (rtl ? "ArrowRight" : "ArrowLeft")) next = (index - 1 + values.length) % values.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = values.length - 1;
    if (next < 0) return;
    event.preventDefault();
    select(values[next]);
    const group = event.currentTarget;
    window.requestAnimationFrame(() => group.querySelector<HTMLElement>(`[data-index="${next}"]`)?.focus());
}

// ------------------------------------------------------------------ controls
function Toggle({ checked, onChange, labelledBy, describedBy }: { checked: boolean; onChange: (value: boolean) => void; labelledBy: string; describedBy?: string }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-labelledby={labelledBy}
            aria-describedby={describedBy}
            onClick={() => onChange(!checked)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900 ${checked ? "bg-gradient-to-r from-indigo-600 to-violet-600" : "bg-zinc-300 dark:bg-zinc-700"}`}
        >
            <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[22px] rtl:-translate-x-[22px]" : "translate-x-0.5 rtl:-translate-x-0.5"}`} />
        </button>
    );
}

function Segmented<T extends string | number | boolean>({ value, options, onChange, labelledBy }: { value: T; options: ReadonlyArray<{ value: T; label: string }>; onChange: (value: T) => void; labelledBy: string }) {
    const { dir } = useI18n();
    const values = options.map((option) => option.value);
    return (
        <div role="radiogroup" aria-labelledby={labelledBy} onKeyDown={(event) => handleRadioKeys(event, values, value, onChange, dir === "rtl")} className="inline-flex max-w-full flex-wrap gap-1 rounded-2xl border border-zinc-200 bg-zinc-100 p-1 dark:border-white/10 dark:bg-white/5">
            {options.map((option, index) => {
                const selected = sameValue(option.value, value);
                return (
                    <button
                        key={String(option.value)}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        tabIndex={selected ? 0 : -1}
                        data-index={index}
                        onClick={() => onChange(option.value)}
                        className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${selected ? "bg-white text-indigo-700 shadow-sm dark:bg-zinc-800 dark:text-indigo-200" : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"}`}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}

function SelectControl({ id, value, options, onChange, describedBy }: { id: string; value: string | number; options: ReadonlyArray<{ value: string | number; label: string }>; onChange: (value: string | number) => void; describedBy?: string }) {
    return (
        <select
            id={id}
            value={String(value)}
            aria-describedby={describedBy}
            onChange={(event) => {
                const picked = options.find((option) => String(option.value) === event.target.value);
                if (picked) onChange(picked.value);
            }}
            className="w-full min-w-0 max-w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 sm:w-56 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100"
        >
            {options.map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}
        </select>
    );
}

function SliderControl({ id, value, min, max, step, display, onChange, describedBy }: { id: string; value: number; min: number; max: number; step: number; display: string; onChange: (value: number) => void; describedBy?: string }) {
    return (
        <div className="flex w-full items-center gap-3 sm:w-64">
            <input
                id={id}
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                aria-valuetext={display}
                aria-describedby={describedBy}
                onChange={(event) => onChange(Number(event.target.value))}
                className="h-2 min-w-0 flex-1 cursor-pointer accent-indigo-600"
            />
            <output htmlFor={id} className="w-20 shrink-0 rounded-lg bg-zinc-100 px-2 py-1 text-center font-mono text-xs tabular-nums text-zinc-700 dark:bg-white/5 dark:text-zinc-200">{display}</output>
        </div>
    );
}

function ThemePicker({ value, onChange, labelledBy, siteTheme }: { value: EditorSettings["theme"]; onChange: (value: EditorSettings["theme"]) => void; labelledBy: string; siteTheme: "light" | "dark" }) {
    const { tx, dir } = useI18n();
    const ids = EDITOR_THEMES.map((theme) => theme.id);
    const resolved = resolveEditorTheme("auto", siteTheme);
    const resolvedLabel = EDITOR_THEMES.find((theme) => theme.id === resolved)?.label;
    return (
        <div role="radiogroup" aria-labelledby={labelledBy} onKeyDown={(event) => handleRadioKeys(event, ids, value, onChange, dir === "rtl")} className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {EDITOR_THEMES.map((theme, index) => {
                const selected = theme.id === value;
                const [background, foreground, accent, secondary] = theme.swatch;
                return (
                    <button
                        key={theme.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        tabIndex={selected ? 0 : -1}
                        data-index={index}
                        onClick={() => onChange(theme.id)}
                        className={`group overflow-hidden rounded-2xl border text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${selected ? "border-indigo-500 ring-2 ring-indigo-500/30" : "border-zinc-200 hover:border-indigo-400/60 dark:border-white/10"}`}
                    >
                        <span className="relative block h-16 overflow-hidden" aria-hidden>
                            {theme.id === "auto" ? (
                                <>
                                    <span className="absolute inset-0" style={{ background: "#FFFFFF", clipPath: "polygon(0 0, 100% 0, 0 100%)" }} />
                                    <span className="absolute inset-0" style={{ background: "#1E1E1E", clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }} />
                                    <span className="absolute start-3 top-3 h-1.5 w-10 rounded-full" style={{ background: "#0000FF" }} />
                                    <span className="absolute bottom-3 end-3 h-1.5 w-12 rounded-full" style={{ background: "#569CD6" }} />
                                </>
                            ) : (
                                <span className="absolute inset-0 flex flex-col justify-center gap-1.5 px-3" style={{ background }}>
                                    <span className="flex gap-1.5"><span className="h-1.5 w-6 rounded-full" style={{ background: accent }} /><span className="h-1.5 w-12 rounded-full opacity-80" style={{ background: foreground }} /></span>
                                    <span className="flex gap-1.5 ps-3"><span className="h-1.5 w-9 rounded-full opacity-80" style={{ background: foreground }} /><span className="h-1.5 w-8 rounded-full" style={{ background: secondary }} /></span>
                                    <span className="flex gap-1.5"><span className="h-1.5 w-4 rounded-full" style={{ background: accent }} /><span className="h-1.5 w-10 rounded-full opacity-60" style={{ background: foreground }} /></span>
                                </span>
                            )}
                            {selected && <span className="absolute end-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-white shadow"><Check className="h-3 w-3" /></span>}
                        </span>
                        <span className="block border-t border-zinc-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-zinc-900">
                            <span className="block truncate text-xs font-semibold text-zinc-800 dark:text-zinc-100">{tx(theme.label)}</span>
                            {theme.id === "auto" && resolvedLabel && <span className="block truncate text-[10px] text-zinc-500 dark:text-zinc-400">{tx(C.currentTheme, { name: tx(resolvedLabel) })}</span>}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

function FontPicker({ value, ligatures, onChange, labelledBy }: { value: EditorSettings["fontFamily"]; ligatures: boolean; onChange: (value: EditorSettings["fontFamily"]) => void; labelledBy: string }) {
    const { tx, dir } = useI18n();
    const ids = EDITOR_FONTS.map((font) => font.id);
    return (
        <div role="radiogroup" aria-labelledby={labelledBy} onKeyDown={(event) => handleRadioKeys(event, ids, value, onChange, dir === "rtl")} className="grid gap-2 sm:grid-cols-2">
            {EDITOR_FONTS.map((font, index) => {
                const selected = font.id === value;
                return (
                    <button
                        key={font.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        tabIndex={selected ? 0 : -1}
                        data-index={index}
                        onClick={() => onChange(font.id)}
                        className={`flex min-w-0 flex-col gap-1 rounded-2xl border px-3 py-2.5 text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${selected ? "border-indigo-500 bg-indigo-500/5 ring-2 ring-indigo-500/20" : "border-zinc-200 hover:border-indigo-400/60 dark:border-white/10"}`}
                    >
                        <span className="flex items-center gap-2">
                            <span className="truncate text-xs font-semibold text-zinc-800 dark:text-zinc-100">{font.label}</span>
                            {font.bundled && <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">{tx(C.builtIn)}</span>}
                            {font.id === "system" && <span className="rounded-full bg-zinc-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 dark:text-zinc-300">{tx(C.system)}</span>}
                            {selected && <Check className="ms-auto h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-300" aria-hidden />}
                        </span>
                        <span dir="ltr" className="truncate text-sm text-zinc-600 dark:text-zinc-300" style={{ fontFamily: font.stack, fontVariantLigatures: ligatures ? "normal" : "none" }} aria-hidden>
                            {"x => x !== 0 && y >= 1"}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

// ------------------------------------------------------------------ rows and sections
function SettingRow({ row, settings, onPatch, siteTheme }: { row: RowDef; settings: EditorSettings; onPatch: (patch: Partial<EditorSettings>) => void; siteTheme: "light" | "dark" }) {
    const { tx, locale } = useI18n();
    const baseId = useId();
    const labelId = `${baseId}-label`;
    const descriptionId = row.description ? `${baseId}-description` : undefined;
    const controlId = `${baseId}-control`;
    const label = tx(row.label);
    const value = settings[row.key];
    const modified = value !== DEFAULT_EDITOR_SETTINGS[row.key];
    const wide = row.kind === "theme" || row.kind === "font";
    const patch = (next: EditorSettings[typeof row.key]) => onPatch({ [row.key]: next } as Partial<EditorSettings>);

    let control: ReactNode;
    switch (row.kind) {
        case "toggle":
            control = <Toggle checked={settings[row.key]} onChange={(next) => onPatch({ [row.key]: next } as Partial<EditorSettings>)} labelledBy={labelId} describedBy={descriptionId} />;
            break;
        case "binary":
            control = (
                <Segmented
                    value={settings[row.key]}
                    labelledBy={labelId}
                    options={[{ value: true, label: tx(row.on) }, { value: false, label: tx(row.off) }]}
                    onChange={(next) => onPatch({ [row.key]: next } as Partial<EditorSettings>)}
                />
            );
            break;
        case "segmented":
            control = <Segmented value={settings[row.key]} labelledBy={labelId} options={row.options.map((option) => ({ value: option.value, label: tx(option.label) }))} onChange={(next) => onPatch({ [row.key]: next } as Partial<EditorSettings>)} />;
            break;
        case "select":
            control = <SelectControl id={controlId} value={settings[row.key]} describedBy={descriptionId} options={row.options.map((option) => ({ value: option.value, label: tx(option.label) }))} onChange={(next) => onPatch({ [row.key]: next } as Partial<EditorSettings>)} />;
            break;
        case "slider": {
            const number = new Intl.NumberFormat(locale, { maximumFractionDigits: row.step < 1 || row.scale ? 1 : 0 });
            const current = settings[row.key];
            const display = current === 0 && row.zero ? tx(row.zero) : tx(row.unit, { value: number.format(row.scale ? current / row.scale : current) });
            control = <SliderControl id={controlId} value={current} min={row.min} max={row.max} step={row.step} display={display} describedBy={descriptionId} onChange={(next) => onPatch({ [row.key]: next } as Partial<EditorSettings>)} />;
            break;
        }
        case "theme":
            control = <ThemePicker value={settings.theme} onChange={(next) => patch(next)} labelledBy={labelId} siteTheme={siteTheme} />;
            break;
        case "font":
            control = <FontPicker value={settings.fontFamily} ligatures={settings.fontLigatures} onChange={(next) => patch(next)} labelledBy={labelId} />;
            break;
    }

    const labelElement = row.kind === "select" || row.kind === "slider"
        ? <label id={labelId} htmlFor={controlId} className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{label}</label>
        : <span id={labelId} className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{label}</span>;

    return (
        <div className={`flex gap-3 py-4 ${wide ? "flex-col" : "flex-col sm:flex-row sm:items-center sm:justify-between"}`}>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    {labelElement}
                    {modified && (
                        <>
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" title={tx(C.modifiedDot)} aria-hidden />
                            <span className="sr-only">{tx(C.modifiedDot)}</span>
                            <button
                                type="button"
                                onClick={() => onPatch({ [row.key]: DEFAULT_EDITOR_SETTINGS[row.key] } as Partial<EditorSettings>)}
                                className="rounded-lg p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-white/10 dark:hover:text-zinc-200"
                                aria-label={tx(C.resetRow, { name: label })}
                                title={tx(C.resetRow, { name: label })}
                            >
                                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                            </button>
                        </>
                    )}
                </div>
                {row.description && <p id={descriptionId} className="mt-0.5 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{tx(row.description)}</p>}
            </div>
            <div className={wide ? "w-full" : "flex shrink-0 sm:justify-end"}>{control}</div>
        </div>
    );
}

function rowMatches(row: RowDef, query: string, tx: (copy: Copy) => string) {
    const haystack = searchKey([row.label.TR, row.label.EN, tx(row.label), row.description?.TR, row.description?.EN, row.description ? tx(row.description) : "", row.keywords, row.key].filter(Boolean).join(" "));
    return query.split(/\s+/).filter(Boolean).every((part) => haystack.includes(part));
}

// ------------------------------------------------------------------ page
export default function EditorSettingsPage() {
    const { tx } = useI18n();
    const { theme: siteTheme } = useTheme();
    const settings = useEditorSettings();
    const canStore = useSyncExternalStore(subscribeNothing, storageAvailable, () => true);
    const { toasts, push: toast, dismiss } = useToasts();
    const [confirmDialog, confirm] = useConfirm();
    const [query, setQuery] = useState("");
    const [sample, setSample] = useState<SampleId>("javascript");
    const [samples, setSamples] = useState<Record<SampleId, string>>(SAMPLES);
    const [savedVisible, setSavedVisible] = useState(false);
    const savedTimer = useRef<number | undefined>(undefined);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const previewRef = useRef<HTMLElement>(null);

    useEffect(() => () => window.clearTimeout(savedTimer.current), []);

    // Phones show a "back to the preview" button only while the preview is off screen.
    const [previewInView, setPreviewInView] = useState(true);
    useEffect(() => {
        const element = previewRef.current;
        if (!element || typeof IntersectionObserver === "undefined") return;
        const observer = new IntersectionObserver(([entry]) => setPreviewInView(entry.isIntersecting), { threshold: 0.05 });
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    const flashSaved = useCallback(() => {
        setSavedVisible(true);
        window.clearTimeout(savedTimer.current);
        savedTimer.current = window.setTimeout(() => setSavedVisible(false), 1600);
    }, []);

    const patchSettings = useCallback((patch: Partial<EditorSettings>) => {
        updateEditorSettings(patch);
        flashSaved();
    }, [flashSaved]);

    const restore = useCallback((previous: EditorSettings) => {
        saveEditorSettings(previous);
        flashSaved();
    }, [flashSaved]);

    const modifiedCount = ALL_KEYS.filter((key) => settings[key] !== DEFAULT_EDITOR_SETTINGS[key]).length;
    const normalizedQuery = searchKey(query.trim());

    const visibleSections = useMemo(() => SECTIONS.map((section) => ({
        section,
        rows: section.rows.filter((row) => (!row.visible || row.visible(settings)) && (!normalizedQuery || rowMatches(row, normalizedQuery, tx))),
    })).filter((entry) => entry.rows.length > 0), [normalizedQuery, settings, tx]);

    const resetSection = (section: SectionDef) => {
        const previous = settings;
        const keys = SECTION_KEYS[section.id] ?? [];
        patchSettings(Object.fromEntries(keys.map((key) => [key, DEFAULT_EDITOR_SETTINGS[key]])) as Partial<EditorSettings>);
        toast({ tone: "info", message: tx(C.sectionReset, { name: tx(section.title) }), action: { label: tx(C.undo), onClick: () => restore(previous) } });
    };

    const resetAll = async () => {
        const accepted = await confirm({ title: tx(C.resetAllTitle), message: tx(C.resetAllMessage), confirmLabel: tx(C.resetConfirm), destructive: true });
        if (!accepted) return;
        const previous = settings;
        resetEditorSettings();
        flashSaved();
        toast({ tone: "success", message: tx(C.resetDone), action: { label: tx(C.undo), onClick: () => restore(previous) } });
    };

    const exportSettings = () => {
        triggerDownload(new Blob([serializeEditorSettings(settings)], { type: "application/json" }), "hanogt-editor-settings.json");
        toast({ tone: "success", message: tx(C.exported) });
    };

    const copySettings = async () => {
        try {
            await navigator.clipboard.writeText(serializeEditorSettings(settings));
            toast({ tone: "success", message: tx(C.copied) });
        } catch {
            toast({ tone: "error", message: tx(C.copyFailed) });
        }
    };

    const importSettings = async (file: File | undefined) => {
        if (!file) return;
        if (file.size > 64_000) {
            toast({ tone: "error", message: tx(IMPORT_ERRORS.too_large) });
            return;
        }
        let text = "";
        try {
            text = await file.text();
        } catch {
            toast({ tone: "error", message: tx(IMPORT_ERRORS.invalid_json) });
            return;
        }
        const result = parseEditorSettingsFile(text);
        if (!result.ok) {
            toast({ tone: "error", message: tx(IMPORT_ERRORS[result.error]) });
            return;
        }
        const previous = settings;
        restore(result.settings);
        toast({ tone: "success", message: tx(C.imported), action: { label: tx(C.undo), onClick: () => restore(previous) } });
    };

    const previewPath = `inmemory://hanogt-settings/preview.${SAMPLE_EXTENSIONS[sample]}`;

    return (
        <div className="min-h-dvh overflow-x-clip bg-zinc-50 text-zinc-900 transition-colors dark:bg-zinc-950 dark:text-white">
            <Header />

            <main id="main-content" className="mx-auto max-w-7xl px-4 pb-24 pt-24 sm:px-6">
                {/* Hero */}
                <motion.section
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="relative mb-6 overflow-hidden rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900/60 sm:p-8"
                >
                    <div className="pointer-events-none absolute -top-24 end-0 h-64 w-64 rounded-full bg-indigo-500/15 blur-3xl" aria-hidden />
                    <div className="pointer-events-none absolute -bottom-24 start-1/3 h-56 w-56 rounded-full bg-fuchsia-500/10 blur-3xl" aria-hidden />
                    <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                        <div className="min-w-0">
                            <p className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 dark:text-indigo-300">
                                <SquareTerminal className="h-4 w-4" aria-hidden />
                                {tx(C.eyebrow)}
                            </p>
                            <h1 className="flex items-center gap-3 text-3xl font-black tracking-tight sm:text-4xl">
                                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 text-white shadow-lg shadow-indigo-600/25">
                                    <Settings2 className="h-6 w-6" aria-hidden />
                                </span>
                                {tx(C.title)}
                            </h1>
                            <p className="mt-3 max-w-2xl text-zinc-500 dark:text-zinc-400">{tx(C.subtitle)}</p>
                            <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">{tx(C.storedLocally)}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <span aria-live="polite" className={`inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-opacity dark:text-emerald-300 ${savedVisible ? "opacity-100" : "opacity-0"}`}>
                                {savedVisible && <><Check className="h-3.5 w-3.5" aria-hidden />{tx(C.saved)}</>}
                            </span>
                            <span className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                                {modifiedCount ? tx(C.modified, { count: modifiedCount }) : tx(C.allDefault)}
                            </span>
                            <Link href="/editor" className={buttonClasses.primary}>
                                <Code2 className="h-4 w-4" aria-hidden />
                                {tx(C.openEditor)}
                            </Link>
                        </div>
                    </div>
                    {!canStore && (
                        <p className="relative mt-5 flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200" role="status">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                            {tx(C.storageBlocked)}
                        </p>
                    )}
                </motion.section>

                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
                    {/* Live preview: first on phones, a sticky column on large screens. */}
                    <aside ref={previewRef} id="preview" className="scroll-mt-24 lg:order-2" aria-labelledby="preview-title">
                        <div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-900/60 sm:p-5 lg:sticky lg:top-24">
                            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <h2 id="preview-title" className="flex items-center gap-2 text-base font-bold"><Eye className="h-4 w-4 text-indigo-500" aria-hidden />{tx(C.preview)}</h2>
                                    <p className="mt-0.5 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{tx(C.previewHint)}</p>
                                </div>
                                <button type="button" onClick={() => setSamples((current) => ({ ...current, [sample]: SAMPLES[sample] }))} disabled={samples[sample] === SAMPLES[sample]} className={`${buttonClasses.ghost} px-2 py-1 text-xs`}>
                                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                                    {tx(C.resetSample)}
                                </button>
                            </div>
                            <div role="tablist" aria-label={tx(C.previewLanguage)} className="mb-3 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:thin]">
                                {SAMPLE_IDS.map((id) => (
                                    <button
                                        key={id}
                                        type="button"
                                        role="tab"
                                        aria-selected={sample === id}
                                        onClick={() => setSample(id)}
                                        className={`flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${sample === id ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"}`}
                                    >
                                        <LanguageIcon language={id} size={14} />
                                        {SAMPLE_NAMES[id]}
                                    </button>
                                ))}
                            </div>
                            <div className="h-80 sm:h-96 lg:h-[min(36rem,calc(100dvh-17rem))]">
                                <CodeEditor
                                    language={sample}
                                    path={previewPath}
                                    value={samples[sample]}
                                    onChange={(value) => setSamples((current) => ({ ...current, [sample]: value ?? "" }))}
                                    ariaLabel={tx(C.previewEditor)}
                                />
                            </div>
                        </div>
                    </aside>

                    <div className="min-w-0 lg:order-1">
                        {/* Search and section links */}
                        <div className="mb-4 space-y-3">
                            <div className="relative">
                                <Search className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
                                <input
                                    type="search"
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Escape") setQuery("");
                                    }}
                                    placeholder={tx(C.search)}
                                    aria-label={tx(C.searchLabel)}
                                    className="w-full rounded-2xl border border-zinc-200 bg-white py-3 pe-11 ps-11 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-zinc-900"
                                />
                                {query && (
                                    <button type="button" onClick={() => setQuery("")} className="absolute end-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200" aria-label={tx(C.clearSearch)}>
                                        <X className="h-4 w-4" aria-hidden />
                                    </button>
                                )}
                            </div>
                            {!normalizedQuery && (
                                <nav aria-label={tx(C.sections)} className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
                                    {SECTIONS.map((section) => {
                                        const Icon = section.icon;
                                        return (
                                            <a key={section.id} href={`#${section.id}`} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 transition hover:border-indigo-400/60 hover:text-indigo-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:text-indigo-200">
                                                <Icon className="h-3.5 w-3.5" aria-hidden />
                                                {tx(section.title)}
                                            </a>
                                        );
                                    })}
                                    <a href="#backup" className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 transition hover:border-indigo-400/60 hover:text-indigo-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:text-indigo-200">
                                        <Download className="h-3.5 w-3.5" aria-hidden />
                                        {tx(C.backupTitle)}
                                    </a>
                                </nav>
                            )}
                        </div>

                        <div className="space-y-5">
                            {visibleSections.length === 0 && (
                                <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-900/60">
                                    <Search className="mb-3 h-8 w-8 text-zinc-300 dark:text-zinc-600" aria-hidden />
                                    <p className="text-sm text-zinc-500 dark:text-zinc-400">{tx(C.noResults, { query: query.trim() })}</p>
                                    <button type="button" onClick={() => setQuery("")} className={`${buttonClasses.secondary} mt-4`}>{tx(C.clearSearch)}</button>
                                </div>
                            )}
                            {visibleSections.map(({ section, rows }, index) => {
                                const Icon = section.icon;
                                const sectionModified = (SECTION_KEYS[section.id] ?? []).some((key) => settings[key] !== DEFAULT_EDITOR_SETTINGS[key]);
                                return (
                                    <motion.section
                                        key={section.id}
                                        id={section.id}
                                        initial={{ opacity: 0, y: 12 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.35, delay: Math.min(index, 5) * 0.04, ease: "easeOut" }}
                                        className="scroll-mt-24 rounded-3xl border border-zinc-200 bg-white px-5 pt-5 shadow-sm dark:border-white/10 dark:bg-zinc-900/60 sm:px-6"
                                        aria-labelledby={`${section.id}-title`}
                                    >
                                        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 pb-4 dark:border-white/5">
                                            <div className="flex min-w-0 items-start gap-3">
                                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"><Icon className="h-5 w-5" aria-hidden /></span>
                                                <div className="min-w-0">
                                                    <h2 id={`${section.id}-title`} className="text-lg font-bold">{tx(section.title)}</h2>
                                                    <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">{tx(section.description)}</p>
                                                </div>
                                            </div>
                                            {sectionModified && (
                                                <button type="button" onClick={() => resetSection(section)} className={`${buttonClasses.ghost} px-2.5 py-1.5 text-xs`}>
                                                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                                                    {tx(C.resetSection)}
                                                </button>
                                            )}
                                        </header>
                                        <div className="divide-y divide-zinc-100 dark:divide-white/5">
                                            {rows.map((row) => <SettingRow key={row.key} row={row} settings={settings} onPatch={patchSettings} siteTheme={siteTheme} />)}
                                        </div>
                                    </motion.section>
                                );
                            })}

                            {!normalizedQuery && (
                                <section id="backup" className="scroll-mt-24 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-900/60 sm:p-6" aria-labelledby="backup-title">
                                    <div className="flex items-start gap-3">
                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-300"><Download className="h-5 w-5" aria-hidden /></span>
                                        <div className="min-w-0">
                                            <h2 id="backup-title" className="text-lg font-bold">{tx(C.backupTitle)}</h2>
                                            <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">{tx(C.backupDescription)}</p>
                                        </div>
                                    </div>
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        <button type="button" onClick={exportSettings} className={buttonClasses.secondary}>
                                            <Download className="h-4 w-4" aria-hidden />
                                            {tx(C.export)}
                                        </button>
                                        <button type="button" onClick={() => fileInputRef.current?.click()} className={buttonClasses.secondary} aria-describedby="import-hint">
                                            <Upload className="h-4 w-4" aria-hidden />
                                            {tx(C.import)}
                                        </button>
                                        <button type="button" onClick={() => void copySettings()} className={buttonClasses.secondary}>
                                            <ClipboardCopy className="h-4 w-4" aria-hidden />
                                            {tx(C.copyJson)}
                                        </button>
                                        <button type="button" onClick={() => void resetAll()} className={`${buttonClasses.ghost} text-red-600 hover:bg-red-500/10 hover:text-red-700 sm:ms-auto dark:text-red-400 dark:hover:text-red-300`}>
                                            <RotateCcw className="h-4 w-4" aria-hidden />
                                            {tx(C.resetAll)}
                                        </button>
                                    </div>
                                    <p id="import-hint" className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">{tx(C.importHint)}</p>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="application/json,.json"
                                        className="hidden"
                                        tabIndex={-1}
                                        aria-hidden
                                        onChange={(event) => {
                                            const file = event.target.files?.[0];
                                            event.target.value = "";
                                            void importSettings(file);
                                        }}
                                    />
                                </section>
                            )}
                        </div>
                    </div>
                </div>
            </main>

            <SiteFooter />

            {/* Phones: the preview sits at the top, so offer a quick way back to it. */}
            {!previewInView && (
                <button
                    type="button"
                    onClick={() => previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    className="fixed bottom-5 end-5 z-40 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xl shadow-indigo-600/30 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 lg:hidden"
                >
                    <Eye className="h-4 w-4" aria-hidden />
                    {tx(C.jumpToPreview)}
                </button>
            )}

            {confirmDialog}
            <ToastViewport toasts={toasts} onDismiss={dismiss} />
        </div>
    );
}
