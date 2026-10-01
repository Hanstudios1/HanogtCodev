"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchMediaViewer } from "@/components/Editor/media-api";
import {
    MEDIA_PUBLICATIONS_KEY, findStoredPublication, ownerTag, parseStoredPublications, withStoredPublication, withoutStoredPost, type MediaPublication,
} from "@/components/Editor/media-publish";

function readList() {
    try {
        return parseStoredPublications(window.localStorage.getItem(MEDIA_PUBLICATIONS_KEY));
    } catch {
        return [];
    }
}

function writeList(list: ReturnType<typeof readList>) {
    try {
        if (list.length) window.localStorage.setItem(MEDIA_PUBLICATIONS_KEY, JSON.stringify(list));
        else window.localStorage.removeItem(MEDIA_PUBLICATIONS_KEY);
    } catch {
        // Storage is unavailable; the link to the post then lasts for this visit only.
    }
}

/** The post remembered in this browser for a saved workspace ("project:<id>", "game:<project>:<script>"). */
export function storedPublication(email: string, key: string | null): MediaPublication | null {
    return email && key ? findStoredPublication(readList(), ownerTag(email), key) : null;
}

/**
 * The Media post of the open workspace. Saved workspaces keep it in
 * localStorage (hanogt_media_publications, scoped to the account by a hash of
 * the address); unsaved drafts keep it with the editor's recovery data. A
 * restored post is checked against the server once, because it may have been
 * deleted on the Media page or from another device.
 */
export function useMediaPublication(email: string, workspaceKey: string | null) {
    const [publication, setPublication] = useState<MediaPublication | null>(null);
    const [verified, setVerified] = useState<string | null>(null);

    useEffect(() => {
        if (publication && workspaceKey && email) writeList(withStoredPublication(readList(), ownerTag(email), workspaceKey, publication));
    }, [email, workspaceKey, publication]);

    const postId = publication?.postId ?? null;
    useEffect(() => {
        if (!postId || !email || verified === postId) return;
        const controller = new AbortController();
        fetchMediaViewer(postId, controller.signal).then((data) => {
            const post = data.post;
            // Without a server session ownership can't be told; keep the link and check next time.
            if (post && !data.viewer.signedIn) return;
            setVerified(postId);
            if (post?.owned) {
                // The title may have been edited on the Media page.
                setPublication((current) => (current?.postId === postId && current.title !== post.title ? { ...current, title: post.title } : current));
                return;
            }
            writeList(withoutStoredPost(readList(), ownerTag(email), postId));
            setPublication((current) => (current?.postId === postId ? null : current));
        }).catch(() => {
            // Offline or a server error: keep the link and check again on the next visit.
        });
        return () => controller.abort();
    }, [email, postId, verified]);

    /** Forgets a post that was unpublished or no longer exists. */
    const forget = useCallback((id: string) => {
        if (email) writeList(withoutStoredPost(readList(), ownerTag(email), id));
        setPublication((current) => (current?.postId === id ? null : current));
    }, [email]);

    /** Records a post that was just published or updated from this workspace (it counts as checked). */
    const record = useCallback((next: MediaPublication) => {
        setVerified(next.postId);
        setPublication(next);
    }, []);

    return { publication, setPublication, record, forget };
}
