"use client";

import OptimizedImage from "@/components/OptimizedImage";

import { useI18n, type Copy } from "@/lib/i18n";
import Link from "next/link";
import { useCallback, useState, useEffect } from "react";
import { MessageSquare, HelpCircle, ThumbsUp, Send, MessageCircle, User, Edit3, Trash2, Reply, X, Check, PlusCircle, Search, ChevronDown, ShieldCheck, Sparkles } from "lucide-react";
import { useSession } from "next-auth/react";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, query, orderBy, getDoc } from "firebase/firestore";
import ProfileModal from "@/components/ProfileModal";
import Header from "@/components/Header";
import SiteFooter from "@/components/SiteFooter";
import type { UserProfile } from "@/components/ProfileModal";

interface FeedbackItem {
    id: string;
    type: "question" | "feedback";
    content: string;
    description?: string;
    author: string;
    authorEmail: string;
    authorPhoto?: string;
    createdAt: Date;
    likes: string[];
    comments: Comment[];
}

interface Comment {
    id: string;
    author: string;
    authorEmail: string;
    authorPhoto?: string;
    content: string;
    replyTo?: string;
    replyToContent?: string;
    createdAt: Date;
}

type Faq = { id: string; category: Copy; question: Copy; answer: Copy };

const FAQS: Faq[] = [
    { id: "password", category: { TR: "Hesap", EN: "Account" }, question: { TR: "Parolam nasıl korunuyor?", EN: "How is my password protected?" }, answer: { TR: "Parolanın açık hâli saklanmaz. Sunucuda benzersiz tuz ve scrypt ile tek yönlü karma üretilir; kimlik bilgileri profil verilerinden ayrı tutulur.", EN: "Your password is never stored in plain text. The server derives a one-way scrypt hash with a unique salt, and credentials are kept apart from profile data." } },
    { id: "runner", category: { TR: "Kod", EN: "Code" }, question: { TR: "Kodum nerede çalıştırılıyor?", EN: "Where does my code run?" }, answer: { TR: "Kod yalnızca yönetici tarafından yapılandırılan izole yürütücüye gönderilir. Herkese açık Piston/Wandbox servisleri üretim yedeği olarak kullanılmaz.", EN: "Code is only sent to the isolated runner configured by the operator. Public Piston/Wandbox services are never used as a production fallback." } },
    { id: "engine", category: { TR: "Oyun motoru", EN: "Game engine" }, question: { TR: "Oyun scriptlerim nerede çalışıyor?", EN: "Where do my game scripts run?" }, answer: { TR: "C# ve C++ scriptleri tarayıcınızdaki HanogtScript sanal makinesinde yorumlanır; eval kullanılmaz, scriptler yalnızca motor API'lerine erişebilir ve sonsuz döngüler komut bütçesiyle durdurulur.", EN: "C# and C++ scripts are interpreted by the HanogtScript virtual machine in your browser. Nothing is eval'd, scripts can only reach engine APIs, and infinite loops are stopped by an instruction budget." } },
    { id: "arcade", category: { TR: "Arcade", EN: "Arcade" }, question: { TR: "Oyunumu Arcade'de nasıl yayınlarım?", EN: "How do I publish my game on the Arcade?" }, answer: { TR: "Motorda Yayınla düğmesine basın. Oyun derlenir ve güvenlik taramasından geçer; yayınlanan oyunlar herkese açıktır ve istediğiniz zaman kaldırılabilir.", EN: "Press Publish in the engine. The game is compiled and goes through a security scan; published games are public and can be taken down any time." } },
    { id: "news", category: { TR: "Haberler", EN: "News" }, question: { TR: "Hanogt News haberleri nereden geliyor?", EN: "Where does Hanogt News get its stories?" }, answer: { TR: "Haberler güvenilir yayıncıların herkese açık RSS/Atom akışlarından toplanır; yalnızca başlık, kısa özet ve kaynağa bağlantı gösterilir. Yapay zeka sıralaması yalnızca topluluk oylarından hesaplanır.", EN: "Stories are collected from trusted publishers' public RSS/Atom feeds; only the headline, a short excerpt and a link to the source are shown. The AI leaderboard is computed from community votes only." } },
    { id: "bot", category: { TR: "Güvenlik", EN: "Security" }, question: { TR: "Security Bot hesabımı otomatik olarak kalıcı engeller mi?", EN: "Will Security Bot ban my account automatically?" }, answer: { TR: "Hayır. Yüksek riskli istek anlık olarak durdurulur ve asgari kayıt oluşturulur. Kalıcı yaptırım otomatik regex sonucuyla verilmez; inceleme ve itiraz yolu vardır.", EN: "No. A high-risk request is stopped on the spot with a minimal log entry. Permanent action is never taken from an automatic pattern match; there is a review and appeal path." } },
    { id: "calls", category: { TR: "Aramalar", EN: "Calls" }, question: { TR: "Sesli aramalar kaydediliyor mu?", EN: "Are voice calls recorded?" }, answer: { TR: "Hayır. WebRTC arama sesi kaydedilmez. Geçici SDP/ICE bağlantı belgeleri görüşme bitince silinir ve kısa süreli sona erme bilgisi taşır.", EN: "No. WebRTC call audio is never recorded. Temporary SDP/ICE connection documents are deleted when the call ends and carry a short expiry." } },
    { id: "voice", category: { TR: "Mesajlar", EN: "Messages" }, question: { TR: "Sesli mesajlar nasıl saklanıyor?", EN: "How are voice messages stored?" }, answer: { TR: "Sesli mesajlar Firestore içine base64 olarak yazılmaz. Yetkili sohbet katılımcılarının erişebildiği dosya depolamasında tutulur ve mesaj silinince dosyası da silinir.", EN: "Voice messages aren't written into Firestore as base64. They live in file storage that only the chat's participants can access, and the file is deleted with the message." } },
    { id: "data", category: { TR: "Gizlilik", EN: "Privacy" }, question: { TR: "Verilerimi nasıl indirebilir veya silebilirim?", EN: "How can I download or delete my data?" }, answer: { TR: "Hesap Ayarları içindeki Veri Dışa Aktarma ve Hesabı Sil seçeneklerini kullanabilir; KVKK talebinizi bu sayfadan Gizlilik/KVKK başlığıyla iletebilirsiniz.", EN: "Use Data Export and Delete Account in Account Settings, or send a privacy (KVKK) request from this page." } },
    { id: "turn", category: { TR: "Bağlantı", EN: "Connection" }, question: { TR: "Arama neden bazı ağlarda bağlanmıyor?", EN: "Why don't calls connect on some networks?" }, answer: { TR: "Kurumsal ağlar ve sıkı NAT yapıları TURN sunucusu gerektirebilir. Yönetici TURN yapılandırmasını tamamlamadıysa uygulama bunu arama ekranında açıkça belirtir.", EN: "Corporate networks and strict NATs may need a TURN server. If the operator hasn't configured one, the call screen says so." } },
    { id: "files", category: { TR: "Proje", EN: "Projects" }, question: { TR: "Çoklu dosya projeleri gerçekten ayrı mı saklanıyor?", EN: "Are multi-file projects really stored as separate files?" }, answer: { TR: "Evet. Proje meta verisi ile her dosya ayrı Firestore alt belgesinde tutulur; düzenleyicideki sekmeler tek bir JSON alanına sıkıştırılmaz.", EN: "Yes. Project metadata and every file are kept in separate Firestore sub-documents; editor tabs aren't squeezed into a single JSON field." } },
    { id: "languages", category: { TR: "Diller", EN: "Languages" }, question: { TR: "Arayüzü kendi dilimde kullanabilir miyim?", EN: "Can I use the interface in my language?" }, answer: { TR: "Evet. Üst menüdeki dil seçiciden sağdan sola Arapça dahil 30 dil arasından seçim yapabilirsiniz. Yeni bölümlerin bazı metinleri henüz yalnızca Türkçe ve İngilizcedir.", EN: "Yes. Pick one of 30 languages, including right-to-left Arabic, from the language menu at the top. Some texts in the newest sections are still Turkish and English only." } },
];

export default function FeedbackPage() {
    const { t, tx, language } = useI18n();
    const { data: session } = useSession();
    const [activeTab, setActiveTab] = useState<"questions" | "feedback">("questions");
    const [message, setMessage] = useState("");
    const [description, setDescription] = useState("");
    const [showDescriptionInput, setShowDescriptionInput] = useState(false);
    const [items, setItems] = useState<FeedbackItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [faqQuery, setFaqQuery] = useState("");
    const [openFaq, setOpenFaq] = useState<string | null>(FAQS[0].id);
    const [commentText, setCommentText] = useState<{ [key: string]: string }>({});
    const [showComments, setShowComments] = useState<{ [key: string]: boolean }>({});

    // Edit states
    const [editingItemId, setEditingItemId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState("");
    const [editDescription, setEditDescription] = useState("");
    const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
    const [editCommentContent, setEditCommentContent] = useState("");

    // Reply states (WhatsApp style)
    const [replyingTo, setReplyingTo] = useState<{ itemId: string; commentId: string; author: string; content: string } | null>(null);

    const [selectedProfile, setSelectedProfile] = useState<UserProfile | null>(null);
    const [authorProfiles, setAuthorProfiles] = useState<Record<string, UserProfile>>({});

    const mutateFeedback = async (payload: Record<string, unknown>) => {
        const response = await fetch("/api/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const result = await response.json() as { error?: string };
        if (!response.ok) throw new Error(language === "TR" && result.error ? result.error : tx({ TR: "İşlem tamamlanamadı.", EN: "The action couldn't be completed." }));
    };

    const fetchItems = useCallback(async () => {
        try {
            const q = query(collection(db, "feedback"), orderBy("createdAt", "desc"));
            const snapshot = await getDocs(q);
            const fetchedItems: FeedbackItem[] = snapshot.docs.map(docSnap => ({
                id: docSnap.id,
                ...docSnap.data(),
                createdAt: docSnap.data().createdAt?.toDate() || new Date(),
                likes: docSnap.data().likes || [],
                comments: (docSnap.data().comments || []).map((c: Comment, idx: number) => ({
                    ...c,
                    id: c.id || `comment_${idx}`
                }))
            })) as FeedbackItem[];

            // Sort by likes count
            fetchedItems.sort((a, b) => b.likes.length - a.likes.length);
            setItems(fetchedItems);

            // Fetch author profiles for all items
            const emailSet = new Set(fetchedItems.map(i => i.authorEmail));
            const profiles: Record<string, UserProfile> = {};
            for (const email of emailSet) {
                try {
                    const uDoc = await getDoc(doc(db, "public_profiles", email));
                    if (uDoc.exists()) profiles[email] = { ...uDoc.data(), email } as UserProfile;
                } catch { /* skip */ }
            }
            setAuthorProfiles(profiles);
        } catch (error) {
            console.error("Error fetching feedback:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch items from Firebase (deferred so the first render isn't followed by a synchronous state cascade).
    useEffect(() => {
        const timer = window.setTimeout(() => { void fetchItems(); }, 0);
        return () => window.clearTimeout(timer);
    }, [fetchItems]);

    const handleSubmit = async (type: "question" | "feedback") => {
        if (!session?.user?.email || !message.trim()) return;

        setSubmitting(true);
        try {
            await mutateFeedback({
                action: "create",
                type,
                content: message.trim(),
                description: description.trim() || null,
            });
            setMessage("");
            setDescription("");
            setShowDescriptionInput(false);
            fetchItems();
        } catch (error) {
            console.error("Error submitting feedback:", error);
        } finally {
            setSubmitting(false);
        }
    };

    const handleLike = async (itemId: string) => {
        if (!session?.user?.email) return;

        const item = items.find(i => i.id === itemId);
        if (!item) return;

        try {
            await mutateFeedback({ action: "like", itemId });
            fetchItems();
        } catch (error) {
            console.error("Error updating like:", error);
        }
    };

    // Delete item
    const handleDeleteItem = async (itemId: string) => {
        if (!session?.user?.email) return;

        const item = items.find(i => i.id === itemId);
        if (!item || item.authorEmail !== session.user.email) return;

        if (!confirm(tx({ TR: "Bu içeriği silmek istediğinize emin misiniz?", EN: "Are you sure you want to delete this?" }))) return;

        try {
            await mutateFeedback({ action: "delete", itemId });
            fetchItems();
        } catch (error) {
            console.error("Error deleting item:", error);
        }
    };

    // Edit item
    const handleStartEditItem = (item: FeedbackItem) => {
        setEditingItemId(item.id);
        setEditContent(item.content);
        setEditDescription(item.description || "");
    };

    const handleSaveEditItem = async (itemId: string) => {
        if (!editContent.trim()) return;

        try {
            await mutateFeedback({
                action: "edit",
                itemId,
                content: editContent.trim(),
                description: editDescription.trim() || null
            });
            setEditingItemId(null);
            setEditContent("");
            setEditDescription("");
            fetchItems();
        } catch (error) {
            console.error("Error updating item:", error);
        }
    };

    const handleComment = async (itemId: string) => {
        if (!session?.user?.email || !commentText[itemId]?.trim()) return;

        try {
            await mutateFeedback({
                action: "comment",
                itemId,
                content: commentText[itemId].trim(),
                replyTo: replyingTo?.commentId || null,
                replyToContent: replyingTo?.content || null,
            });
            setCommentText(prev => ({ ...prev, [itemId]: "" }));
            setReplyingTo(null);
            await fetchItems();
        } catch (error) {
            console.error("Error adding comment:", error);
            alert(tx({ TR: "Yorum gönderilemedi. Lütfen tekrar deneyin.", EN: "The comment couldn't be sent. Please try again." }));
        }
    };

    // Delete comment
    const handleDeleteComment = async (itemId: string, comment: Comment) => {
        if (!session?.user?.email || comment.authorEmail !== session.user.email) return;

        try {
            await mutateFeedback({ action: "delete-comment", itemId, commentId: comment.id });
            fetchItems();
        } catch (error) {
            console.error("Error deleting comment:", error);
        }
    };

    // Edit comment
    const handleStartEditComment = (comment: Comment) => {
        setEditingCommentId(comment.id);
        setEditCommentContent(comment.content);
    };

    const handleSaveEditComment = async (itemId: string, commentId: string) => {
        if (!editCommentContent.trim()) return;

        try {
            await mutateFeedback({ action: "edit-comment", itemId, commentId, content: editCommentContent.trim() });
            setEditingCommentId(null);
            setEditCommentContent("");
            fetchItems();
        } catch (error) {
            console.error("Error updating comment:", error);
        }
    };

    const filteredItems = items.filter(item =>
        activeTab === "questions" ? item.type === "question" : item.type === "feedback"
    );
    const faqNeedle = faqQuery.trim().toLocaleLowerCase("tr-TR");
    const filteredFaqs = FAQS.filter((faq) => `${tx(faq.category)} ${tx(faq.question)} ${tx(faq.answer)}`.toLocaleLowerCase("tr-TR").includes(faqNeedle));

    return (
        <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white transition-colors">
            <Header />

            {/* Content */}
            <main id="main-content" className="max-w-5xl mx-auto px-4 sm:px-6 pb-12 pt-24">
                <section className="mb-10 overflow-hidden rounded-3xl border border-zinc-200 bg-zinc-950 p-7 text-white shadow-xl dark:border-zinc-800 sm:p-10">
                    <div className="flex items-center gap-2 text-sm font-semibold text-blue-300"><Sparkles className="h-4 w-4" /> {tx({ TR: "Yardım merkezi", EN: "Help center" })}</div>
                    <h1 className="mt-3 text-3xl md:text-5xl font-bold">{t("feedback_title") || "Geri Bildirim & SSS"}</h1>
                    <p className="mt-4 max-w-2xl text-zinc-400">{t("feedback_subtitle") || "Hızlı yanıtları bulun, bir fikir paylaşın veya incelenebilir bir hata ve güvenlik bildirimi oluşturun."}</p>
                    <div className="relative mt-7 max-w-2xl">
                        <Search className="absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
                        <input value={faqQuery} onChange={(event) => setFaqQuery(event.target.value)} placeholder={tx({ TR: "Bir konu, özellik veya hata ara…", EN: "Search a topic, feature or bug…" })} className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 py-3.5 ps-12 pe-4 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" />
                    </div>
                </section>

                <section className="mb-10 grid gap-3 md:grid-cols-2">
                    {filteredFaqs.map((faq) => {
                        const open = openFaq === faq.id;
                        return <article key={faq.id} className="self-start overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                            <button onClick={() => setOpenFaq(open ? null : faq.id)} aria-expanded={open} className="flex w-full items-start gap-3 p-5 text-start"><span className="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:bg-blue-950 dark:text-blue-300">{tx(faq.category)}</span><span className="flex-1 font-semibold">{tx(faq.question)}</span><ChevronDown className={`h-5 w-5 shrink-0 text-zinc-400 transition ${open ? "rotate-180" : ""}`} /></button>
                            {open && <div className="border-t border-zinc-200 px-5 py-4 text-sm leading-6 text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">{tx(faq.answer)}</div>}
                        </article>;
                    })}
                    {filteredFaqs.length === 0 && <div className="md:col-span-2 rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">{tx({ TR: "Bu aramayla eşleşen hazır yanıt yok. Aşağıdan yeni bir soru gönderin.", EN: "No ready answer matches this search. Send a new question below." })}</div>}
                </section>

                <div className="mb-8 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200"><ShieldCheck className="h-5 w-5 shrink-0" />{tx({ TR: "Güvenlik bildirimlerine hassas anahtar, gerçek parola veya kişisel veri eklemeyin. Kanıt için kod yerine mümkünse yeniden üretme adımlarını paylaşın.", EN: "Don't include secret keys, real passwords or personal data in security reports. Share reproduction steps instead of code where you can." })}</div>

                {/* Tabs */}
                <div className="flex justify-center gap-4 mb-8">
                    <button
                        onClick={() => setActiveTab("questions")}
                        className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${activeTab === "questions"
                            ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30"
                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                            }`}
                    >
                        <HelpCircle className="w-5 h-5" />
                        {t("feedback_questions_tab") || "Sıkça Sorulan Sorular"}
                    </button>
                    <button
                        onClick={() => setActiveTab("feedback")}
                        className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${activeTab === "feedback"
                            ? "bg-purple-600 text-white shadow-lg shadow-purple-500/30"
                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                            }`}
                    >
                        <MessageSquare className="w-5 h-5" />
                        {t("feedback_feedback_tab") || "Geri Bildirimler"}
                    </button>
                </div>

                {/* Submit Form */}
                {session?.user ? (
                    <div className="bg-zinc-100 dark:bg-zinc-900 rounded-2xl p-6 mb-8 border border-zinc-200 dark:border-zinc-800">
                        <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder={activeTab === "questions"
                                ? (t("feedback_question_placeholder") || "Sorunuzu yazın...")
                                : (t("feedback_feedback_placeholder") || "Geri bildiriminizi yazın...")
                            }
                            className="w-full h-24 p-4 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-xl resize-none focus:ring-2 focus:ring-blue-500 outline-none text-zinc-900 dark:text-white"
                        />

                        {/* Add Description Section */}
                        {!showDescriptionInput ? (
                            <button
                                onClick={() => setShowDescriptionInput(true)}
                                className="flex items-center gap-2 mt-3 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                            >
                                <PlusCircle className="w-4 h-4" />
                                {t("add_description") || "Açıklama Ekle"}
                            </button>
                        ) : (
                            <div className="mt-3">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                                        {t("add_description") || "Açıklama Ekle"}
                                    </span>
                                    <button
                                        onClick={() => { setShowDescriptionInput(false); setDescription(""); }}
                                        className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder={t("description_placeholder") || "Detaylı açıklama yazın..."}
                                    className="w-full h-24 p-4 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-xl resize-none focus:ring-2 focus:ring-blue-500 outline-none text-zinc-900 dark:text-white text-sm"
                                />
                            </div>
                        )}

                        <div className="flex gap-3 mt-4">
                            <button
                                onClick={() => handleSubmit("question")}
                                disabled={submitting || !message.trim()}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 text-white rounded-xl font-medium transition-colors"
                            >
                                <HelpCircle className="w-5 h-5" />
                                {t("feedback_submit_question") || "Soru Olarak Gönder"}
                            </button>
                            <button
                                onClick={() => handleSubmit("feedback")}
                                disabled={submitting || !message.trim()}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:opacity-50 text-white rounded-xl font-medium transition-colors"
                            >
                                <MessageSquare className="w-5 h-5" />
                                {t("feedback_submit_feedback") || "Geri Bildirim Olarak Gönder"}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 rounded-xl p-6 mb-8 text-center">
                        <p className="text-yellow-700 dark:text-yellow-400 mb-4">
                            {t("feedback_login_required") || "Soru veya geri bildirim göndermek için giriş yapmalısınız."}
                        </p>
                        <Link href="/login" className="inline-block px-6 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium transition-colors">
                            {t("login") || "Giriş Yap"}
                        </Link>
                    </div>
                )}

                {/* Items List */}
                <div className="space-y-4">
                    {loading ? (
                        <div className="text-center py-12 text-zinc-500">
                            {t("loading") || "Yükleniyor..."}
                        </div>
                    ) : filteredItems.length === 0 ? (
                        <div className="text-center py-12 text-zinc-500">
                            {activeTab === "questions"
                                ? (t("feedback_no_questions") || "Henüz soru yok. İlk soruyu siz sorun!")
                                : (t("feedback_no_feedback") || "Henüz geri bildirim yok. İlk geri bildirimi siz gönderin!")
                            }
                        </div>
                    ) : (
                        filteredItems.map(item => (
                            <div key={item.id} className="bg-zinc-50 dark:bg-zinc-900 rounded-xl p-6 border border-zinc-200 dark:border-zinc-800">
                                {/* Author, Type, and Actions */}
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        {item.authorPhoto ? (
                                            <OptimizedImage src={item.authorPhoto} alt={item.author} className="w-8 h-8 rounded-full object-cover cursor-pointer" referrerPolicy="no-referrer" onClick={() => { const p = authorProfiles[item.authorEmail]; if (p?.publicProfile !== false) setSelectedProfile({ ...p, email: item.authorEmail } as UserProfile); }} />
                                        ) : (
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center cursor-pointer" onClick={() => { const p = authorProfiles[item.authorEmail]; if (p?.publicProfile !== false) setSelectedProfile({ ...p, email: item.authorEmail } as UserProfile); }}>
                                                <User className="w-4 h-4 text-white" />
                                            </div>
                                        )}
                                        <button onClick={() => { const p = authorProfiles[item.authorEmail]; if (p?.publicProfile !== false) setSelectedProfile({ ...p, email: item.authorEmail } as UserProfile); }} className="font-medium text-zinc-700 dark:text-zinc-300 hover:text-blue-500 transition-colors">
                                            {authorProfiles[item.authorEmail]?.username || item.author}
                                            {authorProfiles[item.authorEmail]?.nickname && <span className="text-xs text-zinc-400 ml-1">{authorProfiles[item.authorEmail].nickname}#{authorProfiles[item.authorEmail].nicknameTag}</span>}
                                        </button>
                                        <span className={`px-2 py-0.5 rounded-full text-xs ${item.type === "question"
                                            ? "bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400"
                                            : "bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400"
                                            }`}>
                                            {item.type === "question" ? (t("question") || "Soru") : (t("feedback_label") || "Geri Bildirim")}
                                        </span>
                                    </div>

                                    {/* Edit/Delete buttons for owner */}
                                    {session?.user?.email === item.authorEmail && (
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleStartEditItem(item)}
                                                className="p-2 text-zinc-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                                                title={t("edit") || "Düzenle"}
                                            >
                                                <Edit3 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteItem(item.id)}
                                                className="p-2 text-zinc-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                                                title={t("delete_item") || "Sil"}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Content - Edit Mode or Display Mode */}
                                {editingItemId === item.id ? (
                                    <div className="mb-4">
                                        <textarea
                                            value={editContent}
                                            onChange={(e) => setEditContent(e.target.value)}
                                            className="w-full h-24 p-3 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 outline-none text-zinc-900 dark:text-white"
                                        />
                                        <textarea
                                            value={editDescription}
                                            onChange={(e) => setEditDescription(e.target.value)}
                                            placeholder={t("description_placeholder") || "Detaylı açıklama yazın..."}
                                            className="w-full h-16 p-3 mt-2 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 outline-none text-zinc-900 dark:text-white text-sm"
                                        />
                                        <div className="flex gap-2 mt-2">
                                            <button
                                                onClick={() => handleSaveEditItem(item.id)}
                                                className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors"
                                            >
                                                <Check className="w-4 h-4" />
                                                {t("save_changes") || "Değişiklikleri Kaydet"}
                                            </button>
                                            <button
                                                onClick={() => { setEditingItemId(null); setEditContent(""); setEditDescription(""); }}
                                                className="flex items-center gap-1 px-3 py-1.5 bg-zinc-500 hover:bg-zinc-600 text-white text-sm rounded-lg transition-colors"
                                            >
                                                <X className="w-4 h-4" />
                                                {t("cancel") || "Vazgeç"}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <p className="text-zinc-700 dark:text-zinc-300 mb-2">{item.content}</p>
                                        {/* Description Section */}
                                        {item.description && (
                                            <div className="bg-zinc-100 dark:bg-zinc-800 rounded-lg p-3 mb-4 border-l-4 border-blue-500">
                                                <p className="text-sm text-zinc-600 dark:text-zinc-400">{item.description}</p>
                                            </div>
                                        )}
                                    </>
                                )}

                                {/* Actions */}
                                <div className="flex items-center gap-4">
                                    <button
                                        onClick={() => handleLike(item.id)}
                                        disabled={!session?.user}
                                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors ${session?.user?.email && item.likes.includes(session.user.email)
                                            ? "bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400"
                                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                                            }`}
                                    >
                                        <ThumbsUp className="w-4 h-4" />
                                        <span>{item.likes.length}</span>
                                    </button>
                                    <button
                                        onClick={() => setShowComments(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                                    >
                                        <MessageCircle className="w-4 h-4" />
                                        <span>{item.comments.length}</span>
                                    </button>
                                </div>

                                {/* Comments Section */}
                                {showComments[item.id] && (
                                    <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-700">
                                        {/* Existing Comments */}
                                        {item.comments.length > 0 && (
                                            <div className="space-y-3 mb-4">
                                                {item.comments.map((comment) => (
                                                    <div key={comment.id} className="bg-zinc-100 dark:bg-zinc-800 rounded-lg p-3">
                                                        {/* Reply Quote (WhatsApp style) */}
                                                        {comment.replyToContent && (
                                                            <div className="bg-zinc-200 dark:bg-zinc-700 rounded-lg p-2 mb-2 border-l-4 border-green-500">
                                                                <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
                                                                    {comment.replyToContent}
                                                                </p>
                                                            </div>
                                                        )}

                                                        <div className="flex items-center justify-between">
                                                            <span className="font-medium text-sm text-zinc-700 dark:text-zinc-300">{comment.author}</span>

                                                            {/* Comment actions */}
                                                            <div className="flex items-center gap-1">
                                                                {session?.user && (
                                                                    <button
                                                                        onClick={() => {
                                                                            setReplyingTo({
                                                                                itemId: item.id,
                                                                                commentId: comment.id,
                                                                                author: comment.author,
                                                                                content: comment.content
                                                                            });
                                                                        }}
                                                                        className="p-1 text-zinc-400 hover:text-green-500 transition-colors"
                                                                        title={t("reply") || "Yanıtla"}
                                                                    >
                                                                        <Reply className="w-3 h-3" />
                                                                    </button>
                                                                )}
                                                                {session?.user?.email === comment.authorEmail && (
                                                                    <>
                                                                        <button
                                                                            onClick={() => handleStartEditComment(comment)}
                                                                            className="p-1 text-zinc-400 hover:text-blue-500 transition-colors"
                                                                            title={t("edit") || "Düzenle"}
                                                                        >
                                                                            <Edit3 className="w-3 h-3" />
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleDeleteComment(item.id, comment)}
                                                                            className="p-1 text-zinc-400 hover:text-red-500 transition-colors"
                                                                            title={t("delete_item") || "Sil"}
                                                                        >
                                                                            <Trash2 className="w-3 h-3" />
                                                                        </button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Edit comment mode */}
                                                        {editingCommentId === comment.id ? (
                                                            <div className="mt-2">
                                                                <input
                                                                    type="text"
                                                                    value={editCommentContent}
                                                                    onChange={(e) => setEditCommentContent(e.target.value)}
                                                                    className="w-full px-3 py-1.5 bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                                                />
                                                                <div className="flex gap-2 mt-2">
                                                                    <button
                                                                        onClick={() => handleSaveEditComment(item.id, comment.id)}
                                                                        className="px-2 py-1 bg-green-600 text-white text-xs rounded transition-colors"
                                                                    >
                                                                        <Check className="w-3 h-3" />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => { setEditingCommentId(null); setEditCommentContent(""); }}
                                                                        className="px-2 py-1 bg-zinc-500 text-white text-xs rounded transition-colors"
                                                                    >
                                                                        <X className="w-3 h-3" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <p className="text-sm text-zinc-600 dark:text-zinc-400">{comment.content}</p>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Add Comment */}
                                        {session?.user && (
                                            <div>
                                                {/* Reply indicator (WhatsApp style) */}
                                                {replyingTo && replyingTo.itemId === item.id && (
                                                    <div className="flex items-center justify-between bg-green-50 dark:bg-green-900/30 rounded-t-lg p-2 border-l-4 border-green-500">
                                                        <div>
                                                            <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                                                                {t("replying_to") || "Yanıtlanıyor:"} {replyingTo.author}
                                                            </span>
                                                            <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1">
                                                                {replyingTo.content}
                                                            </p>
                                                        </div>
                                                        <button
                                                            onClick={() => setReplyingTo(null)}
                                                            className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                )}
                                                <div className={`flex gap-2 ${replyingTo && replyingTo.itemId === item.id ? 'rounded-b-lg' : ''}`}>
                                                    <input
                                                        type="text"
                                                        value={commentText[item.id] || ""}
                                                        onChange={(e) => setCommentText(prev => ({ ...prev, [item.id]: e.target.value }))}
                                                        placeholder={t("feedback_comment_placeholder") || "Yorum yazın..."}
                                                        className="flex-1 px-4 py-2 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                                    />
                                                    <button
                                                        onClick={() => handleComment(item.id)}
                                                        disabled={!commentText[item.id]?.trim()}
                                                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                                                    >
                                                        <Send className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>

                {/* Back to Home */}
                <div className="mt-12 text-center">
                    <Link
                        href="/"
                        className="inline-block px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl transition-all shadow-lg"
                    >
                        {t("back_to_home") || "Ana Sayfaya Dön"}
                    </Link>
                </div>
            </main>

            <SiteFooter />

            {/* Profile Modal */}
            {selectedProfile && (
                <ProfileModal
                    user={selectedProfile}
                    isOpen={!!selectedProfile}
                    onClose={() => setSelectedProfile(null)}
                />
            )}
        </div>
    );
}
