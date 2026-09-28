import type { Metadata } from "next";
import SecurityCenter from "@/components/Security/SecurityCenter";

export const metadata: Metadata = {
    title: "Güvenlik Merkezi — Kod danışmanı, parola ve bağlantı kontrolü",
    description: "Kodundaki sızmış anahtarları ve güvenlik açıklarını bul, parolanın gücünü ve sızıntı durumunu ölç, şüpheli bağlantıları incele. Analizler tarayıcında yapılır.",
    alternates: { canonical: "/security" },
};

export default function Page() {
    return <SecurityCenter />;
}
