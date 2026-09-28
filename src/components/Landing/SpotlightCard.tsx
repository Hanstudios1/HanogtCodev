"use client";

import { useRef } from "react";

/** Card with a soft light that follows the pointer (CSS variables, no re-renders). */
export default function SpotlightCard({ className = "", children, color = "rgba(99,102,241,0.18)" }: { className?: string; children: React.ReactNode; color?: string }) {
    const ref = useRef<HTMLDivElement | null>(null);
    return (
        <div
            ref={ref}
            onPointerMove={(event) => {
                const element = ref.current;
                if (!element) return;
                const rect = element.getBoundingClientRect();
                element.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
                element.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
            }}
            className={`group/spot relative isolate overflow-hidden rounded-3xl border border-zinc-200/80 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-indigo-500/10 dark:border-white/[0.08] dark:bg-zinc-900/60 ${className}`}
        >
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-300 group-hover/spot:opacity-100"
                style={{ background: `radial-gradient(420px circle at var(--spot-x, 50%) var(--spot-y, 50%), ${color}, transparent 60%)` }}
            />
            {children}
        </div>
    );
}
