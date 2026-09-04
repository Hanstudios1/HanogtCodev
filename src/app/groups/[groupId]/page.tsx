"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
    addDoc, collection, deleteDoc, doc, limit, onSnapshot, orderBy, query,
    serverTimestamp, setDoc, type Timestamp,
} from "firebase/firestore";
import { deleteObject, getBlob, ref as storageRef, uploadBytes } from "firebase/storage";
import {
    ArrowLeft, Crown, Download, FileCode2, FolderArchive, LoaderCircle, Menu, MessageSquare,
    Mic, MicOff, Phone, Plus, Save, Send, Shield, Trash2, UserMinus, UserPlus, UsersRound, X,
} from "lucide-react";
import CodeEditor from "@/components/Editor/CodeEditor";
import { useVoiceCall } from "@/components/VoiceCallProvider";
import { db, storage } from "@/lib/firebase";

type Member = { email: string; username: string; avatarUrl?: string | null; customStatus?: string; isOnline?: boolean; lastSeenAt?: string | null };
type Group = { id: string; name: string; description?: string; ownerEmail?: string; admins?: string[]; projectName?: string };
type GroupFile = { id: string; name: string; lang: string; code: string; order: number; updatedBy?: string; updatedAt?: Timestamp | string | null };
type GroupMessage = { id: string; fromEmail: string; author: string; authorAvatar?: string | null; type: "text" | "voice"; text: string; voicePath?: string; voiceDuration?: number; createdAt?: Timestamp | string | null };

const languageFromName = (name: string) => {
    const extension = name.split(".").pop()?.toLowerCase();
    return ({ js: "javascript", ts: "typescript", py: "python", cs: "csharp", cpp: "cpp", c: "c", java: "java", html: "html", css: "css", php: "php", go: "go", swift: "swift", rb: "ruby", rs: "rust", kt: "kotlin", sql: "sql", lua: "lua" } as Record<string, string>)[extension || ""] || "plaintext";
};

function download(name: string, content: BlobPart, type = "text/plain") {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name.replace(/[^a-zA-Z0-9._-]/g, "_") || "file.txt";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function GroupWorkspacePage() {
    const { data: session, status } = useSession();
    const params = useParams();
    const router = useRouter();
    const groupId = String(params.groupId || "");
    const { startCall } = useVoiceCall();
    const [group, setGroup] = useState<Group | null>(null);
    const [members, setMembers] = useState<Member[]>([]);
    const [files, setFiles] = useState<GroupFile[]>([]);
    const [messages, setMessages] = useState<GroupMessage[]>([]);
    const [activeFileId, setActiveFileId] = useState("");
    const [message, setMessage] = useState("");
    const [inviteEmail, setInviteEmail] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [showMembers, setShowMembers] = useState(false);
    const [showMobileChat, setShowMobileChat] = useState(false);
    const [recording, setRecording] = useState(false);
    const [recordingSeconds, setRecordingSeconds] = useState(0);
    const [playingId, setPlayingId] = useState("");
    const [dark, setDark] = useState(true);
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const recordStartedRef = useRef(0);
    const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const recordTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioUrlRef = useRef("");
    const messagesEndRef = useRef<HTMLDivElement | null>(null);

    const me = useMemo(() => members.find((member) => member.email === session?.user?.email?.toLowerCase()), [members, session?.user?.email]);
    const myEmail = session?.user?.email?.toLowerCase() || "";
    const canManage = group?.ownerEmail === myEmail || group?.admins?.includes(myEmail);
    const activeFile = files.find((file) => file.id === activeFileId) || files[0];

    const loadGroup = useCallback(async () => {
        if (!session?.user) return;
        try {
            const response = await fetch(`/api/groups?id=${encodeURIComponent(groupId)}`, { cache: "no-store" });
            const data = await response.json() as { group?: Group; members?: Member[]; error?: string };
            if (!response.ok || !data.group) throw new Error(data.error || "Grup açılamadı.");
            setGroup(data.group);
            setMembers(data.members || []);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Grup açılamadı.");
        } finally {
            setLoading(false);
        }
    }, [groupId, session?.user]);

    useEffect(() => { if (session?.user) void loadGroup(); }, [loadGroup, session?.user]);
    useEffect(() => {
        const updateTheme = () => setDark(document.documentElement.classList.contains("dark"));
        updateTheme();
        const observer = new MutationObserver(updateTheme);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
        return () => observer.disconnect();
    }, []);
    useEffect(() => {
        if (!group || !session?.user) return;
        const filesQuery = query(collection(db, "groups", groupId, "files"), orderBy("order", "asc"), limit(50));
        const messagesQuery = query(collection(db, "groups", groupId, "messages"), orderBy("createdAt", "asc"), limit(250));
        const unsubFiles = onSnapshot(filesQuery, (snapshot) => {
            const next = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as GroupFile));
            setFiles(next);
            setActiveFileId((current) => current && next.some((file) => file.id === current) ? current : (next[0]?.id || ""));
        }, () => setError("Ortak dosyalara erişim kesildi."));
        const unsubMessages = onSnapshot(messagesQuery, (snapshot) => {
            setMessages(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as GroupMessage)));
            window.setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        }, () => setError("Grup sohbetine erişim kesildi."));
        return () => { unsubFiles(); unsubMessages(); };
    }, [group, groupId, session?.user]);
    useEffect(() => () => {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        if (recordTimerRef.current) clearInterval(recordTimerRef.current);
        if (recordTimeoutRef.current) clearTimeout(recordTimeoutRef.current);
        recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
        audioRef.current?.pause();
        if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    }, []);

    const updateCode = (value = "") => {
        if (!activeFile || !session?.user?.email) return;
        setFiles((current) => current.map((file) => file.id === activeFile.id ? { ...file, code: value } : file));
        setSaving(true);
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(async () => {
            try {
                await setDoc(doc(db, "groups", groupId, "files", activeFile.id), {
                    name: activeFile.name,
                    lang: activeFile.lang,
                    code: value,
                    order: activeFile.order,
                    updatedBy: session.user!.email!.toLowerCase(),
                    updatedAt: serverTimestamp(),
                }, { merge: true });
            } catch {
                setError("Dosya kaydedilemedi. Son sürümü yenileyin.");
            } finally {
                setSaving(false);
            }
        }, 800);
    };

    const addFile = async () => {
        const name = prompt("Dosya adı (ör. app.py):", "new-file.js")?.trim();
        if (!name || !session?.user?.email || files.length >= 50) return;
        const id = crypto.randomUUID();
        await setDoc(doc(db, "groups", groupId, "files", id), { name: name.slice(0, 120), lang: languageFromName(name), code: "", order: files.length, updatedBy: session.user.email.toLowerCase(), updatedAt: serverTimestamp() });
        setActiveFileId(id);
    };

    const removeFile = async (file: GroupFile) => {
        if (files.length <= 1 || !confirm(`${file.name} silinsin mi?`)) return;
        await deleteDoc(doc(db, "groups", groupId, "files", file.id));
    };

    const sendMessage = async (text: string, type: "text" | "voice" = "text", voice?: { path: string; duration: number }) => {
        if (!text.trim() || !session?.user?.email) return;
        await addDoc(collection(db, "groups", groupId, "messages"), {
            fromEmail: session.user.email.toLowerCase(),
            author: me?.username || session.user.name || session.user.email.split("@")[0],
            authorAvatar: me?.avatarUrl || session.user.image || null,
            type,
            text: text.slice(0, 4000),
            ...(voice ? { voicePath: voice.path, voiceDuration: voice.duration } : {}),
            createdAt: serverTimestamp(),
        });
        setMessage("");
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
            const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
            const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 64000 } : undefined);
            recorderRef.current = recorder;
            chunksRef.current = [];
            recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
            recorder.start(1000);
            recordStartedRef.current = Date.now();
            setRecording(true);
            setRecordingSeconds(0);
            recordTimerRef.current = setInterval(() => setRecordingSeconds((value) => value + 1), 1000);
            recordTimeoutRef.current = setTimeout(() => stopRecording(), 60_000);
        } catch {
            setError("Mikrofon izni verilmedi.");
        }
    };

    const stopRecording = (discard = false) => {
        setRecording(false);
        if (recordTimerRef.current) clearInterval(recordTimerRef.current);
        if (recordTimeoutRef.current) clearTimeout(recordTimeoutRef.current);
        const recorder = recorderRef.current;
        if (!recorder || recorder.state === "inactive") return;
        recorder.onstop = async () => {
            const duration = Math.max(1, Math.round((Date.now() - recordStartedRef.current) / 1000));
            const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
            recorder.stream.getTracks().forEach((track) => track.stop());
            chunksRef.current = [];
            setRecordingSeconds(0);
            if (discard || !session?.user?.email || !blob.size) return;
            if (blob.size > 3 * 1024 * 1024) { setError("Sesli mesaj 3 MB sınırını aşıyor."); return; }
            const extension = recorder.mimeType.includes("mp4") ? "m4a" : "webm";
            const path = `group-voice-messages/${groupId}/${crypto.randomUUID()}.${extension}`;
            try {
                await uploadBytes(storageRef(storage, path), blob, { contentType: recorder.mimeType || "audio/webm", customMetadata: { sender: session.user.email.toLowerCase(), groupId } });
                await sendMessage(`Sesli mesaj (${duration} sn)`, "voice", { path, duration });
            } catch {
                await deleteObject(storageRef(storage, path)).catch(() => undefined);
                setError("Sesli mesaj gönderilemedi.");
            }
        };
        recorder.stop();
    };

    const playVoice = async (item: GroupMessage) => {
        if (!item.voicePath) return;
        if (playingId === item.id) { audioRef.current?.pause(); setPlayingId(""); return; }
        try {
            audioRef.current?.pause();
            if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
            const blob = await getBlob(storageRef(storage, item.voicePath), 3 * 1024 * 1024);
            audioUrlRef.current = URL.createObjectURL(blob);
            const audio = new Audio(audioUrlRef.current);
            audioRef.current = audio;
            audio.onended = () => setPlayingId("");
            setPlayingId(item.id);
            await audio.play();
        } catch {
            setError("Sesli mesaj açılamadı.");
        }
    };

    const addMember = async () => {
        if (!inviteEmail.trim()) return;
        try {
            const response = await fetch("/api/groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add-member", groupId, targetEmail: inviteEmail }) });
            const data = await response.json() as { error?: string };
            if (!response.ok) throw new Error(data.error || "Üye eklenemedi.");
            setInviteEmail("");
            await loadGroup();
        } catch (inviteError) {
            setError(inviteError instanceof Error ? inviteError.message : "Üye eklenemedi.");
        }
    };

    const manageMember = async (member: Member, action: "remove-member" | "set-admin", enabled?: boolean) => {
        if (!confirm(action === "remove-member" ? `${member.username} gruptan çıkarılsın mı?` : `${member.username} için yönetici rolü ${enabled ? "verilsin" : "kaldırılsın"} mı?`)) return;
        try {
            const response = await fetch("/api/groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, groupId, targetEmail: member.email, enabled }) });
            const data = await response.json() as { error?: string };
            if (!response.ok) throw new Error(data.error || "Üye işlemi tamamlanamadı.");
            await loadGroup();
        } catch (memberError) {
            setError(memberError instanceof Error ? memberError.message : "Üye işlemi tamamlanamadı.");
        }
    };

    const downloadAll = async () => {
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        files.forEach((file) => zip.file(file.name, file.code));
        const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
        download(`${group?.projectName || group?.name || "group-project"}.zip`, blob, "application/zip");
    };

    if (status === "loading" || loading) return <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-white"><LoaderCircle className="h-7 w-7 animate-spin text-blue-500" /></div>;
    if (!group) return <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-6 text-center text-white"><UsersRound className="h-12 w-12 text-zinc-500" /><h1 className="mt-4 text-2xl font-black">Grup açılamadı</h1><p className="mt-2 text-zinc-400">{error || "Bu çalışma alanına erişiminiz olmayabilir."}</p><button onClick={() => router.push("/groups")} className="mt-6 rounded-xl bg-blue-600 px-5 py-2.5 font-bold">Gruplara dön</button></div>;

    return (
        <main className="flex h-screen min-w-0 flex-col overflow-hidden bg-zinc-100 text-zinc-950 dark:bg-zinc-950 dark:text-white">
            <header className="flex h-16 items-center gap-3 border-b border-zinc-200 bg-white px-3 dark:border-zinc-800 dark:bg-zinc-900">
                <button onClick={() => router.push("/groups")} className="rounded-xl p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"><ArrowLeft className="h-5 w-5" /></button>
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 text-white"><UsersRound className="h-5 w-5" /></div>
                <div className="min-w-0"><h1 className="truncate font-black">{group.name}</h1><p className="truncate text-xs text-zinc-500">{group.projectName} · {members.length} üye</p></div>
                <div className="ml-auto flex items-center gap-1"><span className={`hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold sm:flex ${saving ? "bg-amber-100 text-amber-700 dark:bg-amber-950" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950"}`}><Save className="h-3.5 w-3.5" />{saving ? "Kaydediliyor" : "Canlı senkron"}</span><button onClick={downloadAll} className="rounded-xl p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800" title="Tüm projeyi indir"><FolderArchive className="h-5 w-5" /></button><button onClick={() => setShowMobileChat(true)} className="rounded-xl p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 lg:hidden" title="Proje sohbeti"><MessageSquare className="h-5 w-5" /></button><button onClick={() => setShowMembers((value) => !value)} className="rounded-xl p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 lg:hidden" title="Üyeler"><Menu className="h-5 w-5" /></button></div>
            </header>
            {error && <button onClick={() => setError("")} className="flex items-center justify-between bg-amber-100 px-4 py-2 text-left text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">{error}<X className="h-4 w-4" /></button>}
            <div className="flex min-h-0 flex-1">
                <aside className="hidden w-56 flex-shrink-0 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 md:flex"><div className="flex items-center justify-between p-3"><span className="text-xs font-black uppercase tracking-wider text-zinc-500">Dosyalar</span><button onClick={addFile} className="rounded-lg p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800" title="Dosya ekle"><Plus className="h-4 w-4" /></button></div><div className="min-h-0 flex-1 overflow-y-auto px-2">{files.map((file) => <div key={file.id} className={`group flex items-center rounded-xl ${activeFile?.id === file.id ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}><button onClick={() => setActiveFileId(file.id)} className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left text-sm"><FileCode2 className="h-4 w-4 flex-shrink-0" /><span className="truncate">{file.name}</span></button><button onClick={() => removeFile(file)} className="mr-1 hidden rounded-lg p-1 text-red-500 group-hover:block" title="Sil"><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div></aside>
                <section className="flex min-w-0 flex-1 flex-col p-2"><div className="mb-2 flex gap-1 overflow-x-auto md:hidden">{files.map((file) => <button key={file.id} onClick={() => setActiveFileId(file.id)} className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs ${activeFile?.id === file.id ? "bg-blue-600 text-white" : "bg-white dark:bg-zinc-900"}`}>{file.name}</button>)}<button onClick={addFile} className="rounded-xl bg-zinc-900 px-3 text-white dark:bg-white dark:text-black"><Plus className="h-4 w-4" /></button></div>{activeFile ? <div className="min-h-0 flex-1"><CodeEditor language={activeFile.lang} theme={dark ? "dark" : "light"} value={activeFile.code} onChange={updateCode} /></div> : <div className="flex flex-1 items-center justify-center text-zinc-500">Dosya bekleniyor…</div>}<div className="mt-2 flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900"><span>Son yazan: {activeFile?.updatedBy ? members.find((item) => item.email === activeFile.updatedBy)?.username || "Üye" : "—"}</span>{activeFile && <button onClick={() => download(activeFile.name, activeFile.code)} className="flex items-center gap-1.5 font-semibold hover:text-blue-500"><Download className="h-3.5 w-3.5" />Bu dosyayı indir</button>}</div></section>
                <aside className="hidden w-80 flex-shrink-0 flex-col border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 lg:flex"><div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800"><h2 className="flex items-center gap-2 text-sm font-black"><MessageSquare className="h-4 w-4 text-blue-500" />Proje sohbeti</h2></div><div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">{messages.map((item) => <div key={item.id} className={`flex gap-2 ${item.fromEmail === myEmail ? "flex-row-reverse" : ""}`}><div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-bold dark:bg-zinc-700">{item.author.charAt(0)}</div><div className={`max-w-[78%] rounded-2xl px-3 py-2 ${item.fromEmail === myEmail ? "bg-blue-600 text-white" : "bg-zinc-100 dark:bg-zinc-800"}`}><p className="mb-1 text-[10px] font-bold opacity-70">{item.author}</p>{item.type === "voice" ? <button onClick={() => playVoice(item)} className="flex items-center gap-2 text-sm"><span className={`flex h-7 w-7 items-center justify-center rounded-full ${playingId === item.id ? "bg-white/20" : "bg-black/10"}`}>{playingId === item.id ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}</span>{item.voiceDuration || 0} sn</button> : <p className="whitespace-pre-wrap break-words text-sm">{item.text}</p>}</div></div>)}<div ref={messagesEndRef} /></div><div className="border-t border-zinc-200 p-3 dark:border-zinc-800">{recording && <div className="mb-2 flex items-center justify-between rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600 dark:bg-red-950/40"><span className="animate-pulse">● Kaydediliyor {recordingSeconds}s / 60s</span><button onClick={() => stopRecording(true)}>Vazgeç</button></div>}<div className="flex items-end gap-2"><textarea value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(message); } }} rows={2} placeholder="Mesaj yazın…" className="min-h-11 flex-1 resize-none rounded-2xl bg-zinc-100 px-3 py-2 text-sm outline-none dark:bg-zinc-800" /><button onClick={() => recording ? stopRecording() : startRecording()} className={`rounded-xl p-3 ${recording ? "bg-red-500 text-white" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}>{recording ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}</button><button onClick={() => sendMessage(message)} disabled={!message.trim()} className="rounded-xl bg-blue-600 p-3 text-white disabled:opacity-40"><Send className="h-5 w-5" /></button></div></div><div className="border-t border-zinc-200 p-3 dark:border-zinc-800"><div className="mb-2 flex gap-2"><input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="Arkadaş e-postası" className="min-w-0 flex-1 rounded-xl bg-zinc-100 px-3 py-2 text-xs outline-none dark:bg-zinc-800" /><button onClick={addMember} className="rounded-xl bg-zinc-900 p-2 text-white dark:bg-white dark:text-zinc-900"><UserPlus className="h-4 w-4" /></button></div><div className="max-h-32 space-y-1 overflow-y-auto">{members.map((member) => <div key={member.email} className="flex items-center gap-1 rounded-xl px-2 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"><span className="relative flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-600 text-xs font-bold text-white">{member.username.charAt(0)}<i className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-zinc-900 ${member.isOnline ? "bg-emerald-500" : "bg-zinc-400"}`} /></span><span className="min-w-0 flex-1 truncate text-xs font-semibold">{member.username}</span>{member.email === group.ownerEmail ? <Crown className="h-3.5 w-3.5 text-amber-500" /> : group.admins?.includes(member.email) ? <Shield className="h-3.5 w-3.5 text-blue-500" /> : null}{member.email !== myEmail && <button onClick={() => startCall({ email: member.email, username: member.username, avatarUrl: member.avatarUrl || undefined })} className="rounded-lg p-1.5 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950" title="Sesli ara"><Phone className="h-3.5 w-3.5" /></button>}{group.ownerEmail === myEmail && member.email !== myEmail && <button onClick={() => manageMember(member, "set-admin", !group.admins?.includes(member.email))} className="rounded-lg p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950" title="Yönetici rolünü değiştir"><Shield className="h-3.5 w-3.5" /></button>}{canManage && member.email !== myEmail && member.email !== group.ownerEmail && <button onClick={() => manageMember(member, "remove-member")} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950" title="Üyeyi çıkar"><UserMinus className="h-3.5 w-3.5" /></button>}</div>)}</div></div></aside>
            </div>
            {showMembers && <div className="fixed inset-0 z-50 bg-black/50 lg:hidden" onClick={() => setShowMembers(false)}><aside onClick={(event) => event.stopPropagation()} className="ml-auto flex h-full w-[min(90vw,360px)] flex-col bg-white p-4 shadow-2xl dark:bg-zinc-900"><div className="flex items-center justify-between"><h2 className="font-black">Grup üyeleri</h2><button onClick={() => setShowMembers(false)}><X className="h-5 w-5" /></button></div><div className="mt-4 flex gap-2"><input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="Arkadaş e-postası" className="min-w-0 flex-1 rounded-xl bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-800" /><button onClick={addMember} className="rounded-xl bg-blue-600 p-2 text-white"><UserPlus className="h-5 w-5" /></button></div><div className="mt-5 space-y-2">{members.map((member) => <div key={member.email} className="flex items-center gap-3 rounded-2xl bg-zinc-100 p-3 dark:bg-zinc-800"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-600 font-bold text-white">{member.username.charAt(0)}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{member.username}</p><p className="truncate text-xs text-zinc-500">{member.isOnline ? "Çevrimiçi" : "Çevrimdışı"}</p></div>{member.email !== session?.user?.email?.toLowerCase() && <button onClick={() => startCall({ email: member.email, username: member.username, avatarUrl: member.avatarUrl || undefined })} className="rounded-xl bg-emerald-500 p-2 text-white"><Phone className="h-4 w-4" /></button>}</div>)}</div></aside></div>}
            {showMobileChat && <div className="fixed inset-0 z-50 bg-black/50 lg:hidden" onClick={() => setShowMobileChat(false)}><aside onClick={(event) => event.stopPropagation()} className="ml-auto flex h-full w-[min(94vw,400px)] flex-col bg-white shadow-2xl dark:bg-zinc-900"><div className="flex items-center justify-between border-b border-zinc-200 p-4 dark:border-zinc-800"><h2 className="flex items-center gap-2 font-black"><MessageSquare className="h-5 w-5 text-blue-500" />Proje sohbeti</h2><button onClick={() => setShowMobileChat(false)}><X className="h-5 w-5" /></button></div><div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">{messages.map((item) => <div key={item.id} className={`flex ${item.fromEmail === myEmail ? "justify-end" : "justify-start"}`}><div className={`max-w-[85%] rounded-2xl px-3 py-2 ${item.fromEmail === myEmail ? "bg-blue-600 text-white" : "bg-zinc-100 dark:bg-zinc-800"}`}><p className="mb-1 text-[10px] font-bold opacity-70">{item.author}</p>{item.type === "voice" ? <button onClick={() => playVoice(item)} className="flex items-center gap-2 text-sm"><Mic className="h-4 w-4" />{playingId === item.id ? "Durdur" : `${item.voiceDuration || 0} sn dinle`}</button> : <p className="whitespace-pre-wrap break-words text-sm">{item.text}</p>}</div></div>)}<div ref={messagesEndRef} /></div><div className="border-t border-zinc-200 p-3 dark:border-zinc-800">{recording && <div className="mb-2 flex items-center justify-between rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600 dark:bg-red-950/40"><span className="animate-pulse">● {recordingSeconds}s / 60s</span><button onClick={() => stopRecording(true)}>Sil</button></div>}<div className="flex items-end gap-2"><textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={2} placeholder="Mesaj yazın…" className="min-h-11 min-w-0 flex-1 resize-none rounded-2xl bg-zinc-100 px-3 py-2 text-sm outline-none dark:bg-zinc-800" /><button onClick={() => recording ? stopRecording() : startRecording()} className={`rounded-xl p-3 ${recording ? "bg-red-500 text-white" : "bg-zinc-100 dark:bg-zinc-800"}`}>{recording ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}</button><button onClick={() => sendMessage(message)} disabled={!message.trim()} className="rounded-xl bg-blue-600 p-3 text-white disabled:opacity-40"><Send className="h-5 w-5" /></button></div></div></aside></div>}
        </main>
    );
}
