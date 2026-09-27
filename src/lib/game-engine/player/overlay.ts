/**
 * DOM overlay drawn above the game canvas: UI Text components, HUD messages,
 * FPS counter and on-screen touch controls. Plain DOM (no React) so it works
 * in the editor, the Arcade and exported HTML builds alike. Text is always set
 * through textContent, never as HTML.
 */
import type { GameComponent, UIAnchor, UITextComponent } from "../types";

export interface OverlayEntity {
    readonly id: string;
    readonly visible: boolean;
    readonly components: readonly GameComponent[];
}

export interface OverlayOptions {
    showFps: boolean;
    /** true = always, "auto" = only on touch devices, false = never. */
    touchControls: boolean | "auto";
    onVirtualKey?: (key: string, down: boolean) => void;
}

const REFERENCE_HEIGHT = 540;

function anchorStyle(anchor: UIAnchor, x: number, y: number): Partial<CSSStyleDeclaration> {
    const style: Partial<CSSStyleDeclaration> = { left: "", right: "", top: "", bottom: "", transform: "", textAlign: "left" };
    const horizontal = anchor.endsWith("left") || anchor === "left" ? "left" : anchor.endsWith("right") || anchor === "right" ? "right" : "center";
    const vertical = anchor.startsWith("top") ? "top" : anchor.startsWith("bottom") ? "bottom" : "middle";
    const transforms: string[] = [];
    if (horizontal === "left") style.left = `${x}px`;
    else if (horizontal === "right") {
        style.right = `${x}px`;
        style.textAlign = "right";
    } else {
        style.left = `calc(50% + ${x}px)`;
        transforms.push("translateX(-50%)");
        style.textAlign = "center";
    }
    if (vertical === "top") style.top = `${y}px`;
    else if (vertical === "bottom") style.bottom = `${y}px`;
    else {
        style.top = `calc(50% + ${y}px)`;
        transforms.push("translateY(-50%)");
    }
    style.transform = transforms.join(" ");
    return style;
}

export class GameOverlay {
    readonly element: HTMLDivElement;
    private readonly textLayer: HTMLDivElement;
    private readonly texts = new Map<string, { element: HTMLDivElement; key: string }>();
    private readonly hud: HTMLDivElement;
    private readonly fps: HTMLDivElement;
    private readonly notice: HTMLDivElement;
    private touch: HTMLDivElement | null = null;
    private fpsFrames = 0;
    private fpsTime = 0;
    private lastHud = "";

    constructor(parent: HTMLElement, private readonly options: OverlayOptions) {
        const root = document.createElement("div");
        root.className = "hanogt-overlay";
        Object.assign(root.style, { position: "absolute", inset: "0", pointerEvents: "none", overflow: "hidden", fontFamily: "Inter Variable, Inter, system-ui, sans-serif", userSelect: "none" });
        this.textLayer = document.createElement("div");
        Object.assign(this.textLayer.style, { position: "absolute", inset: "0" });
        root.appendChild(this.textLayer);

        this.hud = document.createElement("div");
        Object.assign(this.hud.style, {
            position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%) scale(0.9)", padding: "14px 26px",
            borderRadius: "16px", background: "rgba(9,9,11,0.72)", backdropFilter: "blur(8px)", color: "#fff", fontWeight: "800",
            fontSize: "26px", textAlign: "center", opacity: "0", transition: "opacity .25s ease, transform .25s ease", whiteSpace: "pre-line",
            boxShadow: "0 20px 60px rgba(0,0,0,.35)", maxWidth: "80%",
        });
        root.appendChild(this.hud);

        this.fps = document.createElement("div");
        Object.assign(this.fps.style, {
            position: "absolute", right: "8px", top: "8px", padding: "2px 8px", borderRadius: "8px", background: "rgba(0,0,0,.55)",
            color: "#a3e635", font: "600 11px JetBrains Mono Variable, ui-monospace, monospace", display: options.showFps ? "block" : "none",
        });
        root.appendChild(this.fps);

        this.notice = document.createElement("div");
        Object.assign(this.notice.style, {
            position: "absolute", left: "50%", bottom: "14px", transform: "translateX(-50%)", padding: "6px 12px", borderRadius: "999px",
            background: "rgba(127,29,29,.85)", color: "#fecaca", fontSize: "12px", fontWeight: "600", display: "none", whiteSpace: "nowrap",
        });
        root.appendChild(this.notice);

        parent.appendChild(root);
        this.element = root;
        const coarse = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
        if (options.touchControls === true || (options.touchControls === "auto" && coarse)) this.createTouchControls();
    }

    private createTouchControls() {
        const pad = document.createElement("div");
        Object.assign(pad.style, { position: "absolute", inset: "auto 0 0 0", height: "160px", pointerEvents: "none" });
        const button = (label: string, key: string, style: Partial<CSSStyleDeclaration>) => {
            const element = document.createElement("button");
            element.type = "button";
            element.textContent = label;
            element.setAttribute("aria-label", key);
            Object.assign(element.style, {
                position: "absolute", width: "58px", height: "58px", borderRadius: "18px", border: "1px solid rgba(255,255,255,.25)",
                background: "rgba(24,24,27,.45)", color: "#fff", fontSize: "20px", fontWeight: "800", pointerEvents: "auto",
                touchAction: "none", backdropFilter: "blur(6px)", WebkitTapHighlightColor: "transparent", ...style,
            });
            const press = (down: boolean) => (event: Event) => {
                event.preventDefault();
                element.style.background = down ? "rgba(99,102,241,.7)" : "rgba(24,24,27,.45)";
                this.options.onVirtualKey?.(key, down);
            };
            element.addEventListener("pointerdown", press(true));
            element.addEventListener("pointerup", press(false));
            element.addEventListener("pointercancel", press(false));
            element.addEventListener("pointerleave", press(false));
            element.addEventListener("contextmenu", (event) => event.preventDefault());
            pad.appendChild(element);
        };
        button("◀", "LeftArrow", { left: "16px", bottom: "40px" });
        button("▶", "RightArrow", { left: "136px", bottom: "40px" });
        button("▲", "UpArrow", { left: "76px", bottom: "96px" });
        button("▼", "DownArrow", { left: "76px", bottom: "12px" });
        button("A", "Space", { right: "20px", bottom: "56px", borderRadius: "999px", width: "66px", height: "66px" });
        button("B", "LeftControl", { right: "96px", bottom: "20px", borderRadius: "999px" });
        this.element.appendChild(pad);
        this.touch = pad;
    }

    setFpsVisible(visible: boolean) {
        this.fps.style.display = visible ? "block" : "none";
    }

    setNotice(message: string | null) {
        this.notice.textContent = message ?? "";
        this.notice.style.display = message ? "block" : "none";
    }

    update(entities: Iterable<OverlayEntity>, hud: { text: string; color: string } | null, delta: number, height: number) {
        const scale = Math.max(0.35, height / REFERENCE_HEIGHT);
        const seen = new Set<string>();
        for (const entity of entities) {
            if (!entity.visible) continue;
            for (const component of entity.components) {
                if (component.type !== "uiText" || !component.enabled) continue;
                seen.add(component.id);
                this.renderText(component, scale);
            }
        }
        for (const [id, entry] of this.texts) {
            if (seen.has(id)) continue;
            entry.element.remove();
            this.texts.delete(id);
        }
        const hudKey = hud ? `${hud.text}|${hud.color}` : "";
        if (hudKey !== this.lastHud) {
            this.lastHud = hudKey;
            if (hud) {
                this.hud.textContent = hud.text;
                this.hud.style.color = hud.color;
                this.hud.style.opacity = "1";
                this.hud.style.transform = "translate(-50%, -50%) scale(1)";
            } else {
                this.hud.style.opacity = "0";
                this.hud.style.transform = "translate(-50%, -50%) scale(0.9)";
            }
        }
        if (this.fps.style.display !== "none") {
            this.fpsFrames += 1;
            this.fpsTime += delta;
            if (this.fpsTime >= 0.5) {
                this.fps.textContent = `${Math.round(this.fpsFrames / this.fpsTime)} FPS`;
                this.fpsFrames = 0;
                this.fpsTime = 0;
            }
        }
    }

    private renderText(component: UITextComponent, scale: number) {
        const key = `${component.text}|${component.fontSize}|${component.color}|${component.anchor}|${component.offset.x},${component.offset.y}|${component.bold}|${component.shadow}|${scale.toFixed(3)}`;
        let entry = this.texts.get(component.id);
        if (!entry) {
            const element = document.createElement("div");
            Object.assign(element.style, { position: "absolute", whiteSpace: "pre-line", lineHeight: "1.2", maxWidth: "92%" });
            this.textLayer.appendChild(element);
            entry = { element, key: "" };
            this.texts.set(component.id, entry);
        }
        if (entry.key === key) return;
        entry.key = key;
        const element = entry.element;
        element.textContent = component.text;
        Object.assign(element.style, anchorStyle(component.anchor, component.offset.x * scale, component.offset.y * scale));
        element.style.fontSize = `${Math.max(6, component.fontSize * scale)}px`;
        element.style.color = component.color;
        element.style.fontWeight = component.bold ? "800" : "500";
        element.style.textShadow = component.shadow ? "0 2px 6px rgba(0,0,0,.65)" : "none";
    }

    dispose() {
        this.element.remove();
        this.texts.clear();
        this.touch = null;
    }
}
