"use client";

import { useEffect, useState } from "react";

export default function ScrollLines() {
    const [scrollY, setScrollY] = useState(0);

    useEffect(() => {
        const handleScroll = () => {
            setScrollY(window.scrollY);
        };

        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    // Calculate line movements based on scroll
    const line1Y = scrollY * 0.15;
    const line2Y = scrollY * 0.25;
    const line3Y = scrollY * 0.2;

    return (
        <>
            {/* Line 1 - Green curved line on left side */}
            <div
                className="fixed left-0 top-0 w-full h-full pointer-events-none z-0 overflow-hidden"
                style={{ opacity: Math.max(0, 1 - scrollY / 2000) }}
            >
                <svg
                    className="absolute -left-20 top-[30%]"
                    width="300"
                    height="1500"
                    viewBox="0 0 300 1500"
                    fill="none"
                    style={{
                        transform: `translateY(${line1Y}px)`,
                        transition: "transform 0.05s linear",
                    }}
                >
                    <path
                        d="M 150 0 
                           C 250 200, 50 400, 150 600 
                           C 250 800, 50 1000, 150 1200 
                           C 250 1400, 100 1500, 150 1500"
                        stroke="url(#greenGradient)"
                        strokeWidth="3"
                        fill="none"
                        strokeLinecap="round"
                    />
                    <defs>
                        <linearGradient id="greenGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="#22c55e" stopOpacity="0" />
                            <stop offset="20%" stopColor="#22c55e" stopOpacity="0.7" />
                            <stop offset="50%" stopColor="#16a34a" stopOpacity="0.8" />
                            <stop offset="80%" stopColor="#15803d" stopOpacity="0.7" />
                            <stop offset="100%" stopColor="#166534" stopOpacity="0" />
                        </linearGradient>
                    </defs>
                </svg>

                {/* Line 2 - Teal/Cyan curved line on right side */}
                <svg
                    className="absolute -right-20 top-[20%]"
                    width="300"
                    height="1800"
                    viewBox="0 0 300 1800"
                    fill="none"
                    style={{
                        transform: `translateY(${line2Y}px)`,
                        transition: "transform 0.05s linear",
                    }}
                >
                    <path
                        d="M 150 0 
                           C 50 300, 250 500, 150 800 
                           C 50 1100, 250 1300, 150 1600 
                           C 50 1750, 200 1800, 150 1800"
                        stroke="url(#cyanGradient)"
                        strokeWidth="2.5"
                        fill="none"
                        strokeLinecap="round"
                    />
                    <defs>
                        <linearGradient id="cyanGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0" />
                            <stop offset="20%" stopColor="#06b6d4" stopOpacity="0.6" />
                            <stop offset="50%" stopColor="#0891b2" stopOpacity="0.7" />
                            <stop offset="80%" stopColor="#0e7490" stopOpacity="0.6" />
                            <stop offset="100%" stopColor="#155e75" stopOpacity="0" />
                        </linearGradient>
                    </defs>
                </svg>

                {/* Line 3 - Purple/Violet accent line center-left */}
                <svg
                    className="absolute left-[15%] top-[50%]"
                    width="200"
                    height="1200"
                    viewBox="0 0 200 1200"
                    fill="none"
                    style={{
                        transform: `translateY(${line3Y}px)`,
                        transition: "transform 0.05s linear",
                    }}
                >
                    <path
                        d="M 100 0 
                           C 180 200, 20 400, 100 600 
                           C 180 800, 20 1000, 100 1200"
                        stroke="url(#purpleGradient)"
                        strokeWidth="2"
                        fill="none"
                        strokeLinecap="round"
                    />
                    <defs>
                        <linearGradient id="purpleGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="#a855f7" stopOpacity="0" />
                            <stop offset="30%" stopColor="#a855f7" stopOpacity="0.5" />
                            <stop offset="70%" stopColor="#7c3aed" stopOpacity="0.5" />
                            <stop offset="100%" stopColor="#6d28d9" stopOpacity="0" />
                        </linearGradient>
                    </defs>
                </svg>

                {/* Decorative circles */}
                <div
                    className="absolute left-[5%] top-[40%] w-80 h-80 rounded-full border border-zinc-700/20 dark:border-zinc-600/10"
                    style={{
                        transform: `translateY(${line1Y * 0.3}px)`,
                        transition: "transform 0.1s linear",
                    }}
                />
                <div
                    className="absolute right-[10%] top-[60%] w-64 h-64 rounded-full border border-zinc-700/15 dark:border-zinc-600/10"
                    style={{
                        transform: `translateY(${line2Y * 0.2}px)`,
                        transition: "transform 0.1s linear",
                    }}
                />
                <div
                    className="absolute left-[30%] top-[80%] w-48 h-48 rounded-full border border-green-500/10"
                    style={{
                        transform: `translateY(${line3Y * 0.4}px)`,
                        transition: "transform 0.1s linear",
                    }}
                />
            </div>
        </>
    );
}
