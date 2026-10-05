import type { Metadata } from "next";
import SecurityCenter from "@/components/Security/SecurityCenter";

export const metadata: Metadata = {
    title: "Hanogt Security — Hesap güvenliği, kod ve bağlantı kontrolü",
    description: "Hesabının güvenliğini tek bakışta gör, kodundaki sızmış anahtarları ve açıkları bul, parolanı ölç, şüpheli bağlantıları incele. Analizler tarayıcında yapılır.",
    alternates: { canonical: "/security" },
};

export default function Page() {
    return <SecurityCenter />;
}
