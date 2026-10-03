"use client";

import Header from "@/components/Header";
import AiSettingsPage from "@/components/HanogtAI/AiSettingsPage";

export default function HanogtAISettingsPage() {
    return (
        <main className="min-h-dvh bg-[#fbfaf8] dark:bg-zinc-950">
            <Header />
            <div className="pt-16">
                <AiSettingsPage />
            </div>
        </main>
    );
}
