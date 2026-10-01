/**
 * Screen-space layout of UI components. The overlay positions elements with
 * these rectangles and the runtime hit-tests clicks against the same numbers,
 * so what you see is exactly what you can click.
 */
import type { UIAnchor, UIRectFields } from "./types";

/** UI sizes are authored for a 540 px tall screen and scaled with the view. */
export const UI_REFERENCE_HEIGHT = 540;

export interface ScreenRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

export function uiScale(screenHeight: number): number {
    return Math.max(0.35, screenHeight / UI_REFERENCE_HEIGHT);
}

export function anchorParts(anchor: UIAnchor): { horizontal: "left" | "center" | "right"; vertical: "top" | "middle" | "bottom" } {
    const horizontal = anchor === "left" || anchor.endsWith("-left") ? "left" : anchor === "right" || anchor.endsWith("-right") ? "right" : "center";
    const vertical = anchor.startsWith("top") ? "top" : anchor.startsWith("bottom") ? "bottom" : "middle";
    return { horizontal, vertical };
}

/**
 * Rectangle in CSS pixels (origin top-left). Offsets point inwards from the
 * anchored edge; centered axes move right/down with positive offsets.
 */
export function uiRect(rect: Pick<UIRectFields, "anchor" | "offset" | "width" | "height">, screen: { width: number; height: number }, scale = uiScale(screen.height)): ScreenRect {
    const width = Math.max(0, rect.width) * scale;
    const height = Math.max(0, rect.height) * scale;
    const x = rect.offset.x * scale;
    const y = rect.offset.y * scale;
    const { horizontal, vertical } = anchorParts(rect.anchor);
    const left = horizontal === "left" ? x : horizontal === "right" ? screen.width - x - width : screen.width / 2 + x - width / 2;
    const top = vertical === "top" ? y : vertical === "bottom" ? screen.height - y - height : screen.height / 2 + y - height / 2;
    return { left, top, width, height };
}

/** Scales a rectangle around its center (Transform scale of UI objects). */
export function scaleRect(rect: ScreenRect, scaleX: number, scaleY: number): ScreenRect {
    const width = rect.width * Math.abs(scaleX);
    const height = rect.height * Math.abs(scaleY);
    return { left: rect.left + (rect.width - width) / 2, top: rect.top + (rect.height - height) / 2, width, height };
}

export function rectContains(rect: ScreenRect, x: number, y: number): boolean {
    return x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height;
}

/** 0…1 fill of a progress bar (min/max may be reversed or equal). */
export function progressFraction(bar: { value: number; min: number; max: number }): number {
    const span = bar.max - bar.min;
    if (!Number.isFinite(span) || Math.abs(span) < 1e-9) return bar.value >= bar.max ? 1 : 0;
    return Math.min(1, Math.max(0, (bar.value - bar.min) / span));
}
