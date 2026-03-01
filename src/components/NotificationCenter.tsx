"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, UserPlus, MessageCircle, Phone, Star, Trash2, Check, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, onSnapshot, doc, setDoc, deleteDoc, getDocs, limit } from "firebase/firestore";

type Notification = {
    id: string;
    type: "friend_request" | "message" | "call" | "like" | "system";
    title: string;
    body: string;
    fromEmail?: string;
    fromAvatar?: string;
    read: boolean;
    createdAt: any;
    actionUrl?: string;
};

export default function NotificationCenter({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const { data: session } = useSession();
    const router = useRouter();
    const { t } = useI18n();
    const [notifications, setNotifications] = useState<Notification[]>([]);

    useEffect(() => {
        if (!session?.user?.email || !isOpen) return;
        const q = query(
            collection(db, "notifications", session.user.email, "items"),
            orderBy("createdAt", "desc"),
            limit(50)
        );
        const unsub = onSnapshot(q, (snap) => {
            setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() as Omit<Notification, "id"> })));
        });
        return () => unsub();
    }, [session, isOpen]);

    const markAsRead = async (id: string) => {
        if (!session?.user?.email) return;
        await setDoc(doc(db, "notifications", session.user.email, "items", id), { read: true }, { merge: true });
    };

    const markAllAsRead = async () => {
        if (!session?.user?.email) return;
        const unread = notifications.filter(n => !n.read);
        for (const n of unread) {
            await setDoc(doc(db, "notifications", session.user.email, "items", n.id), { read: true }, { merge: true });
        }
    };

    const clearAll = async () => {
        if (!session?.user?.email) return;
        for (const n of notifications) {
            await deleteDoc(doc(db, "notifications", session.user.email, "items", n.id));
        }
        setNotifications([]);
    };

    const handleClick = (notif: Notification) => {
        markAsRead(notif.id);
        if (notif.actionUrl) router.push(notif.actionUrl);
        onClose();
    };

    const getIcon = (type: string) => {
        switch (type) {
            case "friend_request": return <UserPlus className="w-4 h-4 text-blue-500" />;
            case "message": return <MessageCircle className="w-4 h-4 text-green-500" />;
            case "call": return <Phone className="w-4 h-4 text-amber-500" />;
            case "like": return <Star className="w-4 h-4 text-yellow-500" />;
            default: return <Bell className="w-4 h-4 text-zinc-500" />;
        }
    };

    const unreadCount = notifications.filter(n => !n.read).length;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[90]" onClick={onClose}>
            <div
                className="absolute right-4 top-16 w-96 max-h-[70vh] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Bell className="w-5 h-5 text-blue-500" />
                        <h3 className="font-bold">{t("notifications") || "Bildirimler"}</h3>
                        {unreadCount > 0 && (
                            <span className="px-1.5 py-0.5 text-xs font-bold bg-red-500 text-white rounded-full">{unreadCount}</span>
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        <button onClick={markAllAsRead} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs text-blue-500" title={t("mark_all_read") || "Tümünü Okundu İşaretle"}>
                            <Check className="w-4 h-4" />
                        </button>
                        <button onClick={clearAll} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs text-red-500" title={t("clear_all") || "Tümünü Temizle"}>
                            <Trash2 className="w-4 h-4" />
                        </button>
                        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Notifications List */}
                <div className="overflow-y-auto max-h-[calc(70vh-60px)]">
                    {notifications.length === 0 ? (
                        <div className="py-12 text-center">
                            <BellOff className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
                            <p className="text-zinc-500 text-sm">{t("no_notifications") || "Bildirim yok"}</p>
                        </div>
                    ) : (
                        notifications.map(notif => (
                            <button
                                key={notif.id}
                                onClick={() => handleClick(notif)}
                                className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors border-b border-zinc-100 dark:border-zinc-800/50 ${!notif.read ? "bg-blue-50/50 dark:bg-blue-900/10" : ""
                                    }`}
                            >
                                {notif.fromAvatar ? (
                                    <img src={notif.fromAvatar} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0 mt-0.5" referrerPolicy="no-referrer" />
                                ) : (
                                    <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                                        {getIcon(notif.type)}
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className={`text-sm ${!notif.read ? "font-semibold" : "font-medium text-zinc-600 dark:text-zinc-400"}`}>
                                        {notif.title}
                                    </p>
                                    <p className="text-xs text-zinc-500 mt-0.5 truncate">{notif.body}</p>
                                </div>
                                {!notif.read && (
                                    <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-2" />
                                )}
                            </button>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
