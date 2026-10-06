/**
 * The Animator state machine (V5): parameter values, the current state and
 * its transitions. Entering a state plays its clip through the object's
 * AnimationPlayer (blending over the transition's duration), so the Animation
 * component keeps doing the actual animating.
 */
import { ANIMATOR_ANY_STATE, type AnimatorComponent, type AnimatorCondition, type AnimatorParameter, type AnimatorState, type AnimatorTransition } from "../types";
import type { AnimatedTarget, AnimationPlayer } from "./animator";

/** Stable 32-bit hash of a name (Animator.StringToHash). */
export function animatorHash(name: string): number {
    let hash = 0x811c9dc5;
    for (let index = 0; index < name.length; index += 1) {
        hash ^= name.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash | 0;
}

export class AnimatorController {
    readonly component: AnimatorComponent;
    /** Current parameter values; bools and triggers are 0 or 1. */
    readonly values = new Map<string, number>();
    state: AnimatorState | null = null;
    /** The transition that led into the current state, while its blend runs. */
    transition: AnimatorTransition | null = null;
    /** Script multiplier (Animator.speed); the component speed applies too. */
    speed = 1;
    started = false;

    constructor(component: AnimatorComponent) {
        this.component = component;
        for (const parameter of component.parameters) this.values.set(parameter.name, parameter.type === "trigger" ? 0 : parameter.value);
    }

    /** A parameter by name (exact first, then ignoring case) or by StringToHash value. */
    parameter(key: string | number): AnimatorParameter | null {
        const parameters = this.component.parameters;
        if (typeof key === "number") return parameters.find((parameter) => animatorHash(parameter.name) === key) ?? null;
        return parameters.find((parameter) => parameter.name === key) ?? parameters.find((parameter) => parameter.name.toLowerCase() === key.toLowerCase()) ?? null;
    }

    /** A state by name (exact first, then ignoring case) or by StringToHash value. */
    findState(key: string | number): AnimatorState | null {
        const states = this.component.states;
        if (typeof key === "number") return states.find((state) => animatorHash(state.name) === key) ?? null;
        return states.find((state) => state.name === key) ?? states.find((state) => state.name.toLowerCase() === key.toLowerCase()) ?? null;
    }

    get defaultState(): AnimatorState | null {
        const states = this.component.states;
        return states.find((state) => state.id === this.component.defaultState) ?? states[0] ?? null;
    }

    value(parameter: AnimatorParameter): number {
        return this.values.get(parameter.name) ?? 0;
    }

    /** Applies the state's speed and the Animator's to the clip player. */
    syncSpeed(player: AnimationPlayer | null) {
        if (player && this.state) player.stateSpeed = this.state.speed * this.component.speed * this.speed;
    }

    /**
     * Enters a state: plays (or blends to) its clip. Returns false when the
     * state names a clip the Animation component doesn't have.
     */
    enter(state: AnimatorState, player: AnimationPlayer | null, target: AnimatedTarget, duration: number, transition: AnimatorTransition | null = null): boolean {
        this.state = state;
        this.transition = transition && duration > 0 ? transition : null;
        if (!player) return !state.clip;
        player.ownsPose = true;
        this.syncSpeed(player);
        if (!state.clip) {
            player.stop(target);
            return true;
        }
        return player.crossFade(target, state.clip, duration);
    }

    conditionHolds(condition: AnimatorCondition): boolean {
        const parameter = this.parameter(condition.parameter);
        if (!parameter) return false;
        const value = this.value(parameter);
        switch (condition.mode) {
            case "if": return value !== 0;
            case "ifNot": return value === 0;
            case "greater": return value > condition.threshold;
            case "less": return value < condition.threshold;
            case "equals": return value === condition.threshold;
            case "notEqual": return value !== condition.threshold;
        }
    }

    /**
     * The transition to take now, given how far the current clip has played:
     * Any State transitions first, then the current state's, in list order.
     */
    pick(normalizedTime: number): AnimatorTransition | null {
        const current = this.state;
        const transitions = this.component.transitions;
        const candidates = [
            ...transitions.filter((transition) => transition.from === ANIMATOR_ANY_STATE),
            ...(current ? transitions.filter((transition) => transition.from === current.id) : []),
        ];
        for (const transition of candidates) {
            // An Any State transition into the state that is already playing would restart it every
            // frame; it only fires again through a trigger.
            if (transition.from === ANIMATOR_ANY_STATE && current && transition.to === current.id
                && !transition.conditions.some((condition) => this.parameter(condition.parameter)?.type === "trigger")) continue;
            if (transition.hasExitTime && normalizedTime < transition.exitTime) continue;
            if (!transition.conditions.every((condition) => this.conditionHolds(condition))) continue;
            if (!this.component.states.some((state) => state.id === transition.to)) continue;
            return transition;
        }
        return null;
    }

    /** Clears the triggers a transition used (Unity consumes a trigger when a transition takes it). */
    consume(transition: AnimatorTransition) {
        for (const condition of transition.conditions) {
            const parameter = this.parameter(condition.parameter);
            if (parameter?.type === "trigger") this.values.set(parameter.name, 0);
        }
    }

    targetOf(transition: AnimatorTransition): AnimatorState | null {
        return this.component.states.find((state) => state.id === transition.to) ?? null;
    }
}
