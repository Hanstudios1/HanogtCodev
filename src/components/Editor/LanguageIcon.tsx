"use client";

import { useState } from "react";
import { getLanguage, normalizeLanguageId } from "@/lib/runtimes/languages";

interface LanguageIconProps {
    language: string;
    /** Pixel size of the square icon. */
    size?: number;
    className?: string;
}

/** The language's icon, or a coloured initials badge when the image is unavailable. */
export default function LanguageIcon({ language, size = 16, className = "" }: LanguageIconProps) {
    const info = getLanguage(normalizeLanguageId(language) ?? "");
    const [failed, setFailed] = useState(false);
    const style = { width: size, height: size };
    if (!info || failed) {
        const label = (info?.name ?? language ?? "?").replace(/[^A-Za-z0-9#+]/g, "").slice(0, 2) || "?";
        return (
            <span
                aria-hidden
                style={{ ...style, backgroundColor: info?.color ?? "#71717A", fontSize: Math.max(7, Math.round(size * 0.42)) }}
                className={`inline-flex shrink-0 items-center justify-center rounded-[22%] font-bold leading-none text-white ${className}`}
            >
                {label}
            </span>
        );
    }
    return (
        // Same-origin static icons; next/image would add nothing for 16 px badges.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={info.icon} alt="" aria-hidden width={size} height={size} style={style} loading="lazy" decoding="async" onError={() => setFailed(true)} className={`shrink-0 object-contain ${className}`} />
    );
}
