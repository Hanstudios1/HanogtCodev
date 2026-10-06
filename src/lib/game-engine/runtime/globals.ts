/** Engine namespaces visible to scripts (Debug, Time, Input, Physics, SceneManager, Tween, Timer…). */
import { compositeFormat } from "../script/stdlib";
import { NOT_FOUND, StaticNamespace, VMBoundMethod, VMColor, VMLambda, VMList, VMNativeFunction, VMRef, Vec3, type VMValue } from "../script/values";
import { EASINGS, ENGINE_VERSION, ENGINE_VERSION_LABEL, type Vector3 } from "../types";
import { languageName } from "../localization";
import { animatorHash } from "./animator-controller";
import type { RuntimeEntity } from "./entity";
import { PrefabHandle, RayHandle, RaycastHitHandle, TouchHandle, colorToVM, hostError, isVector, liveEntityOf, toBool, toColor, toNumber, toVector, typeNameFrom, vec } from "./handles";
import { scaleTarget, TimerHandle, TweenHandle, type TweenKind } from "./tweens";
import type { RuntimeWorld } from "./world";

type Getter = () => VMValue;
type Fn = (args: VMValue[], refs: Array<VMRef | null>, typeArgs: string[]) => VMValue;

const own = (record: object, key: string) => Object.prototype.hasOwnProperty.call(record, key);

function ns(name: string, members: Record<string, Getter>, functions: Record<string, Fn>, setters: Record<string, (value: VMValue) => void> = {}) {
    // Own properties only, so names like "constructor" or "toString" are not members.
    return new StaticNamespace(
        name,
        (member) => (own(members, member) ? members[member]() : NOT_FOUND),
        (member, args, typeArgs, refs) => (own(functions, member) ? functions[member](args, refs, typeArgs) : NOT_FOUND),
        (member, value) => {
            const setter = own(setters, member) ? setters[member] : undefined;
            if (!setter) return false;
            setter(value);
            return true;
        },
    );
}

function enumNamespace(name: string, values: readonly string[]) {
    return ns(name, Object.fromEntries(values.map((value) => [value, () => value])), {});
}

/** Unity's SystemLanguage names by language code. */
const SYSTEM_LANGUAGES: Record<string, string> = {
    af: "Afrikaans", ar: "Arabic", eu: "Basque", be: "Belarusian", bg: "Bulgarian", ca: "Catalan", cs: "Czech", da: "Danish",
    nl: "Dutch", en: "English", et: "Estonian", fo: "Faroese", fi: "Finnish", fr: "French", de: "German", el: "Greek",
    he: "Hebrew", hi: "Hindi", hu: "Hungarian", is: "Icelandic", id: "Indonesian", it: "Italian", ja: "Japanese", ko: "Korean",
    lv: "Latvian", lt: "Lithuanian", nb: "Norwegian", nn: "Norwegian", no: "Norwegian", pl: "Polish", pt: "Portuguese",
    ro: "Romanian", ru: "Russian", sr: "SerboCroatian", hr: "SerboCroatian", bs: "SerboCroatian", sk: "Slovak", sl: "Slovenian",
    es: "Spanish", sv: "Swedish", th: "Thai", tr: "Turkish", uk: "Ukrainian", vi: "Vietnamese",
};
const SYSTEM_LANGUAGE_NAMES = [...new Set([...Object.values(SYSTEM_LANGUAGES), "Chinese", "ChineseSimplified", "ChineseTraditional", "Unknown"])];

/** Application.systemLanguage for a locale such as "de-DE" or "zh-TW". */
export function systemLanguageOf(locale: string | null): string {
    const parts = (locale ?? "").toLowerCase().replace(/_/g, "-").split("-");
    if (parts[0] === "zh") return parts.some((part) => part === "hant" || part === "tw" || part === "hk" || part === "mo") ? "ChineseTraditional" : "ChineseSimplified";
    return SYSTEM_LANGUAGES[parts[0]] ?? "Unknown";
}

/** Callable global (C++ free function style) that still receives generic type arguments. */
function callable(name: string, fn: Fn) {
    return ns(name, {}, { __call: fn });
}

// ---------------------------------------------------------------------------
// PlayerPrefs
// ---------------------------------------------------------------------------

const PREFS_LIMIT = 64 * 1024;

export class PlayerPrefsStore {
    private data: Record<string, number | string>;
    private dirty = false;

    private readonly storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
    private readonly key: string;
    constructor(storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null, key: string) {
        this.storage = storage;
        this.key = key;
        this.data = {};
        try {
            const raw = storage?.getItem(key);
            const parsed = raw ? JSON.parse(raw) : null;
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                for (const [name, value] of Object.entries(parsed)) {
                    if (typeof value === "number" || typeof value === "string") this.data[name] = value;
                }
            }
        } catch {
            this.data = {};
        }
    }

    get(key: string): number | string | undefined {
        return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : undefined;
    }

    set(key: string, value: number | string) {
        const name = String(key).slice(0, 120);
        if (!name) hostError("PlayerPrefs anahtarı boş olamaz.", "ArgumentException");
        const next = { ...this.data, [name]: typeof value === "string" ? value.slice(0, 8000) : value };
        if (JSON.stringify(next).length > PREFS_LIMIT) hostError("PlayerPrefs kotası (64 KB) doldu.", "PlayerPrefsException");
        this.data = next;
        this.dirty = true;
        this.flush();
    }

    has(key: string) {
        return Object.prototype.hasOwnProperty.call(this.data, key);
    }

    delete(key: string) {
        delete this.data[key];
        this.dirty = true;
        this.flush();
    }

    clear() {
        this.data = {};
        this.dirty = true;
        this.flush();
    }

    flush() {
        if (!this.dirty) return;
        this.dirty = false;
        try {
            if (Object.keys(this.data).length) this.storage?.setItem(this.key, JSON.stringify(this.data));
            else this.storage?.removeItem(this.key);
        } catch {
            // Storage may be unavailable (private mode); values stay in memory for this session.
        }
    }
}

// ---------------------------------------------------------------------------
// Physics queries
// ---------------------------------------------------------------------------

interface RaycastRequest {
    origin: Vector3;
    direction: Vector3;
    maxDistance: number;
    outRef: VMRef | null;
}

/** Parses the many Physics.Raycast overloads (Vector3/Ray, out hit, distance, layer mask…). */
function parseRaycast(args: VMValue[], refs: Array<VMRef | null>): RaycastRequest {
    let index = 0;
    let origin: Vector3;
    let direction: Vector3;
    if (args[0] instanceof RayHandle) {
        origin = args[0].ray.origin;
        direction = args[0].ray.direction;
        index = 1;
    } else {
        origin = toVector(args[0], "başlangıç noktası");
        direction = toVector(args[1], "yön");
        index = 2;
    }
    let outRef: VMRef | null = null;
    if (refs[index]) {
        outRef = refs[index];
        index += 1;
    }
    const maxDistance = typeof args[index] === "number" ? Math.max(0, args[index] as number) : Infinity;
    return { origin, direction, maxDistance, outRef };
}

function colliderList(world: RuntimeWorld, ids: string[]): VMValue[] {
    const output: VMValue[] = [];
    for (const id of ids) {
        const entity = world.entities.get(id);
        const handle = entity ? world.colliderHandleOf(entity) : null;
        if (handle) output.push(handle);
    }
    return output;
}

function isCallable(value: VMValue | undefined): boolean {
    return value instanceof VMLambda || value instanceof VMBoundMethod || value instanceof VMNativeFunction || value instanceof VMList;
}

function requireCallable(value: VMValue | undefined, api: string): VMValue {
    if (!isCallable(value)) hostError(`${api} bir fonksiyon bekliyor: () => { ... } veya bir metot adı (ör. ${api.split("(")[0]}(1f, Spawn)).`, "ArgumentException");
    return value ?? null;
}

// ---------------------------------------------------------------------------
// Tween & Timer
// ---------------------------------------------------------------------------

function createTweenNamespace(world: RuntimeWorld) {
    const handle = (kind: TweenKind, target: RuntimeEntity | null, from: number | string | Vector3 | null, to: number | string | Vector3, duration: VMValue) => {
        const tween = world.tweens.create(kind, target, world.currentBehaviour, from, to, Math.max(0, toNumber(duration ?? 0.5, "süre")));
        return new TweenHandle(tween, world.runCallback);
    };
    const target = (value: VMValue, api: string): RuntimeEntity => {
        const entity = liveEntityOf(value);
        if (!entity) return hostError(`Tween.${api}: hedef bir Transform, GameObject veya bileşen olmalı (yok edilmiş olabilir).`, "ArgumentException");
        return entity;
    };
    const flat = (v: Vector3): Vector3 => (world.is2D ? { x: v.x, y: v.y, z: 0 } : v);
    return ns("Tween", {}, {
        Move: (args) => {
            const entity = target(args[0], "Move");
            const to = toVector(args[1], "hedef konum");
            return handle("move", entity, null, world.is2D ? { ...to, z: entity.world.position.z } : to, args[2]);
        },
        MoveLocal: (args) => {
            const entity = target(args[0], "MoveLocal");
            const to = toVector(args[1], "hedef konum");
            return handle("moveLocal", entity, null, world.is2D ? { ...to, z: entity.localPosition.z } : to, args[2]);
        },
        Scale: (args) => {
            const entity = target(args[0], "Scale");
            const to = scaleTarget(args[1] ?? 1);
            return handle("scale", entity, null, world.is2D ? { ...to, z: entity.localScale.z } : to, args[2]);
        },
        Rotate: (args) => handle("rotate", target(args[0], "Rotate"), null, toVector(args[1], "hedef açı"), args[2]),
        Color: (args) => handle("color", target(args[0], "Color"), null, toColor(args[1] ?? "#ffffff").toHex(), args[2]),
        Fade: (args) => handle("fade", target(args[0], "Fade"), null, Math.max(0, Math.min(1, toNumber(args[1] ?? 0, "saydamlık"))), args[2]),
        Value: (args) => {
            const tween = handle("value", null, toNumber(args[0] ?? 0, "başlangıç"), toNumber(args[1] ?? 1, "bitiş"), args[2]);
            tween.tween.onUpdate = requireCallable(args[3], "Tween.Value(from, to, süre, v => ...)");
            return tween;
        },
        Delay: (args) => {
            const tween = handle("delay", null, 0, 1, args[0]);
            tween.tween.onComplete.push(requireCallable(args[1], "Tween.Delay(süre, () => ...)"));
            return tween;
        },
        PunchScale: (args) => {
            const entity = target(args[0], "PunchScale");
            world.tweens.settle(entity, "punchScale", world.runCallback);
            return handle("punchScale", entity, 0, toNumber(args[1] ?? 0.2, "güç"), args[2] ?? 0.3);
        },
        Shake: (args) => {
            const entity = target(args[0], "Shake");
            world.tweens.settle(entity, "shake", world.runCallback);
            const strength = isVector(args[1]) ? toVector(args[1]) : (() => {
                const amount = toNumber(args[1] ?? 0.2, "güç");
                return { x: amount, y: amount, z: world.is2D ? 0 : amount };
            })();
            return handle("shake", entity, 0, flat(strength), args[2] ?? 0.3);
        },
        Kill: (args) => {
            const entity = liveEntityOf(args[0] ?? null);
            return entity ? world.tweens.killTarget(entity, toBool(args[1] ?? false), world.runCallback) : 0;
        },
        KillAll: () => {
            world.tweens.killAll();
            return undefined;
        },
        IsTweening: (args) => {
            const entity = liveEntityOf(args[0] ?? null);
            return Boolean(entity && world.tweens.tweens.some((tween) => tween.target === entity && tween.alive));
        },
    });
}

function createTimerNamespace(world: RuntimeWorld) {
    const timer = (args: VMValue[], repeat: boolean, api: string) => {
        const seconds = Math.max(0, toNumber(args[0] ?? 0, "süre"));
        const callback = requireCallable(args[1], api);
        return new TimerHandle(world.timers.create(seconds, repeat, callback, world.currentBehaviour));
    };
    return ns("Timer", {
        activeCount: () => world.timers.activeCount,
    }, {
        After: (args) => timer(args, false, "Timer.After(süre, () => ...)"),
        Every: (args) => timer(args, true, "Timer.Every(süre, () => ...)"),
        Cancel: (args) => {
            if (args[0] instanceof TimerHandle) args[0].task.cancelled = true;
            return undefined;
        },
        CancelAll: () => {
            const owner = world.currentBehaviour;
            if (owner) world.timers.cancelOwner(owner);
            else world.timers.cancelAll();
            return undefined;
        },
    });
}

function createPhysicsNamespace(world: RuntimeWorld, name: "Physics" | "Physics2D") {
    const is2DApi = name === "Physics2D";
    const raycastAll = (request: RaycastRequest) => world.physics.raycastAll(request.origin, request.direction, request.maxDistance, true);
    return ns(name, {
        gravity: () => vec(world.physics.gravity, is2DApi),
        queriesHitTriggers: () => true,
        defaultContactOffset: () => 0.01,
        AllLayers: () => -1,
        DefaultRaycastLayers: () => -5,
        IgnoreRaycastLayer: () => 4,
    }, {
        Raycast: (args, refs) => {
            const request = parseRaycast(args, refs);
            const hit = raycastAll(request)[0];
            if (is2DApi) return hit ? world.raycastHit(hit) : RaycastHitHandle.miss(world);
            request.outRef?.set(hit ? world.raycastHit(hit) : RaycastHitHandle.miss(world));
            return Boolean(hit);
        },
        RaycastAll: (args, refs) => new VMList(raycastAll(parseRaycast(args, refs)).map((hit) => world.raycastHit(hit)), "Array"),
        RaycastNonAlloc: (args, refs) => {
            const results = args.find((arg) => arg instanceof VMList) as VMList | undefined;
            const request = parseRaycast(args.filter((arg) => !(arg instanceof VMList)), refs.filter((_, index) => !(args[index] instanceof VMList)));
            const hits = raycastAll(request);
            if (results) {
                const count = Math.min(results.items.length || hits.length, hits.length);
                for (let index = 0; index < count; index += 1) results.items[index] = world.raycastHit(hits[index]);
                return count;
            }
            return hits.length;
        },
        Linecast: (args, refs) => {
            const start = toVector(args[0], "başlangıç");
            const end = toVector(args[1], "bitiş");
            const delta = { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z };
            const distance = Math.hypot(delta.x, delta.y, is2DApi ? 0 : delta.z);
            const hit = distance > 0 ? world.physics.raycast(start, delta, distance, true) : null;
            if (is2DApi) return hit ? world.raycastHit(hit) : RaycastHitHandle.miss(world);
            refs[2]?.set(hit ? world.raycastHit(hit) : RaycastHitHandle.miss(world));
            return Boolean(hit);
        },
        SphereCast: (args, refs) => {
            // Approximation: a ray from the sphere centre (radius ignored).
            const origin = args[0] instanceof RayHandle ? args[0].ray.origin : toVector(args[0], "başlangıç");
            const direction = args[0] instanceof RayHandle ? args[0].ray.direction : toVector(args[2], "yön");
            const outIndex = refs.findIndex((ref) => ref);
            const distanceArg = args.slice(outIndex >= 0 ? outIndex + 1 : 3).find((arg) => typeof arg === "number");
            const hit = world.physics.raycast(origin, direction, typeof distanceArg === "number" ? distanceArg : Infinity, true);
            if (outIndex >= 0) refs[outIndex]?.set(hit ? world.raycastHit(hit) : RaycastHitHandle.miss(world));
            return Boolean(hit);
        },
        CircleCast: (args) => {
            const origin = toVector(args[0], "başlangıç");
            const direction = toVector(args[2], "yön");
            const distance = typeof args[3] === "number" ? args[3] : Infinity;
            const hit = world.physics.raycast(origin, direction, distance, true);
            return hit ? world.raycastHit(hit) : RaycastHitHandle.miss(world);
        },
        OverlapSphere: (args) => new VMList(colliderList(world, world.physics.overlapSphere(toVector(args[0], "merkez"), Math.max(0, toNumber(args[1] ?? 0.5)), true)), "Array"),
        OverlapSphereNonAlloc: (args) => {
            const found = colliderList(world, world.physics.overlapSphere(toVector(args[0], "merkez"), Math.max(0, toNumber(args[1] ?? 0.5)), true));
            const results = args[2];
            if (results instanceof VMList) {
                const count = Math.min(results.items.length || found.length, found.length);
                for (let index = 0; index < count; index += 1) results.items[index] = found[index];
                return count;
            }
            return found.length;
        },
        CheckSphere: (args) => world.physics.overlapSphere(toVector(args[0], "merkez"), Math.max(0, toNumber(args[1] ?? 0.5)), true).length > 0,
        OverlapBox: (args) => {
            const half = isVector(args[1]) ? toVector(args[1]) : { x: 0.5, y: 0.5, z: 0.5 };
            const radius = is2DApi ? Math.max(half.x, half.y) / 2 : Math.max(half.x, half.y, half.z);
            const found = colliderList(world, world.physics.overlapSphere(toVector(args[0], "merkez"), radius, true));
            return is2DApi ? found[0] ?? null : new VMList(found, "Array");
        },
        CheckBox: (args) => {
            const half = isVector(args[1]) ? toVector(args[1]) : { x: 0.5, y: 0.5, z: 0.5 };
            return world.physics.overlapSphere(toVector(args[0], "merkez"), Math.max(half.x, half.y, half.z), true).length > 0;
        },
        OverlapCircle: (args) => colliderList(world, world.physics.overlapSphere(toVector(args[0], "merkez"), Math.max(0, toNumber(args[1] ?? 0.5)), true))[0] ?? null,
        OverlapCircleAll: (args) => new VMList(colliderList(world, world.physics.overlapSphere(toVector(args[0], "merkez"), Math.max(0, toNumber(args[1] ?? 0.5)), true)), "Array"),
        OverlapPoint: (args) => colliderList(world, world.physics.overlapSphere(toVector(args[0], "nokta"), 0.0005, true))[0] ?? null,
        OverlapPointAll: (args) => new VMList(colliderList(world, world.physics.overlapSphere(toVector(args[0], "nokta"), 0.0005, true)), "Array"),
        IgnoreCollision: () => {
            world.warnOnce("ignore-collision", `${name}.IgnoreCollision bu sürümde desteklenmiyor; çarpışmayı engellemek için Is Trigger kullanın.`);
            return undefined;
        },
        IgnoreLayerCollision: () => undefined,
        SyncTransforms: () => undefined,
        Simulate: () => undefined,
    }, {
        gravity: (value) => {
            const gravity = toVector(value, "gravity");
            world.physics.gravity = { x: gravity.x, y: gravity.y, z: is2DApi ? 0 : gravity.z };
        },
        queriesHitTriggers: () => undefined,
    });
}

// ---------------------------------------------------------------------------
// Everything else
// ---------------------------------------------------------------------------

export function createHostGlobals(world: RuntimeWorld): Map<string, VMValue> {
    const globals = new Map<string, VMValue>();
    const input = world.input;
    const text = (value: VMValue) => (value === null || value === undefined ? "Null" : world.display(value));
    const logSource = () => undefined;

    globals.set("Debug", ns("Debug", {
        isDebugBuild: () => true,
        developerConsoleVisible: () => false,
    }, {
        Log: (args) => {
            world.log("info", text(args[0]), logSource());
            return undefined;
        },
        LogWarning: (args) => {
            world.log("warning", text(args[0]), logSource());
            return undefined;
        },
        LogError: (args) => {
            world.log("error", text(args[0]), logSource());
            return undefined;
        },
        LogException: (args) => {
            world.log("error", text(args[0]), logSource());
            return undefined;
        },
        LogFormat: (args) => {
            world.log("info", compositeFormat(String(args[0] ?? ""), args.slice(1), "csharp", world.interpreter));
            return undefined;
        },
        LogWarningFormat: (args) => {
            world.log("warning", compositeFormat(String(args[0] ?? ""), args.slice(1), "csharp", world.interpreter));
            return undefined;
        },
        LogErrorFormat: (args) => {
            world.log("error", compositeFormat(String(args[0] ?? ""), args.slice(1), "csharp", world.interpreter));
            return undefined;
        },
        Assert: (args) => {
            if (!args[0]) world.log("error", `Assertion failed${args.length > 1 ? `: ${text(args[1])}` : ""}`);
            return undefined;
        },
        DrawLine: (args) => {
            const color = args[2] instanceof VMColor ? args[2].toHex() : "#ffffff";
            world.drawLine(toVector(args[0], "başlangıç"), toVector(args[1], "bitiş"), color, typeof args[3] === "number" ? args[3] : 0);
            return undefined;
        },
        DrawRay: (args) => {
            const start = toVector(args[0], "başlangıç");
            const direction = toVector(args[1], "yön");
            const color = args[2] instanceof VMColor ? args[2].toHex() : "#ffffff";
            world.drawLine(start, { x: start.x + direction.x, y: start.y + direction.y, z: start.z + direction.z }, color, typeof args[3] === "number" ? args[3] : 0);
            return undefined;
        },
        Break: () => {
            world.log("warning", "Debug.Break(): oyun duraklatıldı.");
            world.pause();
            return undefined;
        },
        ClearDeveloperConsole: () => undefined,
    }));

    globals.set("Time", ns("Time", {
        deltaTime: () => (world.inFixedStep ? world.fixedDeltaTime : world.deltaTime),
        unscaledDeltaTime: () => world.unscaledDeltaTime,
        smoothDeltaTime: () => world.deltaTime,
        fixedDeltaTime: () => world.fixedDeltaTime,
        fixedUnscaledDeltaTime: () => world.fixedDeltaTime,
        time: () => (world.inFixedStep ? world.fixedTime : world.time),
        timeAsDouble: () => world.time,
        fixedTime: () => world.fixedTime,
        unscaledTime: () => world.unscaledTime,
        realtimeSinceStartup: () => world.realtime,
        realtimeSinceStartupAsDouble: () => world.realtime,
        timeSinceLevelLoad: () => world.time - world.levelLoadTime,
        timeScale: () => world.timeScale,
        frameCount: () => world.frameCount,
        maximumDeltaTime: () => world.maximumDeltaTime,
        inFixedTimeStep: () => world.inFixedStep,
    }, {}, {
        timeScale: (value) => {
            world.timeScale = Math.max(0, Math.min(100, toNumber(value, "timeScale")));
        },
        fixedDeltaTime: (value) => {
            world.fixedDeltaTime = Math.max(1 / 240, Math.min(0.1, toNumber(value, "fixedDeltaTime")));
        },
        maximumDeltaTime: (value) => {
            world.maximumDeltaTime = Math.max(0.02, Math.min(1, toNumber(value, "maximumDeltaTime")));
        },
    }));

    const touchAt = (index: number) => {
        if (index !== 0 || input.touchCount <= 0) hostError(`Input.GetTouch(${index}): o indekste dokunma yok (touchCount = ${input.touchCount}).`, "ArgumentException");
        const phase = input.getMouseButtonDown(0) ? "Began" : input.getMouseButtonUp(0) ? "Ended" : input.mouseDeltaX || input.mouseDeltaY ? "Moved" : "Stationary";
        return new TouchHandle({ x: input.mouseX, y: input.mouseY, z: 0 }, { x: input.mouseDeltaX, y: input.mouseDeltaY, z: 0 }, phase);
    };

    globals.set("Input", ns("Input", {
        mousePosition: () => new Vec3(input.mouseX, input.mouseY, 0),
        mouseScrollDelta: () => new Vec3(0, input.scrollDelta, 0, true),
        anyKey: () => input.anyKey(),
        anyKeyDown: () => input.anyKeyDown(),
        inputString: () => input.inputString,
        touchCount: () => input.touchCount,
        touchSupported: () => typeof window !== "undefined" && "ontouchstart" in window,
        mousePresent: () => true,
        multiTouchEnabled: () => false,
        touches: () => new VMList(input.touchCount > 0 ? [touchAt(0)] : [], "Array"),
    }, {
        GetKey: (args) => input.getKey(args[0]),
        GetKeyDown: (args) => input.getKeyDown(args[0]),
        GetKeyUp: (args) => input.getKeyUp(args[0]),
        GetAxis: (args) => input.getAxis(String(args[0] ?? "")),
        GetAxisRaw: (args) => input.getAxisRaw(String(args[0] ?? "")),
        GetButton: (args) => input.getButton(String(args[0] ?? "")),
        GetButtonDown: (args) => input.getButtonDown(String(args[0] ?? "")),
        GetButtonUp: (args) => input.getButtonUp(String(args[0] ?? "")),
        GetMouseButton: (args) => input.getMouseButton(Math.trunc(toNumber(args[0] ?? 0))),
        GetMouseButtonDown: (args) => input.getMouseButtonDown(Math.trunc(toNumber(args[0] ?? 0))),
        GetMouseButtonUp: (args) => input.getMouseButtonUp(Math.trunc(toNumber(args[0] ?? 0))),
        GetTouch: (args) => touchAt(Math.trunc(toNumber(args[0] ?? 0))),
        GetJoystickNames: () => new VMList([...input.gamepadNames], "Array"),
        ResetInputAxes: () => {
            input.reset();
            return undefined;
        },
    }));

    globals.set("Physics", createPhysicsNamespace(world, "Physics"));
    globals.set("Physics2D", createPhysicsNamespace(world, "Physics2D"));

    const destroy: Fn = (args) => {
        world.destroy(args[0] ?? null, typeof args[1] === "number" ? args[1] : 0);
        return undefined;
    };
    const destroyImmediate: Fn = (args) => {
        world.destroy(args[0] ?? null, 0, true);
        return undefined;
    };
    const instantiate: Fn = (args) => world.instantiate(args);
    const dontDestroy: Fn = (args) => {
        world.dontDestroyOnLoad(args[0] ?? null);
        return undefined;
    };
    const findFirst: Fn = (args, _refs, typeArgs) => world.findObjectsOfType(typeNameFrom(args, typeArgs), true)[0] ?? null;
    const findAll: Fn = (args, _refs, typeArgs) => world.objectList(world.findObjectsOfType(typeNameFrom(args, typeArgs), false));
    const objectFunctions: Record<string, Fn> = {
        Destroy: destroy,
        DestroyImmediate: destroyImmediate,
        Instantiate: instantiate,
        DontDestroyOnLoad: dontDestroy,
        FindObjectOfType: findFirst,
        FindFirstObjectByType: findFirst,
        FindAnyObjectByType: findFirst,
        FindObjectsOfType: findAll,
        FindObjectsByType: findAll,
    };

    globals.set("Object", ns("Object", {}, objectFunctions));
    globals.set("GameObject", ns("GameObject", {}, {
        ...objectFunctions,
        Find: (args) => {
            const entity = world.findByName(String(args[0] ?? ""));
            return entity ? world.gameObjectHandle(entity) : null;
        },
        FindWithTag: (args) => {
            const entity = world.findWithTag(String(args[0] ?? ""))[0];
            return entity ? world.gameObjectHandle(entity) : null;
        },
        FindGameObjectWithTag: (args) => {
            const entity = world.findWithTag(String(args[0] ?? ""))[0];
            return entity ? world.gameObjectHandle(entity) : null;
        },
        FindGameObjectsWithTag: (args) => new VMList(world.findWithTag(String(args[0] ?? "")).map((entity) => world.gameObjectHandle(entity)), "Array"),
        CreatePrimitive: (args) => world.createPrimitive(String(args[0] ?? "Cube")),
    }));

    globals.set("Destroy", callable("Destroy", destroy));
    globals.set("DestroyImmediate", callable("DestroyImmediate", destroyImmediate));
    globals.set("Instantiate", callable("Instantiate", instantiate));
    globals.set("DontDestroyOnLoad", callable("DontDestroyOnLoad", dontDestroy));
    globals.set("FindObjectOfType", callable("FindObjectOfType", findFirst));

    globals.set("PrimitiveType", enumNamespace("PrimitiveType", ["Cube", "Sphere", "Capsule", "Cylinder", "Plane", "Quad"]));
    globals.set("TouchPhase", enumNamespace("TouchPhase", ["Began", "Moved", "Stationary", "Ended", "Canceled"]));
    globals.set("CursorLockMode", enumNamespace("CursorLockMode", ["None", "Locked", "Confined"]));
    globals.set("RigidbodyType2D", enumNamespace("RigidbodyType2D", ["Dynamic", "Kinematic", "Static"]));
    globals.set("SendMessageOptions", enumNamespace("SendMessageOptions", ["RequireReceiver", "DontRequireReceiver"]));
    globals.set("RuntimePlatform", enumNamespace("RuntimePlatform", ["WebGLPlayer", "WindowsPlayer", "OSXPlayer", "Android", "IPhonePlayer"]));
    globals.set("LayerMask", ns("LayerMask", {}, {
        GetMask: () => -1,
        NameToLayer: () => 0,
        LayerToName: () => "Default",
    }));

    globals.set("SceneManager", ns("SceneManager", {
        sceneCount: () => 1,
        sceneCountInBuildSettings: () => world.project.scenes.length,
    }, {
        LoadScene: (args) => {
            world.requestSceneLoad(args[0] ?? 0);
            return undefined;
        },
        FadeToScene: (args) => {
            const color = args[2] instanceof VMColor ? args[2].toHex() : "#000000";
            world.requestSceneFade(args[0] ?? 0, typeof args[1] === "number" ? args[1] : 0.5, color);
            return undefined;
        },
        ReloadScene: () => {
            world.requestSceneLoad(world.sceneIndex());
            return undefined;
        },
        LoadSceneAsync: (args) => {
            world.requestSceneLoad(args[0] ?? 0);
            return null;
        },
        GetActiveScene: () => world.sceneHandle(),
        GetSceneByName: (args) => {
            const scene = world.findScene(String(args[0] ?? ""));
            return scene ? world.sceneHandle(scene) : null;
        },
        GetSceneAt: () => world.sceneHandle(),
        GetSceneByBuildIndex: (args) => {
            const scene = world.findScene(Math.trunc(toNumber(args[0] ?? 0)));
            return scene ? world.sceneHandle(scene) : null;
        },
    }));

    globals.set("Application", ns("Application", {
        isPlaying: () => true,
        isEditor: () => world.isEditor,
        isFocused: () => typeof document === "undefined" || document.hasFocus(),
        isMobilePlatform: () => typeof navigator !== "undefined" && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent),
        platform: () => "WebGLPlayer",
        productName: () => world.project.name,
        companyName: () => "Hanogt",
        version: () => "1.0",
        unityVersion: () => `Hanogt Engine ${ENGINE_VERSION}`,
        engineVersion: () => `${ENGINE_VERSION}.0`,
        engineName: () => ENGINE_VERSION_LABEL,
        targetFrameRate: () => world.targetFrameRate,
        runInBackground: () => false,
        persistentDataPath: () => "/hanogt/persistent",
        dataPath: () => "/hanogt/data",
        // V5 names the player's language like Unity (German, Japanese…); earlier rules only knew Turkish and English.
        systemLanguage: () => (world.rules >= 5 ? systemLanguageOf(world.locale) : typeof navigator !== "undefined" && navigator.language.startsWith("tr") ? "Turkish" : "English"),
        internetReachability: () => "ReachableViaLocalAreaNetwork",
    }, {
        Quit: () => {
            world.log("info", "Application.Quit() çağrıldı; oyun durduruldu.");
            world.requestQuit();
            return undefined;
        },
        OpenURL: (args) => {
            world.warnOnce("open-url", `Application.OpenURL güvenlik nedeniyle devre dışı (${String(args[0] ?? "").slice(0, 80)}).`);
            return undefined;
        },
    }, {
        targetFrameRate: (value) => {
            world.targetFrameRate = Math.trunc(toNumber(value));
        },
        runInBackground: () => undefined,
    }));

    globals.set("Screen", ns("Screen", {
        width: () => Math.round(world.screenSize().width),
        height: () => Math.round(world.screenSize().height),
        dpi: () => (typeof window !== "undefined" ? 96 * (window.devicePixelRatio || 1) : 96),
        fullScreen: () => typeof document !== "undefined" && Boolean(document.fullscreenElement),
        orientation: () => (world.screenSize().width >= world.screenSize().height ? "LandscapeLeft" : "Portrait"),
        safeArea: () => null,
    }, {
        SetResolution: () => undefined,
    }, {
        fullScreen: () => undefined,
        orientation: () => undefined,
        sleepTimeout: () => undefined,
    }));

    globals.set("Cursor", ns("Cursor", {
        visible: () => true,
        lockState: () => "None",
    }, {
        SetCursor: () => undefined,
    }, {
        visible: () => undefined,
        lockState: () => undefined,
    }));

    globals.set("Camera", ns("Camera", {
        main: () => {
            const camera = world.primaryCamera();
            return camera ? world.componentHandle(camera.entity, camera.component) : null;
        },
        current: () => {
            const camera = world.primaryCamera();
            return camera ? world.componentHandle(camera.entity, camera.component) : null;
        },
        allCamerasCount: () => [...world.entities.values()].filter((entity) => entity.components.some((component) => component.type === "camera")).length,
    }, {
        // V4: screen shake on the rendered camera (amount in world units, seconds, shakes per second).
        Shake: (args) => {
            world.shaker.add(
                args[0] === undefined ? 0.3 : toNumber(args[0], "güç"),
                args[1] === undefined ? 0.3 : toNumber(args[1], "süre"),
                args[2] === undefined ? 25 : toNumber(args[2], "frekans"),
            );
            return undefined;
        },
        StopShake: () => {
            world.shaker.stop();
            return undefined;
        },
    }));

    // V4: grid path finding around static colliders and solid tiles (2D).
    const pathPoints = (points: Array<{ x: number; y: number }>) => new VMList(points.map((point) => vec({ x: point.x, y: point.y, z: 0 }, true)), "List", "Vector2");
    globals.set("Pathfinding", ns("Pathfinding", {
        cellSize: () => world.navCellSize ?? 0,
        agentRadius: () => world.navRadius,
    }, {
        FindPath: (args) => {
            const from = toVector(args[0], "başlangıç");
            const to = toVector(args[1], "hedef");
            const radius = typeof args[2] === "number" ? Math.max(0, args[2]) : world.navRadius;
            const result = world.findPath(from, to, radius, false);
            return pathPoints(result.status === "complete" ? result.points : []);
        },
        HasPath: (args) => world.findPath(toVector(args[0], "başlangıç"), toVector(args[1], "hedef"), typeof args[2] === "number" ? Math.max(0, args[2]) : world.navRadius, false).status === "complete",
        IsWalkable: (args) => world.isWalkable(toVector(args[0], "nokta"), typeof args[1] === "number" ? Math.max(0, args[1]) : world.navRadius),
        Rebuild: () => {
            world.resetNavigation();
            return undefined;
        },
    }, {
        cellSize: (value) => {
            const size = toNumber(value, "cellSize");
            world.navCellSize = size > 0 ? Math.min(10, Math.max(0.1, size)) : null;
            world.resetNavigation();
        },
        agentRadius: (value) => {
            world.navRadius = Math.min(50, Math.max(0, toNumber(value, "agentRadius")));
        },
    }));

    globals.set("Audio", ns("Audio", {
        volume: () => world.audio?.volume ?? 0,
        mute: () => world.audioMuted,
        // V4: music channel and volumes of the two channels.
        musicVolume: () => world.audio?.musicVolume ?? 1,
        sfxVolume: () => world.audio?.sfxVolume ?? 1,
        isMusicPlaying: () => world.currentMusic !== null,
        currentMusic: () => world.currentMusic,
    }, {
        Play: (args) => {
            world.playSound(String(args[0] ?? "blip"), typeof args[1] === "number" ? args[1] : 1, typeof args[2] === "number" ? args[2] : 1);
            return undefined;
        },
        PlayOneShot: (args) => {
            world.playSound(String(args[0] ?? "blip"), typeof args[1] === "number" ? args[1] : 1, typeof args[2] === "number" ? args[2] : 1);
            return undefined;
        },
        PlayMusic: (args) => {
            world.playMusic(String(args[0] ?? ""), typeof args[1] === "number" ? args[1] : 1, typeof args[2] === "number" ? args[2] : 0.5);
            return undefined;
        },
        StopMusic: (args) => {
            world.stopMusic(typeof args[0] === "number" ? args[0] : 0.5);
            return undefined;
        },
        IsMusicPlaying: () => world.currentMusic !== null,
        SetVolume: (args) => {
            world.audio?.setVolume(toNumber(args[0] ?? 1));
            return undefined;
        },
        SetMusicVolume: (args) => {
            world.audio?.setMusicVolume(toNumber(args[0] ?? 1));
            return undefined;
        },
        SetSfxVolume: (args) => {
            world.audio?.setSfxVolume(toNumber(args[0] ?? 1));
            return undefined;
        },
    }, {
        volume: (value) => world.audio?.setVolume(toNumber(value)),
        mute: (value) => {
            world.audioMuted = toBool(value);
            world.audio?.setMuted(world.audioMuted);
        },
        musicVolume: (value) => world.audio?.setMusicVolume(toNumber(value)),
        sfxVolume: (value) => world.audio?.setSfxVolume(toNumber(value)),
    }));

    // AudioSource.PlayClipAtPoint(clip, position[, volume]): a one-shot sound (no 3D audio, so the position is ignored).
    globals.set("AudioSource", ns("AudioSource", {}, {
        PlayClipAtPoint: (args) => {
            if (args[0] !== null && args[0] !== undefined) world.playSound(String(args[0]), typeof args[2] === "number" ? args[2] : 1);
            return undefined;
        },
    }));

    // ScreenEffects (V5): change the running scene's screen effects from scripts; Reset() goes back to the scene's own.
    const clamp = (value: VMValue, min: number, max: number) => Math.min(max, Math.max(min, toNumber(value)));
    const grading = (recipe: (settings: typeof world.effects.colorGrading) => void) => {
        world.effects.colorGrading.enabled = true;
        recipe(world.effects.colorGrading);
    };
    globals.set("ScreenEffects", ns("ScreenEffects", {
        saturation: () => world.effects.colorGrading.enabled ? world.effects.colorGrading.saturation : 0,
        contrast: () => world.effects.colorGrading.enabled ? world.effects.colorGrading.contrast : 0,
        brightness: () => world.effects.colorGrading.enabled ? world.effects.colorGrading.brightness : 0,
        hue: () => world.effects.colorGrading.enabled ? world.effects.colorGrading.hue : 0,
        tint: () => {
            const grading = world.effects.colorGrading;
            return colorToVM(grading.tint, grading.enabled ? grading.tintAmount : 0);
        },
        chromaticAberration: () => world.effects.chromaticAberration.enabled ? world.effects.chromaticAberration.intensity : 0,
        pixelate: () => world.effects.pixelate.enabled ? world.effects.pixelate.size : 1,
        crt: () => world.effects.crt.enabled,
        scanlines: () => world.effects.crt.scanlines,
        curvature: () => world.effects.crt.curvature,
        bloom: () => world.effects.bloom.enabled ? world.effects.bloom.intensity : 0,
        vignette: () => world.effects.vignette.enabled ? world.effects.vignette.intensity : 0,
        exposure: () => world.effects.exposure,
    }, {
        Reset: () => {
            world.resetEffects();
            return undefined;
        },
    }, {
        saturation: (value) => grading((settings) => { settings.saturation = clamp(value, -1, 1); }),
        contrast: (value) => grading((settings) => { settings.contrast = clamp(value, -1, 1); }),
        brightness: (value) => grading((settings) => { settings.brightness = clamp(value, -1, 1); }),
        hue: (value) => grading((settings) => { settings.hue = clamp(value, -180, 180); }),
        // The color's alpha is how strongly it tints (Color.clear removes the tint).
        tint: (value) => grading((settings) => {
            const color = toColor(value);
            settings.tint = color.toHex();
            settings.tintAmount = Math.min(1, Math.max(0, color.a));
        }),
        chromaticAberration: (value) => {
            const intensity = clamp(value, 0, 1);
            world.effects.chromaticAberration.enabled = intensity > 0;
            if (intensity > 0) world.effects.chromaticAberration.intensity = intensity;
        },
        pixelate: (value) => {
            const size = Math.round(clamp(value, 1, 32));
            world.effects.pixelate.enabled = size > 1;
            if (size > 1) world.effects.pixelate.size = size;
        },
        crt: (value) => { world.effects.crt.enabled = toBool(value); },
        scanlines: (value) => { world.effects.crt.scanlines = clamp(value, 0, 1); },
        curvature: (value) => { world.effects.crt.curvature = clamp(value, 0, 1); },
        bloom: (value) => {
            const intensity = clamp(value, 0, 5);
            world.effects.bloom.enabled = intensity > 0;
            if (intensity > 0) world.effects.bloom.intensity = intensity;
        },
        vignette: (value) => {
            const intensity = clamp(value, 0, 1);
            world.effects.vignette.enabled = intensity > 0;
            if (intensity > 0) world.effects.vignette.intensity = intensity;
        },
        exposure: (value) => { world.effects.exposure = clamp(value, 0.1, 4); },
    }));

    // Localization (V5): texts of the project's string table in the player's language.
    globals.set("Localization", ns("Localization", {
        language: () => world.language ?? "",
        languages: () => new VMList([...world.localization.languages], "Array"),
        defaultLanguage: () => world.localization.languages[0] ?? "",
        count: () => world.localization.size,
    }, {
        // Get("coins", 5) fills {0} like string.Format; a missing key comes back as the key itself.
        Get: (args) => {
            const key = String(args[0] ?? "");
            const text = world.localize(key) ?? key;
            const values = args.length === 2 && args[1] instanceof VMList && args[1].kind === "Array" ? args[1].items : args.slice(1);
            return values.length ? compositeFormat(text, values, "csharp", world.interpreter) : text;
        },
        Has: (args) => world.localization.entry(String(args[0] ?? "")) !== null,
        HasLanguage: (args) => world.localization.language(String(args[0] ?? "")) !== null,
        SetLanguage: (args) => world.setLanguage(String(args[0] ?? "")),
        // The language's own name for language menus: "Türkçe", "English", "Deutsch".
        GetLanguageName: (args) => {
            const code = args.length ? String(args[0] ?? "") : world.language ?? "";
            return code ? languageName(world.localization.language(code) ?? code) : "";
        },
    }, {
        language: (value) => {
            world.setLanguage(String(value ?? ""));
        },
    }));
    globals.set("SystemLanguage", enumNamespace("SystemLanguage", SYSTEM_LANGUAGE_NAMES));

    // Animator.StringToHash(name): a number Animator methods accept instead of the name (V5).
    globals.set("Animator", ns("Animator", {}, {
        StringToHash: (args) => animatorHash(String(args[0] ?? "")),
    }));

    globals.set("AudioListener", ns("AudioListener", {
        volume: () => world.audio?.volume ?? 0,
        pause: () => world.audioMuted,
    }, {}, {
        volume: (value) => world.audio?.setVolume(toNumber(value)),
        pause: (value) => {
            world.audioMuted = toBool(value);
            world.audio?.setMuted(world.audioMuted);
        },
    }));

    const prefs = world.prefs;
    globals.set("PlayerPrefs", ns("PlayerPrefs", {}, {
        GetInt: (args) => {
            const value = prefs.get(String(args[0] ?? ""));
            return typeof value === "number" ? Math.trunc(value) : typeof args[1] === "number" ? Math.trunc(args[1]) : 0;
        },
        GetFloat: (args) => {
            const value = prefs.get(String(args[0] ?? ""));
            return typeof value === "number" ? value : typeof args[1] === "number" ? args[1] : 0;
        },
        GetString: (args) => {
            const value = prefs.get(String(args[0] ?? ""));
            return typeof value === "string" ? value : typeof args[1] === "string" ? args[1] : "";
        },
        SetInt: (args) => {
            prefs.set(String(args[0] ?? ""), Math.trunc(toNumber(args[1] ?? 0)));
            return undefined;
        },
        SetFloat: (args) => {
            prefs.set(String(args[0] ?? ""), toNumber(args[1] ?? 0));
            return undefined;
        },
        SetString: (args) => {
            prefs.set(String(args[0] ?? ""), String(args[1] ?? ""));
            return undefined;
        },
        GetBool: (args) => {
            const value = prefs.get(String(args[0] ?? ""));
            return typeof value === "number" ? value !== 0 : typeof args[1] === "boolean" ? args[1] : false;
        },
        SetBool: (args) => {
            prefs.set(String(args[0] ?? ""), toBool(args[1] ?? false) ? 1 : 0);
            return undefined;
        },
        HasKey: (args) => prefs.has(String(args[0] ?? "")),
        DeleteKey: (args) => {
            prefs.delete(String(args[0] ?? ""));
            return undefined;
        },
        DeleteAll: () => {
            prefs.clear();
            return undefined;
        },
        Save: () => {
            prefs.flush();
            return undefined;
        },
    }));

    globals.set("Resources", ns("Resources", {}, {
        Load: (args, _refs, typeArgs) => {
            const path = String(args[0] ?? "");
            const name = path.split("/").pop() ?? path;
            const prefab = world.project.prefabs.find((item) => item.name === name) ?? world.project.prefabs.find((item) => item.name.toLowerCase() === name.toLowerCase());
            if (!prefab) {
                world.log("warning", `Resources.Load: '${path}' adında prefab bulunamadı.`);
                return null;
            }
            const type = typeArgs[0] ?? null;
            return new PrefabHandle(prefab, type && type !== "GameObject" && type !== "Object" ? type : null);
        },
        LoadAll: () => new VMList(world.project.prefabs.map((prefab) => new PrefabHandle(prefab)), "Array"),
        UnloadUnusedAssets: () => null,
    }));

    const gizmoNoop: Fn = () => undefined;
    globals.set("Gizmos", ns("Gizmos", { color: () => new VMColor(1, 1, 1, 1) }, {
        DrawLine: gizmoNoop,
        DrawRay: gizmoNoop,
        DrawSphere: gizmoNoop,
        DrawWireSphere: gizmoNoop,
        DrawCube: gizmoNoop,
        DrawWireCube: gizmoNoop,
        DrawIcon: gizmoNoop,
    }, { color: () => undefined, matrix: () => undefined }));

    globals.set("HUD", ns("HUD", {}, {
        Show: (args) => {
            world.showHud(text(args[0] ?? ""), typeof args[1] === "number" ? args[1] : 2, args[2] instanceof VMColor ? args[2].toHex() : "#ffffff");
            return undefined;
        },
        Hide: () => {
            world.hud = null;
            return undefined;
        },
    }));

    globals.set("Tween", createTweenNamespace(world));
    globals.set("Timer", createTimerNamespace(world));
    // Ease.OutQuad → "outQuad" (the names DOTween users know).
    globals.set("Ease", ns("Ease", Object.fromEntries(EASINGS.map((easing) => [easing.charAt(0).toUpperCase() + easing.slice(1), () => easing])), {}));
    globals.set("LoopType", enumNamespace("LoopType", ["Restart", "Yoyo"]));
    globals.set("UI", ns("UI", {
        pointerOverUI: () => world.pointerOverUI,
    }, {
        IsPointerOverUI: () => world.pointerOverUI,
    }));
    const eventSystem: StaticNamespace = ns("EventSystem", {
        current: () => eventSystem,
    }, {
        IsPointerOverGameObject: () => world.pointerOverUI,
    });
    globals.set("EventSystem", eventSystem);

    // Type names used as values (typeof(Rigidbody), `is Collider`…) resolve to inert namespaces.
    for (const typeName of ["Transform", "Rigidbody", "Rigidbody2D", "Collider", "Collider2D"]) {
        globals.set(typeName, ns(typeName, {}, {}));
    }

    globals.set("Ray", ns("Ray", {}, {}));
    return globals;
}
