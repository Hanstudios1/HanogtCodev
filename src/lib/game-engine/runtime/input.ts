/**
 * Input state for play mode (keyboard, mouse, touch, on-screen buttons and
 * gamepads). Key names follow Unity's KeyCode names ("Space", "A",
 * "LeftArrow"…); buttons and axes come from the project's input actions.
 */
import { defaultInputSettings, GAMEPAD_AXES, GAMEPAD_BUTTONS, keyboardHalfOf, playerKeys, type GamepadButtonName, type InputAction, type InputSettings, type InputSourceSpec } from "../input-actions";
import { vibrate, type VibrationHost } from "../touch-controls";

export type { InputSourceSpec } from "../input-actions";

const CODE_TO_KEY: Record<string, string> = {
    Space: "Space", Enter: "Return", NumpadEnter: "KeypadEnter", Escape: "Escape", Backspace: "Backspace", Tab: "Tab", Delete: "Delete",
    ArrowUp: "UpArrow", ArrowDown: "DownArrow", ArrowLeft: "LeftArrow", ArrowRight: "RightArrow",
    ShiftLeft: "LeftShift", ShiftRight: "RightShift", ControlLeft: "LeftControl", ControlRight: "RightControl", AltLeft: "LeftAlt", AltRight: "RightAlt",
    CapsLock: "CapsLock", Insert: "Insert", Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown",
    Minus: "Minus", Equal: "Equals", Comma: "Comma", Period: "Period", Slash: "Slash", Semicolon: "Semicolon", Quote: "Quote",
    BracketLeft: "LeftBracket", BracketRight: "RightBracket", Backslash: "Backslash", Backquote: "BackQuote",
    NumpadAdd: "KeypadPlus", NumpadSubtract: "KeypadMinus", NumpadMultiply: "KeypadMultiply", NumpadDivide: "KeypadDivide", NumpadDecimal: "KeypadPeriod",
};

const NAME_ALIASES: Record<string, string> = {
    space: "Space", enter: "Return", return: "Return", escape: "Escape", esc: "Escape", tab: "Tab", backspace: "Backspace",
    up: "UpArrow", down: "DownArrow", left: "LeftArrow", right: "RightArrow",
    "left shift": "LeftShift", "right shift": "RightShift", shift: "LeftShift", "left ctrl": "LeftControl", "right ctrl": "RightControl", ctrl: "LeftControl",
    "left alt": "LeftAlt", "right alt": "RightAlt", alt: "LeftAlt",
};

export function keyFromEvent(event: KeyboardEvent): string | null {
    const code = event.code;
    if (CODE_TO_KEY[code]) return CODE_TO_KEY[code];
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit\d$/.test(code)) return `Alpha${code.slice(5)}`;
    if (/^Numpad\d$/.test(code)) return `Keypad${code.slice(6)}`;
    if (/^F\d{1,2}$/.test(code)) return code;
    return null;
}

/** Accepts KeyCode names ("Space"), Unity input names ("space", "a") or chars. */
export function normalizeKeyName(value: unknown): string {
    const text = String(value ?? "").trim();
    if (!text) return "None";
    if (/^[a-z]$/i.test(text)) return text.toUpperCase();
    if (/^\d$/.test(text)) return `Alpha${text}`;
    const alias = NAME_ALIASES[text.toLowerCase()];
    if (alias) return alias;
    return text;
}

interface AxisState {
    value: number;
}

type EdgeKind = "held" | "pressed" | "released";

/** One gamepad slot (or the on-screen buttons) for one frame. */
interface PadSlot {
    held: Set<GamepadButtonName>;
    pressed: Set<GamepadButtonName>;
    released: Set<GamepadButtonName>;
    axes: number[];
    connected: boolean;
    name: string;
}

const emptySlot = (): PadSlot => ({ held: new Set(), pressed: new Set(), released: new Set(), axes: [0, 0, 0, 0], connected: false, name: "" });
const MAX_PADS = 4;

/** On-screen touch buttons also press these gamepad buttons, so actions whose keys were rebound still answer them. */
const TOUCH_PAD: Record<string, GamepadButtonName> = { LeftArrow: "DpadLeft", RightArrow: "DpadRight", UpArrow: "DpadUp", DownArrow: "DpadDown", Space: "A", LeftControl: "X" };

/** Source of the arrow keys the virtual joystick (V6) holds while it is pushed past half way. */
const STICK = "stick";
/** How far the joystick must lean (0–1) before it also holds an arrow key. */
const STICK_KEY_THRESHOLD = 0.5;

/** Adds or removes `source` from what holds `item`; true when the item became held or free. */
function holdBy<T>(sources: Map<T, Set<string>>, item: T, source: string, down: boolean): boolean {
    const set = sources.get(item);
    const was = Boolean(set?.size);
    if (down) {
        if (set) set.add(source);
        else sources.set(item, new Set([source]));
    } else if (set) {
        set.delete(source);
        if (!set.size) sources.delete(item);
    }
    return was !== Boolean(sources.get(item)?.size);
}

/** An axis action the virtual joystick feeds as an analog stick (so its arrow keys must not make it digital). */
const leftStickAction = (action: InputAction) => action.gamepadAxis === "LeftStickX" || action.gamepadAxis === "LeftStickY";

export class InputManager {
    private readonly held = new Set<string>();
    private readonly pressedFrame = new Set<string>();
    private readonly releasedFrame = new Set<string>();
    private readonly pendingPressed = new Set<string>();
    private readonly pendingReleased = new Set<string>();
    private readonly mouseHeld = new Set<number>();
    private readonly mouseDownFrame = new Set<number>();
    private readonly mouseUpFrame = new Set<number>();
    private readonly pendingMouseDown = new Set<number>();
    private readonly pendingMouseUp = new Set<number>();
    private readonly virtualHeld = new Set<string>();
    /** What holds each on-screen key: the classic buttons, a touch button's action or the joystick (V6). */
    private readonly virtualSources = new Map<string, Set<string>>();
    /** Key edges from the physical keyboard and from the on-screen buttons, kept apart for player views. */
    private keyPressedFrame = new Set<string>();
    private keyReleasedFrame = new Set<string>();
    private touchPressedFrame = new Set<string>();
    private touchReleasedFrame = new Set<string>();
    private readonly pendingKeyPressed = new Set<string>();
    private readonly pendingKeyReleased = new Set<string>();
    private readonly pendingTouchPressed = new Set<string>();
    private readonly pendingTouchReleased = new Set<string>();
    private readonly touchPad = new Set<GamepadButtonName>();
    private readonly touchPadSources = new Map<GamepadButtonName, Set<string>>();
    /** The virtual joystick (V6) in gamepad terms: x right, y down, after its own dead zone. */
    private touchStick: [number, number] = [0, 0];
    /** Input actions held by the on-screen buttons (V6), what holds them, and their edges. */
    private readonly touchActions = new Set<string>();
    private readonly touchActionSources = new Map<string, Set<string>>();
    private readonly pendingActionPressed = new Set<string>();
    private readonly pendingActionReleased = new Set<string>();
    private actionPressedFrame = new Set<string>();
    private actionReleasedFrame = new Set<string>();
    /** Input.Vibrate goes here (tests replace it); the default uses the browser's gamepads or navigator.vibrate. */
    haptics: (milliseconds: number, strength: number) => string = (milliseconds, strength) => vibrate(typeof navigator !== "undefined" ? navigator as unknown as VibrationHost : null, milliseconds, strength);
    private readonly axes = new Map<string, AxisState>();
    private actions = new Map<string, InputAction>();
    private deadZone = 0.2;
    /** Gamepad buttons held this frame and the edges since the last one (any connected pad counts). */
    private padHeld = new Set<GamepadButtonName>();
    private padPressed = new Set<GamepadButtonName>();
    private padReleased = new Set<GamepadButtonName>();
    private padAxes = [0, 0, 0, 0];
    private padNames: string[] = [];
    /** Each gamepad slot on its own (local multiplayer), and the on-screen buttons as a pad. */
    private pads: PadSlot[] = Array.from({ length: MAX_PADS }, emptySlot);
    private touchSlot: PadSlot = emptySlot();
    /** Gamepad state injected by tests or on-screen controls instead of navigator.getGamepads(), per slot. */
    private virtualPads: Array<{ buttons: GamepadButtonName[]; axes: number[] } | null> = Array.from({ length: MAX_PADS }, () => null);
    private readonly views = new Map<string, PlayerInputView>();
    private cleanup: Array<() => void> = [];
    /** Mouse position in pixels, origin bottom-left (Unity convention). */
    mouseX = 0;
    mouseY = 0;
    mouseDeltaX = 0;
    mouseDeltaY = 0;
    private pendingDeltaX = 0;
    private pendingDeltaY = 0;
    scrollDelta = 0;
    private pendingScroll = 0;
    touchCount = 0;
    inputString = "";
    private pendingString = "";
    enabled = true;
    private element: HTMLElement | null = null;

    constructor(settings: InputSettings = defaultInputSettings()) {
        this.configure(settings);
    }

    /** Uses a project's input actions (called whenever a game starts). */
    configure(settings: InputSettings) {
        this.actions = new Map(settings.actions.map((action) => [action.name, action]));
        this.deadZone = settings.deadZone;
        this.axes.clear();
    }

    /** Presses gamepad buttons and moves sticks without a real pad (tests, virtual controls); null releases it. */
    setVirtualGamepad(state: { buttons?: GamepadButtonName[]; axes?: number[] } | null, slot = 0) {
        if (slot < 0 || slot >= MAX_PADS) return;
        this.virtualPads[slot] = state ? { buttons: [...(state.buttons ?? [])], axes: [...(state.axes ?? [])] } : null;
    }

    /** The input of one player (local multiplayer): only the devices of its source. */
    view(spec: InputSourceSpec): PlayerInputView {
        const key = `${spec.keyboard}|${spec.mouse ? 1 : 0}|${spec.touch ? 1 : 0}|${spec.pad ?? "-"}`;
        let view = this.views.get(key);
        if (!view) {
            view = new PlayerInputView(this, spec);
            this.views.set(key, view);
        }
        return view;
    }

    attach(element: HTMLElement, keyboardTarget: Window | HTMLElement = window) {
        this.detach();
        this.element = element;
        const isEditable = (target: EventTarget | null) => {
            const node = target as HTMLElement | null;
            return Boolean(node && (node.tagName === "INPUT" || node.tagName === "TEXTAREA" || node.isContentEditable));
        };
        const onKeyDown = (event: Event) => {
            const keyboardEvent = event as KeyboardEvent;
            if (!this.enabled || isEditable(keyboardEvent.target)) return;
            const key = keyFromEvent(keyboardEvent);
            if (!key) return;
            if (["Space", "UpArrow", "DownArrow", "LeftArrow", "RightArrow", "Tab"].includes(key)) keyboardEvent.preventDefault();
            if (!this.held.has(key)) {
                this.pendingPressed.add(key);
                this.pendingKeyPressed.add(key);
            }
            this.held.add(key);
            if (keyboardEvent.key.length === 1) this.pendingString += keyboardEvent.key;
        };
        const onKeyUp = (event: Event) => {
            const key = keyFromEvent(event as KeyboardEvent);
            if (!key) return;
            this.held.delete(key);
            this.pendingReleased.add(key);
            this.pendingKeyReleased.add(key);
        };
        const onBlur = () => {
            for (const key of this.held) {
                this.pendingReleased.add(key);
                this.pendingKeyReleased.add(key);
            }
            this.held.clear();
            for (const button of this.mouseHeld) this.pendingMouseUp.add(button);
            this.mouseHeld.clear();
        };
        const updatePointer = (clientX: number, clientY: number) => {
            const rect = element.getBoundingClientRect();
            const x = clientX - rect.left;
            const y = rect.height - (clientY - rect.top);
            this.pendingDeltaX += x - this.mouseX;
            this.pendingDeltaY += y - this.mouseY;
            this.mouseX = x;
            this.mouseY = y;
        };
        const onPointerDown = (event: PointerEvent) => {
            if (!this.enabled) return;
            updatePointer(event.clientX, event.clientY);
            const button = event.pointerType === "touch" ? 0 : event.button;
            this.mouseHeld.add(button);
            this.pendingMouseDown.add(button);
            if (event.pointerType === "touch") this.touchCount += 1;
            element.focus?.({ preventScroll: true });
        };
        const onPointerUp = (event: PointerEvent) => {
            const button = event.pointerType === "touch" ? 0 : event.button;
            this.mouseHeld.delete(button);
            this.pendingMouseUp.add(button);
            if (event.pointerType === "touch") this.touchCount = Math.max(0, this.touchCount - 1);
        };
        const onPointerMove = (event: PointerEvent) => updatePointer(event.clientX, event.clientY);
        const onWheel = (event: WheelEvent) => {
            this.pendingScroll += -Math.sign(event.deltaY);
        };
        const onContextMenu = (event: Event) => event.preventDefault();
        keyboardTarget.addEventListener("keydown", onKeyDown);
        keyboardTarget.addEventListener("keyup", onKeyUp);
        window.addEventListener("blur", onBlur);
        element.addEventListener("pointerdown", onPointerDown);
        window.addEventListener("pointerup", onPointerUp);
        window.addEventListener("pointermove", onPointerMove);
        element.addEventListener("wheel", onWheel, { passive: true });
        element.addEventListener("contextmenu", onContextMenu);
        this.cleanup = [
            () => keyboardTarget.removeEventListener("keydown", onKeyDown),
            () => keyboardTarget.removeEventListener("keyup", onKeyUp),
            () => window.removeEventListener("blur", onBlur),
            () => element.removeEventListener("pointerdown", onPointerDown),
            () => window.removeEventListener("pointerup", onPointerUp),
            () => window.removeEventListener("pointermove", onPointerMove),
            () => element.removeEventListener("wheel", onWheel),
            () => element.removeEventListener("contextmenu", onContextMenu),
        ];
    }

    detach() {
        this.cleanup.forEach((dispose) => dispose());
        this.cleanup = [];
        this.element = null;
        this.reset();
    }

    reset() {
        this.held.clear();
        this.pressedFrame.clear();
        this.releasedFrame.clear();
        this.pendingPressed.clear();
        this.pendingReleased.clear();
        this.mouseHeld.clear();
        this.mouseDownFrame.clear();
        this.mouseUpFrame.clear();
        this.pendingMouseDown.clear();
        this.pendingMouseUp.clear();
        this.virtualHeld.clear();
        this.virtualSources.clear();
        this.touchPadSources.clear();
        this.touchStick = [0, 0];
        this.touchActions.clear();
        this.touchActionSources.clear();
        this.pendingActionPressed.clear();
        this.pendingActionReleased.clear();
        this.actionPressedFrame.clear();
        this.actionReleasedFrame.clear();
        this.keyPressedFrame.clear();
        this.keyReleasedFrame.clear();
        this.touchPressedFrame.clear();
        this.touchReleasedFrame.clear();
        this.pendingKeyPressed.clear();
        this.pendingKeyReleased.clear();
        this.pendingTouchPressed.clear();
        this.pendingTouchReleased.clear();
        this.touchPad.clear();
        this.axes.clear();
        this.padHeld.clear();
        this.padPressed.clear();
        this.padReleased.clear();
        this.padAxes = [0, 0, 0, 0];
        this.pads = Array.from({ length: MAX_PADS }, emptySlot);
        this.touchSlot = emptySlot();
        for (const view of this.views.values()) view.reset();
        this.touchCount = 0;
    }

    /** Presses or releases a key as if on the physical keyboard (tests; the on-screen buttons use setVirtualKey). */
    setKeyboardKey(key: string, down: boolean) {
        if (down) {
            if (!this.held.has(key)) {
                this.pendingPressed.add(key);
                this.pendingKeyPressed.add(key);
            }
            this.held.add(key);
        } else if (this.held.has(key)) {
            this.held.delete(key);
            this.pendingReleased.add(key);
            this.pendingKeyReleased.add(key);
        }
    }

    /**
     * On-screen touch buttons map onto regular keys (and the matching gamepad
     * buttons). `source` tells apart what holds a key (a button, a touch
     * button's action, the joystick), so releasing one keeps the others.
     */
    setVirtualKey(key: string, down: boolean, source = "button") {
        if (holdBy(this.virtualSources, key, source, down)) {
            if (down) {
                if (!this.held.has(key)) this.pendingPressed.add(key);
                this.pendingTouchPressed.add(key);
                this.virtualHeld.add(key);
            } else {
                this.pendingTouchReleased.add(key);
                this.virtualHeld.delete(key);
                if (!this.held.has(key)) this.pendingReleased.add(key);
            }
        }
        // The joystick's arrows don't press the d-pad: Horizontal/Vertical read the stick itself.
        const pad = TOUCH_PAD[key];
        if (pad && source !== STICK) this.setTouchPadButton(pad, down, `key:${source}`);
    }

    private setTouchPadButton(button: GamepadButtonName, down: boolean, source: string) {
        holdBy(this.touchPadSources, button, source, down);
        if (this.touchPadSources.has(button)) this.touchPad.add(button);
        else this.touchPad.delete(button);
    }

    /**
     * The virtual joystick (V6): x right and y up, length 0–1, after its dead
     * zone. Axis actions bound to the left stick (Horizontal and Vertical by
     * default) read it as an analog stick; pushed past half way it also holds
     * the arrow keys, so games that read keys work too.
     */
    setTouchStick(x: number, y: number) {
        const clamp = (value: number) => (Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0);
        this.touchStick = [clamp(x), -clamp(y)];
        this.setVirtualKey("LeftArrow", x < -STICK_KEY_THRESHOLD, STICK);
        this.setVirtualKey("RightArrow", x > STICK_KEY_THRESHOLD, STICK);
        this.setVirtualKey("UpArrow", y > STICK_KEY_THRESHOLD, STICK);
        this.setVirtualKey("DownArrow", y < -STICK_KEY_THRESHOLD, STICK);
    }

    /** The joystick's current value (x right, y up). */
    get touchStickValue(): { x: number; y: number } {
        return { x: this.touchStick[0], y: -this.touchStick[1] || 0 };
    }

    /**
     * An on-screen button (V6) pressing an input action: the action answers
     * GetButton/GetAxis, and its keys and gamepad buttons are held too (so
     * Input.GetKey(KeyCode.Space) sees the Jump button). Unknown names press
     * the key of that name.
     */
    setTouchAction(name: string, down: boolean, button = 0) {
        const source = `touch:${button}`;
        const action = this.actions.get(name);
        if (!action) {
            this.setVirtualKey(normalizeKeyName(name), down, source);
            return;
        }
        if (holdBy(this.touchActionSources, name, source, down)) {
            if (down) {
                this.touchActions.add(name);
                this.pendingActionPressed.add(name);
            } else {
                this.touchActions.delete(name);
                this.pendingActionReleased.add(name);
            }
        }
        for (const key of action.positive) if (!key.startsWith("Mouse")) this.setVirtualKey(key, down, source);
        for (const pad of action.gamepadPositive) this.setTouchPadButton(pad, down, source);
    }

    /** A touch button's action (V6) for player views. */
    touchAction(name: string, kind: EdgeKind) {
        return (kind === "held" ? this.touchActions : kind === "pressed" ? this.actionPressedFrame : this.actionReleasedFrame).has(name);
    }

    /** Input.Vibrate(milliseconds, strength): gamepad rumble or the phone's vibration, if there is any. */
    vibrate(milliseconds: number, strength = 1): string {
        return this.haptics(milliseconds, strength);
    }

    /** Called once at the start of every frame. */
    beginFrame(deltaTime: number) {
        this.pressedFrame.clear();
        this.releasedFrame.clear();
        for (const key of this.pendingPressed) this.pressedFrame.add(key);
        for (const key of this.pendingReleased) this.releasedFrame.add(key);
        this.pendingPressed.clear();
        this.pendingReleased.clear();
        this.keyPressedFrame = new Set(this.pendingKeyPressed);
        this.keyReleasedFrame = new Set(this.pendingKeyReleased);
        this.touchPressedFrame = new Set(this.pendingTouchPressed);
        this.touchReleasedFrame = new Set(this.pendingTouchReleased);
        this.pendingKeyPressed.clear();
        this.pendingKeyReleased.clear();
        this.pendingTouchPressed.clear();
        this.pendingTouchReleased.clear();
        this.actionPressedFrame = new Set(this.pendingActionPressed);
        this.actionReleasedFrame = new Set(this.pendingActionReleased);
        this.pendingActionPressed.clear();
        this.pendingActionReleased.clear();
        this.mouseDownFrame.clear();
        this.mouseUpFrame.clear();
        for (const button of this.pendingMouseDown) this.mouseDownFrame.add(button);
        for (const button of this.pendingMouseUp) this.mouseUpFrame.add(button);
        this.pendingMouseDown.clear();
        this.pendingMouseUp.clear();
        this.mouseDeltaX = this.pendingDeltaX;
        this.mouseDeltaY = this.pendingDeltaY;
        this.pendingDeltaX = 0;
        this.pendingDeltaY = 0;
        this.scrollDelta = this.pendingScroll;
        this.pendingScroll = 0;
        this.inputString = this.pendingString;
        this.pendingString = "";
        this.pollGamepads();
        // Keyboard axes are smoothed like Unity's (sensitivity 3, gravity 3, snap); sticks are read as they are.
        for (const action of this.actions.values()) {
            if (action.kind !== "axis") continue;
            const target = this.keyAxis(action);
            const state = this.axes.get(action.name) ?? { value: 0 };
            if (target !== 0 && Math.sign(target) !== Math.sign(state.value) && state.value !== 0) state.value = 0;
            const speed = 3 * deltaTime;
            if (state.value < target) state.value = Math.min(target, state.value + speed);
            else if (state.value > target) state.value = Math.max(target, state.value - speed);
            this.axes.set(action.name, state);
        }
        for (const view of this.views.values()) view.update(deltaTime);
    }

    private pollGamepads() {
        const held = new Set<GamepadButtonName>();
        const axes = [0, 0, 0, 0];
        const names: string[] = [];
        const slots = Array.from({ length: MAX_PADS }, emptySlot);
        const take = (slot: number, name: string, buttons: ArrayLike<{ pressed: boolean; value: number } | boolean>, sticks: ArrayLike<number>) => {
            const own = slot >= 0 && slot < MAX_PADS ? slots[slot] : null;
            if (own) {
                own.connected = true;
                own.name = name;
            }
            for (let index = 0; index < Math.min(buttons.length, GAMEPAD_BUTTONS.length); index += 1) {
                const button = buttons[index];
                const pressed = typeof button === "boolean" ? button : button.pressed || button.value > 0.5;
                if (!pressed) continue;
                held.add(GAMEPAD_BUTTONS[index]);
                own?.held.add(GAMEPAD_BUTTONS[index]);
            }
            for (let index = 0; index < Math.min(sticks.length, GAMEPAD_AXES.length); index += 1) {
                const value = Number(sticks[index]) || 0;
                if (Math.abs(value) > Math.abs(axes[index])) axes[index] = value;
                if (own) own.axes[index] = value;
            }
        };
        if (this.virtualPads.some(Boolean)) {
            this.virtualPads.forEach((pad, slot) => {
                if (!pad) return;
                take(slot, "Virtual Gamepad", GAMEPAD_BUTTONS.map((name) => pad.buttons.includes(name)), pad.axes);
                names.push("Virtual Gamepad");
            });
        } else if (this.enabled && typeof navigator !== "undefined" && typeof navigator.getGamepads === "function") {
            for (const pad of navigator.getGamepads()) {
                if (!pad || !pad.connected) continue;
                names.push(pad.id);
                take(pad.index, pad.id, pad.buttons, pad.axes);
            }
        }
        for (const name of this.touchPad) held.add(name);
        this.padPressed = new Set([...held].filter((name) => !this.padHeld.has(name)));
        this.padReleased = new Set([...this.padHeld].filter((name) => !held.has(name)));
        this.padHeld = held;
        this.padAxes = axes;
        this.padNames = names;
        const withEdges = (next: PadSlot, previous: PadSlot): PadSlot => ({
            ...next,
            pressed: new Set([...next.held].filter((name) => !previous.held.has(name))),
            released: new Set([...previous.held].filter((name) => !next.held.has(name))),
        });
        this.pads = slots.map((slot, index) => withEdges(slot, this.pads[index]));
        this.touchSlot = withEdges({ ...emptySlot(), held: new Set(this.touchPad), connected: true, name: "Touch" }, this.touchSlot);
    }

    // -- Read by player views (local multiplayer) --------------------------------

    /** A physical keyboard key (not the on-screen buttons). */
    keyboardKey(key: string, kind: EdgeKind) {
        return (kind === "held" ? this.held : kind === "pressed" ? this.keyPressedFrame : this.keyReleasedFrame).has(key);
    }

    /** A key pressed through the on-screen touch buttons (`withStick` false: not by the joystick's arrows). */
    touchKey(key: string, kind: EdgeKind, withStick = true) {
        if (!withStick && this.virtualSources.get(key)?.size === 1 && this.virtualSources.get(key)?.has(STICK)) return false;
        return (kind === "held" ? this.virtualHeld : kind === "pressed" ? this.touchPressedFrame : this.touchReleasedFrame).has(key);
    }

    /** The joystick as a left stick, in gamepad terms (y down), for the axis of an action. */
    touchStickAxis(action: InputAction): number {
        if (!leftStickAction(action)) return 0;
        const value = this.touchStick[action.gamepadAxis === "LeftStickX" ? 0 : 1];
        return (action.invert ? -value : value) || 0;
    }

    mouseButton(button: number, kind: EdgeKind) {
        return (kind === "held" ? this.mouseHeld : kind === "pressed" ? this.mouseDownFrame : this.mouseUpFrame).has(button);
    }

    /** Gamepad slot 0–3, or "touch" for the on-screen buttons. */
    padSlot(slot: number | "touch"): PadSlot {
        return slot === "touch" ? this.touchSlot : this.pads[slot] ?? emptySlot();
    }

    /** How many gamepads are connected. */
    get gamepadCount() {
        return this.pads.filter((pad) => pad.connected).length;
    }

    action(name: string): InputAction | undefined {
        return this.actions.get(name);
    }

    actionList(): Iterable<InputAction> {
        return this.actions.values();
    }

    /** A stick value after the dead zone (rescaled so it starts at 0). */
    deadZoned(raw: number, invert: boolean) {
        if (Math.abs(raw) <= this.deadZone) return 0;
        const scaled = (Math.abs(raw) - this.deadZone) / (1 - this.deadZone);
        return Math.sign(raw) * Math.min(1, scaled) * (invert ? -1 : 1);
    }

    /** −1…1 from the action's keys, d-pad buttons and touch button (V6). */
    private keyAxis(action: InputAction): number {
        // A left-stick axis reads the joystick as a stick, not through its arrow keys.
        const withStick = !leftStickAction(action);
        const positive = action.positive.some((key) => this.keyHeld(key, withStick)) || action.gamepadPositive.some((name) => this.padHeld.has(name)) || this.touchActions.has(action.name);
        const negative = action.negative.some((key) => this.keyHeld(key, withStick)) || action.gamepadNegative.some((name) => this.padHeld.has(name));
        return (positive ? 1 : 0) - (negative ? 1 : 0);
    }

    /** The action's analog stick after the dead zone (rescaled so it starts at 0), or the virtual joystick (V6). */
    private stickAxis(action: InputAction): number {
        if (!action.gamepadAxis) return 0;
        const pad = this.deadZoned(this.padAxes[GAMEPAD_AXES.indexOf(action.gamepadAxis)] ?? 0, action.invert);
        const touch = this.touchStickAxis(action);
        return Math.abs(touch) > Math.abs(pad) ? touch : pad;
    }

    private keyHeld(key: string, withStick = true) {
        if (key.startsWith("Mouse")) return this.mouseHeld.has(Number(key.slice(5)));
        if (!withStick && !this.held.has(key)) {
            const sources = this.virtualSources.get(key);
            return Boolean(sources && [...sources].some((source) => source !== STICK));
        }
        return this.isHeld(key);
    }

    private keyPressed(key: string) {
        if (key.startsWith("Mouse")) return this.mouseDownFrame.has(Number(key.slice(5)));
        return this.pressedFrame.has(key);
    }

    private keyReleased(key: string) {
        if (key.startsWith("Mouse")) return this.mouseUpFrame.has(Number(key.slice(5)));
        return this.releasedFrame.has(key);
    }

    /** Names of the connected gamepads (Input.GetJoystickNames). */
    get gamepadNames(): readonly string[] {
        return this.padNames;
    }

    isHeld(key: string) {
        return this.held.has(key) || this.virtualHeld.has(key);
    }

    getKey(value: unknown) {
        const key = normalizeKeyName(value);
        if (key.startsWith("Mouse")) return this.mouseHeld.has(Number(key.slice(5)));
        return this.isHeld(key);
    }

    getKeyDown(value: unknown) {
        const key = normalizeKeyName(value);
        if (key.startsWith("Mouse")) return this.mouseDownFrame.has(Number(key.slice(5)));
        return this.pressedFrame.has(key);
    }

    getKeyUp(value: unknown) {
        const key = normalizeKeyName(value);
        if (key.startsWith("Mouse")) return this.mouseUpFrame.has(Number(key.slice(5)));
        return this.releasedFrame.has(key);
    }

    anyKey() {
        return this.held.size > 0 || this.virtualHeld.size > 0 || this.mouseHeld.size > 0;
    }

    anyKeyDown() {
        return this.pressedFrame.size > 0 || this.mouseDownFrame.size > 0;
    }

    getMouseButton(button: number) {
        return this.mouseHeld.has(button);
    }

    getMouseButtonDown(button: number) {
        return this.mouseDownFrame.has(button);
    }

    getMouseButtonUp(button: number) {
        return this.mouseUpFrame.has(button);
    }

    getAxisRaw(name: string): number {
        switch (name) {
            case "Mouse X":
                return this.mouseDeltaX * 0.1;
            case "Mouse Y":
                return this.mouseDeltaY * 0.1;
            case "Mouse ScrollWheel":
                return this.scrollDelta * 0.1;
        }
        const action = this.actions.get(name);
        if (!action) return 0;
        if (action.kind === "button") return this.getButton(name) ? 1 : 0;
        const keys = this.keyAxis(action);
        const stick = this.stickAxis(action);
        return Math.abs(stick) > Math.abs(keys) ? stick : keys;
    }

    getAxis(name: string): number {
        const action = this.actions.get(name);
        if (!action || action.kind !== "axis") return this.getAxisRaw(name);
        const smoothed = this.axes.get(name)?.value ?? this.keyAxis(action);
        const stick = this.stickAxis(action);
        return Math.abs(stick) > Math.abs(smoothed) ? stick : smoothed;
    }

    getButton(name: string) {
        const action = this.actions.get(name);
        if (!action) return this.getKey(name);
        return [...action.positive, ...action.negative].some((key) => this.keyHeld(key))
            || [...action.gamepadPositive, ...action.gamepadNegative].some((button) => this.padHeld.has(button))
            || this.touchActions.has(name);
    }

    getButtonDown(name: string) {
        const action = this.actions.get(name);
        if (!action) return this.getKeyDown(name);
        return [...action.positive, ...action.negative].some((key) => this.keyPressed(key))
            || [...action.gamepadPositive, ...action.gamepadNegative].some((button) => this.padPressed.has(button))
            || this.actionPressedFrame.has(name);
    }

    getButtonUp(name: string) {
        const action = this.actions.get(name);
        if (!action) return this.getKeyUp(name);
        return [...action.positive, ...action.negative].some((key) => this.keyReleased(key))
            || [...action.gamepadPositive, ...action.gamepadNegative].some((button) => this.padReleased.has(button))
            || this.actionReleasedFrame.has(name);
    }

    get attached() {
        return this.element !== null;
    }
}

/**
 * One player's input (local multiplayer, V5): the project's actions read from
 * that player's devices only — a half of the keyboard, a gamepad slot, the
 * mouse and the on-screen buttons as its source says.
 */
export class PlayerInputView {
    readonly spec: InputSourceSpec;
    private readonly manager: InputManager;
    private readonly axes = new Map<string, number>();

    constructor(manager: InputManager, spec: InputSourceSpec) {
        this.manager = manager;
        this.spec = spec;
    }

    reset() {
        this.axes.clear();
    }

    private keys(list: readonly string[], kind: EdgeKind, withStick = true): boolean {
        for (const key of playerKeys(list, this.spec)) {
            if (key.startsWith("Mouse") ? this.manager.mouseButton(Number(key.slice(5)), kind) : this.manager.keyboardKey(key, kind)) return true;
        }
        // The on-screen buttons press the binding's own keys, whatever half they are on.
        return this.spec.touch && list.some((key) => !key.startsWith("Mouse") && this.manager.touchKey(key, kind, withStick));
    }

    private buttons(list: readonly GamepadButtonName[], kind: EdgeKind): boolean {
        const pad = this.spec.pad === null ? null : this.manager.padSlot(this.spec.pad);
        const touch = this.spec.touch ? this.manager.padSlot("touch") : null;
        return list.some((button) => Boolean(pad?.[kind].has(button) || touch?.[kind].has(button)));
    }

    private keyAxis(action: InputAction): number {
        const withStick = !leftStickAction(action);
        const positive = this.keys(action.positive, "held", withStick) || this.buttons(action.gamepadPositive, "held") || (this.spec.touch && this.manager.touchAction(action.name, "held"));
        const negative = this.keys(action.negative, "held", withStick) || this.buttons(action.gamepadNegative, "held");
        return (positive ? 1 : 0) - (negative ? 1 : 0);
    }

    private stickAxis(action: InputAction): number {
        if (!action.gamepadAxis) return 0;
        const pad = this.spec.pad === null ? 0 : this.manager.deadZoned(this.manager.padSlot(this.spec.pad).axes[GAMEPAD_AXES.indexOf(action.gamepadAxis)] ?? 0, action.invert);
        const touch = this.spec.touch ? this.manager.touchStickAxis(action) : 0;
        return Math.abs(touch) > Math.abs(pad) ? touch : pad;
    }

    /** Smooths keyboard axes like the shared input does (once per frame). */
    update(deltaTime: number) {
        for (const action of this.manager.actionList()) {
            if (action.kind !== "axis") continue;
            const target = this.keyAxis(action);
            const value = this.axes.get(action.name) ?? 0;
            let next = target !== 0 && Math.sign(target) !== Math.sign(value) && value !== 0 ? 0 : value;
            const speed = 3 * deltaTime;
            if (next < target) next = Math.min(target, next + speed);
            else if (next > target) next = Math.max(target, next - speed);
            this.axes.set(action.name, next);
        }
    }

    getAxisRaw(name: string): number {
        switch (name) {
            case "Mouse X":
                return this.spec.mouse ? this.manager.mouseDeltaX * 0.1 : 0;
            case "Mouse Y":
                return this.spec.mouse ? this.manager.mouseDeltaY * 0.1 : 0;
            case "Mouse ScrollWheel":
                return this.spec.mouse ? this.manager.scrollDelta * 0.1 : 0;
        }
        const action = this.manager.action(name);
        if (!action) return 0;
        if (action.kind === "button") return this.getButton(name) ? 1 : 0;
        const keys = this.keyAxis(action);
        const stick = this.stickAxis(action);
        return Math.abs(stick) > Math.abs(keys) ? stick : keys;
    }

    getAxis(name: string): number {
        const action = this.manager.action(name);
        if (!action || action.kind !== "axis") return this.getAxisRaw(name);
        const smoothed = this.axes.get(name) ?? this.keyAxis(action);
        const stick = this.stickAxis(action);
        return Math.abs(stick) > Math.abs(smoothed) ? stick : smoothed;
    }

    private button(name: string, kind: EdgeKind): boolean {
        const action = this.manager.action(name);
        if (!action) return this.key(name, kind);
        return this.keys([...action.positive, ...action.negative], kind) || this.buttons([...action.gamepadPositive, ...action.gamepadNegative], kind)
            || (this.spec.touch && this.manager.touchAction(name, kind));
    }

    getButton(name: string) {
        return this.button(name, "held");
    }

    getButtonDown(name: string) {
        return this.button(name, "pressed");
    }

    getButtonUp(name: string) {
        return this.button(name, "released");
    }

    /** A raw key, if it is one of this player's (no mirroring). */
    key(value: unknown, kind: EdgeKind): boolean {
        const key = normalizeKeyName(value);
        if (key.startsWith("Mouse")) return this.spec.mouse && this.manager.mouseButton(Number(key.slice(5)), kind);
        const keyboard = this.spec.keyboard;
        const half = keyboardHalfOf(key);
        const allowed = keyboard === "all" || (keyboard !== "none" && (half === keyboard || half === null));
        return (allowed && this.manager.keyboardKey(key, kind)) || (this.spec.touch && this.manager.touchKey(key, kind));
    }

    /** The gamepad of this player is connected (keyboard players: true). */
    get connected(): boolean {
        if (this.spec.pad === null) return true;
        return this.manager.padSlot(this.spec.pad).connected || this.spec.keyboard !== "none";
    }
}
