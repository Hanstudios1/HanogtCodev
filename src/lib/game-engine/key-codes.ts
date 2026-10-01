/** Unity KeyCode names understood by Input.GetKey and UI button hotkeys. */
export const KEY_CODES: readonly string[] = [
    "None", "Backspace", "Tab", "Return", "Escape", "Space", "Delete", "UpArrow", "DownArrow", "LeftArrow", "RightArrow",
    "Insert", "Home", "End", "PageUp", "PageDown", "LeftShift", "RightShift", "LeftControl", "RightControl", "LeftAlt", "RightAlt",
    "CapsLock", "Mouse0", "Mouse1", "Mouse2",
    ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
    ...Array.from({ length: 10 }, (_, index) => `Alpha${index}`),
    ...Array.from({ length: 10 }, (_, index) => `Keypad${index}`),
    ...Array.from({ length: 12 }, (_, index) => `F${index + 1}`),
    "Minus", "Equals", "Comma", "Period", "Slash", "Semicolon", "Quote", "LeftBracket", "RightBracket", "Backslash", "BackQuote",
    "KeypadEnter", "KeypadPlus", "KeypadMinus", "KeypadMultiply", "KeypadDivide", "KeypadPeriod",
];

const KEY_CODE_SET = new Set(KEY_CODES);

export function isKeyCode(value: unknown): value is string {
    return typeof value === "string" && KEY_CODE_SET.has(value);
}
