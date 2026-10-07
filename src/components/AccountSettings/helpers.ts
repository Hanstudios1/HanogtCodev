import type { CSSProperties, MouseEvent } from "react";
import { isHexColor, isSafeProfileUrl, type EditableAccountFields } from "@/lib/account-profile";

export function formatDate(iso: string | null | undefined, locale: string, options: Intl.DateTimeFormatOptions) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    try {
        return new Intl.DateTimeFormat(locale, options).format(date);
    } catch {
        return date.toISOString().slice(0, 10);
    }
}

/**
 * The strip at the top of a profile card: the banner image, else the accent
 * colour (flat, no gradient); without either the caller's neutral surface
 * shows. Profile values are user-written: only plain https URLs reach CSS url().
 */
export function bandStyle(fields: Pick<EditableAccountFields, "bannerUrl" | "accentColor"> | null): CSSProperties | undefined {
    if (!fields) return undefined;
    const banner = fields.bannerUrl.trim();
    if (banner && isSafeProfileUrl(banner) && /^https:\/\//.test(banner)) return { background: `url("${banner}") center/cover no-repeat` };
    return isHexColor(fields.accentColor) ? { backgroundColor: fields.accentColor } : undefined;
}

/**
 * In-page links (#profile): a plain click stays on the page (true, default
 * prevented); with a modifier key or another button the browser opens the
 * link as usual (false).
 */
export function plainClick(event: MouseEvent) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
    event.preventDefault();
    return true;
}
