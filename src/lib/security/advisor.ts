/**
 * Hanogt Security Advisor — static, in-browser code review.
 * Nothing leaves the device: rules are plain regular expressions evaluated locally.
 * Findings are hints for developers, not proof of a vulnerability.
 */

import type { Copy } from "@/lib/i18n";
import { detectSignatures } from "./signatures";

export type AdvisorSeverity = "critical" | "high" | "medium" | "low" | "info";
export type AdvisorCategory = "secret" | "injection" | "xss" | "crypto" | "transport" | "config" | "deserialization" | "memory" | "privacy" | "abuse";
export type CodeLanguage = "python" | "javascript" | "typescript" | "csharp" | "cpp" | "c" | "java" | "php" | "go" | "rust" | "kotlin" | "swift" | "ruby" | "lua" | "sql" | "html" | "shell" | "unknown";

interface AdvisorRule {
    id: string;
    category: AdvisorCategory;
    severity: AdvisorSeverity;
    title: Copy;
    why: Copy;
    fix: Copy;
    pattern: RegExp;
    languages?: CodeLanguage[];
    secret?: boolean;
    ignoreLine?: RegExp;
}

export interface AdvisorFinding {
    id: string;
    category: AdvisorCategory;
    severity: AdvisorSeverity;
    title: Copy;
    why: Copy;
    fix: Copy;
    line: number;
    snippet: string;
}

export interface AdvisorReport {
    language: CodeLanguage;
    lines: number;
    findings: AdvisorFinding[];
    counts: Record<AdvisorSeverity, number>;
    score: number;
    grade: "A" | "B" | "C" | "D" | "F";
    /** True when the Hanogt runner / publishing guard would refuse this code. */
    blockedByGuard: boolean;
}

const PLACEHOLDER = /(?:your[_-]?|example|changeme|change_me|placeholder|xxx+|\*{3,}|<[^>]+>|\$\{|process\.env|os\.environ|getenv|dummy|sample|todo|redacted|\.\.\.)/i;
const C_LIKE: CodeLanguage[] = ["c", "cpp"];

const RULES: AdvisorRule[] = [
    // --------------------------------------------------------------- Secrets
    { id: "private-key", category: "secret", severity: "critical", secret: true, pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/g, title: { TR: "Özel anahtar kodun içinde", EN: "Private key embedded in code" }, why: { TR: "Özel anahtarı ele geçiren kişi sunucularına, imzalarına veya şifreli verilerine erişebilir.", EN: "Anyone with the private key can access your servers, signatures or encrypted data." }, fix: { TR: "Anahtarı hemen iptal edip yenisini üret; kodda değil gizli bir dosyada ya da gizli yönetim servisinde tut.", EN: "Revoke and rotate the key now; keep it in a secret store, not in code." } },
    { id: "aws-access-key", category: "secret", severity: "critical", secret: true, pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, title: { TR: "AWS erişim anahtarı", EN: "AWS access key" }, why: { TR: "Sızan AWS anahtarları dakikalar içinde botlar tarafından bulunup kötüye kullanılır (fatura, veri sızıntısı).", EN: "Leaked AWS keys are found by bots within minutes and abused (bills, data theft)." }, fix: { TR: "Anahtarı IAM'den devre dışı bırak, yenisini ortam değişkeninde sakla.", EN: "Deactivate it in IAM and keep the new one in environment variables." } },
    { id: "service-account", category: "secret", severity: "critical", secret: true, pattern: /"private_key_id"\s*:\s*"[a-f0-9]{16,}"/g, title: { TR: "Servis hesabı JSON anahtarı", EN: "Service account JSON key" }, why: { TR: "Google Cloud/Firebase servis hesabı anahtarı tüm projeye yönetici erişimi verebilir.", EN: "A Google Cloud/Firebase service account key can grant admin access to the whole project." }, fix: { TR: "Anahtarı konsoldan sil, yenisini yalnızca sunucuda gizli değişken olarak kullan.", EN: "Delete it in the console and use a new one only as a server-side secret." } },
    { id: "github-token", category: "secret", severity: "critical", secret: true, pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{60,255})\b/g, title: { TR: "GitHub erişim jetonu", EN: "GitHub access token" }, why: { TR: "Depolarına kod yazma, gizli depoları okuma yetkisi verebilir.", EN: "It may allow pushing code and reading private repositories." }, fix: { TR: "GitHub ayarlarından jetonu iptal et; gerekirse en az yetkili, süreli bir jeton kullan.", EN: "Revoke it in GitHub settings; use a short-lived, least-privilege token." } },
    { id: "stripe-secret", category: "secret", severity: "critical", secret: true, pattern: /\b(?:sk|rk)_live_[0-9a-zA-Z]{24,}\b/g, title: { TR: "Canlı ödeme (Stripe) gizli anahtarı", EN: "Live Stripe secret key" }, why: { TR: "Ödeme hesabında işlem yapma yetkisi verir.", EN: "It can perform actions on your payment account." }, fix: { TR: "Stripe panelinden anahtarı yenile ve sadece sunucuda kullan.", EN: "Roll the key in the Stripe dashboard and use it only on the server." } },
    { id: "ai-api-key", category: "secret", severity: "high", secret: true, pattern: /\bsk-(?:proj-|svcacct-|admin-|ant-(?:api\d{2}-)?)?[A-Za-z0-9_-]{20,}\b/g, title: { TR: "Yapay zeka API anahtarı (OpenAI/Anthropic vb.)", EN: "AI API key (OpenAI/Anthropic etc.)" }, why: { TR: "Başkaları senin hesabından ücretli istek yapabilir.", EN: "Others could make paid requests on your account." }, fix: { TR: "Anahtarı iptal et; istekleri kendi sunucundan, gizli değişkenle yap.", EN: "Revoke it; call the API from your own server with a secret variable." } },
    { id: "slack-token", category: "secret", severity: "high", secret: true, pattern: /\bxox[abposr]-[0-9A-Za-z-]{10,}\b/g, title: { TR: "Slack jetonu", EN: "Slack token" }, why: { TR: "Çalışma alanındaki mesajlara erişim sağlayabilir.", EN: "It may give access to workspace messages." }, fix: { TR: "Jetonu Slack yönetiminden iptal et.", EN: "Revoke it in Slack admin." } },
    { id: "discord-webhook", category: "secret", severity: "high", secret: true, pattern: /https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]{20,}/g, title: { TR: "Discord webhook adresi", EN: "Discord webhook URL" }, why: { TR: "Adresi bilen herkes kanalına mesaj/spam gönderebilir.", EN: "Anyone with the URL can post (spam) to your channel." }, fix: { TR: "Webhook'u sil ve yenisini gizli tut.", EN: "Delete the webhook and keep the new one secret." } },
    { id: "discord-bot-token", category: "secret", severity: "high", secret: true, pattern: /\b[MNO][A-Za-z\d_-]{23,27}\.[\w-]{6}\.[\w-]{27,40}\b/g, title: { TR: "Discord bot jetonu", EN: "Discord bot token" }, why: { TR: "Botunun tam kontrolünü verir.", EN: "It gives full control of your bot." }, fix: { TR: "Developer Portal'dan jetonu sıfırla.", EN: "Reset the token in the Developer Portal." } },
    { id: "telegram-bot-token", category: "secret", severity: "high", secret: true, pattern: /\b\d{8,10}:AA[A-Za-z0-9_-]{33}\b/g, title: { TR: "Telegram bot jetonu", EN: "Telegram bot token" }, why: { TR: "Botun adına mesaj gönderilebilir, güncellemeler okunabilir.", EN: "Messages can be sent and updates read as your bot." }, fix: { TR: "@BotFather ile jetonu iptal et.", EN: "Revoke it with @BotFather." } },
    { id: "db-credentials-url", category: "secret", severity: "high", secret: true, pattern: /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|mariadb|rediss?|amqps?|mssql):\/\/[^\s:@/'"]+:[^\s@/'"]{3,}@/gi, title: { TR: "Parolalı veritabanı bağlantı adresi", EN: "Database URL with password" }, why: { TR: "Veritabanına doğrudan erişim bilgisi kodda duruyor.", EN: "Direct database credentials sit in the code." }, fix: { TR: "Bağlantı adresini ortam değişkenine taşı ve parolayı değiştir.", EN: "Move the URL into an environment variable and change the password." } },
    { id: "google-api-key", category: "secret", severity: "medium", secret: true, pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g, title: { TR: "Google/Firebase API anahtarı", EN: "Google/Firebase API key" }, why: { TR: "Firebase web anahtarları istemcide görünür olacak şekilde tasarlanır; ama kısıtlanmamış Google API anahtarları kotanı tüketebilir.", EN: "Firebase web keys are meant to be public, but unrestricted Google API keys can burn your quota." }, fix: { TR: "Anahtara HTTP referrer/uygulama kısıtlaması ekle; güvenliği Firestore kurallarıyla sağla.", EN: "Add HTTP referrer/app restrictions; enforce security with Firestore rules." } },
    { id: "jwt-token", category: "secret", severity: "medium", secret: true, pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, title: { TR: "Koda gömülü JWT", EN: "JWT embedded in code" }, why: { TR: "Geçerli bir oturum jetonu başkasının senin yerine giriş yapmasını sağlayabilir.", EN: "A valid session token lets someone act as you." }, fix: { TR: "Jetonu koddan kaldır; gerekirse oturumu sonlandır.", EN: "Remove the token from code and end the session if needed." } },
    { id: "bearer-token", category: "secret", severity: "medium", secret: true, pattern: /Bearer\s+[A-Za-z0-9._~+/-]{24,}/g, ignoreLine: PLACEHOLDER, title: { TR: "Sabit yazılmış Bearer jetonu", EN: "Hard-coded bearer token" }, why: { TR: "Kodu gören herkes bu jetonla API'ye erişebilir.", EN: "Anyone who sees the code can call the API." }, fix: { TR: "Jetonu gizli değişkenden oku.", EN: "Read the token from a secret variable." } },
    { id: "hardcoded-password", category: "secret", severity: "medium", secret: true, pattern: /\b(?:password|passwd|pwd|parola|sifre|şifre|secret|api[_-]?key|apikey|access[_-]?token|auth[_-]?token|client[_-]?secret)\b["']?\s*[:=]\s*["'`][^"'`\s]{6,}["'`]/gi, ignoreLine: PLACEHOLDER, title: { TR: "Koda yazılmış parola veya anahtar", EN: "Hard-coded password or key" }, why: { TR: "Kaynak kod paylaşıldığında (GitHub, Media) gizli bilgi de paylaşılır.", EN: "When source is shared (GitHub, Media) the secret goes with it." }, fix: { TR: "Değeri ortam değişkeninden veya gizli yöneticiden oku; bu değeri değiştir.", EN: "Read it from an environment variable or secret manager and rotate it." } },

    // --------------------------------------------------------------- Injection
    { id: "sql-concat", category: "injection", severity: "high", pattern: /\b(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b[^;\n]{0,200}["'`]\s*(?:\+|\.\s|\|\|)\s*[A-Za-z_$][\w$.[\]]*/gi, title: { TR: "SQL sorgusu metin birleştirmeyle kuruluyor", EN: "SQL query built by string concatenation" }, why: { TR: "Kullanıcı girdisi sorguya karışırsa SQL enjeksiyonuyla veritabanı okunabilir veya silinebilir.", EN: "If user input reaches the query, SQL injection can read or wipe the database." }, fix: { TR: "Parametreli sorgu kullan: cursor.execute(\"... WHERE id = ?\", (id,)).", EN: "Use parameterized queries: cursor.execute(\"... WHERE id = ?\", (id,))." } },
    { id: "sql-interpolation", category: "injection", severity: "high", pattern: /(?:\b(?:execute|query|raw|exec|executeQuery|rawQuery)\s*\(\s*(?:f["'][^"'\n]{0,300}\b(?:SELECT|INSERT|UPDATE|DELETE)\b[^"'\n]{0,300}\{|`[^`]{0,300}\b(?:SELECT|INSERT|UPDATE|DELETE)\b[^`]{0,300}\$\{|["'][^"'\n]{0,300}\b(?:SELECT|INSERT|UPDATE|DELETE)\b[^"'\n]{0,300}["']\s*%\s*[\w(])|\b(?:SELECT|INSERT|UPDATE|DELETE)\b[^"'\n]{0,200}["']\s*\.format\s*\()/gi, title: { TR: "SQL sorgusuna değişken gömülüyor", EN: "Variables interpolated into SQL" }, why: { TR: "f-string, format() veya şablon dizesi ile kurulan sorgular SQL enjeksiyonuna açıktır.", EN: "Queries built with f-strings, format() or template strings are open to SQL injection." }, fix: { TR: "Sürücünün parametre bağlama özelliğini kullan (?, %s, :ad).", EN: "Use the driver's parameter binding (?, %s, :name)." } },
    { id: "command-injection", category: "injection", severity: "high", pattern: /\b(?:os\.system|os\.popen|child_process\.exec(?:Sync)?|execSync|Runtime\.getRuntime\(\)\.exec|shell_exec|passthru|popen|system)\s*\(\s*[^)\n]{0,200}(?:\+\s*[A-Za-z_$]|\$\{|%\s*[\w(]|\.format\(|f["']|\$_(?:GET|POST|REQUEST|COOKIE))/g, title: { TR: "Kabuk komutuna değişken ekleniyor", EN: "Variables concatenated into a shell command" }, why: { TR: "Girdi içinde ; veya && olursa saldırgan sunucuda istediği komutu çalıştırabilir.", EN: "With ; or && in the input an attacker can run any command on the server." }, fix: { TR: "Komutu argüman listesiyle çalıştır (subprocess.run([\"ls\", yol])) ve girdiyi doğrula.", EN: "Pass arguments as a list (subprocess.run([\"ls\", path])) and validate input." } },
    { id: "shell-true", category: "injection", severity: "medium", pattern: /subprocess\.\w+\s*\([^)\n]{0,300}shell\s*=\s*True/g, languages: ["python", "unknown"], title: { TR: "subprocess ile shell=True", EN: "subprocess with shell=True" }, why: { TR: "Komut kabuk tarafından yorumlanır; girdi karışırsa enjeksiyon olur.", EN: "The shell interprets the command; mixed input leads to injection." }, fix: { TR: "shell=False ve argüman listesi kullan.", EN: "Use shell=False with an argument list." } },
    { id: "eval-user-input", category: "injection", severity: "critical", pattern: /\b(?:eval|exec)\s*\(\s*(?:input\s*\(|request\.|req\.(?:body|query|params)|\$_(?:GET|POST|REQUEST)|params\[|sys\.argv|location\.(?:hash|search))/g, title: { TR: "Kullanıcı girdisi eval/exec ile çalıştırılıyor", EN: "User input executed with eval/exec" }, why: { TR: "Girdiyi kod olarak çalıştırmak, kullanıcıya uygulamanın tam kontrolünü verir.", EN: "Running input as code hands full control to the user." }, fix: { TR: "eval kullanma; ast.literal_eval, JSON.parse veya açık bir eşleme tablosu kullan.", EN: "Avoid eval; use ast.literal_eval, JSON.parse or an explicit lookup table." } },
    { id: "eval-usage", category: "injection", severity: "medium", pattern: /(?<![\w.])eval\s*\(/g, languages: ["javascript", "typescript", "python", "php", "ruby", "unknown"], title: { TR: "eval kullanımı", EN: "Use of eval" }, why: { TR: "Dinamik kod çalıştırma hataya ve enjeksiyona çok açıktır.", EN: "Dynamic code execution is error-prone and injection-prone." }, fix: { TR: "Mümkünse eval yerine güvenli ayrıştırıcılar kullan.", EN: "Prefer safe parsers over eval." } },
    { id: "new-function", category: "injection", severity: "medium", pattern: /\bnew\s+Function\s*\(/g, languages: ["javascript", "typescript", "unknown"], title: { TR: "new Function ile dinamik kod", EN: "Dynamic code via new Function" }, why: { TR: "eval ile aynı riskleri taşır.", EN: "It carries the same risks as eval." }, fix: { TR: "Fonksiyonu doğrudan tanımla.", EN: "Define the function directly." } },
    { id: "path-traversal", category: "injection", severity: "high", pattern: /\b(?:open|readFile(?:Sync)?|createReadStream|sendFile|file_get_contents|fopen|File\.ReadAllText|new\s+File(?:Reader|InputStream)?)\s*\([^)\n]{0,200}(?:req\.(?:query|params|body)|request\.(?:args|GET|POST|form|query|files)|\$_(?:GET|POST|REQUEST)|params\[|input\s*\()/g, title: { TR: "Dosya yolu kullanıcıdan geliyor", EN: "File path comes from the user" }, why: { TR: "../../etc/passwd gibi yollarla izin verilmeyen dosyalar okunabilir.", EN: "Paths like ../../etc/passwd can read forbidden files." }, fix: { TR: "Yolu güvenli bir klasöre sabitle, normalize et ve izin verilen dosya adlarını kontrol et.", EN: "Pin paths to a safe folder, normalize them and allow-list names." } },
    { id: "ssrf", category: "injection", severity: "medium", pattern: /\b(?:requests\.(?:get|post)|fetch|axios\.(?:get|post)|urlopen|http\.get|file_get_contents)\s*\(\s*[^)\n]{0,120}(?:req\.(?:query|params|body)|request\.(?:args|GET|POST|form)|\$_(?:GET|POST|REQUEST))/g, title: { TR: "Sunucu, kullanıcının verdiği adrese istek atıyor (SSRF)", EN: "Server fetches a user-supplied URL (SSRF)" }, why: { TR: "Saldırgan iç ağdaki servislere veya bulut kimlik uç noktalarına ulaşabilir.", EN: "Attackers can reach internal services or cloud metadata endpoints." }, fix: { TR: "Adresleri izin listesiyle sınırla, iç IP'leri engelle.", EN: "Allow-list hosts and block internal IPs." } },
    { id: "open-redirect", category: "injection", severity: "medium", pattern: /\b(?:res\.redirect|redirect|header\s*\(\s*["']Location:)\s*\(?\s*[^)\n]{0,120}(?:req\.(?:query|params|body)|request\.(?:args|GET)|\$_(?:GET|REQUEST))/g, title: { TR: "Açık yönlendirme", EN: "Open redirect" }, why: { TR: "Oltalama bağlantıları senin alan adınla güvenilir görünür.", EN: "Phishing links look trustworthy under your domain." }, fix: { TR: "Yalnızca göreli yollar veya izinli alan adlarına yönlendir.", EN: "Redirect only to relative paths or allowed domains." } },

    // --------------------------------------------------------------- XSS
    { id: "inner-html", category: "xss", severity: "medium", pattern: /\.(?:innerHTML|outerHTML)\s*\+?=/g, ignoreLine: /\.(?:innerHTML|outerHTML)\s*=\s*(?:(["'`])\1|["'][^"'+$]*["']\s*;?\s*$)/, title: { TR: "innerHTML'e dinamik içerik", EN: "Dynamic content assigned to innerHTML" }, why: { TR: "İçerik kullanıcıdan geliyorsa <script> veya onerror ile XSS saldırısı yapılabilir.", EN: "User-controlled content enables XSS via <script> or onerror." }, fix: { TR: "textContent kullan ya da HTML'i DOMPurify ile temizle.", EN: "Use textContent or sanitize HTML with DOMPurify." } },
    { id: "document-write", category: "xss", severity: "medium", pattern: /\bdocument\.write(?:ln)?\s*\(/g, title: { TR: "document.write kullanımı", EN: "document.write usage" }, why: { TR: "XSS'e açıktır ve sayfa performansını bozar.", EN: "It is XSS-prone and hurts performance." }, fix: { TR: "DOM API'leri (createElement, textContent) kullan.", EN: "Use DOM APIs (createElement, textContent)." } },
    { id: "dangerously-set-inner-html", category: "xss", severity: "medium", pattern: /dangerouslySetInnerHTML\s*=\s*\{\{/g, title: { TR: "dangerouslySetInnerHTML", EN: "dangerouslySetInnerHTML" }, why: { TR: "Temizlenmemiş HTML, React'in XSS korumasını devre dışı bırakır.", EN: "Unsanitized HTML bypasses React's XSS protection." }, fix: { TR: "HTML'i DOMPurify gibi bir kütüphaneyle temizle veya düz metin göster.", EN: "Sanitize with DOMPurify or render plain text." } },
    { id: "v-html", category: "xss", severity: "medium", pattern: /\sv-html\s*=/g, title: { TR: "Vue v-html", EN: "Vue v-html" }, why: { TR: "Ham HTML basar; XSS'e açıktır.", EN: "Renders raw HTML; XSS-prone." }, fix: { TR: "Metni {{ }} ile göster veya içeriği temizle.", EN: "Render text with {{ }} or sanitize it." } },
    { id: "target-blank", category: "xss", severity: "low", pattern: /target\s*=\s*["']_blank["'](?![^>]{0,200}rel\s*=\s*["'][^"']*noopener)/gi, title: { TR: "target=\"_blank\" ama rel=\"noopener\" yok", EN: "target=\"_blank\" without rel=\"noopener\"" }, why: { TR: "Açılan sayfa window.opener ile senin sekmeni yönlendirebilir (tabnabbing).", EN: "The opened page can redirect your tab via window.opener (tabnabbing)." }, fix: { TR: "rel=\"noopener noreferrer\" ekle.", EN: "Add rel=\"noopener noreferrer\"." } },
    { id: "postmessage-star", category: "xss", severity: "low", pattern: /postMessage\s*\([^)\n]{0,200},\s*["']\*["']\s*\)/g, title: { TR: "postMessage hedefi \"*\"", EN: "postMessage target \"*\"" }, why: { TR: "Mesaj, beklenmeyen bir sayfaya da ulaşabilir.", EN: "The message may reach an unexpected origin." }, fix: { TR: "Hedef origin'i açıkça yaz.", EN: "Specify the target origin explicitly." } },

    // --------------------------------------------------------------- Crypto
    { id: "weak-password-hash", category: "crypto", severity: "high", pattern: /\b(?:md5|sha1)\b[^\n]{0,80}\b(?:password|passwd|parola|sifre|şifre|pwd)\b|\b(?:password|passwd|parola|sifre|şifre|pwd)\b[^\n]{0,80}\b(?:md5|sha1)\b/gi, title: { TR: "Parola MD5/SHA-1 ile özetleniyor", EN: "Password hashed with MD5/SHA-1" }, why: { TR: "Bu algoritmalar saniyede milyarlarca tahminle kırılır.", EN: "These hashes are cracked at billions of guesses per second." }, fix: { TR: "Parolalar için bcrypt, scrypt veya Argon2 kullan.", EN: "Use bcrypt, scrypt or Argon2 for passwords." } },
    { id: "weak-hash", category: "crypto", severity: "low", pattern: /\b(?:hashlib\.(?:md5|sha1)|MessageDigest\.getInstance\(\s*["'](?:MD5|SHA-?1)["']|createHash\(\s*["'](?:md5|sha1)["']|MD5\.Create\(|SHA1\.Create\()/gi, title: { TR: "MD5/SHA-1 kullanımı", EN: "MD5/SHA-1 usage" }, why: { TR: "Dosya sağlama toplamı için sorun değil; imza veya güvenlik için çakışmaya açıktır.", EN: "Fine for checksums; collision-prone for signatures or security." }, fix: { TR: "Güvenlik amaçlı SHA-256 veya daha güçlüsünü kullan.", EN: "Use SHA-256 or stronger for security." } },
    { id: "insecure-random", category: "crypto", severity: "medium", pattern: /(?:Math\.random\(\)|random\.(?:random|randint|choice|choices|randrange)\s*\(|new\s+Random\s*\(|\brand\s*\(\s*\))[^\n]{0,80}\b(?:token|secret|password|parola|sifre|şifre|otp|salt|nonce|session|apikey|api_key)\b|\b(?:token|secret|password|parola|sifre|şifre|otp|salt|nonce|session)\b[^\n]{0,80}(?:Math\.random\(\)|random\.(?:random|randint|choice|choices|randrange)\s*\()/gi, title: { TR: "Güvenlik için tahmin edilebilir rastgelelik", EN: "Predictable randomness for security" }, why: { TR: "Math.random / random modülü kriptografik değildir; üretilen jetonlar tahmin edilebilir.", EN: "Math.random / random are not cryptographic; tokens become guessable." }, fix: { TR: "crypto.getRandomValues, crypto.randomUUID veya Python'da secrets modülünü kullan.", EN: "Use crypto.getRandomValues, crypto.randomUUID or Python's secrets module." } },
    { id: "weak-cipher", category: "crypto", severity: "high", pattern: /(?:Cipher\.getInstance\(\s*["'](?:DES|DESede|RC4|AES\/ECB)|DES\.new\(|ARC4\.new\(|AES\.MODE_ECB|createCipheriv\(\s*["'](?:des|rc4|aes-\d+-ecb)|CipherMode\.ECB|DESCryptoServiceProvider|RC2CryptoServiceProvider)/gi, title: { TR: "Zayıf şifreleme (DES/RC4/ECB)", EN: "Weak encryption (DES/RC4/ECB)" }, why: { TR: "Bu algoritmalar/kiplikler kırılmıştır ya da desenleri ele verir.", EN: "These algorithms/modes are broken or leak patterns." }, fix: { TR: "AES-GCM veya ChaCha20-Poly1305 kullan.", EN: "Use AES-GCM or ChaCha20-Poly1305." } },
    { id: "jwt-no-verify", category: "crypto", severity: "high", pattern: /algorithms?\s*[:=]\s*\[?\s*["']none["']|["']verify_signature["']\s*:\s*False|jwt\.decode\([^)\n]{0,200}verify\s*=\s*False/gi, title: { TR: "JWT imzası doğrulanmıyor", EN: "JWT signature not verified" }, why: { TR: "Saldırgan istediği kullanıcı olarak jeton üretebilir.", EN: "Attackers can forge tokens for any user." }, fix: { TR: "İmzayı her zaman doğrula ve izinli algoritmaları açıkça belirt.", EN: "Always verify signatures and pin allowed algorithms." } },
    { id: "jwt-hardcoded-secret", category: "crypto", severity: "high", pattern: /jwt\.(?:sign|encode)\s*\([^)\n]{0,200},\s*["'][^"'\n]{3,}["']/g, ignoreLine: PLACEHOLDER, title: { TR: "JWT gizli anahtarı koda yazılmış", EN: "Hard-coded JWT secret" }, why: { TR: "Anahtarı bilen herkes geçerli oturum jetonu üretebilir.", EN: "Anyone with the secret can mint valid session tokens." }, fix: { TR: "Uzun, rastgele bir anahtarı ortam değişkeninden oku.", EN: "Load a long random secret from the environment." } },

    // --------------------------------------------------------------- Transport & config
    { id: "tls-verify-disabled", category: "transport", severity: "high", pattern: /verify\s*=\s*False|rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["']?0|InsecureSkipVerify\s*:\s*true|CURLOPT_SSL_VERIFY(?:PEER|HOST)\s*,\s*(?:0|false)|ServerCertificateValidationCallback\s*[+]?=[^\n]{0,80}true|trustAllCerts|ALLOW_ALL_HOSTNAME_VERIFIER/gi, title: { TR: "TLS sertifika doğrulaması kapatılmış", EN: "TLS certificate verification disabled" }, why: { TR: "Araya giren biri (ortadaki adam) trafiği okuyup değiştirebilir.", EN: "A man-in-the-middle can read and alter the traffic." }, fix: { TR: "Doğrulamayı açık bırak; gerekiyorsa doğru CA sertifikasını ekle.", EN: "Keep verification on; add the proper CA certificate if needed." } },
    { id: "insecure-http", category: "transport", severity: "low", pattern: /["'`]http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|example\.|schemas\.|www\.w3\.org|xmlns)[^"'`\s]{3,}["'`]/g, title: { TR: "Şifresiz HTTP adresi", EN: "Unencrypted HTTP URL" }, why: { TR: "Veriler ağda açık metin olarak taşınır.", EN: "Data travels as plain text on the network." }, fix: { TR: "https:// kullan.", EN: "Use https://." } },
    { id: "debug-mode", category: "config", severity: "medium", pattern: /\bapp\.run\([^)\n]*debug\s*=\s*True|^\s*DEBUG\s*=\s*True\b|display_errors["']?\s*[,=]\s*["']?(?:1|On)\b/gim, title: { TR: "Hata ayıklama modu açık", EN: "Debug mode enabled" }, why: { TR: "Canlı ortamda hata sayfaları kaynak kodu ve gizli bilgileri sızdırabilir; Flask debug konsolu kod çalıştırmaya izin verir.", EN: "In production, debug pages can leak source and secrets; the Flask debugger allows code execution." }, fix: { TR: "Canlıda debug'ı kapat, ayarı ortam değişkenine bağla.", EN: "Disable debug in production and drive it from an env var." } },
    { id: "cors-wildcard", category: "config", severity: "medium", pattern: /Access-Control-Allow-Origin["']?\s*[,:]\s*["']\*["']|cors\(\s*\{[^}]{0,200}origin\s*:\s*(?:["']\*["']|true)[^}]{0,200}credentials\s*:\s*true|CORS_ORIGIN_ALLOW_ALL\s*=\s*True|allow_origins\s*=\s*\[\s*["']\*["']\s*\]/gi, title: { TR: "Her kaynağa açık CORS", EN: "CORS open to every origin" }, why: { TR: "Başka siteler kullanıcı adına API'ne istek atıp yanıtları okuyabilir.", EN: "Other sites may call your API as the user and read responses." }, fix: { TR: "İzinli origin listesini açıkça yaz.", EN: "List allowed origins explicitly." } },
    { id: "insecure-cookie", category: "config", severity: "low", pattern: /\bhttpOnly\s*[:=]\s*false|\bsecure\s*:\s*false|SESSION_COOKIE_SECURE\s*=\s*False/gi, title: { TR: "Güvensiz çerez ayarı", EN: "Insecure cookie flags" }, why: { TR: "Çerez JavaScript'ten okunabilir veya HTTP üzerinden gönderilebilir.", EN: "The cookie can be read by JavaScript or sent over HTTP." }, fix: { TR: "httpOnly, secure ve sameSite ayarlarını aç.", EN: "Enable httpOnly, secure and sameSite." } },

    // --------------------------------------------------------------- Deserialization
    { id: "unsafe-deserialization", category: "deserialization", severity: "high", pattern: /\b(?:c?Pickle|pickle|marshal|jsonpickle)\.(?:loads?|decode)\s*\(|\byaml\.load\s*\((?![^)\n]*Loader\s*=\s*(?:yaml\.)?C?SafeLoader)|\bunserialize\s*\(|\bObjectInputStream\s*\(|\bBinaryFormatter\s*\(/g, title: { TR: "Güvensiz veri çözme (deserialization)", EN: "Unsafe deserialization" }, why: { TR: "Güvenilmeyen veriyi pickle/unserialize ile açmak uzaktan kod çalıştırmaya yol açabilir.", EN: "Deserializing untrusted data with pickle/unserialize can lead to remote code execution." }, fix: { TR: "JSON gibi güvenli formatlar veya yaml.safe_load kullan.", EN: "Use safe formats like JSON or yaml.safe_load." } },

    // --------------------------------------------------------------- Memory safety (C/C++)
    { id: "gets", category: "memory", severity: "high", languages: C_LIKE, pattern: /(?<![\w.])gets\s*\(/g, title: { TR: "gets() kullanımı", EN: "gets() usage" }, why: { TR: "Uzunluk sınırı yoktur; bellek taşmasına kesin olarak açıktır (C11'de kaldırıldı).", EN: "No length limit; guaranteed buffer overflow risk (removed in C11)." }, fix: { TR: "fgets(buf, sizeof buf, stdin) kullan.", EN: "Use fgets(buf, sizeof buf, stdin)." } },
    { id: "unsafe-string-copy", category: "memory", severity: "medium", languages: C_LIKE, pattern: /(?<![\w.])(?:strcpy|strcat|sprintf|vsprintf)\s*\(/g, title: { TR: "Sınırsız metin kopyalama", EN: "Unbounded string copy" }, why: { TR: "Hedef tampon küçükse bellek taşması olur.", EN: "Overflows when the destination buffer is too small." }, fix: { TR: "strncpy/snprintf ya da C++'ta std::string kullan.", EN: "Use strncpy/snprintf or std::string in C++." } },
    { id: "scanf-unbounded", category: "memory", severity: "medium", languages: C_LIKE, pattern: /\bscanf\s*\(\s*"[^"]*%s/g, title: { TR: "scanf(\"%s\") sınırsız okuma", EN: "Unbounded scanf(\"%s\")" }, why: { TR: "Uzun girdi tamponu taşırır.", EN: "Long input overflows the buffer." }, fix: { TR: "Genişlik belirt: scanf(\"%63s\", buf).", EN: "Give a width: scanf(\"%63s\", buf)." } },
    { id: "format-string", category: "memory", severity: "medium", languages: C_LIKE, pattern: /\bprintf\s*\(\s*[A-Za-z_]\w*\s*\)/g, title: { TR: "Biçim dizesi açığı", EN: "Format string vulnerability" }, why: { TR: "Girdi içindeki %x/%n ile bellek okunabilir veya yazılabilir.", EN: "%x/%n in input can read or write memory." }, fix: { TR: "printf(\"%s\", metin) kullan.", EN: "Use printf(\"%s\", text)." } },

    // --------------------------------------------------------------- Privacy
    { id: "log-secret", category: "privacy", severity: "medium", pattern: /\b(?:console\.(?:log|info|debug|warn)|print|println|printf|System\.out\.println|Debug\.Log|logger\.\w+|log\.\w+)\s*\([^)\n]{0,120}\b(?:password|passwd|parola|sifre|şifre|token|secret|api_?key|credit_?card|cvv)\b/gi, title: { TR: "Gizli bilgi günlüğe yazılıyor", EN: "Secrets written to logs" }, why: { TR: "Günlükler çoğu zaman çok kişi tarafından okunur ve uzun süre saklanır.", EN: "Logs are widely readable and kept for a long time." }, fix: { TR: "Gizli alanları maskele veya hiç yazdırma.", EN: "Mask secret fields or don't log them." } },
    { id: "playerprefs-secret", category: "privacy", severity: "medium", pattern: /PlayerPrefs\.Set(?:String|Int|Float)\s*\(\s*["'][^"']*(?:password|parola|sifre|şifre|token|secret)[^"']*["']/gi, title: { TR: "PlayerPrefs'te gizli bilgi", EN: "Secrets in PlayerPrefs" }, why: { TR: "PlayerPrefs düz metindir; tarayıcıda herkes okuyabilir.", EN: "PlayerPrefs is plain text; anyone can read it in the browser." }, fix: { TR: "Parola/jeton saklama; sadece skor ve ayarlar gibi zararsız verileri tut.", EN: "Never store passwords/tokens; keep only harmless data like scores." } },
    { id: "localstorage-token", category: "privacy", severity: "low", pattern: /localStorage\.setItem\s*\(\s*["'][^"']*(?:token|password|secret|jwt)[^"']*["']/gi, title: { TR: "Jeton localStorage'da", EN: "Token in localStorage" }, why: { TR: "Bir XSS açığı olursa jeton kolayca çalınır.", EN: "Any XSS can steal the token." }, fix: { TR: "Mümkünse httpOnly çerez kullan.", EN: "Prefer httpOnly cookies." } },
];

const SIGNATURE_EN: Record<string, string> = {
    "destructive-root-delete": "Attempt to irreversibly delete the root or a broad directory.",
    "disk-wipe": "Attempt to overwrite a disk or partition.",
    "fork-bomb": "Known fork-bomb signature that exhausts resources.",
    "network-flood": "Known network flooding (DoS) tool signature.",
    "reverse-shell": "Reverse shell / remote command channel signature.",
    "download-and-execute": "Chain piping remote content straight into a shell.",
    "credential-harvesting": "Chain collecting credential files and sending them out.",
    "browser-token-stealer": "Stealer pattern sending browser/Discord/Telegram session data to a webhook.",
    "shadow-file-access": "Attempt to read system password hashes (/etc/shadow, SAM).",
    "privilege-escalation": "Privilege escalation signature (setuid shell, sudoers change).",
    keylogger: "Keylogger pattern recording keystrokes to a file or the network.",
    "defense-evasion": "Attempt to disable antivirus or clear security logs.",
    "encoded-execution": "Chain decoding content and executing it dynamically.",
    "container-control-socket": "Attempt to reach the container control socket or host root.",
    "cloud-metadata-credential-access": "Attempt to read cloud instance credentials.",
    "cryptomining-protocol": "Cryptomining protocol or known miner signature.",
    "compound-obfuscated-execution": "Decoding/large encoded data combined with dynamic execution.",
    "network-process-chain": "Network download combined with spawning OS processes.",
};

const LANGUAGE_HINTS: Array<[CodeLanguage, RegExp[]]> = [
    ["csharp", [/\busing\s+(?:System|UnityEngine)\b/, /\bpublic\s+class\s+\w+\s*:\s*MonoBehaviour/, /Console\.WriteLine/, /\bnamespace\s+[\w.]+\s*\{?/, /\bvoid\s+(?:Start|Update)\s*\(\)/]],
    ["cpp", [/#include\s*<(?:iostream|vector|string|memory)>/, /\bstd::/, /\bcout\s*<</, /\bclass\s+\w+\s*:\s*public\s+\w+/]],
    ["c", [/#include\s*<(?:stdio|stdlib|string)\.h>/, /\bprintf\s*\(/, /\bint\s+main\s*\(/]],
    ["java", [/\bpublic\s+static\s+void\s+main/, /System\.out\.println/, /\bimport\s+java\./]],
    ["python", [/^\s*def\s+\w+\s*\(.*\)\s*:/m, /^\s*(?:import|from)\s+\w+/m, /\bprint\s*\(/, /\bself\./, /:\s*\n\s{4}\S/]],
    ["typescript", [/:\s*(?:string|number|boolean)\b/, /\binterface\s+\w+\s*\{/, /\btype\s+\w+\s*=/, /\bimport\s+type\b/]],
    ["javascript", [/\b(?:const|let)\s+\w+\s*=/, /=>/, /\bconsole\.log\s*\(/, /\brequire\s*\(/, /\bfunction\s+\w+\s*\(/, /\bdocument\./]],
    ["php", [/<\?php/, /\$\w+\s*=/, /\becho\s+/]],
    ["go", [/^package\s+\w+/m, /\bfunc\s+\w*\s*\(/, /\bfmt\.Print/]],
    ["rust", [/\bfn\s+main\s*\(/, /\blet\s+mut\b/, /println!\s*\(/]],
    ["kotlin", [/\bfun\s+\w+\s*\(/, /\bval\s+\w+\s*=/]],
    ["swift", [/\bimport\s+(?:Foundation|UIKit|SwiftUI)/, /\bfunc\s+\w+\s*\(/, /\bvar\s+\w+\s*:/]],
    ["ruby", [/^\s*def\s+\w+/m, /^\s*end\s*$/m, /\bputs\s+/]],
    ["lua", [/\blocal\s+\w+\s*=/, /\bfunction\s+\w+\s*\(/, /\bend\b/]],
    ["sql", [/\bSELECT\b[\s\S]{0,200}\bFROM\b/i, /\bCREATE\s+TABLE\b/i]],
    ["html", [/<(?:!doctype|html|head|body|div|script)\b/i]],
    ["shell", [/^#!\/(?:usr\/)?bin\/(?:env\s+)?(?:ba|z)?sh/m, /\b(?:sudo|apt-get|chmod|echo\s+\$)\b/]],
];

export function detectLanguage(code: string): CodeLanguage {
    let best: CodeLanguage = "unknown";
    let bestScore = 0;
    for (const [language, hints] of LANGUAGE_HINTS) {
        const score = hints.reduce((sum, hint) => sum + (hint.test(code) ? 1 : 0), 0);
        if (score > bestScore) {
            best = language;
            bestScore = score;
        }
    }
    return bestScore ? best : "unknown";
}

function mask(value: string) {
    return value.length <= 8 ? "••••" : `${value.slice(0, 4)}${"•".repeat(Math.min(12, value.length - 6))}${value.slice(-2)}`;
}

function maskSecrets(line: string, pattern: RegExp) {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    return line.replace(new RegExp(pattern.source, flags), (match) => {
        // "password = \"hunter22\"" → keep the name, hide only the quoted value.
        const quoted = /(["'`])([^"'`]{2,})\1/.exec(match);
        return quoted ? match.replace(quoted[0], `${quoted[1]}${mask(quoted[2])}${quoted[1]}`) : mask(match);
    });
}

const PENALTY: Record<AdvisorSeverity, number> = { critical: 35, high: 18, medium: 8, low: 3, info: 0 };

export function analyzeCode(code: string, forcedLanguage?: CodeLanguage): AdvisorReport {
    const source = code.slice(0, 200_000);
    const language = forcedLanguage ?? detectLanguage(source);
    const lines = source.split("\n");
    const lineStarts: number[] = [];
    let offset = 0;
    for (const line of lines) {
        lineStarts.push(offset);
        offset += line.length + 1;
    }
    const lineOf = (index: number) => {
        let low = 0;
        let high = lineStarts.length - 1;
        while (low < high) {
            const mid = (low + high + 1) >> 1;
            if (lineStarts[mid] <= index) low = mid;
            else high = mid - 1;
        }
        return low + 1;
    };

    const findings: AdvisorFinding[] = [];
    const seen = new Set<string>();
    for (const rule of RULES) {
        if (rule.languages && language !== "unknown" && !rule.languages.includes(language)) continue;
        const pattern = new RegExp(rule.pattern.source, rule.pattern.flags.includes("g") ? rule.pattern.flags : `${rule.pattern.flags}g`);
        let match: RegExpExecArray | null;
        let guard = 0;
        while ((match = pattern.exec(source)) && guard < 50) {
            guard += 1;
            if (match[0].length === 0) pattern.lastIndex += 1;
            const line = lineOf(match.index);
            const key = `${rule.id}:${line}`;
            if (seen.has(key)) continue;
            const text = lines[line - 1] ?? "";
            if (rule.ignoreLine?.test(text)) continue;
            seen.add(key);
            const trimmed = text.trim().slice(0, 180);
            findings.push({
                id: rule.id,
                category: rule.category,
                severity: rule.severity,
                title: rule.title,
                why: rule.why,
                fix: rule.fix,
                line,
                snippet: rule.secret ? maskSecrets(trimmed, rule.pattern) : trimmed,
            });
        }
    }

    const signatures = detectSignatures(source);
    for (const signature of signatures) {
        findings.push({
            id: `guard:${signature.id}`,
            category: "abuse",
            severity: signature.severity === "medium" ? "medium" : signature.severity,
            title: { TR: "Hanogt çalıştırıcısı bu kodu engeller", EN: "The Hanogt runner blocks this code" },
            why: { TR: signature.message, EN: SIGNATURE_EN[signature.id] ?? signature.message },
            fix: { TR: "Kötüye kullanım amaçlı olmayan bir yöntem kullan. Yanlış alarm olduğunu düşünüyorsan Geri Bildirim'den güvenlik itirazı gönder.", EN: "Use a non-abusive approach. If you think this is a false alarm, file a security appeal via Feedback." },
            line: signature.line ?? 1,
            snippet: (lines[(signature.line ?? 1) - 1] ?? "").trim().slice(0, 180),
        });
    }

    const order: AdvisorSeverity[] = ["critical", "high", "medium", "low", "info"];
    findings.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity) || a.line - b.line);
    const limited = findings.slice(0, 120);
    const counts: Record<AdvisorSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const finding of limited) counts[finding.severity] += 1;
    const score = Math.max(0, 100 - limited.reduce((sum, finding) => sum + PENALTY[finding.severity], 0));
    const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";
    return {
        language,
        lines: lines.length,
        findings: limited,
        counts,
        score,
        grade,
        blockedByGuard: signatures.some((signature) => signature.severity === "high" || signature.severity === "critical"),
    };
}

/** Quick check used by the chat bot to warn users who paste secrets. */
export function containsSecret(text: string) {
    return RULES.some((rule) => rule.category === "secret" && rule.severity !== "medium" && new RegExp(rule.pattern.source, rule.pattern.flags.replace("g", "")).test(text));
}
