"use client";

import OptimizedImage from "@/components/OptimizedImage";

import { useState, useEffect } from "react";
import { Check, ChevronDown, MessageSquare, MoreVertical, Pencil, Send, Sparkles, Trash2, X } from "lucide-react";
import { useI18n, type Copy } from "@/lib/i18n";
import { useSession } from "next-auth/react";
import { db } from "@/lib/firebase";
import { collection, addDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp, doc, getDoc, type Timestamp } from "firebase/firestore";

export type EntryText = Copy | { key: string };

export interface UpdateEntry {
    id: string;
    version: string;
    /** ISO date (YYYY-MM-DD); shown in the reader's locale. */
    date: string;
    title: EntryText;
    desc: EntryText;
    items: EntryText[];
}

/** Newest first; the About page builds its release timeline from the same list. */
export const UPDATES: UpdateEntry[] = [
    {
        id: "v0.2.0",
        version: "v0.2.0",
        date: "2026-10-02",
        title: { TR: "Hanogt Social, Hanogt AI ajan modu, Engine V3 ve 122 dil", EN: "Hanogt Social, Hanogt AI agent mode, Engine V3 and 122 languages" },
        desc: { TR: "Arkadaşlar, mesajlar ve gruplar Hanogt Social'da birleşti; Hanogt AI izninizle işlem yapabiliyor, Hanogt Engine V3 çıktı, kod editörü 122 dile ulaştı, Hesap Ayarları yeniden tasarlandı, destek talepleri ve bulut bağlantısı güçlendirildi.", EN: "Friends, messages and groups come together in Hanogt Social; Hanogt AI can act for you with your permission, Hanogt Engine V3 is out, the code editor reaches 122 languages, Account Settings was redesigned, and support tickets and the cloud connection got stronger." },
        items: [
            { TR: "Hanogt AI yeni arayüzde: geçmiş kenar çubuğu, büyüyen yazma alanı, kopyala/yeniden üret/düzenle, kod blokları için \"Editörde aç\" ve web sayfası önizlemeli yan panel.", EN: "Hanogt AI has a new interface: a history sidebar, a growing composer, copy/regenerate/edit, \"Open in editor\" on code blocks and a side panel with web page previews." },
            { TR: "Hanogt AI ajan modu: grup oluşturma, profil bilgilerinizi okuma, kodu editörde açma ve oyun oluşturma yalnızca izin kartında onay verdiğinizde yapılır; silme, şifre ve yönetim işleri hiçbir zaman yapılmaz.", EN: "Hanogt AI agent mode: creating a group, reading your profile, opening code in the editor and creating a game happen only after you approve them on a permission card; deleting things, passwords and admin work are never done." },
            { TR: "Çevrimdışı Hanogt AI Çekirdeği yeniden eğitildi: 52 niyet ve 10.135 örnekle doğruluk %67'den %90'a çıktı; hesap makinesi, yılan ve pong gibi 16 hazır program.", EN: "The offline Hanogt AI Core was retrained: with 52 intents and 10,135 examples its accuracy rose from 67% to 90%, and it has 16 ready-made programs such as a calculator, snake and pong." },
            { TR: "Kod editöründe 122 dil, 57'si çalışıyor ya da önizleniyor: Prolog, Forth, BASIC, Befunge, Whitespace ve MIPS tarayıcıda çalışıyor; YAML, TOML, XML, INI, .env ve CSV doğrulanıyor; SVG, Mermaid ve LaTeX önizleniyor.", EN: "122 languages in the code editor, 57 of them run or preview: Prolog, Forth, BASIC, Befunge, Whitespace and MIPS run in the browser; YAML, TOML, XML, INI, .env and CSV are validated; SVG, Mermaid and LaTeX are previewed." },
            { TR: "Web önizlemesinde localStorage kullanan sayfalar (ör. skor kaydeden oyunlar) artık çalışıyor.", EN: "Pages that use localStorage (for example games that save a score) now work in the web preview." },
            { TR: "Hanogt Social: arkadaşlar, direkt mesajlar ve gruplar Discord benzeri tek ekranda; grup rayı, kanallar, rol ve duruma göre üye listesi, telefonda çekmeceler ve Ctrl/⌘+K hızlı geçiş.", EN: "Hanogt Social: friends, direct messages and groups on one Discord-like screen, with a group rail, channels, a member list grouped by role and status, drawers on phones and Ctrl/⌘+K quick switching." },
            { TR: "Durum menüsü yenilendi: özel durum, birden çok sekme ya da cihazda en etkin olanın geçerli olması ve 5 dakika etkileşimsizlikte otomatik Boşta; durumunuz Social'da, profil kartlarında ve üye listelerinde aynı görünür.", EN: "The status menu was renewed: a custom status, the most active of several tabs or devices wins, and you go Idle automatically after 5 minutes without activity; your status looks the same in Social, profile cards and member lists." },
            { TR: "Hesap Ayarları yeniden tasarlandı: kategori menüsü ve canlı profil kartı; ad, takma ad ve #etiket artık her zaman görünüyor ve Kaydet çalışıyor. Editör Ayarları'na Kaydet/Vazgeç eklendi.", EN: "Account Settings redesigned with a category menu and a live profile card; your name, nickname and #tag always show and Save works. Editor Settings gained Save and Discard." },
            { TR: "Hanogt Engine V3: tilemap boyama ve karo çarpışmaları, arayüz bileşenleri (Button, Panel, Progress Bar), animasyon, Tween ve Timer, sis/bloom/vinyet efektleri ve üç yeni şablon.", EN: "Hanogt Engine V3: tilemap painting and tile collisions, UI components (Button, Panel, Progress Bar), animation, Tween and Timer, fog/bloom/vignette effects and three new templates." },
            { TR: "Destek talepleri: şikayet konusu, kullanıcı ve içerik bağlantısı ya da yasaklanan hesap veya grup gibi kategoriye özel alanlar; yeni talepler ve yanıtlar ekibe bildirim olarak düşer, siz her şeyi Taleplerim'den takip edersiniz.", EN: "Support tickets: category-specific fields such as the subject of a complaint, the user and content link, or the banned account or group; new tickets and replies notify the team, and you follow everything in My tickets." },
            { TR: "Askıya alınan hesaplar giriş ekranından doğrulanmış itiraz gönderebilir; doğrulayıcısını ve kurtarma kodlarını kaybedenler kurtarma talebi açabilir.", EN: "Suspended accounts can send a verified appeal from the sign-in screen, and people who lost their authenticator and recovery codes can open a recovery request." },
            { TR: "Kod editöründen doğrudan Media'da yayınla, yayını güncelle veya kaldır; yeni Düzenle menüsü (geri al, bul/değiştir, biçimlendir, yeniden adlandır, ZIP indir).", EN: "Publish to Media straight from the code editor, then update or unpublish it; a new Edit menu (undo, find and replace, format, rename, ZIP download)." },
            { TR: "Hanogt News: piyasa şeridinde TCMB döviz kurları önceki güne göre değişimle ve TCMB kuruyla hesaplanan gram altın; finans akışına Dünya, CNN Türk, Investing.com ve AA English eklendi.", EN: "Hanogt News: the market strip shows CBRT exchange rates with the change since the previous day and gram gold priced with the CBRT rate; Dünya, CNN Türk, Investing.com and AA English joined the finance feed." },
            { TR: "Yönetici Paneli: kurucu rozeti, kullanıcı verisi silme, gönderen siciliyle destek talepleri ve bulut bağlantısını denetleyip güvenlik kurallarını tek tıkla yayımlayan Bulut Sağlığı.", EN: "Admin Panel: a founder badge, user data deletion, support tickets with the sender's record, and Cloud Health, which checks the cloud connection and publishes the security rules in one click." },
            { TR: "Bulut bağlantısı: Firebase ayarları artık çalışma anında okunuyor; bağlantı kurulamazsa kopyalanabilir bir hata kodu çıkıyor, profil, bildirimler ve sohbet sunucu üzerinden çalışmayı sürdürüyor.", EN: "Cloud connection: Firebase settings are now read at runtime; if the connection fails a copyable error code appears, and profile, notifications and chat keep working through the server." },
            { TR: "Okunmamış sayısını gösteren bildirim zili; veri dışa aktarımına destek talepleri, bildirimler ve kendi mesajlarınız eklendi.", EN: "A notification bell with an unread count; data export now includes support tickets, notifications and your own messages." },
            { TR: "Gizlilik Politikası, KVKK Aydınlatma Metni ve Kullanım Şartları ayrıntılı olarak baştan yazıldı; bölüm içi arama ve içindekiler eklendi. Sürüm 4.2 Hanogt Social'ı, durumları ve piyasa verilerini de anlatıyor.", EN: "The Privacy Policy, KVKK Disclosure and Terms of Use were rewritten in detail, with in-page search and a table of contents. Version 4.2 also covers Hanogt Social, statuses and market data." },
            { TR: "Geri Bildirim/SSS onarıldı ve 24 soruya genişledi; ana sayfaya hızlı başlangıç kartları ve canlı topluluk rakamları geldi, dil sayısı artık gerçek kayıttan hesaplanıyor.", EN: "Feedback and FAQ were fixed and grew to 24 questions; the home page gained quick-start cards and live community numbers, and the language count now comes from the real registry." },
        ],
    },
    {
        id: "v0.1.3",
        version: "v0.1.3",
        date: "2026-10-01",
        title: { TR: "Discord tarzı durumlar, finans haberleri ve yenilenen Hakkımızda", EN: "Discord-style statuses, finance news and a new About page" },
        desc: { TR: "Çevrimiçi, Boşta, Rahatsız Etmeyin ve Görünmez durumları; altı konulu destek talepleri; ekonomi haberleri ve piyasa şeridi.", EN: "Online, Idle, Do Not Disturb and Invisible statuses; support tickets in six topics; economy news and a market strip." },
        items: [
            { TR: "Durum seçimi: yeşil nokta (Çevrimiçi), hilal (Boşta), kırmızı daire (Rahatsız Etmeyin) ve gri halka (Görünmez/Çevrimdışı); 10 dakika işlem yapılmazsa otomatik Boşta.", EN: "Pick a status: green dot (Online), crescent (Idle), red circle (Do Not Disturb) and grey ring (Invisible/Offline); automatically Idle after 10 minutes without activity." },
            { TR: "Rahatsız Etmeyin açıkken gelen sesli aramalar çalmaz.", EN: "Incoming voice calls don't ring while Do Not Disturb is on." },
            { TR: "Destek talepleri altı konuda: Şikayet, İstek, Güvenlik Açığı, Ban Kaldırma İsteği, Soru ve Geri Bildirim.", EN: "Support tickets now have six topics: Complaint, Request, Security Vulnerability, Ban Appeal, Question and Feedback." },
            { TR: "Hanogt News'e Ekonomi & Finans kategorisi; döviz, altın, borsa ve Bitcoin şeridi; eski haberleri sınırsız yükleme.", EN: "Hanogt News gets an Economy & Finance category, a currency, gold, stock market and Bitcoin strip, and unlimited older stories." },
            { TR: "Ana sayfada tek tıkla başlama paneli; Hakkımızda canlı rakamlarla yenilendi.", EN: "A one-click launchpad on the home page; the About page now shows live numbers." },
            { TR: "Alt bilgideki dil menüsü artık kesilmiyor; ilk ziyarette dil ülkene göre seçiliyor.", EN: "The footer language menu no longer gets cut off, and your first visit picks a language for your country." },
        ],
    },
    {
        id: "v0.1.2",
        version: "v0.1.2",
        date: "2026-10-01",
        title: { TR: "Hanogt AI, iki adımlı doğrulama ve Yönetici Paneli", EN: "Hanogt AI, two-step verification and the Admin Panel" },
        desc: { TR: "Güvenlik, yapay zekâ ve topluluk güncellemesi: dil modeline dönüşen Hanogt AI, iki adımlı doğrulama, yönetici paneli, yenilenen Gruplar ve 65 dilli kod editörü.", EN: "A security, AI and community update: Hanogt AI powered by a language model, two-step verification, an admin panel, redesigned Groups and a 65-language code editor." },
        items: [
            { TR: "Hanogt AI: Güvenlik Botu sohbeti, platformun bilgi tabanıyla zenginleştirilen ve yanıtı akışla yazan bir dil modeline dönüştü; Genel, Kod ve Güvenlik modları var.", EN: "Hanogt AI: the Security Bot chat became a language model that is grounded in the platform's knowledge base and streams its answers, with General, Code and Security modes." },
            { TR: "Çevrimdışı Hanogt AI Çekirdeği: tarayıcıda çalışan, 41 niyet için eğitilmiş model; giriş yapılmadığında veya dil modeline ulaşılamadığında yanıt verir.", EN: "Offline Hanogt AI Core: a model trained on 41 intents that runs in your browser and answers when you're signed out or the language model can't be reached." },
            { TR: "İki adımlı doğrulama: doğrulayıcı uygulama kodları (TOTP), QR ile kurulum ve tek kullanımlık kurtarma kodları; gizli anahtarlar şifreli saklanır.", EN: "Two-step verification: authenticator app codes (TOTP), QR setup and single-use recovery codes; secrets are stored encrypted." },
            { TR: "Yönetici Paneli: sahip/yönetici/moderatör rolleri, istatistikler, kullanıcı yönetimi, moderasyon, güvenlik olayları, Arcade yönetimi, site duyuruları ve denetim kaydı.", EN: "Admin Panel: owner/admin/moderator roles, statistics, user management, moderation, security events, Arcade management, site announcements and an audit log." },
            { TR: "Gruplar: 6 şablonlu oluşturma sihirbazı, süreli davet bağlantıları, başlangıç kontrol listesi; sohbette sabitleme, tepkiler, @bahsetme ve arama.", EN: "Groups: a creation wizard with 6 templates, expiring invite links and a getting-started checklist; pins, reactions, @mentions and search in chat." },
            { TR: "Kod editörü: 65 dil tek kaynaktan; 8 dil tarayıcıda, 30 dil sunucuda çalışır, HTML/CSS/Markdown canlı önizlenir; komut paleti, şablonlar, ZIP içe/dışa aktarma.", EN: "Code editor: 65 languages from one registry; 8 run in the browser, 30 on the server, and HTML/CSS/Markdown preview live; command palette, templates, ZIP import/export." },
            { TR: "Editör Ayarları baştan yazıldı: canlı önizleme, 10 tema, arama, sıfırlama ve JSON içe/dışa aktarma.", EN: "Editor Settings rebuilt: live preview, 10 themes, search, reset and JSON import/export." },
            { TR: "Güvenlik: Security Bot için ölçümlü değerlendirme, yanlış engellemeler düzeltildi, açıklar kapatıldı ve Firestore kuralları testlerle sıkılaştırıldı.", EN: "Security: measured evaluation for the Security Bot, false blocks fixed, vulnerabilities closed and Firestore rules tightened with tests." },
            { TR: "Arayüz dili sayısı 50'ye çıktı.", EN: "The interface is now available in 50 languages." },
        ],
    },
    {
        id: "v0.1.1",
        version: "v0.1.1",
        date: "2026-09-30",
        title: { TR: "Ayarsız kod çalıştırma ve kalıcı oturum", EN: "Code runs with no setup, and you stay signed in" },
        desc: { TR: "Kod çalıştırma artık sunucu ayarı gerektirmiyor; oturum siz çıkış yapana kadar korunuyor.", EN: "Running code no longer needs any server setup, and your session lasts until you sign out." },
        items: [
            { TR: "JavaScript, TypeScript, Python, SQL ve Lua doğrudan tarayıcıda WebAssembly ile çalışır; giriş gerekmez ve kod sunucuya gönderilmez.", EN: "JavaScript, TypeScript, Python, SQL and Lua run directly in your browser with WebAssembly; no sign-in is needed and the code isn't sent to a server." },
            { TR: "Derlenen diller Hanogt Security Bot taramasından sonra izole uzak derleyicilerde çalışır.", EN: "Compiled languages run on isolated remote compilers after a Hanogt Security Bot scan." },
            { TR: "Editöre Girdi sekmesi eklendi; input(), Scanner, cin gibi okumalar bu alandan beslenir.", EN: "A new Input tab feeds reads such as input(), Scanner and cin." },
            { TR: "Hata mesajları dosya adı ve satır numarasıyla gösterilir.", EN: "Error messages show the file name and line number." },
            { TR: "Oturum 90 gün geçerli ve her ziyarette yenilenir; sayfa yenilenince yeniden giriş istenmez.", EN: "Sessions last 90 days and renew on every visit; reloading the page no longer asks you to sign in again." },
            { TR: "Google ile giriş www ve www'suz adresler arasında korunur; girişten sonra istenen sayfa açılır.", EN: "Google sign-in carries over between the www and non-www addresses, and you land on the page you asked for." },
        ],
    },
    {
        id: "v0.1.0",
        version: "v0.1.0",
        date: "2026-09-28",
        title: { key: "update_v006_title" },
        desc: { key: "update_v006_desc" },
        items: [
            { key: "update_v006_item1" },
            { key: "update_v006_item2" },
            { key: "update_v006_item3" },
            { key: "update_v006_item4" },
            { key: "update_v006_item5" },
            { key: "update_v006_item6" },
            { key: "update_v006_item7" },
            { key: "update_v006_item8" },
            { key: "update_v006_item9" },
        ],
    },
    {
        id: "v0.0.5",
        version: "v0.0.5",
        date: "2026-09-04",
        title: { key: "update_v005_title" },
        desc: { key: "update_v005_desc" },
        items: [
            { key: "update_v005_item1" },
            { key: "update_v005_item2" },
            { key: "update_v005_item3" },
            { key: "update_v005_item4" },
            { key: "update_v005_item5" },
            { key: "update_v005_item6" },
        ],
    },
    {
        id: "v0.0.4",
        version: "v0.0.4",
        date: "2026-09-03",
        title: { key: "update_v004_title" },
        desc: { key: "update_v004_desc" },
        items: [
            { key: "update_v004_item1" },
            { key: "update_v004_item2" },
            { key: "update_v004_item3" },
            { key: "update_v004_item4" },
            { key: "update_v004_item5" },
            { key: "update_v004_item6" },
            { key: "update_v004_item7" },
            { key: "update_v004_item8" },
            { key: "update_v004_item9" },
        ],
    },
    {
        id: "v0.0.3",
        version: "v0.0.3",
        date: "2026-05-19",
        title: { key: "update_v003_title" },
        desc: { key: "update_v003_desc" },
        items: [
            { key: "update_v003_item1" },
            { key: "update_v003_item2" },
            { key: "update_v003_item3" },
            { key: "update_v003_item4" },
            { key: "update_v003_item5" },
            { key: "update_v003_item6" },
            { key: "update_v003_item7" },
        ],
    },
    {
        id: "v0.0.2",
        version: "v0.0.2",
        date: "2026-03-16",
        title: { key: "update_v002_title" },
        desc: { key: "update_v002_desc" },
        items: [
            { key: "update_v002_item1" },
            { key: "update_v002_item2" },
            { key: "update_v002_item3" },
            { key: "update_v002_item4" },
            { key: "update_v002_item5" },
            { key: "update_v002_item6" },
        ],
    },
    {
        id: "v0.0.1",
        version: "v0.0.1",
        date: "2026-03-09",
        title: { key: "update_v001_title" },
        desc: { key: "update_v001_desc" },
        items: [
            { key: "update_v001_item1" },
            { key: "update_v001_item2" },
            { key: "update_v001_item3" },
            { key: "update_v001_item4" },
            { key: "update_v001_item5" },
            { key: "update_v001_item6" },
            { key: "update_v001_item7" },
            { key: "update_v001_item8" },
            { key: "update_v001_item9" },
            { key: "update_v001_item10" },
            { key: "update_v001_item11" },
            { key: "update_v001_item12" },
            { key: "update_v001_item13" },
            { key: "update_v001_item14" },
            { key: "update_v001_item15" },
            { key: "update_v001_item16" },
            { key: "update_v001_item17" },
            { key: "update_v001_item18" },
        ],
    },
];

interface Comment {
    id: string;
    text: string;
    username: string;
    email: string;
    avatarUrl?: string;
    createdAt: Timestamp | Date | string | null;
}

/** Comments predate per-version threads; every version shares this one. */
const COMMENT_THREAD = "v0.0.5";
const EXPANDED_BY_DEFAULT = 2;

export default function ChangelogModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const { t, tx, locale } = useI18n();
    const { data: session } = useSession();
    const [comments, setComments] = useState<Comment[]>([]);
    const [commentsFailed, setCommentsFailed] = useState(false);
    const [newComment, setNewComment] = useState("");
    const [myUsername, setMyUsername] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editText, setEditText] = useState("");
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [showOlder, setShowOlder] = useState(false);

    const text = (entry: EntryText) => ("key" in entry ? t(entry.key) || entry.key : tx(entry));
    const formatDate = (iso: string) => {
        const date = new Date(`${iso}T12:00:00Z`);
        return Number.isNaN(date.getTime()) ? iso : new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(date);
    };

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [isOpen, onClose]);

    useEffect(() => {
        if (!isOpen || !session?.user?.email) return;
        const email = session.user.email;
        const fallback = session.user.name || "";
        getDoc(doc(db, "users", email))
            .then((snap) => setMyUsername(snap.exists() ? snap.data().username || fallback : fallback))
            .catch(() => setMyUsername(fallback));
    }, [isOpen, session]);

    useEffect(() => {
        if (!isOpen || !session?.user) return;
        const q = query(collection(db, "changelog_comments", COMMENT_THREAD, "comments"), orderBy("createdAt", "asc"));
        const unsub = onSnapshot(q, (snap) => {
            setCommentsFailed(false);
            setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() as Omit<Comment, "id"> })));
        }, () => setCommentsFailed(true));
        return () => unsub();
    }, [isOpen, session?.user]);

    const handleSendComment = async () => {
        if (!newComment.trim() || !session?.user?.email) return;
        try {
            await addDoc(collection(db, "changelog_comments", COMMENT_THREAD, "comments"), {
                text: newComment.trim().slice(0, 1000),
                email: session.user.email,
                username: myUsername || session.user.name || "User",
                avatarUrl: session.user.image || "",
                createdAt: serverTimestamp(),
            });
            setNewComment("");
        } catch {
            setCommentsFailed(true);
        }
    };

    const handleDeleteComment = async (commentId: string) => {
        setOpenMenuId(null);
        await deleteDoc(doc(db, "changelog_comments", COMMENT_THREAD, "comments", commentId)).catch(() => setCommentsFailed(true));
    };

    const handleStartEdit = (comment: Comment) => {
        setEditingId(comment.id);
        setEditText(comment.text);
        setOpenMenuId(null);
    };

    const handleSaveEdit = async () => {
        if (!editingId || !editText.trim()) return;
        await updateDoc(doc(db, "changelog_comments", COMMENT_THREAD, "comments", editingId), { text: editText.trim().slice(0, 1000) })
            .catch(() => setCommentsFailed(true));
        setEditingId(null);
        setEditText("");
    };

    if (!isOpen) return null;

    const formatCommentTime = (ts: Comment["createdAt"]) => {
        if (!ts) return "";
        const d = typeof ts === "object" && "toDate" in ts ? ts.toDate() : new Date(ts);
        return d.toLocaleString(locale, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    };

    const visible = showOlder ? UPDATES : UPDATES.slice(0, EXPANDED_BY_DEFAULT);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="changelog-title"
                className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
                    <div className="flex min-w-0 items-center gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/25"><Sparkles className="h-5 w-5" aria-hidden="true" /></span>
                        <div className="min-w-0">
                            <h2 id="changelog-title" className="truncate text-lg font-bold text-zinc-900 dark:text-white">{t("changelog_log_title") || tx({ TR: "Güncellemeler/İyileştirmeler Günlüğü", EN: "Updates & Improvements Log" })}</h2>
                            <p className="text-[12px] text-zinc-500">{tx({ TR: "Son sürüm: {version}", EN: "Latest version: {version}" }, { version: UPDATES[0].version })}</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} autoFocus aria-label={tx({ TR: "Kapat", EN: "Close" })} className="rounded-lg p-1.5 transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-zinc-800">
                        <X className="h-5 w-5 text-zinc-500" />
                    </button>
                </div>

                <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
                    {visible.map((upd, index) => (
                        <article key={upd.id} className={`rounded-2xl border p-4 ${index === 0 ? "border-indigo-200 bg-indigo-50/60 dark:border-indigo-500/30 dark:bg-indigo-500/[0.07]" : "border-zinc-200 dark:border-zinc-800"}`}>
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <h3 className="font-mono text-lg font-black text-zinc-900 dark:text-white">{upd.version}</h3>
                                    {index === 0 ? <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-white">{tx({ TR: "En yeni", EN: "Latest" })}</span> : null}
                                </div>
                                <time dateTime={upd.date} className="text-[12.5px] text-zinc-500">{formatDate(upd.date)}</time>
                            </div>
                            <p className="mb-1 text-[14.5px] font-bold text-indigo-700 dark:text-indigo-300">{text(upd.title)}</p>
                            <p className="mb-3 text-sm text-zinc-700 dark:text-zinc-300">{text(upd.desc)}</p>
                            <ul className="space-y-1.5">
                                {upd.items.map((item, i) => (
                                    <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
                                        <span>{text(item)}</span>
                                    </li>
                                ))}
                            </ul>
                        </article>
                    ))}

                    {UPDATES.length > EXPANDED_BY_DEFAULT ? (
                        <button type="button" onClick={() => setShowOlder((value) => !value)} aria-expanded={showOlder} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-zinc-300 py-2.5 text-[13px] font-semibold text-zinc-600 transition hover:border-indigo-400 hover:text-indigo-600 dark:border-zinc-700 dark:text-zinc-400 dark:hover:text-indigo-300">
                            <ChevronDown className={`h-4 w-4 transition ${showOlder ? "rotate-180" : ""}`} aria-hidden="true" />
                            {showOlder
                                ? tx({ TR: "Eski sürümleri gizle", EN: "Hide older versions" })
                                : tx({ TR: "Eski sürümleri göster ({count})", EN: "Show older versions ({count})" }, { count: UPDATES.length - EXPANDED_BY_DEFAULT })}
                        </button>
                    ) : null}

                    <div className="border-t border-zinc-200 dark:border-zinc-700" />

                    <div>
                        <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-600 dark:text-zinc-400">
                            <MessageSquare className="h-4 w-4" />
                            {tx({ TR: "Yorumlar ({count})", EN: "Comments ({count})" }, { count: comments.length })}
                        </h4>
                        {!session?.user ? (
                            <p className="py-3 text-center text-xs text-zinc-400">{tx({ TR: "Yorumları görmek ve yazmak için giriş yapın.", EN: "Sign in to read and write comments." })}</p>
                        ) : commentsFailed ? (
                            <p className="py-3 text-center text-xs text-amber-600 dark:text-amber-400">{tx({ TR: "Yorumlar şu anda yüklenemiyor. Biraz sonra tekrar deneyin.", EN: "Comments can't be loaded right now. Try again in a moment." })}</p>
                        ) : null}
                        <div className="max-h-64 space-y-2 overflow-y-auto">
                            {session?.user && !commentsFailed && comments.length === 0 && (
                                <p className="py-3 text-center text-xs text-zinc-400">{tx({ TR: "Henüz yorum yok. İlk yorumu siz yazın.", EN: "No comments yet. Be the first to write one." })}</p>
                            )}
                            {comments.map((c) => (
                                <div key={c.id} className="group relative flex items-start gap-2 rounded-lg bg-zinc-50 p-2.5 dark:bg-zinc-800/60">
                                    {c.avatarUrl ? (
                                        <OptimizedImage src={c.avatarUrl} alt="" className="h-7 w-7 flex-shrink-0 rounded-full object-cover" referrerPolicy="no-referrer" />
                                    ) : (
                                        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white">{c.username?.charAt(0)}</div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{c.username}</span>
                                            <span className="text-[10px] text-zinc-400">{formatCommentTime(c.createdAt)}</span>
                                        </div>
                                        {editingId === c.id ? (
                                            <div className="mt-1 flex items-center gap-1">
                                                <input
                                                    type="text"
                                                    value={editText}
                                                    maxLength={1000}
                                                    onChange={(e) => setEditText(e.target.value)}
                                                    onKeyDown={(e) => e.key === "Enter" && handleSaveEdit()}
                                                    aria-label={tx({ TR: "Yorumu düzenle", EN: "Edit comment" })}
                                                    className="flex-1 rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white"
                                                    autoFocus
                                                />
                                                <button type="button" onClick={handleSaveEdit} className="text-[10px] font-semibold text-blue-500 hover:text-blue-600">{tx({ TR: "Kaydet", EN: "Save" })}</button>
                                                <button type="button" onClick={() => setEditingId(null)} className="text-[10px] text-zinc-400 hover:text-zinc-600">{tx({ TR: "İptal", EN: "Cancel" })}</button>
                                            </div>
                                        ) : (
                                            <p className="break-words text-xs text-zinc-600 dark:text-zinc-400">{c.text}</p>
                                        )}
                                    </div>
                                    {session?.user?.email === c.email && editingId !== c.id && (
                                        <div className="relative">
                                            <button
                                                type="button"
                                                onClick={() => setOpenMenuId(openMenuId === c.id ? null : c.id)}
                                                aria-label={tx({ TR: "Yorum işlemleri", EN: "Comment actions" })}
                                                className="rounded p-1 opacity-0 transition-opacity hover:bg-zinc-200 focus-visible:opacity-100 group-hover:opacity-100 dark:hover:bg-zinc-700"
                                            >
                                                <MoreVertical className="h-3.5 w-3.5 text-zinc-400" />
                                            </button>
                                            {openMenuId === c.id && (
                                                <div className="absolute end-0 top-full z-10 mt-1 w-28 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-800">
                                                    <button type="button" onClick={() => handleStartEdit(c)} className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700">
                                                        <Pencil className="h-3 w-3" /> {tx({ TR: "Düzenle", EN: "Edit" })}
                                                    </button>
                                                    <button type="button" onClick={() => handleDeleteComment(c.id)} className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                                                        <Trash2 className="h-3 w-3" /> {tx({ TR: "Sil", EN: "Delete" })}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {session?.user && (
                            <div className="mt-3 flex items-center gap-2">
                                <input
                                    type="text"
                                    value={newComment}
                                    maxLength={1000}
                                    onChange={(e) => setNewComment(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handleSendComment()}
                                    placeholder={tx({ TR: "Yorum yaz…", EN: "Write a comment…" })}
                                    aria-label={tx({ TR: "Yorum yaz", EN: "Write a comment" })}
                                    className="flex-1 rounded-lg border border-zinc-200 bg-zinc-100 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                                />
                                <button type="button" onClick={handleSendComment} aria-label={tx({ TR: "Gönder", EN: "Send" })} className="rounded-lg bg-blue-600 p-2 text-white transition-colors hover:bg-blue-700 disabled:opacity-40" disabled={!newComment.trim()}>
                                    <Send className="h-4 w-4" />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
