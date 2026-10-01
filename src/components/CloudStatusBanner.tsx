"use client";

import { AlertTriangle, RefreshCw, Stethoscope, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useFirebaseBridge, useRawSession, type FirebaseBridgeFailureCode } from "@/components/Provider";
import { useI18n, type Copy } from "@/lib/i18n";

/** sessionStorage: the failure code the user closed the banner for in this tab session. */
const DISMISS_KEY = "hanogt_cloud_banner_dismissed";

const TITLE: Copy = { TR: "Bulut verilerine bağlanılamadı.", EN: "Couldn't connect to cloud data." };
const LOCAL_STILL_WORKS: Copy = {
    TR: "Hesabınız, ayarlarınız ve yerel özellikler çalışmaya devam eder; sohbet ve arkadaşlar gibi canlı özellikler geçici olarak kullanılamayabilir.",
    EN: "Your account, your settings and local features keep working; live features such as chat and friends may be unavailable for a while.",
};

/** Short messages for everyone; only causes a user can act on get their own text. */
const USER_COPY: Partial<Record<FirebaseBridgeFailureCode, Copy>> = {
    session_expired: { TR: "Oturumunuzun süresi dolmuş olabilir. Çıkış yapıp yeniden giriş yapın.", EN: "Your session may have expired. Sign out and sign in again." },
    network: { TR: "İnternet bağlantınızı kontrol edip tekrar deneyin.", EN: "Check your internet connection and try again." },
    token_network: { TR: "İnternet bağlantınızı kontrol edip tekrar deneyin.", EN: "Check your internet connection and try again." },
    rate_limited: { TR: "Kısa sürede çok fazla bağlantı denemesi yapıldı. Birkaç dakika sonra tekrar deneyin.", EN: "Too many connection attempts in a short time. Try again in a few minutes." },
    too_many_requests: { TR: "Kısa sürede çok fazla bağlantı denemesi yapıldı. Birkaç dakika sonra tekrar deneyin.", EN: "Too many connection attempts in a short time. Try again in a few minutes." },
    user_disabled: { TR: "Bulut hesabınız devre dışı bırakılmış. Destek ekibiyle iletişime geçin.", EN: "Your cloud account has been disabled. Contact support." },
};

const USER_DEFAULT: Copy = { TR: "Bu bir yapılandırma sorunu; site ekibinin müdahalesi gerekiyor. Daha sonra tekrar deneyin.", EN: "This is a configuration problem the site team has to fix. Please try again later." };

/** Precise causes and fixes for the Hanogt team. */
const STAFF_COPY: Record<FirebaseBridgeFailureCode, Copy> = {
    config_missing: {
        TR: "Bu sürüm Firebase istemci ayarları (NEXT_PUBLIC_FIREBASE_*) olmadan derlenmiş. Değerleri Vercel'e ekleyip yeniden dağıtın; NEXT_PUBLIC_ değişkenleri derleme sırasında pakete yazılır.",
        EN: "This build was made without the Firebase client settings (NEXT_PUBLIC_FIREBASE_*). Add them in Vercel and redeploy; NEXT_PUBLIC_ variables are baked in at build time.",
    },
    config_invalid: {
        TR: "NEXT_PUBLIC_FIREBASE_API_KEY bir Firebase web API anahtarı gibi görünmüyor (AIza… ile başlamalı). Firebase Console → Proje ayarları → Web uygulaması yapılandırmasındaki değeri kullanıp yeniden dağıtın.",
        EN: "NEXT_PUBLIC_FIREBASE_API_KEY doesn't look like a Firebase web API key (it should start with AIza…). Use the value from Firebase Console → Project settings → Web app config and redeploy.",
    },
    session_expired: { TR: "Belirteç uç noktası oturumu doğrulayamadı (401). Çıkış yapıp yeniden giriş yapın; sürerse NEXTAUTH_SECRET değişmiş olabilir.", EN: "The token endpoint couldn't verify the session (401). Sign out and in again; if it persists, NEXTAUTH_SECRET may have changed." },
    bad_origin: { TR: "Belirteç isteği köken denetiminden geçemedi (403). Site farklı bir alan adından mı açıldı? NEXTAUTH_URL ve alan adı ayarlarını kontrol edin.", EN: "The token request failed the origin check (403). Is the site opened from a different domain? Check NEXTAUTH_URL and the domain settings." },
    rate_limited: { TR: "Belirteç uç noktası hız sınırına takıldı (429). Birkaç dakika sonra tekrar deneyin.", EN: "The token endpoint hit its rate limit (429). Try again in a few minutes." },
    token_unavailable: {
        TR: "Sunucu Firebase oturum belirteci üretemedi. Hizmet hesabı değişkenlerini (FIREBASE_SERVICE_ACCOUNT_JSON / _BASE64) kontrol edin.",
        EN: "The server couldn't mint a Firebase session token. Check the service-account variables (FIREBASE_SERVICE_ACCOUNT_JSON / _BASE64).",
    },
    token_network: { TR: "Belirteç uç noktasına ulaşılamadı (ağ hatası).", EN: "The token endpoint couldn't be reached (network error)." },
    invalid_custom_token: {
        TR: "Firebase özel belirteci reddetti (INVALID_CUSTOM_TOKEN). Genellikle istemci ayarları ile sunucu hizmet hesabı farklı Firebase projelerine aittir: NEXT_PUBLIC_FIREBASE_PROJECT_ID ile hizmet hesabının project_id değeri aynı olmalı.",
        EN: "Firebase rejected the custom token (INVALID_CUSTOM_TOKEN). Usually the client settings and the server service account belong to different Firebase projects: NEXT_PUBLIC_FIREBASE_PROJECT_ID must equal the service account's project_id.",
    },
    custom_token_mismatch: {
        TR: "Özel belirteç başka bir projeye ait (CREDENTIAL_MISMATCH): web API anahtarı ile hizmet hesabı farklı Firebase projelerinden. İkisini aynı projeden alın.",
        EN: "The custom token belongs to another project (CREDENTIAL_MISMATCH): the web API key and the service account come from different Firebase projects. Take both from the same project.",
    },
    configuration_not_found: {
        TR: "Firebase Authentication bu projede hiç başlatılmamış (CONFIGURATION_NOT_FOUND). Firebase Console → Authentication → Başlayın'a tıklayın; ek sağlayıcı açmak gerekmez.",
        EN: "Firebase Authentication was never set up for this project (CONFIGURATION_NOT_FOUND). Click Firebase Console → Authentication → Get started; no extra provider is needed.",
    },
    api_key_invalid: {
        TR: "Firebase web API anahtarı geçersiz veya silinmiş. Firebase Console → Proje ayarları'ndaki güncel anahtarı NEXT_PUBLIC_FIREBASE_API_KEY olarak girip yeniden dağıtın.",
        EN: "The Firebase web API key is invalid or was deleted. Put the current key from Firebase Console → Project settings into NEXT_PUBLIC_FIREBASE_API_KEY and redeploy.",
    },
    referer_blocked: {
        TR: "Web API anahtarının HTTP yönlendiren (referrer) kısıtlaması bu alan adını engelliyor. Google Cloud Console → API'ler ve Hizmetler → Kimlik bilgileri → anahtar → Web sitesi kısıtlamalarına sitenin adresini (https://alanadiniz/*) ekleyin.",
        EN: "The web API key's HTTP-referrer restriction blocks this domain. In Google Cloud Console → APIs & Services → Credentials → the key → Website restrictions, add the site (https://your-domain/*).",
    },
    api_restricted: {
        TR: "Web API anahtarının API kısıtlamaları Identity Toolkit API'yi içermiyor. Google Cloud Console → Kimlik bilgileri → anahtar → API kısıtlamalarına Identity Toolkit API ve Token Service API'yi ekleyin.",
        EN: "The web API key's API restrictions don't include the Identity Toolkit API. In Google Cloud Console → Credentials → the key → API restrictions, add the Identity Toolkit API and the Token Service API.",
    },
    api_disabled: {
        TR: "Identity Toolkit API bu Google Cloud projesinde kapalı. Google Cloud Console → API'ler ve Hizmetler'den etkinleştirin (veya Firebase Console → Authentication → Başlayın).",
        EN: "The Identity Toolkit API is disabled in this Google Cloud project. Enable it in Google Cloud Console → APIs & Services (or click Firebase Console → Authentication → Get started).",
    },
    network: { TR: "Firebase Authentication sunucularına ulaşılamadı (ağ hatası, reklam engelleyici veya güvenlik duvarı).", EN: "Firebase Authentication couldn't be reached (network error, ad blocker or firewall)." },
    too_many_requests: { TR: "Firebase bu tarayıcıdan gelen girişleri geçici olarak sınırladı (too-many-requests).", EN: "Firebase temporarily throttled sign-ins from this browser (too-many-requests)." },
    user_disabled: { TR: "Bu hesabın Firebase Authentication kullanıcısı devre dışı. Firebase Console → Authentication → Kullanıcılar'dan etkinleştirin.", EN: "This account's Firebase Authentication user is disabled. Enable it in Firebase Console → Authentication → Users." },
    permission_denied: {
        TR: "Giriş çalışıyor ama Firestore güvenlik kuralları kişinin kendi profilini okumasını reddediyor: kurallar hiç yayımlanmamış veya eski. Bulut Sağlığı'ndan güvenlik kurallarını yayımlayın.",
        EN: "Sign-in works, but the Firestore security rules refuse reading one's own profile: the rules were never deployed or are outdated. Deploy the security rules from Cloud Health.",
    },
    unknown: { TR: "Beklenmeyen bir Firebase hatası oluştu. Ayrıntılar için Bulut Sağlığı tanılamasını çalıştırın.", EN: "An unexpected Firebase error occurred. Run the Cloud Health diagnostics for details." },
};

const OPEN_DIAGNOSTICS: Copy = { TR: "Tanılamayı aç", EN: "Open diagnostics" };
const OWNER_CAN_DIAGNOSE: Copy = { TR: "Site sahibi Yönetici Paneli → Bulut Sağlığı'ndan ayrıntılı tanılama yapabilir.", EN: "The site owner can run detailed diagnostics in Admin Panel → Cloud Health." };
const TECHNICAL: Copy = { TR: "Teknik ayrıntı", EN: "Technical detail" };
const RETRY: Copy = { TR: "Tekrar dene", EN: "Try again" };
const CLOSE: Copy = { TR: "Uyarıyı kapat", EN: "Dismiss the warning" };

type StaffInfo = { email: string; staff: boolean; cloudHealth: boolean };

function readDismissed() {
    if (typeof window === "undefined") return null;
    try {
        return window.sessionStorage.getItem(DISMISS_KEY);
    } catch {
        return null;
    }
}

function writeDismissed(code: string | null) {
    try {
        if (code) window.sessionStorage.setItem(DISMISS_KEY, code);
        else window.sessionStorage.removeItem(DISMISS_KEY);
    } catch {
        // Storage blocked: the choice lasts for this page view.
    }
}

/**
 * Explains a failed browser connection to Firebase (see FirebaseSessionBridge
 * in Provider.tsx). Staff see the precise cause and a link to Cloud Health;
 * everyone else gets a short, friendly message. Closing it lasts for the tab
 * session unless a different problem appears.
 */
export default function CloudStatusBanner() {
    const { tx } = useI18n();
    const { failure, retry } = useFirebaseBridge();
    const auth = useRawSession();
    const email = auth.status === "authenticated" ? auth.data?.user?.email?.toLowerCase() || null : null;
    const [dismissed, setDismissed] = useState<string | null>(readDismissed);
    const [staffInfo, setStaffInfo] = useState<StaffInfo | null>(null);
    const hasFailure = Boolean(failure);

    // Only asked when there is something to explain; everyone else gets isAdmin:false.
    useEffect(() => {
        if (!hasFailure || !email) return;
        let cancelled = false;
        fetch("/api/admin/me", { cache: "no-store", credentials: "same-origin" })
            .then((response) => (response.ok ? response.json() as Promise<{ isAdmin?: boolean; permissions?: { cloudHealth?: boolean } }> : null))
            .then((data) => {
                if (!cancelled) setStaffInfo({ email, staff: Boolean(data?.isAdmin), cloudHealth: Boolean(data?.isAdmin && data.permissions?.cloudHealth) });
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [email, hasFailure]);

    if (!failure || !email || dismissed === failure.code) return null;
    const staff = staffInfo?.email === email ? staffInfo : null;
    const message = staff?.staff ? STAFF_COPY[failure.code] : USER_COPY[failure.code] ?? USER_DEFAULT;

    return (
        <div role="status" className="fixed inset-x-3 bottom-3 z-[200] mx-auto max-w-xl rounded-2xl border border-amber-300/60 bg-amber-50/95 p-3 text-sm text-amber-950 shadow-2xl backdrop-blur dark:border-amber-500/30 dark:bg-zinc-900/95 dark:text-amber-100">
            <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden="true" />
                <div className="min-w-0 flex-1 leading-5">
                    <p>
                        <strong className="font-semibold">{tx(TITLE)}</strong> {tx(message)}
                    </p>
                    {!staff?.staff && <p className="mt-1 text-xs text-amber-900/80 dark:text-amber-100/70">{tx(LOCAL_STILL_WORKS)}</p>}
                    {staff?.staff && (
                        <>
                            <p className="mt-1 break-words font-mono text-[11px] text-amber-900/80 dark:text-amber-100/70">
                                <span className="font-sans font-semibold">{tx(TECHNICAL)}:</span>{" "}
                                {failure.status ? <>HTTP {failure.status} · </> : null}
                                {failure.code}
                                {failure.message ? <> · {failure.message}</> : null}
                            </p>
                            {!staff.cloudHealth && <p className="mt-1 text-xs text-amber-900/80 dark:text-amber-100/70">{tx(OWNER_CAN_DIAGNOSE)}</p>}
                        </>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                writeDismissed(null);
                                setDismissed(null);
                                retry();
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900"
                        >
                            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                            {tx(RETRY)}
                        </button>
                        {staff?.cloudHealth && (
                            <Link
                                href="/admin#cloud"
                                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/70 px-2.5 py-1 text-xs font-semibold transition hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-amber-500/40 dark:hover:bg-zinc-800"
                            >
                                <Stethoscope className="h-3.5 w-3.5" aria-hidden="true" />
                                {tx(OPEN_DIAGNOSTICS)}
                            </Link>
                        )}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        writeDismissed(failure.code);
                        setDismissed(failure.code);
                    }}
                    aria-label={tx(CLOSE)}
                    title={tx(CLOSE)}
                    className="rounded-lg p-1 transition hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:hover:bg-zinc-800"
                >
                    <X className="h-4 w-4" aria-hidden="true" />
                </button>
            </div>
        </div>
    );
}
