"use client";

import Header from "@/components/Header";
import AiSettingsPage from "@/components/HanogtAI/AiSettingsPage";

export default function HanogtAISettingsPage() {
    return (
        <main className="min-h-dvh bg-ai-paper">
            <Header />
            <div className="pt-16">
                <AiSettingsPage />
            </div>
        </main>
    );
}
