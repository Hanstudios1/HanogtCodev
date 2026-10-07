"use client";

/**
 * Export → Web package (ZIP · PWA): the game as a folder for any static web
 * host that installs as an app and plays offline (see
 * src/lib/game-engine/web-export.ts for what is inside).
 */
import { loadAudioBytes } from "@/lib/game-engine/audio-store";
import type { GameProjectDocument } from "@/lib/game-engine/types";
import { WEB_ICONS, webPackageFiles, zipWebPackage } from "@/lib/game-engine/web-export";
import { SITE_URL } from "@/lib/site";
import { downloadBlob, safeFileName } from "./persistence";

function loadImage(source: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("image"));
        image.src = source;
    });
}

function canvasBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) reject(new Error("icon"));
            else void blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject);
        }, "image/png");
    });
}

/**
 * App icons from a picture of the scene (cropped to a square), or the game's
 * first letter when there is none. The maskable icon keeps its picture inside
 * the safe zone (the middle 80%) that launchers never cut off.
 */
async function renderIcons(snapshot: string | null, name: string): Promise<Map<string, Uint8Array>> {
    const image = snapshot ? await loadImage(snapshot).catch(() => null) : null;
    const draw = async (size: number, maskable: boolean) => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("canvas");
        context.fillStyle = "#09090b";
        context.fillRect(0, 0, size, size);
        const inset = maskable ? size * 0.1 : 0;
        const box = size - inset * 2;
        if (image) {
            const side = Math.min(image.width, image.height);
            context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, inset, inset, box, box);
        } else {
            context.fillStyle = "#6366f1";
            context.fillRect(inset, inset, box, box);
            context.fillStyle = "#ffffff";
            context.font = `900 ${Math.round(box * 0.56)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillText((name.trim()[0] ?? "H").toLocaleUpperCase(), size / 2, size / 2 + box * 0.03);
        }
        return canvasBytes(canvas);
    };
    const [small, large, maskable] = await Promise.all([draw(192, false), draw(512, false), draw(512, true)]);
    return new Map([[WEB_ICONS[0], small], [WEB_ICONS[1], large], [WEB_ICONS[2], maskable]]);
}

export type WebPackageFailure = { kind: "player" } | { kind: "files"; names: string[] };

/** Builds and downloads the ZIP; resolves to what went wrong, or null. */
export async function exportWebPackage(project: GameProjectDocument, snapshot: (() => string) | undefined, branding: { badge?: boolean } = {}): Promise<WebPackageFailure | null> {
    const response = await fetch("/engine/player.js", { cache: "no-cache" }).catch(() => null);
    if (!response?.ok) return { kind: "player" };
    const playerJs = await response.text();
    const assets = new Map<string, ArrayBuffer>();
    const missing: string[] = [];
    for (const asset of [...project.audio, ...project.models]) {
        if (assets.has(asset.hash)) continue;
        const bytes = await loadAudioBytes(asset);
        if (bytes) assets.set(asset.hash, bytes);
        else missing.push(asset.name);
    }
    if (missing.length) return { kind: "files", names: missing };
    let picture: string | null = null;
    try {
        picture = snapshot ? snapshot() : null;
    } catch {
        picture = null;
    }
    const icons = await renderIcons(picture, project.name);
    const files = await webPackageFiles({ project, playerJs, assets, icons, siteUrl: SITE_URL, badge: branding.badge });
    const zip = await zipWebPackage(files);
    downloadBlob(new Blob([zip as BlobPart], { type: "application/zip" }), `${safeFileName(project.name)}-web.zip`);
    return null;
}
