/** Opening Project settings on a tab from anywhere in the editor (the Inspector's "Edit layers…", the rules note…). */
export type SettingsTab = "project" | "input" | "touch" | "layers" | "languages" | "arcade" | "scene";

export const OPEN_SETTINGS_EVENT = "hanogt-engine:open-settings";

export function openSettings(tab: SettingsTab) {
    window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT, { detail: { tab } }));
}
