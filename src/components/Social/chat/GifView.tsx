"use client";

import { Play } from "lucide-react";
import { useEffect, useState } from "react";
import { cx } from "@/components/Groups/ui";
import { useI18n, type Copy } from "@/lib/i18n";
import type { MessageGif } from "@/lib/social/gif";

const C = {
    gif: { TR: "GIF: {title}", EN: "GIF: {title}" },
    untitled: { TR: "GIF", EN: "GIF" },
    play: { TR: "GIF'i oynat", EN: "Play GIF" },
} satisfies Record<string, Copy>;

const MAX_WIDTH = 300;
const MAX_HEIGHT = 260;

function useReducedMotion() {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
        const query = window.matchMedia("(prefers-reduced-motion: reduce)");
        const update = () => setReduced(query.matches);
        update();
        query.addEventListener("change", update);
        return () => query.removeEventListener("change", update);
    }, []);
    return reduced;
}

/** The size a GIF is shown at: its own shape, at most 300 × 260 px (narrower screens shrink it). */
export function gifBox(gif: Pick<MessageGif, "width" | "height">) {
    const scale = Math.min(1, MAX_WIDTH / gif.width, MAX_HEIGHT / gif.height);
    return { width: Math.max(80, Math.round(gif.width * scale)), height: Math.max(60, Math.round(gif.height * scale)) };
}

/**
 * A GIF in a message. With "GIFs play automatically" off (or reduced motion
 * asked for by the system) it shows a still frame and plays while hovered,
 * focused or after a tap.
 */
export default function GifView({ gif, autoplay, className }: { gif: MessageGif; autoplay: boolean; className?: string }) {
    const { tx } = useI18n();
    const reduced = useReducedMotion();
    const still = !autoplay || reduced;
    const [playing, setPlaying] = useState(false);
    const box = gifBox(gif);
    const label = gif.title ? tx(C.gif, { title: gif.title }) : tx(C.untitled);
    const animate = !still || playing;
    const source = animate || !gif.still ? gif.url : gif.still;

    const image = (
        // eslint-disable-next-line @next/next/no-img-element -- GIF providers' media hosts; next/image would proxy and re-encode animations.
        <img
            src={source}
            alt={label}
            width={box.width}
            height={box.height}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            draggable={false}
            className="block h-auto max-w-full bg-zinc-100 object-cover dark:bg-zinc-800"
            style={{ aspectRatio: `${box.width} / ${box.height}` }}
        />
    );

    if (!still) {
        return <div className={cx("mt-1 w-fit max-w-full overflow-hidden rounded-xl", className)} style={{ width: box.width }}>{image}</div>;
    }
    return (
        <button
            type="button"
            onPointerEnter={() => setPlaying(true)}
            onPointerLeave={() => setPlaying(false)}
            onFocus={() => setPlaying(true)}
            onBlur={() => setPlaying(false)}
            onClick={(event) => { event.stopPropagation(); setPlaying((value) => !value); }}
            aria-pressed={playing}
            aria-label={`${tx(C.play)} — ${label}`}
            className={cx("relative mt-1 block w-fit max-w-full overflow-hidden rounded-xl", className)}
            style={{ width: box.width }}
        >
            {animate || gif.still ? image : <span className="flex items-center justify-center bg-zinc-100 text-sm font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400" style={{ width: box.width, aspectRatio: `${box.width} / ${box.height}` }}>{gif.title || "GIF"}</span>}
            {!playing && (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
                    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-950/70 px-2.5 py-1 text-xs font-black tracking-wide text-white"><Play className="h-3 w-3 fill-current" />GIF</span>
                </span>
            )}
        </button>
    );
}
