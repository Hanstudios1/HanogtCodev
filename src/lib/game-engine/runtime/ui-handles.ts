/** Script-facing handles of the UI components (Button, Image/Panel, Slider/ProgressBar; V4 Slider, Toggle, InputField). */
import { cleanLocalizationKey } from "../localization";
import { progressFraction } from "../ui-layout";
import { VMBoundMethod, VMLambda, VMList, VMNativeFunction, Vec3, type HostObject, type VMRef, type VMValue } from "../script/values";
import type { GameComponent, UIButtonComponent, UIInputFieldComponent, UIPanelComponent, UIProgressBarComponent, UIRectFields, UISliderComponent, UIToggleComponent } from "../types";
import { INPUT_CONTENT_TYPES } from "../types";
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
            case "localizationKey": return c.localizationKey;
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
            case "localizationKey":
                c.localizationKey = cleanLocalizationKey(value === null || value === undefined ? "" : String(value));
                this.world.localizeComponent(c);
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

// ---------------------------------------------------------------------------
// V4: Slider, Toggle and InputField
// ---------------------------------------------------------------------------

/** `slider.onValueChanged`, `toggle.onValueChanged`, `input.onEndEdit`… (UnityEvent<T>). */
export class UIEventHandle implements HostObject {
    readonly hostType = "UnityEvent";
    private readonly world: RuntimeWorld;
    private readonly entity: RuntimeEntity;
    private readonly component: GameComponent;
    private readonly event: string;
    private readonly invoke: (value: VMValue) => void;
    private readonly persistent: number;

    constructor(world: RuntimeWorld, entity: RuntimeEntity, component: GameComponent, event: string, invoke: (value: VMValue) => void, persistent: number) {
        this.world = world;
        this.entity = entity;
        this.component = component;
        this.event = event;
        this.invoke = invoke;
        this.persistent = persistent;
    }

    isType(name: string) {
        return name === "UnityEvent" || name.startsWith("UnityEvent<") || name.endsWith("Event");
    }

    isAlive() {
        return !this.entity.destroyed;
    }

    get(name: string): VMValue {
        return hostError(`${this.event}.${name} yok. AddListener, RemoveListener veya Invoke kullanın.`, "MissingMemberException");
    }

    set(name: string): void {
        hostError(`${this.event}.${name} değiştirilemez.`, "InvalidOperationException");
    }

    call(name: string, args: VMValue[]): VMValue {
        switch (name) {
            case "AddListener":
                if (!isCallable(args[0] ?? null)) hostError(`AddListener bir fonksiyon bekliyor: ${this.event}.AddListener(deger => { ... }).`, "ArgumentException");
                this.world.addUIListener(this.component.id, this.event, args[0] ?? null);
                return undefined;
            case "RemoveListener":
                this.world.removeUIListener(this.component.id, this.event, args[0] ?? null);
                return undefined;
            case "RemoveAllListeners":
                this.world.removeUIListener(this.component.id, this.event, null);
                return undefined;
            case "Invoke":
                this.invoke(args[0] ?? null);
                return undefined;
            case "GetPersistentEventCount":
                return this.persistent;
            case "ToString":
                return this.toString();
            default:
                return hostError(`${this.event}.${name}() yok.`, "MissingMemberException");
        }
    }

    toString() {
        return `${this.entity.name}.${this.event}`;
    }
}

/** Interactive slider (V4). */
export class SliderHandle extends ComponentHandle<UISliderComponent> {
    readonly hostType = "Slider";

    protected typeNames(): string[] {
        return ["Slider", "Selectable", "UIBehaviour", "Graphic", "Component", "Object", "UnityEngine.Object"];
    }

    get(name: string): VMValue {
        const c = this.component;
        switch (name) {
            case "value": return c.value;
            case "minValue": return c.min;
            case "maxValue": return c.max;
            case "normalizedValue": return progressFraction(c);
            case "wholeNumbers": return c.wholeNumbers;
            case "interactable": return c.interactable;
            case "direction": return c.direction;
            case "fillColor":
            case "color":
                return colorToVM(c.fillColor, this.entity.uiAlpha);
            case "backgroundColor": return colorToVM(c.backgroundColor);
            case "handleColor": return colorToVM(c.handleColor);
            case "showValue": return c.showValue;
            case "isDragging": return this.world.uiState().pressed === c.id;
            case "onValueChanged": return new UIEventHandle(this.world, this.entity, c, "onValueChanged", (value) => this.world.fireUIEvent(this.entity, c, "onValueChanged", c.onValueChanged, typeof value === "number" ? value : c.value), c.onValueChanged.method ? 1 : 0);
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
                this.world.setSliderValue(this.entity, c, toNumber(value, "value"), true);
                return;
            case "normalizedValue": {
                const t = Math.max(0, Math.min(1, toNumber(value, name)));
                this.world.setSliderValue(this.entity, c, c.min + (c.max - c.min) * t, true);
                return;
            }
            case "minValue":
                c.min = toNumber(value, "minValue");
                this.world.setSliderValue(this.entity, c, c.value, true);
                break;
            case "maxValue":
                c.max = toNumber(value, "maxValue");
                this.world.setSliderValue(this.entity, c, c.value, true);
                break;
            case "wholeNumbers":
                c.wholeNumbers = toBool(value);
                this.world.setSliderValue(this.entity, c, c.value, true);
                break;
            case "interactable": c.interactable = toBool(value); break;
            case "fillColor":
            case "color":
                c.fillColor = toColor(value).toHex();
                break;
            case "backgroundColor": c.backgroundColor = toColor(value).toHex(); break;
            case "handleColor": c.handleColor = toColor(value).toHex(); break;
            case "showValue": c.showValue = toBool(value); break;
            default:
                if (rectSet(c, name, value)) break;
                if (this.componentSet(name, value)) return;
                this.unknown(name);
        }
        this.changed();
    }

    call(name: string, args: VMValue[], typeArgs: string[], refs?: Array<VMRef | null>): VMValue {
        if (name === "SetValueWithoutNotify") {
            this.world.setSliderValue(this.entity, this.component, toNumber(args[0] ?? 0, "value"), false);
            return undefined;
        }
        return super.call(name, args, typeArgs, refs);
    }
}

/** On/off toggle (V4). */
export class ToggleHandle extends ComponentHandle<UIToggleComponent> {
    readonly hostType = "Toggle";

    protected typeNames(): string[] {
        return ["Toggle", "Selectable", "UIBehaviour", "Graphic", "Component", "Object", "UnityEngine.Object"];
    }

    get(name: string): VMValue {
        const c = this.component;
        switch (name) {
            case "isOn": return c.isOn;
            case "interactable": return c.interactable;
            case "text":
            case "label":
                return c.label;
            case "localizationKey": return c.localizationKey;
            case "fontSize": return c.fontSize;
            case "textColor": return colorToVM(c.textColor);
            case "color": return colorToVM(c.color);
            case "checkColor": return colorToVM(c.checkColor);
            case "onValueChanged": return new UIEventHandle(this.world, this.entity, c, "onValueChanged", (value) => this.world.fireUIEvent(this.entity, c, "onValueChanged", c.onValueChanged, typeof value === "boolean" ? value : c.isOn), c.onValueChanged.method ? 1 : 0);
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
            case "isOn":
                this.world.setToggle(this.entity, c, toBool(value), true);
                return;
            case "interactable": c.interactable = toBool(value); break;
            case "text":
            case "label":
                c.label = textOf(this.world, value);
                break;
            case "localizationKey":
                c.localizationKey = cleanLocalizationKey(value === null || value === undefined ? "" : String(value));
                this.world.localizeComponent(c);
                break;
            case "fontSize": c.fontSize = Math.max(6, Math.min(120, toNumber(value))); break;
            case "textColor": c.textColor = toColor(value).toHex(); break;
            case "color": c.color = toColor(value).toHex(); break;
            case "checkColor": c.checkColor = toColor(value).toHex(); break;
            default:
                if (rectSet(c, name, value)) break;
                if (this.componentSet(name, value)) return;
                this.unknown(name);
        }
        this.changed();
    }

    call(name: string, args: VMValue[], typeArgs: string[], refs?: Array<VMRef | null>): VMValue {
        if (name === "SetIsOnWithoutNotify") {
            this.world.setToggle(this.entity, this.component, toBool(args[0] ?? false), false);
            return undefined;
        }
        return super.call(name, args, typeArgs, refs);
    }
}

const CONTENT_TYPE_NAMES: Record<string, UIInputFieldComponent["contentType"]> = {
    Standard: "standard", IntegerNumber: "integer", DecimalNumber: "decimal", Alphanumeric: "alphanumeric", Name: "name", EmailAddress: "email", Password: "password",
};

/** Text box (V4); the player types into a real text field drawn by the overlay. */
export class InputFieldHandle extends ComponentHandle<UIInputFieldComponent> {
    readonly hostType = "InputField";

    protected typeNames(): string[] {
        return ["InputField", "TMP_InputField", "Selectable", "UIBehaviour", "Component", "Object", "UnityEngine.Object"];
    }

    private event(name: "onValueChanged" | "onEndEdit" | "onSubmit") {
        const c = this.component;
        const target = name === "onValueChanged" ? c.onValueChanged : name === "onEndEdit" ? c.onEndEdit : null;
        return new UIEventHandle(this.world, this.entity, c, name, (value) => this.world.fireUIEvent(this.entity, c, name, target, typeof value === "string" ? value : c.text), target?.method ? 1 : 0);
    }

    get(name: string): VMValue {
        const c = this.component;
        switch (name) {
            case "text": return c.text;
            case "placeholder": return c.placeholder;
            case "localizationKey": return c.localizationKey;
            case "characterLimit": return c.characterLimit;
            case "contentType": return Object.keys(CONTENT_TYPE_NAMES).find((key) => CONTENT_TYPE_NAMES[key] === c.contentType) ?? "Standard";
            case "interactable": return c.interactable;
            case "readOnly": return !c.interactable;
            case "isFocused": return this.world.focusedInput === c.id;
            case "fontSize":
            case "pointSize":
                return c.fontSize;
            case "textColor": return colorToVM(c.textColor);
            case "backgroundColor": return colorToVM(c.backgroundColor);
            case "onValueChanged":
            case "onEndEdit":
            case "onSubmit":
                return this.event(name);
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
            case "text": {
                const next = this.world.filterInputText(c, textOf(this.world, value));
                if (next !== c.text) {
                    c.text = next;
                    this.changed();
                    this.world.fireUIEvent(this.entity, c, "onValueChanged", c.onValueChanged, next);
                }
                return;
            }
            case "placeholder": c.placeholder = textOf(this.world, value); break;
            case "localizationKey":
                c.localizationKey = cleanLocalizationKey(value === null || value === undefined ? "" : String(value));
                this.world.localizeComponent(c);
                break;
            case "characterLimit": {
                c.characterLimit = Math.max(1, Math.min(200, Math.trunc(toNumber(value, name))));
                c.text = this.world.filterInputText(c, c.text);
                break;
            }
            case "contentType": {
                const key = String(value ?? "");
                const type = CONTENT_TYPE_NAMES[key] ?? (INPUT_CONTENT_TYPES as readonly string[]).find((item) => item === key.toLowerCase());
                if (!type) hostError(`contentType '${key}' desteklenmiyor. Seçenekler: ${Object.keys(CONTENT_TYPE_NAMES).join(", ")}.`, "ArgumentException");
                c.contentType = type as UIInputFieldComponent["contentType"];
                c.text = this.world.filterInputText(c, c.text);
                break;
            }
            case "interactable": c.interactable = toBool(value); break;
            case "readOnly": c.interactable = !toBool(value); break;
            case "fontSize":
            case "pointSize":
                c.fontSize = Math.max(6, Math.min(120, toNumber(value)));
                break;
            case "textColor": c.textColor = toColor(value).toHex(); break;
            case "backgroundColor": c.backgroundColor = toColor(value).toHex(); break;
            default:
                if (rectSet(c, name, value)) break;
                if (this.componentSet(name, value)) return;
                this.unknown(name);
        }
        this.changed();
    }

    call(name: string, args: VMValue[], typeArgs: string[], refs?: Array<VMRef | null>): VMValue {
        const c = this.component;
        switch (name) {
            case "SetTextWithoutNotify":
                c.text = this.world.filterInputText(c, textOf(this.world, args[0] ?? ""));
                this.changed();
                return undefined;
            case "ActivateInputField":
            case "Select":
                this.world.requestInputFocus(c.id);
                return undefined;
            case "DeactivateInputField":
                if (this.world.focusedInput === c.id || this.world.inputFocus.id === c.id) this.world.requestInputFocus(null);
                return undefined;
            default:
                return super.call(name, args, typeArgs, refs);
        }
    }
}
