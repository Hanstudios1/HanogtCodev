import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Provider from "@/components/Provider";
import { I18nProvider } from "@/lib/i18n";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hanogt Codev",
  description: "Hanogt Codev ile istediğin dilde özgürce kodla. %100 ücretsiz, reklamsız, sınırsız.",
  icons: {
    icon: "/logo-dark.png",
    shortcut: "/logo-dark.png",
    apple: "/logo-dark.png",
  },
  openGraph: {
    title: "Hanogt Codev",
    description: "Hanogt Codev ile istediğin dilde özgürce kodla. %100 ücretsiz, reklamsız, sınırsız.",
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
    description: "Hanogt Codev ile istediğin dilde özgürce kodla. %100 ücretsiz, reklamsız, sınırsız.",
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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Provider>
          <I18nProvider>
            {children}
          </I18nProvider>
        </Provider>
      </body>
    </html>
  );
}
