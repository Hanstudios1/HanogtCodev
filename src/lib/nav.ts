import type { Copy } from "@/lib/i18n";
import type { ProductId } from "@/lib/products";

export type NavIcon = "news" | "arcade" | "engine" | "media" | "guide" | "dashboard" | "security" | "groups" | "friends" | "messages" | "about" | "feedback" | "docs" | "ai" | "admin" | "pricing";

export interface NavItem {
    href: string;
    icon: NavIcon;
    label: Copy;
    /** Locale key for the one-line description shown in menus. */
    descKey?: string;
    /** Inline description (translated by the copy packs); used instead of descKey when set. */
    desc?: Copy;
    /** Shown only to signed-in users. */
    auth?: boolean;
    live?: boolean;
    /** A Hanogt product: menus show its logo instead of the icon. */
    product?: ProductId;
}

export const NAV_LABELS = {
    news: { TR: "Haberler", EN: "News", RU: "Новости", AZ: "Xəbərlər", ES: "Noticias", KZ: "Жаңалықтар", JP: "ニュース", CN: "新闻", KR: "뉴스", HI: "समाचार", DE: "News", NG: "News", FR: "Actualités", BE: "Nieuws", NL: "Nieuws", PL: "Wiadomości", NO: "Nyheter", FI: "Uutiset", SV: "Nyheter", EL: "Νέα", AR: "الأخبار", PT: "Notícias", IT: "Notizie", UK: "Новини", ID: "Berita", VI: "Tin tức", CS: "Novinky", RO: "Știri", HU: "Hírek", UZ: "Yangiliklar" },
    arcade: { TR: "Arcade", EN: "Arcade", RU: "Аркада", KZ: "Аркада", JP: "アーケード", CN: "街机", KR: "아케이드", HI: "आर्केड", EL: "Arcade", AR: "أركيد", PT: "Arcade", IT: "Arcade", UK: "Аркада", ID: "Arcade", VI: "Arcade", CS: "Arcade", RO: "Arcade", HU: "Arcade", UZ: "Arcade" },
    engine: { TR: "Oyun Motoru", EN: "Game Engine", RU: "Игровой движок", AZ: "Oyun mühərriki", ES: "Motor de juegos", KZ: "Ойын қозғалтқышы", JP: "ゲームエンジン", CN: "游戏引擎", KR: "게임 엔진", HI: "गेम इंजन", DE: "Spiel-Engine", NG: "Game Engine", FR: "Moteur de jeu", BE: "Game-engine", NL: "Game-engine", PL: "Silnik gier", NO: "Spillmotor", FI: "Pelimoottori", SV: "Spelmotor", EL: "Μηχανή παιχνιδιών", AR: "محرك الألعاب", PT: "Motor de jogos", IT: "Motore di gioco", UK: "Ігровий рушій", ID: "Mesin game", VI: "Công cụ game", CS: "Herní engine", RO: "Motor de jocuri", HU: "Játékmotor", UZ: "Oʻyin dvigateli" },
    media: { TR: "Media", EN: "Media", RU: "Медиа", KZ: "Медиа", JP: "メディア", CN: "媒体", KR: "미디어", HI: "मीडिया", ES: "Media", FR: "Média", EL: "Media", AR: "ميديا", PT: "Media", IT: "Media", UK: "Медіа", ID: "Media", VI: "Media", CS: "Media", RO: "Media", HU: "Media", UZ: "Media" },
    guide: { TR: "Kılavuz", EN: "Guide", RU: "Руководство", AZ: "Bələdçi", ES: "Guía", KZ: "Нұсқаулық", JP: "ガイド", CN: "指南", KR: "가이드", HI: "गाइड", DE: "Anleitung", NG: "Guide", FR: "Guide", BE: "Gids", NL: "Handleiding", PL: "Poradnik", NO: "Veiledning", FI: "Opas", SV: "Guide", EL: "Οδηγός", AR: "الدليل", PT: "Guia", IT: "Guida", UK: "Посібник", ID: "Panduan", VI: "Hướng dẫn", CS: "Průvodce", RO: "Ghid", HU: "Útmutató", UZ: "Qoʻllanma" },
    dashboard: { TR: "Panel", EN: "Dashboard", RU: "Панель", AZ: "Panel", ES: "Panel", KZ: "Панель", JP: "ダッシュボード", CN: "控制台", KR: "대시보드", HI: "डैशबोर्ड", DE: "Dashboard", NG: "Dashboard", FR: "Tableau de bord", BE: "Dashboard", NL: "Dashboard", PL: "Panel", NO: "Dashbord", FI: "Hallintapaneeli", SV: "Översikt", EL: "Πίνακας", AR: "لوحة التحكم", PT: "Painel", IT: "Dashboard", UK: "Панель", ID: "Dasbor", VI: "Bảng điều khiển", CS: "Nástěnka", RO: "Panou", HU: "Irányítópult", UZ: "Boshqaruv paneli" },
    security: { TR: "Güvenlik", EN: "Security", RU: "Безопасность", AZ: "Təhlükəsizlik", ES: "Seguridad", KZ: "Қауіпсіздік", JP: "セキュリティ", CN: "安全", KR: "보안", HI: "सुरक्षा", DE: "Sicherheit", NG: "Security", FR: "Sécurité", BE: "Beveiliging", NL: "Beveiliging", PL: "Bezpieczeństwo", NO: "Sikkerhet", FI: "Tietoturva", SV: "Säkerhet", EL: "Ασφάλεια", AR: "الأمان", PT: "Segurança", IT: "Sicurezza", UK: "Безпека", ID: "Keamanan", VI: "Bảo mật", CS: "Zabezpečení", RO: "Securitate", HU: "Biztonság", UZ: "Xavfsizlik" },
    groups: { TR: "Gruplar", EN: "Groups", RU: "Группы", AZ: "Qruplar", ES: "Grupos", KZ: "Топтар", JP: "グループ", CN: "群组", KR: "그룹", HI: "समूह", DE: "Gruppen", NG: "Groups", FR: "Groupes", BE: "Groepen", NL: "Groepen", PL: "Grupy", NO: "Grupper", FI: "Ryhmät", SV: "Grupper", EL: "Ομάδες", AR: "المجموعات", PT: "Grupos", IT: "Gruppi", UK: "Групи", ID: "Grup", VI: "Nhóm", CS: "Skupiny", RO: "Grupuri", HU: "Csoportok", UZ: "Guruhlar" },
    friends: { TR: "Arkadaşlar", EN: "Friends", RU: "Друзья", AZ: "Dostlar", ES: "Amigos", KZ: "Достар", JP: "フレンド", CN: "好友", KR: "친구", HI: "मित्र", DE: "Freunde", NG: "Padi dem", FR: "Amis", BE: "Vrienden", NL: "Vrienden", PL: "Znajomi", NO: "Venner", FI: "Ystävät", SV: "Vänner", EL: "Φίλοι", AR: "الأصدقاء", PT: "Amigos", IT: "Amici", UK: "Друзі", ID: "Teman", VI: "Bạn bè", CS: "Přátelé", RO: "Prieteni", HU: "Ismerősök", UZ: "Doʻstlar" },
    messages: { TR: "Mesajlar", EN: "Messages", RU: "Сообщения", AZ: "Mesajlar", ES: "Mensajes", KZ: "Хабарламалар", JP: "メッセージ", CN: "消息", KR: "메시지", HI: "संदेश", DE: "Nachrichten", NG: "Messages", FR: "Messages", BE: "Berichten", NL: "Berichten", PL: "Wiadomości", NO: "Meldinger", FI: "Viestit", SV: "Meddelanden", EL: "Μηνύματα", AR: "الرسائل", PT: "Mensagens", IT: "Messaggi", UK: "Повідомлення", ID: "Pesan", VI: "Tin nhắn", CS: "Zprávy", RO: "Mesaje", HU: "Üzenetek", UZ: "Xabarlar" },
    social: { TR: "Hanogt Social", EN: "Hanogt Social" },
    pricing: { TR: "Fiyatlandırma", EN: "Pricing", RU: "Цены", AZ: "Qiymətlər", ES: "Precios", KZ: "Бағалар", JP: "料金", CN: "价格", KR: "요금", HI: "मूल्य", DE: "Preise", NG: "Pricing", FR: "Tarifs", BE: "Prijzen", NL: "Prijzen", PL: "Cennik", NO: "Priser", FI: "Hinnat", SV: "Priser", EL: "Τιμές", AR: "الأسعار", PT: "Preços", IT: "Prezzi", UK: "Ціни", ID: "Harga", VI: "Bảng giá", CS: "Ceník", RO: "Prețuri", HU: "Árak", UZ: "Narxlar" },
    docs: { TR: "Motor Belgeleri", EN: "Engine Docs", RU: "Документация движка", AZ: "Mühərrik sənədləri", ES: "Documentación del motor", KZ: "Қозғалтқыш құжаттары", JP: "エンジンドキュメント", CN: "引擎文档", KR: "엔진 문서", HI: "इंजन दस्तावेज़", DE: "Engine-Doku", NG: "Engine Docs", FR: "Docs du moteur", BE: "Engine-docs", NL: "Engine-docs", PL: "Dokumentacja silnika", NO: "Motordokumentasjon", FI: "Moottorin ohjeet", SV: "Motordokumentation", EL: "Τεκμηρίωση μηχανής", AR: "وثائق المحرك", PT: "Documentação do motor", IT: "Documentazione del motore", UK: "Документація рушія", ID: "Dokumentasi mesin", VI: "Tài liệu công cụ", CS: "Dokumentace enginu", RO: "Documentația motorului", HU: "Motordokumentáció", UZ: "Dvigatel hujjatlari" },
    whatsNew: { TR: "Yenilikler", EN: "What's new", RU: "Что нового", AZ: "Yeniliklər", ES: "Novedades", KZ: "Жаңалықтар", JP: "新機能", CN: "更新内容", KR: "새로운 기능", HI: "नया क्या है", DE: "Neuigkeiten", NG: "Wetin new", FR: "Nouveautés", BE: "Wat is er nieuw", NL: "Wat is er nieuw", PL: "Co nowego", NO: "Nyheter i appen", FI: "Uutta", SV: "Nyheter i appen", EL: "Τι νέο υπάρχει", AR: "ما الجديد", PT: "Novidades", IT: "Novità", UK: "Що нового", ID: "Yang baru", VI: "Có gì mới", CS: "Co je nového", RO: "Noutăți", HU: "Újdonságok", UZ: "Nima yangi" },
    menu: { TR: "Menü", EN: "Menu", RU: "Меню", AZ: "Menyu", ES: "Menú", KZ: "Мәзір", JP: "メニュー", CN: "菜单", KR: "메뉴", HI: "मेनू", DE: "Menü", NG: "Menu", FR: "Menu", BE: "Menu", NL: "Menu", PL: "Menu", NO: "Meny", FI: "Valikko", SV: "Meny", EL: "Μενού", AR: "القائمة", PT: "Menu", IT: "Menu", UK: "Меню", ID: "Menu", VI: "Menu", CS: "Nabídka", RO: "Meniu", HU: "Menü", UZ: "Menyu" },
    live: { TR: "Canlı", EN: "Live", RU: "В эфире", AZ: "Canlı", ES: "En vivo", KZ: "Тікелей", JP: "ライブ", CN: "直播", KR: "라이브", HI: "लाइव", DE: "Live", NG: "Live", FR: "En direct", BE: "Live", NL: "Live", PL: "Na żywo", NO: "Direkte", FI: "Livenä", SV: "Live", EL: "Ζωντανά", AR: "مباشر", PT: "Ao vivo", IT: "Live", UK: "Наживо", ID: "Langsung", VI: "Trực tiếp", CS: "Živě", RO: "Live", HU: "Élő", UZ: "Jonli" },
    explore: { TR: "Keşfet", EN: "Explore", RU: "Обзор", AZ: "Kəşf et", ES: "Explorar", KZ: "Шолу", JP: "探索", CN: "探索", KR: "둘러보기", HI: "खोजें", DE: "Entdecken", NG: "Explore", FR: "Explorer", BE: "Ontdekken", NL: "Ontdekken", PL: "Odkrywaj", NO: "Utforsk", FI: "Tutustu", SV: "Utforska", EL: "Εξερεύνηση", AR: "استكشف", PT: "Explorar", IT: "Esplora", UK: "Огляд", ID: "Jelajahi", VI: "Khám phá", CS: "Objevovat", RO: "Explorează", HU: "Felfedezés", UZ: "Kashf eting" },
    community: { TR: "Topluluk", EN: "Community", RU: "Сообщество", AZ: "İcma", ES: "Comunidad", KZ: "Қауымдастық", JP: "コミュニティ", CN: "社区", KR: "커뮤니티", HI: "समुदाय", DE: "Community", NG: "Community", FR: "Communauté", BE: "Community", NL: "Community", PL: "Społeczność", NO: "Fellesskap", FI: "Yhteisö", SV: "Gemenskap", EL: "Κοινότητα", AR: "المجتمع", PT: "Comunidade", IT: "Community", UK: "Спільнота", ID: "Komunitas", VI: "Cộng đồng", CS: "Komunita", RO: "Comunitate", HU: "Közösség", UZ: "Hamjamiyat" },
    resources: { TR: "Kaynaklar", EN: "Resources", RU: "Ресурсы", AZ: "Resurslar", ES: "Recursos", KZ: "Ресурстар", JP: "リソース", CN: "资源", KR: "리소스", HI: "संसाधन", DE: "Ressourcen", NG: "Resources", FR: "Ressources", BE: "Bronnen", NL: "Bronnen", PL: "Zasoby", NO: "Ressurser", FI: "Resurssit", SV: "Resurser", EL: "Πόροι", AR: "الموارد", PT: "Recursos", IT: "Risorse", UK: "Ресурси", ID: "Sumber daya", VI: "Tài nguyên", CS: "Zdroje", RO: "Resurse", HU: "Források", UZ: "Resurslar" },
    legal: { TR: "Yasal", EN: "Legal", RU: "Правовая информация", AZ: "Hüquqi", ES: "Legal", KZ: "Құқықтық", JP: "法的情報", CN: "法律", KR: "법적 고지", HI: "कानूनी", DE: "Rechtliches", NG: "Legal", FR: "Mentions légales", BE: "Juridisch", NL: "Juridisch", PL: "Informacje prawne", NO: "Juridisk", FI: "Oikeudelliset", SV: "Juridiskt", EL: "Νομικά", AR: "المعلومات القانونية", PT: "Jurídico", IT: "Note legali", UK: "Правова інформація", ID: "Hukum", VI: "Pháp lý", CS: "Právní informace", RO: "Informații legale", HU: "Jogi információk", UZ: "Huquqiy maʼlumot" },
    editor: { TR: "Kod Editörü", EN: "Code Editor", RU: "Редактор кода", AZ: "Kod redaktoru", ES: "Editor de código", KZ: "Код редакторы", JP: "コードエディター", CN: "代码编辑器", KR: "코드 에디터", HI: "कोड एडिटर", DE: "Code-Editor", NG: "Code Editor", FR: "Éditeur de code", BE: "Code-editor", NL: "Code-editor", PL: "Edytor kodu", NO: "Koderedigerer", FI: "Koodieditori", SV: "Kodredigerare", EL: "Επεξεργαστής κώδικα", AR: "محرر الأكواد", PT: "Editor de código", IT: "Editor di codice", UK: "Редактор коду", ID: "Editor kode", VI: "Trình soạn thảo mã", CS: "Editor kódu", RO: "Editor de cod", HU: "Kódszerkesztő", UZ: "Kod muharriri" },
} satisfies Record<string, Copy>;

export const PRIMARY_NAV: NavItem[] = [
    { href: "/dashboard", icon: "dashboard", label: NAV_LABELS.dashboard, auth: true, descKey: "nd_dashboard" },
    { href: "/ai", icon: "ai", label: { TR: "Hanogt AI", EN: "Hanogt AI" }, desc: { TR: "Kod, oyun ve güvenlik için yapay zeka asistanı", EN: "AI assistant for code, games and security" }, product: "ai" },
    { href: "/news", icon: "news", label: NAV_LABELS.news, live: true, descKey: "nd_news", product: "news" },
    { href: "/arcade", icon: "arcade", label: NAV_LABELS.arcade, descKey: "nd_arcade" },
    { href: "/game-engine", icon: "engine", label: NAV_LABELS.engine, descKey: "nd_engine", product: "engine" },
    { href: "/security", icon: "security", label: NAV_LABELS.security, descKey: "nd_security", product: "security" },
    { href: "/media", icon: "media", label: NAV_LABELS.media, descKey: "nd_media" },
    { href: "/guide", icon: "guide", label: NAV_LABELS.guide, descKey: "nd_guide" },
    { href: "/plans", icon: "pricing", label: NAV_LABELS.pricing, desc: { TR: "Ücretsiz, Plus ve Pro: özellikler ve fiyatlar", EN: "Free, Plus and Pro: features and prices" } },
];

export const SECONDARY_NAV: NavItem[] = [
    {
        href: "/social",
        icon: "messages",
        label: NAV_LABELS.social,
        auth: true,
        desc: { TR: "Arkadaşlar, direkt mesajlar ve gruplar tek yerde", EN: "Friends, direct messages and groups in one place" },
        product: "social",
    },
    { href: "/game-engine/docs", icon: "docs", label: NAV_LABELS.docs, descKey: "nd_docs" },
];

/**
 * Shown only to staff (moderators, admins, owners), once GET /api/admin/me
 * confirms the role; see useStaffRole in components/Header.tsx.
 */
export const ADMIN_NAV: NavItem = {
    href: "/admin",
    icon: "admin",
    label: { TR: "Yönetici Paneli", EN: "Admin Panel" },
    desc: { TR: "Kullanıcılar, moderasyon, destek ve duyurular", EN: "Users, moderation, support and announcements" },
    auth: true,
};

export function isActivePath(pathname: string | null, href: string) {
    if (!pathname) return false;
    if (href === "/") return pathname === "/";
    if (href === "/game-engine") return pathname === "/game-engine";
    return pathname === href || pathname.startsWith(`${href}/`);
}
