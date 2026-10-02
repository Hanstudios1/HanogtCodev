"use client";

import { Link2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Modal, ModalHeader } from "@/components/Groups/ui";
import { useI18n, type Copy } from "@/lib/i18n";
import { extractInviteToken, inviteLinkPath } from "@/lib/groups";

const C = {
    title: { TR: "Bir gruba katıl", EN: "Join a group" },
    text: { TR: "Sana gönderilen davet bağlantısını veya 22 karakterlik davet kodunu yapıştır.", EN: "Paste the invite link you received or the 22-character invite code." },
    label: { TR: "Davet bağlantısı", EN: "Invite link" },
    placeholder: { TR: "https://…/social/join/… veya davet kodu", EN: "https://…/social/join/… or invite code" },
    invalid: { TR: "Bu bir Hanogt davet bağlantısına benzemiyor.", EN: "That doesn't look like a Hanogt invite link." },
    submit: { TR: "Daveti aç", EN: "Open the invitation" },
} satisfies Record<string, Copy>;

export default function JoinInviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { tx } = useI18n();
    const router = useRouter();
    const [value, setValue] = useState("");
    const [error, setError] = useState("");

    const submit = (event: FormEvent) => {
        event.preventDefault();
        const token = extractInviteToken(value);
        if (!token) {
            setError(tx(C.invalid));
            return;
        }
        onClose();
        router.push(inviteLinkPath(token));
    };

    return (
        <Modal open={open} onClose={onClose} labelledBy="join-invite-title" size="sm">
            <ModalHeader id="join-invite-title" title={tx(C.title)} description={tx(C.text)} onClose={onClose} icon={<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><Link2 className="h-5 w-5" aria-hidden /></span>} />
            <form onSubmit={submit} className="space-y-3 p-5 sm:p-6">
                <label htmlFor="join-invite-input" className="text-sm font-semibold">{tx(C.label)}</label>
                <input
                    id="join-invite-input"
                    data-autofocus
                    value={value}
                    onChange={(event) => { setValue(event.target.value); setError(""); }}
                    placeholder={tx(C.placeholder)}
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? "join-invite-error" : undefined}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-zinc-950"
                />
                {error && <p id="join-invite-error" className="text-sm font-medium text-red-600 dark:text-red-400" role="alert">{error}</p>}
                <button type="submit" disabled={!value.trim()} className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-500 disabled:opacity-50">{tx(C.submit)}</button>
            </form>
        </Modal>
    );
}
