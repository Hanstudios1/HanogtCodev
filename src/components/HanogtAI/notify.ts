"use client";

/**
 * "Tell me when the answer is ready": a browser notification when Hanogt AI
 * finishes while the tab is in the background (the Hanogt AI setting
 * notifyOnDone). Nothing leaves the browser; the permission is the browser's.
 */

export type NotifyPermission = "granted" | "denied" | "default" | "unsupported";

export function notificationPermission(): NotifyPermission {
    if (typeof window === "undefined" || typeof Notification === "undefined") return "unsupported";
    return Notification.permission;
}

/** Asks the browser for permission (only after the person turns the setting on). */
export async function requestAnswerNotifications(): Promise<NotifyPermission> {
    if (notificationPermission() === "unsupported") return "unsupported";
    try {
        return await Notification.requestPermission();
    } catch {
        return notificationPermission();
    }
}

/** Shows the notification when the page is hidden and permission is granted; clicking it brings the tab back. */
export function notifyAnswerDone(title: string, answer: string) {
    if (notificationPermission() !== "granted" || document.visibilityState === "visible") return;
    const body = answer.replace(/```[\s\S]*?```/g, " ").replace(/[#*_`>|]/g, "").replace(/\s+/g, " ").trim().slice(0, 140);
    try {
        const notification = new Notification(title, { body: body || title, icon: "/brand/ai-128.png", tag: "hanogt-ai-answer" });
        notification.onclick = () => {
            window.focus();
            notification.close();
        };
    } catch {
        // Some browsers only allow notifications from a service worker; the answer is still on the page.
    }
}
