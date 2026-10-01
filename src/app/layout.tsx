import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import Provider from "@/components/Provider";
import { I18nProvider } from "@/lib/i18n";
import SkipLink from "@/components/SkipLink";
import VoiceCallProvider from "@/components/VoiceCallProvider";
import { PresenceProvider } from "@/components/Presence";
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
    icons: {
        icon: "/logo-dark.png",
        shortcut: "/logo-dark.png",
        apple: "/logo-dark.png",
    },
    openGraph: {
        title: SITE_NAME,
        description: SITE_DESCRIPTION,
        url: SITE_URL,
        siteName: SITE_NAME,
        images: [{ url: "/logo-dark.png", width: 500, height: 500, alt: `${SITE_NAME} logosu` }],
        locale: "tr_TR",
        type: "website",
    },
    twitter: {
        card: "summary",
        title: SITE_NAME,
        description: SITE_DESCRIPTION,
        images: ["/logo-dark.png"],
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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        // The theme class is decided by the inline script before hydration.
        <html lang="tr" data-scroll-behavior="smooth" suppressHydrationWarning>
            <head>
                <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
            </head>
            <body className="min-h-dvh antialiased">
                <Provider>
                    <I18nProvider>
                        <PresenceProvider>
                            <SkipLink />
                            <AnnouncementBanner />
                            <VoiceCallProvider>
                                {children}
                            </VoiceCallProvider>
                            <HanogtAIDock />
                        </PresenceProvider>
                        {/* Inside the I18nProvider: Provider (bridge state) wraps it but can't translate. */}
                        <CloudStatusBanner />
                    </I18nProvider>
                </Provider>
            </body>
        </html>
    );
}
