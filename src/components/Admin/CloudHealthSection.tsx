"use client";

import { AlertTriangle, CheckCircle2, ChevronDown, ClipboardCopy, Cloud, CloudUpload, Globe, MinusCircle, MonitorSmartphone, RefreshCw, ShieldCheck, XCircle, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { firebaseClientDiagnostics } from "@/lib/firebase";
import { useI18n, type Copy } from "@/lib/i18n";
import type {
    CloudCheck,
    CloudCheckId,
    CloudCheckStatus,
    CloudDeployResponse,
    CloudFixId,
    CloudHealthReport,
    CloudReason,
    RulesDeployReason,
    RulesDeployResult,
} from "@/lib/server/cloud-health";
import { adminPost, type ApiFailure } from "./api";
import { useAdminResource } from "./hooks";
import { Badge, Button, ConfirmDialog, ErrorNotice, IconButton, LoadingRows, Notice, Panel, RelativeTime, SectionHeader, cx, useToast, type Tone } from "./ui";

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

const STATUS: Record<CloudCheckStatus, { label: Copy; tone: Tone; icon: LucideIcon; iconClass: string }> = {
    ok: { label: { TR: "Sorunsuz", EN: "OK" }, tone: "emerald", icon: CheckCircle2, iconClass: "text-emerald-500" },
    warn: { label: { TR: "Uyarı", EN: "Warning" }, tone: "amber", icon: AlertTriangle, iconClass: "text-amber-500" },
    fail: { label: { TR: "Hata", EN: "Failed" }, tone: "red", icon: XCircle, iconClass: "text-red-500" },
    skip: { label: { TR: "Atlandı", EN: "Skipped" }, tone: "zinc", icon: MinusCircle, iconClass: "text-zinc-400" },
};

const CHECKS: Record<CloudCheckId, { title: Copy; description: Copy }> = {
    clientConfig: {
        title: { TR: "İstemci yapılandırması (NEXT_PUBLIC_FIREBASE_*)", EN: "Client configuration (NEXT_PUBLIC_FIREBASE_*)" },
        description: { TR: "Tarayıcı paketine derleme sırasında yazılan Firebase web ayarları.", EN: "The Firebase web settings baked into the browser bundle at build time." },
    },
    serverCredentials: {
        title: { TR: "Sunucu kimliği (hizmet hesabı)", EN: "Server credentials (service account)" },
        description: { TR: "Sunucunun Firestore'a erişmek ve oturum belirteci üretmek için kullandığı anahtar.", EN: "The key the server uses to reach Firestore and mint session tokens." },
    },
    projectMatch: {
        title: { TR: "Proje eşleşmesi", EN: "Project match" },
        description: { TR: "İstemci ayarları ile hizmet hesabı aynı Firebase projesine ait olmalı.", EN: "The client settings and the service account must belong to the same Firebase project." },
    },
    accessToken: {
        title: { TR: "Google erişim belirteci", EN: "Google access token" },
        description: { TR: "Hizmet hesabı anahtarıyla Google OAuth belirteci alınabiliyor mu?", EN: "Can a Google OAuth token be obtained with the service-account key?" },
    },
    firestoreRead: {
        title: { TR: "Firestore sunucu erişimi", EN: "Firestore server access" },
        description: { TR: "Sunucu Firestore REST API ile okuma yapabiliyor mu?", EN: "Can the server read through the Firestore REST API?" },
    },
    authConfig: {
        title: { TR: "Firebase Authentication", EN: "Firebase Authentication" },
        description: { TR: "Authentication bu projede başlatılmış mı?", EN: "Is Authentication set up for this project?" },
    },
    browserSignIn: {
        title: { TR: "Tarayıcı bağlantısı (uçtan uca)", EN: "Browser connection (end to end)" },
        description: { TR: "Tarayıcının yaptığı signInWithCustomToken isteği, sizin hesabınız ve sitenin adresiyle aynen denenir.", EN: "The browser's signInWithCustomToken request is repeated exactly, with your account and the site's address." },
    },
    rulesSelfRead: {
        title: { TR: "Güvenlik kuralları: kendi profilini okuma", EN: "Security rules: reading one's own profile" },
        description: { TR: "Giriş yapmış bir kullanıcı users/{e-posta} belgesini okuyabiliyor mu?", EN: "Can a signed-in user read their users/{email} document?" },
    },
    firestoreRules: {
        title: { TR: "Yayımlanan Firestore kuralları", EN: "Deployed Firestore rules" },
        description: { TR: "Firebase'deki kurallar depodaki firestore.rules ile aynı mı?", EN: "Do the rules in Firebase match the repository's firestore.rules?" },
    },
    storageRules: {
        title: { TR: "Yayımlanan Storage kuralları", EN: "Deployed Storage rules" },
        description: { TR: "Firebase'deki kurallar depodaki storage.rules ile aynı mı?", EN: "Do the rules in Firebase match the repository's storage.rules?" },
    },
    storageBucket: {
        title: { TR: "Depolama kovası", EN: "Storage bucket" },
        description: { TR: "Sesli mesajların saklandığı Cloud Storage kovası.", EN: "The Cloud Storage bucket that holds voice messages." },
    },
};

const REASONS: Record<CloudReason, Copy> = {
    skipped: { TR: "Önceki bir adım başarısız olduğu için denetlenmedi.", EN: "Not checked because an earlier step failed." },
    emulator: { TR: "Yerel Firebase emülatöründe bu denetim yapılmaz.", EN: "This check doesn't apply to the local Firebase emulator." },
    client_ok: { TR: "Gerekli değerlerin hepsi var ve biçimleri doğru (proje: {projectId}).", EN: "All required values are present and well formed (project: {projectId})." },
    client_missing: { TR: "Bu derlemede eksik değişkenler var: {missing}. Tarayıcı Firebase'e hiç bağlanamaz.", EN: "This build is missing variables: {missing}. The browser can't connect to Firebase at all." },
    client_api_key_format: { TR: "NEXT_PUBLIC_FIREBASE_API_KEY bir Firebase web API anahtarı biçiminde değil (AIza… ile başlayan 39 karakter).", EN: "NEXT_PUBLIC_FIREBASE_API_KEY isn't in the Firebase web API key format (39 characters starting with AIza…)." },
    client_project_id_format: { TR: "NEXT_PUBLIC_FIREBASE_PROJECT_ID geçerli bir proje kimliğine benzemiyor.", EN: "NEXT_PUBLIC_FIREBASE_PROJECT_ID doesn't look like a valid project ID." },
    client_app_id: { TR: "NEXT_PUBLIC_FIREBASE_APP_ID bir web uygulaması kimliği değil (1:…:web:… biçiminde olmalı).", EN: "NEXT_PUBLIC_FIREBASE_APP_ID isn't a web app ID (it should look like 1:…:web:…)." },
    client_auth_domain: { TR: "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN eksik veya hatalı; https:// ve / olmadan proje.firebaseapp.com biçiminde olmalı.", EN: "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN is missing or malformed; it should be project.firebaseapp.com without https:// or /." },
    client_bucket: { TR: "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET eksik veya hatalı (gs:// olmadan yalnızca kova adı).", EN: "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is missing or malformed (just the bucket name, without gs://)." },
    client_sender_mismatch: { TR: "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, uygulama kimliğindeki proje numarasıyla uyuşmuyor; değerler farklı projelerden kopyalanmış olabilir.", EN: "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID doesn't match the project number in the app ID; the values may come from different projects." },
    creds_ok: { TR: "Hizmet hesabı {variable} değişkeninden okundu (proje: {projectId}).", EN: "The service account was read from {variable} (project: {projectId})." },
    creds_emulator: { TR: "Sunucu yerel Firebase emülatörünü kullanıyor.", EN: "The server uses the local Firebase emulator." },
    creds_missing: { TR: "Sunucu hizmet hesabı tanımlı değil; giriş, profiller ve tüm sunucu verileri çalışmaz.", EN: "No server service account is configured; sign-in, profiles and all server data fail." },
    creds_invalid: { TR: "{variable} okunamadı: JSON bozuk ya da gerekli alanlar eksik.", EN: "{variable} couldn't be read: the JSON is broken or required fields are missing." },
    creds_key_invalid: { TR: "{variable} içindeki özel anahtar okunamadı (satır sonları bozulmuş olabilir).", EN: "The private key in {variable} couldn't be parsed (its line breaks may be broken)." },
    creds_multiple: { TR: "Birden fazla kimlik değişkeni tanımlı; {variable} kullanılıyor, şunlar yok sayılıyor: {ignored}.", EN: "Several credential variables are set; {variable} is used and these are ignored: {ignored}." },
    projects_match: { TR: "İstemci ve sunucu aynı projeyi kullanıyor: {projectId}.", EN: "Client and server use the same project: {projectId}." },
    projects_differ: { TR: "İstemci {client}, hizmet hesabı ise {server} projesini kullanıyor; tarayıcı bağlantısı bu yüzden reddedilir (INVALID_CUSTOM_TOKEN / CREDENTIAL_MISMATCH).", EN: "The client uses {client} while the service account belongs to {server}, so the browser connection is rejected (INVALID_CUSTOM_TOKEN / CREDENTIAL_MISMATCH)." },
    projects_unknown: { TR: "Proje kimliklerinden biri bilinmediği için karşılaştırılamadı.", EN: "Couldn't compare because one of the project IDs is unknown." },
    token_ok: { TR: "Hizmet hesabıyla Google erişim belirteci alındı.", EN: "A Google access token was obtained with the service account." },
    token_admin_failed: { TR: "Veri belirteci alındı, ancak yönetim kapsamlı (cloud-platform) belirteç alınamadı; kural ve Authentication denetimleri yapılamadı.", EN: "The data token was obtained but the admin-scoped (cloud-platform) token wasn't, so the rules and Authentication checks couldn't run." },
    token_rejected: { TR: "Google hizmet hesabı anahtarını reddetti: anahtar silinmiş ya da devre dışı bırakılmış veya sunucu saati yanlış.", EN: "Google rejected the service-account key: it was deleted or disabled, or the server clock is wrong." },
    token_failed: { TR: "Google erişim belirteci alınamadı.", EN: "Couldn't obtain a Google access token." },
    firestore_ok: { TR: "Sunucu Firestore'dan okuma yapabiliyor.", EN: "The server can read from Firestore." },
    firestore_no_database: { TR: "Bu projede Firestore veritabanı oluşturulmamış.", EN: "This project has no Firestore database." },
    firestore_api_disabled: { TR: "Cloud Firestore API bu projede kapalı.", EN: "The Cloud Firestore API is disabled in this project." },
    firestore_datastore_mode: { TR: "Veritabanı Datastore modunda; Hanogt yerel (Native) modda Firestore gerektirir.", EN: "The database is in Datastore mode; Hanogt needs Firestore in Native mode." },
    firestore_permission: { TR: "Hizmet hesabının Firestore'a erişim izni yok.", EN: "The service account has no access to Firestore." },
    firestore_failed: { TR: "Firestore okuması başarısız oldu.", EN: "The Firestore read failed." },
    auth_ok: { TR: "Firebase Authentication bu projede etkin.", EN: "Firebase Authentication is set up for this project." },
    auth_not_initialized: { TR: "Firebase Authentication bu projede hiç başlatılmamış; tarayıcılar CONFIGURATION_NOT_FOUND hatası alır.", EN: "Firebase Authentication was never set up for this project; browsers get CONFIGURATION_NOT_FOUND." },
    auth_api_disabled: { TR: "Identity Toolkit API bu projede kapalı.", EN: "The Identity Toolkit API is disabled in this project." },
    auth_permission: { TR: "Hizmet hesabı Authentication yapılandırmasını okuyamadı; bu adım doğrulanamadı (tarayıcı bağlantısı denetimine bakın).", EN: "The service account can't read the Authentication config, so this step couldn't be verified (see the browser connection check)." },
    auth_failed: { TR: "Authentication yapılandırması okunamadı.", EN: "Couldn't read the Authentication config." },
    signin_ok: { TR: "Tarayıcının yaptığı istek {origin} adresinden başarıyla tamamlandı; sitede Firebase bağlantısı çalışmalı.", EN: "The browser's request succeeded from {origin}; the Firebase connection should work on the site." },
    signin_no_api_key: { TR: "İstemci API anahtarı olmadığı için tarayıcı bağlantısı denenemedi.", EN: "The browser connection couldn't be tried because there's no client API key." },
    signin_invalid_token: { TR: "Firebase özel belirteci reddetti (INVALID_CUSTOM_TOKEN).", EN: "Firebase rejected the custom token (INVALID_CUSTOM_TOKEN)." },
    signin_mismatch: { TR: "Özel belirteç başka bir projeye ait (CREDENTIAL_MISMATCH): API anahtarı ile hizmet hesabı farklı projelerden.", EN: "The custom token belongs to another project (CREDENTIAL_MISMATCH): the API key and the service account come from different projects." },
    signin_not_initialized: { TR: "Firebase Authentication başlatılmamış (CONFIGURATION_NOT_FOUND).", EN: "Firebase Authentication isn't set up (CONFIGURATION_NOT_FOUND)." },
    signin_referrer: { TR: "Web API anahtarının uygulama kısıtlamaları {origin} adresinden gelen istekleri engelliyor.", EN: "The web API key's application restrictions block requests from {origin}." },
    signin_api_restricted: { TR: "Web API anahtarının API kısıtlamaları Identity Toolkit API'ye izin vermiyor.", EN: "The web API key's API restrictions don't allow the Identity Toolkit API." },
    signin_api_key_invalid: { TR: "Web API anahtarı geçersiz veya silinmiş.", EN: "The web API key is invalid or was deleted." },
    signin_api_disabled: { TR: "Identity Toolkit API kapalı.", EN: "The Identity Toolkit API is disabled." },
    signin_user_disabled: { TR: "Hesabınızın Firebase Authentication kullanıcısı devre dışı.", EN: "Your account's Firebase Authentication user is disabled." },
    signin_throttled: { TR: "Firebase istekleri geçici olarak sınırladı; biraz sonra yeniden denetleyin.", EN: "Firebase is temporarily throttling requests; check again a little later." },
    signin_failed: { TR: "Tarayıcı bağlantısı denemesi başarısız oldu.", EN: "The browser connection attempt failed." },
    rules_read_ok: { TR: "Yayımlanan kurallar kullanıcının kendi profilini okumasına izin veriyor.", EN: "The deployed rules let users read their own profile." },
    rules_read_denied: { TR: "Yayımlanan kurallar kullanıcının kendi profilini okumasını reddediyor (PERMISSION_DENIED): kurallar yayımlanmamış ya da eski.", EN: "The deployed rules refuse users reading their own profile (PERMISSION_DENIED): the rules were never deployed or are outdated." },
    rules_read_failed: { TR: "Kural denetimi için yapılan okuma başarısız oldu.", EN: "The read for the rules check failed." },
    rules_same: { TR: "Yayımlanan kurallar depodaki {file} ile aynı.", EN: "The deployed rules match the repository's {file}." },
    rules_differ: { TR: "Yayımlanan kurallar depodaki {file} dosyasından farklı; site güncel kuralları bekliyor olabilir.", EN: "The deployed rules differ from the repository's {file}; the site may expect the current rules." },
    rules_never_deployed: { TR: "{file} bu projeye hiç yayımlanmamış.", EN: "{file} has never been deployed to this project." },
    rules_permission: { TR: "Hizmet hesabı yayımlanan kuralları okuyamıyor (Firebase Rules izni yok).", EN: "The service account can't read the deployed rules (no Firebase Rules permission)." },
    rules_api_disabled: { TR: "Firebase Rules API bu projede kapalı.", EN: "The Firebase Rules API is disabled in this project." },
    rules_bundle_missing: { TR: "Depodaki {file} bu dağıtımda bulunamadı.", EN: "The repository's {file} isn't part of this deployment." },
    rules_no_bucket: { TR: "Depolama kovası tanımlı olmadığı için Storage kuralları denetlenmedi.", EN: "Storage rules weren't checked because no storage bucket is configured." },
    rules_failed: { TR: "Yayımlanan kurallar okunamadı.", EN: "Couldn't read the deployed rules." },
    bucket_ok: { TR: "{bucket} kovası erişilebilir.", EN: "The {bucket} bucket is reachable." },
    bucket_missing: { TR: "Geçerli bir depolama kovası tanımlı değil; sesli mesajlar çalışmaz.", EN: "No valid storage bucket is configured; voice messages won't work." },
    bucket_not_found: { TR: "{bucket} kovası bulunamadı; Storage başlatılmamış olabilir.", EN: "The {bucket} bucket wasn't found; Storage may not be set up." },
    bucket_permission: { TR: "Hizmet hesabı {bucket} kovasına erişemiyor.", EN: "The service account can't access the {bucket} bucket." },
    bucket_failed: { TR: "Depolama kovası denetlenemedi.", EN: "Couldn't check the storage bucket." },
};

const REDEPLOY: Copy = { TR: "NEXT_PUBLIC_ değişkenleri derleme sırasında pakete yazılır: Vercel → Deployments → son dağıtım → Redeploy ile yeniden dağıtın.", EN: "NEXT_PUBLIC_ variables are baked in at build time: redeploy via Vercel → Deployments → latest deployment → Redeploy." };
const REDEPLOY_SERVER: Copy = { TR: "Vercel → Deployments → son dağıtım → Redeploy ile yeniden dağıtın.", EN: "Redeploy via Vercel → Deployments → latest deployment → Redeploy." };
const CLI_DEPLOY: Copy = { TR: "Ya da bilgisayarınızda: firebase deploy --only firestore:rules,storage", EN: "Or on your computer: firebase deploy --only firestore:rules,storage" };
const KEY_PAGE: Copy = { TR: "Google Cloud Console → API'ler ve Hizmetler → Kimlik bilgileri → Browser key (auto created by Firebase) anahtarını açın.", EN: "Open Google Cloud Console → APIs & Services → Credentials → Browser key (auto created by Firebase)." };

const FIXES: Record<CloudFixId, { title: Copy; steps: Copy[] }> = {
    addClientConfig: {
        title: { TR: "Firebase istemci ayarlarını ekleyin", EN: "Add the Firebase client settings" },
        steps: [
            { TR: "Firebase Console → Proje ayarları → Genel → Uygulamalarınız bölümünde web uygulamasını seçin (yoksa Uygulama ekle → Web ile oluşturun).", EN: "In Firebase Console → Project settings → General → Your apps, select the web app (or create one with Add app → Web)." },
            { TR: "firebaseConfig değerlerini Vercel → Settings → Environment Variables bölümüne NEXT_PUBLIC_FIREBASE_* adlarıyla ekleyin; aşağıdaki “Doğru istemci ayarları” kutusundan kopyalayabilirsiniz.", EN: "Add the firebaseConfig values in Vercel → Settings → Environment Variables under the NEXT_PUBLIC_FIREBASE_* names; you can copy them from the “Correct client settings” box below." },
            REDEPLOY,
        ],
    },
    fixClientConfig: {
        title: { TR: "İstemci ayarlarını düzeltin", EN: "Fix the client settings" },
        steps: [
            { TR: "Değerleri Firebase Console → Proje ayarları → Genel → web uygulaması yapılandırmasıyla karşılaştırın (veya aşağıdaki önerilen değerleri kullanın).", EN: "Compare the values with Firebase Console → Project settings → General → web app config (or use the suggested values below)." },
            { TR: "Hatalı değişkeni Vercel → Settings → Environment Variables bölümünde düzeltin.", EN: "Correct the variable in Vercel → Settings → Environment Variables." },
            REDEPLOY,
        ],
    },
    fixAuthDomain: {
        title: { TR: "Kimlik doğrulama alan adını düzeltin", EN: "Fix the auth domain" },
        steps: [
            { TR: "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN değerini https:// ve / olmadan {project}.firebaseapp.com biçiminde girin.", EN: "Set NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN to {project}.firebaseapp.com, without https:// or /." },
            REDEPLOY,
        ],
    },
    fixStorageBucket: {
        title: { TR: "Depolama kovasını ayarlayın", EN: "Set the storage bucket" },
        steps: [
            { TR: "Firebase Console → Storage sayfasındaki kova adını gs:// olmadan kopyalayın (ör. {project}.firebasestorage.app veya {project}.appspot.com).", EN: "Copy the bucket name from Firebase Console → Storage without gs:// (e.g. {project}.firebasestorage.app or {project}.appspot.com)." },
            { TR: "Vercel'de hem NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET hem FIREBASE_STORAGE_BUCKET olarak girin.", EN: "Set it in Vercel as both NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET and FIREBASE_STORAGE_BUCKET." },
            REDEPLOY,
        ],
    },
    addServerCredentials: {
        title: { TR: "Sunucu hizmet hesabını ekleyin", EN: "Add the server service account" },
        steps: [
            { TR: "Firebase Console → Proje ayarları → Hizmet hesapları → Yeni özel anahtar oluştur ile JSON dosyasını indirin.", EN: "Download the JSON with Firebase Console → Project settings → Service accounts → Generate new private key." },
            { TR: "Dosyanın tamamını Vercel'e FIREBASE_SERVICE_ACCOUNT_JSON olarak ekleyin (ya da base64 kodlanmış hâlini FIREBASE_SERVICE_ACCOUNT_BASE64 olarak).", EN: "Add the whole file in Vercel as FIREBASE_SERVICE_ACCOUNT_JSON (or its base64 encoding as FIREBASE_SERVICE_ACCOUNT_BASE64)." },
            REDEPLOY_SERVER,
        ],
    },
    fixServerCredentials: {
        title: { TR: "Hizmet hesabı değişkenini düzeltin", EN: "Fix the service-account variable" },
        steps: [
            { TR: "İndirdiğiniz JSON dosyasının tamamını değiştirmeden yapıştırın; private_key içindeki \\n satır sonları korunmalı.", EN: "Paste the downloaded JSON file in full and unchanged; keep the \\n line breaks inside private_key." },
            { TR: "Base64 kullanıyorsanız dosyayı tek satır olarak kodlayın (ör. base64 -w0 hizmet-hesabi.json) ve FIREBASE_SERVICE_ACCOUNT_BASE64 olarak girin.", EN: "If you use base64, encode the file on a single line (e.g. base64 -w0 service-account.json) and set it as FIREBASE_SERVICE_ACCOUNT_BASE64." },
            REDEPLOY_SERVER,
        ],
    },
    rotateServiceAccountKey: {
        title: { TR: "Hizmet hesabı anahtarını yenileyin", EN: "Renew the service-account key" },
        steps: [
            { TR: "Firebase Console → Proje ayarları → Hizmet hesapları → Yeni özel anahtar oluştur.", EN: "Firebase Console → Project settings → Service accounts → Generate new private key." },
            { TR: "Yeni JSON'u Vercel'deki hizmet hesabı değişkenine yapıştırıp yeniden dağıtın.", EN: "Paste the new JSON into the service-account variable in Vercel and redeploy." },
            { TR: "Sorun sürerse anahtarın Google Cloud Console → IAM → Hizmet hesapları → {account} → Anahtarlar bölümünde etkin olduğunu kontrol edin.", EN: "If it persists, check that the key is active in Google Cloud Console → IAM → Service accounts → {account} → Keys." },
        ],
    },
    alignProjects: {
        title: { TR: "İstemci ve sunucuyu aynı projeye bağlayın", EN: "Point client and server to the same project" },
        steps: [
            { TR: "Verilerinizin bulunduğu Firebase projesini seçin.", EN: "Pick the Firebase project that holds your data." },
            { TR: "İstemci ayarlarını o projenin web uygulamasından (NEXT_PUBLIC_FIREBASE_*), hizmet hesabını da aynı projenin Hizmet hesapları sekmesinden alın.", EN: "Take the client settings from that project's web app (NEXT_PUBLIC_FIREBASE_*) and the service account from the same project's Service accounts tab." },
            REDEPLOY,
        ],
    },
    enableFirestore: {
        title: { TR: "Cloud Firestore API'yi etkinleştirin", EN: "Enable the Cloud Firestore API" },
        steps: [
            { TR: "Google Cloud Console → API'ler ve Hizmetler → Kitaplık → Cloud Firestore API → Etkinleştir ({project} projesinde).", EN: "Google Cloud Console → APIs & Services → Library → Cloud Firestore API → Enable (in project {project})." },
            { TR: "Birkaç dakika sonra yeniden denetleyin.", EN: "Check again after a few minutes." },
        ],
    },
    createFirestoreDatabase: {
        title: { TR: "Firestore veritabanı oluşturun", EN: "Create the Firestore database" },
        steps: [
            { TR: "Firebase Console → Firestore Database → Veritabanı oluştur; yerel (Native) modu seçin.", EN: "Firebase Console → Firestore Database → Create database; choose Native mode." },
            { TR: "Ardından aşağıdan güvenlik kurallarını yayımlayın.", EN: "Then deploy the security rules below." },
        ],
    },
    grantServiceAccountRoles: {
        title: { TR: "Hizmet hesabına yetki verin", EN: "Grant the service account access" },
        steps: [
            { TR: "Google Cloud Console → IAM ve Yönetici → IAM → {account} → Düzenle.", EN: "Google Cloud Console → IAM & Admin → IAM → {account} → Edit." },
            { TR: "“Firebase Admin” rolünü ekleyin (Firebase Console'un oluşturduğu firebase-adminsdk hesabında genellikle zaten vardır).", EN: "Add the “Firebase Admin” role (the firebase-adminsdk account created by Firebase Console usually has it already)." },
            { TR: "Doğru hizmet hesabını kullandığınızdan emin olun: Firebase Console → Proje ayarları → Hizmet hesapları.", EN: "Make sure you use the right service account: Firebase Console → Project settings → Service accounts." },
        ],
    },
    initAuth: {
        title: { TR: "Firebase Authentication'ı başlatın", EN: "Set up Firebase Authentication" },
        steps: [
            { TR: "Firebase Console → Build → Authentication → Başlayın düğmesine tıklayın.", EN: "Firebase Console → Build → Authentication → click Get started." },
            { TR: "Bir oturum açma sağlayıcısı açmanız gerekmez; Hanogt özel belirteç (custom token) kullanır.", EN: "You don't need to enable a sign-in provider; Hanogt uses custom tokens." },
            { TR: "Yeniden dağıtım gerekmez; birkaç dakika sonra yeniden denetleyin.", EN: "No redeploy needed; check again after a few minutes." },
        ],
    },
    enableIdentityToolkit: {
        title: { TR: "Identity Toolkit API'yi etkinleştirin", EN: "Enable the Identity Toolkit API" },
        steps: [
            { TR: "Google Cloud Console → API'ler ve Hizmetler → Kitaplık → Identity Toolkit API → Etkinleştir ({project} projesinde).", EN: "Google Cloud Console → APIs & Services → Library → Identity Toolkit API → Enable (in project {project})." },
            { TR: "Firebase Console → Authentication → Başlayın da aynı işi görür.", EN: "Firebase Console → Authentication → Get started does the same." },
        ],
    },
    fixApiKey: {
        title: { TR: "Web API anahtarını düzeltin", EN: "Fix the web API key" },
        steps: [
            { TR: "Firebase Console → Proje ayarları → Genel'deki Web API anahtarını kopyalayın.", EN: "Copy the Web API key from Firebase Console → Project settings → General." },
            { TR: "Vercel'de NEXT_PUBLIC_FIREBASE_API_KEY değerini güncelleyin.", EN: "Update NEXT_PUBLIC_FIREBASE_API_KEY in Vercel." },
            REDEPLOY,
        ],
    },
    apiKeyReferrer: {
        title: { TR: "API anahtarının site kısıtlamasını düzeltin", EN: "Fix the API key's website restriction" },
        steps: [
            KEY_PAGE,
            { TR: "Uygulama kısıtlamaları → Web siteleri listesine {origin}/* ekleyin (Vercel önizleme adresleri için *.vercel.app/* da gerekebilir) ya da kısıtlamayı kaldırın.", EN: "Under Application restrictions → Websites, add {origin}/* (Vercel preview URLs may also need *.vercel.app/*) or remove the restriction." },
            { TR: "Kaydedin; değişiklik birkaç dakikada geçerli olur, yeniden dağıtım gerekmez.", EN: "Save; it takes effect within minutes and no redeploy is needed." },
        ],
    },
    apiKeyApis: {
        title: { TR: "API anahtarında gerekli API'lere izin verin", EN: "Allow the required APIs on the key" },
        steps: [
            KEY_PAGE,
            { TR: "API kısıtlamalarında Identity Toolkit API, Token Service API, Cloud Firestore API, Cloud Storage for Firebase API ve Firebase Installations API'yi seçin (ya da kısıtlamayı kaldırın).", EN: "Under API restrictions, select the Identity Toolkit API, Token Service API, Cloud Firestore API, Cloud Storage for Firebase API and Firebase Installations API (or remove the restriction)." },
            { TR: "Kaydedin; değişiklik birkaç dakikada geçerli olur, yeniden dağıtım gerekmez.", EN: "Save; it takes effect within minutes and no redeploy is needed." },
        ],
    },
    enableAuthUser: {
        title: { TR: "Firebase kullanıcısını etkinleştirin", EN: "Enable the Firebase user" },
        steps: [
            { TR: "Firebase Console → Authentication → Kullanıcılar bölümünde hesabınızın kullanıcısını bulun.", EN: "Find your account's user in Firebase Console → Authentication → Users." },
            { TR: "Menüden “Hesabı etkinleştir”i seçin.", EN: "Choose “Enable account” from its menu." },
        ],
    },
    deployRules: {
        title: { TR: "Güvenlik kurallarını yayımlayın", EN: "Deploy the security rules" },
        steps: [
            { TR: "Aşağıdaki “Güvenlik kurallarını yayımla” düğmesi depodaki firestore.rules ve storage.rules dosyalarını yayımlar.", EN: "The “Deploy security rules” button below deploys the repository's firestore.rules and storage.rules." },
            CLI_DEPLOY,
        ],
    },
    grantRulesAdmin: {
        title: { TR: "Kuralları yayımlama izni verin", EN: "Allow the rules to be deployed" },
        steps: [
            { TR: "Google Cloud Console → IAM → {account} → Rol ekle → “Firebase Rules Admin”.", EN: "Google Cloud Console → IAM → {account} → Add role → “Firebase Rules Admin”." },
            CLI_DEPLOY,
        ],
    },
    enableRulesApi: {
        title: { TR: "Firebase Rules API'yi etkinleştirin", EN: "Enable the Firebase Rules API" },
        steps: [
            { TR: "Google Cloud Console → API'ler ve Hizmetler → Kitaplık → Firebase Rules API → Etkinleştir ({project} projesinde).", EN: "Google Cloud Console → APIs & Services → Library → Firebase Rules API → Enable (in project {project})." },
            CLI_DEPLOY,
        ],
    },
    initStorage: {
        title: { TR: "Cloud Storage'ı başlatın", EN: "Set up Cloud Storage" },
        steps: [
            { TR: "Firebase Console → Build → Storage → Başlayın ile varsayılan kovayı oluşturun.", EN: "Create the default bucket with Firebase Console → Build → Storage → Get started." },
            { TR: "Kova adını FIREBASE_STORAGE_BUCKET ve NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET olarak girip yeniden dağıtın.", EN: "Set the bucket name as FIREBASE_STORAGE_BUCKET and NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET and redeploy." },
        ],
    },
    redeploy: {
        title: { TR: "Son sürümü yeniden dağıtın", EN: "Redeploy the latest version" },
        steps: [
            { TR: "Kural dosyaları bu dağıtımda yok; Vercel'de son sürümü yeniden dağıtın.", EN: "The rule files are missing from this deployment; redeploy the latest version in Vercel." },
            CLI_DEPLOY,
        ],
    },
    checkNetwork: {
        title: { TR: "Biraz sonra yeniden deneyin", EN: "Try again shortly" },
        steps: [
            { TR: "Sunucu Google API'lerine ulaşamadı veya yanıt zaman aşımına uğradı.", EN: "The server couldn't reach Google's APIs or the response timed out." },
            { TR: "Birkaç dakika sonra “Yeniden denetle”ye basın.", EN: "Press “Check again” in a few minutes." },
        ],
    },
};

const DEPLOY_REASONS: Record<RulesDeployReason, Copy> = {
    deployed: { TR: "Yayımlandı.", EN: "Deployed." },
    unchanged: { TR: "Zaten güncel; yeniden yayımlanmadı.", EN: "Already up to date; not deployed again." },
    no_bucket: { TR: "Depolama kovası tanımlı olmadığı için atlandı.", EN: "Skipped because no storage bucket is configured." },
    bundle_missing: { TR: "Kural dosyası bu dağıtımda bulunamadı.", EN: "The rule file isn't part of this deployment." },
    permission: { TR: "Hizmet hesabının kuralları yayımlama izni yok (Firebase Rules Admin rolü gerekir).", EN: "The service account may not deploy rules (it needs the Firebase Rules Admin role)." },
    api_disabled: { TR: "Firebase Rules API kapalı.", EN: "The Firebase Rules API is disabled." },
    invalid_rules: { TR: "Firebase kural dosyasını reddetti (söz dizimi hatası).", EN: "Firebase rejected the rule file (syntax error)." },
    failed: { TR: "Yayımlanamadı.", EN: "Couldn't deploy." },
};

const DEPLOY_STATUS: Record<RulesDeployResult["status"], { label: Copy; tone: Tone }> = {
    deployed: { label: { TR: "Yayımlandı", EN: "Deployed" }, tone: "emerald" },
    unchanged: { label: { TR: "Güncel", EN: "Up to date" }, tone: "sky" },
    skipped: { label: { TR: "Atlandı", EN: "Skipped" }, tone: "zinc" },
    failed: { label: { TR: "Başarısız", EN: "Failed" }, tone: "red" },
};

const T = {
    title: { TR: "Bulut Sağlığı", EN: "Cloud Health" },
    description: { TR: "Firebase bağlantısının uçtan uca denetimi: istemci ayarları, hizmet hesabı, Authentication ve güvenlik kuralları.", EN: "End-to-end check of the Firebase connection: client settings, service account, Authentication and security rules." },
    checkAgain: { TR: "Yeniden denetle", EN: "Check again" },
    checking: { TR: "Denetleniyor… Bu 10–20 saniye sürebilir.", EN: "Checking… this can take 10–20 seconds." },
    allGood: { TR: "Her şey yolunda", EN: "Everything looks good" },
    problems: { TR: "{count} sorun bulundu", EN: "{count} problems found" },
    warnings: { TR: "{count} uyarı", EN: "{count} warnings" },
    firstProblem: { TR: "İlk sorun: {title}", EN: "First problem: {title}" },
    clientProject: { TR: "İstemci projesi", EN: "Client project" },
    serverProject: { TR: "Sunucu projesi", EN: "Server project" },
    serviceAccount: { TR: "Hizmet hesabı", EN: "Service account" },
    siteAddress: { TR: "Site adresi", EN: "Site address" },
    deployment: { TR: "Dağıtım", EN: "Deployment" },
    lastCheck: { TR: "Son denetim", EN: "Last check" },
    checklist: { TR: "Denetim listesi", EN: "Checklist" },
    checklistHint: { TR: "Adımlar sırayla birbirine bağlıdır; ilk başarısız adımdan başlayın.", EN: "The steps depend on each other; start with the first failing one." },
    howToFix: { TR: "Nasıl düzeltilir?", EN: "How to fix it" },
    technical: { TR: "Teknik ayrıntı", EN: "Technical detail" },
    deployedAt: { TR: "Yayımlanma", EN: "Deployed" },
    bundleTitle: { TR: "Bu tarayıcıdaki paket", EN: "This browser's bundle" },
    bundleDescription: { TR: "Şu an açık olan sayfanın derlendiği Firebase istemci ayarları.", EN: "The Firebase client settings this page was built with." },
    bundleProject: { TR: "Proje", EN: "Project" },
    bundleKey: { TR: "API anahtarı", EN: "API key" },
    bundleMissing: { TR: "Bu pakette eksik: {missing}", EN: "Missing in this bundle: {missing}" },
    bundleMismatch: { TR: "Bu tarayıcıdaki paket ({browser}) sunucunun gördüğünden ({server}) farklı bir projeye bağlı. Sayfa eski bir dağıtımdan yüklenmiş olabilir; sayfayı yenileyin.", EN: "This browser's bundle ({browser}) points to a different project than the server sees ({server}). The page may come from an older deployment; reload it." },
    notSet: { TR: "tanımlı değil", EN: "not set" },
    suggestedTitle: { TR: "Doğru istemci ayarları", EN: "Correct client settings" },
    suggestedDescription: { TR: "Firebase'in bu proje için bildirdiği web uygulaması yapılandırması ({app}). Web API anahtarları gizli değildir.", EN: "The web app config Firebase reports for this project ({app}). Web API keys aren't secret." },
    suggestedDiffers: { TR: "İşaretli değerler bu dağıtımdakinden farklı. Vercel → Settings → Environment Variables bölümüne girip yeniden dağıtın.", EN: "The marked values differ from this deployment. Enter them in Vercel → Settings → Environment Variables and redeploy." },
    suggestedMatches: { TR: "Bu dağıtımdaki değerler Firebase'deki yapılandırmayla aynı.", EN: "This deployment's values match the Firebase config." },
    suggestedUnavailable: { TR: "Önerilen değerler Firebase Management API'den okunamadı.", EN: "The suggested values couldn't be read from the Firebase Management API." },
    noWebApp: { TR: "Bu projede kayıtlı web uygulaması yok: Firebase Console → Proje ayarları → Uygulama ekle → Web.", EN: "This project has no web app: Firebase Console → Project settings → Add app → Web." },
    differs: { TR: "Farklı", EN: "Differs" },
    matches: { TR: "Aynı", EN: "Matches" },
    copyAll: { TR: "Tümünü .env olarak kopyala", EN: "Copy all as .env" },
    copyValue: { TR: "{name} değerini kopyala", EN: "Copy {name}" },
    copied: { TR: "Panoya kopyalandı.", EN: "Copied to the clipboard." },
    copyFailed: { TR: "Panoya kopyalanamadı.", EN: "Couldn't copy to the clipboard." },
    rulesTitle: { TR: "Güvenlik kuralları", EN: "Security rules" },
    rulesDescription: { TR: "Depodaki firestore.rules ve storage.rules dosyalarını {project} projesine yayımlar.", EN: "Deploys the repository's firestore.rules and storage.rules to the {project} project." },
    rulesExplain: { TR: "Kurallar yayımlanmadıkça veya eski kaldıkça tarayıcıdaki okuma ve yazmalar izin hatasıyla reddedilir. Aynı olan dosyalar yeniden yayımlanmaz.", EN: "As long as the rules are missing or outdated, reads and writes from the browser are rejected with permission errors. Identical files aren't deployed again." },
    rulesPermissionNote: { TR: "Hizmet hesabının “Firebase Rules Admin” rolü olmalı; yoksa kuralları bilgisayarınızdan firebase deploy --only firestore:rules,storage ile yayımlayın.", EN: "The service account needs the “Firebase Rules Admin” role; otherwise deploy from your computer with firebase deploy --only firestore:rules,storage." },
    storageNote: { TR: "storage.rules, sohbet ve grup üyeliğini Firestore'dan okur. Yayımladıktan sonra sesli mesaj yüklemeleri izin hatası verirse Firebase Console → Storage → Kurallar sayfasındaki çapraz hizmet izni uyarısını onaylayın ya da bir kez firebase deploy --only storage çalıştırın.", EN: "storage.rules reads chat and group membership from Firestore. If voice-message uploads fail with permission errors after deploying, accept the cross-service permission prompt in Firebase Console → Storage → Rules, or run firebase deploy --only storage once." },
    deploy: { TR: "Güvenlik kurallarını yayımla", EN: "Deploy security rules" },
    deployConfirmTitle: { TR: "Güvenlik kuralları yayımlansın mı?", EN: "Deploy the security rules?" },
    deployConfirmText: { TR: "Depodaki firestore.rules ve storage.rules, {project} projesindeki mevcut kuralların yerini alır. Aynı olan dosyalar atlanır ve işlem denetim kaydına yazılır.", EN: "The repository's firestore.rules and storage.rules replace the current rules of {project}. Identical files are skipped and the action is written to the audit log." },
    deployConfirm: { TR: "Yayımla", EN: "Deploy" },
    deployDone: { TR: "Güvenlik kuralları yayımlandı.", EN: "The security rules were deployed." },
    deployPartial: { TR: "Kuralların bir kısmı yayımlanamadı; ayrıntılara bakın.", EN: "Some rules couldn't be deployed; see the details." },
    lastDeployment: { TR: "Son yayımlama", EN: "Last deployment" },
    unknown: { TR: "bilinmiyor", EN: "unknown" },
} satisfies Record<string, Copy>;

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

type Vars = Record<string, string>;

function StatusIcon({ status, className }: { status: CloudCheckStatus; className?: string }) {
    const { icon: Icon, iconClass } = STATUS[status];
    return <Icon className={cx("h-5 w-5 shrink-0", iconClass, className)} aria-hidden="true" />;
}

function FixSteps({ fix, vars }: { fix: CloudFixId; vars: Vars }) {
    const { tx } = useI18n();
    return (
        <ol className="mt-2 list-decimal space-y-1.5 ps-5 text-[13px] leading-relaxed text-zinc-700 marker:font-bold marker:text-zinc-400 dark:text-zinc-300">
            {FIXES[fix].steps.map((step, index) => <li key={index}>{tx(step, vars)}</li>)}
        </ol>
    );
}

function CheckRow({ item, vars }: { item: CloudCheck; vars: Vars }) {
    const { tx } = useI18n();
    const [open, setOpen] = useState(item.status === "fail" || item.status === "warn");
    const status = STATUS[item.status];
    const sentenceVars = { ...vars, ...item.facts };
    return (
        <li id={`cloud-check-${item.id}`} className="scroll-mt-28 px-5 py-4">
            <div className="flex items-start gap-3">
                <StatusIcon status={item.status} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[14px] font-bold text-zinc-900 dark:text-white">{tx(CHECKS[item.id].title)}</h3>
                        <Badge tone={status.tone}>{tx(status.label)}</Badge>
                    </div>
                    <p className="mt-0.5 text-[12px] text-zinc-500 dark:text-zinc-400">{tx(CHECKS[item.id].description)}</p>
                    <p className="mt-2 text-[13px] leading-relaxed text-zinc-800 dark:text-zinc-200">{tx(REASONS[item.reason], sentenceVars)}</p>
                    {item.facts.deployedAt ? (
                        <p className="mt-1 text-[12px] text-zinc-500">
                            {tx(T.deployedAt)}: <RelativeTime iso={item.facts.deployedAt} className="font-semibold text-zinc-700 dark:text-zinc-300" />
                        </p>
                    ) : null}
                    {item.detail ? (
                        <p className="mt-1.5 break-all font-mono text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                            <span className="font-sans font-semibold">{tx(T.technical)}:</span> {item.detail}
                        </p>
                    ) : null}
                    {item.fix ? (
                        <div className="mt-2">
                            <button
                                type="button"
                                aria-expanded={open}
                                onClick={() => setOpen((value) => !value)}
                                className="inline-flex items-center gap-1 rounded-lg text-[12px] font-bold text-indigo-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-indigo-300"
                            >
                                <ChevronDown className={cx("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden="true" />
                                {tx(T.howToFix)} · {tx(FIXES[item.fix].title, vars)}
                            </button>
                            {open ? <FixSteps fix={item.fix} vars={vars} /> : null}
                        </div>
                    ) : null}
                </div>
            </div>
        </li>
    );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="min-w-0 rounded-2xl border border-zinc-100 bg-zinc-50/70 px-3 py-2 dark:border-white/[0.06] dark:bg-white/[0.02]">
            <dt className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">{label}</dt>
            <dd className="mt-0.5 break-all text-[13px] font-semibold text-zinc-800 dark:text-zinc-100">{children}</dd>
        </div>
    );
}

function SuggestedConfig({ report, onCopy }: { report: CloudHealthReport; onCopy: (text: string) => void }) {
    const { tx } = useI18n();
    const config = report.suggestedClientConfig;
    if (!config) {
        if (!report.suggestedClientConfigError) return null;
        return (
            <Panel title={tx(T.suggestedTitle)} icon={Globe}>
                <Notice tone="info">
                    {report.suggestedClientConfigError === "no_web_app" ? tx(T.noWebApp) : (
                        <>
                            {tx(T.suggestedUnavailable)}
                            <span className="mt-1 block break-all font-mono text-[11px] opacity-80">{report.suggestedClientConfigError}</span>
                        </>
                    )}
                </Notice>
            </Panel>
        );
    }
    const entries = Object.entries(config.values) as Array<[keyof typeof config.values, string]>;
    const envText = entries.filter(([, value]) => value).map(([name, value]) => [name, value].join("=")).join("\n");
    return (
        <Panel
            title={tx(T.suggestedTitle)}
            description={tx(T.suggestedDescription, { app: config.displayName || config.appId })}
            icon={Globe}
            actions={<Button size="sm" icon={ClipboardCopy} onClick={() => onCopy(envText)}>{tx(T.copyAll)}</Button>}
        >
            <Notice tone={config.differs.length ? "warning" : "success"} className="mb-4">
                {tx(config.differs.length ? T.suggestedDiffers : T.suggestedMatches)}
            </Notice>
            <ul className="space-y-2">
                {entries.map(([name, value]) => {
                    const differs = config.differs.includes(name);
                    return (
                        <li key={name} className={cx("flex items-center gap-3 rounded-2xl border px-3 py-2", differs ? "border-red-200 bg-red-50/60 dark:border-red-500/25 dark:bg-red-500/[0.06]" : "border-zinc-100 dark:border-white/[0.06]")}>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <code className="break-all text-[12px] font-bold text-zinc-800 dark:text-zinc-100">{name}</code>
                                    <Badge tone={differs ? "red" : "emerald"}>{tx(differs ? T.differs : T.matches)}</Badge>
                                </div>
                                <code className="mt-0.5 block break-all text-[12px] text-zinc-600 dark:text-zinc-300">{value || "—"}</code>
                            </div>
                            {value ? <IconButton icon={ClipboardCopy} label={tx(T.copyValue, { name })} onClick={() => onCopy(value)} /> : null}
                        </li>
                    );
                })}
            </ul>
        </Panel>
    );
}

function BrowserBundle({ report }: { report: CloudHealthReport }) {
    const { tx } = useI18n();
    const bundle = firebaseClientDiagnostics;
    const server = report.projectIds.client;
    const mismatch = Boolean(bundle.projectId && server && bundle.projectId !== server);
    return (
        <Panel title={tx(T.bundleTitle)} description={tx(T.bundleDescription)} icon={MonitorSmartphone}>
            <dl className="grid gap-2 sm:grid-cols-2">
                <Fact label={tx(T.bundleProject)}>{bundle.projectId ?? tx(T.notSet)}</Fact>
                <Fact label={tx(T.bundleKey)}>{bundle.apiKeyPrefix ? <>{bundle.apiKeyPrefix}…</> : tx(T.notSet)}</Fact>
            </dl>
            {bundle.missing.length ? <Notice tone="error" className="mt-3">{tx(T.bundleMissing, { missing: bundle.missing.join(", ") })}</Notice> : null}
            {mismatch ? <Notice tone="warning" className="mt-3">{tx(T.bundleMismatch, { browser: bundle.projectId ?? "—", server: server ?? "—" })}</Notice> : null}
        </Panel>
    );
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

export default function CloudHealthSection() {
    const { tx } = useI18n();
    const toast = useToast();
    const report = useAdminResource<CloudHealthReport>("/api/admin/cloud");
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [deploying, setDeploying] = useState(false);
    const [deployError, setDeployError] = useState<ApiFailure | null>(null);
    const [deployment, setDeployment] = useState<CloudDeployResponse | null>(null);

    const data = report.data;
    const project = data?.projectIds.server ?? data?.projectIds.client ?? tx(T.unknown);
    const vars: Vars = { origin: data?.origin ?? "", account: data?.serviceAccount ?? "—", project };
    const firstProblem = data?.checks.find((item) => item.status === "fail") ?? data?.checks.find((item) => item.status === "warn");

    const copy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toast("success", tx(T.copied));
        } catch {
            toast("error", tx(T.copyFailed));
        }
    };

    const deploy = async () => {
        setDeploying(true);
        setDeployError(null);
        const result = await adminPost<CloudDeployResponse>("/api/admin/cloud", { action: "deployRules" });
        setDeploying(false);
        if (!result.ok) {
            setDeployError(result);
            return;
        }
        setConfirmOpen(false);
        setDeployment(result.data);
        const failed = result.data.results.some((item) => item.status === "failed");
        toast(failed ? "error" : "success", tx(failed ? T.deployPartial : T.deployDone));
        report.reload();
    };

    return (
        <div className="space-y-5">
            <SectionHeader
                title={tx(T.title)}
                description={tx(T.description)}
                actions={<Button size="sm" icon={RefreshCw} busy={report.loading && Boolean(data)} onClick={report.reload}>{tx(T.checkAgain)}</Button>}
            />

            {report.error ? <ErrorNotice error={report.error} onRetry={report.reload} /> : null}

            {!data && report.loading ? (
                <Panel>
                    <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400" role="status">{tx(T.checking)}</p>
                    <LoadingRows rows={6} />
                </Panel>
            ) : null}

            {data ? (
                <>
                    <Panel bodyClassName="p-5">
                        <div className="flex flex-wrap items-center gap-3">
                            <span className={cx("grid h-11 w-11 shrink-0 place-items-center rounded-2xl", data.summary.fail ? "bg-red-500/10 text-red-600 dark:text-red-400" : data.summary.warn ? "bg-amber-500/10 text-amber-600 dark:text-amber-300" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400")}>
                                {data.summary.fail ? <XCircle className="h-6 w-6" aria-hidden="true" /> : data.summary.warn ? <AlertTriangle className="h-6 w-6" aria-hidden="true" /> : <ShieldCheck className="h-6 w-6" aria-hidden="true" />}
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="text-lg font-black text-zinc-900 dark:text-white">
                                    {data.summary.fail ? tx(T.problems, { count: data.summary.fail }) : data.summary.warn ? tx(T.warnings, { count: data.summary.warn }) : tx(T.allGood)}
                                </p>
                                {firstProblem ? (
                                    <a href={`#cloud-check-${firstProblem.id}`} className="text-[13px] font-semibold text-indigo-600 hover:underline dark:text-indigo-300">
                                        {tx(T.firstProblem, { title: tx(CHECKS[firstProblem.id].title) })}
                                    </a>
                                ) : null}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {(["ok", "warn", "fail", "skip"] as const).filter((status) => data.summary[status] > 0).map((status) => (
                                    <Badge key={status} tone={STATUS[status].tone}>{tx(STATUS[status].label)}: {data.summary[status]}</Badge>
                                ))}
                            </div>
                        </div>
                        <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            <Fact label={tx(T.clientProject)}>{data.projectIds.client ?? tx(T.notSet)}</Fact>
                            <Fact label={tx(T.serverProject)}>{data.projectIds.server ?? tx(T.notSet)}</Fact>
                            <Fact label={tx(T.serviceAccount)}>{data.serviceAccount ?? tx(T.notSet)}</Fact>
                            <Fact label={tx(T.siteAddress)}>{data.origin}</Fact>
                            <Fact label={tx(T.deployment)}>{[data.deployment.env, data.deployment.commit].filter(Boolean).join(" · ") || "—"}</Fact>
                            <Fact label={tx(T.lastCheck)}><RelativeTime iso={data.checkedAt} /></Fact>
                        </dl>
                    </Panel>

                    <Panel title={tx(T.checklist)} description={tx(T.checklistHint)} icon={Cloud} bodyClassName="p-0">
                        <ul className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
                            {data.checks.map((item) => <CheckRow key={item.id} item={item} vars={vars} />)}
                        </ul>
                    </Panel>

                    <SuggestedConfig report={data} onCopy={(text) => void copy(text)} />
                    <BrowserBundle report={data} />

                    <Panel title={tx(T.rulesTitle)} description={tx(T.rulesDescription, { project })} icon={ShieldCheck}>
                        <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">{tx(T.rulesExplain)}</p>
                        <p className="mt-2 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">{tx(T.rulesPermissionNote)}</p>
                        <div className="mt-4">
                            <Button
                                variant="primary"
                                icon={CloudUpload}
                                onClick={() => {
                                    setDeployError(null);
                                    setConfirmOpen(true);
                                }}
                            >
                                {tx(T.deploy)}
                            </Button>
                        </div>
                        {deployment ? (
                            <div className="mt-5">
                                <h3 className="text-[13px] font-black text-zinc-900 dark:text-white">{tx(T.lastDeployment)}</h3>
                                <ul className="mt-2 space-y-2">
                                    {deployment.results.map((result) => (
                                        <li key={result.file} className="rounded-2xl border border-zinc-100 px-3 py-2.5 dark:border-white/[0.06]">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <code className="text-[12px] font-bold text-zinc-800 dark:text-zinc-100">{result.file}</code>
                                                <Badge tone={DEPLOY_STATUS[result.status].tone}>{tx(DEPLOY_STATUS[result.status].label)}</Badge>
                                            </div>
                                            <p className="mt-1 text-[13px] text-zinc-700 dark:text-zinc-300">{tx(DEPLOY_REASONS[result.reason])}</p>
                                            {result.detail ? <p className="mt-0.5 break-all font-mono text-[11px] text-zinc-500">{result.detail}</p> : null}
                                            {result.fix && result.status !== "deployed" && result.status !== "unchanged" ? (
                                                <div className="mt-1.5">
                                                    <p className="text-[12px] font-bold text-zinc-700 dark:text-zinc-200">{tx(FIXES[result.fix].title, vars)}</p>
                                                    <FixSteps fix={result.fix} vars={vars} />
                                                </div>
                                            ) : null}
                                        </li>
                                    ))}
                                </ul>
                                {deployment.results.some((result) => result.file === "storage.rules" && result.status === "deployed") ? (
                                    <Notice tone="info" className="mt-3">{tx(T.storageNote)}</Notice>
                                ) : null}
                            </div>
                        ) : null}
                    </Panel>
                </>
            ) : null}

            <ConfirmDialog
                open={confirmOpen}
                onClose={() => {
                    if (!deploying) setConfirmOpen(false);
                }}
                onConfirm={() => void deploy()}
                title={tx(T.deployConfirmTitle)}
                description={tx(T.deployConfirmText, { project })}
                confirmLabel={tx(T.deployConfirm)}
                icon={CloudUpload}
                tone="default"
                busy={deploying}
                error={deployError}
            />
        </div>
    );
}
