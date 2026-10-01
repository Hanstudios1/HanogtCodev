"use client";

import { LoaderCircle, Save } from "lucide-react";
import { useRef, useState } from "react";
import Modal, { buttonClasses } from "@/components/Editor/Modal";
import { useI18n } from "@/lib/i18n";

interface SaveDialogProps {
    open: boolean;
    onClose: () => void;
    defaultName: string;
    /** The project's current name, offered as "keep the same name". */
    currentName?: string;
    saving: boolean;
    onSave: (name: string) => void;
}

export default function SaveDialog({ open, onClose, defaultName, currentName, saving, onSave }: SaveDialogProps) {
    const { tx } = useI18n();
    const inputRef = useRef<HTMLInputElement>(null);
    // The parent remounts the dialog (key) when a new name is suggested.
    const [name, setName] = useState(defaultName);
    const trimmed = name.trim();
    const submit = () => {
        if (trimmed && trimmed.length <= 120 && !saving) onSave(trimmed);
    };
    return (
        <Modal
            open={open}
            onClose={onClose}
            size="sm"
            icon={<Save className="h-5 w-5" aria-hidden />}
            title={tx({ TR: "Projenize bir ad verin", EN: "Name your project" })}
            description={tx({ TR: "Proje, hesabınızla buluta kaydedilir ve panelinizde görünür.", EN: "The project is saved to the cloud with your account and appears on your dashboard." })}
            initialFocus={inputRef}
            footer={(
                <>
                    {currentName && currentName !== trimmed && (
                        <button type="button" className={`${buttonClasses.secondary} me-auto`} disabled={saving} onClick={() => onSave(currentName)}>
                            {tx({ TR: "Aynı adı koru", EN: "Keep the same name" })}
                        </button>
                    )}
                    <button type="button" className={buttonClasses.ghost} onClick={onClose}>{tx({ TR: "Vazgeç", EN: "Cancel" })}</button>
                    <button type="button" className={buttonClasses.primary} onClick={submit} disabled={!trimmed || trimmed.length > 120 || saving}>
                        {saving ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                        {tx({ TR: "Kaydet", EN: "Save" })}
                    </button>
                </>
            )}
        >
            <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-300" htmlFor="project-name">{tx({ TR: "Proje adı", EN: "Project name" })}</label>
            <input
                ref={inputRef}
                id="project-name"
                value={name}
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === "Enter") submit();
                }}
                className="mt-1.5 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-zinc-900"
            />
            <p className="mt-1 text-end text-[11px] tabular-nums text-zinc-400">{trimmed.length}/120</p>
        </Modal>
    );
}
