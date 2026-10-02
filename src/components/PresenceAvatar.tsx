"use client";

import { useState } from "react";
import OptimizedImage from "@/components/OptimizedImage";
import { useI18n } from "@/lib/i18n";
import { PRESENCE_STATUS_COPY, type PresenceStatus } from "@/lib/presence";

export type PresenceAvatarSize = "sm" | "md" | "lg" | "xl";

/** Avatar (px): sm 32, md 40, lg 64, xl 96. The status mark sits in a cut-out at the bottom right. */
const SIZES: Record<PresenceAvatarSize, { box: string; text: string; mark: string; cutout: string; place: string }> = {
    sm: { box: "h-8 w-8", text: "text-[13px]", mark: "h-2.5 w-2.5", cutout: "p-[3px]", place: "-bottom-0.5 -end-0.5" },
    md: { box: "h-10 w-10", text: "text-[15px]", mark: "h-3 w-3", cutout: "p-[3px]", place: "-bottom-0.5 -end-0.5" },
    lg: { box: "h-16 w-16", text: "text-2xl", mark: "h-4 w-4", cutout: "p-1", place: "bottom-0 end-0" },
    xl: { box: "h-24 w-24", text: "text-4xl", mark: "h-[22px] w-[22px]", cutout: "p-[5px]", place: "bottom-0.5 end-0.5" },
};

const MARK_COLORS: Record<PresenceStatus, string> = {
    online: "fill-emerald-500",
    idle: "fill-amber-400",
    dnd: "fill-red-500",
    offline: "fill-zinc-400 dark:fill-zinc-500",
};

/**
 * The status shape alone (for menus and legends): online a filled green
 * circle, idle a yellow crescent moon, do not disturb a red circle with a
 * white bar, offline (and invisible) a gray hollow ring. Holes show whatever
 * is behind the mark. Decorative: label it where it is used.
 */
export function PresenceMark({ status, className = "h-3 w-3" }: { status: PresenceStatus; className?: string }) {
    return (
        <svg viewBox="0 0 20 20" className={`block shrink-0 ${MARK_COLORS[status]} ${className}`} aria-hidden="true" focusable="false">
            {status === "online" ? <circle cx="10" cy="10" r="10" /> : null}
            {status === "idle" ? <path d="M9.83 0A10 10 0 1 1 0 9.83A7 7 0 1 0 9.83 0Z" /> : null}
            {status === "dnd" ? (
                <>
                    <circle cx="10" cy="10" r="10" />
                    <rect x="4.5" y="8" width="11" height="4" rx="2" className="fill-white" />
                </>
            ) : null}
            {status === "offline" ? <path fillRule="evenodd" d="M10 0a10 10 0 1 1 0 20a10 10 0 1 1 0-20Zm0 5.5a4.5 4.5 0 1 0 0 9a4.5 4.5 0 1 0 0-9Z" /> : null}
        </svg>
    );
}

/** https URLs and site paths only; anything else shows the initial. */
function usableSource(src: string | null | undefined) {
    return typeof src === "string" && src.length <= 2_048 && /^(?:https:\/\/|\/(?![/\\]))/.test(src) ? src : null;
}

/**
 * A person's avatar (or initial) with a Discord-style status mark at the
 * bottom right. Pass `status` from effectiveStatus() (lib/presence.ts), or
 * leave it out to show no mark. `ring` holds the background classes of the
 * surface the avatar sits on: the cut-out around the mark uses them.
 */
export default function PresenceAvatar({ src, name, status = null, size = "md", ring = "bg-white dark:bg-zinc-900", className = "" }: {
    src?: string | null;
    name: string;
    status?: PresenceStatus | null;
    size?: PresenceAvatarSize;
    ring?: string;
    className?: string;
}) {
    const { tx } = useI18n();
    const [failedSrc, setFailedSrc] = useState<string | null>(null);
    const dims = SIZES[size];
    const usable = usableSource(src);
    const image = usable && usable !== failedSrc ? usable : null;
    const label = status ? tx(PRESENCE_STATUS_COPY[status]) : "";
    const initial = (Array.from(name.trim())[0] ?? "?").toUpperCase();

    return (
        <span className={`relative inline-flex shrink-0 ${dims.box} ${className}`}>
            {image ? (
                <OptimizedImage
                    src={image}
                    alt=""
                    className={`${dims.box} rounded-full bg-zinc-200 object-cover dark:bg-zinc-700`}
                    referrerPolicy="no-referrer"
                    onError={() => setFailedSrc(image)}
                />
            ) : (
                <span aria-hidden="true" className={`grid ${dims.box} select-none place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 font-bold text-white ${dims.text}`}>
                    {initial}
                </span>
            )}
            {status ? (
                <span role="img" aria-label={label} title={label} className={`absolute ${dims.place} rounded-full ${dims.cutout} ${ring}`}>
                    <PresenceMark status={status} className={dims.mark} />
                </span>
            ) : null}
        </span>
    );
}
