import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Hesabını doğrula",
    description: "Google ile girişten sonra hesabının şifresini (ve açıksa iki adımlı doğrulama kodunu) gir.",
    robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
