/** News sources and categories shared by the server aggregator and the News page. */

export type NewsCategory = "ai" | "software" | "games" | "apps" | "science" | "finance";

export interface NewsSource {
    id: string;
    name: string;
    url: string;
    homepage: string;
    category: NewsCategory;
    language: "tr" | "en";
}

export const NEWS_CATEGORIES: Array<{ id: NewsCategory; tr: string; en: string; emoji: string }> = [
    { id: "ai", tr: "Yapay Zeka", en: "AI", emoji: "🤖" },
    { id: "software", tr: "Yazılım", en: "Software", emoji: "💻" },
    { id: "games", tr: "Oyun", en: "Games", emoji: "🎮" },
    { id: "apps", tr: "Uygulama & Teknoloji", en: "Apps & Tech", emoji: "📱" },
    { id: "science", tr: "Bilim & Uzay", en: "Science & Space", emoji: "🔭" },
    { id: "finance", tr: "Ekonomi & Finans", en: "Economy & Finance", emoji: "💹" },
];

/** Public RSS/Atom feeds. Only headlines, short excerpts and links are shown; every card links to the original. */
export const NEWS_SOURCES: NewsSource[] = [
    // Yapay zeka
    { id: "openai", name: "OpenAI", url: "https://openai.com/news/rss.xml", homepage: "https://openai.com/news/", category: "ai", language: "en" },
    { id: "google-ai", name: "Google AI", url: "https://blog.google/technology/ai/rss/", homepage: "https://blog.google/technology/ai/", category: "ai", language: "en" },
    { id: "huggingface", name: "Hugging Face", url: "https://huggingface.co/blog/feed.xml", homepage: "https://huggingface.co/blog", category: "ai", language: "en" },
    { id: "techcrunch-ai", name: "TechCrunch AI", url: "https://techcrunch.com/category/artificial-intelligence/feed/", homepage: "https://techcrunch.com/category/artificial-intelligence/", category: "ai", language: "en" },
    { id: "verge-ai", name: "The Verge AI", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", homepage: "https://www.theverge.com/ai-artificial-intelligence", category: "ai", language: "en" },
    // Yazılım
    { id: "github-blog", name: "GitHub Blog", url: "https://github.blog/feed/", homepage: "https://github.blog/", category: "software", language: "en" },
    { id: "hacker-news", name: "Hacker News", url: "https://hnrss.org/frontpage?points=150", homepage: "https://news.ycombinator.com/", category: "software", language: "en" },
    { id: "infoq", name: "InfoQ", url: "https://feed.infoq.com/", homepage: "https://www.infoq.com/", category: "software", language: "en" },
    { id: "ars-technica", name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/technology-lab", homepage: "https://arstechnica.com/", category: "software", language: "en" },
    // Oyun
    { id: "ign", name: "IGN", url: "https://feeds.ign.com/ign/all", homepage: "https://www.ign.com/", category: "games", language: "en" },
    { id: "polygon", name: "Polygon", url: "https://www.polygon.com/rss/index.xml", homepage: "https://www.polygon.com/", category: "games", language: "en" },
    { id: "pc-gamer", name: "PC Gamer", url: "https://www.pcgamer.com/rss/", homepage: "https://www.pcgamer.com/", category: "games", language: "en" },
    { id: "game-developer", name: "Game Developer", url: "https://www.gamedeveloper.com/rss.xml", homepage: "https://www.gamedeveloper.com/", category: "games", language: "en" },
    // Uygulama & teknoloji
    { id: "the-verge", name: "The Verge", url: "https://www.theverge.com/rss/index.xml", homepage: "https://www.theverge.com/", category: "apps", language: "en" },
    { id: "techcrunch", name: "TechCrunch", url: "https://techcrunch.com/feed/", homepage: "https://techcrunch.com/", category: "apps", language: "en" },
    { id: "engadget", name: "Engadget", url: "https://www.engadget.com/rss.xml", homepage: "https://www.engadget.com/", category: "apps", language: "en" },
    // Bilim
    { id: "nasa", name: "NASA", url: "https://www.nasa.gov/news-release/feed/", homepage: "https://www.nasa.gov/news/", category: "science", language: "en" },
    // Ekonomi & finans: döviz, altın, borsa, bankalar
    { id: "bbc-business", name: "BBC Business", url: "https://feeds.bbci.co.uk/news/business/rss.xml", homepage: "https://www.bbc.com/business", category: "finance", language: "en" },
    { id: "cnbc-finance", name: "CNBC Finance", url: "https://www.cnbc.com/id/10000664/device/rss/rss.html", homepage: "https://www.cnbc.com/finance/", category: "finance", language: "en" },
    { id: "marketwatch", name: "MarketWatch", url: "https://feeds.content.dowjones.io/public/rss/mw_topstories", homepage: "https://www.marketwatch.com/", category: "finance", language: "en" },
    { id: "yahoo-finance", name: "Yahoo Finance", url: "https://finance.yahoo.com/news/rssindex", homepage: "https://finance.yahoo.com/", category: "finance", language: "en" },
    { id: "guardian-business", name: "The Guardian Business", url: "https://www.theguardian.com/uk/business/rss", homepage: "https://www.theguardian.com/uk/business", category: "finance", language: "en" },
    { id: "bloomberght", name: "Bloomberg HT", url: "https://www.bloomberght.com/rss", homepage: "https://www.bloomberght.com/", category: "finance", language: "tr" },
    { id: "aa-ekonomi", name: "AA Ekonomi", url: "https://www.aa.com.tr/tr/rss/default?cat=ekonomi", homepage: "https://www.aa.com.tr/tr/ekonomi", category: "finance", language: "tr" },
    { id: "ntv-ekonomi", name: "NTV Ekonomi", url: "https://www.ntv.com.tr/ekonomi.rss", homepage: "https://www.ntv.com.tr/ekonomi", category: "finance", language: "tr" },
    { id: "haberturk-ekonomi", name: "Habertürk Ekonomi", url: "https://www.haberturk.com/rss/ekonomi.xml", homepage: "https://www.haberturk.com/ekonomi", category: "finance", language: "tr" },
    { id: "hurriyet-ekonomi", name: "Hürriyet Ekonomi", url: "https://www.hurriyet.com.tr/rss/ekonomi", homepage: "https://www.hurriyet.com.tr/ekonomi/", category: "finance", language: "tr" },
    { id: "paraanaliz", name: "Paraanaliz", url: "https://www.paraanaliz.com/feed/", homepage: "https://www.paraanaliz.com/", category: "finance", language: "tr" },
    // Türkçe kaynaklar
    { id: "webtekno", name: "Webtekno", url: "https://www.webtekno.com/rss.xml", homepage: "https://www.webtekno.com/", category: "apps", language: "tr" },
    { id: "shiftdelete", name: "ShiftDelete.Net", url: "https://shiftdelete.net/feed", homepage: "https://shiftdelete.net/", category: "apps", language: "tr" },
    { id: "donanimhaber", name: "DonanımHaber", url: "https://www.donanimhaber.com/rss/tum/", homepage: "https://www.donanimhaber.com/", category: "apps", language: "tr" },
    { id: "teknoblog", name: "Teknoblog", url: "https://www.teknoblog.com/feed/", homepage: "https://www.teknoblog.com/", category: "software", language: "tr" },
    { id: "log", name: "Log", url: "https://www.log.com.tr/feed/", homepage: "https://www.log.com.tr/", category: "apps", language: "tr" },
    { id: "merlinin-kazani", name: "Merlin'in Kazanı", url: "https://www.merlininkazani.com/rss", homepage: "https://www.merlininkazani.com/", category: "games", language: "tr" },
];

const AI_PATTERN = /\b(ai|a\.i\.|artificial intelligence|yapay zek[aâ]|llm|gpt|chatgpt|openai|gemini|claude|anthropic|copilot|deepseek|mistral|llama|machine learning|makine öğrenme|neural|sinir ağı|agent|ajan|model)\b/i;
const GAMES_PATTERN = /\b(game|games|gaming|oyun|oyunu|playstation|xbox|nintendo|steam|switch 2|esports|e-spor|unity|unreal|godot)\b/i;
const FINANCE_PATTERN = /\b(dolar|euro|avro|sterlin|döviz|kur|altın|gram altın|ons|borsa|bist|hisse|faiz|enflasyon|merkez bankası|tcmb|banka|bankacılık|kredi|mevduat|tahvil|kripto|bitcoin|ethereum|piyasa|stock|stocks|shares|market|markets|wall street|nasdaq|s&p|dow jones|inflation|interest rate|fed|central bank|ecb|bank|banking|bond|bonds|forex|currency|gold|crypto|earnings|ipo)\b/i;
const SOFTWARE_PATTERN = /\b(developer|geliştirici|programming|programlama|javascript|typescript|python|rust|golang|kotlin|swift|react|next\.js|github|open source|açık kaynak|api|sdk|framework|linux|kernel|compiler|derleyici|database|veritabanı)\b/i;

/** Extra topic tags inferred from the headline (a headline can belong to several). */
export function inferTags(title: string, summary: string, base: NewsCategory): NewsCategory[] {
    const text = `${title} ${summary}`;
    const tags = new Set<NewsCategory>([base]);
    if (AI_PATTERN.test(text)) tags.add("ai");
    if (GAMES_PATTERN.test(text)) tags.add("games");
    if (SOFTWARE_PATTERN.test(text)) tags.add("software");
    // Finance words are common in business tech news; only finance-heavy tech stories get the tag.
    if (base !== "finance" && FINANCE_PATTERN.test(title) && /\b(borsa|bist|dolar|altın|faiz|enflasyon|stock|shares|ipo|earnings|bitcoin|crypto|kripto|bank|banka)\b/i.test(title)) tags.add("finance");
    return [...tags];
}
