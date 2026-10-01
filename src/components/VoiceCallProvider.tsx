"use client";

import { usePresence } from "@/components/Presence";
import OptimizedImage from "@/components/OptimizedImage";
import StaffBadge, { parseStaffRole } from "@/components/StaffBadge";
import { useI18n, type Copy } from "@/lib/i18n";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
    arrayUnion,
    collection,
    doc,
    getDoc,
    limit,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
    where,
} from "firebase/firestore";
import { Mic, MicOff, Phone, PhoneOff, ShieldCheck, Volume2, X } from "lucide-react";
import { db } from "@/lib/firebase";

export type CallPeer = { email: string; username: string; avatarUrl?: string; staffRole?: string | null };
type CallStatus = "idle" | "incoming" | "calling" | "connecting" | "active";
type CallContextValue = { startCall: (peer: CallPeer) => Promise<void>; status: CallStatus };

const VoiceCallContext = createContext<CallContextValue>({ startCall: async () => undefined, status: "idle" });

export function useVoiceCall() {
    return useContext(VoiceCallContext);
}

/** Error codes raised inside call callbacks; they are translated while rendering. */
const CALL_ERRORS: Record<string, Copy> = {
    "call:ice": { TR: "Arama bağlantısı hazırlanamadı.", EN: "The call connection couldn't be prepared." },
    "call:start": { TR: "Arama başlatılamadı.", EN: "The call couldn't be started." },
    "call:inactive": { TR: "Arama artık etkin değil.", EN: "This call is no longer active." },
    "call:answer": { TR: "Arama yanıtlanamadı.", EN: "The call couldn't be answered." },
};

export default function VoiceCallProvider({ children }: { children: React.ReactNode }) {
    const { data: session } = useSession();
    const { tx } = useI18n();
    const email = session?.user?.email?.toLowerCase() || "";
    const [status, setStatus] = useState<CallStatus>("idle");
    const [peer, setPeer] = useState<CallPeer | null>(null);
    const [callId, setCallId] = useState<string | null>(null);
    const [muted, setMuted] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [error, setError] = useState("");
    const [turnConfigured, setTurnConfigured] = useState(true);
    const callIdRef = useRef<string | null>(null);
    const connectionRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const remoteStreamRef = useRef<MediaStream | null>(null);
    const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
    const unsubscribersRef = useRef<Array<() => void>>([]);
    const endingRef = useRef(false);
    // Do Not Disturb declines incoming calls without ringing; the caller sees the call end.
    const { choice: presenceChoice } = usePresence();
    const dndRef = useRef(presenceChoice === "dnd");
    useEffect(() => {
        dndRef.current = presenceChoice === "dnd";
    }, [presenceChoice]);

    const clearSubscriptions = () => {
        unsubscribersRef.current.forEach((unsubscribe) => unsubscribe());
        unsubscribersRef.current = [];
    };

    const deleteCallArtifacts = useCallback(async (id: string) => {
        await fetch("/api/calls/cleanup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ callId: id }),
            keepalive: true,
        }).catch(() => undefined);
    }, []);

    const resetLocalCall = useCallback(() => {
        clearSubscriptions();
        localStreamRef.current?.getTracks().forEach((track) => track.stop());
        remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
        connectionRef.current?.close();
        connectionRef.current = null;
        localStreamRef.current = null;
        remoteStreamRef.current = null;
        if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
        setStatus("idle");
        callIdRef.current = null;
        setCallId(null);
        setPeer(null);
        setMuted(false);
        setElapsed(0);
    }, []);

    const endCall = useCallback(async () => {
        if (endingRef.current) return;
        endingRef.current = true;
        const id = callIdRef.current;
        resetLocalCall();
        if (id) await deleteCallArtifacts(id);
        endingRef.current = false;
    }, [deleteCallArtifacts, resetLocalCall]);

    const getIceServers = async () => {
        const response = await fetch("/api/calls/ice", { method: "POST", headers: { "Content-Type": "application/json" } });
        if (!response.ok) throw new Error("call:ice");
        const data = await response.json() as { iceServers: RTCIceServer[]; turnConfigured: boolean };
        setTurnConfigured(data.turnConfigured);
        return data.iceServers;
    };

    const attachConnection = useCallback(async (id: string, role: "caller" | "callee", iceServers: RTCIceServer[]) => {
        const connection = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 8 });
        connectionRef.current = connection;
        const localStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: false,
        });
        localStreamRef.current = localStream;
        localStream.getTracks().forEach((track) => connection.addTrack(track, localStream));
        const remoteStream = new MediaStream();
        remoteStreamRef.current = remoteStream;
        connection.ontrack = (event) => {
            event.streams[0]?.getTracks().forEach((track) => remoteStream.addTrack(track));
            if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream;
        };
        connection.onicecandidate = (event) => {
            if (event.candidate) {
                updateDoc(doc(db, "calls", id), {
                    [`${role}Candidates`]: arrayUnion(event.candidate.toJSON()),
                }).catch(() => undefined);
            }
        };
        connection.onconnectionstatechange = () => {
            if (connection.connectionState === "connected") setStatus("active");
            if (["failed", "closed"].includes(connection.connectionState)) void endCall();
        };
        const remoteRole = role === "caller" ? "callee" : "caller";
        const processedCandidates = new Set<string>();
        const pendingCandidates = new Map<string, RTCIceCandidateInit>();
        const flushCandidates = () => {
            if (!connection.remoteDescription) return;
            pendingCandidates.forEach((candidate, key) => {
                connection.addIceCandidate(new RTCIceCandidate(candidate))
                    .then(() => {
                        processedCandidates.add(key);
                        pendingCandidates.delete(key);
                    })
                    .catch(() => undefined);
            });
        };
        connection.addEventListener("signalingstatechange", flushCandidates);
        const candidateUnsubscribe = onSnapshot(doc(db, "calls", id), (snapshot) => {
            const candidates = snapshot.data()?.[`${remoteRole}Candidates`] as RTCIceCandidateInit[] | undefined;
            (candidates || []).forEach((candidate) => {
                const key = JSON.stringify(candidate);
                if (processedCandidates.has(key)) return;
                pendingCandidates.set(key, candidate);
            });
            flushCandidates();
        });
        unsubscribersRef.current.push(candidateUnsubscribe);
        return connection;
    }, [endCall]);

    const watchCall = useCallback((id: string, connection: RTCPeerConnection, role: "caller" | "callee") => {
        let answerApplied = false;
        const unsubscribe = onSnapshot(doc(db, "calls", id), (snapshot) => {
            if (!snapshot.exists()) {
                if (!endingRef.current) resetLocalCall();
                return;
            }
            const data = snapshot.data();
            if (role === "caller" && data.answer && !answerApplied && !connection.currentRemoteDescription) {
                answerApplied = true;
                connection.setRemoteDescription(new RTCSessionDescription(data.answer)).catch(() => void endCall());
                setStatus("connecting");
            }
            if (data.status === "declined" || data.status === "ended") void endCall();
        });
        unsubscribersRef.current.push(unsubscribe);
    }, [endCall, resetLocalCall]);

    const startCall = useCallback(async (target: CallPeer) => {
        if (!email || status !== "idle" || target.email === email) return;
        setError("");
        setPeer(target);
        setStatus("calling");
        const id = crypto.randomUUID();
        callIdRef.current = id;
        setCallId(id);
        try {
            await setDoc(doc(db, "calls", id), {
                caller: email,
                callee: target.email.toLowerCase(),
                participants: [email, target.email.toLowerCase()],
                status: "preparing",
                callerCandidates: [],
                calleeCandidates: [],
                createdAt: serverTimestamp(),
                expiresAt: new Date(Date.now() + 2 * 60_000),
            });
            const iceServers = await getIceServers();
            const connection = await attachConnection(id, "caller", iceServers);
            const offer = await connection.createOffer({ offerToReceiveAudio: true });
            await connection.setLocalDescription(offer);
            await updateDoc(doc(db, "calls", id), {
                status: "ringing",
                offer: { type: offer.type, sdp: offer.sdp },
            });
            watchCall(id, connection, "caller");
        } catch (callError) {
            setError(callError instanceof Error && callError.message ? callError.message : "call:start");
            await deleteCallArtifacts(id);
            resetLocalCall();
        }
    }, [email, status, attachConnection, watchCall, deleteCallArtifacts, resetLocalCall]);

    const acceptCall = async () => {
        if (!callId) return;
        setError("");
        setStatus("connecting");
        try {
            const snapshot = await getDoc(doc(db, "calls", callId));
            if (!snapshot.exists() || !snapshot.data().offer) throw new Error("call:inactive");
            const iceServers = await getIceServers();
            const connection = await attachConnection(callId, "callee", iceServers);
            await connection.setRemoteDescription(new RTCSessionDescription(snapshot.data().offer));
            const answer = await connection.createAnswer();
            await connection.setLocalDescription(answer);
            await updateDoc(doc(db, "calls", callId), {
                answer: { type: answer.type, sdp: answer.sdp },
                status: "active",
                answeredAt: serverTimestamp(),
            });
            watchCall(callId, connection, "callee");
        } catch (callError) {
            setError(callError instanceof Error && callError.message ? callError.message : "call:answer");
            await endCall();
        }
    };

    useEffect(() => {
        if (!email || status !== "idle") return;
        const incomingQuery = query(
            collection(db, "calls"),
            where("callee", "==", email),
            where("status", "==", "ringing"),
            orderBy("createdAt", "desc"),
            limit(1),
        );
        return onSnapshot(incomingQuery, async (snapshot) => {
            const incoming = snapshot.docs[0];
            if (!incoming) return;
            const data = incoming.data();
            const createdAt = data.createdAt?.toMillis?.() || Date.now();
            if (Date.now() - createdAt > 90_000 || dndRef.current) {
                await deleteCallArtifacts(incoming.id);
                return;
            }
            const profile = await getDoc(doc(db, "public_profiles", data.caller));
            const profileData = profile.data() || {};
            setPeer({ email: data.caller, username: profileData.username || data.caller, avatarUrl: profileData.avatarUrl || "", staffRole: typeof profileData.staffRole === "string" ? profileData.staffRole : null });
            callIdRef.current = incoming.id;
            setCallId(incoming.id);
            setStatus("incoming");
        }, () => undefined);
    }, [email, status, deleteCallArtifacts]);

    useEffect(() => {
        if (status !== "active") return;
        const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
        return () => window.clearInterval(timer);
    }, [status]);

    useEffect(() => {
        if (status !== "calling") return;
        const timeout = window.setTimeout(() => void endCall(), 45_000);
        return () => window.clearTimeout(timeout);
    }, [status, endCall]);

    useEffect(() => () => {
        clearSubscriptions();
        localStreamRef.current?.getTracks().forEach((track) => track.stop());
        connectionRef.current?.close();
    }, []);

    useEffect(() => {
        const cleanupOnPageExit = () => {
            const id = callIdRef.current;
            if (!id) return;
            navigator.sendBeacon("/api/calls/cleanup", JSON.stringify({ callId: id }));
        };
        window.addEventListener("pagehide", cleanupOnPageExit);
        return () => window.removeEventListener("pagehide", cleanupOnPageExit);
    }, []);

    const toggleMute = () => {
        const next = !muted;
        localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
        setMuted(next);
    };
    const duration = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
    const value = useMemo(() => ({ startCall, status }), [startCall, status]);

    return (
        <VoiceCallContext.Provider value={value}>
            {children}
            <audio ref={remoteAudioRef} autoPlay playsInline />
            {status !== "idle" && peer && (
                <div className="fixed inset-0 z-[140] flex items-center justify-center bg-zinc-950/75 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-label={tx({ TR: "Sesli arama", EN: "Voice call" })}>
                    <div className="w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-zinc-900 p-7 text-center text-white shadow-2xl">
                        <button onClick={() => void endCall()} className="float-right rounded-full p-2 text-zinc-400 hover:bg-white/10 hover:text-white" aria-label={tx({ TR: "Aramayı kapat", EN: "Close call" })}><X className="h-5 w-5" /></button>
                        <div className="mx-auto mt-7 h-24 w-24 overflow-hidden rounded-full border-4 border-blue-500/30 bg-gradient-to-br from-blue-500 to-violet-600 shadow-xl shadow-blue-500/20">
                            {peer.avatarUrl ? <OptimizedImage src={peer.avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : <div className="flex h-full w-full items-center justify-center text-3xl font-bold">{peer.username.charAt(0).toUpperCase()}</div>}
                        </div>
                        <h2 className="mt-5 truncate text-xl font-bold">{peer.username}</h2>
                        <StaffBadge role={parseStaffRole(peer.staffRole)} size="sm" className="mx-auto mt-1" />
                        <p className="mt-1 text-sm text-zinc-400">
                            {status === "incoming" ? tx({ TR: "Gelen sesli arama", EN: "Incoming voice call" }) : status === "calling" ? tx({ TR: "Aranıyor…", EN: "Calling…" }) : status === "connecting" ? tx({ TR: "Bağlanıyor…", EN: "Connecting…" }) : duration}
                        </p>
                        {error && <p className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{CALL_ERRORS[error] ? tx(CALL_ERRORS[error]) : error}</p>}
                        {!turnConfigured && <p className="mt-3 text-xs text-amber-300">{tx({ TR: "Bazı ağlarda bağlantı için TURN sunucusu gerekebilir.", EN: "Some networks may need a TURN server to connect." })}</p>}
                        <div className="mt-7 flex items-center justify-center gap-4">
                            {status === "incoming" ? (
                                <>
                                    <button onClick={() => void endCall()} className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 hover:bg-red-600" aria-label={tx({ TR: "Reddet", EN: "Decline" })}><PhoneOff className="h-6 w-6" /></button>
                                    <button onClick={() => void acceptCall()} className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500 hover:bg-green-600" aria-label={tx({ TR: "Yanıtla", EN: "Answer" })}><Phone className="h-6 w-6" /></button>
                                </>
                            ) : (
                                <>
                                    <button onClick={toggleMute} className={`flex h-12 w-12 items-center justify-center rounded-full ${muted ? "bg-amber-500" : "bg-white/10 hover:bg-white/20"}`} aria-label={muted ? tx({ TR: "Mikrofonu aç", EN: "Unmute microphone" }) : tx({ TR: "Mikrofonu kapat", EN: "Mute microphone" })}>{muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}</button>
                                    <button onClick={() => void endCall()} className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 hover:bg-red-600" aria-label={tx({ TR: "Aramayı bitir", EN: "End call" })}><PhoneOff className="h-6 w-6" /></button>
                                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10"><Volume2 className="h-5 w-5" /></div>
                                </>
                            )}
                        </div>
                        <div className="mt-7 flex items-center justify-center gap-1.5 text-xs text-zinc-500"><ShieldCheck className="h-3.5 w-3.5" />{tx({ TR: "Ses kaydedilmez; geçici bağlantı verisi arama bitince silinir.", EN: "Audio is never recorded; temporary connection data is deleted when the call ends." })}</div>
                    </div>
                </div>
            )}
        </VoiceCallContext.Provider>
    );
}
