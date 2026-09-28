"use client";

import { useI18n } from "@/lib/i18n";

/** First focusable element on every page: lets keyboard users jump past the header. */
export default function SkipLink() {
    const { tx } = useI18n();
    return <a href="#main-content" className="skip-link">{tx({ TR: "İçeriğe geç", EN: "Skip to content" })}</a>;
}
