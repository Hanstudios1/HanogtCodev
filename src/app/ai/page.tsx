"use client";

import Header from "@/components/Header";
import HanogtAIChat from "@/components/HanogtAI/HanogtAIChat";

export default function HanogtAIPage() {
    return (
        <main className="min-h-dvh bg-zinc-50 dark:bg-zinc-950">
            <Header />
            <div className="pt-16">
                <HanogtAIChat variant="page" />
            </div>
        </main>
    );
}
