"use client";

import { useId } from "react";
import { MEDIA_LICENSES, MEDIA_LIMITS, normalizeMediaLicense } from "@/components/Editor/media-publish";
import { useI18n } from "@/lib/i18n";
import { LICENSE_LABELS, M } from "./copy";
import TagInput from "./TagInput";
import type { PostFields } from "./types";

const field = "mt-2 w-full rounded-2xl border border-zinc-200 bg-transparent px-4 py-3 outline-none focus:border-blue-500 dark:border-zinc-700";
const darkField = "mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-blue-500";

/** The fields shared by the publish form and the owner's edit form; `tagSuggestions` are the post's languages. */
export default function PostFieldsForm({ value, onChange, tagSuggestions, dark = false }: { value: PostFields; onChange: (next: PostFields) => void; tagSuggestions: string[]; dark?: boolean }) {
    const { tx } = useI18n();
    const ids = { title: useId(), description: useId(), tags: useId(), license: useId() };
    const labelClass = dark ? "block text-xs font-semibold text-zinc-300" : "block text-sm font-semibold";
    const inputClass = dark ? darkField : field;
    return (
        <>
            <div>
                <label htmlFor={ids.title} className={labelClass}>{tx(M.title)}</label>
                <input id={ids.title} data-autofocus value={value.title} maxLength={MEDIA_LIMITS.title} required onChange={(event) => onChange({ ...value, title: event.target.value })} className={inputClass} />
            </div>
            <div>
                <label htmlFor={ids.description} className={labelClass}>{tx(M.description)}</label>
                <textarea id={ids.description} value={value.description} maxLength={MEDIA_LIMITS.description} rows={4} onChange={(event) => onChange({ ...value, description: event.target.value })} className={`${inputClass} resize-none`} />
            </div>
            <div>
                <label htmlFor={ids.tags} className={labelClass}>{tx(M.tags)}</label>
                <TagInput id={ids.tags} value={value.tags} onChange={(tags) => onChange({ ...value, tags })} suggestions={tagSuggestions} dark={dark} />
            </div>
            <div>
                <label htmlFor={ids.license} className={labelClass}>{tx(M.license)}</label>
                <select id={ids.license} value={value.license} aria-describedby={`${ids.license}-hint`} onChange={(event) => onChange({ ...value, license: normalizeMediaLicense(event.target.value) })} className={inputClass}>
                    {MEDIA_LICENSES.map((license) => <option key={license} value={license}>{tx(LICENSE_LABELS[license])}</option>)}
                </select>
                <span id={`${ids.license}-hint`} className="mt-1 block text-xs font-normal leading-5 text-zinc-500">{tx(M.licenseHint)}</span>
            </div>
            <label className={`flex items-start gap-3 rounded-2xl p-4 ${dark ? "bg-zinc-950/70" : "bg-zinc-100 dark:bg-zinc-800"}`}>
                <input type="checkbox" checked={value.showAuthor} onChange={(event) => onChange({ ...value, showAuthor: event.target.checked })} className="mt-1 h-4 w-4" />
                <span>
                    <strong className="block text-sm">{tx(M.showAuthor)}</strong>
                    <span className="text-xs leading-5 text-zinc-500">{tx(M.showAuthorHint)}</span>
                </span>
            </label>
        </>
    );
}
