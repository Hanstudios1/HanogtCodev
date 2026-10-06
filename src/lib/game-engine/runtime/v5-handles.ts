/** Script handles of the V5 components: Animator (and its AnimatorStateInfo). */
import { VMList, type HostObject, type VMRef, type VMValue } from "../script/values";
import type { AnimatorComponent, AnimatorParameter, AnimatorParameterType } from "../types";
import { animatorHash } from "./animator-controller";
import { ComponentHandle, hostError, toBool, toNumber } from "./handles";

interface StateInfo {
    name: string;
    normalizedTime: number;
    length: number;
    loop: boolean;
    speed: number;
}

/** What GetCurrentAnimatorStateInfo returns: a snapshot of the state at the time of the call. */
export class AnimatorStateInfoHandle implements HostObject {
    readonly hostType = "AnimatorStateInfo";
    readonly info: StateInfo;

    constructor(info: StateInfo) {
        this.info = info;
    }

    isType(name: string) {
        return name === "AnimatorStateInfo";
    }

    get(name: string): VMValue {
        const info = this.info;
        switch (name) {
            case "normalizedTime": return info.normalizedTime;
            case "length": return info.length;
            case "loop": return info.loop;
            case "speed":
            case "speedMultiplier": return info.speed;
            case "shortNameHash":
            case "fullPathHash":
            case "nameHash": return animatorHash(info.name);
            case "tagHash": return 0;
            case "name": return info.name;
            default: return hostError(`AnimatorStateInfo.${name} yok.`, "MissingMemberException");
        }
    }

    set(name: string): void {
        hostError(`AnimatorStateInfo.${name} salt okunur.`, "InvalidOperationException");
    }

    call(name: string, args: VMValue[]): VMValue {
        switch (name) {
            case "IsName": {
                const wanted = String(args[0] ?? "");
                const own = this.info.name.toLowerCase();
                // Unity also accepts "Base Layer.Run".
                return wanted.toLowerCase() === own || wanted.toLowerCase().endsWith(`.${own}`);
            }
            case "IsTag": return false;
            case "ToString": return this.toString();
            default: return hostError(`AnimatorStateInfo.${name}() yok.`, "MissingMemberException");
        }
    }

    toString() {
        return `AnimatorStateInfo(${this.info.name})`;
    }
}

export class AnimatorHandle extends ComponentHandle<AnimatorComponent> {
    readonly hostType = "Animator";

    protected typeNames(): string[] {
        return ["Animator", "Behaviour", "Component", "Object", "UnityEngine.Object"];
    }

    private get controller() {
        return this.world.animatorControllerOf(this.entity);
    }

    /** The parameter a call names (by name or StringToHash value); warns once when it's missing or of another type. */
    private parameterFor(key: VMValue, types: readonly AnimatorParameterType[], method: string): AnimatorParameter | null {
        const lookup = typeof key === "number" ? key : String(key ?? "");
        const parameter = this.controller?.parameter(lookup) ?? null;
        if (!parameter) {
            this.world.warnOnce(`animator-param:${this.entity.id}:${String(lookup)}`, `Animator.${method}: '${this.entity.name}' Animator'ında '${String(lookup)}' adında bir parametre yok.`);
            return null;
        }
        if (!types.includes(parameter.type)) {
            this.world.warnOnce(`animator-type:${this.entity.id}:${parameter.name}:${method}`, `Animator.${method}: '${parameter.name}' bir ${parameter.type} parametresi; ${method} onu değiştiremez.`);
            return null;
        }
        return parameter;
    }

    private stateInfo(): AnimatorStateInfoHandle {
        const controller = this.controller;
        const state = controller?.state ?? null;
        const player = this.world.animatorOf(this.entity);
        const clip = state?.clip && player?.clip ? player.clip : null;
        return new AnimatorStateInfoHandle({
            name: state?.name ?? "",
            normalizedTime: clip && player ? player.normalizedTime : this.world.animatorStateTime(this.entity),
            length: clip?.duration ?? 0,
            loop: clip ? clip.wrap !== "once" : false,
            speed: state?.speed ?? 1,
        });
    }

    private jump(key: VMValue, seconds: number | null, normalizedTime: VMValue, method: string) {
        const controller = this.controller;
        const lookup = typeof key === "number" ? key : String(key ?? "");
        const state = controller?.findState(lookup) ?? null;
        if (!controller || !state) {
            this.world.warnOnce(`animator-state:${this.entity.id}:${String(lookup)}`, `Animator.${method}: '${this.entity.name}' Animator'ında '${String(lookup)}' adında bir durum yok.`);
            return;
        }
        this.world.enterAnimatorState(this.entity, controller, state, seconds ?? 0, null);
        const player = this.world.animatorOf(this.entity);
        if (typeof normalizedTime === "number" && Number.isFinite(normalizedTime) && player?.clip && state.clip) {
            player.time = Math.max(0, normalizedTime) * player.clip.duration;
        }
    }

    get(name: string): VMValue {
        const controller = this.controller;
        switch (name) {
            case "speed": return controller?.speed ?? 1;
            case "parameterCount": return this.component.parameters.length;
            case "parameters": return new VMList(this.component.parameters.map((parameter) => parameter.name), "Array");
            case "layerCount": return 1;
            case "isInitialized": return Boolean(controller?.started);
            case "hasRootMotion":
            case "applyRootMotion": return false;
            case "currentState": return controller?.state?.name ?? null;
            default: {
                const common = this.componentGet(name);
                if (common !== undefined) return common;
                return this.unknown(name);
            }
        }
    }

    set(name: string, value: VMValue): void {
        switch (name) {
            case "speed": {
                const controller = this.controller;
                if (!controller) return;
                controller.speed = Math.max(0, Math.min(10, toNumber(value, "speed")));
                controller.syncSpeed(this.world.animatorOf(this.entity));
                return;
            }
            case "applyRootMotion":
                return;
            default:
                if (this.componentSet(name, value)) return;
                this.unknown(name);
        }
    }

    call(name: string, args: VMValue[], typeArgs: string[], refs?: Array<VMRef | null>): VMValue {
        const controller = this.controller;
        switch (name) {
            case "SetBool": {
                const parameter = this.parameterFor(args[0], ["bool"], name);
                if (parameter && controller) controller.values.set(parameter.name, toBool(args[1] ?? false) ? 1 : 0);
                return undefined;
            }
            case "GetBool": {
                const parameter = this.parameterFor(args[0], ["bool", "trigger"], name);
                return Boolean(parameter && controller && controller.value(parameter) !== 0);
            }
            case "SetFloat": {
                const parameter = this.parameterFor(args[0], ["float"], name);
                if (!parameter || !controller) return undefined;
                const target = toNumber(args[1] ?? 0, "değer");
                // SetFloat(name, value, dampTime, deltaTime) eases toward the value.
                if (args.length >= 4) {
                    const dampTime = Math.max(0, toNumber(args[2], "dampTime"));
                    const deltaTime = Math.max(0, toNumber(args[3], "deltaTime"));
                    const current = controller.value(parameter);
                    controller.values.set(parameter.name, dampTime > 0 ? current + (target - current) * (1 - Math.exp(-deltaTime / dampTime)) : target);
                } else controller.values.set(parameter.name, target);
                return undefined;
            }
            case "GetFloat": {
                const parameter = this.parameterFor(args[0], ["float", "int"], name);
                return parameter && controller ? controller.value(parameter) : 0;
            }
            case "SetInteger": {
                const parameter = this.parameterFor(args[0], ["int"], name);
                if (parameter && controller) controller.values.set(parameter.name, Math.trunc(toNumber(args[1] ?? 0, "değer")));
                return undefined;
            }
            case "GetInteger": {
                const parameter = this.parameterFor(args[0], ["int"], name);
                return parameter && controller ? Math.trunc(controller.value(parameter)) : 0;
            }
            case "SetTrigger": {
                const parameter = this.parameterFor(args[0], ["trigger"], name);
                if (parameter && controller) controller.values.set(parameter.name, 1);
                return undefined;
            }
            case "ResetTrigger": {
                const parameter = this.parameterFor(args[0], ["trigger"], name);
                if (parameter && controller) controller.values.set(parameter.name, 0);
                return undefined;
            }
            case "Play":
                this.jump(args[0], null, args[2], name);
                return undefined;
            case "CrossFade": {
                // The duration is a fraction of the current clip's length (Unity), CrossFadeInFixedTime takes seconds.
                const player = this.world.animatorOf(this.entity);
                const length = player?.clip?.duration ?? 1;
                this.jump(args[0], Math.max(0, toNumber(args[1] ?? 0.25, "süre")) * length, args[3], name);
                return undefined;
            }
            case "CrossFadeInFixedTime":
                this.jump(args[0], Math.max(0, toNumber(args[1] ?? 0.25, "süre")), args[3], name);
                return undefined;
            case "GetCurrentAnimatorStateInfo":
            case "GetNextAnimatorStateInfo":
                return this.stateInfo();
            case "IsInTransition":
                return Boolean(controller?.transition && this.world.animatorOf(this.entity)?.blending);
            case "HasState": {
                const key = args.length > 1 ? args[1] : args[0];
                return Boolean(controller?.findState(typeof key === "number" ? key : String(key ?? "")));
            }
            case "GetLayerWeight":
                return 1;
            case "SetLayerWeight":
            case "Rebind":
                return undefined;
            default:
                return super.call(name, args, typeArgs, refs);
        }
    }
}
