/**
 * Engine-independent standard library of the Hanogt script VM: Mathf,
 * vectors, colours, quaternions, collections (+ LINQ helpers), string
 * formatting, System.* helpers and the C/C++ std facilities.
 */
import type { TypeRef } from "./ast";
import type { CompiledProgram } from "./compiler";
import type { Frame, Interpreter } from "./interpreter";
import {
    ClassInfo,
    CoutStream,
    EndlToken,
    EnumInfo,
    isHostObject,
    NOT_FOUND,
    ScriptObject,
    StaticNamespace,
    Vec3,
    VMBoundMethod,
    VMColor,
    VMCoroutine,
    VMDict,
    VMError,
    VMException,
    VMIterator,
    VMLambda,
    VMList,
    VMNativeFunction,
    VMPair,
    VMQuat,
    VMRandom,
    VMRef,
    YieldInstruction,
    type CollectionKind,
    type VMValue,
} from "./values";

type Dialect = "csharp" | "cpp";

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

function vmThrow(message: string, type = "Exception"): never {
    throw new VMError(message, type);
}

function num(value: VMValue, name = "değer"): number {
    if (typeof value === "number") return value;
    if (typeof value === "boolean") return value ? 1 : 0;
    return vmThrow(`${name} sayı olmalıdır.`, "ArgumentException");
}

function vec(value: VMValue, name = "vektör"): Vec3 {
    if (value instanceof Vec3) return value;
    return vmThrow(`${name} Vector2/Vector3 olmalıdır.`, "ArgumentException");
}

function col(value: VMValue): VMColor {
    if (value instanceof VMColor) return value;
    return vmThrow("Color bekleniyordu.", "ArgumentException");
}

function quat(value: VMValue): VMQuat {
    if (value instanceof VMQuat) return value;
    if (value instanceof Vec3) return quatFromEuler(value.x, value.y, value.z);
    return vmThrow("Quaternion bekleniyordu.", "ArgumentException");
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** C# rounds halves to even (Mathf.Round(2.5) == 2). */
function roundHalfEven(value: number): number {
    const floor = Math.floor(value);
    const diff = value - floor;
    if (diff > 0.5) return floor + 1;
    if (diff < 0.5) return floor;
    return floor % 2 === 0 ? floor : floor + 1;
}

// ---------------------------------------------------------------------------
// Quaternion helpers (YXZ Euler, degrees)
// ---------------------------------------------------------------------------

export function quatFromEuler(x: number, y: number, z: number): VMQuat {
    const c1 = Math.cos(x * DEG2RAD / 2), s1 = Math.sin(x * DEG2RAD / 2);
    const c2 = Math.cos(y * DEG2RAD / 2), s2 = Math.sin(y * DEG2RAD / 2);
    const c3 = Math.cos(z * DEG2RAD / 2), s3 = Math.sin(z * DEG2RAD / 2);
    return new VMQuat(
        s1 * c2 * c3 + c1 * s2 * s3,
        c1 * s2 * c3 - s1 * c2 * s3,
        c1 * c2 * s3 - s1 * s2 * c3,
        c1 * c2 * c3 + s1 * s2 * s3,
    );
}

export function eulerFromQuat(q: VMQuat): Vec3 {
    const length = Math.hypot(q.x, q.y, q.z, q.w) || 1;
    const x = q.x / length, y = q.y / length, z = q.z / length, w = q.w / length;
    const m13 = 2 * (x * z + w * y);
    const m21 = 2 * (x * y + w * z);
    const m22 = 1 - 2 * (x * x + z * z);
    const m23 = 2 * (y * z - w * x);
    const m31 = 2 * (x * z - w * y);
    const m11 = 1 - 2 * (y * y + z * z);
    const m33 = 1 - 2 * (x * x + y * y);
    const ex = Math.asin(-clamp(m23, -1, 1));
    let ey: number;
    let ez: number;
    if (Math.abs(m23) < 0.9999999) {
        ey = Math.atan2(m13, m33);
        ez = Math.atan2(m21, m22);
    } else {
        ey = Math.atan2(-m31, m11);
        ez = 0;
    }
    const normalize = (degrees: number) => {
        let value = degrees % 360;
        if (value < 0) value += 360;
        return Math.abs(value) < 1e-6 || Math.abs(value - 360) < 1e-6 ? 0 : value;
    };
    return new Vec3(normalize(ex * RAD2DEG), normalize(ey * RAD2DEG), normalize(ez * RAD2DEG));
}

function quatMul(a: VMQuat, b: VMQuat): VMQuat {
    return new VMQuat(
        a.x * b.w + a.w * b.x + a.y * b.z - a.z * b.y,
        a.y * b.w + a.w * b.y + a.z * b.x - a.x * b.z,
        a.z * b.w + a.w * b.z + a.x * b.y - a.y * b.x,
        a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    );
}

function quatNormalize(q: VMQuat): VMQuat {
    const length = Math.hypot(q.x, q.y, q.z, q.w) || 1;
    return new VMQuat(q.x / length, q.y / length, q.z / length, q.w / length);
}

function quatAngleAxis(angle: number, axis: Vec3): VMQuat {
    const n = axis.normalized();
    const s = Math.sin(angle * DEG2RAD / 2);
    return new VMQuat(n.x * s, n.y * s, n.z * s, Math.cos(angle * DEG2RAD / 2));
}

export function quatLookRotation(forwardValue: Vec3, upValue: Vec3 = new Vec3(0, 1, 0)): VMQuat {
    const forward = forwardValue.normalized();
    if (forward.sqrMagnitude < 1e-12) return new VMQuat();
    let right = cross(upValue, forward);
    if (right.sqrMagnitude < 1e-12) right = cross(new Vec3(1, 0, 0), forward);
    right = right.normalized();
    const up = cross(forward, right);
    const m00 = right.x, m01 = up.x, m02 = forward.x;
    const m10 = right.y, m11 = up.y, m12 = forward.y;
    const m20 = right.z, m21 = up.z, m22 = forward.z;
    const trace = m00 + m11 + m22;
    let q: VMQuat;
    if (trace > 0) {
        const s = 0.5 / Math.sqrt(trace + 1);
        q = new VMQuat((m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s);
    } else if (m00 > m11 && m00 > m22) {
        const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
        q = new VMQuat(0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s);
    } else if (m11 > m22) {
        const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
        q = new VMQuat((m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s);
    } else {
        const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
        q = new VMQuat((m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s);
    }
    return quatNormalize(q);
}

function quatSlerp(a: VMQuat, bValue: VMQuat, tValue: number): VMQuat {
    const t = clamp(tValue, 0, 1);
    let b = bValue;
    let cosHalf = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
    if (cosHalf < 0) {
        b = new VMQuat(-b.x, -b.y, -b.z, -b.w);
        cosHalf = -cosHalf;
    }
    if (cosHalf > 0.9995) {
        return quatNormalize(new VMQuat(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t, a.w + (b.w - a.w) * t));
    }
    const half = Math.acos(cosHalf);
    const sinHalf = Math.sqrt(1 - cosHalf * cosHalf);
    const ra = Math.sin((1 - t) * half) / sinHalf;
    const rb = Math.sin(t * half) / sinHalf;
    return new VMQuat(a.x * ra + b.x * rb, a.y * ra + b.y * rb, a.z * ra + b.z * rb, a.w * ra + b.w * rb);
}

function quatAngle(a: VMQuat, b: VMQuat): number {
    const dot = Math.min(Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w), 1);
    return dot > 0.999999 ? 0 : Math.acos(dot) * 2 * RAD2DEG;
}

function rotateByQuat(q: VMQuat, v: Vec3): Vec3 {
    const tx = 2 * (q.y * v.z - q.z * v.y);
    const ty = 2 * (q.z * v.x - q.x * v.z);
    const tz = 2 * (q.x * v.y - q.y * v.x);
    return new Vec3(v.x + q.w * tx + (q.y * tz - q.z * ty), v.y + q.w * ty + (q.z * tx - q.x * tz), v.z + q.w * tz + (q.x * ty - q.y * tx), v.is2D);
}

function cross(a: Vec3, b: Vec3): Vec3 {
    return new Vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}

function dot(a: Vec3, b: Vec3): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

// ---------------------------------------------------------------------------
// Perlin noise (Mathf.PerlinNoise)
// ---------------------------------------------------------------------------

const PERM = (() => {
    const p = new Uint8Array(512);
    const base = [151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140, 36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148, 247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32, 57, 177, 33, 88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175, 74, 165, 71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122, 60, 211, 133, 230, 220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54, 65, 25, 63, 161, 1, 216, 80, 73, 209, 76, 132, 187, 208, 89, 18, 169, 200, 196, 135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3, 64, 52, 217, 226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212, 207, 206, 59, 227, 47, 16, 58, 17, 182, 189, 28, 42, 223, 183, 170, 213, 119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9, 129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104, 218, 246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162, 241, 81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31, 181, 199, 106, 157, 184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254, 138, 236, 205, 93, 222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215, 61, 156, 180];
    for (let index = 0; index < 512; index += 1) p[index] = base[index & 255];
    return p;
})();

function perlin(xValue: number, yValue: number): number {
    const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
    const grad = (hash: number, x: number, y: number) => {
        const h = hash & 3;
        return ((h & 1) === 0 ? x : -x) + ((h & 2) === 0 ? y : -y);
    };
    const xi = Math.floor(xValue) & 255;
    const yi = Math.floor(yValue) & 255;
    const x = xValue - Math.floor(xValue);
    const y = yValue - Math.floor(yValue);
    const u = fade(x);
    const v = fade(y);
    const aa = PERM[PERM[xi] + yi], ab = PERM[PERM[xi] + yi + 1];
    const ba = PERM[PERM[xi + 1] + yi], bb = PERM[PERM[xi + 1] + yi + 1];
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const value = lerp(lerp(grad(aa, x, y), grad(ba, x - 1, y), u), lerp(grad(ab, x, y - 1), grad(bb, x - 1, y - 1), u), v);
    return clamp((value + 1) / 2, 0, 1);
}

// ---------------------------------------------------------------------------
// Equality, truthiness and string conversion
// ---------------------------------------------------------------------------

export function isDeadHost(value: VMValue): boolean {
    return isHostObject(value) && value.isAlive !== undefined && !value.isAlive();
}

export function vmEquals(a: VMValue, b: VMValue): boolean {
    if (a === b) return true;
    const aNull = a === null || a === undefined || isDeadHost(a);
    const bNull = b === null || b === undefined || isDeadHost(b);
    if (aNull || bNull) return aNull && bNull;
    if (a instanceof Vec3 && b instanceof Vec3) return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2 < 1e-10;
    if (a instanceof VMColor && b instanceof VMColor) return Math.abs(a.r - b.r) < 1e-6 && Math.abs(a.g - b.g) < 1e-6 && Math.abs(a.b - b.b) < 1e-6 && Math.abs(a.a - b.a) < 1e-6;
    if (a instanceof VMQuat && b instanceof VMQuat) return Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w) > 1 - 1e-6;
    if (a instanceof VMIterator && b instanceof VMIterator) return a.list === b.list && a.index === b.index;
    if (a instanceof VMPair && b instanceof VMPair) return vmEquals(a.key, b.key) && vmEquals(a.value, b.value);
    if (typeof a === "number" && typeof b === "boolean") return a === (b ? 1 : 0);
    if (typeof a === "boolean" && typeof b === "number") return (a ? 1 : 0) === b;
    return false;
}

export function vmTruthy(value: VMValue): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0 && !Number.isNaN(value);
    if (isHostObject(value)) return !isDeadHost(value) && (value.truthy ? value.truthy() : true);
    return true;
}

function formatFloat(value: number, precision = 7): string {
    if (Number.isNaN(value)) return "NaN";
    if (value === Infinity) return "Infinity";
    if (value === -Infinity) return "-Infinity";
    if (Number.isInteger(value)) return String(value);
    const text = String(parseFloat(value.toPrecision(precision)));
    return text === "-0" ? "0" : text;
}

export function toDisplayString(value: VMValue, dialect: Dialect, interp?: Interpreter, stream = false): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number") return formatFloat(value, dialect === "cpp" && stream ? 6 : 7);
    if (typeof value === "boolean") return dialect === "cpp" ? (value ? "1" : "0") : (value ? "True" : "False");
    if (value instanceof Vec3 || value instanceof VMColor || value instanceof VMQuat) return value.toString();
    if (value instanceof VMList) return `[${value.items.map((item) => toDisplayString(item, dialect, interp)).join(", ")}]`;
    if (value instanceof VMDict) return `{${[...value.map.values()].map((entry) => `${toDisplayString(entry.key, dialect, interp)}: ${toDisplayString(entry.value, dialect, interp)}`).join(", ")}}`;
    if (value instanceof VMPair) return `[${toDisplayString(value.key, dialect, interp)}, ${toDisplayString(value.value, dialect, interp)}]`;
    if (value instanceof VMException) return `${value.exceptionType}: ${value.message}`;
    if (value instanceof ScriptObject) {
        if (interp && value.cls.findMethod("ToString", 0)) {
            const result = interp.invoke(value, "ToString", [], false);
            if (typeof result === "string") return result;
        }
        return value.cls.name;
    }
    if (isHostObject(value)) return value.toString();
    if (value instanceof EnumInfo || value instanceof ClassInfo || value instanceof StaticNamespace) return value.name;
    if (value instanceof VMCoroutine) return `Coroutine(${value.methodName})`;
    if (value instanceof YieldInstruction) return value.kind;
    if (value instanceof VMLambda || value instanceof VMBoundMethod || value instanceof VMNativeFunction) return "System.Delegate";
    if (value instanceof CoutStream) return "std::ostream";
    if (value instanceof VMRandom) return "System.Random";
    if (value instanceof VMIterator) return `iterator(${value.index})`;
    return String(value);
}

/** Implements .NET numeric format strings (F2, N0, D3, P1, X, E, custom 0.00/#,##0). */
export function formatNumber(value: number, format: string): string {
    const match = /^([FfNnDdPpEeXxGgCcRr])(\d{0,2})$/.exec(format.trim());
    if (match) {
        const kind = match[1].toUpperCase();
        const digits = match[2] === "" ? null : Number(match[2]);
        switch (kind) {
            case "F":
                return value.toFixed(digits ?? 2);
            case "N":
            case "C": {
                const text = value.toLocaleString("en-US", { minimumFractionDigits: digits ?? 2, maximumFractionDigits: digits ?? 2 });
                return kind === "C" ? `$${text}` : text;
            }
            case "D": {
                const integer = Math.trunc(value);
                const text = String(Math.abs(integer)).padStart(digits ?? 1, "0");
                return integer < 0 ? `-${text}` : text;
            }
            case "P":
                return `${(value * 100).toFixed(digits ?? 2)}%`;
            case "E":
                return value.toExponential(digits ?? 6).toUpperCase();
            case "X": {
                const text = (Math.trunc(value) >>> 0).toString(16).toUpperCase().padStart(digits ?? 1, "0");
                return match[1] === "x" ? text.toLowerCase() : text;
            }
            default:
                return formatFloat(value);
        }
    }
    if (/^[0#,.]+$/.test(format)) {
        const [integerPart, fractionPart = ""] = format.split(".");
        const minDecimals = (fractionPart.match(/0/g) ?? []).length;
        const maxDecimals = fractionPart.length;
        const minIntegers = (integerPart.replace(/,/g, "").match(/0/g) ?? []).length;
        let text = value.toLocaleString("en-US", {
            minimumFractionDigits: minDecimals,
            maximumFractionDigits: maxDecimals,
            minimumIntegerDigits: Math.max(1, minIntegers),
            useGrouping: integerPart.includes(","),
        });
        if (minIntegers === 0 && text.startsWith("0.")) text = text.slice(1);
        return text;
    }
    return formatFloat(value);
}

export function formatValue(value: VMValue, format: string | undefined, dialect: Dialect, interp: Interpreter, staticType: string | null): string {
    if (typeof value === "number") {
        const enumName = interp.enumName(staticType, value);
        if (enumName && !format) return enumName;
        if (format) return formatNumber(value, format);
    }
    if (format && value instanceof Vec3) {
        const parts = [value.x, value.y, ...(value.is2D ? [] : [value.z])].map((component) => formatNumber(component, format));
        return `(${parts.join(", ")})`;
    }
    return toDisplayString(value, dialect, interp);
}

/** C#-style composite formatting: string.Format("{0:F2} / {1}", a, b). */
export function compositeFormat(template: string, args: VMValue[], dialect: Dialect, interp: Interpreter): string {
    return template.replace(/\{\{|\}\}|\{(\d+)(?:,(-?\d+))?(?::([^}]*))?\}/g, (whole, index?: string, alignment?: string, format?: string) => {
        if (whole === "{{") return "{";
        if (whole === "}}") return "}";
        const value = args[Number(index)];
        let text = format && typeof value === "number" ? formatNumber(value, format) : toDisplayString(value, dialect, interp);
        if (alignment) {
            const width = Number(alignment);
            text = width < 0 ? text.padEnd(-width) : text.padStart(width);
        }
        return text;
    });
}

/** printf-style formatting for C/C++ scripts. */
function printfFormat(template: string, args: VMValue[], interp: Interpreter): string {
    let index = 0;
    return template.replace(/%([-+ 0#]*)(\d+)?(?:\.(\d+))?([diufFeEgGxXsc%])/g, (_whole, flags: string, width?: string, precision?: string, kind?: string) => {
        if (kind === "%") return "%";
        const value = args[index++];
        let text: string;
        switch (kind) {
            case "d":
            case "i":
            case "u":
                text = String(Math.trunc(Number(value) || 0));
                break;
            case "f":
            case "F":
                text = (Number(value) || 0).toFixed(precision === undefined ? 6 : Number(precision));
                break;
            case "e":
            case "E":
                text = (Number(value) || 0).toExponential(precision === undefined ? 6 : Number(precision));
                if (kind === "E") text = text.toUpperCase();
                break;
            case "g":
            case "G":
                text = formatFloat(Number(value) || 0, precision === undefined ? 6 : Number(precision));
                break;
            case "x":
            case "X":
                text = (Math.trunc(Number(value) || 0) >>> 0).toString(16);
                if (kind === "X") text = text.toUpperCase();
                break;
            case "c":
                text = typeof value === "number" ? String.fromCharCode(value) : toDisplayString(value, "cpp", interp);
                break;
            default:
                text = toDisplayString(value, "cpp", interp);
        }
        if (width) {
            const size = Number(width);
            text = flags.includes("-") ? text.padEnd(size) : text.padStart(size, flags.includes("0") && kind !== "s" ? "0" : " ");
        }
        if (flags.includes("+") && typeof value === "number" && value >= 0 && kind !== "s") text = `+${text}`;
        return text;
    });
}

// ---------------------------------------------------------------------------
// Defaults and construction
// ---------------------------------------------------------------------------

export function defaultForTypeName(typeName: string, dialect: Dialect, program: CompiledProgram, typeRef?: TypeRef): VMValue {
    switch (typeName) {
        case "int":
        case "float":
            return 0;
        case "bool":
            return false;
        case "string":
            return dialect === "cpp" ? "" : null;
        case "Vector3":
            return new Vec3();
        case "Vector2":
            return new Vec3(0, 0, 0, true);
        case "Color":
            return new VMColor(0, 0, 0, 0);
        case "Quaternion":
            return new VMQuat(0, 0, 0, 1);
        case "KeyCode":
            return "None";
        case "List":
        case "HashSet":
        case "Queue":
        case "Stack":
            return dialect === "cpp" && !typeRef?.raw.includes("*") ? new VMList([], typeName as CollectionKind) : null;
        case "Dictionary":
            return dialect === "cpp" && !typeRef?.raw.includes("*") ? new VMDict() : null;
        default:
            if (program.enums.has(typeName)) return 0;
            return null;
    }
}

function waitSeconds(args: VMValue[]) {
    return Math.max(0, num(args[0] ?? 0, "Süre"));
}

const EXCEPTION_TYPES = new Set(["Exception", "ArgumentException", "InvalidOperationException", "NullReferenceException", "IndexOutOfRangeException", "KeyNotFoundException", "NotImplementedException", "FormatException"]);

function toCollection(value: VMValue): VMValue[] {
    if (value instanceof VMList) return [...value.items];
    if (value instanceof VMDict) return [...value.map.values()].map((entry) => new VMPair(entry.key, entry.value));
    return [];
}

export function constructBuiltin(name: string, args: VMValue[], typeArgs: string[], dialect: Dialect, interp: Interpreter): VMValue | typeof NOT_FOUND {
    switch (name) {
        case "Vector3":
        case "Vector3Int":
        case "Vector4":
            return new Vec3(num(args[0] ?? 0), num(args[1] ?? 0), num(args[2] ?? 0));
        case "Vector2":
        case "Vector2Int":
            return new Vec3(num(args[0] ?? 0), num(args[1] ?? 0), 0, true);
        case "Color":
            return new VMColor(num(args[0] ?? 0), num(args[1] ?? 0), num(args[2] ?? 0), args.length > 3 ? num(args[3]) : 1);
        case "Color32":
            return new VMColor(num(args[0] ?? 0) / 255, num(args[1] ?? 0) / 255, num(args[2] ?? 0) / 255, args.length > 3 ? num(args[3]) / 255 : 1);
        case "Quaternion":
            return new VMQuat(num(args[0] ?? 0), num(args[1] ?? 0), num(args[2] ?? 0), args.length > 3 ? num(args[3]) : 1);
        case "List":
        case "HashSet":
        case "Queue":
        case "Stack": {
            const elementType = typeArgs[0] ?? null;
            const list = new VMList([], name as CollectionKind, elementType);
            if (args[0] instanceof VMList || args[0] instanceof VMDict) {
                for (const item of toCollection(args[0])) {
                    if (name === "HashSet" && list.items.some((existing) => vmEquals(existing, item))) continue;
                    list.items.push(item);
                }
                if (name === "Stack") list.items.reverse();
            } else if (dialect === "cpp" && typeof args[0] === "number") {
                // std::vector<T>(n, value)
                const count = Math.max(0, Math.trunc(args[0]));
                if (count > 1_000_000) vmThrow("Vektör boyutu çok büyük.");
                for (let index = 0; index < count; index += 1) {
                    list.items.push(args.length > 1 ? copyValue(args[1]) : defaultForTypeName(elementType ?? "int", dialect, interp.program));
                }
            }
            return list;
        }
        case "Dictionary": {
            const dict = new VMDict(typeArgs[0] ?? null, typeArgs[1] ?? null);
            if (args[0] instanceof VMDict) for (const entry of args[0].map.values()) dict.set(entry.key, entry.value);
            return dict;
        }
        case "WaitForSeconds":
            return new YieldInstruction("seconds", waitSeconds(args));
        case "WaitForSecondsRealtime":
            return new YieldInstruction("realtime", waitSeconds(args));
        case "WaitForEndOfFrame":
            return new YieldInstruction("endOfFrame");
        case "WaitForFixedUpdate":
            return new YieldInstruction("fixed");
        case "WaitUntil":
            return new YieldInstruction("until", args[0] ?? null);
        case "WaitWhile":
            return new YieldInstruction("while", args[0] ?? null);
        case "Random":
            return new VMRandom(args.length ? Math.trunc(num(args[0])) : undefined);
        case "Pair":
            return new VMPair(copyValue(args[0] ?? null), copyValue(args[1] ?? null));
        case "string":
            if (args.length === 2 && typeof args[0] === "string" && typeof args[1] === "number") return args[0].repeat(Math.max(0, Math.min(100_000, args[1])));
            if (args.length === 2 && typeof args[0] === "number" && typeof args[1] === "string") return args[1].repeat(Math.max(0, Math.min(100_000, args[0])));
            return args.length ? toDisplayString(args[0], dialect, interp) : "";
        case "Func":
        case "Action":
            return args[0] ?? null;
        default:
            if (EXCEPTION_TYPES.has(name)) return new VMException(name, typeof args[0] === "string" ? args[0] : name);
            return NOT_FOUND;
    }
}

function copyValue(value: VMValue): VMValue {
    return value instanceof Vec3 || value instanceof VMColor || value instanceof VMQuat ? value.clone() : value;
}

// ---------------------------------------------------------------------------
// Members of built-in value types
// ---------------------------------------------------------------------------

export function getBuiltinMember(object: VMValue, name: string, dialect: Dialect): VMValue | typeof NOT_FOUND {
    if (object instanceof Vec3) {
        switch (name) {
            case "x": return object.x;
            case "y": return object.y;
            case "z": return object.z;
            case "magnitude": return object.magnitude;
            case "sqrMagnitude": return object.sqrMagnitude;
            case "normalized": return object.normalized();
            default: return NOT_FOUND;
        }
    }
    if (object instanceof VMColor) {
        switch (name) {
            case "r": return object.r;
            case "g": return object.g;
            case "b": return object.b;
            case "a": return object.a;
            case "grayscale": return 0.299 * object.r + 0.587 * object.g + 0.114 * object.b;
            default: return NOT_FOUND;
        }
    }
    if (object instanceof VMQuat) {
        switch (name) {
            case "x": return object.x;
            case "y": return object.y;
            case "z": return object.z;
            case "w": return object.w;
            case "eulerAngles": return eulerFromQuat(object);
            case "normalized": return quatNormalize(object);
            default: return NOT_FOUND;
        }
    }
    if (typeof object === "string") {
        if (name === "Length") return object.length;
        return NOT_FOUND;
    }
    if (object instanceof VMList) {
        if (name === "Count" || name === "Length") return object.items.length;
        if (name === "Capacity") return Math.max(4, object.items.length);
        return NOT_FOUND;
    }
    if (object instanceof VMDict) {
        switch (name) {
            case "Count": return object.map.size;
            case "Keys": return new VMList([...object.map.values()].map((entry) => entry.key), "List");
            case "Values": return new VMList([...object.map.values()].map((entry) => entry.value), "List");
            default: return NOT_FOUND;
        }
    }
    if (object instanceof VMPair) {
        if (name === "Key" || name === "first" || name === "Item1") return object.key;
        if (name === "Value" || name === "second" || name === "Item2") return object.value;
        return NOT_FOUND;
    }
    if (object instanceof VMException) {
        if (name === "Message" || name === "message") return object.message;
        return NOT_FOUND;
    }
    void dialect;
    return NOT_FOUND;
}

export function setBuiltinMember(object: VMValue, name: string, value: VMValue): boolean {
    if (object instanceof Vec3) {
        if (name === "x") { object.x = num(value); return true; }
        if (name === "y") { object.y = num(value); return true; }
        if (name === "z") { object.z = num(value); return true; }
        return false;
    }
    if (object instanceof VMColor) {
        if (name === "r") { object.r = num(value); return true; }
        if (name === "g") { object.g = num(value); return true; }
        if (name === "b") { object.b = num(value); return true; }
        if (name === "a") { object.a = num(value); return true; }
        return false;
    }
    if (object instanceof VMQuat) {
        if (name === "eulerAngles" && value instanceof Vec3) {
            const next = quatFromEuler(value.x, value.y, value.z);
            object.x = next.x; object.y = next.y; object.z = next.z; object.w = next.w;
            return true;
        }
        if (name === "x" || name === "y" || name === "z" || name === "w") {
            object[name] = num(value);
            return true;
        }
        return false;
    }
    if (object instanceof VMPair) {
        if (name === "Value" || name === "second") { object.value = value; return true; }
        if (name === "Key" || name === "first") { object.key = value; return true; }
    }
    return false;
}

function compareValues(a: VMValue, b: VMValue): number {
    if (typeof a === "number" && typeof b === "number") return a - b;
    if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
    if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
    if (a === null || a === undefined) return b === null || b === undefined ? 0 : -1;
    if (b === null || b === undefined) return 1;
    return 0;
}

function callPredicate(interp: Interpreter, fn: VMValue, ...args: VMValue[]): boolean {
    return vmTruthy(interp.invokeCallable(fn, args));
}

function listMethod(list: VMList, name: string, args: VMValue[], refs: Array<VMRef | null>, interp: Interpreter, dialect: Dialect): VMValue | typeof NOT_FOUND {
    const items = list.items;
    const check = (index: number) => {
        if (!Number.isInteger(index) || index < 0 || index >= items.length) vmThrow(`Dizin aralık dışında: ${index} (uzunluk ${items.length}).`, "ArgumentOutOfRangeException");
    };
    const element = (value: VMValue) => (list.elementType ? interp.coerce(copyValue(value), list.elementType) : copyValue(value));
    switch (name) {
        // --- C# List<T> / arrays ---
        case "Add":
            if (list.kind === "HashSet") {
                if (items.some((item) => vmEquals(item, args[0]))) return false;
                items.push(element(args[0]));
                return true;
            }
            if (list.kind === "Array") vmThrow("Diziler sabit boyutludur; List<T> kullanın.", "NotSupportedException");
            items.push(element(args[0]));
            return undefined;
        case "AddRange":
            for (const item of toCollection(args[0])) items.push(element(item));
            return undefined;
        case "Insert":
            if (num(args[0]) < 0 || num(args[0]) > items.length) vmThrow("Ekleme dizini aralık dışında.", "ArgumentOutOfRangeException");
            items.splice(num(args[0]), 0, element(args[1]));
            return undefined;
        case "Remove": {
            const index = items.findIndex((item) => vmEquals(item, args[0]));
            if (index < 0) return false;
            items.splice(index, 1);
            return true;
        }
        case "RemoveAt":
            check(Math.trunc(num(args[0])));
            items.splice(Math.trunc(num(args[0])), 1);
            return undefined;
        case "RemoveRange":
            items.splice(Math.trunc(num(args[0])), Math.trunc(num(args[1])));
            return undefined;
        case "RemoveAll": {
            const before = items.length;
            list.items = items.filter((item) => !callPredicate(interp, args[0], item));
            return before - list.items.length;
        }
        case "Clear":
        case "clear":
            items.length = 0;
            return undefined;
        case "Contains":
            return items.some((item) => vmEquals(item, args[0]));
        case "IndexOf":
            return items.findIndex((item) => vmEquals(item, args[0]));
        case "LastIndexOf": {
            for (let index = items.length - 1; index >= 0; index -= 1) if (vmEquals(items[index], args[0])) return index;
            return -1;
        }
        case "Find":
            return items.find((item) => callPredicate(interp, args[0], item)) ?? null;
        case "FindLast":
            return [...items].reverse().find((item) => callPredicate(interp, args[0], item)) ?? null;
        case "FindIndex":
            return items.findIndex((item) => callPredicate(interp, args[0], item));
        case "FindAll":
        case "Where":
            return new VMList(items.filter((item) => callPredicate(interp, args[0], item)), "List", list.elementType);
        case "Exists":
            return items.some((item) => callPredicate(interp, args[0], item));
        case "TrueForAll":
        case "All":
            return items.every((item) => callPredicate(interp, args[0], item));
        case "Any":
            return args.length ? items.some((item) => callPredicate(interp, args[0], item)) : items.length > 0;
        case "Sort":
            if (args.length && args[0] !== null) items.sort((a, b) => num(interp.invokeCallable(args[0], [a, b]) ?? 0));
            else items.sort(compareValues);
            return undefined;
        case "Reverse":
            if (list.kind === "List" || list.kind === "Array") {
                items.reverse();
                return undefined;
            }
            return new VMList([...items].reverse(), "List", list.elementType);
        case "ToArray":
            return new VMList(items.map(copyValue), "Array", list.elementType);
        case "ToList":
            return new VMList(items.map(copyValue), "List", list.elementType);
        case "GetRange":
            return new VMList(items.slice(num(args[0]), num(args[0]) + num(args[1])), "List", list.elementType);
        case "ForEach":
            for (const item of [...items]) interp.invokeCallable(args[0], [item]);
            return undefined;
        case "Select":
            return new VMList(items.map((item, index) => interp.invokeCallable(args[0], [item, index])), "List");
        case "First":
        case "FirstOrDefault": {
            const found = args.length ? items.find((item) => callPredicate(interp, args[0], item)) : items[0];
            if (found === undefined && name === "First") vmThrow("Dizi boş veya eşleşen öğe yok.", "InvalidOperationException");
            return found ?? null;
        }
        case "Last":
        case "LastOrDefault": {
            const found = args.length ? [...items].reverse().find((item) => callPredicate(interp, args[0], item)) : items[items.length - 1];
            if (found === undefined && name === "Last") vmThrow("Dizi boş veya eşleşen öğe yok.", "InvalidOperationException");
            return found ?? null;
        }
        case "Count":
            return args.length ? items.filter((item) => callPredicate(interp, args[0], item)).length : items.length;
        case "Sum":
            return items.reduce<number>((total, item) => total + num(args.length ? interp.invokeCallable(args[0], [item]) : item), 0);
        case "Average":
            if (!items.length) vmThrow("Boş dizinin ortalaması alınamaz.", "InvalidOperationException");
            return items.reduce<number>((total, item) => total + num(args.length ? interp.invokeCallable(args[0], [item]) : item), 0) / items.length;
        case "Max":
        case "Min": {
            if (!items.length) vmThrow("Boş dizide Max/Min alınamaz.", "InvalidOperationException");
            const values = items.map((item) => num(args.length ? interp.invokeCallable(args[0], [item]) : item));
            return name === "Max" ? Math.max(...values) : Math.min(...values);
        }
        case "OrderBy":
        case "OrderByDescending": {
            const keyed = items.map((item) => ({ item, key: interp.invokeCallable(args[0], [item]) }));
            keyed.sort((a, b) => compareValues(a.key, b.key) * (name === "OrderBy" ? 1 : -1));
            return new VMList(keyed.map((entry) => entry.item), "List", list.elementType);
        }
        case "Distinct": {
            const output: VMValue[] = [];
            for (const item of items) if (!output.some((existing) => vmEquals(existing, item))) output.push(item);
            return new VMList(output, "List", list.elementType);
        }
        case "Take":
            return new VMList(items.slice(0, Math.max(0, num(args[0]))), "List", list.elementType);
        case "Skip":
            return new VMList(items.slice(Math.max(0, num(args[0]))), "List", list.elementType);
        case "Concat":
            return new VMList([...items, ...toCollection(args[0])], "List", list.elementType);
        case "ElementAt":
            check(Math.trunc(num(args[0])));
            return items[Math.trunc(num(args[0]))];
        // --- Queue / Stack ---
        case "Enqueue":
            items.push(element(args[0]));
            return undefined;
        case "Dequeue":
            if (!items.length) vmThrow("Kuyruk boş.", "InvalidOperationException");
            return items.shift();
        case "Push":
            items.push(element(args[0]));
            return undefined;
        case "Pop":
            if (!items.length) vmThrow("Yığın boş.", "InvalidOperationException");
            return items.pop();
        case "Peek":
            if (!items.length) vmThrow("Koleksiyon boş.", "InvalidOperationException");
            return list.kind === "Queue" ? items[0] : items[items.length - 1];
        case "TryDequeue":
        case "TryPop":
        case "TryPeek": {
            if (!items.length) {
                refs[0]?.set(null);
                return false;
            }
            const value = name === "TryDequeue" ? items.shift() : name === "TryPop" ? items.pop() : (list.kind === "Queue" ? items[0] : items[items.length - 1]);
            refs[0]?.set(value ?? null);
            return true;
        }
        // --- C++ std::vector / queue / stack / set ---
        case "push_back":
        case "emplace_back":
            items.push(element(args[0]));
            return undefined;
        case "pop_back":
            if (!items.length) vmThrow("Boş vektörde pop_back çağrıldı.", "out_of_range");
            items.pop();
            return undefined;
        case "push":
        case "emplace":
            items.push(element(args[0]));
            return undefined;
        case "pop":
            if (!items.length) vmThrow("Boş kapta pop çağrıldı.", "out_of_range");
            if (list.kind === "Queue") items.shift();
            else items.pop();
            return undefined;
        case "top":
            if (!items.length) vmThrow("Boş yığında top çağrıldı.", "out_of_range");
            return items[items.length - 1];
        case "front":
            if (!items.length) vmThrow("Boş kapta front çağrıldı.", "out_of_range");
            return items[0];
        case "back":
            if (!items.length) vmThrow("Boş kapta back çağrıldı.", "out_of_range");
            return items[items.length - 1];
        case "size":
        case "length":
            return items.length;
        case "empty":
            return items.length === 0;
        case "at": {
            const index = Math.trunc(num(args[0]));
            if (index < 0 || index >= items.length) vmThrow(`vector::at(${index}) aralık dışında.`, "out_of_range");
            return items[index];
        }
        case "resize": {
            const size = Math.max(0, Math.trunc(num(args[0])));
            if (size > 1_000_000) vmThrow("Boyut çok büyük.");
            while (items.length > size) items.pop();
            while (items.length < size) items.push(args.length > 1 ? copyValue(args[1]) : defaultForTypeName(list.elementType ?? "int", dialect, interp.program));
            return undefined;
        }
        case "reserve":
        case "shrink_to_fit":
            return undefined;
        case "insert":
            if (args[0] instanceof VMIterator) {
                items.splice(args[0].index, 0, element(args[1]));
                return new VMIterator(list, args[0].index);
            }
            if (list.kind === "HashSet") {
                if (items.some((item) => vmEquals(item, args[0]))) return false;
                items.push(element(args[0]));
                return true;
            }
            return NOT_FOUND;
        case "erase":
            if (args[0] instanceof VMIterator) {
                const end = args[1] instanceof VMIterator ? args[1].index : args[0].index + 1;
                items.splice(args[0].index, end - args[0].index);
                return new VMIterator(list, args[0].index);
            }
            {
                const index = items.findIndex((item) => vmEquals(item, args[0]));
                if (index >= 0) items.splice(index, 1);
                return index >= 0 ? 1 : 0;
            }
        case "count":
            return items.filter((item) => vmEquals(item, args[0])).length;
        case "find": {
            const index = items.findIndex((item) => vmEquals(item, args[0]));
            return new VMIterator(list, index < 0 ? items.length : index);
        }
        case "begin":
            return new VMIterator(list, 0);
        case "end":
            return new VMIterator(list, items.length);
        default:
            return NOT_FOUND;
    }
}

function dictMethod(dict: VMDict, name: string, args: VMValue[], refs: Array<VMRef | null>, dialect: Dialect): VMValue | typeof NOT_FOUND {
    switch (name) {
        case "Add":
            if (dict.has(args[0])) vmThrow("Aynı anahtar zaten eklenmiş.", "ArgumentException");
            dict.set(args[0], copyValue(args[1]));
            return undefined;
        case "TryAdd":
            if (dict.has(args[0])) return false;
            dict.set(args[0], copyValue(args[1]));
            return true;
        case "ContainsKey":
            return dict.has(args[0]);
        case "ContainsValue":
            return [...dict.map.values()].some((entry) => vmEquals(entry.value, args[0]));
        case "Remove":
            return dict.delete(args[0]);
        case "TryGetValue": {
            const entry = dict.get(args[0]);
            refs[1]?.set(entry ? entry.value : null);
            return Boolean(entry);
        }
        case "GetValueOrDefault": {
            const entry = dict.get(args[0]);
            return entry ? entry.value : (args[1] ?? null);
        }
        case "Clear":
        case "clear":
            dict.map.clear();
            return undefined;
        case "count":
            return dict.has(args[0]) ? 1 : 0;
        case "contains":
            return dict.has(args[0]);
        case "erase":
            return dict.delete(args[0]) ? 1 : 0;
        case "size":
            return dict.map.size;
        case "empty":
            return dict.map.size === 0;
        case "at": {
            const entry = dict.get(args[0]);
            if (!entry) vmThrow("map::at anahtarı bulunamadı.", "out_of_range");
            return entry!.value;
        }
        case "insert":
        case "emplace": {
            const key = args[0] instanceof VMPair ? args[0].key : args[0] instanceof VMList ? args[0].items[0] : args[0];
            const value = args[0] instanceof VMPair ? args[0].value : args[0] instanceof VMList ? args[0].items[1] : args[1];
            if (!dict.has(key)) dict.set(key, copyValue(value ?? null));
            return undefined;
        }
        default:
            void dialect;
            return NOT_FOUND;
    }
}

function stringMethod(text: string, name: string, args: VMValue[], dialect: Dialect, interp: Interpreter): VMValue | typeof NOT_FOUND {
    const str = (value: VMValue) => (typeof value === "string" ? value : toDisplayString(value, dialect, interp));
    switch (name) {
        case "ToUpper":
        case "ToUpperInvariant":
            return text.toLocaleUpperCase("tr-TR");
        case "ToLower":
        case "ToLowerInvariant":
            return text.toLocaleLowerCase("tr-TR");
        case "Trim":
            return text.trim();
        case "TrimStart":
            return text.trimStart();
        case "TrimEnd":
            return text.trimEnd();
        case "Contains":
            return text.includes(str(args[0]));
        case "StartsWith":
            return text.startsWith(str(args[0]));
        case "EndsWith":
            return text.endsWith(str(args[0]));
        case "IndexOf":
            return text.indexOf(str(args[0]), args.length > 1 ? num(args[1]) : 0);
        case "LastIndexOf":
            return text.lastIndexOf(str(args[0]));
        case "Substring": {
            const start = Math.trunc(num(args[0]));
            if (start < 0 || start > text.length) vmThrow("Substring başlangıcı aralık dışında.", "ArgumentOutOfRangeException");
            if (args.length > 1) {
                const length = Math.trunc(num(args[1]));
                if (length < 0 || start + length > text.length) vmThrow("Substring uzunluğu aralık dışında.", "ArgumentOutOfRangeException");
                return text.substr(start, length);
            }
            return text.slice(start);
        }
        case "Replace":
            return text.split(str(args[0])).join(str(args[1]));
        case "Split": {
            const separator = args.length ? str(args[0]) : " ";
            return new VMList(text.split(separator), "Array", "string");
        }
        case "PadLeft":
            return text.padStart(num(args[0]), args.length > 1 ? str(args[1]) : " ");
        case "PadRight":
            return text.padEnd(num(args[0]), args.length > 1 ? str(args[1]) : " ");
        case "Insert":
            return text.slice(0, num(args[0])) + str(args[1]) + text.slice(num(args[0]));
        case "Remove":
            return args.length > 1 ? text.slice(0, num(args[0])) + text.slice(num(args[0]) + num(args[1])) : text.slice(0, num(args[0]));
        case "Equals":
            return text === args[0];
        case "CompareTo":
            return compareValues(text, args[0]);
        case "ToString":
            return text;
        case "ToCharArray":
            return new VMList([...text], "Array", "string");
        case "GetHashCode": {
            let hash = 0;
            for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) | 0;
            return hash;
        }
        // std::string
        case "size":
        case "length":
            return text.length;
        case "empty":
            return text.length === 0;
        case "substr":
            return text.substr(Math.trunc(num(args[0] ?? 0)), args.length > 1 ? Math.trunc(num(args[1])) : undefined);
        case "find":
            return text.indexOf(str(args[0]), args.length > 1 ? num(args[1]) : 0);
        case "c_str":
        case "str":
            return text;
        case "at":
            return text[Math.trunc(num(args[0]))] ?? vmThrow("string::at aralık dışında.", "out_of_range");
        case "front":
            return text[0] ?? "";
        case "back":
            return text[text.length - 1] ?? "";
        case "compare":
            return compareValues(text, args[0]);
        default:
            return NOT_FOUND;
    }
}

function vectorMethod(v: Vec3, name: string, args: VMValue[]): VMValue | typeof NOT_FOUND {
    switch (name) {
        case "Set":
            v.x = num(args[0] ?? 0);
            v.y = num(args[1] ?? 0);
            if (!v.is2D) v.z = num(args[2] ?? 0);
            return undefined;
        case "Normalize":
        case "normalize": {
            const normalized = v.normalized();
            v.x = normalized.x; v.y = normalized.y; v.z = normalized.z;
            return undefined;
        }
        case "Scale":
            if (args[0] instanceof Vec3) {
                v.x *= args[0].x; v.y *= args[0].y; v.z *= args[0].z;
            }
            return undefined;
        case "ToString":
            if (typeof args[0] === "string") {
                const parts = [v.x, v.y, ...(v.is2D ? [] : [v.z])].map((component) => formatNumber(component, args[0] as string));
                return `(${parts.join(", ")})`;
            }
            return v.toString();
        case "Equals":
            return vmEquals(v, args[0]);
        case "length":
        case "magnitude":
            return v.magnitude;
        case "normalized":
            return v.normalized();
        case "dot":
            return dot(v, vec(args[0]));
        case "cross":
            return cross(v, vec(args[0]));
        default:
            return NOT_FOUND;
    }
}

export function callBuiltinMethod(object: VMValue, name: string, args: VMValue[], refs: Array<VMRef | null>, typeArgs: string[], dialect: Dialect, interp: Interpreter, frame: Frame): VMValue | typeof NOT_FOUND {
    void typeArgs;
    void frame;
    if (typeof object === "number") {
        if (name === "ToString") return typeof args[0] === "string" ? formatNumber(object, args[0]) : toDisplayString(object, dialect, interp);
        if (name === "CompareTo") return compareValues(object, args[0]);
        if (name === "Equals") return vmEquals(object, args[0]);
        if (name === "GetHashCode") return Math.trunc(object);
        return NOT_FOUND;
    }
    if (typeof object === "boolean") {
        if (name === "ToString") return toDisplayString(object, dialect, interp);
        if (name === "Equals") return object === args[0];
        if (name === "CompareTo") return compareValues(object, args[0]);
        return NOT_FOUND;
    }
    if (typeof object === "string") return stringMethod(object, name, args, dialect, interp);
    if (object instanceof Vec3) return vectorMethod(object, name, args);
    if (object instanceof VMColor) {
        if (name === "ToString") return object.toString();
        if (name === "Equals") return vmEquals(object, args[0]);
        return NOT_FOUND;
    }
    if (object instanceof VMQuat) {
        if (name === "ToString") return object.toString();
        if (name === "Equals") return vmEquals(object, args[0]);
        if (name === "Normalize") {
            const normalized = quatNormalize(object);
            object.x = normalized.x; object.y = normalized.y; object.z = normalized.z; object.w = normalized.w;
            return undefined;
        }
        return NOT_FOUND;
    }
    if (object instanceof VMList) return listMethod(object, name, args, refs, interp, dialect);
    if (object instanceof VMDict) return dictMethod(object, name, args, refs, dialect);
    if (object instanceof VMPair) {
        if (name === "ToString") return toDisplayString(object, dialect, interp);
        return NOT_FOUND;
    }
    if (object instanceof VMRandom) {
        if (name === "Next") {
            if (args.length === 0) return Math.floor(object.next() * 2147483647);
            if (args.length === 1) return Math.floor(object.next() * num(args[0]));
            const min = num(args[0]);
            const max = num(args[1]);
            return min + Math.floor(object.next() * (max - min));
        }
        if (name === "NextDouble") return object.next();
        if (name === "Range") return num(args[0]) + object.next() * (num(args[1]) - num(args[0]));
        return NOT_FOUND;
    }
    if (object instanceof VMException) {
        if (name === "ToString") return `${object.exceptionType}: ${object.message}`;
        if (name === "what") return object.message;
        return NOT_FOUND;
    }
    return NOT_FOUND;
}

// ---------------------------------------------------------------------------
// Static namespaces
// ---------------------------------------------------------------------------

function ns(name: string, members: Record<string, () => VMValue>, functions: Record<string, (args: VMValue[], refs: Array<VMRef | null>, typeArgs: string[]) => VMValue>, setters?: Record<string, (value: VMValue) => void>): StaticNamespace {
    return new StaticNamespace(
        name,
        (member) => (member in members ? members[member]() : NOT_FOUND),
        (member, args, typeArgs, refs) => (member in functions ? functions[member](args, refs, typeArgs) : NOT_FOUND),
        setters ? (member, value) => {
            const setter = setters[member];
            if (!setter) return false;
            setter(value);
            return true;
        } : undefined,
    );
}

function nativeFn(name: string, fn: (args: VMValue[]) => VMValue) {
    return new VMNativeFunction(name, fn);
}

export const KEY_CODES = [
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

function currentDeltaTime(interp: Interpreter): number {
    try {
        const time = interp.getGlobal("Time", null, null);
        const value = time instanceof StaticNamespace ? time.getMember("deltaTime") : NOT_FOUND;
        return typeof value === "number" ? value : 1 / 60;
    } catch {
        return 1 / 60;
    }
}

function vectorNamespace(name: "Vector2" | "Vector3", interp: Interpreter): StaticNamespace {
    const is2D = name === "Vector2";
    const make = (x: number, y: number, z = 0) => new Vec3(x, y, is2D ? 0 : z, is2D);
    const members: Record<string, () => VMValue> = {
        zero: () => make(0, 0, 0),
        one: () => make(1, 1, 1),
        up: () => make(0, 1, 0),
        down: () => make(0, -1, 0),
        left: () => make(-1, 0, 0),
        right: () => make(1, 0, 0),
        positiveInfinity: () => make(Infinity, Infinity, Infinity),
        negativeInfinity: () => make(-Infinity, -Infinity, -Infinity),
    };
    if (!is2D) {
        members.forward = () => make(0, 0, 1);
        members.back = () => make(0, 0, -1);
    }
    const lerp = (a: Vec3, b: Vec3, t: number) => make(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
    return ns(name, members, {
        __call: (args) => make(num(args[0] ?? 0), num(args[1] ?? 0), num(args[2] ?? 0)),
        Distance: (args) => {
            const a = vec(args[0]);
            const b = vec(args[1]);
            return Math.hypot(a.x - b.x, a.y - b.y, is2D ? 0 : a.z - b.z);
        },
        Dot: (args) => dot(vec(args[0]), vec(args[1])),
        Cross: (args) => cross(vec(args[0]), vec(args[1])),
        Lerp: (args) => lerp(vec(args[0]), vec(args[1]), clamp(num(args[2]), 0, 1)),
        LerpUnclamped: (args) => lerp(vec(args[0]), vec(args[1]), num(args[2])),
        Slerp: (args) => lerp(vec(args[0]), vec(args[1]), clamp(num(args[2]), 0, 1)),
        MoveTowards: (args) => {
            const current = vec(args[0]);
            const target = vec(args[1]);
            const maxDelta = num(args[2]);
            const delta = make(target.x - current.x, target.y - current.y, target.z - current.z);
            const distance = delta.magnitude;
            if (distance <= maxDelta || distance < 1e-9) return target.clone();
            return make(current.x + delta.x / distance * maxDelta, current.y + delta.y / distance * maxDelta, current.z + delta.z / distance * maxDelta);
        },
        Normalize: (args) => vec(args[0]).normalized(),
        Magnitude: (args) => vec(args[0]).magnitude,
        SqrMagnitude: (args) => vec(args[0]).sqrMagnitude,
        Angle: (args) => {
            const a = vec(args[0]);
            const b = vec(args[1]);
            const denominator = Math.sqrt(a.sqrMagnitude * b.sqrMagnitude);
            if (denominator < 1e-15) return 0;
            return Math.acos(clamp(dot(a, b) / denominator, -1, 1)) * RAD2DEG;
        },
        SignedAngle: (args) => {
            const a = vec(args[0]);
            const b = vec(args[1]);
            const denominator = Math.sqrt(a.sqrMagnitude * b.sqrMagnitude);
            if (denominator < 1e-15) return 0;
            const angle = Math.acos(clamp(dot(a, b) / denominator, -1, 1)) * RAD2DEG;
            if (is2D) return a.x * b.y - a.y * b.x >= 0 ? angle : -angle;
            const axis = vec(args[2] ?? new Vec3(0, 1, 0));
            return dot(axis, cross(a, b)) >= 0 ? angle : -angle;
        },
        ClampMagnitude: (args) => {
            const v = vec(args[0]);
            const max = num(args[1]);
            if (v.magnitude <= max) return v.clone();
            const direction = v.normalized();
            return make(direction.x * max, direction.y * max, direction.z * max);
        },
        Scale: (args) => {
            const a = vec(args[0]);
            const b = vec(args[1]);
            return make(a.x * b.x, a.y * b.y, a.z * b.z);
        },
        Reflect: (args) => {
            const direction = vec(args[0]);
            const normal = vec(args[1]);
            const factor = -2 * dot(normal, direction);
            return make(factor * normal.x + direction.x, factor * normal.y + direction.y, factor * normal.z + direction.z);
        },
        Project: (args) => {
            const v = vec(args[0]);
            const normal = vec(args[1]);
            const sqr = normal.sqrMagnitude;
            if (sqr < 1e-15) return make(0, 0, 0);
            const scale = dot(v, normal) / sqr;
            return make(normal.x * scale, normal.y * scale, normal.z * scale);
        },
        ProjectOnPlane: (args) => {
            const v = vec(args[0]);
            const normal = vec(args[1]);
            const sqr = normal.sqrMagnitude;
            if (sqr < 1e-15) return v.clone();
            const scale = dot(v, normal) / sqr;
            return make(v.x - normal.x * scale, v.y - normal.y * scale, v.z - normal.z * scale);
        },
        Max: (args) => {
            const a = vec(args[0]);
            const b = vec(args[1]);
            return make(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z));
        },
        Min: (args) => {
            const a = vec(args[0]);
            const b = vec(args[1]);
            return make(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z));
        },
        Perpendicular: (args) => {
            const v = vec(args[0]);
            return make(-v.y, v.x, 0);
        },
        SmoothDamp: (args, refs) => {
            const current = vec(args[0]);
            const target = vec(args[1]);
            const velocityRef = refs[2];
            const velocity = velocityRef ? vec(velocityRef.get()) : make(0, 0, 0);
            const smoothTime = Math.max(0.0001, num(args[3]));
            const maxSpeed = args.length > 4 ? num(args[4]) : Infinity;
            const deltaTime = args.length > 5 ? num(args[5]) : currentDeltaTime(interp);
            const omega = 2 / smoothTime;
            const x = omega * deltaTime;
            const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
            let change = make(current.x - target.x, current.y - target.y, current.z - target.z);
            const maxChange = maxSpeed * smoothTime;
            if (change.magnitude > maxChange) {
                const normalized = change.normalized();
                change = make(normalized.x * maxChange, normalized.y * maxChange, normalized.z * maxChange);
            }
            const adjusted = make(current.x - change.x, current.y - change.y, current.z - change.z);
            const temp = make((velocity.x + omega * change.x) * deltaTime, (velocity.y + omega * change.y) * deltaTime, (velocity.z + omega * change.z) * deltaTime);
            const nextVelocity = make((velocity.x - omega * temp.x) * exp, (velocity.y - omega * temp.y) * exp, (velocity.z - omega * temp.z) * exp);
            let output = make(adjusted.x + (change.x + temp.x) * exp, adjusted.y + (change.y + temp.y) * exp, adjusted.z + (change.z + temp.z) * exp);
            const origMinusCurrent = make(target.x - current.x, target.y - current.y, target.z - current.z);
            const outMinusOrig = make(output.x - target.x, output.y - target.y, output.z - target.z);
            if (dot(origMinusCurrent, outMinusOrig) > 0) {
                output = target.clone();
                velocityRef?.set(make(0, 0, 0));
            } else {
                velocityRef?.set(nextVelocity);
            }
            return output;
        },
    });
}

function mathNamespace(name: string, interp: Interpreter): StaticNamespace {
    const isUnity = name === "Mathf";
    const moveTowards = (current: number, target: number, maxDelta: number) => (Math.abs(target - current) <= maxDelta ? target : current + Math.sign(target - current) * maxDelta);
    const deltaAngle = (current: number, target: number) => {
        let delta = (target - current) % 360;
        if (delta < 0) delta += 360;
        if (delta > 180) delta -= 360;
        return delta;
    };
    return ns(name, {
        PI: () => Math.PI,
        E: () => Math.E,
        Infinity: () => Infinity,
        NegativeInfinity: () => -Infinity,
        Epsilon: () => (isUnity ? 1.401298e-45 : Number.EPSILON),
        Deg2Rad: () => DEG2RAD,
        Rad2Deg: () => RAD2DEG,
    }, {
        Abs: (args) => Math.abs(num(args[0])),
        Sign: (args) => (isUnity ? (num(args[0]) >= 0 ? 1 : -1) : Math.sign(num(args[0]))),
        Min: (args) => {
            const values = args.length === 1 && args[0] instanceof VMList ? args[0].items.map((value) => num(value)) : args.map((value) => num(value));
            return Math.min(...values);
        },
        Max: (args) => {
            const values = args.length === 1 && args[0] instanceof VMList ? args[0].items.map((value) => num(value)) : args.map((value) => num(value));
            return Math.max(...values);
        },
        Clamp: (args) => clamp(num(args[0]), num(args[1]), num(args[2])),
        Clamp01: (args) => clamp(num(args[0]), 0, 1),
        Lerp: (args) => num(args[0]) + (num(args[1]) - num(args[0])) * clamp(num(args[2]), 0, 1),
        LerpUnclamped: (args) => num(args[0]) + (num(args[1]) - num(args[0])) * num(args[2]),
        LerpAngle: (args) => num(args[0]) + deltaAngle(num(args[0]), num(args[1])) * clamp(num(args[2]), 0, 1),
        InverseLerp: (args) => {
            const a = num(args[0]);
            const b = num(args[1]);
            return a === b ? 0 : clamp((num(args[2]) - a) / (b - a), 0, 1);
        },
        MoveTowards: (args) => moveTowards(num(args[0]), num(args[1]), num(args[2])),
        MoveTowardsAngle: (args) => {
            const current = num(args[0]);
            const delta = deltaAngle(current, num(args[1]));
            return Math.abs(delta) <= num(args[2]) ? current + delta : current + Math.sign(delta) * num(args[2]);
        },
        DeltaAngle: (args) => deltaAngle(num(args[0]), num(args[1])),
        SmoothStep: (args) => {
            const t = clamp(num(args[2]), 0, 1);
            const eased = -2 * t * t * t + 3 * t * t;
            return num(args[0]) * (1 - eased) + num(args[1]) * eased;
        },
        SmoothDamp: (args, refs) => {
            const current = num(args[0]);
            const target = num(args[1]);
            const velocityRef = refs[2];
            const velocity = velocityRef ? num(velocityRef.get()) : 0;
            const smoothTime = Math.max(0.0001, num(args[3]));
            const maxSpeed = args.length > 4 ? num(args[4]) : Infinity;
            const deltaTime = args.length > 5 ? num(args[5]) : currentDeltaTime(interp);
            const omega = 2 / smoothTime;
            const x = omega * deltaTime;
            const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
            let change = current - target;
            const maxChange = maxSpeed * smoothTime;
            change = clamp(change, -maxChange, maxChange);
            const temp = (velocity + omega * change) * deltaTime;
            let nextVelocity = (velocity - omega * temp) * exp;
            let output = current - change + (change + temp) * exp;
            if ((target - current > 0) === (output > target)) {
                output = target;
                nextVelocity = 0;
            }
            velocityRef?.set(nextVelocity);
            return output;
        },
        Repeat: (args) => {
            const t = num(args[0]);
            const length = num(args[1]);
            return clamp(t - Math.floor(t / length) * length, 0, length);
        },
        PingPong: (args) => {
            const length = num(args[1]);
            let t = num(args[0]) % (length * 2);
            if (t < 0) t += length * 2;
            return length - Math.abs(t - length);
        },
        Approximately: (args) => Math.abs(num(args[1]) - num(args[0])) < Math.max(1e-6 * Math.max(Math.abs(num(args[0])), Math.abs(num(args[1]))), 1e-12),
        Sqrt: (args) => Math.sqrt(num(args[0])),
        Pow: (args) => Math.pow(num(args[0]), num(args[1])),
        Exp: (args) => Math.exp(num(args[0])),
        Log: (args) => (args.length > 1 ? Math.log(num(args[0])) / Math.log(num(args[1])) : Math.log(num(args[0]))),
        Log10: (args) => Math.log10(num(args[0])),
        Sin: (args) => Math.sin(num(args[0])),
        Cos: (args) => Math.cos(num(args[0])),
        Tan: (args) => Math.tan(num(args[0])),
        Asin: (args) => Math.asin(num(args[0])),
        Acos: (args) => Math.acos(num(args[0])),
        Atan: (args) => Math.atan(num(args[0])),
        Atan2: (args) => Math.atan2(num(args[0]), num(args[1])),
        Floor: (args) => Math.floor(num(args[0])),
        Ceil: (args) => Math.ceil(num(args[0])),
        Ceiling: (args) => Math.ceil(num(args[0])),
        Round: (args) => {
            if (args.length > 1) {
                const factor = 10 ** Math.trunc(num(args[1]));
                return roundHalfEven(num(args[0]) * factor) / factor;
            }
            return roundHalfEven(num(args[0]));
        },
        Truncate: (args) => Math.trunc(num(args[0])),
        FloorToInt: (args) => Math.floor(num(args[0])),
        CeilToInt: (args) => Math.ceil(num(args[0])),
        RoundToInt: (args) => roundHalfEven(num(args[0])),
        PerlinNoise: (args) => perlin(num(args[0]), num(args[1] ?? 0)),
        IsPowerOfTwo: (args) => {
            const value = Math.trunc(num(args[0]));
            return value > 0 && (value & (value - 1)) === 0;
        },
        NextPowerOfTwo: (args) => 2 ** Math.ceil(Math.log2(Math.max(1, num(args[0])))),
        ClosestPowerOfTwo: (args) => 2 ** Math.round(Math.log2(Math.max(1, num(args[0])))),
        GammaToLinearSpace: (args) => Math.pow(num(args[0]), 2.2),
        LinearToGammaSpace: (args) => Math.pow(num(args[0]), 1 / 2.2),
        Cbrt: (args) => Math.cbrt(num(args[0])),
        Hypot: (args) => Math.hypot(...args.map((value) => num(value))),
    });
}

export function createStdlib(interp: Interpreter): Map<string, VMValue> {
    const lib = new Map<string, VMValue>();
    let seeded: VMRandom | null = null;
    const random = () => (seeded ? seeded.next() : Math.random());

    lib.set("Mathf", mathNamespace("Mathf", interp));
    lib.set("Math", mathNamespace("Math", interp));
    lib.set("MathF", mathNamespace("MathF", interp));
    lib.set("Vector3", vectorNamespace("Vector3", interp));
    lib.set("Vector3Int", vectorNamespace("Vector3", interp));
    lib.set("Vector4", vectorNamespace("Vector3", interp));
    lib.set("Vector2", vectorNamespace("Vector2", interp));
    lib.set("Vector2Int", vectorNamespace("Vector2", interp));

    lib.set("Random", ns("Random", {
        value: () => random(),
        insideUnitCircle: () => {
            const angle = random() * Math.PI * 2;
            const radius = Math.sqrt(random());
            return new Vec3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0, true);
        },
        insideUnitSphere: () => {
            const u = random(), v = random();
            const theta = u * Math.PI * 2;
            const phi = Math.acos(2 * v - 1);
            const r = Math.cbrt(random());
            return new Vec3(r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi));
        },
        onUnitSphere: () => {
            const u = random(), v = random();
            const theta = u * Math.PI * 2;
            const phi = Math.acos(2 * v - 1);
            return new Vec3(Math.sin(phi) * Math.cos(theta), Math.sin(phi) * Math.sin(theta), Math.cos(phi));
        },
        rotation: () => quatFromEuler(random() * 360, random() * 360, random() * 360),
    }, {
        Range: (args) => {
            const min = num(args[0]);
            const max = num(args[1]);
            const ints = interp.callArgTypes.length >= 2 && interp.callArgTypes[0] === "int" && interp.callArgTypes[1] === "int";
            if (ints) return max <= min ? min : min + Math.floor(random() * (max - min));
            return min + random() * (max - min);
        },
        InitState: (args) => {
            seeded = new VMRandom(Math.trunc(num(args[0])));
            return undefined;
        },
        ColorHSV: (args) => {
            const h = args.length >= 2 ? num(args[0]) + random() * (num(args[1]) - num(args[0])) : random();
            const s = args.length >= 4 ? num(args[2]) + random() * (num(args[3]) - num(args[2])) : 1;
            const v = args.length >= 6 ? num(args[4]) + random() * (num(args[5]) - num(args[4])) : 1;
            return hsvToRgb(h, s, v);
        },
    }));

    const colorPresets: Record<string, [number, number, number, number]> = {
        red: [1, 0, 0, 1], green: [0, 1, 0, 1], blue: [0, 0, 1, 1], white: [1, 1, 1, 1], black: [0, 0, 0, 1],
        yellow: [1, 0.92, 0.016, 1], cyan: [0, 1, 1, 1], magenta: [1, 0, 1, 1], gray: [0.5, 0.5, 0.5, 1], grey: [0.5, 0.5, 0.5, 1], clear: [0, 0, 0, 0],
        orange: [1, 0.55, 0, 1], purple: [0.6, 0.2, 1, 1],
    };
    lib.set("Color", ns("Color", Object.fromEntries(Object.entries(colorPresets).map(([key, value]) => [key, () => new VMColor(...value)])), {
        __call: (args) => new VMColor(num(args[0] ?? 0), num(args[1] ?? 0), num(args[2] ?? 0), args.length > 3 ? num(args[3]) : 1),
        Lerp: (args) => {
            const a = col(args[0]);
            const b = col(args[1]);
            const t = clamp(num(args[2]), 0, 1);
            return new VMColor(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t, a.a + (b.a - a.a) * t);
        },
        HSVToRGB: (args) => hsvToRgb(num(args[0]), num(args[1]), num(args[2])),
        FromHex: (args) => VMColor.fromHex(String(args[0] ?? "#ffffff")),
    }));
    lib.set("Color32", lib.get("Color")!);

    lib.set("Quaternion", ns("Quaternion", { identity: () => new VMQuat(0, 0, 0, 1) }, {
        __call: (args) => new VMQuat(num(args[0] ?? 0), num(args[1] ?? 0), num(args[2] ?? 0), args.length > 3 ? num(args[3]) : 1),
        Euler: (args) => (args[0] instanceof Vec3 ? quatFromEuler(args[0].x, args[0].y, args[0].z) : quatFromEuler(num(args[0]), num(args[1]), num(args[2]))),
        AngleAxis: (args) => quatAngleAxis(num(args[0]), vec(args[1])),
        LookRotation: (args) => quatLookRotation(vec(args[0]), args[1] instanceof Vec3 ? args[1] : undefined),
        Lerp: (args) => quatSlerp(quat(args[0]), quat(args[1]), num(args[2])),
        Slerp: (args) => quatSlerp(quat(args[0]), quat(args[1]), num(args[2])),
        RotateTowards: (args) => {
            const from = quat(args[0]);
            const to = quat(args[1]);
            const angle = quatAngle(from, to);
            if (angle < 1e-6) return to.clone();
            return quatSlerp(from, to, Math.min(1, num(args[2]) / angle));
        },
        Inverse: (args) => {
            const q = quat(args[0]);
            return new VMQuat(-q.x, -q.y, -q.z, q.w);
        },
        Angle: (args) => quatAngle(quat(args[0]), quat(args[1])),
        FromToRotation: (args) => {
            const from = vec(args[0]).normalized();
            const to = vec(args[1]).normalized();
            const axis = cross(from, to);
            const angle = Math.acos(clamp(dot(from, to), -1, 1)) * RAD2DEG;
            if (axis.sqrMagnitude < 1e-12) return angle > 90 ? quatAngleAxis(180, new Vec3(0, 1, 0)) : new VMQuat();
            return quatAngleAxis(angle, axis);
        },
        Dot: (args) => {
            const a = quat(args[0]);
            const b = quat(args[1]);
            return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
        },
    }));

    const enumLike = (name: string, values: readonly string[]) => ns(name, Object.fromEntries(values.map((value) => [value, () => value])), {});
    lib.set("KeyCode", new StaticNamespace("KeyCode", (member) => (KEY_CODE_SET.has(member) ? member : NOT_FOUND), () => NOT_FOUND));
    lib.set("ForceMode", enumLike("ForceMode", ["Force", "Impulse", "Acceleration", "VelocityChange"]));
    lib.set("ForceMode2D", enumLike("ForceMode2D", ["Force", "Impulse"]));
    lib.set("Space", enumLike("Space", ["World", "Self"]));

    const parseNumber = (text: VMValue, integer: boolean) => {
        const value = typeof text === "string" ? Number(text.trim().replace(",", ".")) : NaN;
        if (typeof text !== "string" || text.trim() === "" || !Number.isFinite(value) || (integer && !Number.isInteger(value))) {
            vmThrow(`'${toDisplayString(text, "csharp", interp)}' sayıya dönüştürülemedi.`, "FormatException");
        }
        return value;
    };
    const tryParse = (integer: boolean) => (args: VMValue[], refs: Array<VMRef | null>) => {
        try {
            refs[1]?.set(parseNumber(args[0], integer));
            return true;
        } catch {
            refs[1]?.set(0);
            return false;
        }
    };
    const intNamespace = ns("int", { MaxValue: () => 2147483647, MinValue: () => -2147483648 }, {
        Parse: (args) => parseNumber(args[0], true),
        TryParse: tryParse(true),
    });
    for (const alias of ["int", "Int32", "long", "short", "byte"]) lib.set(alias, intNamespace);
    const floatNamespace = ns("float", {
        MaxValue: () => 3.4028235e38,
        MinValue: () => -3.4028235e38,
        Epsilon: () => 1.401298e-45,
        PositiveInfinity: () => Infinity,
        NegativeInfinity: () => -Infinity,
        NaN: () => NaN,
    }, {
        Parse: (args) => parseNumber(args[0], false),
        TryParse: tryParse(false),
        IsNaN: (args) => Number.isNaN(num(args[0])),
        IsInfinity: (args) => !Number.isFinite(num(args[0])) && !Number.isNaN(num(args[0])),
    });
    for (const alias of ["float", "Single", "double", "Double"]) lib.set(alias, floatNamespace);
    lib.set("bool", ns("bool", { TrueString: () => "True", FalseString: () => "False" }, {
        Parse: (args) => {
            const text = String(args[0]).trim().toLowerCase();
            if (text !== "true" && text !== "false") vmThrow(`'${args[0]}' bool değerine dönüştürülemedi.`, "FormatException");
            return text === "true";
        },
    }));
    const stringNamespace = ns("string", { Empty: () => "" }, {
        IsNullOrEmpty: (args) => args[0] === null || args[0] === undefined || args[0] === "",
        IsNullOrWhiteSpace: (args) => args[0] === null || args[0] === undefined || (typeof args[0] === "string" && args[0].trim() === ""),
        Format: (args) => compositeFormat(String(args[0] ?? ""), args[1] instanceof VMList && args.length === 2 && args[1].kind === "Array" ? args[1].items : args.slice(1), "csharp", interp),
        Join: (args) => {
            const items = args.length === 2 && (args[1] instanceof VMList) ? args[1].items : args.slice(1);
            return items.map((item) => toDisplayString(item, "csharp", interp)).join(toDisplayString(args[0], "csharp", interp));
        },
        Concat: (args) => args.map((item) => toDisplayString(item, "csharp", interp)).join(""),
        Equals: (args) => args[0] === args[1],
        Compare: (args) => compareValues(args[0], args[1]),
    });
    lib.set("string", stringNamespace);
    lib.set("String", stringNamespace);
    lib.set("Convert", ns("Convert", {}, {
        ToInt32: (args) => (typeof args[0] === "string" ? parseNumber(args[0], true) : roundHalfEven(num(args[0]))),
        ToInt64: (args) => (typeof args[0] === "string" ? parseNumber(args[0], true) : roundHalfEven(num(args[0]))),
        ToSingle: (args) => (typeof args[0] === "string" ? parseNumber(args[0], false) : num(args[0])),
        ToDouble: (args) => (typeof args[0] === "string" ? parseNumber(args[0], false) : num(args[0])),
        ToString: (args) => toDisplayString(args[0], "csharp", interp),
        ToBoolean: (args) => vmTruthy(args[0]),
    }));
    lib.set("Console", ns("Console", {}, {
        WriteLine: (args) => {
            interp.host.log("info", args.length > 1 && typeof args[0] === "string" ? compositeFormat(args[0], args.slice(1), "csharp", interp) : toDisplayString(args[0] ?? "", "csharp", interp));
            return undefined;
        },
        Write: (args) => {
            interp.host.log("info", toDisplayString(args[0] ?? "", "csharp", interp));
            return undefined;
        },
    }));
    lib.set("Array", ns("Array", {}, {
        IndexOf: (args) => (args[0] instanceof VMList ? args[0].items.findIndex((item) => vmEquals(item, args[1])) : -1),
        Sort: (args) => {
            if (args[0] instanceof VMList) args[0].items.sort(compareValues);
            return undefined;
        },
        Reverse: (args) => {
            if (args[0] instanceof VMList) args[0].items.reverse();
            return undefined;
        },
        Clear: (args) => {
            if (args[0] instanceof VMList) args[0].items.fill(0);
            return undefined;
        },
    }));
    lib.set("Enumerable", ns("Enumerable", {}, {
        Range: (args) => new VMList(Array.from({ length: Math.max(0, Math.min(1_000_000, num(args[1]))) }, (_, index) => num(args[0]) + index), "List", "int"),
        Repeat: (args) => new VMList(Array.from({ length: Math.max(0, Math.min(1_000_000, num(args[1]))) }, () => copyValue(args[0])), "List"),
    }));

    // ---- C / C++ ----
    let cRandState = 1;
    const cRand = () => {
        cRandState = (cRandState * 1103515245 + 12345) & 0x7fffffff;
        return (cRandState >> 16) & 0x7fff;
    };
    cRandState = Math.floor(Math.random() * 0x7fffffff) || 1;
    const math1 = (fn: (value: number) => number) => (args: VMValue[]) => fn(num(args[0]));
    const cFunctions: Record<string, (args: VMValue[]) => VMValue> = {
        sin: math1(Math.sin), cos: math1(Math.cos), tan: math1(Math.tan), asin: math1(Math.asin), acos: math1(Math.acos), atan: math1(Math.atan),
        sqrt: math1(Math.sqrt), exp: math1(Math.exp), log: math1(Math.log), log10: math1(Math.log10), log2: math1(Math.log2), cbrt: math1(Math.cbrt),
        floor: math1(Math.floor), ceil: math1(Math.ceil), round: math1((value) => (value < 0 ? -Math.round(-value) : Math.round(value))), trunc: math1(Math.trunc),
        abs: math1(Math.abs), fabs: math1(Math.abs),
        sinf: math1(Math.sin), cosf: math1(Math.cos), tanf: math1(Math.tan), sqrtf: math1(Math.sqrt), fabsf: math1(Math.abs), floorf: math1(Math.floor),
        ceilf: math1(Math.ceil), roundf: math1((value) => (value < 0 ? -Math.round(-value) : Math.round(value))), truncf: math1(Math.trunc),
        atan2: (args) => Math.atan2(num(args[0]), num(args[1])), atan2f: (args) => Math.atan2(num(args[0]), num(args[1])),
        pow: (args) => Math.pow(num(args[0]), num(args[1])), powf: (args) => Math.pow(num(args[0]), num(args[1])),
        fmod: (args) => num(args[0]) % num(args[1]), fmodf: (args) => num(args[0]) % num(args[1]),
        fmin: (args) => Math.min(num(args[0]), num(args[1])), fmax: (args) => Math.max(num(args[0]), num(args[1])),
        fminf: (args) => Math.min(num(args[0]), num(args[1])), fmaxf: (args) => Math.max(num(args[0]), num(args[1])),
        hypot: (args) => Math.hypot(num(args[0]), num(args[1])),
        rand: () => cRand(),
        srand: (args) => {
            cRandState = Math.trunc(num(args[0])) || 1;
            return undefined;
        },
        time: () => Math.floor(Date.now() / 1000),
        printf: (args) => {
            const text = printfFormat(String(args[0] ?? ""), args.slice(1), interp);
            for (const line of text.replace(/\n$/, "").split("\n")) interp.host.log("info", line);
            return text.length;
        },
        puts: (args) => {
            interp.host.log("info", toDisplayString(args[0] ?? "", "cpp", interp));
            return 0;
        },
    };
    for (const [key, fn] of Object.entries(cFunctions)) lib.set(key, nativeFn(key, fn));
    lib.set("RAND_MAX", 32767);
    lib.set("M_PI", Math.PI);
    lib.set("M_PI_2", Math.PI / 2);
    lib.set("M_PI_4", Math.PI / 4);
    lib.set("M_E", Math.E);
    lib.set("INFINITY", Infinity);
    lib.set("NAN", NaN);

    const cout = new CoutStream("info");
    const cerr = new CoutStream("error");
    const endl = new EndlToken();
    lib.set("cout", cout);
    lib.set("cerr", cerr);
    lib.set("endl", endl);
    const iteratorRange = (args: VMValue[]) => {
        const begin = args[0];
        const end = args[1];
        if (!(begin instanceof VMIterator) || !(end instanceof VMIterator) || begin.list !== end.list) vmThrow("Geçerli bir [begin, end) aralığı bekleniyordu.", "ArgumentException");
        return { list: (begin as VMIterator).list, start: (begin as VMIterator).index, stop: (end as VMIterator).index };
    };
    lib.set("std", ns("std", {
        cout: () => cout,
        cerr: () => cerr,
        endl: () => endl,
        string: () => stringNamespace,
        npos: () => -1,
    }, {
        ...Object.fromEntries(Object.entries(cFunctions).map(([key, fn]) => [key, (args: VMValue[]) => fn(args)])),
        to_string: (args) => (typeof args[0] === "number" && !Number.isInteger(args[0]) ? args[0].toFixed(6) : toDisplayString(args[0], "cpp", interp)),
        stoi: (args) => parseNumber(String(args[0]).trim().replace(/[^\d-].*$/, "") || "x", true),
        stol: (args) => parseNumber(String(args[0]).trim().replace(/[^\d-].*$/, "") || "x", true),
        stof: (args) => parseNumber(args[0], false),
        stod: (args) => parseNumber(args[0], false),
        min: (args) => (args[0] instanceof VMList ? Math.min(...args[0].items.map((value) => num(value))) : (compareValues(args[1], args[0]) < 0 ? args[1] : args[0])),
        max: (args) => (args[0] instanceof VMList ? Math.max(...args[0].items.map((value) => num(value))) : (compareValues(args[0], args[1]) < 0 ? args[1] : args[0])),
        clamp: (args) => clamp(num(args[0]), num(args[1]), num(args[2])),
        make_pair: (args) => new VMPair(copyValue(args[0] ?? null), copyValue(args[1] ?? null)),
        sort: (args) => {
            const { list, start, stop } = iteratorRange(args);
            const slice = list.items.slice(start, stop);
            if (args[2]) slice.sort((a, b) => (vmTruthy(interp.invokeCallable(args[2], [a, b])) ? -1 : vmTruthy(interp.invokeCallable(args[2], [b, a])) ? 1 : 0));
            else slice.sort(compareValues);
            list.items.splice(start, slice.length, ...slice);
            return undefined;
        },
        reverse: (args) => {
            const { list, start, stop } = iteratorRange(args);
            const slice = list.items.slice(start, stop).reverse();
            list.items.splice(start, slice.length, ...slice);
            return undefined;
        },
        find: (args) => {
            const { list, start, stop } = iteratorRange(args);
            for (let index = start; index < stop; index += 1) if (vmEquals(list.items[index], args[2])) return new VMIterator(list, index);
            return new VMIterator(list, stop);
        },
        count: (args) => {
            const { list, start, stop } = iteratorRange(args);
            return list.items.slice(start, stop).filter((item) => vmEquals(item, args[2])).length;
        },
        accumulate: (args) => {
            const { list, start, stop } = iteratorRange(args);
            return list.items.slice(start, stop).reduce<number>((total, item) => total + num(item), num(args[2] ?? 0));
        },
        min_element: (args) => {
            const { list, start, stop } = iteratorRange(args);
            let best = start;
            for (let index = start + 1; index < stop; index += 1) if (compareValues(list.items[index], list.items[best]) < 0) best = index;
            return new VMIterator(list, best);
        },
        max_element: (args) => {
            const { list, start, stop } = iteratorRange(args);
            let best = start;
            for (let index = start + 1; index < stop; index += 1) if (compareValues(list.items[index], list.items[best]) > 0) best = index;
            return new VMIterator(list, best);
        },
        distance: (args) => (args[0] instanceof VMIterator && args[1] instanceof VMIterator ? args[1].index - args[0].index : 0),
        swap: () => vmThrow("std::swap desteklenmiyor; geçici değişken kullanın.", "NotSupportedException"),
    }));
    lib.set("print", nativeFn("print", (args) => {
        interp.host.log("info", args[0] === null || args[0] === undefined ? "Null" : toDisplayString(args[0], "csharp", interp));
        return undefined;
    }));
    return lib;
}

export function hsvToRgb(h: number, s: number, v: number): VMColor {
    const hue = ((h % 1) + 1) % 1;
    const i = Math.floor(hue * 6);
    const f = hue * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
    return new VMColor(r, g, b, 1);
}

export { rotateByQuat, quatMul, quatNormalize, quatSlerp, perlin };
