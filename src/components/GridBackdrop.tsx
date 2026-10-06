"use client";

import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/lib/appearance";

/**
 * The grid pattern behind a page's top section. It drifts slowly, and with a
 * mouse the lines around the pointer light up in the accent's colors. The
 * parent must be `relative isolate` (the grid sits at -z-10); nothing moves
 * with reduced motion or on touch screens.
 */
export default function GridBackdrop({ fade = "radial", className = "", spotlight = true }: {
    /** "radial": fades toward the edges · "bottom": fades out downward. */
    fade?: "radial" | "bottom";
    className?: string;
    spotlight?: boolean;
}) {
    const ref = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const layer = ref.current;
        const host = layer?.parentElement;
        if (!layer || !host || !spotlight || prefersReducedMotion() || !window.matchMedia("(pointer: fine)").matches) return;
        let frame = 0;
        let x = 0;
        let y = 0;
        const paint = () => {
            frame = 0;
            layer.style.setProperty("--spot-x", `${x}px`);
            layer.style.setProperty("--spot-y", `${y}px`);
        };
        const move = (event: PointerEvent) => {
            if (event.pointerType !== "mouse") return;
            const box = host.getBoundingClientRect();
            x = event.clientX - box.left;
            y = event.clientY - box.top;
            layer.dataset.lit = "1";
            if (!frame) frame = requestAnimationFrame(paint);
        };
        const leave = () => {
            delete layer.dataset.lit;
        };
        host.addEventListener("pointermove", move);
        host.addEventListener("pointerleave", leave);
        return () => {
            cancelAnimationFrame(frame);
            host.removeEventListener("pointermove", move);
            host.removeEventListener("pointerleave", leave);
        };
    }, [spotlight]);

    const mask = fade === "radial" ? "mask-radial" : "mask-fade-b";
    return (
        <div ref={ref} aria-hidden="true" className={`group/grid pointer-events-none absolute inset-0 -z-10 overflow-hidden ${className}`}>
            <div className={`absolute inset-0 bg-grid opacity-80 animate-grid-drift motion-reduce:animate-none ${mask}`} />
            {spotlight ? (
                <div
                    className="absolute inset-0 bg-grid-accent opacity-0 transition-opacity duration-500 animate-grid-drift motion-reduce:animate-none group-data-[lit]/grid:opacity-100"
                    style={{ maskImage: "radial-gradient(260px circle at var(--spot-x, 50%) var(--spot-y, 30%), black, transparent 75%)", WebkitMaskImage: "radial-gradient(260px circle at var(--spot-x, 50%) var(--spot-y, 30%), black, transparent 75%)" }}
                />
            ) : null}
        </div>
    );
}
