"use client";

import { useEffect, useRef } from "react";
import { COMMENT_REJECTIONS, MEDIA_ERRORS, MediaApiError } from "@/components/Editor/media-api";
import type { Copy } from "@/lib/i18n";
import type { MediaFeedPage, Translate } from "./types";

export function formatDate(value: string | undefined, locale: string, fallback: string) {
    if (!value) return fallback;
    try {
        return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value));
    } catch {
        return fallback;
    }
}

export function formatCount(value: number, locale: string) {
    try {
        return new Intl.NumberFormat(locale, { notation: value >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
    } catch {
        return String(value);
    }
}

/** The ?post=<id> deep link, kept in sync with the open post without adding history entries. */
export function setPostParam(id: string | null) {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("post", id);
    else url.searchParams.delete("post");
    window.history.replaceState(window.history.state, "", url);
}

/** Escape closes a dialog; focus moves into it and returns afterwards. */
export function useDialogFocus(open: boolean, onClose: () => void) {
    const ref = useRef<HTMLDivElement>(null);
    const closeRef = useRef(onClose);
    useEffect(() => {
        closeRef.current = onClose;
    }, [onClose]);
    useEffect(() => {
        if (!open) return;
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const frame = window.requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus());
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            closeRef.current();
        };
        document.addEventListener("keydown", onKeyDown);
        return () => {
            window.cancelAnimationFrame(frame);
            document.removeEventListener("keydown", onKeyDown);
            if (previous?.isConnected) previous.focus();
        };
    }, [open]);
    return ref;
}

/** Translates an error from /api/media: known codes in the visitor's language, otherwise the Turkish server message for Turkish visitors. */
export function errorMessage(error: unknown, fallback: Copy, tx: Translate, uiLanguage: string) {
    if (error instanceof MediaApiError) {
        if (error.code === "comment_rejected" && error.reason && COMMENT_REJECTIONS[error.reason]) return tx(COMMENT_REJECTIONS[error.reason]);
        const known = MEDIA_ERRORS[error.code];
        if (known && error.code !== "failed") return tx(known, { name: error.file ?? "", tag: error.tag ?? "" });
        if (uiLanguage === "TR" && error.message && error.message !== error.code) return error.message;
    }
    return tx(fallback);
}

/** GET /api/media (a page of the gallery or one post); throws MediaApiError. */
export async function fetchMedia<T = MediaFeedPage>(url: string, signal?: AbortSignal): Promise<T> {
    let response: Response;
    try {
        response = await fetch(url, { cache: "no-store", signal });
    } catch (error) {
        if (signal?.aborted) throw error;
        throw new MediaApiError("network", 0);
    }
    const data = await response.json().catch(() => ({})) as T & { error?: string; code?: string };
    if (!response.ok) throw new MediaApiError(data.code || "failed", response.status, data.error || "");
    return data;
}
