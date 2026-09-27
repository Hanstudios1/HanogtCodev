import type { Copy } from "@/lib/i18n";

export type NavIcon = "news" | "arcade" | "engine" | "media" | "guide" | "dashboard" | "security" | "groups" | "friends" | "messages" | "about" | "feedback" | "docs";

export interface NavItem {
    href: string;
    icon: NavIcon;
    label: Copy;
    description: Copy;
    /** Shown only to signed-in users. */
    auth?: boolean;
    live?: boolean;
}

export const NAV_LABELS = {
    news: { TR: "Haberler", EN: "News", RU: "Новости", AZ: "Xəbərlər", ES: "Noticias", KZ: "Жаңалықтар", JP: "ニュース", CN: "新闻", KR: "뉴스", HI: "समाचार", DE: "News", NG: "News", FR: "Actualités", BE: "Nieuws", NL: "Nieuws", PL: "Wiadomości", NO: "Nyheter", FI: "Uutiset", SV: "Nyheter", EL: "Νέα" },
    arcade: { TR: "Arcade", EN: "Arcade", RU: "Аркада", KZ: "Аркада", JP: "アーケード", CN: "街机", KR: "아케이드", HI: "आर्केड", EL: "Arcade" },
    engine: { TR: "Oyun Motoru", EN: "Game Engine", RU: "Игровой движок", AZ: "Oyun mühərriki", ES: "Motor de juegos", KZ: "Ойын қозғалтқышы", JP: "ゲームエンジン", CN: "游戏引擎", KR: "게임 엔진", HI: "गेम इंजन", DE: "Spiel-Engine", NG: "Game Engine", FR: "Moteur de jeu", BE: "Game-engine", NL: "Game-engine", PL: "Silnik gier", NO: "Spillmotor", FI: "Pelimoottori", SV: "Spelmotor", EL: "Μηχανή παιχνιδιών" },
    media: { TR: "Media", EN: "Media", RU: "Медиа", KZ: "Медиа", JP: "メディア", CN: "媒体", KR: "미디어", HI: "मीडिया", ES: "Media", FR: "Média", EL: "Media" },
    guide: { TR: "Kılavuz", EN: "Guide", RU: "Руководство", AZ: "Bələdçi", ES: "Guía", KZ: "Нұсқаулық", JP: "ガイド", CN: "指南", KR: "가이드", HI: "गाइड", DE: "Anleitung", NG: "Guide", FR: "Guide", BE: "Gids", NL: "Handleiding", PL: "Poradnik", NO: "Veiledning", FI: "Opas", SV: "Guide", EL: "Οδηγός" },
    dashboard: { TR: "Panel", EN: "Dashboard", RU: "Панель", AZ: "Panel", ES: "Panel", KZ: "Панель", JP: "ダッシュボード", CN: "控制台", KR: "대시보드", HI: "डैशबोर्ड", DE: "Dashboard", NG: "Dashboard", FR: "Tableau de bord", BE: "Dashboard", NL: "Dashboard", PL: "Panel", NO: "Dashbord", FI: "Hallintapaneeli", SV: "Översikt", EL: "Πίνακας" },
    security: { TR: "Güvenlik", EN: "Security", RU: "Безопасность", AZ: "Təhlükəsizlik", ES: "Seguridad", KZ: "Қауіпсіздік", JP: "セキュリティ", CN: "安全", KR: "보안", HI: "सुरक्षा", DE: "Sicherheit", NG: "Security", FR: "Sécurité", BE: "Beveiliging", NL: "Beveiliging", PL: "Bezpieczeństwo", NO: "Sikkerhet", FI: "Tietoturva", SV: "Säkerhet", EL: "Ασφάλεια" },
    groups: { TR: "Gruplar", EN: "Groups", RU: "Группы", AZ: "Qruplar", ES: "Grupos", KZ: "Топтар", JP: "グループ", CN: "群组", KR: "그룹", HI: "समूह", DE: "Gruppen", NG: "Groups", FR: "Groupes", BE: "Groepen", NL: "Groepen", PL: "Grupy", NO: "Grupper", FI: "Ryhmät", SV: "Grupper", EL: "Ομάδες" },
    friends: { TR: "Arkadaşlar", EN: "Friends", RU: "Друзья", AZ: "Dostlar", ES: "Amigos", KZ: "Достар", JP: "フレンド", CN: "好友", KR: "친구", HI: "मित्र", DE: "Freunde", NG: "Padi dem", FR: "Amis", BE: "Vrienden", NL: "Vrienden", PL: "Znajomi", NO: "Venner", FI: "Ystävät", SV: "Vänner", EL: "Φίλοι" },
    messages: { TR: "Mesajlar", EN: "Messages", RU: "Сообщения", AZ: "Mesajlar", ES: "Mensajes", KZ: "Хабарламалар", JP: "メッセージ", CN: "消息", KR: "메시지", HI: "संदेश", DE: "Nachrichten", NG: "Messages", FR: "Messages", BE: "Berichten", NL: "Berichten", PL: "Wiadomości", NO: "Meldinger", FI: "Viestit", SV: "Meddelanden", EL: "Μηνύματα" },
    docs: { TR: "Motor Belgeleri", EN: "Engine Docs", RU: "Документация движка", AZ: "Mühərrik sənədləri", ES: "Documentación del motor", KZ: "Қозғалтқыш құжаттары", JP: "エンジンドキュメント", CN: "引擎文档", KR: "엔진 문서", HI: "इंजन दस्तावेज़", DE: "Engine-Doku", NG: "Engine Docs", FR: "Docs du moteur", BE: "Engine-docs", NL: "Engine-docs", PL: "Dokumentacja silnika", NO: "Motordokumentasjon", FI: "Moottorin ohjeet", SV: "Motordokumentation", EL: "Τεκμηρίωση μηχανής" },
    whatsNew: { TR: "Yenilikler", EN: "What's new", RU: "Что нового", AZ: "Yeniliklər", ES: "Novedades", KZ: "Жаңалықтар", JP: "新機能", CN: "更新内容", KR: "새로운 기능", HI: "नया क्या है", DE: "Neuigkeiten", NG: "Wetin new", FR: "Nouveautés", BE: "Wat is er nieuw", NL: "Wat is er nieuw", PL: "Co nowego", NO: "Nyheter i appen", FI: "Uutta", SV: "Nyheter i appen", EL: "Τι νέο υπάρχει" },
    menu: { TR: "Menü", EN: "Menu", RU: "Меню", AZ: "Menyu", ES: "Menú", KZ: "Мәзір", JP: "メニュー", CN: "菜单", KR: "메뉴", HI: "मेनू", DE: "Menü", NG: "Menu", FR: "Menu", BE: "Menu", NL: "Menu", PL: "Menu", NO: "Meny", FI: "Valikko", SV: "Meny", EL: "Μενού" },
    live: { TR: "Canlı", EN: "Live", RU: "В эфире", AZ: "Canlı", ES: "En vivo", KZ: "Тікелей", JP: "ライブ", CN: "直播", KR: "라이브", HI: "लाइव", DE: "Live", NG: "Live", FR: "En direct", BE: "Live", NL: "Live", PL: "Na żywo", NO: "Direkte", FI: "Livenä", SV: "Live", EL: "Ζωντανά" },
    explore: { TR: "Keşfet", EN: "Explore", RU: "Обзор", AZ: "Kəşf et", ES: "Explorar", KZ: "Шолу", JP: "探索", CN: "探索", KR: "둘러보기", HI: "खोजें", DE: "Entdecken", NG: "Explore", FR: "Explorer", BE: "Ontdekken", NL: "Ontdekken", PL: "Odkrywaj", NO: "Utforsk", FI: "Tutustu", SV: "Utforska", EL: "Εξερεύνηση" },
    community: { TR: "Topluluk", EN: "Community", RU: "Сообщество", AZ: "İcma", ES: "Comunidad", KZ: "Қауымдастық", JP: "コミュニティ", CN: "社区", KR: "커뮤니티", HI: "समुदाय", DE: "Community", NG: "Community", FR: "Communauté", BE: "Community", NL: "Community", PL: "Społeczność", NO: "Fellesskap", FI: "Yhteisö", SV: "Gemenskap", EL: "Κοινότητα" },
    resources: { TR: "Kaynaklar", EN: "Resources", RU: "Ресурсы", AZ: "Resurslar", ES: "Recursos", KZ: "Ресурстар", JP: "リソース", CN: "资源", KR: "리소스", HI: "संसाधन", DE: "Ressourcen", NG: "Resources", FR: "Ressources", BE: "Bronnen", NL: "Bronnen", PL: "Zasoby", NO: "Ressurser", FI: "Resurssit", SV: "Resurser", EL: "Πόροι" },
    legal: { TR: "Yasal", EN: "Legal", RU: "Правовая информация", AZ: "Hüquqi", ES: "Legal", KZ: "Құқықтық", JP: "法的情報", CN: "法律", KR: "법적 고지", HI: "कानूनी", DE: "Rechtliches", NG: "Legal", FR: "Mentions légales", BE: "Juridisch", NL: "Juridisch", PL: "Informacje prawne", NO: "Juridisk", FI: "Oikeudelliset", SV: "Juridiskt", EL: "Νομικά" },
    editor: { TR: "Kod Editörü", EN: "Code Editor", RU: "Редактор кода", AZ: "Kod redaktoru", ES: "Editor de código", KZ: "Код редакторы", JP: "コードエディター", CN: "代码编辑器", KR: "코드 에디터", HI: "कोड एडिटर", DE: "Code-Editor", NG: "Code Editor", FR: "Éditeur de code", BE: "Code-editor", NL: "Code-editor", PL: "Edytor kodu", NO: "Koderedigerer", FI: "Koodieditori", SV: "Kodredigerare", EL: "Επεξεργαστής κώδικα" },
} satisfies Record<string, Copy>;

export const PRIMARY_NAV: NavItem[] = [
    { href: "/dashboard", icon: "dashboard", label: NAV_LABELS.dashboard, auth: true, description: { TR: "Projelerin ve kod editörün", EN: "Your projects and code editor" } },
    { href: "/news", icon: "news", label: NAV_LABELS.news, live: true, description: { TR: "Canlı teknoloji haberleri ve yapay zeka sıralamaları", EN: "Live tech news and AI leaderboards" } },
    { href: "/arcade", icon: "arcade", label: NAV_LABELS.arcade, description: { TR: "Toplulukta yapılan oyunları oyna", EN: "Play games made by the community" } },
    { href: "/game-engine", icon: "engine", label: NAV_LABELS.engine, description: { TR: "C# ve C++ ile 2D/3D oyun yap", EN: "Build 2D/3D games with C# and C++" } },
    { href: "/media", icon: "media", label: NAV_LABELS.media, description: { TR: "Kod ve projelerini paylaş", EN: "Share code and projects" } },
    { href: "/guide", icon: "guide", label: NAV_LABELS.guide, description: { TR: "Minecraft kitabı tarzında kullanım rehberi", EN: "A Minecraft-book style how-to" } },
];

export const SECONDARY_NAV: NavItem[] = [
    { href: "/groups", icon: "groups", label: NAV_LABELS.groups, auth: true, description: { TR: "Ekip sohbetleri ve ortak projeler", EN: "Team chats and shared projects" } },
    { href: "/friends", icon: "friends", label: NAV_LABELS.friends, auth: true, description: { TR: "Arkadaşların ve istekler", EN: "Your friends and requests" } },
    { href: "/security", icon: "security", label: NAV_LABELS.security, description: { TR: "Güvenlik merkezi ve danışman", EN: "Security center and advisor" } },
    { href: "/game-engine/docs", icon: "docs", label: NAV_LABELS.docs, description: { TR: "Script API ve örnekler", EN: "Script API and examples" } },
];

export function isActivePath(pathname: string | null, href: string) {
    if (!pathname) return false;
    if (href === "/") return pathname === "/";
    if (href === "/game-engine") return pathname === "/game-engine";
    return pathname === href || pathname.startsWith(`${href}/`);
}
