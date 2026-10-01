"use client";

import { motion } from "framer-motion";
import { LayoutDashboard, LoaderCircle, LogIn, ShieldOff } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import AdminPanel from "@/components/Admin/AdminPanel";
import { adminRequest, type ApiFailure } from "@/components/Admin/api";
import type { AdminIdentity, AdminMeResponse } from "@/components/Admin/types";
import { ErrorNotice } from "@/components/Admin/ui";
import Header from "@/components/Header";
import { useI18n } from "@/lib/i18n";

type Access =
    | { phase: "checking" }
    | { phase: "denied" }
    | { phase: "error"; error: ApiFailure }
    | { phase: "granted"; me: AdminIdentity };

/**
 * Admin entry point. Only /api/admin/me is requested until the server confirms
 * a staff role; everyone else gets a plain "no access" screen and no data.
 */
export default function AdminPage() {
    const { tx } = useI18n();
    const { status } = useSession();
    const [attempt, setAttempt] = useState(0);
    const [access, setAccess] = useState<Access>({ phase: "checking" });

    useEffect(() => {
        const controller = new AbortController();
        void adminRequest<AdminMeResponse>("/api/admin/me", { signal: controller.signal }).then((result) => {
            if (controller.signal.aborted) return;
            if (!result.ok) setAccess({ phase: "error", error: result });
            else setAccess(result.data.isAdmin ? { phase: "granted", me: result.data } : { phase: "denied" });
        });
        return () => controller.abort();
    }, [attempt]);

    if (access.phase === "granted") return <AdminPanel me={access.me} />;

    const retry = () => {
        setAccess({ phase: "checking" });
        setAttempt((value) => value + 1);
    };

    return (
        <div className="min-h-dvh bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
            <Header />
            <main id="main-content" className="mx-auto flex min-h-dvh max-w-xl items-center px-4 pb-16 pt-24">
                {access.phase === "checking" ? (
                    <div role="status" className="mx-auto flex flex-col items-center gap-3 text-sm text-zinc-500">
                        <LoaderCircle className="h-8 w-8 animate-spin text-indigo-500" aria-hidden="true" />
                        {tx({ TR: "Yetkiniz kontrol ediliyor…", EN: "Checking your access…" })}
                    </div>
                ) : access.phase === "error" ? (
                    <div className="w-full">
                        <ErrorNotice error={access.error} onRetry={retry} />
                    </div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="w-full rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-zinc-900"
                    >
                        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-zinc-100 text-zinc-500 dark:bg-white/[0.06] dark:text-zinc-400">
                            <ShieldOff className="h-7 w-7" aria-hidden="true" />
                        </span>
                        <h1 className="mt-5 text-2xl font-black tracking-tight">{tx({ TR: "Bu sayfaya erişim yetkiniz yok", EN: "You don't have access to this page" })}</h1>
                        <p className="mt-2 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                            {status === "unauthenticated"
                                ? tx({ TR: "Yönetici Paneli yalnızca yetkili ekip hesaplarına açıktır. Ekip hesabınız varsa giriş yapın.", EN: "The admin panel is only open to authorised staff accounts. Sign in if you have one." })
                                : tx({ TR: "Yönetici Paneli yalnızca yetkili ekip hesaplarına açıktır. Bunun bir hata olduğunu düşünüyorsanız bir yöneticiye başvurun.", EN: "The admin panel is only open to authorised staff accounts. If you think this is a mistake, contact an administrator." })}
                        </p>
                        <div className="mt-6 flex flex-wrap justify-center gap-2">
                            {status === "unauthenticated" ? (
                                <Link href="/login?callbackUrl=%2Fadmin" className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:from-indigo-500 hover:to-violet-500">
                                    <LogIn className="h-4 w-4" aria-hidden="true" />{tx({ TR: "Giriş yap", EN: "Sign in" })}
                                </Link>
                            ) : null}
                            <Link href="/dashboard" className="inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-100 dark:hover:bg-white/[0.08]">
                                <LayoutDashboard className="h-4 w-4" aria-hidden="true" />{tx({ TR: "Panele dön", EN: "Back to dashboard" })}
                            </Link>
                        </div>
                    </motion.div>
                )}
            </main>
        </div>
    );
}
