"use client";

/**
 * Hanogt Social preferences and read markers that live in this browser
 * (localStorage): when a group was last read, closed conversations, the
 * per-group notification level, the microphone/headphone toggles, the chosen
 * microphone and speaker, and the collapsed side panel. Every change is
 * announced to the other components
 * of this tab (and to other tabs through the storage event).
 */
import { useMemo, useSyncExternalStore } from "react";
import { isGroupNotifyLevel, type GroupNotifyLevel } from "./model";

const CHANGE_EVENT = "hanogt:social-local";
const HIDDEN_DMS_KEY = "hanogt_social_hidden_dms";
const NOTIFY_KEY = "hanogt_social_notify";
const AUDIO_KEY = "hanogt_social_audio";
const DEVICES_KEY = "hanogt_social_audio_devices";
const ASIDE_KEY = "hanogt_social_aside";
const MAP_ENTRIES_MAX = 300;

function storage(): Storage | null {
    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

function read(key: string): string | null {
    try {
        return storage()?.getItem(key) ?? null;
    } catch {
        return null;
    }
}

function write(key: string, value: string | null) {
    try {
        if (value === null) storage()?.removeItem(key);
        else storage()?.setItem(key, value);
    } catch {
        // Storage can be blocked (private mode); the value then lasts for this page only.
    }
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: key }));
}

function subscribe(listener: () => void) {
    window.addEventListener(CHANGE_EVENT, listener);
    window.addEventListener("storage", listener);
    return () => {
        window.removeEventListener(CHANGE_EVENT, listener);
        window.removeEventListener("storage", listener);
    };
}

function useStoredValue(key: string) {
    return useSyncExternalStore(subscribe, () => read(key), () => null);
}

function readNumberMap(raw: string | null): Record<string, number> {
    try {
        const parsed = JSON.parse(raw || "{}") as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
        return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1])));
    } catch {
        return {};
    }
}

/** Keeps the newest entries when a map grows beyond the cap. */
function capMap<T>(map: Record<string, T>, order: (value: T) => number) {
    const entries = Object.entries(map);
    if (entries.length <= MAP_ENTRIES_MAX) return map;
    return Object.fromEntries(entries.sort((a, b) => order(b[1]) - order(a[1])).slice(0, MAP_ENTRIES_MAX));
}

/* -------------------------------------------------------------------------- */
/* Group read markers (the existing "last read" mechanism of groups)          */
/* -------------------------------------------------------------------------- */

export const groupReadKey = (groupId: string) => `hanogt_group_read_${groupId}`;

export function getGroupReadAt(groupId: string) {
    return Number(read(groupReadKey(groupId)) || 0) || 0;
}

/** Having a group's chat on screen counts as reading it up to `time`. */
export function markGroupRead(groupId: string, time: number) {
    if (!groupId || !Number.isFinite(time) || time <= getGroupReadAt(groupId)) return;
    write(groupReadKey(groupId), String(Math.floor(time)));
}

/** Last-read times of the given groups, updated when any of them changes. */
export function useGroupReadMap(groupIds: readonly string[]): Record<string, number> {
    const idsKey = groupIds.join(",");
    const snapshot = useSyncExternalStore(
        subscribe,
        () => (idsKey ? idsKey.split(",").map((id) => read(groupReadKey(id)) || "0").join("|") : ""),
        () => "",
    );
    return useMemo(() => {
        const values = snapshot ? snapshot.split("|") : [];
        const ids = idsKey ? idsKey.split(",") : [];
        return Object.fromEntries(ids.map((id, index) => [id, Number(values[index] || 0) || 0]));
    }, [idsKey, snapshot]);
}

/* -------------------------------------------------------------------------- */
/* Closed conversations                                                       */
/* -------------------------------------------------------------------------- */

/** Closed conversations: chat id → when it was closed (it comes back with a newer message). */
export function useHiddenDms() {
    const raw = useStoredValue(HIDDEN_DMS_KEY);
    return useMemo(() => readNumberMap(raw), [raw]);
}

export function hideDm(chatId: string, at = Date.now()) {
    const map = readNumberMap(read(HIDDEN_DMS_KEY));
    map[chatId] = at;
    write(HIDDEN_DMS_KEY, JSON.stringify(capMap(map, (value) => value)));
}

export function unhideDm(chatId: string) {
    const map = readNumberMap(read(HIDDEN_DMS_KEY));
    if (!(chatId in map)) return;
    delete map[chatId];
    write(HIDDEN_DMS_KEY, JSON.stringify(map));
}

/* -------------------------------------------------------------------------- */
/* Group notification levels                                                  */
/* -------------------------------------------------------------------------- */

function readLevels(raw: string | null): Record<string, GroupNotifyLevel> {
    try {
        const parsed = JSON.parse(raw || "{}") as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
        return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter((entry): entry is [string, GroupNotifyLevel] => isGroupNotifyLevel(entry[1])));
    } catch {
        return {};
    }
}

export function useGroupNotifyLevels() {
    const raw = useStoredValue(NOTIFY_KEY);
    return useMemo(() => readLevels(raw), [raw]);
}

export function setGroupNotifyLevel(groupId: string, level: GroupNotifyLevel) {
    const map = readLevels(read(NOTIFY_KEY));
    // "all" is the default and isn't stored.
    if (level === "all") delete map[groupId];
    else map[groupId] = level;
    write(NOTIFY_KEY, JSON.stringify(capMap(map, () => 0)));
}

/* -------------------------------------------------------------------------- */
/* Microphone / headphones and the side panel                                 */
/* -------------------------------------------------------------------------- */

export type SocialAudio = { micOff: boolean; deafened: boolean };

export function useSocialAudio(): SocialAudio {
    const raw = useStoredValue(AUDIO_KEY);
    return useMemo(() => {
        try {
            const parsed = JSON.parse(raw || "{}") as Partial<SocialAudio>;
            const deafened = parsed.deafened === true;
            // Like Discord: headphones off mutes the microphone too.
            return { deafened, micOff: deafened || parsed.micOff === true };
        } catch {
            return { micOff: false, deafened: false };
        }
    }, [raw]);
}

export function setSocialAudio(next: SocialAudio) {
    write(AUDIO_KEY, JSON.stringify({ micOff: next.micOff, deafened: next.deafened }));
}

/** Microphone and speaker for calls and voice messages; null = the system default. */
export type AudioDevices = { input: string | null; output: string | null };

function deviceId(value: unknown) {
    return typeof value === "string" && value.length > 0 && value.length <= 200 ? value : null;
}

function parseDevices(raw: string | null): AudioDevices {
    try {
        const parsed = JSON.parse(raw || "{}") as Partial<Record<keyof AudioDevices, unknown>>;
        return { input: deviceId(parsed.input), output: deviceId(parsed.output) };
    } catch {
        return { input: null, output: null };
    }
}

export function useAudioDevices(): AudioDevices {
    const raw = useStoredValue(DEVICES_KEY);
    return useMemo(() => parseDevices(raw), [raw]);
}

/** The stored choice outside React (the call engine reads it when a call starts). */
export function readAudioDevices(): AudioDevices {
    return parseDevices(read(DEVICES_KEY));
}

export function setAudioDevices(next: Partial<AudioDevices>) {
    const current = readAudioDevices();
    const merged = { ...current, ...next };
    write(DEVICES_KEY, merged.input || merged.output ? JSON.stringify({ input: deviceId(merged.input), output: deviceId(merged.output) }) : null);
}

/** Whether the right-hand panel (members / profile) is collapsed on wide screens. */
export function useAsideCollapsed() {
    return useStoredValue(ASIDE_KEY) === "1";
}

export function setAsideCollapsed(collapsed: boolean) {
    write(ASIDE_KEY, collapsed ? "1" : null);
}
