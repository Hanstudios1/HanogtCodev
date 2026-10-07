"use client";

import { motion } from "framer-motion";
import {
    AlertTriangle, Check, ClipboardCopy, Cloud, CloudOff, Code2, Download, Eye, Keyboard, LoaderCircle, MousePointer2, Palette, Plus, RotateCcw, Save, Search,
    Settings2, Sparkles, SquareTerminal, Terminal, Trash2, Type, Undo2, Upload, X, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useEffectEvent, useId, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import CodeEditor from "@/components/Editor/CodeEditor";
import LanguageIcon from "@/components/Editor/LanguageIcon";
import { buttonClasses, useConfirm } from "@/components/Editor/Modal";
import { ToastViewport, useToasts } from "@/components/Editor/Toasts";
import { triggerDownload } from "@/components/Editor/editor-files";
import { searchKey } from "@/components/Editor/search";
import Header from "@/components/Header";
import { useRawSession } from "@/components/Provider";
import SiteFooter from "@/components/SiteFooter";
import {
    DEFAULT_EDITOR_SETTINGS, EDITOR_FONTS, EDITOR_THEMES, LANGUAGE_TAB_SIZES_MAX, SETTING_LIMITS, changedEditorSettingKeys, compareEditorSettingsCopies, editorSettingsEqual,
    hasStoredEditorSettings, parseEditorSettingsFile, readEditorSettings, readEditorSettingsUpdatedAt, resolveEditorTheme, saveEditorSettings,
    serializeEditorSettings, useEditorSettings, useEditorSettingsUpdatedAt, type AccountEditorSettings, type EditorSettings,
    type EditorSettingsSyncState, type SettingsImportError,
} from "@/lib/editor-settings";
import { openLocalHistory } from "@/lib/editor/local-history";
import { useI18n, type Copy } from "@/lib/i18n";
import { LANGUAGES as CODE_LANGUAGES, languageDisplayName } from "@/lib/runtimes/languages";
import { useTheme } from "@/lib/theme";

// ------------------------------------------------------------------ setting definitions
type KeysOf<V> = { [K in keyof EditorSettings]-?: EditorSettings[K] extends V ? K : never }[keyof EditorSettings];
type SettingKey = Exclude<keyof EditorSettings, "version">;
type BoolKey = KeysOf<boolean>;
type NumberKey = Exclude<KeysOf<number>, "version">;
type ChoiceKey = Exclude<KeysOf<string>, "theme" | "fontFamily"> | NumberKey;

/** Languages that run or preview, the popular ones first (new workspaces, per-language tab sizes). */
const EDITOR_LANGUAGES = CODE_LANGUAGES.filter((language) => language.engine !== "none" && language.id !== "plaintext")
    .slice()
    .sort((a, b) => Number(Boolean(b.popular)) - Number(Boolean(a.popular)) || a.name.localeCompare(b.name));

type Choice = { value: string | number; label: Copy };

/** A button under a row's description for something that isn't a setting (e.g. clearing data). */
type RowAction = "clearLocalHistory";

type RowBase = {
    label: Copy;
    description?: Copy;
    /** Extra search words (both languages). */
    keywords?: string;
    /** Hidden while false (e.g. the wrap column when wrapping is off). */
    visible?: (settings: EditorSettings) => boolean;
    action?: RowAction;
};

type RowDef = RowBase & (
    | { kind: "toggle"; key: BoolKey }
    | { kind: "binary"; key: BoolKey; on: Copy; off: Copy }
    | { kind: "segmented" | "select"; key: ChoiceKey; options: readonly Choice[] }
    | { kind: "slider"; key: NumberKey; min: number; max: number; step: number; unit: Copy; scale?: number; zero?: Copy }
    | { kind: "theme"; key: "theme" }
    | { kind: "font"; key: "fontFamily" }
    | { kind: "languageTabs"; key: "languageTabSizes" }
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
            { kind: "toggle", key: "minimap", label: { TR: "Mini harita", EN: "Minimap" }, description: { TR: "Kenarda kodun küçük bir özetini gösterir.", EN: "Shows a small overview of the code at the edge." } },
            {
                kind: "segmented", key: "minimapSide",
                label: { TR: "Mini haritanın yeri", EN: "Minimap side" },
                keywords: "minimap side left right sol sağ",
                visible: (settings) => settings.minimap,
                options: [
                    { value: "right", label: { TR: "Sağda", EN: "Right" } },
                    { value: "left", label: { TR: "Solda", EN: "Left" } },
                ],
            },
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
            { kind: "toggle", key: "unicodeHighlight", label: { TR: "Görünmez ve benzer karakterleri vurgula", EN: "Highlight invisible and look-alike characters" }, description: { TR: "Sıfır genişlikli boşlukları ve Latin harflerine benzeyen karakterleri (ör. Kiril \"а\") çerçeveler; kopyalanan koddaki gizli hataları yakalar.", EN: "Boxes zero-width spaces and characters that look like Latin letters (e.g. Cyrillic \"а\"); catches hidden mistakes in copied code." }, keywords: "unicode invisible görünmez homoglyph" },
            { kind: "toggle", key: "renderControlCharacters", label: { TR: "Kontrol karakterlerini göster", EN: "Show control characters" }, description: { TR: "Metindeki görünmeyen kontrol karakterlerini simgeyle çizer.", EN: "Draws invisible control characters in the text as symbols." }, keywords: "control character kontrol karakter" },
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
            {
                kind: "select", key: "fontWeight",
                label: { TR: "Yazı kalınlığı", EN: "Font weight" },
                keywords: "weight kalınlık bold",
                options: [
                    { value: "300", label: { TR: "İnce", EN: "Light" } },
                    { value: "400", label: { TR: "Normal", EN: "Normal" } },
                    { value: "500", label: { TR: "Orta", EN: "Medium" } },
                    { value: "600", label: { TR: "Yarı kalın", EN: "Semibold" } },
                    { value: "700", label: { TR: "Kalın", EN: "Bold" } },
                ],
            },
            { kind: "slider", key: "letterSpacing", label: { TR: "Harf aralığı", EN: "Letter spacing" }, min: SETTING_LIMITS.letterSpacing.min, max: SETTING_LIMITS.letterSpacing.max, step: 0.1, unit: { TR: "{value} px", EN: "{value} px" }, keywords: "letter spacing harf aralık" },
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
            {
                kind: "segmented", key: "multiCursorModifier",
                label: { TR: "Çoklu imleç tuşu", EN: "Multi-cursor key" },
                description: { TR: "Fareyle yeni imleç eklerken basılı tutulan tuş. Diğer tuş bağlantıyı ve tanımı açar.", EN: "The key you hold to add a cursor with the mouse. The other one opens links and definitions." },
                keywords: "multi cursor çoklu imleç alt ctrl cmd",
                options: [
                    { value: "alt", label: { TR: "Alt", EN: "Alt" } },
                    { value: "ctrlCmd", label: { TR: "Ctrl / Cmd", EN: "Ctrl / Cmd" } },
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
            { kind: "languageTabs", key: "languageTabSizes", label: { TR: "Dile göre sekme boyutu", EN: "Tab size per language" }, description: { TR: "Seçtiğin dillerde yukarıdaki boyutun yerine bu kullanılır (ör. Python 4, JavaScript 2).", EN: "Used instead of the size above for the languages you pick (e.g. Python 4, JavaScript 2)." }, keywords: "tab indent per language dil sekme girinti" },
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
            {
                kind: "select", key: "defaultLanguage",
                label: { TR: "Yeni çalışma alanının dili", EN: "Language of a new workspace" },
                description: { TR: "Editör boş açıldığında ilk dosya bu dilde başlar.", EN: "When the editor opens empty, the first file starts in this language." },
                keywords: "default language varsayılan dil new project yeni proje",
                options: EDITOR_LANGUAGES.map((language) => ({ value: language.id, label: { TR: language.name, EN: language.name } })),
            },
            { kind: "toggle", key: "linkedEditing", label: { TR: "Bağlantılı düzenleme", EN: "Linked editing" }, description: { TR: "HTML'de açılış etiketini değiştirince kapanış etiketi de değişir.", EN: "In HTML, renaming an opening tag also renames the closing tag." }, keywords: "html tag etiket" },
            { kind: "toggle", key: "emmet", label: { TR: "Emmet kısaltmaları", EN: "Emmet abbreviations" }, description: { TR: "HTML, CSS, SCSS, Less, JSX ve TSX dosyalarında ul>li*3 veya m10 gibi kısaltmaların açılımını öneri listesinde gösterir; Tab ya da Enter ile eklenir.", EN: "In HTML, CSS, SCSS, Less, JSX and TSX files, shows the expansion of abbreviations such as ul>li*3 or m10 in the suggestion list; Tab or Enter inserts it." }, keywords: "emmet abbreviation kısaltma html css scss less jsx tsx snippet" },
        ],
    },
    {
        id: "keyboard",
        icon: Keyboard,
        title: { TR: "Klavye", EN: "Keyboard" },
        description: { TR: "Editörün tuş düzeni.", EN: "How the editor responds to the keyboard." },
        rows: [
            {
                kind: "segmented", key: "keybindingMode",
                label: { TR: "Tuş düzeni", EN: "Keybindings" },
                description: { TR: "Vim: normal, ekleme ve görsel kipler ile : komutları (:w kaydeder). Geçerli kip editörün durum çubuğunda görünür; Hızlı işlemler (Ctrl/⌘+K) ve diğer Hanogt kısayolları çalışmaya devam eder.", EN: "Vim: normal, insert and visual modes and : commands (:w saves). The current mode shows in the editor's status bar; Quick actions (Ctrl/⌘+K) and the other Hanogt shortcuts keep working." },
                keywords: "vim keybindings keymap modal tuş düzeni kısayol klavye normal insert visual",
                options: [
                    { value: "default", label: { TR: "Varsayılan", EN: "Default" } },
                    { value: "vim", label: { TR: "Vim", EN: "Vim" } },
                ],
            },
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
            {
                kind: "segmented", key: "acceptSuggestionOnEnter",
                label: { TR: "Enter ile öneriyi kabul et", EN: "Accept a suggestion with Enter" },
                description: { TR: "\"Akıllı\": yalnızca öneri metni değiştirdiğinde; aksi hâlde Enter yeni satır açar. Tab her zaman kabul eder.", EN: "\"Smart\": only when the suggestion changes the text; otherwise Enter starts a new line. Tab always accepts." },
                keywords: "enter accept suggestion kabul öneri tab",
                options: [
                    { value: "on", label: { TR: "Açık", EN: "On" } },
                    { value: "smart", label: { TR: "Akıllı", EN: "Smart" } },
                    { value: "off", label: { TR: "Kapalı", EN: "Off" } },
                ],
            },
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
            { kind: "toggle", key: "formatOnSave", label: { TR: "Kaydederken biçimlendir", EN: "Format on save" }, description: { TR: "Kendin kaydettiğinde dosyayı önce dilin biçimlendiricisiyle düzenler (JavaScript, TypeScript, JSON, HTML, CSS).", EN: "When you save, formats the file first with the language's formatter (JavaScript, TypeScript, JSON, HTML, CSS)." }, keywords: "format save biçim kaydet prettier" },
            { kind: "toggle", key: "runOnSave", label: { TR: "Kaydedince çalıştır", EN: "Run on save" }, description: { TR: "Kendin kaydettiğinde projeyi hemen çalıştırır.", EN: "Runs the project right after you save." }, keywords: "run save çalıştır kaydet" },
            { kind: "toggle", key: "confirmCloseUnsaved", label: { TR: "Kaydedilmemiş sekmeyi kapatırken sor", EN: "Ask before closing an unsaved tab" }, keywords: "close tab unsaved kapat sekme kaydedilmemiş" },
            { kind: "toggle", key: "trimTrailingWhitespace", label: { TR: "Satır sonu boşluklarını sil", EN: "Trim trailing whitespace" }, description: { TR: "Kaydederken satırların sonundaki boşlukları kaldırır.", EN: "Removes spaces at the end of lines when saving." }, keywords: "trim whitespace boşluk" },
            { kind: "toggle", key: "insertFinalNewline", label: { TR: "Sona boş satır ekle", EN: "Insert a final newline" }, description: { TR: "Kaydederken dosyanın bir satır sonuyla bitmesini sağlar.", EN: "Makes sure the file ends with a line break when saving." }, keywords: "newline satır" },
            {
                kind: "toggle", key: "localHistory", action: "clearLocalHistory",
                label: { TR: "Yerel geçmiş", EN: "Local history" },
                description: { TR: "Dosyalarınızın anlık görüntülerini yalnızca bu tarayıcıda saklar (dosya başına en fazla 30): kaydettiğinizde, çalıştırdığınızda ve düzenlerken 3 dakikada bir. Editördeki Geçmiş panelinden karşılaştırıp geri yükleyebilirsiniz.", EN: "Keeps snapshots of your files in this browser only (up to 30 per file): when you save, when you run and every 3 minutes while you edit. Compare and restore them from the History panel in the editor." },
                keywords: "local history snapshot timeline restore version yerel geçmiş anlık görüntü sürüm geri yükle",
            },
        ],
    },
    {
        id: "console",
        icon: Terminal,
        title: { TR: "Konsol", EN: "Console" },
        description: { TR: "Programların çıktısının görünümü.", EN: "How your programs' output looks." },
        rows: [
            { kind: "slider", key: "consoleFontSize", label: { TR: "Konsol yazı boyutu", EN: "Console font size" }, min: SETTING_LIMITS.consoleFontSize.min, max: SETTING_LIMITS.consoleFontSize.max, step: 0.5, unit: { TR: "{value} px", EN: "{value} px" }, keywords: "console konsol output çıktı size boyut" },
            { kind: "toggle", key: "consoleWordWrap", label: { TR: "Uzun satırları kaydır", EN: "Wrap long lines" }, description: { TR: "Kapalıyken uzun çıktı satırları yatay kaydırılır.", EN: "When off, long output lines scroll sideways." }, keywords: "console wrap konsol kaydır" },
        ],
    },
];

const SECTION_KEYS: Record<string, SettingKey[]> = Object.fromEntries(SECTIONS.map((section) => [section.id, section.rows.map((row) => row.key)]));
const ALL_KEYS = Object.keys(DEFAULT_EDITOR_SETTINGS).filter((key): key is SettingKey => key !== "version");

const C = {
    languageTabSize: { TR: "{language} sekme boyutu", EN: "{language} tab size" },
    removeLanguageTabSize: { TR: "{language} için ayrı sekme boyutunu kaldır", EN: "Remove the separate tab size for {language}" },
    addLanguageTabSize: { TR: "Dil seç…", EN: "Choose a language…" },
    add: { TR: "Ekle", EN: "Add" },
    eyebrow: { TR: "Kod editörü", EN: "Code editor" },
    title: { TR: "Editör ayarları", EN: "Editor settings" },
    subtitle: { TR: "Kod editörünü kendinize göre ayarlayın. Değişiklikleri önizlemede deneyin, beğendiğinizde Kaydet'e basın; kayıtlı ayarlar açık olan tüm editörlere uygulanır.", EN: "Make the code editor your own. Try changes in the preview and press Save when you like them; saved settings apply to every open editor." },
    storageBlocked: { TR: "Tarayıcı depolaması kullanılamıyor (ör. gizli pencere). Ayarlar yalnızca bu sayfa açıkken geçerli olur.", EN: "Browser storage is unavailable (e.g. a private window). Settings only apply while this page is open." },
    openEditor: { TR: "Editörü aç", EN: "Open the editor" },
    search: { TR: "Ayarlarda ara…", EN: "Search settings…" },
    searchLabel: { TR: "Ayarlarda ara", EN: "Search settings" },
    clearSearch: { TR: "Aramayı temizle", EN: "Clear search" },
    noResults: { TR: "\"{query}\" ile eşleşen ayar yok.", EN: "No setting matches \"{query}\"." },
    sections: { TR: "Bölümler", EN: "Sections" },
    modified: { TR: "{count} ayar varsayılandan farklı", EN: "{count} settings differ from the defaults" },
    allDefault: { TR: "Tüm ayarlar varsayılan değerlerinde", EN: "All settings are at their defaults" },
    modifiedDot: { TR: "Varsayılandan farklı", EN: "Changed from the default" },
    resetRow: { TR: "Varsayılana döndür: {name}", EN: "Reset to default: {name}" },
    resetSection: { TR: "Bölümü sıfırla", EN: "Reset section" },
    sectionReset: { TR: "{name} ayarları varsayılana döndü (henüz kaydedilmedi).", EN: "{name} settings were reset to their defaults (not saved yet)." },
    undo: { TR: "Geri al", EN: "Undo" },
    preview: { TR: "Canlı önizleme", EN: "Live preview" },
    previewHint: { TR: "Önizleme kaydedilmemiş değişikliklerinizi de gösterir; burada yazmayı deneyebilirsiniz. Önizlemedeki kod kaydedilmez.", EN: "The preview also shows your unsaved changes and you can type here to try them. Code in the preview isn't saved." },
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
    imported: { TR: "Ayarlar içe aktarıldı. Saklamak için Kaydet'e basın.", EN: "The settings were imported. Press Save to keep them." },
    importHint: { TR: "Hanogt'tan dışa aktarılan ayar dosyaları ve hesap veri dışa aktarımları kabul edilir.", EN: "Accepts settings files exported from Hanogt and account data exports." },
    resetAll: { TR: "Tümünü varsayılana döndür", EN: "Reset everything" },
    resetAllTitle: { TR: "Tüm editör ayarları sıfırlansın mı?", EN: "Reset all editor settings?" },
    resetAllMessage: { TR: "Tema, yazı tipi ve diğer tüm editör tercihleri varsayılan değerlerine döner. Kaydet'e basana kadar kayıtlı ayarlarınız değişmez.", EN: "The theme, font and every other editor preference go back to their default values. Your saved settings don't change until you press Save." },
    resetConfirm: { TR: "Sıfırla", EN: "Reset" },
    resetDone: { TR: "Varsayılan değerler yüklendi. Uygulamak için Kaydet'e basın.", EN: "The default values were loaded. Press Save to apply them." },
    sliderValue: { TR: "{label}: {value}", EN: "{label}: {value}" },
    toolbar: { TR: "Kaydetme ve yedekleme", EN: "Saving and backup" },
    unsaved: { TR: "Kaydedilmemiş değişiklikler", EN: "Unsaved changes" },
    unsavedCount: { TR: "{count} ayar değişti", EN: "{count} settings changed" },
    allSaved: { TR: "Tüm değişiklikler kaydedildi", EN: "All changes are saved" },
    save: { TR: "Kaydet", EN: "Save" },
    saveHint: { TR: "Kaydet (Ctrl/⌘+S)", EN: "Save (Ctrl/⌘+S)" },
    discard: { TR: "Vazgeç", EN: "Discard" },
    discardHint: { TR: "Kaydedilmemiş değişiklikleri geri al", EN: "Undo the unsaved changes" },
    savedToast: { TR: "Editör ayarları kaydedildi.", EN: "The editor settings were saved." },
    savedAccountToast: { TR: "Editör ayarları kaydedildi ve hesabınıza eşitlendi.", EN: "The editor settings were saved and synced to your account." },
    accountSaveFailed: { TR: "Ayarlar bu cihaza kaydedildi ancak hesabınıza kaydedilemedi.", EN: "The settings were saved on this device but couldn't be saved to your account." },
    discarded: { TR: "Kaydedilmemiş değişiklikler geri alındı.", EN: "The unsaved changes were discarded." },
    nothingToSave: { TR: "Kaydedilecek değişiklik yok.", EN: "There's nothing to save." },
    syncedAccount: { TR: "Hesabınıza kaydedildi", EN: "Saved to your account" },
    localOnly: { TR: "Yalnızca bu cihazda", EN: "Only on this device" },
    localOnlyHint: { TR: "Bu cihazdaki ayarlar hesabınızda yok.", EN: "Your account doesn't have this device's settings." },
    signedOutHint: { TR: "Giriş yaparsanız ayarlarınız hesabınıza da kaydedilir ve diğer cihazlarınızda kullanılabilir.", EN: "Sign in to also save your settings to your account and use them on your other devices." },
    signIn: { TR: "Giriş yap", EN: "Sign in" },
    syncChecking: { TR: "Hesabınız denetleniyor…", EN: "Checking your account…" },
    syncSaving: { TR: "Hesabınıza kaydediliyor…", EN: "Saving to your account…" },
    syncFailed: { TR: "Hesap eşitlemesi şu anda kullanılamıyor; ayarlar bu cihazda saklanır.", EN: "Account sync is unavailable right now; your settings are kept on this device." },
    retry: { TR: "Tekrar dene", EN: "Try again" },
    uploadToAccount: { TR: "Hesaba kaydet", EN: "Save to account" },
    uploadDone: { TR: "Bu cihazdaki ayarlar hesabınıza kaydedildi.", EN: "This device's settings were saved to your account." },
    lastSaved: { TR: "Son kayıt: {time}", EN: "Last saved: {time}" },
    accountNewerTitle: { TR: "Hesabınızda daha yeni editör ayarları var", EN: "Your account has newer editor settings" },
    accountNewerText: { TR: "{time} tarihinde kaydedilen ayarlar bu cihazdakilerden farklı.", EN: "The settings saved on {time} differ from the ones on this device." },
    conflictTitle: { TR: "Hesabınızdaki editör ayarları bu cihazdakilerden farklı", EN: "Your account's editor settings differ from this device's" },
    conflictText: { TR: "Hangilerini kullanmak istediğinizi seçin.", EN: "Choose which ones to use." },
    loadAccount: { TR: "Hesabınızdaki ayarları yükle", EN: "Load your account's settings" },
    keepLocal: { TR: "Bu cihazdakileri hesaba kaydet", EN: "Save this device's to the account" },
    notNow: { TR: "Şimdilik değil", EN: "Not now" },
    accountLoaded: { TR: "Hesabınızdaki editör ayarları yüklendi.", EN: "Your account's editor settings were loaded." },
    adopted: { TR: "Hesabınızdaki editör ayarları bu cihaza uygulandı.", EN: "Your account's editor settings were applied on this device." },
    loseChangesTitle: { TR: "Kaydedilmemiş değişiklikler kaybolsun mu?", EN: "Discard the unsaved changes?" },
    loseChangesMessage: { TR: "Hesabınızdaki ayarlar yüklenince bu sayfadaki kaydedilmemiş değişiklikler kaybolur.", EN: "Loading your account's settings discards the unsaved changes on this page." },
    loadConfirm: { TR: "Yükle", EN: "Load" },
    clearLocalHistory: { TR: "Yerel geçmişi temizle", EN: "Clear local history" },
    clearLocalHistoryTitle: { TR: "Yerel geçmiş silinsin mi?", EN: "Clear local history?" },
    clearLocalHistoryMessage: { TR: "Bu tarayıcıdaki tüm anlık görüntüler silinecek. Dosyalarınız ve projeleriniz değişmez.", EN: "Every snapshot in this browser will be deleted. Your files and projects don't change." },
    clearLocalHistoryConfirm: { TR: "Sil", EN: "Delete" },
    localHistoryCleared: { TR: "Yerel geçmiş temizlendi.", EN: "Local history was cleared." },
    localHistoryUnavailable: { TR: "Bu tarayıcıda yerel geçmiş kullanılamıyor.", EN: "Local history isn't available in this browser." },
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
/** Tab sizes for chosen languages: chips to change or remove, and a row to add one. */
function LanguageTabSizes({ value, fallback, onChange, labelledBy }: { value: Record<string, number>; fallback: number; onChange: (next: Record<string, number>) => void; labelledBy: string }) {
    const { tx } = useI18n();
    const [adding, setAdding] = useState("");
    const sizes = Array.from({ length: SETTING_LIMITS.tabSize.max - SETTING_LIMITS.tabSize.min + 1 }, (_, index) => SETTING_LIMITS.tabSize.min + index);
    const entries = Object.entries(value);
    const full = entries.length >= LANGUAGE_TAB_SIZES_MAX;
    const set = (id: string, size: number) => onChange({ ...value, [id]: size });
    const remove = (id: string) => onChange(Object.fromEntries(entries.filter(([key]) => key !== id)));
    const field = "rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-800 outline-none transition focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100";
    return (
        <div className="space-y-2" role="group" aria-labelledby={labelledBy} data-setting="languageTabSizes">
            {entries.length ? (
                <ul className="flex flex-wrap gap-2">
                    {entries.map(([id, size]) => (
                        <li key={id} className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 py-1 pe-1 ps-2 text-sm dark:border-white/10 dark:bg-white/[0.03]">
                            <LanguageIcon language={id} size={16} />
                            <span className="font-medium">{languageDisplayName(id)}</span>
                            <select value={size} onChange={(event) => set(id, Number(event.target.value))} className={field} aria-label={tx(C.languageTabSize, { language: languageDisplayName(id) })}>
                                {sizes.map((option) => <option key={option} value={option}>{option}</option>)}
                            </select>
                            <button type="button" onClick={() => remove(id)} className="rounded-lg p-1 text-zinc-400 transition hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200" aria-label={tx(C.removeLanguageTabSize, { language: languageDisplayName(id) })}>
                                <X className="h-3.5 w-3.5" aria-hidden />
                            </button>
                        </li>
                    ))}
                </ul>
            ) : null}
            {!full ? (
                <div className="flex flex-wrap items-center gap-2">
                    <select value={adding} onChange={(event) => setAdding(event.target.value)} className={field} aria-label={tx(C.addLanguageTabSize)}>
                        <option value="">{tx(C.addLanguageTabSize)}</option>
                        {EDITOR_LANGUAGES.filter((language) => !(language.id in value)).map((language) => <option key={language.id} value={language.id}>{language.name}</option>)}
                    </select>
                    <button type="button" disabled={!adding} onClick={() => { set(adding, fallback); setAdding(""); }} className={`${buttonClasses.secondary} px-3 py-1.5`}>
                        <Plus className="h-4 w-4" aria-hidden />{tx(C.add)}
                    </button>
                </div>
            ) : null}
        </div>
    );
}

function SettingRow({ row, settings, onPatch, siteTheme, onAction }: { row: RowDef; settings: EditorSettings; onPatch: (patch: Partial<EditorSettings>) => void; siteTheme: "light" | "dark"; onAction?: (action: RowAction) => void }) {
    const { tx, locale } = useI18n();
    const baseId = useId();
    const labelId = `${baseId}-label`;
    const descriptionId = row.description ? `${baseId}-description` : undefined;
    const controlId = `${baseId}-control`;
    const label = tx(row.label);
    const value = settings[row.key];
    const modified = typeof value === "object" ? JSON.stringify(value) !== JSON.stringify(DEFAULT_EDITOR_SETTINGS[row.key]) : value !== DEFAULT_EDITOR_SETTINGS[row.key];
    const wide = row.kind === "theme" || row.kind === "font" || row.kind === "languageTabs";
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
        case "languageTabs":
            control = <LanguageTabSizes value={settings.languageTabSizes} fallback={settings.tabSize} onChange={(next) => patch(next)} labelledBy={labelId} />;
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
                {row.action === "clearLocalHistory" && onAction && (
                    <button type="button" onClick={() => onAction(row.action!)} className="-ms-2 mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:text-red-400" data-clear-local-history>
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        {tx(C.clearLocalHistory)}
                    </button>
                )}
            </div>
            <div className={wide ? "w-full" : "flex shrink-0 sm:justify-end"}>{control}</div>
        </div>
    );
}

function rowMatches(row: RowDef, query: string, tx: (copy: Copy) => string) {
    const haystack = searchKey([row.label.TR, row.label.EN, tx(row.label), row.description?.TR, row.description?.EN, row.description ? tx(row.description) : "", row.keywords, row.key].filter(Boolean).join(" "));
    return query.split(/\s+/).filter(Boolean).every((part) => haystack.includes(part));
}

// ------------------------------------------------------------------ account sync
type AccountState = { key: string; copy: AccountEditorSettings | null; failed: boolean };

async function requestAccountSettings(init: RequestInit = {}): Promise<AccountEditorSettings> {
    const response = await fetch("/api/account/preferences", { cache: "no-store", credentials: "same-origin", ...init });
    const data = await response.json().catch(() => null) as AccountEditorSettings | null;
    if (!response.ok || !data || typeof data !== "object" || !("editorSettings" in data)) throw new Error(`HTTP ${response.status}`);
    return data;
}

function formatTime(iso: string | null | undefined, locale: string) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    try {
        return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
    } catch {
        return date.toISOString();
    }
}

const linkButton = "rounded-md font-semibold text-indigo-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 dark:text-indigo-300";

/** Where the saved settings live: this device only, or also the account. */
function SyncLine({ signedIn, checking, saving, failed, state, savedAt, onUpload, onRetry }: {
    signedIn: boolean;
    checking: boolean;
    saving: boolean;
    failed: boolean;
    state: EditorSettingsSyncState | null;
    savedAt: string | null;
    onUpload: () => void;
    onRetry: () => void;
}) {
    const { tx, locale } = useI18n();
    const time = formatTime(savedAt, locale);
    const busy = signedIn && (saving || checking);
    const synced = signedIn && state === "in_sync";
    const Icon = busy ? LoaderCircle : synced ? Cloud : CloudOff;
    const label = !signedIn ? tx(C.localOnly) : saving ? tx(C.syncSaving) : checking ? tx(C.syncChecking) : synced ? tx(C.syncedAccount) : tx(C.localOnly);
    const offerUpload = signedIn && !busy && !failed && (state === "local_newer" || (state === "account_empty" && Boolean(savedAt)));
    return (
        <div className="relative mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-zinc-500 dark:text-zinc-400" aria-live="polite">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold ${synced ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300"}`}>
                <Icon className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} aria-hidden />
                {label}
            </span>
            {time && <span>{tx(C.lastSaved, { time })}</span>}
            {!signedIn && (
                <>
                    <span>{tx(C.signedOutHint)}</span>
                    <Link href="/login?callbackUrl=%2Fsettings" className={linkButton}>{tx(C.signIn)}</Link>
                </>
            )}
            {signedIn && !busy && failed && (
                <>
                    <span>{tx(C.syncFailed)}</span>
                    <button type="button" onClick={onRetry} className={linkButton}>{tx(C.retry)}</button>
                </>
            )}
            {offerUpload && (
                <>
                    <span>{tx(C.localOnlyHint)}</span>
                    <button type="button" onClick={onUpload} className={linkButton}>{tx(C.uploadToAccount)}</button>
                </>
            )}
        </div>
    );
}

// ------------------------------------------------------------------ page
export default function EditorSettingsPage() {
    const { tx, locale } = useI18n();
    const { theme: siteTheme } = useTheme();
    const saved = useEditorSettings();
    const savedAt = useEditorSettingsUpdatedAt();
    // Edits go to a draft (null: nothing changed) until Save; the editor keeps using the saved settings.
    const [draft, setDraft] = useState<EditorSettings | null>(null);
    const settings = draft ?? saved;
    const changedKeys = useMemo(() => changedEditorSettingKeys(saved, settings), [saved, settings]);
    const dirty = changedKeys.length > 0;
    const canStore = useSyncExternalStore(subscribeNothing, storageAvailable, () => true);
    const { toasts, push: toast, dismiss } = useToasts();
    const [confirmDialog, confirm] = useConfirm();
    const [query, setQuery] = useState("");
    const [sample, setSample] = useState<SampleId>("javascript");
    const [samples, setSamples] = useState<Record<SampleId, string>>(SAMPLES);
    const [saving, setSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const previewRef = useRef<HTMLElement>(null);

    // Account copy (signed-in users): loaded once per account, reloaded on demand.
    const auth = useRawSession();
    const email = auth.status === "authenticated" ? auth.data?.user?.email?.toLowerCase() || null : null;
    const [accountVersion, setAccountVersion] = useState(0);
    const accountKey = email ? `${accountVersion}|${email}` : null;
    const [accountState, setAccountState] = useState<AccountState | null>(null);
    const [dismissedSync, setDismissedSync] = useState<string | null>(null);
    const account = accountState && accountState.key === accountKey ? accountState : null;
    const checking = Boolean(accountKey) && !account;
    // "adopt_account" is handled as soon as the copy arrives, so this device counts as saved here.
    const syncState = account?.copy ? compareEditorSettingsCopies({ settings: saved, updatedAt: savedAt, stored: true }, account.copy) : null;

    const onAccountLoaded = useEffectEvent((key: string, copy: AccountEditorSettings) => {
        const local = { settings: readEditorSettings(), updatedAt: readEditorSettingsUpdatedAt(), stored: hasStoredEditorSettings() };
        // Nothing was ever saved on this device: use the account's settings right away.
        if (copy.editorSettings && compareEditorSettingsCopies(local, copy) === "adopt_account") {
            saveEditorSettings(copy.editorSettings, { updatedAt: copy.updatedAt });
            toast({ tone: "info", message: tx(C.adopted) });
        }
        setAccountState({ key, copy, failed: false });
    });

    useEffect(() => {
        if (!accountKey) return;
        const controller = new AbortController();
        requestAccountSettings({ signal: controller.signal })
            .then((copy) => {
                if (!controller.signal.aborted) onAccountLoaded(accountKey, copy);
            })
            .catch(() => {
                if (!controller.signal.aborted) setAccountState({ key: accountKey, copy: null, failed: true });
            });
        return () => controller.abort();
    }, [accountKey]);

    // Phones show a "back to the preview" button only while the preview is off screen.
    const [previewInView, setPreviewInView] = useState(true);
    useEffect(() => {
        const element = previewRef.current;
        if (!element || typeof IntersectionObserver === "undefined") return;
        const observer = new IntersectionObserver(([entry]) => setPreviewInView(entry.isIntersecting), { threshold: 0.05 });
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    // Leaving the page (reload, closing the tab) with unsaved changes asks first.
    useEffect(() => {
        if (!dirty) return;
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = "";
        };
        window.addEventListener("beforeunload", onBeforeUnload);
        return () => window.removeEventListener("beforeunload", onBeforeUnload);
    }, [dirty]);

    /** A draft equal to the saved settings is dropped, so "unsaved" never shows without a difference. */
    const patchSettings = useCallback((patch: Partial<EditorSettings>) => {
        setDraft((current) => {
            const next = { ...(current ?? saved), ...patch };
            return editorSettingsEqual(next, saved) ? null : next;
        });
    }, [saved]);

    const pushToAccount = async (next: EditorSettings) => {
        const copy = await requestAccountSettings({ method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ editorSettings: next }) });
        if (accountKey) setAccountState({ key: accountKey, copy, failed: false });
        return copy;
    };

    /** Copies the settings saved on this device to the account. */
    const uploadSaved = async () => {
        if (!email || saving) return;
        setSaving(true);
        try {
            await pushToAccount(readEditorSettings());
            toast({ tone: "success", message: tx(C.uploadDone) });
        } catch {
            toast({ tone: "error", message: tx(C.accountSaveFailed) });
        } finally {
            setSaving(false);
        }
    };

    const save = async () => {
        if (saving) return;
        if (!draft || !dirty) {
            toast({ tone: "info", message: tx(C.nothingToSave) });
            return;
        }
        const next = draft;
        saveEditorSettings(next);
        setDraft(null);
        if (!email) {
            toast({ tone: "success", message: tx(C.savedToast) });
            return;
        }
        setSaving(true);
        try {
            await pushToAccount(next);
            toast({ tone: "success", message: tx(C.savedAccountToast) });
        } catch {
            toast({ tone: "warning", message: tx(C.accountSaveFailed), action: { label: tx(C.retry), onClick: () => void uploadSaved() } });
        } finally {
            setSaving(false);
        }
    };

    const discard = () => {
        if (!draft) return;
        const previous = draft;
        setDraft(null);
        toast({ tone: "info", message: tx(C.discarded), action: { label: tx(C.undo), onClick: () => setDraft(previous) } });
    };

    // Ctrl+S / ⌘+S saves (also while typing in the preview) instead of saving the web page.
    const onSaveShortcut = useEffectEvent(() => {
        void save();
    });
    useEffect(() => {
        const onKeyDown = (event: globalThis.KeyboardEvent) => {
            if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "s") return;
            event.preventDefault();
            onSaveShortcut();
        };
        window.addEventListener("keydown", onKeyDown, true);
        return () => window.removeEventListener("keydown", onKeyDown, true);
    }, []);

    const loadAccountCopy = async () => {
        const copy = account?.copy;
        if (!copy?.editorSettings) return;
        if (dirty) {
            const accepted = await confirm({ title: tx(C.loseChangesTitle), message: tx(C.loseChangesMessage), confirmLabel: tx(C.loadConfirm), destructive: true });
            if (!accepted) return;
        }
        const previous = saved;
        saveEditorSettings(copy.editorSettings, { updatedAt: copy.updatedAt });
        setDraft(null);
        toast({ tone: "success", message: tx(C.accountLoaded), action: { label: tx(C.undo), onClick: () => saveEditorSettings(previous) } });
    };

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
        toast({ tone: "info", message: tx(C.sectionReset, { name: tx(section.title) }), action: { label: tx(C.undo), onClick: () => setDraft(previous) } });
    };

    const resetAll = async () => {
        const accepted = await confirm({ title: tx(C.resetAllTitle), message: tx(C.resetAllMessage), confirmLabel: tx(C.resetConfirm), destructive: true });
        if (!accepted) return;
        const previous = settings;
        patchSettings({ ...DEFAULT_EDITOR_SETTINGS });
        toast({ tone: "info", message: tx(C.resetDone), action: { label: tx(C.undo), onClick: () => setDraft(previous) } });
    };

    /** Local history lives in this browser (IndexedDB), apart from the settings. */
    const clearLocalHistory = async () => {
        const accepted = await confirm({ title: tx(C.clearLocalHistoryTitle), message: tx(C.clearLocalHistoryMessage), confirmLabel: tx(C.clearLocalHistoryConfirm), destructive: true });
        if (!accepted) return;
        const history = await openLocalHistory();
        if (!history) {
            toast({ tone: "error", message: tx(C.localHistoryUnavailable) });
            return;
        }
        try {
            await history.clearAll();
            toast({ tone: "success", message: tx(C.localHistoryCleared) });
        } catch {
            toast({ tone: "error", message: tx(C.localHistoryUnavailable) });
        }
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
        patchSettings(result.settings);
        toast({ tone: "success", message: tx(C.imported), action: { label: tx(C.undo), onClick: () => setDraft(previous) } });
    };

    const previewPath = `inmemory://hanogt-settings/preview.${SAMPLE_EXTENSIONS[sample]}`;
    const accountCopy = account?.copy ?? null;
    const showSyncBanner = (syncState === "account_newer" || syncState === "conflict") && dismissedSync !== accountKey;
    const accountTime = formatTime(accountCopy?.updatedAt, locale);
    const iconButton = `${buttonClasses.ghost} h-9 w-9 px-0`;

    return (
        <div className="min-h-dvh overflow-x-clip bg-zinc-50 text-zinc-900 transition-colors dark:bg-zinc-950 dark:text-white">
            <Header />

            <main id="main-content" className="mx-auto max-w-7xl px-4 pb-24 pt-24 sm:px-6">
                {/* Hero */}
                <motion.section
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="relative mb-4 overflow-hidden rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900/60 sm:p-8"
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
                            <SyncLine
                                signedIn={Boolean(email) || auth.status === "loading"}
                                checking={checking || auth.status === "loading"}
                                saving={saving}
                                failed={Boolean(account?.failed)}
                                state={syncState}
                                savedAt={savedAt}
                                onUpload={() => void uploadSaved()}
                                onRetry={() => setAccountVersion((value) => value + 1)}
                            />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
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

                {showSyncBanner && accountCopy && (
                    <div role="status" className="mb-4 flex flex-col gap-3 rounded-3xl border border-indigo-300/60 bg-indigo-50 p-4 text-sm text-indigo-950 sm:flex-row sm:items-center dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-100">
                        <Cloud className="hidden h-5 w-5 shrink-0 text-indigo-500 sm:block" aria-hidden />
                        <div className="min-w-0 flex-1">
                            <p className="font-semibold">{tx(syncState === "conflict" ? C.conflictTitle : C.accountNewerTitle)}</p>
                            <p className="mt-0.5 text-xs leading-5 text-indigo-900/80 dark:text-indigo-100/80">
                                {syncState === "account_newer" && accountTime ? tx(C.accountNewerText, { time: accountTime }) : tx(C.conflictText)}
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => void loadAccountCopy()} className={buttonClasses.primary}>
                                <Download className="h-4 w-4" aria-hidden />
                                {tx(C.loadAccount)}
                            </button>
                            {syncState === "conflict" && (
                                <button type="button" onClick={() => void uploadSaved()} disabled={saving} className={buttonClasses.secondary}>
                                    <Upload className="h-4 w-4" aria-hidden />
                                    {tx(C.keepLocal)}
                                </button>
                            )}
                            <button type="button" onClick={() => setDismissedSync(accountKey)} className={buttonClasses.ghost}>{tx(C.notNow)}</button>
                        </div>
                    </div>
                )}

                {/* Save bar: stays under the header while scrolling. */}
                <div role="region" aria-label={tx(C.toolbar)} className={`sticky top-[4.5rem] z-30 mb-6 rounded-2xl border p-2 shadow-sm backdrop-blur-xl transition-colors sm:p-2.5 ${dirty ? "border-amber-400/60 bg-amber-50/95 dark:border-amber-500/30 dark:bg-zinc-900/95" : "border-zinc-200 bg-white/90 dark:border-white/10 dark:bg-zinc-900/90"}`}>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex min-w-0 flex-1 items-center gap-2 ps-1" aria-live="polite">
                            {dirty ? (
                                <>
                                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
                                    <span className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">{tx(C.unsaved)}</span>
                                    <span className="hidden shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-800 sm:inline dark:text-amber-300">{tx(C.unsavedCount, { count: changedKeys.length })}</span>
                                </>
                            ) : (
                                <>
                                    <Check className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                                    <span className="truncate text-sm text-zinc-600 dark:text-zinc-300">{tx(C.allSaved)}</span>
                                </>
                            )}
                        </div>
                        <div className="flex items-center gap-0.5">
                            <button type="button" onClick={exportSettings} className={iconButton} aria-label={tx(C.export)} title={tx(C.export)}>
                                <Download className="h-4 w-4" aria-hidden />
                            </button>
                            <button type="button" onClick={() => fileInputRef.current?.click()} className={iconButton} aria-label={tx(C.import)} title={tx(C.import)}>
                                <Upload className="h-4 w-4" aria-hidden />
                            </button>
                            <button type="button" onClick={() => void resetAll()} className={iconButton} aria-label={tx(C.resetAll)} title={tx(C.resetAll)}>
                                <RotateCcw className="h-4 w-4" aria-hidden />
                            </button>
                        </div>
                        <div className="flex items-center gap-2">
                            <button type="button" onClick={discard} disabled={!dirty} title={tx(C.discardHint)} className={`${buttonClasses.secondary} px-3`}>
                                <Undo2 className="h-4 w-4" aria-hidden />
                                {tx(C.discard)}
                            </button>
                            <button type="button" onClick={() => void save()} disabled={!dirty || saving} title={tx(C.saveHint)} aria-keyshortcuts="Control+S Meta+S" className={`${buttonClasses.primary} px-3`}>
                                {saving ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                                {tx(C.save)}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
                    {/* Live preview of the draft: first on phones, a sticky column on large screens. */}
                    <aside ref={previewRef} id="preview" className="scroll-mt-40 lg:order-2" aria-labelledby="preview-title">
                        <div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-900/60 sm:p-5 lg:sticky lg:top-40">
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
                            <div className="h-80 sm:h-96 lg:h-[min(36rem,calc(100dvh-21rem))]">
                                <CodeEditor
                                    language={sample}
                                    path={previewPath}
                                    value={samples[sample]}
                                    onChange={(value) => setSamples((current) => ({ ...current, [sample]: value ?? "" }))}
                                    ariaLabel={tx(C.previewEditor)}
                                    settingsOverride={settings}
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
                                        className="scroll-mt-40 rounded-3xl border border-zinc-200 bg-white px-5 pt-5 shadow-sm dark:border-white/10 dark:bg-zinc-900/60 sm:px-6"
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
                                            {rows.map((row) => <SettingRow key={row.key} row={row} settings={settings} onPatch={patchSettings} siteTheme={siteTheme} onAction={(action) => { if (action === "clearLocalHistory") void clearLocalHistory(); }} />)}
                                        </div>
                                    </motion.section>
                                );
                            })}

                            {!normalizedQuery && (
                                <section id="backup" className="scroll-mt-40 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-900/60 sm:p-6" aria-labelledby="backup-title">
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
                                </section>
                            )}
                        </div>
                    </div>
                </div>
            </main>

            {/* Outside the backup section, so importing from the save bar also works while searching. */}
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
