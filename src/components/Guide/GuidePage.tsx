"use client";

import Header from "@/components/Header";
import SiteFooter from "@/components/SiteFooter";
import MinecraftBook from "./MinecraftBook";

export default function GuidePage() {
    return (
        <div className="min-h-dvh bg-[#2b1c10]">
            <Header />
            <main id="main-content">
                <MinecraftBook />
            </main>
            <SiteFooter />
        </div>
    );
}
