"use client";

import Header from "@/components/Header";
import Hero from "@/components/Hero";
import Comparison from "@/components/Comparison";
import Timeline from "@/components/Timeline";
import ImageCarousel from "@/components/ImageCarousel";
import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { motion } from "framer-motion";

export default function Home() {
  const [showBanner, setShowBanner] = useState(false);
  const { t } = useI18n();

  // Check if banner was closed before
  useEffect(() => {
    const bannerClosed = localStorage.getItem("hanogt_banner_closed");
    if (!bannerClosed) {
      setShowBanner(true);
    }
  }, []);

  const handleCloseBanner = () => {
    localStorage.setItem("hanogt_banner_closed", "true");
    setShowBanner(false);
  };

  return (
    <main className="min-h-screen w-full bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white transition-colors duration-300">
      {/* Warning Banner */}
      {showBanner && (
        <div className="w-full bg-yellow-500 text-black text-center text-sm font-bold py-2 px-4 shadow-sm z-[60] relative flex justify-between items-center">
          <span className="flex-1">{t("banner_warning")}</span>
          <button onClick={handleCloseBanner} className="p-1 hover:bg-yellow-600 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <Header />

      <Hero />

      {/* Image Slider Comparison - Replit vs Hanogt */}
      <ImageCarousel />

      {/* Comparison Table Section */}
      <section className="py-20 bg-zinc-50 dark:bg-zinc-900 flex flex-col items-center">
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-3xl font-bold mb-10 text-center px-4"
        >
          {t("why_hanogt") || "Neden Hanogt Codev?"}
        </motion.h2>
        <div className="w-full px-6">
          <Comparison />
        </div>
      </section>

      {/* Features Timeline Section */}
      <Timeline />

      {/* Footer */}
      <footer className="py-8 bg-zinc-100 dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">
            © 2025 Hanogt Codev. {t("all_rights_reserved") || "Tüm hakları saklıdır."}
          </p>
          <div className="flex items-center gap-6 text-sm">
            <a
              href="/privacy-policy"
              className="text-zinc-600 dark:text-zinc-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
            >
              {t("privacy_policy") || "Gizlilik Politikası"}
            </a>
            <a
              href="https://github.com/Hanstudios1/HanogtLanguageSoftwareScript"
              target="_blank"
              className="text-zinc-600 dark:text-zinc-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
