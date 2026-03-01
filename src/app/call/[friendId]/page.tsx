"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX, ArrowLeft } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, onSnapshot, deleteDoc } from "firebase/firestore";

export default function CallPage() {
    const { data: session } = useSession();
    const router = useRouter();
    const params = useParams();
    const { t } = useI18n();
    const friendEmail = decodeURIComponent(params.friendId as string);

    const [friendData, setFriendData] = useState<any>(null);
    const [callStatus, setCallStatus] = useState<"calling" | "ringing" | "active" | "ended">("calling");
    const [duration, setDuration] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const [isSpeaker, setIsSpeaker] = useState(false);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (!session?.user?.email) { router.push("/login"); return; }
        loadFriendData();
        initCall();
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [session]);

    const loadFriendData = async () => {
        const friendDoc = await getDoc(doc(db, "users", friendEmail));
        if (friendDoc.exists()) setFriendData(friendDoc.data());
    };

    const initCall = async () => {
        if (!session?.user?.email) return;
        const callId = [session.user.email, friendEmail].sort().join("_call_");
        await setDoc(doc(db, "calls", callId), {
            caller: session.user.email,
            callee: friendEmail,
            status: "calling",
            startedAt: new Date().toISOString(),
        });

        // Listen for call status changes
        const unsub = onSnapshot(doc(db, "calls", callId), (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                if (data.status === "active") {
                    setCallStatus("active");
                    if (!timerRef.current) {
                        timerRef.current = setInterval(() => setDuration(p => p + 1), 1000);
                    }
                } else if (data.status === "ended") {
                    setCallStatus("ended");
                    if (timerRef.current) clearInterval(timerRef.current);
                    setTimeout(() => router.push(`/messages/${encodeURIComponent(friendEmail)}`), 2000);
                }
            }
        });

        // Simulate ringing after 2s
        setTimeout(() => {
            if (callStatus === "calling") setCallStatus("ringing");
        }, 2000);

        // Simulate call connection after 5s (demo)
        setTimeout(async () => {
            await setDoc(doc(db, "calls", callId), { status: "active" }, { merge: true });
        }, 5000);

        return () => unsub();
    };

    const endCall = async () => {
        if (!session?.user?.email) return;
        const callId = [session.user.email, friendEmail].sort().join("_call_");
        await setDoc(doc(db, "calls", callId), { status: "ended" }, { merge: true });
        setCallStatus("ended");
        if (timerRef.current) clearInterval(timerRef.current);
        setTimeout(() => router.push(`/messages/${encodeURIComponent(friendEmail)}`), 1500);
    };

    const formatDuration = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
    };

    if (!session?.user) return null;

    return (
        <div className="h-screen flex flex-col items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-950 to-black text-white relative overflow-hidden">
            {/* Background Blur Circles */}
            <div className="absolute top-20 left-10 w-72 h-72 bg-blue-600/10 rounded-full blur-3xl" />
            <div className="absolute bottom-20 right-10 w-80 h-80 bg-purple-600/10 rounded-full blur-3xl" />

            {/* Back button */}
            <button onClick={() => router.back()} className="absolute top-6 left-6 p-2 rounded-lg hover:bg-white/10 transition-colors">
                <ArrowLeft className="w-5 h-5" />
            </button>

            {/* Avatar */}
            <div className="relative mb-6">
                {friendData?.avatarUrl ? (
                    <img src={friendData.avatarUrl} alt="" className="w-28 h-28 rounded-full object-cover border-4 border-white/10" referrerPolicy="no-referrer" />
                ) : (
                    <div className="w-28 h-28 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-4xl border-4 border-white/10">
                        {friendData?.username?.charAt(0) || "?"}
                    </div>
                )}
                {callStatus === "active" && (
                    <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-green-500 border-4 border-zinc-950 flex items-center justify-center">
                        <Phone className="w-3.5 h-3.5 text-white" />
                    </div>
                )}
            </div>

            {/* Name */}
            <h2 className="text-2xl font-bold mb-1">{friendData?.username || friendEmail}</h2>

            {/* Status */}
            <p className={`text-sm mb-8 ${callStatus === "active" ? "text-green-400" : "text-zinc-400"}`}>
                {callStatus === "calling" && (t("calling") || "Aranıyor...")}
                {callStatus === "ringing" && (t("ringing") || "Çalıyor...")}
                {callStatus === "active" && formatDuration(duration)}
                {callStatus === "ended" && (t("call_ended") || "Arama sona erdi")}
            </p>

            {/* Pulse animation while calling */}
            {(callStatus === "calling" || callStatus === "ringing") && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -z-10">
                    <div className="w-40 h-40 rounded-full border-2 border-blue-500/30 animate-ping" />
                    <div className="w-56 h-56 rounded-full border border-blue-500/10 animate-ping absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ animationDelay: "0.5s" }} />
                </div>
            )}

            {/* Controls */}
            {callStatus !== "ended" && (
                <div className="flex items-center gap-6 mt-4">
                    <button
                        onClick={() => setIsMuted(!isMuted)}
                        className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${isMuted ? "bg-red-500/20 text-red-400" : "bg-white/10 text-white hover:bg-white/20"
                            }`}
                        title={isMuted ? (t("unmute") || "Sesi Aç") : (t("mute") || "Sessize Al")}
                    >
                        {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                    </button>

                    <button
                        onClick={endCall}
                        className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-all shadow-lg shadow-red-600/30"
                    >
                        <PhoneOff className="w-7 h-7" />
                    </button>

                    <button
                        onClick={() => setIsSpeaker(!isSpeaker)}
                        className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${isSpeaker ? "bg-blue-500/20 text-blue-400" : "bg-white/10 text-white hover:bg-white/20"
                            }`}
                        title={isSpeaker ? (t("speaker_off") || "Hoparlörü Kapat") : (t("speaker_on") || "Hoparlörü Aç")}
                    >
                        {isSpeaker ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
                    </button>
                </div>
            )}
        </div>
    );
}
