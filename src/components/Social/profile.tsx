"use client";

import { useCallback, useState } from "react";
import ProfileModal, { type UserProfile } from "@/components/ProfileModal";
import { socialApi } from "@/lib/social/api";
import type { SocialProfile, SocialProfileResponse } from "@/lib/social/model";
import { useSocial } from "./context";

/**
 * ProfileModal's shape. Presence fields are only passed when the caller may
 * see them; without them the modal shows no status at all.
 */
export function toModalProfile(profile: SocialProfile): UserProfile {
    const user: UserProfile = {
        email: profile.email,
        username: profile.username,
        nickname: profile.nickname || undefined,
        nicknameTag: profile.nicknameTag || undefined,
        avatarUrl: profile.avatarUrl ?? undefined,
        bannerUrl: profile.bannerUrl || undefined,
        bio: profile.bio || undefined,
        customStatus: profile.customStatus || undefined,
        statusEmoji: profile.statusEmoji || undefined,
        accentColor: profile.accentColor || undefined,
        favoriteLangs: profile.favoriteLangs,
        socialGithub: profile.socialGithub || undefined,
        socialLinkedin: profile.socialLinkedin || undefined,
        socialTwitter: profile.socialTwitter || undefined,
        socialWebsite: profile.socialWebsite || undefined,
        badges: profile.badges,
        publicProjects: profile.publicProjects,
        staffRole: profile.staffRole,
    };
    if (profile.presence) {
        user.presence = profile.presence;
        user.lastSeenAt = profile.lastSeenAt ?? undefined;
    }
    return user;
}

const cache = new Map<string, { at: number; data: SocialProfileResponse }>();
const CACHE_MS = 60_000;

/** Forgets cached profiles (what one account may see isn't what the next one may). */
export function clearSocialProfileCache() {
    cache.clear();
}

/** GET /api/social/profile, kept for a minute (the profile card and "Profili görüntüle" share it). */
export async function loadSocialProfile(email: string, force = false) {
    const cached = cache.get(email);
    if (!force && cached && Date.now() - cached.at < CACHE_MS) return cached.data;
    const data = await socialApi.profile(email);
    cache.set(email, { at: Date.now(), data });
    if (cache.size > 100) cache.delete(cache.keys().next().value as string);
    return data;
}

/** "Profili görüntüle": loads the full profile and shows ProfileModal. */
export function useProfileViewer() {
    const { notify, errorText } = useSocial();
    const [user, setUser] = useState<UserProfile | null>(null);
    const show = useCallback(async (email: string) => {
        try {
            const data = await loadSocialProfile(email, true);
            setUser(toModalProfile(data.person));
        } catch (error) {
            notify(errorText(error), "error");
        }
    }, [errorText, notify]);
    const element = user ? <ProfileModal user={user} isOpen onClose={() => setUser(null)} /> : null;
    return { show, element };
}
