/**
 * Text and images for the share cards (Open Graph images) of Arcade games and
 * Media posts, rendered on request by src/lib/server/og-cards.tsx and never
 * stored. The renderer has one bundled font: emoji and pictographs would make
 * it fetch images from a CDN while rendering, so they are dropped here, along
 * with control and direction-override characters.
 */

/** Invisible formatting (zero-width spaces, direction overrides, variation selectors) and emoji. */
const INVISIBLE = /[\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff\ufe0e\ufe0f\u20e3]|\p{Extended_Pictographic}|\p{Regional_Indicator}|[\u{1f3fb}-\u{1f3ff}]/gu;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;

/**
 * One line of card text: line breaks become spaces, no emoji or invisible
 * characters, at most `max` characters; a longer text is cut at a word
 * boundary when there is one near the end, and gets "…".
 */
export function ogText(value: unknown, max: number): string {
    if (typeof value !== "string") return "";
    const text = value.normalize("NFC").replace(INVISIBLE, "").replace(/\s+/g, " ").replace(CONTROL, "").replace(/ {2,}/g, " ").trim();
    const characters = [...text];
    if (characters.length <= max) return text;
    const cut = characters.slice(0, Math.max(1, max - 1)).join("");
    const space = cut.lastIndexOf(" ");
    return `${(space >= cut.length * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–—-]+$/, "")}…`;
}

/** A stored thumbnail the renderer can draw without fetching anything: a PNG or JPEG data URL of a sane size. */
export function ogImageSource(value: unknown): string | null {
    if (typeof value !== "string" || value.length > 400_000) return null;
    return /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value) ? value : null;
}

/** Compact counts for a card ("1,2 B" style numbers would need the visitor's locale; cards use 1.2K). */
export function ogCount(value: unknown): string {
    const number = typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
    if (number < 1000) return String(number);
    if (number < 999_500) return `${(number / 1000).toFixed(number < 9_950 ? 1 : 0).replace(/\.0$/, "")}K`;
    return `${(number / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}
