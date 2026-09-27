"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";

export default function ThemeToggle({ className = "" }: { className?: string }) {
    const { theme, toggle } = useTheme();
    const dark = theme === "dark";

    return (
        <button
            type="button"
            onClick={toggle}
            className={`relative grid h-9 w-9 place-items-center rounded-xl text-zinc-600 transition hover:bg-zinc-900/5 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white ${className}`}
            aria-label={dark ? "Açık temaya geç" : "Koyu temaya geç"}
            title={dark ? "Açık tema" : "Koyu tema"}
        >
            <Sun className={`h-[18px] w-[18px] transition-all duration-300 ${dark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"}`} />
            <Moon className={`absolute h-[18px] w-[18px] transition-all duration-300 ${dark ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"}`} />
        </button>
    );
}
