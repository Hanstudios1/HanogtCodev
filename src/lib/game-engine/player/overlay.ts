/**
 * DOM overlay drawn above the game canvas: UI components (text, panels,
 * buttons, progress bars), HUD messages, scene fades, the FPS counter and
 * on-screen touch controls. Plain DOM (no React) so it works in the editor,
 * the Arcade and exported HTML builds alike. Text is always set through
 * textContent, never as HTML.
 *
 * The overlay never receives pointer events: clicks reach the canvas and the
 * runtime hit-tests buttons, sliders and toggles with the same layout math
 * (ui-layout.ts), so what is drawn here is exactly what can be clicked. The
 * one exception is the input field (V4): it is a real text box, so typing,
 * the caret, IME and phone keyboards work; its text goes to the runtime
 * through `onInput`.
 */
import type { TRS } from "../math";
import type {
    GameComponent,
    TextureAsset,
    UIAnchor,
    UIButtonComponent,
    UIInputFieldComponent,
    UIPanelComponent,
    UIProgressBarComponent,
    UISliderComponent,
    UITextComponent,
    UIToggleComponent,
} from "../types";
import { progressFraction, scaleRect, uiRect, uiScale, type ScreenRect } from "../ui-layout";

export interface OverlayEntity {
    readonly id: string;
    readonly visible: boolean;
    readonly components: readonly GameComponent[];
    /** World transform; UI elements scale and rotate with it. */
    readonly world?: TRS;
    /** Runtime opacity of the object's UI (fades and tweens). */
    readonly uiAlpha?: number;
}

export interface OverlayOptions {
    showFps: boolean;
    /** true = always, "auto" = only on touch devices, false = never. */
    touchControls: boolean | "auto";
    onVirtualKey?: (key: string, down: boolean) => void;
    /** Images shown by UI panels. */
    textures?: readonly TextureAsset[];
    /** Text typed into an input field; without it input fields are read-only (editor previews). */
    onInput?: (componentId: string, text: string, phase: "change" | "end" | "submit") => void;
    /** Which input field has the keyboard (null when none). */
    onFocusChange?: (componentId: string | null) => void;
}

/** Runtime state of the UI (hovered/pressed button, scene fade). */
export interface OverlayState {
    hover?: string | null;
    pressed?: string | null;
    fade?: { alpha: number; color: string } | null;
    /** Input field to focus (or null to let go of the keyboard), acted on when `serial` changes. */
    focus?: { id: string | null; serial: number };
}

type UIElementComponent = UITextComponent | UIButtonComponent | UIPanelComponent | UIProgressBarComponent | UISliderComponent | UIToggleComponent | UIInputFieldComponent;

const UI_TYPES = new Set<GameComponent["type"]>(["uiText", "uiButton", "uiPanel", "uiProgressBar", "uiSlider", "uiToggle", "uiInputField"]);

interface UIEntry {
    element: HTMLDivElement;
    key: string;
    type: UIElementComponent["type"];
    fill?: HTMLDivElement;
    label?: HTMLSpanElement;
    /** Slider handle, toggle knob. */
    knob?: HTMLDivElement;
    input?: HTMLInputElement;
}

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

function hexToRgba(hex: string, alpha: number) {
    const clean = /^#?([0-9a-f]{6})$/i.exec(hex)?.[1] ?? "000000";
    return `rgba(${parseInt(clean.slice(0, 2), 16)}, ${parseInt(clean.slice(2, 4), 16)}, ${parseInt(clean.slice(4, 6), 16)}, ${Math.max(0, Math.min(1, alpha))})`;
}

/** Z rotation (degrees, counter-clockwise) of a world transform. */
function rotationZ(world: TRS | undefined) {
    if (!world) return 0;
    const q = world.rotation;
    return (2 * Math.atan2(q.z, q.w) * 180) / Math.PI;
}

export class GameOverlay {
    readonly element: HTMLDivElement;
    private readonly uiLayer: HTMLDivElement;
    private readonly entries = new Map<string, UIEntry>();
    private readonly hud: HTMLDivElement;
    private readonly fade: HTMLDivElement;
    private readonly fps: HTMLDivElement;
    private readonly notice: HTMLDivElement;
    private readonly textures = new Map<string, string>();
    private touch: HTMLDivElement | null = null;
    private fpsFrames = 0;
    private fpsTime = 0;
    private lastHud = "";
    private lastFade = "";
    private focusSerial = 0;
    private readonly options: OverlayOptions;

    constructor(parent: HTMLElement, options: OverlayOptions) {
        this.options = options;
        for (const texture of options.textures ?? []) this.textures.set(texture.id, texture.dataUrl);
        const root = document.createElement("div");
        root.className = "hanogt-overlay";
        Object.assign(root.style, { position: "absolute", inset: "0", pointerEvents: "none", overflow: "hidden", fontFamily: "Inter Variable, Inter, system-ui, sans-serif", userSelect: "none" });
        this.uiLayer = document.createElement("div");
        Object.assign(this.uiLayer.style, { position: "absolute", inset: "0" });
        root.appendChild(this.uiLayer);

        this.fade = document.createElement("div");
        Object.assign(this.fade.style, { position: "absolute", inset: "0", opacity: "0", display: "none" });
        root.appendChild(this.fade);

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

    setTextures(textures: readonly TextureAsset[]) {
        this.textures.clear();
        for (const texture of textures) this.textures.set(texture.id, texture.dataUrl);
        for (const entry of this.entries.values()) entry.key = "";
    }

    update(entities: Iterable<OverlayEntity>, hud: { text: string; color: string } | null, delta: number, size: { width: number; height: number }, state: OverlayState = {}) {
        const scale = uiScale(size.height);
        const items: Array<{ component: UIElementComponent; entity: OverlayEntity; order: number; index: number }> = [];
        let index = 0;
        for (const entity of entities) {
            index += 1;
            if (!entity.visible) continue;
            for (const component of entity.components) {
                if (!component.enabled) continue;
                if (UI_TYPES.has(component.type)) items.push({ component: component as UIElementComponent, entity, order: (component as UIElementComponent).order ?? 0, index });
            }
        }
        // Higher order on top; later objects in the hierarchy win ties (like Unity's sibling order).
        items.sort((a, b) => a.order - b.order || a.index - b.index);
        const seen = new Set<string>();
        items.forEach((item, position) => {
            seen.add(item.component.id);
            this.renderItem(item.component, item.entity, scale, size, position + 1, state);
        });
        for (const [id, entry] of this.entries) {
            if (seen.has(id)) continue;
            if (entry.input && document.activeElement === entry.input) entry.input.blur();
            entry.element.remove();
            this.entries.delete(id);
        }
        if (state.focus && state.focus.serial !== this.focusSerial) {
            this.focusSerial = state.focus.serial;
            const target = state.focus.id ? this.entries.get(state.focus.id)?.input : null;
            if (target && !target.disabled) target.focus({ preventScroll: true });
            else if (!state.focus.id) for (const entry of this.entries.values()) if (entry.input && document.activeElement === entry.input) entry.input.blur();
        }
        this.renderFade(state.fade ?? null);
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

    private renderFade(fade: { alpha: number; color: string } | null) {
        const key = fade ? `${fade.color}|${fade.alpha.toFixed(3)}` : "";
        if (key === this.lastFade) return;
        this.lastFade = key;
        this.fade.style.display = fade ? "block" : "none";
        if (!fade) return;
        this.fade.style.background = fade.color;
        this.fade.style.opacity = String(fade.alpha);
    }

    private entry(component: UIElementComponent): UIEntry {
        let entry = this.entries.get(component.id);
        if (entry && entry.type === component.type) return entry;
        entry?.element.remove();
        const element = document.createElement("div");
        element.style.position = "absolute";
        entry = { element, key: "", type: component.type };
        if (component.type === "uiText") {
            Object.assign(element.style, { whiteSpace: "pre-line", lineHeight: "1.2", maxWidth: "92%" });
        } else if (component.type === "uiButton") {
            Object.assign(element.style, { display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontWeight: "700", lineHeight: "1.1", overflow: "hidden", boxSizing: "border-box", padding: "0 8px", transition: "filter .08s ease, transform .08s ease" });
            element.setAttribute("role", "button");
            const label = document.createElement("span");
            label.style.whiteSpace = "pre-line";
            element.appendChild(label);
            entry.label = label;
        } else if (component.type === "uiPanel") {
            Object.assign(element.style, { backgroundSize: "100% 100%", backgroundRepeat: "no-repeat" });
        } else if (component.type === "uiSlider") {
            element.setAttribute("role", "slider");
            const fill = document.createElement("div");
            fill.style.position = "absolute";
            const knob = document.createElement("div");
            Object.assign(knob.style, { position: "absolute", borderRadius: "999px", boxShadow: "0 2px 8px rgba(0,0,0,.4)", transition: "transform .08s ease" });
            const label = document.createElement("span");
            Object.assign(label.style, { position: "absolute", fontWeight: "700", color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,.6)", whiteSpace: "nowrap" });
            element.append(fill, knob, label);
            entry.fill = fill;
            entry.knob = knob;
            entry.label = label;
        } else if (component.type === "uiToggle") {
            element.setAttribute("role", "switch");
            Object.assign(element.style, { display: "flex", alignItems: "center", gap: "0.5em", boxSizing: "border-box" });
            const box = document.createElement("div");
            Object.assign(box.style, { position: "relative", flex: "none", transition: "background .15s ease" });
            const knob = document.createElement("div");
            Object.assign(knob.style, { position: "absolute", transition: "transform .15s ease, opacity .15s ease" });
            box.appendChild(knob);
            const label = document.createElement("span");
            Object.assign(label.style, { fontWeight: "700", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" });
            element.append(box, label);
            entry.fill = box;
            entry.knob = knob;
            entry.label = label;
        } else if (component.type === "uiInputField") {
            Object.assign(element.style, { boxSizing: "border-box", display: "flex" });
            const input = document.createElement("input");
            input.autocomplete = "off";
            input.spellcheck = false;
            Object.assign(input.style, { flex: "1", minWidth: "0", width: "100%", border: "0", outline: "none", background: "transparent", padding: "0 0.6em", font: "inherit", fontWeight: "600", color: "inherit" });
            const id = component.id;
            let submitted = false;
            input.addEventListener("input", () => this.options.onInput?.(id, input.value, "change"));
            input.addEventListener("keydown", (event) => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    submitted = true;
                    this.options.onInput?.(id, input.value, "submit");
                    input.blur();
                } else if (event.key === "Escape") {
                    input.blur();
                }
            });
            input.addEventListener("focus", () => {
                submitted = false;
                this.options.onFocusChange?.(id);
            });
            input.addEventListener("blur", () => {
                if (!submitted) this.options.onInput?.(id, input.value, "end");
                submitted = false;
                this.options.onFocusChange?.(null);
            });
            element.appendChild(input);
            entry.input = input;
        } else {
            Object.assign(element.style, { overflow: "hidden", boxSizing: "border-box" });
            const fill = document.createElement("div");
            fill.style.position = "absolute";
            element.appendChild(fill);
            const label = document.createElement("span");
            Object.assign(label.style, { position: "absolute", inset: "0", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700", color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,.6)" });
            element.appendChild(label);
            entry.fill = fill;
            entry.label = label;
        }
        this.uiLayer.appendChild(element);
        this.entries.set(component.id, entry);
        return entry;
    }

    private renderItem(component: UIElementComponent, entity: OverlayEntity, scale: number, size: { width: number; height: number }, zIndex: number, state: OverlayState) {
        const entry = this.entry(component);
        const world = entity.world;
        const sx = world ? Math.abs(world.scale.x) : 1;
        const sy = world ? Math.abs(world.scale.y) : 1;
        const angle = rotationZ(world);
        const alpha = entity.uiAlpha ?? 1;
        if (component.type === "uiText") {
            const key = `${component.text}|${component.fontSize}|${component.color}|${component.anchor}|${component.offset.x},${component.offset.y}|${component.bold}|${component.shadow}|${scale.toFixed(3)}|${zIndex}|${alpha}|${sx},${sy},${angle.toFixed(2)}`;
            if (entry.key === key) return;
            entry.key = key;
            const element = entry.element;
            element.textContent = component.text;
            const style = anchorStyle(component.anchor, component.offset.x * scale, component.offset.y * scale);
            const extra = `${sx !== 1 || sy !== 1 ? ` scale(${sx}, ${sy})` : ""}${Math.abs(angle) > 0.01 ? ` rotate(${-angle}deg)` : ""}`;
            Object.assign(element.style, style, { transform: `${style.transform ?? ""}${extra}`.trim() });
            element.style.fontSize = `${Math.max(6, component.fontSize * scale)}px`;
            element.style.color = component.color;
            element.style.fontWeight = component.bold ? "800" : "500";
            element.style.textShadow = component.shadow ? "0 2px 6px rgba(0,0,0,.65)" : "none";
            element.style.opacity = String(alpha);
            element.style.zIndex = String(zIndex);
            return;
        }
        const rect: ScreenRect = component.type === "uiPanel" && component.fullScreen
            ? { left: 0, top: 0, width: size.width, height: size.height }
            : scaleRect(uiRect(component, size, scale), sx, sy);
        const hovered = state.hover === component.id;
        const pressed = state.pressed === component.id;
        const radius = component.type === "uiPanel" && component.fullScreen ? 0
            : "cornerRadius" in component ? component.cornerRadius * scale * Math.min(sx, sy)
                : component.type === "uiInputField" ? 10 * scale * Math.min(sx, sy) : 0;
        const base = `${rect.left.toFixed(1)},${rect.top.toFixed(1)},${rect.width.toFixed(1)},${rect.height.toFixed(1)}|${radius.toFixed(1)}|${zIndex}|${alpha}|${angle.toFixed(2)}`;
        const element = entry.element;
        if (component.type === "uiButton") {
            const key = `${base}|${component.text}|${component.fontSize}|${component.textColor}|${component.color}|${component.interactable}|${hovered}|${pressed}|${scale.toFixed(3)}`;
            if (entry.key === key) return;
            entry.key = key;
            this.place(element, rect, radius, zIndex, angle);
            element.style.background = component.color;
            element.style.color = component.textColor;
            element.style.fontSize = `${Math.max(6, component.fontSize * scale * Math.min(sx, sy))}px`;
            element.style.boxShadow = pressed ? "inset 0 2px 6px rgba(0,0,0,.35)" : "0 6px 18px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.18)";
            element.style.filter = !component.interactable ? "grayscale(.7) brightness(.8)" : pressed ? "brightness(.88)" : hovered ? "brightness(1.12)" : "none";
            element.style.opacity = String(alpha * (component.interactable ? 1 : 0.6));
            if (pressed) element.style.transform = `${element.style.transform} translateY(1px)`.trim();
            element.setAttribute("aria-label", component.text);
            element.setAttribute("aria-disabled", String(!component.interactable));
            if (entry.label) entry.label.textContent = component.text;
            return;
        }
        if (component.type === "uiPanel") {
            const image = component.textureId ? this.textures.get(component.textureId) ?? null : null;
            const key = `${base}|${component.color}|${component.opacity}|${image ? component.textureId : ""}`;
            if (entry.key === key) return;
            entry.key = key;
            this.place(element, rect, radius, zIndex, angle);
            element.style.backgroundColor = image ? "transparent" : hexToRgba(component.color, component.opacity);
            element.style.backgroundImage = image ? `url("${image}")` : "none";
            element.style.opacity = String(image ? alpha * component.opacity : alpha);
            return;
        }
        if (component.type === "uiSlider") {
            this.renderSlider(entry, component, rect, radius, zIndex, angle, alpha, base, scale, hovered, pressed);
            return;
        }
        if (component.type === "uiToggle") {
            this.renderToggle(entry, component, rect, zIndex, angle, alpha, base, scale, Math.min(sx, sy), hovered, pressed);
            return;
        }
        if (component.type === "uiInputField") {
            this.renderInput(entry, component, rect, radius, zIndex, angle, alpha, base, scale, Math.min(sx, sy));
            return;
        }
        const fraction = progressFraction(component);
        const key = `${base}|${fraction.toFixed(4)}|${component.fillColor}|${component.backgroundColor}|${component.direction}|${component.showLabel}|${scale.toFixed(3)}`;
        if (entry.key === key) return;
        entry.key = key;
        this.place(element, rect, radius, zIndex, angle);
        element.style.background = component.backgroundColor;
        element.style.opacity = String(alpha);
        element.setAttribute("role", "progressbar");
        element.setAttribute("aria-valuenow", String(Math.round(fraction * 100)));
        element.setAttribute("aria-valuemin", "0");
        element.setAttribute("aria-valuemax", "100");
        const fill = entry.fill as HTMLDivElement;
        const percent = `${(fraction * 100).toFixed(2)}%`;
        const horizontal = component.direction === "leftToRight" || component.direction === "rightToLeft";
        Object.assign(fill.style, {
            background: component.fillColor,
            borderRadius: `${radius}px`,
            left: component.direction === "rightToLeft" ? "auto" : "0",
            right: component.direction === "rightToLeft" ? "0" : "auto",
            top: component.direction === "topToBottom" ? "0" : "auto",
            bottom: component.direction === "topToBottom" ? "auto" : "0",
            width: horizontal ? percent : "100%",
            height: horizontal ? "100%" : percent,
            transition: "width .12s ease, height .12s ease",
        });
        if (entry.label) {
            entry.label.textContent = component.showLabel ? `${Math.round(fraction * 100)}%` : "";
            entry.label.style.fontSize = `${Math.max(8, rect.height * 0.62)}px`;
        }
    }

    private renderSlider(entry: UIEntry, component: UISliderComponent, rect: ScreenRect, radius: number, zIndex: number, angle: number, alpha: number, base: string, scale: number, hovered: boolean, pressed: boolean) {
        const fraction = progressFraction(component);
        const key = `${base}|${fraction.toFixed(4)}|${component.fillColor}|${component.backgroundColor}|${component.handleColor}|${component.direction}|${component.showValue}|${component.wholeNumbers}|${component.interactable}|${hovered}|${pressed}|${scale.toFixed(3)}`;
        if (entry.key === key) return;
        entry.key = key;
        const element = entry.element;
        const horizontal = component.direction === "leftToRight" || component.direction === "rightToLeft";
        // The track is a thin bar centered in the rectangle; the handle spans the rectangle's short side.
        const thickness = Math.max(4, (horizontal ? rect.height : rect.width) * 0.36);
        this.place(element, rect, radius, zIndex, angle);
        element.style.opacity = String(alpha * (component.interactable ? 1 : 0.55));
        element.style.background = "transparent";
        element.setAttribute("aria-valuenow", String(component.value));
        element.setAttribute("aria-valuemin", String(Math.min(component.min, component.max)));
        element.setAttribute("aria-valuemax", String(Math.max(component.min, component.max)));
        const fill = entry.fill as HTMLDivElement;
        const knob = entry.knob as HTMLDivElement;
        const percent = fraction * 100;
        const track = horizontal
            ? { left: "0", right: "0", top: `calc(50% - ${thickness / 2}px)`, height: `${thickness}px`, width: "auto", bottom: "auto" }
            : { top: "0", bottom: "0", left: `calc(50% - ${thickness / 2}px)`, width: `${thickness}px`, height: "auto", right: "auto" };
        element.style.setProperty("--track", component.backgroundColor);
        const startSide = component.direction === "leftToRight" ? "left" : component.direction === "rightToLeft" ? "right" : component.direction === "bottomToTop" ? "bottom" : "top";
        Object.assign(fill.style, {
            ...track,
            borderRadius: `${thickness}px`,
            background: `linear-gradient(${horizontal ? (startSide === "left" ? "90deg" : "270deg") : (startSide === "bottom" ? "0deg" : "180deg")}, ${component.fillColor} ${percent}%, ${component.backgroundColor} ${percent}%)`,
        });
        const size = Math.max(10, (horizontal ? rect.height : rect.width) * 0.9);
        const travel = (horizontal ? rect.width : rect.height) - size;
        const along = travel * fraction;
        Object.assign(knob.style, {
            width: `${size}px`,
            height: `${size}px`,
            background: component.handleColor,
            left: horizontal ? (startSide === "left" ? `${along}px` : `${travel - along}px`) : `calc(50% - ${size / 2}px)`,
            top: horizontal ? `calc(50% - ${size / 2}px)` : (startSide === "top" ? `${along}px` : `${travel - along}px`),
            transform: pressed ? "scale(1.12)" : hovered ? "scale(1.06)" : "scale(1)",
            border: `2px solid ${component.fillColor}`,
            boxSizing: "border-box",
        });
        const label = entry.label as HTMLSpanElement;
        const shown = component.wholeNumbers ? String(Math.round(component.value)) : (Math.round(component.value * 100) / 100).toString();
        label.textContent = component.showValue ? shown : "";
        Object.assign(label.style, {
            fontSize: `${Math.max(9, 14 * scale)}px`,
            left: horizontal ? `calc(100% + ${8 * scale}px)` : "50%",
            top: horizontal ? "50%" : `calc(100% + ${6 * scale}px)`,
            transform: horizontal ? "translateY(-50%)" : "translateX(-50%)",
        });
    }

    private renderToggle(entry: UIEntry, component: UIToggleComponent, rect: ScreenRect, zIndex: number, angle: number, alpha: number, base: string, scale: number, objectScale: number, hovered: boolean, pressed: boolean) {
        const key = `${base}|${component.isOn}|${component.label}|${component.fontSize}|${component.textColor}|${component.color}|${component.checkColor}|${component.style}|${component.interactable}|${hovered}|${pressed}|${scale.toFixed(3)}`;
        if (entry.key === key) return;
        entry.key = key;
        const element = entry.element;
        this.place(element, rect, 0, zIndex, angle);
        element.style.opacity = String(alpha * (component.interactable ? 1 : 0.55));
        element.style.color = component.textColor;
        element.style.fontSize = `${Math.max(6, component.fontSize * scale * objectScale)}px`;
        element.style.filter = pressed ? "brightness(.9)" : hovered ? "brightness(1.1)" : "none";
        element.setAttribute("aria-checked", String(component.isOn));
        element.setAttribute("aria-label", component.label || "Toggle");
        const box = entry.fill as HTMLDivElement;
        const knob = entry.knob as HTMLDivElement;
        const height = Math.max(10, rect.height * 0.72);
        if (component.style === "switch") {
            const width = height * 1.8;
            const inset = height * 0.14;
            const knobSize = height - inset * 2;
            Object.assign(box.style, { width: `${width}px`, height: `${height}px`, borderRadius: `${height}px`, background: component.isOn ? component.checkColor : component.color });
            Object.assign(knob.style, {
                width: `${knobSize}px`, height: `${knobSize}px`, borderRadius: "999px", background: "#fff", top: `${inset}px`, left: `${inset}px`,
                transform: component.isOn ? `translateX(${width - knobSize - inset * 2}px)` : "translateX(0)", opacity: "1", boxShadow: "0 1px 4px rgba(0,0,0,.35)",
            });
        } else {
            Object.assign(box.style, { width: `${height}px`, height: `${height}px`, borderRadius: `${height * 0.24}px`, background: component.isOn ? component.checkColor : component.color });
            // A check mark drawn with two borders.
            Object.assign(knob.style, {
                width: `${height * 0.28}px`, height: `${height * 0.52}px`, left: `${height * 0.36}px`, top: `${height * 0.14}px`, background: "transparent",
                borderRight: `${Math.max(2, height * 0.12)}px solid #fff`, borderBottom: `${Math.max(2, height * 0.12)}px solid #fff`, borderRadius: "1px",
                transform: "rotate(45deg)", opacity: component.isOn ? "1" : "0", boxShadow: "none",
            });
        }
        if (entry.label) entry.label.textContent = component.label;
    }

    private renderInput(entry: UIEntry, component: UIInputFieldComponent, rect: ScreenRect, radius: number, zIndex: number, angle: number, alpha: number, base: string, scale: number, objectScale: number) {
        const input = entry.input as HTMLInputElement;
        const editable = Boolean(this.options.onInput) && component.interactable;
        const focused = document.activeElement === input;
        // Never overwrite what the player is typing unless the runtime filtered it.
        if (input.value !== component.text) input.value = component.text;
        const key = `${base}|${component.placeholder}|${component.fontSize}|${component.textColor}|${component.backgroundColor}|${component.borderColor}|${component.characterLimit}|${component.contentType}|${editable}|${focused}|${scale.toFixed(3)}`;
        if (entry.key === key) return;
        entry.key = key;
        const element = entry.element;
        this.place(element, rect, radius, zIndex, angle);
        element.style.opacity = String(alpha * (component.interactable ? 1 : 0.6));
        element.style.background = component.backgroundColor;
        element.style.color = component.textColor;
        element.style.border = `${Math.max(1, 2 * scale)}px solid ${focused ? component.textColor : component.borderColor}`;
        element.style.fontSize = `${Math.max(6, component.fontSize * scale * objectScale)}px`;
        input.placeholder = component.placeholder;
        input.maxLength = component.characterLimit;
        input.type = component.contentType === "password" ? "password" : component.contentType === "email" ? "email" : "text";
        input.inputMode = component.contentType === "integer" ? "numeric" : component.contentType === "decimal" ? "decimal" : component.contentType === "email" ? "email" : "text";
        input.disabled = !editable;
        input.style.pointerEvents = editable ? "auto" : "none";
        input.setAttribute("aria-label", component.placeholder || "Input");
    }

    private place(element: HTMLDivElement, rect: ScreenRect, radius: number, zIndex: number, angle: number) {
        element.style.left = `${rect.left}px`;
        element.style.top = `${rect.top}px`;
        element.style.width = `${rect.width}px`;
        element.style.height = `${rect.height}px`;
        element.style.borderRadius = `${radius}px`;
        element.style.zIndex = String(zIndex);
        element.style.transform = Math.abs(angle) > 0.01 ? `rotate(${-angle}deg)` : "";
    }

    dispose() {
        this.element.remove();
        this.entries.clear();
        this.touch = null;
    }
}
