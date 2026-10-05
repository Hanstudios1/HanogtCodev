"use client";

import { ChevronDown, Download, Share, X } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import OptimizedImage from "@/components/OptimizedImage";
import { detectDevice, type DevicePlatform, type DownloadPlatform, type DownloadsResponse } from "@/lib/downloads";
import { useI18n, type Copy } from "@/lib/i18n";
import { RELEASES_URL } from "@/lib/site";

const PLATFORMS: Array<{ id: DownloadPlatform; name: string; logo: string; kind: string }> = [
    { id: "windows", name: "Windows", logo: "/platforms/windows.png", kind: ".exe" },
    { id: "macos", name: "macOS", logo: "/platforms/macos.png", kind: ".dmg · Apple silicon" },
    { id: "linux", name: "Linux", logo: "/platforms/linux.png", kind: ".AppImage" },
    { id: "android", name: "Android", logo: "/platforms/android.png", kind: ".apk" },
];

const C = {
    button: { TR: "Uygulamayı indir", EN: "Download the app" },
    title: { TR: "Hanogt Codev'i indir", EN: "Download Hanogt Codev" },
    thisDevice: { TR: "Bu cihaz", EN: "This device" },
    soon: { TR: "Yakında", EN: "Coming soon" },
    iosTitle: { TR: "iPhone ve iPad", EN: "iPhone and iPad" },
    iosHow: { TR: "Safari'de Paylaş'a, sonra “Ana Ekrana Ekle”ye dokun: Hanogt bir uygulama gibi açılır.", EN: "In Safari, tap Share, then “Add to Home Screen”: Hanogt opens like an app." },
    allReleases: { TR: "Tüm sürümler", EN: "All releases" },
    close: { TR: "Kapat", EN: "Close" },
} satisfies Record<string, Copy>;

const MENU_WIDTH = 304;

/**
 * "Download the app": the desktop builds and the Android app of the latest
 * release, through /api/download, so the links don't change with versions.
 * A popover under (or above, when there's no room) the button on wide
 * screens, a bottom sheet on phones; rendered into <body> so no section can
 * clip it. iPhone and iPad get the "Add to Home Screen" steps instead.
 */
export default function DownloadMenu() {
    const { tx } = useI18n();
    const menuId = useId();
    const [open, setOpen] = useState(false);
    const [device, setDevice] = useState<DevicePlatform | null>(null);
    const [available, setAvailable] = useState<DownloadsResponse | null | "offline">(null);
    const [sheet, setSheet] = useState(false);
    const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);

    const close = useCallback((returnFocus = false) => {
        setOpen(false);
        if (returnFocus) buttonRef.current?.focus();
    }, []);

    const toggle = () => {
        if (open) return close();
        setDevice((current) => current ?? detectDevice(navigator.userAgent, navigator.maxTouchPoints || 0));
        setSheet(window.matchMedia("(max-width: 639px)").matches);
        setOpen(true);
        if (available === null) {
            fetch("/api/download")
                .then((response) => (response.ok ? response.json() as Promise<DownloadsResponse> : Promise.reject(new Error(String(response.status)))))
                .then((data) => setAvailable(data))
                // The desktop app is a static export without API routes: the release page then.
                .catch(() => setAvailable("offline"));
        }
    };

    // Under the button, or above it when there's no room; kept inside the window.
    const place = useCallback(() => {
        const button = buttonRef.current;
        const menu = menuRef.current;
        if (!button || !menu || sheet) return;
        const rect = button.getBoundingClientRect();
        const height = menu.offsetHeight;
        const below = window.innerHeight - rect.bottom;
        const top = below < height + 16 && rect.top > height + 16 ? rect.top - height - 8 : rect.bottom + 8;
        const rtl = document.documentElement.dir === "rtl";
        const start = rtl ? rect.right - MENU_WIDTH : rect.left;
        const left = Math.min(Math.max(8, start), window.innerWidth - MENU_WIDTH - 8);
        setPosition({ top: top + window.scrollY, left: left + window.scrollX });
    }, [sheet]);

    useLayoutEffect(() => {
        if (open) place();
    }, [open, place, available]);

    useEffect(() => {
        if (!open) return;
        const onPointer = (event: PointerEvent) => {
            const target = event.target as Node;
            if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
            close();
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") close(true);
        };
        const onResize = () => place();
        document.addEventListener("pointerdown", onPointer);
        document.addEventListener("keydown", onKey);
        window.addEventListener("resize", onResize);
        window.addEventListener("scroll", onResize, { passive: true });
        menuRef.current?.querySelector<HTMLElement>("a, button")?.focus();
        return () => {
            document.removeEventListener("pointerdown", onPointer);
            document.removeEventListener("keydown", onKey);
            window.removeEventListener("resize", onResize);
            window.removeEventListener("scroll", onResize);
        };
    }, [close, open, place]);

    const offline = available === "offline";
    const hrefFor = (platform: DownloadPlatform) => (offline ? RELEASES_URL : `/api/download?platform=${platform}`);
    const ready = (platform: DownloadPlatform) => offline || available === null || Boolean(available.platforms[platform]);
    const releasesUrl = available && available !== "offline" ? available.releaseUrl : RELEASES_URL;
    const ordered = [...PLATFORMS].sort((a, b) => Number(b.id === device) - Number(a.id === device));

    const items = (
        <>
            {device === "ios" ? (
                <div className="rounded-xl bg-zinc-100 px-3 py-2.5 dark:bg-white/[0.06]">
                    <p className="flex items-center gap-2 text-[14px] font-semibold text-zinc-900 dark:text-white">
                        <OptimizedImage src="/platforms/ios.png" alt="" width={24} height={24} className="h-6 w-6 object-contain" />
                        {tx(C.iosTitle)}
                        <span className="ms-auto rounded-full bg-brand-green px-2 py-0.5 text-[10px] font-bold text-white">{tx(C.thisDevice)}</span>
                    </p>
                    <p className="mt-1.5 flex gap-1.5 text-[12.5px] leading-snug text-zinc-600 dark:text-zinc-300"><Share className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{tx(C.iosHow)}</p>
                </div>
            ) : null}
            {ordered.map((platform) => {
                const enabled = ready(platform.id);
                const content = (
                    <>
                        <OptimizedImage src={platform.logo} alt="" width={24} height={24} className="h-6 w-6 object-contain" />
                        <span className="min-w-0 flex-1">
                            <span className="block text-[14px] font-semibold text-zinc-900 dark:text-white">{platform.name}</span>
                            <span className="block text-[11.5px] text-zinc-500">{enabled ? platform.kind : tx(C.soon)}</span>
                        </span>
                        {platform.id === device && enabled ? <span className="rounded-full bg-brand-green px-2 py-0.5 text-[10px] font-bold text-white">{tx(C.thisDevice)}</span> : null}
                    </>
                );
                return enabled ? (
                    <a key={platform.id} href={hrefFor(platform.id)} rel="noopener noreferrer" onClick={() => close()} className="flex items-center gap-3 rounded-xl px-3 py-2.5 outline-none transition hover:bg-zinc-100 focus-visible:bg-zinc-100 dark:hover:bg-white/[0.06] dark:focus-visible:bg-white/[0.06]">
                        {content}
                    </a>
                ) : (
                    <div key={platform.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 opacity-60" aria-disabled="true">{content}</div>
                );
            })}
            <a href={releasesUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block rounded-xl px-3 py-2 text-[12.5px] font-semibold text-zinc-500 outline-none hover:bg-zinc-100 hover:text-zinc-800 focus-visible:bg-zinc-100 dark:hover:bg-white/[0.06] dark:hover:text-zinc-200">{tx(C.allReleases)} ↗</a>
        </>
    );

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                onClick={toggle}
                aria-expanded={open}
                aria-controls={open ? menuId : undefined}
                className="inline-flex h-12 items-center gap-2 rounded-2xl border border-zinc-300 bg-white px-5 text-[14px] font-semibold text-zinc-800 transition hover:border-zinc-400 dark:border-white/15 dark:bg-transparent dark:text-zinc-100 dark:hover:border-white/30"
            >
                <Download className="h-4 w-4" aria-hidden="true" />{tx(C.button)}<ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            {open ? createPortal(
                sheet ? (
                    <div className="fixed inset-0 z-[120]">
                        <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
                        <div ref={menuRef} id={menuId} role="dialog" aria-modal="true" aria-label={tx(C.title)} className="absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-3xl border-t border-zinc-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl dark:border-white/10 dark:bg-zinc-900">
                            <div className="mb-1 flex items-center justify-between px-2 py-1">
                                <p className="text-[15px] font-black text-zinc-900 dark:text-white">{tx(C.title)}</p>
                                <button type="button" onClick={() => close(true)} className="grid h-9 w-9 place-items-center rounded-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10" aria-label={tx(C.close)}><X className="h-5 w-5" /></button>
                            </div>
                            {items}
                        </div>
                    </div>
                ) : (
                    <div
                        ref={menuRef}
                        id={menuId}
                        role="dialog"
                        aria-label={tx(C.title)}
                        style={{ position: "absolute", top: position?.top ?? -9999, left: position?.left ?? -9999, width: MENU_WIDTH }}
                        className="z-[120] max-h-[min(26rem,calc(100dvh-2rem))] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-2xl dark:border-white/10 dark:bg-zinc-900"
                    >
                        {items}
                    </div>
                ),
                document.body,
            ) : null}
        </>
    );
}
