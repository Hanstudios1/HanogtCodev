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
        id: "v0.3.32",
        version: "v0.3.32",
        date: "2026-10-07",
        title: { TR: "Ücretli planlara yeni avantajlar, yeni Hesap Ayarları", EN: "New paid-plan benefits, new Account Settings" },
        desc: { TR: "Plus ve Pro daha büyük kod çalıştırmaları, daha uzun mesajlar ve yapay zekâ yanıtları, daha uzun ekip oturumları ve rozetsiz oyun dışa aktarma getiriyor; Ücretsiz plan değişmedi. Hesap Ayarları baştan tasarlandı.", EN: "Plus and Pro bring bigger code runs, longer messages and AI answers, longer team sessions and badge-free game exports; the Free plan is unchanged. Account Settings were redesigned." },
        items: [
            { TR: "Sunucuda daha büyük çalıştırmalar: dosya başına Plus'ta 100.000, Pro'da 200.000 karakter kod; daha uzun girdi ve çıktı.", EN: "Bigger runs on the server: 100,000 characters of code per file on Plus and 200,000 on Pro, with longer input and output." },
            { TR: "Hanogt Social'da Plus ile 6.000, Pro ile 8.000 karakterlik mesajlar; gruplarda Hanogt AI'dan daha uzun yanıtlar.", EN: "Messages of up to 6,000 characters on Plus and 8,000 on Pro in Hanogt Social, and longer Hanogt AI answers in groups." },
            { TR: "Ekiple düzenleme oturumları Plus'ta 24 saat ve 40 dosya, Pro'da 48 saat ve 100 dosya.", EN: "Team editing sessions last 24 hours with 40 files on Plus and 48 hours with 100 files on Pro." },
            { TR: "Plus ve Pro'da oyunları “Hanogt Engine ile yapıldı” rozeti olmadan dışa aktarma.", EN: "Export games without the “Made with Hanogt Engine” badge on Plus and Pro." },
            { TR: "Yeni Hesap Ayarları: aramalı yan menü, hesap özeti, aynı düzende bölümler, tek kaydetme çubuğu; telefonda kategori listesi.", EN: "New Account Settings: a side menu with search, an account overview, sections with one layout and a single save bar; a category list on phones." },
            { TR: "Hiçbir şey yapmayan tercihler kaldırıldı; kayıtlı değerleri bir sonraki kayıtta silinir.", EN: "Preferences that did nothing were removed; their stored values are deleted on the next save." },
            { TR: "Gizlilik Politikası ve Kullanım Şartları 5.8.", EN: "Privacy Policy and Terms of Use 5.8." },
        ],
    },
    {
        id: "v0.3.31",
        version: "v0.3.31",
        date: "2026-10-06",
        title: { TR: "Grup kuralları ve yeni Hanogt AI ayarları", EN: "Group rules and new Hanogt AI settings" },
        desc: { TR: "Hanogt Social gruplarında Discord'daki gibi bir kurallar bölümü var; Hanogt AI ayarları arama, özet, yaratıcılık, gizli sohbet ve bildirimle yenilendi.", EN: "Hanogt Social groups have a rules section like Discord's; the Hanogt AI settings were renewed with search, a summary, creativity, private chats and notifications." },
        items: [
            { TR: "Gruplarda madde madde kurallar: kenar çubuğunda “kurallar”, ayarlarda kural düzenleyici; şablonlar artık kural dosyası oluşturmaz.", EN: "Point-by-point rules in groups: “rules” in the sidebar and a rules editor in the settings; templates no longer create a rules file." },
            { TR: "Grup isterse üyeler yazmadan ve sesli kanala katılmadan önce kuralları kabul eder; katılırken de kabul edilebilir.", EN: "If the group asks, members accept the rules before posting or joining the voice channel; they can also accept while joining." },
            { TR: "Hanogt AI ayarlarında yan menü, arama, özet, bölüm bölüm sıfırlama ve ayarları dışa/içe aktarma.", EN: "A side menu, search, a summary, per-section reset and settings export/import in the Hanogt AI settings." },
            { TR: "Yaratıcılık ayarı (Hassas, Dengeli, Yaratıcı), hiçbir yerde saklanmayan gizli sohbetler ve yanıt hazır bildirimi.", EN: "A creativity setting (Precise, Balanced, Creative), private chats that are never stored and an answer-ready notification." },
            { TR: "Gizlilik Politikası ve Kullanım Şartları 5.7.", EN: "Privacy Policy and Terms of Use 5.7." },
        ],
    },
    {
        id: "v0.3.30",
        version: "v0.3.30",
        date: "2026-10-06",
        title: { TR: "Hanogt News son 24 saat, üstte her zaman Panel", EN: "Hanogt News keeps 24 hours, Panel always on top" },
        desc: { TR: "Haberler artık son 24 saati kapsıyor ve eski haberler siliniyor; üst menü Panel'i hiç gizlemiyor; geri bildirim panosunda sabitlemeyi yalnızca yöneticiler yapıyor.", EN: "News now covers the last 24 hours and older stories are deleted; the top bar never hides the Panel; only admins pin on the feedback board." },
        items: [
            { TR: "Hanogt News yalnızca son 24 saatin haberlerini gösterir; bir günden eski haberler ve yorumları kendiliğinden silinir.", EN: "Hanogt News shows only the last 24 hours; stories older than a day and their comments are deleted automatically." },
            { TR: "Üst menüde sığmayan bağlantılar “Daha fazla” listesine geçer; giriş yapınca Panel her zaman görünür, telefonda da.", EN: "Links that don't fit in the top bar move into “More”; once you're signed in the Panel is always visible, on phones too." },
            { TR: "Geri Bildirim / SSS panosunda gönderileri ve yorumları yalnızca yöneticiler sabitleyebilir; sabitlenenler en üstte durur.", EN: "On the Feedback / FAQ board only admins can pin posts and comments; pinned ones stay on top." },
            { TR: "Yönetici Paneli'nde depolama kartı: koleksiyon boyutları ve tek tıkla eski haber temizliği.", EN: "A storage card in the Admin Panel: collection sizes and old-news cleanup in one click." },
            { TR: "“Hanogt Ekibi” ve ilgili metinler 48 dile çevrildi.", EN: "“Hanogt Team” and related text translated into 48 languages." },
            { TR: "Gizlilik Politikası 5.6.", EN: "Privacy Policy 5.6." },
        ],
    },
    {
        id: "v0.3.29",
        version: "v0.3.29",
        date: "2026-10-06",
        title: { TR: "Yönetici Paneli yenilendi", EN: "A renewed Admin Panel" },
        desc: { TR: "Ekibin paneli yeni bir görünüm, grafikler ve Hanogt Social ile Hanogt AI için özet sayfaları aldı; listeler sayfa sayfa yükleniyor ve birçok hata düzeltildi.", EN: "The team's panel has a new look, charts and summary pages for Hanogt Social and Hanogt AI; lists load page by page and many bugs are fixed." },
        items: [
            { TR: "Ürün logolu kenar çubuğu ve bekleyen işler için canlı rozetler; bölüm, sekme ve filtreler adreste kalır.", EN: "A sidebar with product logos and live badges for waiting work; sections, tabs and filters stay in the address." },
            { TR: "Genel bakışta grafikler: kayıtlar, Hanogt AI mesajları, güvenlik olayları ve AutoMod; 7, 30 ve 90 gün.", EN: "Charts on the overview: sign-ups, Hanogt AI messages, security events and AutoMod; 7, 30 and 90 days." },
            { TR: "Hanogt Social ve Hanogt AI sayfaları: yalnızca toplamlar, kimseyi göstermeden.", EN: "Hanogt Social and Hanogt AI pages: totals only, without showing anyone." },
            { TR: "Her listede “Daha fazla yükle” ve “Yenile”; aramalar eski kayıtlarda da bulur.", EN: "“Load more” and “Refresh” in every list; searches find older records too." },
            { TR: "Onay pencereleri, kupon tarihi, kişi araması ve duyuru sınırı gibi hatalar düzeltildi.", EN: "Fixes for confirmations, coupon dates, people search, the announcement limit and more." },
            { TR: "Gizlilik Politikası 5.5.", EN: "Privacy Policy 5.5." },
        ],
    },
    {
        id: "v0.3.28",
        version: "v0.3.28",
        date: "2026-10-06",
        title: { TR: "Hanogt Social: ekran paylaşımı, sesli kanallar ve dosyalar", EN: "Hanogt Social: screen sharing, voice channels and files" },
        desc: { TR: "Aramalar büyük görünümde açılıyor ve ekranını paylaşabiliyorsun; her grubun 5 kişilik bir sesli kanalı var; mesajlarla dosya gönderebiliyorsun.", EN: "Calls open in a full view and you can share your screen; every group has a voice channel for 5 people; and you can send files in messages." },
        items: [
            { TR: "Büyük arama görünümü: konuşma halkaları, tam ekran ve tüm denetimler; küçültünce arama sürer.", EN: "Full call view: speaking rings, full screen and every control; the call goes on when you minimize it." },
            { TR: "Ekran paylaşımı: birebir aramada bir ekran, pencere ya da sekme paylaş; karşı taraf tam ekranda ya da pencere içinde pencere izler.", EN: "Screen sharing: share a screen, window or tab in a one-to-one call; the other person watches full screen or picture in picture." },
            { TR: "Grupların sesli kanalı: tek tıkla katıl, en fazla 5 kişi; sitede gezinirken ses çubuğundan mikrofonu ve sesi yönet.", EN: "Groups' voice channel: join with one click, up to 5 people; manage your microphone and sound from the voice bar while you browse." },
            { TR: "Mesajlarda dosyalar: görsel, video, ses, PDF, arşiv ve kod dosyası gönder; ataç, yapıştırma ya da sürükle-bırak ile.", EN: "Files in messages: send pictures, video, sound, PDFs, archives and code files with the paperclip, a paste or drag and drop." },
            { TR: "Dosya sınırları planına göre: dosya başına 2 / 4 / 4 MB, toplam 25 MB / 250 MB / 1 GB; görsellerdeki konum bilgisi silinir.", EN: "File limits by plan: 2 / 4 / 4 MB per file, 25 MB / 250 MB / 1 GB in all; location details are removed from pictures." },
            { TR: "Gizlilik Politikası, KVKK Aydınlatma Metni ve Kullanım Şartları 5.4.", EN: "Privacy Policy, KVKK Information Notice and Terms of Use 5.4." },
        ],
    },
    {
        id: "v0.3.27",
        version: "v0.3.27",
        date: "2026-10-06",
        title: { TR: "Hanogt Engine V5", EN: "Hanogt Engine V5" },
        desc: { TR: "Motorun yeni sürümü: Animator durum makinesi, Arcade'de skor tabloları ve başarımlar, oyun içi çeviri, yerel çok oyunculu, SaveSystem, GLB 3D modeller, yeni ekran efektleri ve oyunu kendi sitende yayınlamak için web paketi. Üç yeni şablon da hazır.", EN: "A new version of the engine: the Animator state machine, leaderboards and achievements on the Arcade, in-game translations, local multiplayer, SaveSystem, GLB 3D models, new screen effects and a web package for hosting games on your own site. Three new templates are ready too." },
        items: [
            { TR: "Animator: durumlar, parametreler ve geçişlerle karakter animasyonu; grafik oyun çalışırken geçerli durumu canlı gösterir.", EN: "Animator: character animation with states, parameters and transitions; the graph shows the current state live while the game runs." },
            { TR: "Skor tabloları ve başarımlar: Leaderboard.Submit ve Achievements.Unlock ile Arcade'de en iyi skorlar; sunucu sınırları ve en kısa oynama süresini denetler.", EN: "Leaderboards and achievements: best scores on the Arcade with Leaderboard.Submit and Achievements.Unlock; the server checks bounds and the minimum play time." },
            { TR: "Oyunun dilleri: dil tablosu, Localization.Get ve CSV ile çeviri; oyun oyuncunun dilinde açılır.", EN: "Game languages: a string table, Localization.Get and CSV for translators; games open in the player's language." },
            { TR: "Yerel çok oyunculu: Player Input ile aynı ekranda dört oyuncuya kadar; SaveSystem ile kayıt yuvaları.", EN: "Local multiplayer: up to four players on one screen with Player Input; save slots with SaveSystem." },
            { TR: "GLB 3D modeller; renk düzenleme, kromatik sapma, pikselleştirme ve CRT ekran efektleri.", EN: "GLB 3D models; color grading, chromatic aberration, pixelation and CRT screen effects." },
            { TR: "Web paketi (ZIP · PWA): oyununu kendi sitende yayınla; uygulama olarak yüklenir, çevrim dışı da oynanır.", EN: "Web package (ZIP · PWA): host your game on your own site; it installs as an app and plays offline." },
            { TR: "Yeni şablonlar: Yıldız Düellosu (iki kişilik), Zindan Kaçışı ve Meteor Yağmuru. Gizlilik Politikası ve Kullanım Şartları 5.3.", EN: "New templates: Star Duel (two players), Dungeon Escape and Meteor Storm. Privacy Policy and Terms of Use 5.3." },
        ],
    },
    {
        id: "v0.3.26",
        version: "v0.3.26",
        date: "2026-10-06",
        title: { TR: "Hanogt Engine V4", EN: "Hanogt Engine V4" },
        desc: { TR: "Motorun yeni sürümü: gamepad, hazır platform karakteri, kamera takibi, yol bulma, eklemler, yeni arayüz kontrolleri, ses dosyaları ve müzik, çoklu seçim ve İzle paneli. Üç yeni şablon da hazır.", EN: "A new version of the engine: gamepads, a ready-made platformer character, camera follow, path finding, joints, new UI controls, audio files and music, multi-select and the Watch panel. Three new templates are ready too." },
        items: [
            { TR: "Giriş eylemleri: Zıpla, Ateş et gibi eylemleri klavyeye, fareye ve gamepad'e bağla; Input.GetButton ve GetAxis hepsini okur.", EN: "Input actions: bind actions such as Jump and Fire to the keyboard, the mouse and gamepads; Input.GetButton and GetAxis read them all." },
            { TR: "Character Controller 2D ile kod yazmadan çift zıplama, coyote süresi ve eğimler; Camera Follow ve Camera.Shake ile akıcı kamera.", EN: "Double jumps, coyote time and slopes without code with Character Controller 2D; a smooth camera with Camera Follow and Camera.Shake." },
            { TR: "Nav Agent 2D düşmanları duvarların etrafından kovalatır; Distance ve Spring eklemleriyle sarkaç, ip ve sapan yap.", EN: "Nav Agent 2D sends enemies after you around walls; build pendulums, ropes and slingshots with Distance and Spring joints." },
            { TR: "Slider, Toggle ve Input Field ile ayar menüleri ve rekor tabloları; WAV, MP3 ve OGG dosyalarıyla ses ve müzik (Ücretsiz 5 MB, Plus 25 MB, Pro 100 MB).", EN: "Settings menus and high score tables with Slider, Toggle and Input Field; sound and music from WAV, MP3 and OGG files (Free 5 MB, Plus 25 MB, Pro 100 MB)." },
            { TR: "Editörde çoklu seçim ve kutu seçimi, hiyerarşide t:Tür araması ve değerleri canlı gösteren İzle paneli.", EN: "Multi-select and box selection in the editor, t:Type search in the hierarchy and the Watch panel that shows values live." },
            { TR: "Yeni şablonlar: Gök Kulesi, Labirent Avı ve Sapan Ustası.", EN: "New templates: Sky Tower, Maze Hunt and Slingshot Master." },
        ],
    },
    {
        id: "v0.3.25",
        version: "v0.3.25",
        date: "2026-10-06",
        title: { TR: "Hanogt Engine'de sekiz yeni oyun", EN: "Eight new games in Hanogt Engine" },
        desc: { TR: "Engine'in tanıtım sayfası baştan tasarlandı: gerçek motorda çalışan canlı demo, filtreli şablon galerisi ve oynanabilir önizlemeler. Sekiz yeni şablon da hazır.", EN: "Engine's home page was redesigned: a live demo running in the real engine, a template gallery with filters and playable previews. Eight new templates are ready too." },
        items: [
            { TR: "Yeni şablonlar: Neon Koşu, Kanat Çırp, Pong, Yılan (C++), Küçük Macera (RPG), Engel Parkuru (3D), Kale Savunması ve Neon Arena (C++).", EN: "New templates: Neon Run, Flap, Pong, Snake (C++), Little Adventure (RPG), Obstacle Course (3D), Castle Defense and Neon Arena (C++)." },
            { TR: "Tanıtım sayfasında canlı demo: dört oyun gerçek motorda dönüyor; \"Kontrolü al\" ile hemen oyna.", EN: "A live demo on the home page: four games take turns in the real engine; press \"Take control\" to play right away." },
            { TR: "Şablon galerisi: 2D/3D, C#/C++, zorluk ve \"Yeniler\" filtreleri; her kartta oyunun ilk karesi.", EN: "Template gallery: 2D/3D, C#/C++, difficulty and \"New\" filters; every card shows the game's first frame." },
            { TR: "Ayrıntı çekmecesi: oyunu oyna, kontrolleri, kullanılan bileşenleri ve kodun başını gör, sonra tek tıkla başla.", EN: "Details drawer: play the game, see its controls, the components it uses and the start of its code, then start with one click." },
            { TR: "Unity'ye daha yakın betikler: yok edilen betikler null ile eşit, başka betikten çağrılan metodun Timer ve Tween'leri o betiğe ait.", EN: "Scripts closer to Unity: destroyed scripts equal null, and Timers and Tweens started by a method another script calls belong to that method's script." },
        ],
    },
    {
        id: "v0.3.24",
        version: "v0.3.24",
        date: "2026-10-06",
        title: { TR: "Daha dolu abonelikler", EN: "Plans with more in them" },
        desc: { TR: "Kendi API anahtarınla gönderdiğin mesajlar artık Hanogt AI hakkından düşüyor; planlara kod çalıştırma, daha büyük gruplar ve daha çok yıldızlı mesaj eklendi.", EN: "Messages through your own API key now use your Hanogt AI allowance; plans gain more files per run, bigger groups and more starred messages." },
        items: [
            { TR: "Kendi API anahtarınla bağlantıların ayrı bir günlük sınırı kalmadı: mesajlar Hanogt AI hakkından düşüyor, sağlayıcı yanıt vermezse geri ekleniyor.", EN: "Connections with your own API key no longer have a separate daily limit: messages use your Hanogt AI allowance and come back if the provider doesn't answer." },
            { TR: "Kod editöründe tek seferde Ücretsiz'de 8, Plus'ta 25, Pro'da 75 dosya çalıştırabilirsin; sonuçlar geldikçe görünür.", EN: "Run 8 files at once on Free, 25 on Plus and 75 on Pro in the code editor; results show up as they arrive." },
            { TR: "Grupların sahibinin planıyla büyüyor: 25, 100 ya da 250 üye; daha çok sabitlenmiş mesaj, özel bot komutu ve AutoMod yasaklı kelimesi.", EN: "Groups grow with their owner's plan: 25, 100 or 250 members, with more pinned messages, custom bot commands and AutoMod banned words." },
            { TR: "Yıldızlı mesajlar: Ücretsiz'de 200, Plus'ta 500, Pro'da 1.000.", EN: "Starred messages: 200 on Free, 500 on Plus and 1,000 on Pro." },
            { TR: "Fiyatlandırma sayfasında yeni avantajlar ve bölümlere ayrılmış karşılaştırma tablosu; Kullanım Şartları ve Gizlilik Politikası 5.1.", EN: "New benefits and a comparison table in sections on the Pricing page; Terms of Use and Privacy Policy 5.1." },
        ],
    },
    {
        id: "v0.3.23",
        version: "v0.3.23",
        date: "2026-10-06",
        title: { TR: "Mor, pembe ve sarı", EN: "Purple, pink and yellow" },
        desc: { TR: "Yazılar yeniden mordan pembeye ve sarıya akıyor; ızgara süsü geri geldi ve ana sayfadaki \"Tek hesap, hepsi bir arada\" bölümü baştan tasarlandı.", EN: "Text flows from purple to pink and yellow again, the grid is back and the home page's \"One account, all of it\" section was redesigned." },
        items: [
            { TR: "Başlıklar ve vurgular mordan pembeye, sonra sarıya geçiyor; ana sayfadaki mini oyun da bu renklerde.", EN: "Headings and highlights go from purple to pink, then yellow; the mini game on the home page uses these colors too." },
            { TR: "Sayfaların üstündeki ızgara geri geldi: yavaşça kayıyor ve farenin çevresinde renkleniyor.", EN: "The grid at the top of pages is back: it drifts slowly and lights up around your pointer." },
            { TR: "\"Tek hesap, hepsi bir arada\": hesabının çevresindeki sekiz ürün, kendi kendine ilerleyen ürün gezgini, önizlemeler ve ürünlerin birlikte çalıştığı akışlar.", EN: "\"One account, all of it\": the eight products around your account, a product explorer that moves on by itself, previews and the ways the products work together." },
            { TR: "Daha çok animasyon: ilerleme çubuğu, butonlarda ışık, menüde renkli alt çizgi. \"Animasyonları azalt\" açıkken hepsi durur.", EN: "More animation: a progress bar, light sweeping over buttons and a colored underline in the menu. All of it stops while \"Reduce animations\" is on." },
        ],
    },
    {
        id: "v0.3.22",
        version: "v0.3.22",
        date: "2026-10-05",
        title: { TR: "Hanogt Social'da botlar, GIF'ler ve AutoMod", EN: "Bots, GIFs and AutoMod in Hanogt Social" },
        desc: { TR: "Mesajlaşma baştan yenilendi: Markdown, GIF, emoji, eğik çizgi komutları, Hanogt AI ve Hanogt Security Bot gruplarda, AutoMod ve yeni Hanogt Social ayarları.", EN: "Messaging was redone: Markdown, GIFs, emoji, slash commands, Hanogt AI and Hanogt Security Bot in groups, AutoMod and new Hanogt Social settings." },
        items: [
            { TR: "Yeni yazma kutusu: @ ile kişi, # ile kanal, / ile komut önerileri; emoji seçici ve GIF arama (KLIPY ya da GIPHY). Mesajın gönderilirken hemen görünüyor.", EN: "A new message box: suggestions for people with @, channels with # and commands with /; an emoji picker and GIF search (KLIPY or GIPHY). Your message shows up as soon as you send it." },
            { TR: "Mesajlar: Markdown ve kopyalanabilir kod blokları, spoiler, yanıt önizlemesi, birebir sohbetlerde tepkiler, iletme, yıldızlama ve sabitleme; yıldızlı mesajların sol menüde.", EN: "Messages: Markdown and code blocks you can copy, spoilers, reply previews, reactions in one-to-one chats, forwarding, starring and pinning; your starred messages are in the side menu." },
            { TR: "Gruplarda Hanogt AI: /ai ya da @Hanogt AI ile sor; kanalın son mesajlarını okuyup grupta yanıtlıyor ve senin mesaj hakkından düşüyor. Grup yöneticileri kapatabilir.", EN: "Hanogt AI in groups: ask with /ai or @Hanogt AI; it reads the channel's latest messages, answers in the group and uses your message allowance. Group admins can switch it off." },
            { TR: "Hanogt Security Bot her grupta: /uyar, /sustur, /at, /yasakla, /temizle, /yavasmod, /kurallar, /uyarilar ve /rapor. Yeni moderatör rolü, özel komutlar ve karşılama mesajı.", EN: "Hanogt Security Bot in every group: /warn, /mute, /kick, /ban, /purge, /slowmode, /rules, /warnings and /report. A new moderator role, custom commands and a welcome message." },
            { TR: "AutoMod: küfür, argo, yasaklı kelimeler, spam, bahsetme yağmuru, bağlantılar, büyük harf ve kişisel veri kuralları; mesaj gönderilmeden durduruluyor, istenirse uyarı ve otomatik susturma.", EN: "AutoMod: rules for profanity, slang, banned words, spam, mention floods, links, capitals and personal data; messages are stopped before they are sent, with optional warnings and automatic mutes." },
            { TR: "Hanogt Social ayarları: Ses ve Görüntü, Mesajlar, Bildirimler, Gizlilik, Güvenlik ve Botlar. Okundu bilgisi, yazıyor göstergesi, Enter ile gönderme, yazı boyutu, arka plan ve GIF oynatma artık gerçekten uygulanıyor; bahsetme ve cevapsız arama bildirimleri eklendi.", EN: "Hanogt Social settings: Voice & Video, Messages, Notifications, Privacy, Safety and Bots. Read receipts, the typing indicator, Enter to send, font size, background and GIF playback now really apply, and mention and missed call notifications were added." },
            { TR: "Silinen bir mesajın alıntısı yanıtlardan, kopyası yıldızlardan da kalkıyor; sorumluluk reddi Social ayarlarında, grup oluştururken ve ilk açılışta.", EN: "A deleted message's quote disappears from replies and its copy from stars too; the disclaimer is in the Social settings, when you create a group and on first use." },
            { TR: "Gizlilik Politikası, KVKK Aydınlatma Metni ve Kullanım Şartları 5.0.", EN: "Privacy Policy, KVKK Information Notice and Terms of Use 5.0." },
        ],
    },
    {
        id: "v0.3.21",
        version: "v0.3.21",
        date: "2026-10-05",
        title: { TR: "Yeni Hanogt AI ve renkli bir site", EN: "A new Hanogt AI and a colourful site" },
        desc: { TR: "Hanogt AI kâğıt gibi sade bir arayüze, görevlere ve \"Editöre uygula\" düğmesine kavuştu; mor-mavi-sarı yazılar ve canlı animasyonlar geri geldi.", EN: "Hanogt AI got a calm, paper-like interface, tasks and an \"Apply to editor\" button; the purple-blue-yellow text and lively animations are back." },
        items: [
            { TR: "Hanogt AI: serif selamlama, baloncuksuz yanıtlar, Sohbetler ve Görevler sekmeleri, Çalışma adımları ve kodundaki değişikliği satır satır gösteren Değişiklikler kartı; tek tuşla editöre uygula, Ctrl+Z ile geri al.", EN: "Hanogt AI: a serif greeting, answers without bubbles, Chats and Tasks tabs, Work steps and a Changes card showing your code's changes line by line; apply them to the editor with one button and undo with Ctrl+Z." },
            { TR: "Hanogt AI ayarları: uzmanlık düzeyin, kod yorumlarının dili, kod stilin, sevdiğin diller, tam dosya ya da yalnızca fark, gönderme kısayolu, yanıt sesi ve hızı, sohbetlerin ne kadar saklanacağı.", EN: "Hanogt AI settings: your experience level, the language of code comments, your code style, your favourite languages, the whole file or just the diff, the send shortcut, the answer voice and speed, and how long chats are kept." },
            { TR: "Sitede mor-mavi-sarı geçişli yazılar ve daha canlı bir ana sayfa: kayan başlık, kaydırınca beliren ürünler, imlece eğilen önizlemeler.", EN: "Purple-blue-yellow text across the site and a livelier home page: a sliding headline, products that appear as you scroll and previews that lean toward your pointer." },
            { TR: "Hesap Ayarları: güvenlik özeti, son 10 girişin (cihaz ve ülke), şifre eklenince kendini yenileyen iki adımlı doğrulama; \"Animasyonları azalt\" ve \"Yüksek kontrast\" artık her sayfada çalışıyor.", EN: "Account Settings: a security summary, your last 10 sign-ins (device and country), two-step verification that refreshes when you add a password; \"Reduce animations\" and \"High contrast\" now work on every page." },
            { TR: "Editör ayarları: kaydederken biçimlendir, kaydedince çalıştır, dile göre sekme boyutu, yeni çalışma alanının dili, konsol yazı boyutu, görünmez karakter uyarısı ve daha fazlası.", EN: "Editor settings: format on save, run on save, tab size per language, the language of a new workspace, the console font size, warnings for invisible characters and more." },
            { TR: "Düzeltmeler: koyu tema her sayfada yeniden doğru açılıyor; kullanım sayacındaki \"Tüm plan hakların\" bağlantısı Fiyatlandırma'daki kullanım panelini açıyor.", EN: "Fixes: the dark theme opens correctly on every page again, and \"All your plan benefits\" on the usage meter opens the usage panel on Pricing." },
            { TR: "Gizlilik Politikası ve KVKK Aydınlatma Metni 4.9.", EN: "Privacy Policy and KVKK Information Notice 4.9." },
        ],
    },
    {
        id: "v0.3.20",
        version: "v0.3.20",
        date: "2026-10-05",
        title: { TR: "Yeni logolar, yeni sayfalar", EN: "New logos, new pages" },
        desc: { TR: "Hanogt'un ürünleri kendi logolarına kavuştu; ana sayfa, fiyatlandırma ve Security sayfası yenilendi.", EN: "Hanogt's products got their own logos, and the home page, pricing and the Security page were redone." },
        items: [
            { TR: "Hanogt AI, Engine, Security, News ve Social yeni logolarıyla; site ve uygulama simgeleri de yenilendi.", EN: "Hanogt AI, Engine, Security, News and Social have their new logos, and the site and app icons are new too." },
            { TR: "Ana sayfa: \"Hanogt'ta neler var\" bölümü gerçek önizlemelerle, kod örneği artık düz C#. Mini oyunda çift zıplama, kalkan, mıknatıs, seri çarpanı ve en iyi skor var.", EN: "Home page: \"What's on Hanogt\" with real previews, and the code sample is plain C# now. The mini game has a double jump, a shield, a magnet, a streak multiplier and a best score." },
            { TR: "\"Uygulamayı indir\" menüsü düzeldi: cihazın öne çıkıyor, telefonda alttan açılıyor; iPhone ve iPad'de ana ekrana ekleme adımları var.", EN: "The \"Download the app\" menu is fixed: your device comes first, it opens from the bottom on phones, and iPhone and iPad get the Add to Home Screen steps." },
            { TR: "Fiyatlandırma: sade kartlar ve planları karşılaştırma tablosu; kullanımın kartların altındaki açılır panelde.", EN: "Pricing: simpler cards and a table comparing the plans; your usage sits in a panel under the cards." },
            { TR: "Security üst menüde: şifren, iki adımlı doğrulaman, kurtarma kodların ve son girişin tek bakışta. Security Bot'un neleri taradığı da anlatılıyor.", EN: "Security is in the top menu: your password, two-step verification, recovery codes and last sign-in at a glance, plus what Security Bot scans for." },
            { TR: "Panelden \"Keşfet\" kalktı; ürünlere üst menüden ulaşabilirsin.", EN: "\"Explore\" left the dashboard; the products are in the top menu." },
        ],
    },
    {
        id: "v0.3.19",
        version: "v0.3.19",
        date: "2026-10-05",
        title: { TR: "Hesabın daha güvenli", EN: "Your account is safer" },
        desc: { TR: "Hesabına şifre eklediysen Google ile girişte de bu şifre soruluyor; tek tuşla diğer tüm oturumlarını kapatabiliyorsun.", EN: "If you added a password to your account, Google sign-in asks for it too, and one button signs out all your other sessions." },
        items: [
            { TR: "Google ile giriş: hesabında şifre varsa her Google girişinden sonra şifren, iki adımlı doğrulama açıksa kodun da soruluyor. Şifreni unuttuysan aynı ekrandan ekipten yardım isteyebilirsin.", EN: "Google sign-in: if your account has a password, every Google sign-in asks for it, plus your code when two-step verification is on. If you forgot it, you can ask the team for help from the same screen." },
            { TR: "Hesap Ayarları → Gizlilik ve Güvenlik'te \"Diğer tüm oturumları kapat\"; şifreni değiştirdiğinde de diğer cihazlardaki oturumların kapanıyor.", EN: "\"Sign out all other sessions\" in Account Settings → Privacy & Security; changing your password signs your other devices out too." },
            { TR: "Başkası adınla önceden şifreli bir hesap açtıysa, Google ile ilk girişin o şifreyi ve iki adımlı doğrulamayı kaldırıp hesabı sana veriyor.", EN: "If someone opened an account with your address and a password before you, your first Google sign-in removes that password and two-step verification and hands the account to you." },
            { TR: "İlk şifreni belirlemek ve hesabını silmek için son 30 dakika içinde giriş yapmış olman gerekiyor.", EN: "Setting your first password and deleting your account need a sign-in within the last 30 minutes." },
            { TR: "Profiller artık listelenemiyor, yalnızca tek tek açılıyor; özel durumdaki emoji kalktı, durum yalnızca metin.", EN: "Profiles can no longer be listed, only opened one at a time; the custom status emoji is gone and the status is text only." },
            { TR: "Gizlilik Politikası, KVKK Aydınlatma Metni ve Kullanım Şartları 4.8.", EN: "Privacy Policy, KVKK Information Notice and Terms of Use 4.8." },
        ],
    },
    {
        id: "v0.3.18",
        version: "v0.3.18",
        date: "2026-10-05",
        title: { TR: "Hanogt AI kendi modeline geçiyor ve düşünüyor", EN: "Hanogt AI moves to its own model and thinks" },
        desc: { TR: "Hanogt AI artık kendi dil modeliyle çalışıyor, zor sorularda yanıt vermeden önce düşünüyor ve mesaj hakları haftalık sayılıyor.", EN: "Hanogt AI now runs on its own language model, thinks before it answers hard questions, and messages are counted weekly." },
        items: [
            { TR: "Düşünme: zor sorularda \"Düşünüyor…\" paneli açılıyor; modelin düşünmesi, okunan bilgi kaynakları ve çalışan denetimler yanıtın üstünde görünüyor. Hanogt AI ayarlarından açıp kapatabilirsin.", EN: "Thinking: hard questions open a \"Thinking…\" panel showing the model's thinking, the knowledge sources read and the checks that ran, above the answer. Turn it on or off in the Hanogt AI settings." },
            { TR: "Yeni mesaj hakları: Ücretsiz 7 günde 50, Plus 14 günde 750, Pro 7 günde 2.000 mesaj. Pencere ilk mesajınla başlıyor; model yanıt veremezse hakkın geri veriliyor.", EN: "New message allowances: 50 in 7 days on Free, 750 in 14 days on Plus and 2,000 in 7 days on Pro. The window starts with your first message, and a message the model couldn't answer is given back." },
            { TR: "Geliştirici API'si artık sohbetle aynı mesaj hakkını kullanıyor; istersen modelin düşünmesini de alabiliyorsun (include_reasoning).", EN: "The developer API now uses the same message allowance as the chat, and can return the model's thinking too (include_reasoning)." },
            { TR: "Hanogt AI'ı kullanmak için giriş yapman gerekiyor. Kesilen uzun yanıtlar \"Devam et\" ile sürdürülebiliyor.", EN: "You need to sign in to use Hanogt AI. A long answer that was cut off can be picked up with \"Continue\"." },
            { TR: "Kod editöründe açık dosya Hanogt AI'a gerçekten ulaşıyor; yazma kutusundaki pembe odak çerçevesi kalktı.", EN: "The file open in the code editor now really reaches Hanogt AI, and the pink focus frame around the message box is gone." },
            { TR: "Groq ve gelişmiş kod motoru kaldırıldı; Groq ile eklenen kendi anahtar bağlantıları \"artık desteklenmiyor\" olarak listeleniyor ve silinebiliyor.", EN: "Groq and the advanced code engine were removed; own-key connections added for Groq are listed as \"no longer supported\" and can be deleted." },
        ],
    },
    {
        id: "v0.3.16",
        version: "v0.3.16",
        date: "2026-10-03",
        title: { TR: "Daha bilgili Hanogt AI Çekirdeği", EN: "A better-informed Hanogt AI Core" },
        desc: { TR: "Çevrimdışı Çekirdek artık programlama kavramlarını açıklıyor; kod yazma başarısı ölçülebiliyor.", EN: "The offline Core now explains programming concepts, and code quality can be measured." },
        items: [
            { TR: "\"Özyineleme nedir?\", \"What is a closure?\" gibi 50 programlama kavramı, örnekleriyle çevrimdışı da yanıtlanıyor.", EN: "50 programming concepts such as \"What is recursion?\" or \"What is a closure?\" are answered offline too, with examples." },
            { TR: "Çekirdeğin niyet modeli yeniden eğitildi: daha isabetli yönlendirme.", EN: "The Core's intent model was retrained for more accurate routing." },
            { TR: "Ekip için: kod yazma başarısını ölçen code-bench ve kendi Hanogt AI modelini eğitme düzeneği.", EN: "For the team: code-bench to measure coding quality, and a pipeline to train an own Hanogt AI model." },
        ],
    },
    {
        id: "v0.3.15",
        version: "v0.3.15",
        date: "2026-10-03",
        title: { TR: "Gelişmiş kod motoru", EN: "The advanced code engine" },
        desc: { TR: "Ekip açtıysa kod ve güvenlik soruların Claude ile yanıtlanıyor; her plan günlük gelişmiş yanıt hakkı alıyor.", EN: "If the team has switched it on, your code and security questions are answered with Claude; every plan gets advanced answers each day." },
        items: [
            { TR: "Kod ya da Güvenlik modunda, dosya eklediğinde ya da kodla ilgili sorduğunda yanıtı gelişmiş kod motoru yazar.", EN: "In Code or Security mode, with a file attached or a question about code, the advanced code engine writes the answer." },
            { TR: "Plus ve Pro'da daha fazla gelişmiş yanıt; kalan hakkın Hanogt AI sayacında görünür.", EN: "More advanced answers on Plus and Pro; what's left shows in the Hanogt AI meter." },
            { TR: "Hak dolunca standart motor yanıtlar ve bunu yanıtın üstünde söyler.", EN: "When they run out, the standard engine answers and says so above the answer." },
            { TR: "Kod yanıtları iki motorda da daha eksiksiz: çalışır tam kod, uç durumlar, kök neden ve uydurma API yok.", EN: "Code answers are more complete on both engines: full runnable code, edge cases, root causes and no invented APIs." },
        ],
    },
    {
        id: "v0.3.14",
        version: "v0.3.14",
        date: "2026-10-03",
        title: { TR: "Sesle yaz, yanıtları dinle (erken erişim)", EN: "Dictate, and listen to answers (early access)" },
        desc: { TR: "Pro'da Hanogt AI'a sesle yaz ve yanıtları sesli dinle; geliştirici API'si ve plan rozetleri artık herkese açık.", EN: "On Pro, dictate to Hanogt AI and listen to its answers; the developer API and plan badges are now open to everyone." },
        items: [
            { TR: "Mesaj kutusundaki mikrofona konuş, sözlerin kutuya yazılsın; göndermeden önce düzeltebilirsin.", EN: "Speak into the microphone in the message box and your words are typed for you; fix them before sending." },
            { TR: "Bir yanıtın altındaki hoparlöre bas, Hanogt AI yanıtı okusun; kod blokları satır satır okunmaz.", EN: "Press the speaker under an answer to hear it; code blocks aren't read line by line." },
            { TR: "Ses tarayıcının konuşma hizmetiyle çalışır; sesin Hanogt'a gönderilmez.", EN: "Voice runs on your browser's speech service; your voice isn't sent to Hanogt." },
            { TR: "Hanogt AI API'si ve profil rozeti Plus ve Pro'da herkese açıldı.", EN: "The Hanogt AI API and profile badges are now open to everyone on Plus and Pro." },
            { TR: "Kullanım Şartları ve Gizlilik Politikası 4.5: plan hakları, API kuralları ve erken erişim.", EN: "Terms of Use and Privacy Policy 4.5: plan benefits, API rules and early access." },
        ],
    },
    {
        id: "v0.3.13",
        version: "v0.3.13",
        date: "2026-10-03",
        title: { TR: "Hanogt AI API'si", EN: "The Hanogt AI API" },
        desc: { TR: "Hanogt AI'ı kendi uygulamandan OpenAI uyumlu bir API ile çağır; anahtarların ve bağlantıların tek sayfada.", EN: "Call Hanogt AI from your own app through an OpenAI-compatible API; your keys and connections on one page." },
        items: [
            { TR: "Yeni \"API ve bağlantılar\" sayfası: sohbetin üstündeki 🔑 düğmesinden aç.", EN: "A new \"API and connections\" page: open it with the 🔑 button above the chat." },
            { TR: "Plus ve Pro ile API anahtarı oluştur; OpenAI'ın kütüphaneleri temel adresi değiştirerek çalışır.", EN: "Create API keys with Plus or Pro; OpenAI's libraries work by changing the base URL." },
            { TR: "Belgelerde curl, JavaScript, Python ve OpenAI SDK örnekleri var.", EN: "The docs have curl, JavaScript, Python and OpenAI SDK samples." },
            { TR: "API, ekip tarafından kademeli olarak açılıyor.", EN: "The team is opening the API gradually." },
        ],
    },
    {
        id: "v0.3.12",
        version: "v0.3.12",
        date: "2026-10-03",
        title: { TR: "Destekte Pro önceliği ve plan rozeti", EN: "Pro priority in support, and plan badges" },
        desc: { TR: "Pro talepleri Plus'tan önce ele alınıyor; Plus ve Pro rozetleri kademeli olarak açılıyor.", EN: "Pro tickets are handled before Plus ones; Plus and Pro badges are opening gradually." },
        items: [
            { TR: "Pro aboneliğinin destek talepleri Plus taleplerinden önce ele alınır.", EN: "Support tickets from Pro subscribers are handled before Plus tickets." },
            { TR: "Plus veya Pro'ya geçtikten sonra açık talebine yazdığında talebin yüksek önceliğe çıkar.", EN: "After you move up to Plus or Pro, an open ticket moves to high priority when you write in it." },
            { TR: "Plus ve Pro rozeti adının yanında profilinde, kullanıcı kartında ve mesajlarda görünür; Fiyatlandırma ya da Hesap Ayarları › Profil'den gizleyebilirsin.", EN: "A Plus or Pro badge shows next to your name on your profile, your user card and in messages; hide it from Pricing or Account Settings › Profile." },
        ],
    },
    {
        id: "v0.3.11",
        version: "v0.3.11",
        date: "2026-10-03",
        title: { TR: "Hanogt AI ayarları", EN: "Hanogt AI settings" },
        desc: { TR: "Hanogt AI'ın seni nasıl yanıtlayacağını kendin belirle: talimatlar, üslup, uzunluk, dil ve yeni sohbetlerin varsayılanları.", EN: "Decide how Hanogt AI answers you: instructions, tone, length, language and how new chats start." },
        items: [
            { TR: "Hanogt AI'a kendini tanıt ve nasıl yanıt vermesini istediğini yaz; her yanıtta dikkate alınır.", EN: "Tell Hanogt AI about yourself and how you want answers; it's considered in every reply." },
            { TR: "Üslup, yanıt uzunluğu ve sabit bir yanıt dili seç.", EN: "Choose the tone, answer length and a fixed answer language." },
            { TR: "Yeni sohbetin modu, varsayılan model ve ajan modu hesabınla saklanır.", EN: "A new chat's mode, the default model and the agent mode are kept with your account." },
            { TR: "Sohbetlerini dışa aktar, sil ya da çıkış yapınca bu cihazdan silinmesini seç.", EN: "Export or delete your chats, or have them deleted from this device when you sign out." },
        ],
    },
    {
        id: "v0.3.10",
        version: "v0.3.10",
        date: "2026-10-03",
        title: { TR: "Plus ve Pro'da daha güçlü Hanogt AI", EN: "A stronger Hanogt AI on Plus and Pro" },
        desc: { TR: "Plus ve Pro'da Hanogt AI daha uzun yanıt veriyor ve açık dosyanın daha büyük kısmını okuyor.", EN: "On Plus and Pro, Hanogt AI writes longer answers and reads more of your open file." },
        items: [
            { TR: "Daha uzun yanıtlar: Plus'ta 3.000, Pro'da 4.000 token'a kadar.", EN: "Longer answers: up to 3,000 tokens on Plus and 4,000 on Pro." },
            { TR: "Açık dosyanın Plus'ta 24.000, Pro'da 40.000 karakteri okunur.", EN: "24,000 characters of your open file are read on Plus, 40,000 on Pro." },
            { TR: "Pro'da kendi API anahtarınla günde 10.000 mesaj.", EN: "10,000 messages a day with your own API keys on Pro." },
            { TR: "Yeni özellikler önce erken erişimle (Pro) açılabilecek.", EN: "New features can open first in early access (Pro)." },
        ],
    },
    {
        id: "v0.3.9",
        version: "v0.3.9",
        date: "2026-10-03",
        title: { TR: "Hanogt AI'da kullanım sayacı", EN: "A usage meter in Hanogt AI" },
        desc: { TR: "Bugün kaç Hanogt AI mesajı kullandığını ve hakkının ne zaman yenileneceğini sohbetin üstünde görürsün.", EN: "See how many Hanogt AI messages you've used today, and when they renew, right above the chat." },
        items: [
            { TR: "\"Bugün 12 / 750\" sayacı sohbet sayfasında ve yüzen panelde; sınıra yaklaşınca renk değiştirir.", EN: "A \"Today 12 / 750\" meter on the chat page and in the floating panel; it changes colour as you near the limit." },
            { TR: "Sınıra gelince saat ve plan yükseltme bağlantısı gösterilir; abone olunca sayaç hemen yeni planı gösterir.", EN: "At the limit you see when it renews and a link to upgrade; after subscribing the meter shows the new plan at once." },
            { TR: "Model seçicide kalan mesajlar; Fiyatlandırma'da bütün hakların \"kullanılan / sınır\" olarak.", EN: "Messages left in the model picker; every benefit as \"used / limit\" on Pricing." },
            { TR: "Dakika sınırına takılan mesajlar artık günlük hakkından düşmez.", EN: "Messages refused by the per-minute limit no longer use up your daily messages." },
        ],
    },
    {
        id: "v0.3.8",
        version: "v0.3.8",
        date: "2026-10-03",
        title: { TR: "Plan hakların her yerde, hemen", EN: "Your plan's benefits everywhere, right away" },
        desc: { TR: "Ödedikten sonra planın editörde, oyun motorunda, gruplarda ve ekiple düzenlemede hemen geçerli. Ekiple düzenlemede kişi sınırı artık plana göre.", EN: "After paying, your plan applies at once in the editor, the game engine, groups and team editing. Team editing now holds more people on higher plans." },
        items: [
            { TR: "Ödeme bildirimi gecikse bile Plus ve Pro sınırları hemen açılır.", EN: "Plus and Pro limits unlock right away, even when the payment notification is late." },
            { TR: "Ekiple düzenleme: Ücretsiz 2, Plus 5, Pro 30 kişi.", EN: "Team editing: Free 2, Plus 5, Pro 30 people." },
            { TR: "Grup ve oyun projesi sınırına gelince planının sayısı ve Fiyatlandırma bağlantısı görünür.", EN: "At the group or game project limit you see your plan's number and a link to Pricing." },
            { TR: "Grup sahipliği devredilirken yeni sahibin plan sınırına bakılır.", EN: "Handing over a group checks the new owner's plan limit." },
        ],
    },
    {
        id: "v0.3.7",
        version: "v0.3.7",
        date: "2026-10-03",
        title: { TR: "Ödemelerde daha fazla güvenlik ve doğruluk", EN: "Safer, more accurate payments" },
        desc: { TR: "Abonelikler artık başkasının ödeme kaydına bağlanamıyor, iki kez ödeme alınmıyor ve duraklatılmış abonelik tek tuşla sürdürülüyor.", EN: "Subscriptions can no longer be linked to someone else's billing record, nobody is charged twice, and a paused subscription resumes with one click." },
        items: [
            { TR: "Paddle'da aynı e-postayla eski bir kayıt varsa, yalnızca e-postası doğrulanmış (Google ile giriş yapmış) hesaba bağlanır.", EN: "An older Paddle record with the same e-mail is linked only to an account whose address is verified (signed in with Google)." },
            { TR: "Duraklatılmış aboneliğini Fiyatlandırma'dan sürdürebilirsin; ikinci kez ödeme alınmaz.", EN: "Resume a paused subscription from Pricing; you're never charged twice." },
            { TR: "Deneme süresinde plan değiştirmek artık çalışıyor ve ücret alınmıyor.", EN: "Changing plans during a free trial now works and costs nothing." },
            { TR: "Fiyatlar bulunduğun ülkeye göre doğru para birimi ve vergiyle gösteriliyor.", EN: "Prices show in the right currency and with the right taxes for your country." },
            { TR: "Yıllık abonelikler, reddedilen kartlar ve ödeme bağlantıları için daha açık mesajlar.", EN: "Clearer messages for yearly subscriptions, declined cards and payment links." },
        ],
    },
    {
        id: "v0.3.6",
        version: "v0.3.6",
        date: "2026-10-03",
        title: { TR: "Ödemeden sonra planın hemen açılıyor; silinen kuponlar geri geliyor", EN: "Your plan unlocks right after paying; deleted coupons come back" },
        desc: { TR: "Ödeme tamamlanınca planın, ödeme sağlayıcısının bildirimini beklemeden saniyeler içinde açılıyor. Silinen kuponlar yönetici panelinden geri yüklenebiliyor.", EN: "Once the payment completes, your plan unlocks within seconds without waiting for the payment provider's notification. Deleted coupons can be restored from the admin panel." },
        items: [
            { TR: "Ödemeden sonra plan saniyeler içinde açılır; açılmazsa \"Ödememi kontrol et\" düğmesi var.", EN: "The plan unlocks within seconds after paying; if it doesn't, there's a \"Check my payment\" button." },
            { TR: "Ödeme işlenirken ikinci kez ödeme alınmaz.", EN: "You can't be charged twice while a payment is being processed." },
            { TR: "Ekip için: bildirimlerin neden gelmediği Paddle kartında tek tuşla görülür.", EN: "For the team: why notifications don't arrive is shown in the Paddle card with one click." },
            { TR: "Silinen kuponlar \"Silinen kuponlar\" listesinden geri yüklenebilir.", EN: "Deleted coupons can be restored from the \"Deleted coupons\" list." },
        ],
    },
    {
        id: "v0.3.5",
        version: "v0.3.5",
        date: "2026-10-03",
        title: { TR: "Kupon bağlantıları girişten sonra da çalışıyor", EN: "Coupon links keep working after you sign in" },
        desc: { TR: "Kampanya bağlantısındaki kupon kodu artık giriş yaptıktan sonra kendiliğinden uygulanıyor; eski kupon kodları da ödemede çalışıyor.", EN: "The coupon code in a campaign link is now applied automatically after you sign in, and older coupon codes work at checkout too." },
        items: [
            { TR: "Kupon bağlantısıyla gelip giriş yapınca kod kendiliğinden uygulanır.", EN: "Arrive with a coupon link, sign in, and the code is applied for you." },
            { TR: "Tire ya da alt çizgi içeren eski kupon kodları ödemede de geçerli.", EN: "Older coupon codes with a dash or underscore work at checkout too." },
            { TR: "Abonelere kuponların yeni aboneliklerde geçerli olduğu söylenir; kartlarda yanıltıcı kupon fiyatı çıkmaz.", EN: "Subscribers are told coupons apply to new subscriptions; no misleading coupon prices on the cards." },
        ],
    },
    {
        id: "v0.3.4",
        version: "v0.3.4",
        date: "2026-10-03",
        title: { TR: "Kupon kodları Fiyatlandırma'da; ödeme sonrası plan anında etkin", EN: "Coupon codes on Pricing; your plan is active right after paying" },
        desc: { TR: "Kupon kodunu artık Fiyatlandırma sayfasında girebilir, indirimli fiyatı hemen görebilirsin. Ödeme sonrası planın etkinleşmesi ve kayıt sınırları da düzeltildi.", EN: "You can now enter a coupon code on the Pricing page and see the discounted price right away. Plan activation after paying and sign-up limits were fixed too." },
        items: [
            { TR: "Fiyatlandırma'da \"Kupon kodun var mı?\": kod uygulanınca indirimli fiyat ve kaç ödemede geçerli olduğu görünür, ödeme ekranı indirimle açılır.", EN: "\"Have a coupon code?\" on Pricing: once applied, the discounted price and how many payments it covers are shown, and the checkout opens with the discount." },
            { TR: "Kuponlar her ödemede ya da ilk birkaç ödemede de geçerli olabilir.", EN: "Coupons can also cover every payment or the first few." },
            { TR: "Ödeme ekranında artık adet seçici yok: her ödeme tek bir abonelik.", EN: "No more quantity picker at checkout: every payment is one subscription." },
            { TR: "Ödemeden sonra planın birkaç saniyede etkinleşir; kayıt ve giriş sınırları artık kişi başına işler.", EN: "Your plan is active within seconds after paying; sign-up and sign-in limits now count per person." },
        ],
    },
    {
        id: "v0.3.3",
        version: "v0.3.3",
        date: "2026-10-03",
        title: { TR: "Hata mesajları artık gerçek nedeni söylüyor", EN: "Error messages now tell the real reason" },
        desc: { TR: "Ödeme ekranı, Hanogt AI ve kod çalıştırmadaki bazı hatalar yolda genel bir hata sayfasına dönüşüyordu; artık asıl neden ekrana geliyor.", EN: "Some errors in the checkout, Hanogt AI and code runs turned into a generic error page on the way; now the actual reason reaches the screen." },
        items: [
            { TR: "Plus/Pro ödemesi başlamazsa Paddle'ın bildirdiği neden gösteriliyor (önceden yalnızca \"İşlem tamamlanamadı\" çıkıyordu).", EN: "If a Plus/Pro checkout can't start, the reason Paddle gave is shown (before, only \"That didn't work\" appeared)." },
            { TR: "Hanogt AI'da kendi API anahtarınla bağlantı hataları (geçersiz anahtar, model bulunamadı) ve zaman aşımları doğru mesajla gösteriliyor; kod çalıştırma zaman aşımı da öyle.", EN: "Hanogt AI errors with your own API key (invalid key, model not found) and timeouts show the right message again; so do code run timeouts." },
            { TR: "Ödeme ekranı açılamazsa Paddle'ın \"Something went wrong\" penceresi kapanıyor ve sayfada Paddle'ın hangi bilgiyi kabul etmediği yazıyor.", EN: "If the checkout can't start, Paddle's \"Something went wrong\" window closes and the page says which detail Paddle didn't accept." },
        ],
    },
    {
        id: "v0.3.2",
        version: "v0.3.2",
        date: "2026-10-03",
        title: { TR: "Fiyatlandırma üst menüde; ödeme başlatılamazsa nedeni", EN: "Pricing in the top menu; when a checkout can't start, the reason" },
        desc: { TR: "Planlar sayfası artık \"İşlem tamamlanamadı\" demekle kalmıyor: geçici sorunlarda kendiliğinden bir kez daha deniyor, olmazsa nedenini ve bir hata kodunu gösteriyor.", EN: "The Plans page no longer just says \"That didn't work\": it tries once more by itself after a passing problem and otherwise shows the reason with an error code." },
        items: [
            { TR: "Planlar sayfası artık üst menüde ve adı Fiyatlandırma. Üst menü sığmadığı pencerelerde yazıları iki satıra kaydırmak yerine menü düğmesine geçiyor.", EN: "The Plans page is now in the top menu, named Pricing. Where the top menu doesn't fit, it turns into the menu button instead of breaking labels onto two lines." },
            { TR: "Bağlantı kopması, sunucunun ya da Paddle'ın geç yanıt vermesi gibi geçici sorunlarda ödeme ekranı bir kez daha denenerek açılıyor.", EN: "After a passing problem such as a dropped connection or a slow server or Paddle, the checkout is tried once more and opens." },
            { TR: "Hata mesajları nedeni söylüyor: sunucuya ulaşılamadı (bağlantı, reklam engelleyici, VPN), sunucu zamanında yanıt vermedi, Paddle yanıt vermiyor ya da veritabanına ulaşılamadı.", EN: "Error messages name the cause: the server couldn't be reached (connection, ad blocker, VPN), the server didn't answer in time, Paddle isn't responding or the database couldn't be reached." },
            { TR: "Her hatanın altında bir \"Hata kodu\" satırı var; destek talebine eklersen sorunu hemen buluruz.", EN: "Every error ends with an \"Error code\" line; add it to a support ticket and we'll find the problem right away." },
        ],
    },
    {
        id: "v0.3.1",
        version: "v0.3.1",
        date: "2026-10-03",
        title: { TR: "Sesli aramada ses, sesli mesajlar ve ödeme ekranı düzeltildi", EN: "Call audio, voice messages and the checkout fixed" },
        desc: { TR: "Sesli aramalarda ses artık iki yönde de gidiyor, sesli mesajlar gönderilip dinlenebiliyor ve Plus/Pro ödeme ekranı açılıyor.", EN: "Voice calls now carry audio both ways, voice messages can be sent and played, and the Plus/Pro checkout opens." },
        items: [
            { TR: "Her arama mikrofon ve ses açık başlar: Hanogt Social'da daha önce kapatılan mikrofon ya da kulaklık artık aramayı sessiz başlatmaz.", EN: "Every call starts with the microphone and sound on: a microphone or headphones switched off earlier in Hanogt Social no longer start the call silent." },
            { TR: "Arama çubuğu sessizliğin nedenini söyler: mikrofonun kapalı, karşı taraf mikrofonunu kapattı, ses verisi gelmiyor ya da mikrofonundan ses gelmiyor. Tarayıcı sesi engellerse “Sesi başlat” düğmesi çıkar.", EN: "The call bar names the reason for silence: your microphone is off, the other person muted, no audio is arriving or your microphone is silent. If the browser blocks the sound, a “Start audio” button appears." },
            { TR: "Ses ayarları: mikrofonunu ve hoparlörünü seç, mikrofonunu test et. Sosyal paneldeki ayar düğmesinden ve arama çubuğundan açılır.", EN: "Voice settings: pick your microphone and speaker and test your microphone. Open them from the settings button in the Social panel or the call bar." },
            { TR: "Mobil veri ve kurum ağlarında aramalar için TURN desteği (site yönetimi ayarlar).", EN: "TURN support for calls on mobile data and company networks (set up by the site team)." },
            { TR: "Sesli mesajlar artık gönderiliyor ve dinlenebiliyor; mikrofon hataları ayrı ayrı açıklanıyor.", EN: "Voice messages are sent and played again; microphone problems are explained one by one." },
            { TR: "Plus ve Pro ödeme ekranı açılıyor; açılamazsa nedeni ekranda yazıyor ve ekibe bildiriliyor.", EN: "The Plus and Pro checkout opens; if it can't, the reason is shown and reported to the team." },
        ],
    },
    {
        id: "v0.3.0",
        version: "v0.3.0",
        date: "2026-10-02",
        title: { TR: "Plus ve Pro: Paddle ile abonelik, kendi yapay zekânı bağla", EN: "Plus and Pro: subscriptions with Paddle, connect your own AI" },
        desc: { TR: "Planlar satın alınabilir hâle geliyor: ödemeler Kayıtlı Satıcımız Paddle üzerinden. Abonelere özel yeni özellikler: Hanogt AI'ya kendi API anahtarınla yapay zekâ bağlama ve daha fazla proje.", EN: "Plans become buyable: payments go through Paddle, our Merchant of Record. New subscriber features: connect your own AI providers to Hanogt AI with your API keys, and more projects." },
        items: [
            { TR: "Plus aylık 20 $, Pro aylık 100 $; yıllık ödemede yalnızca 10 ayın ücreti alınır. Vergiler ve yerel para birimi ödeme ekranında Paddle tarafından gösterilir.", EN: "Plus is $20 a month, Pro $100 a month; yearly billing costs only 10 months. Paddle shows taxes and local currency at checkout." },
            { TR: "Kendi API anahtarınla yapay zekâ: OpenAI, Claude, Gemini, Groq, Mistral, OpenRouter, DeepSeek, Grok ve Together'ı Hanogt AI'ya bağla. Plus'ta 2, Pro'da 5 bağlantı; anahtarlar şifreli saklanır.", EN: "Your own AI keys: connect OpenAI, Claude, Gemini, Groq, Mistral, OpenRouter, DeepSeek, Grok and Together to Hanogt AI. 2 connections on Plus, 5 on Pro; keys are stored encrypted." },
            { TR: "Proje hakları: Ücretsiz 10 kod + 10 oyun projesi, Plus 40 + 40, Pro sınırsız. Sınırı aşan eski projeler silinmez.", EN: "Projects: Free 10 code + 10 game projects, Plus 40 + 40, Pro unlimited. Older projects above the limit are never deleted." },
            { TR: "Hanogt Social'da grup açma: Ücretsiz 3, Plus 10, Pro sınırsız.", EN: "Hanogt Social groups you can create: Free 3, Plus 10, Pro unlimited." },
            { TR: "Planlar sayfası: aylık/yıllık seçimi, ülkene göre fiyat, tek tıkla ödeme, plan yükseltme önizlemesi, “Aboneliği yönet” ile fatura, ödeme yöntemi ve iptal.", EN: "Plans page: monthly/yearly switch, prices for your country, one-click checkout, upgrade previews and “Manage subscription” for invoices, payment method and cancellation." },
            { TR: "Ödeme, plan değişikliği, iptal ve başarısız ödeme bildirim zilinde; hesabı silmek aboneliği hemen iptal eder.", EN: "Payments, plan changes, cancellations and failed payments appear in the notification bell; deleting your account cancels the subscription at once." },
            { TR: "Yeni sayfalar: İade Politikası ve İletişim. Kullanım Şartları, Gizlilik Politikası ve KVKK metni ödemeler ve yapay zekâ bağlantıları için güncellendi (4.4).", EN: "New pages: Refund Policy and Contact. The Terms, Privacy Policy and KVKK notice now cover payments and AI connections (4.4)." },
            { TR: "Kod editörü: yeni projeler buluta güvenle kaydediliyor; plan sınırına gelince seni Planlar'a yönlendiren bir uyarı çıkıyor.", EN: "Code editor: new projects are saved to the cloud reliably; at your plan's limit a notice points you to Plans." },
        ],
    },
    {
        id: "v0.2.2",
        version: "v0.2.2",
        date: "2026-10-02",
        title: { TR: "Yenilenen Minecraft kılavuzu ve motor belgeleri", EN: "A renewed Minecraft guide and engine docs" },
        desc: { TR: "Kılavuz kitabı bugünkü özelliklerle 43 sayfaya çıktı; arama, kaldığın yerden devam ve keşif seviyesi geldi. Motor belgelerine adım adım ilk oyun ve sorun giderme eklendi.", EN: "The guide book grew to 43 pages covering today's features, with search, resume reading and an exploration level. The engine docs gained a step-by-step first game and troubleshooting." },
        items: [
            { TR: "Kılavuzda 10 bölüm: Hanogt AI, Hanogt Social, ekiple düzenleme, remiks kuralları, piyasa bandı, iki adımlı doğrulama, destek talepleri ve Planlar (yakında) için yeni sayfalar.", EN: "10 chapters in the guide, with new pages on Hanogt AI, Hanogt Social, team editing, remix rules, the market strip, two-step verification, support tickets and Plans (coming soon)." },
            { TR: "Kitapta arama: Türkçe ya da İngilizce yaz, sonuca tıkla; sayfa parlayarak açılır.", EN: "Search the book in Turkish or English and click a result; its page opens with a glow." },
            { TR: "Kaldığın sayfa ve açtığın bölümler bu tarayıcıda hatırlanır; XP çubuğu keşif seviyeni, hotbar henüz açılmamış bölümleri gösterir. Hepsini açana Kâşif başarımı.", EN: "The page you were on and the chapters you opened are remembered in this browser; the XP bar shows your exploration level and the hotbar marks chapters you haven't opened. Open them all for the Explorer advancement." },
            { TR: "Motor belgeleri: 10 dakikada coin toplanan bir platform oyunu (kodu otomatik testle doğrulanır), sık karşılaşılan sorunlar tablosu, kod kopyalama düğmesi, belgelerde arama ve telefonda içindekiler.", EN: "Engine docs: a coin-collecting platformer in 10 minutes (its code is checked by an automated test), a troubleshooting table, a copy button on code, search in the docs and a contents menu on phones." },
            { TR: "Motorun Oluştur menüsü İngilizcede artık Sprite (Square) ve Sprite (Circle) yazıyor.", EN: "The engine's Create menu now says Sprite (Square) and Sprite (Circle) in English." },
        ],
    },
    {
        id: "v0.2.1",
        version: "v0.2.1",
        date: "2026-10-02",
        title: { TR: "Remiks izni ve Planlar (Yakında)", EN: "Remix permission and Plans (coming soon)" },
        desc: { TR: "Arcade oyunları artık yalnızca yapımcı izin verirse remikslenebiliyor; Planlar sayfası ve plana göre Hanogt AI sınırları geldi.", EN: "Arcade games can now be remixed only if the author allows it; the Plans page and plan-based Hanogt AI limits arrived." },
        items: [
            { TR: "Yayınlarken \"Remikslemelere izin ver\" seçeneği; izin yoksa Remix düğmesi görünmez ve sunucu kopyalamayı reddeder.", EN: "An \"Allow remixes\" option when publishing; without it the Remix button is hidden and the server refuses copies." },
            { TR: "Remiksler orijinal oyunun adını ve yapımcısını atıf olarak gösterir.", EN: "Remixes show the original game's title and author as attribution." },
            { TR: "Planlar sayfası: Ücretsiz, Plus ve Pro yakında; ödeme alınmıyor, açılınca haber verebiliriz.", EN: "The Plans page: Free, Plus and Pro coming soon; no payments, and we can notify you when they open." },
            { TR: "Hanogt AI günlük sınırı plana göre: Ücretsiz 250, Plus 750, Pro 2.000 mesaj.", EN: "Hanogt AI's daily limit depends on the plan: Free 250, Plus 750, Pro 2,000 messages." },
        ],
    },
    {
        id: "v0.2.0",
        version: "v0.2.0",
        date: "2026-10-02",
        title: { TR: "Hanogt Social, Hanogt AI ajan modu, Engine V3 ve 122 dil", EN: "Hanogt Social, Hanogt AI agent mode, Engine V3 and 122 languages" },
        desc: { TR: "Arkadaşlar, mesajlar ve gruplar Hanogt Social'da birleşti; Hanogt AI izninizle işlem yapabiliyor, Hanogt Engine V3 çıktı, kod editörü 122 dile ulaştı, Hesap Ayarları yeniden tasarlandı, destek talepleri ve bulut bağlantısı güçlendirildi.", EN: "Friends, messages and groups come together in Hanogt Social; Hanogt AI can act for you with your permission, Hanogt Engine V3 is out, the code editor reaches 122 languages, Account Settings was redesigned, and support tickets and the cloud connection got stronger." },
        items: [
            { TR: "Ekiple düzenle: kod editöründe arkadaşlarınızla en fazla 5 kişilik canlı oturum; herkesin imleci kendi renginde, ekip sohbeti, sesli görüşme, salt okunur mod ve oturum sonunda kopyayı saklama.", EN: "Edit as a team: live sessions of up to 5 friends in the code editor, with everyone's cursor in their own colour, a team chat, a voice call, a read-only mode and keeping a copy when the session ends." },
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
