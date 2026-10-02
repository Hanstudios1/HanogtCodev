import type { Metadata } from "next";
import ContactPage from "@/components/ContactPage";
import { getOperatorInfo } from "@/lib/server/legal-info";

export const metadata: Metadata = {
    title: "İletişim",
    description: "Hanogt Codev'e ulaşın: e-posta, destek talepleri, ödeme ve fatura soruları (Paddle), KVKK başvuruları.",
    alternates: { canonical: "/contact" },
};

// Operator details come from Admin Panel > Subscriptions (site_config/legal).
export const revalidate = 300;

export default async function Contact() {
    const operator = await getOperatorInfo();
    return <ContactPage operator={operator} />;
}
