"use client";

import Header from "@/components/Header";
import AiApiPage from "@/components/HanogtAI/AiApiPage";

export default function HanogtAIApiPage() {
    return (
        <main className="min-h-dvh bg-ai-paper">
            <Header />
            <div className="pt-16">
                <AiApiPage />
            </div>
        </main>
    );
}
