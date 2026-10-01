/** Script-facing handles of the V3 UI components (Button, Image/Panel, Slider/ProgressBar). */
import { progressFraction } from "../ui-layout";
import { VMBoundMethod, VMLambda, VMList, VMNativeFunction, Vec3, type HostObject, type VMRef, type VMValue } from "../script/values";
import type { UIButtonComponent, UIPanelComponent, UIProgressBarComponent, UIRectFields } from "../types";
import { ComponentHandle, colorToVM, hostError, toBool, toColor, toNumber, toVector } from "./handles";
import type { RuntimeEntity } from "./entity";
import type { RuntimeWorld } from "./world";

function vec2(x: number, y: number) {
    return new Vec3(x, y, 0, true);
}

/** RectTransform-like members shared by every UI component. */
function rectGet(component: UIRectFields, name: string): VMValue | undefined {
    switch (name) {
        case "anchoredPosition": return vec2(component.offset.x, component.offset.y);
        case "sizeDelta": return vec2(component.width, component.height);
        case "sortingOrder":
        case "order":
            return component.order;
        case "anchor": return component.anchor;
        default: return undefined;
    }
}

function rectSet(component: UIRectFields, name: string, value: VMValue): boolean {
    switch (name) {
        case "anchoredPosition": {
            const v = toVector(value, "anchoredPosition");
            component.offset = { x: v.x, y: v.y };
            return true;
        }
        case "sizeDelta": {
            const v = toVector(value, "sizeDelta");
            component.width = Math.max(0, Math.min(4000, v.x));
            component.height = Math.max(0, Math.min(4000, v.y));
            return true;
        }
        case "sortingOrder":
        case "order":
            component.order = Math.max(-1000, Math.min(1000, Math.trunc(toNumber(value, "order"))));
            return true;
        default:
            return false;
    }
}

function textOf(world: RuntimeWorld, value: VMValue) {
    return (value === null || value === undefined ? "" : typeof value === "string" ? value : world.display(value)).slice(0, 200);
}

export function sameCallable(a: VMValue, b: VMValue) {
    if (a === b) return true;
    if (a instanceof VMBoundMethod && b instanceof VMBoundMethod) return a.self === b.self && a.name === b.name && a.cls === b.cls;
    return false;
}

function isCallable(value: VMValue) {
    return value instanceof VMLambda || value instanceof VMBoundMethod || value instanceof VMNativeFunction || value instanceof VMList;
}

/** `button.onClick` (UnityEvent): AddListener / RemoveListener / Invoke. */
export class ButtonEventHandle implements HostObject {
    readonly hostType = "Button.ButtonClickedEvent";
    readonly world: RuntimeWorld;
    readonly entity: RuntimeEntity;
    readonly component: UIButtonComponent;

    constructor(world: RuntimeWorld, entity: RuntimeEntity, component: UIButtonComponent) {
        this.world = world;
        this.entity = entity;
        this.component = component;
    }

    isType(name: string) {
        return name === "UnityEvent" || name === "ButtonClickedEvent" || name === "Button.ButtonClickedEvent";
    }

    isAlive() {
        return !this.entity.destroyed;
    }

    get(name: string): VMValue {
        return hostError(`onClick.${name} yok. AddListener, RemoveListener veya Invoke kullanın.`, "MissingMemberException");
    }

    set(name: string): void {
        hostError(`onClick.${name} değiştirilemez.`, "InvalidOperationException");
    }

    call(name: string, args: VMValue[]): VMValue {
        switch (name) {
            case "AddListener":
                if (!isCallable(args[0] ?? null)) hostError("AddListener bir fonksiyon bekliyor: onClick.AddListener(() => { ... }) veya onClick.AddListener(MetotAdi).", "ArgumentException");
                this.world.addButtonListener(this.component, args[0] ?? null);
                return undefined;
            case "RemoveListener":
                this.world.removeButtonListener(this.component, args[0] ?? null);
                return undefined;
            case "RemoveAllListeners":
                this.world.removeButtonListener(this.component, null);
                return undefined;
            case "Invoke":
                this.world.clickButton(this.entity, this.component);
                return undefined;
            case "GetPersistentEventCount":
                return this.component.onClick.method ? 1 : 0;
            case "ToString":
                return this.toString();
            default:
                return hostError(`onClick.${name}() yok.`, "MissingMemberException");
        }
    }

    toString() {
        return `${this.entity.name}.onClick`;
    }
}

export class ButtonHandle extends ComponentHandle<UIButtonComponent> {
    readonly hostType = "Button";

    protected typeNames(): string[] {
        return ["Button", "Selectable", "UIBehaviour", "Component", "Object", "UnityEngine.Object"];
    }

    get(name: string): VMValue {
        const c = this.component;
        switch (name) {
            case "text": return c.text;
            case "fontSize": return c.fontSize;
            case "textColor": return colorToVM(c.textColor);
            case "color": return colorToVM(c.color, this.entity.uiAlpha);
            case "interactable": return c.interactable;
            case "hotkey": return c.hotkey;
            case "onClick": return new ButtonEventHandle(this.world, this.entity, c);
            case "isPressed": return this.world.uiState().pressed === c.id;
            case "isHovered": return this.world.uiState().hover === c.id;
            default: {
                const rect = rectGet(c, name);
                if (rect !== undefined) return rect;
                const common = this.componentGet(name);
                if (common !== undefined) return common;
                return this.unknown(name);
            }
        }
    }

    set(name: string, value: VMValue): void {
        const c = this.component;
        switch (name) {
            case "text":
                c.text = textOf(this.world, value);
                break;
            case "fontSize":
                c.fontSize = Math.max(6, Math.min(120, toNumber(value)));
                break;
            case "textColor":
                c.textColor = toColor(value).toHex();
                break;
            case "color": {
                const color = toColor(value);
                c.color = color.toHex();
                this.entity.uiAlpha = Math.max(0, Math.min(1, color.a));
                break;
            }
            case "interactable":
                c.interactable = toBool(value);
                break;
            case "hotkey":
                c.hotkey = String(value ?? "None") || "None";
                break;
            default:
                if (rectSet(c, name, value)) break;
                if (this.componentSet(name, value)) return;
                this.unknown(name);
        }
        this.changed();
    }

    call(name: string, args: VMValue[], typeArgs: string[], refs?: Array<VMRef | null>): VMValue {
        switch (name) {
            case "Click":
            case "Press":
            case "OnSubmit":
                this.world.clickButton(this.entity, this.component);
                return undefined;
            case "Select":
                return undefined;
            case "SetText":
                this.set("text", args[0] ?? "");
                return undefined;
            default:
                return super.call(name, args, typeArgs, refs);
        }
    }
}

/** `GetComponentInChildren<Text>()` on a button returns its built-in label. */
export class ButtonLabelHandle extends ComponentHandle<UIButtonComponent> {
    readonly hostType = "Text";

    protected typeNames(): string[] {
        return ["Text", "TMP_Text", "TextMeshProUGUI", "TextMeshPro", "Graphic", "Component", "Object", "UnityEngine.Object"];
    }

    get(name: string): VMValue {
        switch (name) {
            case "text": return this.component.text;
            case "color": return colorToVM(this.component.textColor);
            case "fontSize": return this.component.fontSize;
            default: {
                const common = this.componentGet(name);
                if (common !== undefined) return common;
                return this.unknown(name);
            }
        }
    }

    set(name: string, value: VMValue): void {
        switch (name) {
            case "text":
                this.component.text = textOf(this.world, value);
                break;
            case "color":
                this.component.textColor = toColor(value).toHex();
                break;
            case "fontSize":
                this.component.fontSize = Math.max(6, Math.min(120, toNumber(value)));
                break;
            default:
                if (this.componentSet(name, value)) return;
                this.unknown(name);
        }
        this.changed();
    }

    call(name: string, args: VMValue[], typeArgs: string[], refs?: Array<VMRef | null>): VMValue {
        if (name === "SetText") {
            this.set("text", args[0] ?? "");
            return undefined;
        }
        return super.call(name, args, typeArgs, refs);
    }
}

/** UI Panel, exposed to scripts as Unity's `Image`. */
export class PanelHandle extends ComponentHandle<UIPanelComponent> {
    readonly hostType = "Image";

    protected typeNames(): string[] {
        return ["Image", "Panel", "RawImage", "Graphic", "MaskableGraphic", "Component", "Object", "UnityEngine.Object"];
    }

    get(name: string): VMValue {
        const c = this.component;
        switch (name) {
            case "color": return colorToVM(c.color, c.opacity * this.entity.uiAlpha);
            case "opacity":
            case "alpha":
                return c.opacity;
            case "sprite":
            case "texture": {
                const texture = this.world.project.textures.find((item) => item.id === c.textureId);
                return texture ? texture.name : null;
            }
            case "raycastTarget": return c.blocksClicks;
            case "fullScreen": return c.fullScreen;
            case "fillAmount": return 1;
            default: {
                const rect = rectGet(c, name);
                if (rect !== undefined) return rect;
                const common = this.componentGet(name);
                if (common !== undefined) return common;
                return this.unknown(name);
            }
        }
    }

    set(name: string, value: VMValue): void {
        const c = this.component;
        switch (name) {
            case "color": {
                const color = toColor(value);
                c.color = color.toHex();
                c.opacity = Math.max(0, Math.min(1, color.a));
                break;
            }
            case "opacity":
            case "alpha":
                c.opacity = Math.max(0, Math.min(1, toNumber(value)));
                break;
            case "sprite":
            case "texture": {
                if (value === null || value === undefined) {
                    c.textureId = null;
                    break;
                }
                const key = String(value);
                const texture = this.world.project.textures.find((item) => item.name === key || item.id === key);
                if (!texture) hostError(`'${key}' adında bir doku yok. Proje panelinden görsel yükleyin.`, "ArgumentException");
                c.textureId = texture.id;
                break;
            }
            case "raycastTarget":
                c.blocksClicks = toBool(value);
                break;
            case "fullScreen":
                c.fullScreen = toBool(value);
                break;
            case "fillAmount":
                this.world.warnOnce("panel-fill", "Image.fillAmount yalnızca UI Progress Bar bileşeninde çalışır; doluluk çubuğu için Progress Bar kullanın.");
                return;
            default:
                if (rectSet(c, name, value)) break;
                if (this.componentSet(name, value)) return;
                this.unknown(name);
        }
        this.changed();
    }
}

/** UI Progress Bar, exposed to scripts as `Slider` (and `Image.fillAmount`). */
export class ProgressBarHandle extends ComponentHandle<UIProgressBarComponent> {
    readonly hostType = "Slider";

    protected typeNames(): string[] {
        return ["Slider", "ProgressBar", "Image", "Scrollbar", "Graphic", "Selectable", "Component", "Object", "UnityEngine.Object"];
    }

    private setValue(value: number) {
        const c = this.component;
        const low = Math.min(c.min, c.max);
        const high = Math.max(c.min, c.max);
        c.value = Math.max(low, Math.min(high, value));
    }

    get(name: string): VMValue {
        const c = this.component;
        switch (name) {
            case "value": return c.value;
            case "minValue": return c.min;
            case "maxValue": return c.max;
            case "normalizedValue":
            case "fillAmount":
                return progressFraction(c);
            case "color":
            case "fillColor":
                return colorToVM(c.fillColor, this.entity.uiAlpha);
            case "backgroundColor": return colorToVM(c.backgroundColor);
            case "showLabel": return c.showLabel;
            case "interactable": return false;
            case "wholeNumbers": return false;
            default: {
                const rect = rectGet(c, name);
                if (rect !== undefined) return rect;
                const common = this.componentGet(name);
                if (common !== undefined) return common;
                return this.unknown(name);
            }
        }
    }

    set(name: string, value: VMValue): void {
        const c = this.component;
        switch (name) {
            case "value":
                this.setValue(toNumber(value, "value"));
                break;
            case "minValue":
                c.min = toNumber(value, "minValue");
                this.setValue(c.value);
                break;
            case "maxValue":
                c.max = toNumber(value, "maxValue");
                this.setValue(c.value);
                break;
            case "normalizedValue":
            case "fillAmount": {
                const t = Math.max(0, Math.min(1, toNumber(value, name)));
                c.value = c.min + (c.max - c.min) * t;
                break;
            }
            case "color":
            case "fillColor":
                c.fillColor = toColor(value).toHex();
                break;
            case "backgroundColor":
                c.backgroundColor = toColor(value).toHex();
                break;
            case "showLabel":
                c.showLabel = toBool(value);
                break;
            case "interactable":
            case "wholeNumbers":
                return;
            default:
                if (rectSet(c, name, value)) break;
                if (this.componentSet(name, value)) return;
                this.unknown(name);
        }
        this.changed();
    }

    call(name: string, args: VMValue[], typeArgs: string[], refs?: Array<VMRef | null>): VMValue {
        if (name === "SetValueWithoutNotify") {
            this.setValue(toNumber(args[0] ?? 0, "value"));
            this.changed();
            return undefined;
        }
        return super.call(name, args, typeArgs, refs);
    }
}
