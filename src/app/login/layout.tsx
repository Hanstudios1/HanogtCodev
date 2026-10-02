import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Giriş Yap",
    description: "Hanogt Codev hesabına e-posta veya Google ile giriş yap; iki adımlı doğrulama desteklenir.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
