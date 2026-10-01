"use client";

import { Sparkles } from "lucide-react";
import { openHanogtAI } from "@/lib/ai/context-store";
import { useI18n } from "@/lib/i18n";

/** Editor launcher for Hanogt AI (code mode). The open file is shared through publishAiContext(). */
export default function AIAssistant() {
    const { tx } = useI18n();
    return (
        <button
            type="button"
            onClick={() => openHanogtAI({ mode: "code" })}
            className="group fixed bottom-6 end-6 z-50 flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 p-4 text-white shadow-2xl shadow-violet-600/30 transition-all hover:scale-105 hover:brightness-110"
            aria-label="Hanogt AI"
        >
            <Sparkles className="h-6 w-6" />
            <span className="max-w-0 overflow-hidden whitespace-nowrap font-bold transition-all duration-300 group-hover:max-w-xs">
                {tx({ TR: "Hanogt AI'a sor", EN: "Ask Hanogt AI" })}
            </span>
        </button>
    );
}
