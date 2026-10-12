/**
 * Engine rules (V6 panel): a project keeps the behaviour of the engine it was
 * made with wherever a later engine changed it. The Engine rules panel moves a
 * project to the newest rules and can take it back.
 */
import { ENGINE_VERSION, type EngineRules, type ProjectSettings } from "./types";

/** The newest rules (those of this engine). */
export const LATEST_RULES: EngineRules = ENGINE_VERSION;

/** Moves a project to the newest rules, remembering the old ones; false when it already has them. */
export function upgradeRules(settings: Pick<ProjectSettings, "rules" | "rulesBefore">): boolean {
    if (settings.rules >= LATEST_RULES) return false;
    settings.rulesBefore = settings.rules;
    settings.rules = LATEST_RULES;
    return true;
}

/** Takes an upgrade back (the rules the project had before it); false when there is nothing to undo. */
export function undoRulesUpgrade(settings: Pick<ProjectSettings, "rules" | "rulesBefore">): boolean {
    if (settings.rulesBefore === null || settings.rulesBefore >= settings.rules) return false;
    settings.rules = settings.rulesBefore;
    settings.rulesBefore = null;
    return true;
}

/** The rule sets an upgrade from `rules` goes through (e.g. 4 → [5, 6]). */
export function rulesToUpgrade(rules: EngineRules): EngineRules[] {
    const output: EngineRules[] = [];
    for (let next = rules + 1; next <= LATEST_RULES; next += 1) output.push(next as EngineRules);
    return output;
}
