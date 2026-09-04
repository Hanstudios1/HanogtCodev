import type { Metadata } from "next";
import "./globals.css";
import Provider from "@/components/Provider";
import { I18nProvider } from "@/lib/i18n";
import SecurityBotChat from "@/components/SecurityBotChat";
import VoiceCallProvider from "@/components/VoiceCallProvider";

export const metadata: Metadata = {
  metadataBase: new URL("https://hanogtcodev.com"),
  title: "Hanogt Codev",
  description: "Güvenlik katmanları, çoklu dosya projeleri ve arkadaş iletişimi sunan modern kod editörü.",
  icons: {
    icon: "/logo-dark.png",
    shortcut: "/logo-dark.png",
    apple: "/logo-dark.png",
  },
  openGraph: {
    title: "Hanogt Codev",
    description: "Güvenlik katmanları, çoklu dosya projeleri ve arkadaş iletişimi sunan modern kod editörü.",
    url: "https://hanogtcodev.com",
    siteName: "Hanogt Codev",
    images: [
      {
        url: "/logo-dark.png",
        width: 512,
        height: 512,
        alt: "Hanogt Codev Logo",
      },
    ],
    locale: "tr_TR",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Hanogt Codev",
    description: "Güvenlik katmanları, çoklu dosya projeleri ve arkadaş iletişimi sunan modern kod editörü.",
    images: ["/logo-dark.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className="dark">
      <body className="antialiased">
        <Provider>
          <I18nProvider>
            <VoiceCallProvider>
              {children}
              <SecurityBotChat />
            </VoiceCallProvider>
          </I18nProvider>
        </Provider>
      </body>
    </html>
  );
}
