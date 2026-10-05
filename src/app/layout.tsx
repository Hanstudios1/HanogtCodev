import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import Provider from "@/components/Provider";
import { I18nProvider } from "@/lib/i18n";
import SkipLink from "@/components/SkipLink";
import VoiceCallProvider from "@/components/VoiceCallProvider";
import HanogtAIDock from "@/components/HanogtAI/HanogtAIDock";
import AnnouncementBanner from "@/components/AnnouncementBanner";
import CloudStatusBanner from "@/components/CloudStatusBanner";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
    metadataBase: new URL(SITE_URL),
    title: {
        default: `${SITE_NAME} — Kod editörü ve oyun motoru`,
        template: `%s · ${SITE_NAME}`,
    },
    description: SITE_DESCRIPTION,
    applicationName: SITE_NAME,
    keywords: ["online kod editörü", "oyun motoru", "C# oyun", "C++ oyun", "WebGL", "2D oyun", "3D oyun", "Hanogt", "kod çalıştır", "tarayıcıda oyun yap"],
    authors: [{ name: "HanStudios" }],
    creator: "HanStudios",
    openGraph: {
        title: SITE_NAME,
        description: SITE_DESCRIPTION,
        url: SITE_URL,
        siteName: SITE_NAME,
        images: [{ url: "/brand/hanogt-og.png", width: 1200, height: 630, alt: `${SITE_NAME} logosu` }],
        locale: "tr_TR",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: SITE_NAME,
        description: SITE_DESCRIPTION,
        images: ["/brand/hanogt-og.png"],
    },
    formatDetection: { telephone: false },
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    themeColor: [
        { media: "(prefers-color-scheme: dark)", color: "#09090b" },
        { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    ],
    colorScheme: "dark light",
};

// The Electron app is a static export without API routes.
const RUNTIME_FIREBASE_CONFIG = process.env.ELECTRON_BUILD !== "true";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        // The theme class is decided by the inline script before hydration.
        <html lang="tr" data-scroll-behavior="smooth" suppressHydrationWarning>
            <head>
                <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
            </head>
            <body className="min-h-dvh antialiased">
                {/*
                  * Public Firebase web config read at request time (window.__HANOGT_FIREBASE__),
                  * loaded before the app starts so src/lib/firebase.ts can prefer it over
                  * the build-time NEXT_PUBLIC_FIREBASE_* values.
                  */}
                {RUNTIME_FIREBASE_CONFIG ? <Script id="hanogt-firebase-config" src="/api/firebase/config" strategy="beforeInteractive" /> : null}
                <Provider>
                    <I18nProvider>
                        <SkipLink />
                        <AnnouncementBanner />
                        <VoiceCallProvider>
                            {children}
                        </VoiceCallProvider>
                        <HanogtAIDock />
                        {/* Inside the I18nProvider: Provider (bridge state) wraps it but can't translate. */}
                        <CloudStatusBanner />
                    </I18nProvider>
                </Provider>
            </body>
        </html>
    );
}
