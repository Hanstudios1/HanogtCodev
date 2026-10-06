"use client";

import { motion, useMotionValue, useReducedMotionConfig, useSpring, useTransform } from "framer-motion";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";

/** Rises into view once, when it scrolls in. */
export function Reveal({ children, delay = 0, className, y = 28 }: { children: ReactNode; delay?: number; className?: string; y?: number }) {
    return (
        <motion.div
            initial={{ opacity: 0, y }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
            className={className}
        >
            {children}
        </motion.div>
    );
}

/** A preview that leans toward the pointer (not with reduced motion or touch). */
export function TiltCard({ children }: { children: ReactNode }) {
    const still = useReducedMotionConfig();
    const x = useMotionValue(0);
    const y = useMotionValue(0);
    const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [5, -5]), { stiffness: 200, damping: 20 });
    const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-6, 6]), { stiffness: 200, damping: 20 });
    const move = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (still || event.pointerType !== "mouse") return;
        const box = event.currentTarget.getBoundingClientRect();
        x.set((event.clientX - box.left) / box.width - 0.5);
        y.set((event.clientY - box.top) / box.height - 0.5);
    };
    const leave = () => {
        x.set(0);
        y.set(0);
    };
    return (
        <div style={{ perspective: 1100 }} onPointerMove={move} onPointerLeave={leave}>
            <motion.div style={still ? undefined : { rotateX, rotateY }} whileHover={still ? undefined : { scale: 1.015 }} transition={{ type: "spring", stiffness: 260, damping: 22 }}>
                {children}
            </motion.div>
        </div>
    );
}
