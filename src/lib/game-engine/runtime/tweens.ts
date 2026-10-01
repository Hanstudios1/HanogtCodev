/**
 * Code-driven animation (Tween.Move, Tween.Value…) and lambda timers
 * (Timer.After, Timer.Every). Both advance with scaled game time after Update.
 */
import { ease, easingFromName, lerpColor } from "../animation";
import { quatFromEulerDeg, eulerDegFromQuat } from "../math";
import { VMBoundMethod, VMLambda, VMList, VMNativeFunction, YieldInstruction, type HostObject, type VMValue } from "../script/values";
import type { Easing, Vector3 } from "../types";
import { applyColor, applyOpacity, readColor, readOpacity } from "./animator";
import type { BehaviourState, RuntimeEntity } from "./entity";
import { hostError, isVector, toBool, toNumber, toVector, vec } from "./handles";

export type TweenKind = "move" | "moveLocal" | "scale" | "rotate" | "color" | "fade" | "value" | "delay" | "punchScale" | "shake";
export type LoopType = "restart" | "yoyo";
type TweenValue = number | string | Vector3;

/** Runs a script callback with error isolation (provided by the world). */
export type CallbackRunner = (owner: BehaviourState | null, label: string, callback: VMValue, args: VMValue[]) => void;

const ZERO: Vector3 = { x: 0, y: 0, z: 0 };

function lerpNumber(a: number, b: number, t: number) {
    return a + (b - a) * t;
}

function lerpVector(a: Vector3, b: Vector3, t: number): Vector3 {
    return { x: lerpNumber(a.x, b.x, t), y: lerpNumber(a.y, b.y, t), z: lerpNumber(a.z, b.z, t) };
}

export class Tween {
    readonly id: number;
    readonly kind: TweenKind;
    readonly target: RuntimeEntity | null;
    readonly owner: BehaviourState | null;
    duration: number;
    delay = 0;
    easing: Easing = "outQuad";
    /** Total number of plays; -1 repeats forever. */
    loops = 1;
    loopType: LoopType = "restart";
    elapsed = 0;
    paused = false;
    killed = false;
    completed = false;
    from: TweenValue | null;
    to: TweenValue;
    readonly onComplete: VMValue[] = [];
    onUpdate: VMValue | null = null;
    private started = false;
    private shakeOffset: Vector3 = ZERO;
    private punchBase: Vector3 | null = null;
    private shakeSeed: number;

    constructor(id: number, kind: TweenKind, target: RuntimeEntity | null, owner: BehaviourState | null, from: TweenValue | null, to: TweenValue, duration: number) {
        this.id = id;
        this.kind = kind;
        this.target = target;
        this.owner = owner;
        this.from = from;
        this.to = to;
        this.duration = Math.max(0, duration);
        this.shakeSeed = (id * 7919) % 2147483646 + 1;
        if (kind === "punchScale" || kind === "shake" || kind === "delay") this.easing = "linear";
    }

    /** Deterministic noise in -1…1 (two shakes started together still differ). */
    private noise() {
        this.shakeSeed = (this.shakeSeed * 16807) % 2147483647;
        return (this.shakeSeed / 2147483647) * 2 - 1;
    }

    get alive() {
        return !this.killed && !this.completed;
    }

    /** Captures start values when the tween actually starts (after its delay). */
    private start() {
        this.started = true;
        const target = this.target;
        if (!target || this.from !== null) return;
        switch (this.kind) {
            case "move": this.from = { ...target.world.position }; break;
            case "moveLocal": this.from = { ...target.localPosition }; break;
            case "scale": this.from = { ...target.localScale }; break;
            case "rotate": this.from = eulerDegFromQuat(target.localRotation); break;
            case "color": this.from = readColor(target) ?? "#ffffff"; break;
            case "fade": this.from = readOpacity(target); break;
            default: break;
        }
    }

    private apply(progress: number, run: CallbackRunner) {
        const target = this.target;
        const e = ease(this.easing, progress);
        switch (this.kind) {
            case "move":
                if (target) target.setWorldPosition(lerpVector(this.from as Vector3, this.to as Vector3, e));
                break;
            case "moveLocal":
                if (target) target.setLocalPosition(lerpVector(this.from as Vector3, this.to as Vector3, e));
                break;
            case "scale":
                if (target) {
                    target.setLocalScale(lerpVector(this.from as Vector3, this.to as Vector3, e));
                    target.renderVersion += 1;
                }
                break;
            case "rotate":
                if (target) target.setLocalRotation(quatFromEulerDeg(lerpVector(this.from as Vector3, this.to as Vector3, e)));
                break;
            case "color":
                if (target) applyColor(target, lerpColor(String(this.from), String(this.to), e));
                break;
            case "fade":
                if (target) applyOpacity(target, lerpNumber(Number(this.from), Number(this.to), e));
                break;
            case "value":
                if (this.onUpdate !== null) run(this.owner, "Tween.Value", this.onUpdate, [lerpNumber(Number(this.from), Number(this.to), e)]);
                return;
            case "punchScale": {
                if (!target) break;
                this.punchBase ??= { ...target.localScale };
                const amount = Number(this.to) * Math.sin(progress * Math.PI * 4) * (1 - progress);
                const base = this.punchBase;
                target.setLocalScale({ x: base.x * (1 + amount), y: base.y * (1 + amount), z: base.z * (1 + amount) });
                target.renderVersion += 1;
                break;
            }
            case "shake": {
                if (!target) break;
                const strength = this.to as Vector3;
                const decay = progress >= 1 ? 0 : 1 - progress;
                const offset = { x: strength.x * this.noise() * decay, y: strength.y * this.noise() * decay, z: strength.z * this.noise() * decay };
                const p = target.localPosition;
                target.setLocalPosition({ x: p.x + offset.x - this.shakeOffset.x, y: p.y + offset.y - this.shakeOffset.y, z: p.z + offset.z - this.shakeOffset.z });
                this.shakeOffset = offset;
                break;
            }
            default:
                break;
        }
        if (this.onUpdate !== null) run(this.owner, "Tween.OnUpdate", this.onUpdate, []);
    }

    private finish(run: CallbackRunner) {
        const lastForward = this.loopType === "yoyo" && this.loops > 0 ? (this.loops - 1) % 2 === 0 : true;
        this.apply(lastForward ? 1 : 0, run);
        this.completed = true;
        for (const callback of this.onComplete) run(this.owner, "Tween.OnComplete", callback, []);
    }

    update(deltaTime: number, run: CallbackRunner) {
        if (!this.alive || this.paused) return;
        if (this.target?.destroyed || (this.owner?.destroyed && !this.target)) {
            this.killed = true;
            return;
        }
        this.elapsed += deltaTime;
        if (this.elapsed < this.delay) return;
        if (!this.started) this.start();
        const progress = this.duration > 0 ? (this.elapsed - this.delay) / this.duration : Infinity;
        const cycle = Math.floor(progress);
        if (this.loops >= 0 && cycle >= Math.max(1, this.loops)) {
            this.finish(run);
            return;
        }
        const local = progress - cycle;
        const forward = this.loopType === "yoyo" ? cycle % 2 === 0 : true;
        this.apply(forward ? local : 1 - local, run);
    }

    /** Stops the tween; with `complete` it jumps to the end and runs OnComplete. */
    kill(complete: boolean, run: CallbackRunner) {
        if (!this.alive) return;
        if (complete) {
            if (!this.started) this.start();
            this.finish(run);
        } else {
            this.killed = true;
        }
    }

    restart() {
        this.elapsed = 0;
        this.completed = false;
        this.killed = false;
        this.paused = false;
    }
}

export class TweenManager {
    readonly tweens: Tween[] = [];
    private nextId = 1;

    create(kind: TweenKind, target: RuntimeEntity | null, owner: BehaviourState | null, from: TweenValue | null, to: TweenValue, duration: number): Tween {
        if (this.tweens.length >= 2000) hostError("Aynı anda en fazla 2000 tween çalışabilir.", "InvalidOperationException");
        const tween = new Tween(this.nextId++, kind, target, owner, from, to, duration);
        this.tweens.push(tween);
        return tween;
    }

    update(deltaTime: number, run: CallbackRunner) {
        for (const tween of this.tweens.slice()) tween.update(deltaTime, run);
        for (let index = this.tweens.length - 1; index >= 0; index -= 1) {
            if (!this.tweens[index].alive) this.tweens.splice(index, 1);
        }
    }

    /**
     * Completes running punch/shake tweens of the same kind on a target before a
     * new one starts; otherwise the new tween would capture the punched pose as
     * its rest pose and rapid clicks would make the object drift.
     */
    settle(target: RuntimeEntity, kind: TweenKind, run: CallbackRunner) {
        for (const tween of this.tweens) {
            if (tween.target === target && tween.kind === kind && tween.alive) tween.kill(true, run);
        }
    }

    killTarget(target: RuntimeEntity, complete: boolean, run: CallbackRunner): number {
        let count = 0;
        for (const tween of this.tweens.slice()) {
            if (tween.target !== target || !tween.alive) continue;
            tween.kill(complete, run);
            count += 1;
        }
        return count;
    }

    killAll() {
        for (const tween of this.tweens) tween.killed = true;
        this.tweens.length = 0;
    }

    get activeCount() {
        return this.tweens.filter((tween) => tween.alive).length;
    }
}

export class TimerTask {
    readonly id: number;
    readonly interval: number;
    readonly repeat: boolean;
    readonly callback: VMValue;
    readonly owner: BehaviourState | null;
    remaining: number;
    cancelled = false;
    done = false;

    constructor(id: number, interval: number, repeat: boolean, callback: VMValue, owner: BehaviourState | null) {
        this.id = id;
        this.interval = interval;
        this.repeat = repeat;
        this.callback = callback;
        this.owner = owner;
        this.remaining = interval;
    }

    get active() {
        return !this.cancelled && !this.done;
    }
}

export class TimerManager {
    readonly tasks: TimerTask[] = [];
    private nextId = 1;

    create(seconds: number, repeat: boolean, callback: VMValue, owner: BehaviourState | null): TimerTask {
        if (this.tasks.length >= 1000) hostError("Aynı anda en fazla 1000 zamanlayıcı çalışabilir.", "InvalidOperationException");
        const interval = Math.max(repeat ? 0.01 : 0, seconds);
        const task = new TimerTask(this.nextId++, interval, repeat, callback, owner);
        this.tasks.push(task);
        return task;
    }

    update(deltaTime: number, run: CallbackRunner) {
        for (const task of this.tasks.slice()) {
            if (!task.active) continue;
            if (task.owner?.destroyed) {
                task.cancelled = true;
                continue;
            }
            task.remaining -= deltaTime;
            let fired = 0;
            // A long frame fires a repeating timer a few times at most (no runaway loops).
            while (task.active && task.remaining <= 1e-9 && fired < 8) {
                fired += 1;
                if (task.repeat) task.remaining += task.interval;
                else task.done = true;
                run(task.owner, task.repeat ? "Timer.Every" : "Timer.After", task.callback, []);
                if (task.owner?.destroyed) task.cancelled = true;
            }
            if (task.repeat && task.remaining <= 0) task.remaining = task.interval;
        }
        for (let index = this.tasks.length - 1; index >= 0; index -= 1) {
            if (!this.tasks[index].active) this.tasks.splice(index, 1);
        }
    }

    cancelOwner(owner: BehaviourState) {
        for (const task of this.tasks) if (task.owner === owner) task.cancelled = true;
    }

    cancelAll() {
        for (const task of this.tasks) task.cancelled = true;
        this.tasks.length = 0;
    }

    get activeCount() {
        return this.tasks.filter((task) => task.active).length;
    }
}

// ---------------------------------------------------------------------------
// Script handles
// ---------------------------------------------------------------------------

function isCallable(value: VMValue) {
    return value instanceof VMLambda || value instanceof VMBoundMethod || value instanceof VMNativeFunction || (value instanceof VMList && value.items.length > 0);
}

/** What `Tween.Move(...)` returns; every setter returns the tween so calls can be chained. */
export class TweenHandle implements HostObject {
    readonly hostType = "Tween";
    readonly tween: Tween;
    private readonly run: CallbackRunner;

    constructor(tween: Tween, run: CallbackRunner) {
        this.tween = tween;
        this.run = run;
    }

    isType(name: string) {
        return name === "Tween" || name === "Tweener" || name === "Object";
    }

    get(name: string): VMValue {
        const tween = this.tween;
        switch (name) {
            case "isPlaying": return tween.alive && !tween.paused;
            case "isActive": return tween.alive;
            case "isComplete": return tween.completed;
            case "duration": return tween.duration;
            case "elapsed": return Math.max(0, tween.elapsed - tween.delay);
            case "delay": return tween.delay;
            case "loops": return tween.loops;
            default: return hostError(`Tween.${name} yok.`, "MissingMemberException");
        }
    }

    set(name: string, value: VMValue): void {
        if (name === "delay") this.tween.delay = Math.max(0, toNumber(value, "delay"));
        else hostError(`Tween.${name} değiştirilemez.`, "InvalidOperationException");
    }

    call(name: string, args: VMValue[]): VMValue {
        const tween = this.tween;
        switch (name) {
            case "SetEase":
                tween.easing = easingFromName(args[0], tween.easing);
                return this;
            case "SetDelay":
                tween.delay = Math.max(0, toNumber(args[0] ?? 0, "delay"));
                return this;
            case "SetLoops": {
                const loops = Math.trunc(toNumber(args[0] ?? 1, "loops"));
                tween.loops = loops < 0 ? -1 : Math.max(1, loops);
                const type = String(args[1] ?? "Restart").toLowerCase();
                tween.loopType = type.includes("yoyo") ? "yoyo" : "restart";
                return this;
            }
            case "OnComplete":
                if (!isCallable(args[0] ?? null)) hostError("OnComplete bir fonksiyon (lambda veya metot) bekliyor.", "ArgumentException");
                tween.onComplete.push(args[0] ?? null);
                return this;
            case "OnUpdate":
                if (!isCallable(args[0] ?? null)) hostError("OnUpdate bir fonksiyon (lambda veya metot) bekliyor.", "ArgumentException");
                tween.onUpdate = args[0] ?? null;
                return this;
            case "Pause":
                tween.paused = true;
                return this;
            case "Play":
                tween.paused = false;
                return this;
            case "Restart":
                tween.restart();
                return this;
            case "Kill":
                tween.kill(toBool(args[0] ?? false), this.run);
                return undefined;
            case "Complete":
                tween.kill(true, this.run);
                return undefined;
            case "WaitForCompletion":
                // yield return tween.WaitForCompletion();
                return new YieldInstruction("until", new VMNativeFunction("WaitForCompletion", () => !tween.alive));
            case "ToString":
                return this.toString();
            default:
                return hostError(`Tween.${name}() yok.`, "MissingMemberException");
        }
    }

    toString() {
        return `Tween(${this.tween.kind})`;
    }
}

export class TimerHandle implements HostObject {
    readonly hostType = "Timer";
    readonly task: TimerTask;

    constructor(task: TimerTask) {
        this.task = task;
    }

    get(name: string): VMValue {
        switch (name) {
            case "isActive": return this.task.active;
            case "isDone": return this.task.done;
            case "remaining": return Math.max(0, this.task.remaining);
            case "interval": return this.task.interval;
            default: return hostError(`Timer.${name} yok.`, "MissingMemberException");
        }
    }

    set(name: string): void {
        hostError(`Timer.${name} değiştirilemez.`, "InvalidOperationException");
    }

    call(name: string): VMValue {
        if (name === "Cancel" || name === "Stop") {
            this.task.cancelled = true;
            return undefined;
        }
        if (name === "ToString") return this.toString();
        return hostError(`Timer.${name}() yok.`, "MissingMemberException");
    }

    toString() {
        return `Timer(${this.task.interval}s${this.task.repeat ? ", tekrar" : ""})`;
    }
}

/** Accepts a Vector3 or a single number (uniform scale) for scale tweens. */
export function scaleTarget(value: VMValue): Vector3 {
    if (isVector(value)) return toVector(value, "ölçek");
    const uniform = toNumber(value ?? 1, "ölçek");
    return { x: uniform, y: uniform, z: uniform };
}

export { vec };
