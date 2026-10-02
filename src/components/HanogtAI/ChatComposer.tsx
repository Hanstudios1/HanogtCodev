"use client";

import { ArrowUp, FileCode2, KeyRound, Paperclip, Settings2, Sparkles, Square, X } from "lucide-react";
import { useEffect, useRef, type RefObject } from "react";
import type { AgentMode } from "@/lib/ai/agent-tools";
import { aiProvider, DEFAULT_CONNECTION, type AiConnectionView } from "@/lib/ai/connections";
import type { AiContext, AiMode } from "@/lib/ai/local-engine";
import { useI18n } from "@/lib/i18n";
import { languageDisplayName } from "@/lib/runtimes/languages";
import { AGENT_MODE_OPTIONS, AGENT_NEVER, MAX_INPUT, MODES } from "./chat-copy";
import type { FileAttachment } from "./useHanogtChat";
import { cx, ICON_BUTTON, PillMenu, type MenuOption } from "./ui";

const C = {
    message: { TR: "Mesaj", EN: "Message" },
    placeholder: { TR: "Hanogt AI'a bir şey sor ya da bir iş ver…", EN: "Ask Hanogt AI anything or give it a task…" },
    placeholderCode: { TR: "Kod, hata mesajı ya da bir soru yaz…", EN: "Type code, an error message or a question…" },
    placeholderSecurity: { TR: "Bağlantı, kod ya da güvenlik sorusu yapıştır…", EN: "Paste a link, code or a security question…" },
    send: { TR: "Gönder", EN: "Send" },
    stop: { TR: "Durdur", EN: "Stop" },
    attach: { TR: "Kod dosyası ekle", EN: "Attach a code file" },
    removeAttachment: { TR: "Eki kaldır", EN: "Remove attachment" },
    editorFile: { TR: "Açık dosyayı soruya ekle", EN: "Attach the open file to your question" },
    openFile: { TR: "Açık dosya", EN: "Open file" },
    mode: { TR: "Yanıt modu", EN: "Answer mode" },
    agent: { TR: "Ajan modu", EN: "Agent mode" },
    resetGrants: { TR: "Bu oturumdaki izinleri sıfırla ({count})", EN: "Reset this session's permissions ({count})" },
    disclaimer: { TR: "Hanogt AI hata yapabilir; önemli bilgileri doğrula. Gizli bilgi paylaşma.", EN: "Hanogt AI can make mistakes; verify important information. Don't share secrets." },
    model: { TR: "Model", EN: "Model" },
    hanogt: { TR: "Hanogt AI (varsayılan)", EN: "Hanogt AI (default)" },
    hanogtShort: { TR: "Hanogt AI", EN: "Hanogt AI" },
    hanogtDescription: { TR: "Hanogt'un kendi dil modeli; günlük mesaj hakkını kullanır.", EN: "Hanogt's own language model; uses your daily messages." },
    ownConnection: { TR: "Kendi bağlantın", EN: "Your connection" },
    notInPlan: { TR: "Planın kapsamıyor", EN: "Not in your plan" },
    manage: { TR: "Bağlantıları yönet…", EN: "Manage connections…" },
    connectHint: { TR: "Plus ve Pro'da kendi API anahtarınla OpenAI, Claude, Gemini ve daha fazlasını bağlayabilirsin.", EN: "On Plus and Pro you can connect OpenAI, Claude, Gemini and more with your own API key." },
    keys: { TR: "Enter: gönder · Shift+Enter: yeni satır", EN: "Enter: send · Shift+Enter: new line" },
    chars: { TR: "{count}/{max}", EN: "{count}/{max}" },
};

// Text files people paste code from; the editor's own extensions are accepted too.
const ACCEPT = ".txt,.md,.json,.csv,.xml,.yml,.yaml,.toml,.ini,.env.example,.py,.js,.mjs,.cjs,.jsx,.ts,.tsx,.html,.htm,.css,.scss,.java,.kt,.c,.h,.cpp,.cc,.hpp,.cs,.go,.rs,.rb,.php,.swift,.lua,.sql,.sh,.r,.dart,.scala,.hs,.pl,.ex,.exs,.erl,.clj,.vb,.fs,.ml,.nim,.zig,.jl,.m,.asm,.bf,.scm,.lisp,.pas";

export interface ChatComposerProps {
    variant: "panel" | "page";
    inputRef: RefObject<HTMLTextAreaElement | null>;
    input: string;
    setInput: (value: string) => void;
    busy: boolean;
    onSend: () => void;
    onStop: () => void;
    onEscape?: () => void;
    mode: AiMode;
    onModeChange: (mode: AiMode) => void;
    agentMode: AgentMode;
    onAgentModeChange: (mode: AgentMode) => void;
    grantedCount: number;
    onResetGrants: () => void;
    attachment: FileAttachment | null;
    onAttach: (file: File) => void;
    onRemoveAttachment: () => void;
    attachError: string | null;
    editorContext: AiContext | null;
    hasEditorFile: boolean;
    attachEditorFile: boolean;
    onToggleEditorFile: () => void;
    /** The model picker (signed in only): Hanogt AI or one of the person's own connections. */
    connections?: ComposerConnections | null;
    /** Bigger box for the empty conversation on the full page. */
    hero?: boolean;
}

export interface ComposerConnections {
    items: AiConnectionView[];
    /** Where new messages go: a connection id, or null for Hanogt AI. */
    selectedId: string | null;
    onSelect: (id: string | null) => void;
    onManage: () => void;
}

/** Hanogt AI or one of the person's own connections; connections outside the plan are listed but can't be chosen. */
function ModelPicker({ connections, variant }: { connections: ComposerConnections; variant: "panel" | "page" }) {
    const { tx } = useI18n();
    const { items, selectedId } = connections;
    const selected = selectedId ? items.find((item) => item.id === selectedId) ?? null : null;
    const options: Array<MenuOption<string>> = [
        { id: DEFAULT_CONNECTION, label: tx(C.hanogt), description: tx(C.hanogtDescription), icon: <Sparkles className="h-4 w-4" aria-hidden /> },
        ...items.map((item) => {
            const provider = aiProvider(item.provider).name;
            return {
                id: item.id,
                label: `${item.label} · ${item.model}`,
                description: item.active ? provider : `${provider} · ${tx(C.notInPlan)}`,
                icon: <KeyRound className="h-4 w-4" aria-hidden />,
                disabled: !item.active,
            };
        }),
    ];
    return (
        <PillMenu
            title={tx(C.model)}
            label={selectedId ? selected?.label ?? tx(C.ownConnection) : tx(C.hanogtShort)}
            icon={selectedId ? <KeyRound className="h-3.5 w-3.5 shrink-0 text-sky-500" aria-hidden /> : <Sparkles className="h-3.5 w-3.5 shrink-0 text-violet-500" aria-hidden />}
            value={selectedId ?? DEFAULT_CONNECTION}
            compact
            align="end"
            maxWidth={variant === "panel" ? "max-w-[7.5rem]" : "max-w-[11rem]"}
            onChange={(id) => connections.onSelect(id === DEFAULT_CONNECTION ? null : id)}
            options={options}
            footer={(close) => (
                <div className="space-y-1.5">
                    {!items.length ? <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">{tx(C.connectHint)}</p> : null}
                    <button
                        type="button"
                        onClick={() => {
                            close();
                            connections.onManage();
                        }}
                        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-violet-600 hover:underline dark:text-violet-300"
                    >
                        <Settings2 className="h-3.5 w-3.5" aria-hidden />
                        {tx(C.manage)}
                    </button>
                </div>
            )}
        />
    );
}

/** The large rounded composer: text, attachments, answer mode and agent mode, send / stop. */
export default function ChatComposer(props: ChatComposerProps) {
    const { tx } = useI18n();
    const { inputRef, input, setInput, busy, variant, hero } = props;
    const fileInput = useRef<HTMLInputElement>(null);
    const maxHeight = variant === "page" ? 280 : 160;

    // Auto-grow up to a limit, then scroll.
    useEffect(() => {
        const element = inputRef.current;
        if (!element) return;
        element.style.height = "0px";
        element.style.height = `${Math.min(element.scrollHeight, maxHeight)}px`;
    }, [input, inputRef, maxHeight]);

    const modeOption = MODES.find((entry) => entry.id === props.mode) ?? MODES[0];
    const agentOption = AGENT_MODE_OPTIONS.find((entry) => entry.id === props.agentMode) ?? AGENT_MODE_OPTIONS[1];
    const ModeIcon = modeOption.icon;
    const AgentIcon = agentOption.icon;
    const placeholder = props.mode === "code" ? C.placeholderCode : props.mode === "security" ? C.placeholderSecurity : C.placeholder;

    return (
        <div className={cx("mx-auto w-full", variant === "page" ? "max-w-3xl" : "")}>
            <div className={cx(
                "rounded-[26px] border border-zinc-200 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.08)] transition focus-within:border-violet-300 focus-within:shadow-[0_4px_24px_-8px_rgba(124,58,237,0.25)] dark:border-white/10 dark:bg-zinc-900 dark:focus-within:border-violet-400/40",
                hero && "sm:rounded-[28px]",
            )}>
                {props.attachment || props.hasEditorFile ? (
                    <div className="flex flex-wrap gap-1.5 px-3 pt-3">
                        {props.attachment ? (
                            <span className="inline-flex max-w-full items-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 py-1 pe-1 ps-2 text-[12px] font-semibold text-zinc-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-200">
                                <FileCode2 className="h-3.5 w-3.5 shrink-0 text-violet-500" aria-hidden />
                                <span className="truncate">{props.attachment.name}</span>
                                <span className="shrink-0 text-zinc-400">{languageDisplayName(props.attachment.language)}</span>
                                <button type="button" onClick={props.onRemoveAttachment} className={cx(ICON_BUTTON, "p-1")} aria-label={tx(C.removeAttachment)} title={tx(C.removeAttachment)}><X className="h-3 w-3" /></button>
                            </span>
                        ) : null}
                        {!props.attachment && props.hasEditorFile ? (
                            <button
                                type="button"
                                onClick={props.onToggleEditorFile}
                                aria-pressed={props.attachEditorFile}
                                title={tx(C.editorFile)}
                                className={cx("inline-flex max-w-full items-center gap-1.5 rounded-xl px-2 py-1 text-[12px] font-semibold transition", props.attachEditorFile ? "bg-violet-500/10 text-violet-700 dark:text-violet-300" : "bg-zinc-500/10 text-zinc-500 line-through")}
                            >
                                <Paperclip className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                <span className="truncate">{props.editorContext?.fileName || tx(C.openFile)}</span>
                            </button>
                        ) : null}
                    </div>
                ) : null}
                <textarea
                    ref={inputRef}
                    value={input}
                    rows={hero ? 2 : 1}
                    dir="auto"
                    maxLength={MAX_INPUT}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                            event.preventDefault();
                            if (!busy) props.onSend();
                        } else if (event.key === "Escape") {
                            if (busy) props.onStop();
                            else props.onEscape?.();
                        }
                    }}
                    placeholder={tx(placeholder)}
                    aria-label={tx(C.message)}
                    className={cx(
                        "scrollbar-thin block w-full resize-none bg-transparent px-4 pt-3.5 text-zinc-800 outline-none placeholder:text-zinc-400 dark:text-zinc-100",
                        variant === "page" ? "min-h-[52px] text-[15px]" : "min-h-[44px] text-[14px]",
                    )}
                />
                <div className="flex items-center gap-1.5 px-2.5 pb-2.5 pt-1">
                    <input
                        ref={fileInput}
                        type="file"
                        accept={ACCEPT}
                        className="hidden"
                        onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) props.onAttach(file);
                            event.target.value = "";
                        }}
                    />
                    <button type="button" onClick={() => fileInput.current?.click()} className={cx(ICON_BUTTON, "h-8 w-8 rounded-full border border-zinc-200 dark:border-white/10")} title={tx(C.attach)} aria-label={tx(C.attach)}>
                        <Paperclip className="h-4 w-4" />
                    </button>
                    <PillMenu
                        title={tx(C.mode)}
                        label={tx(modeOption.label)}
                        icon={<ModeIcon className="h-3.5 w-3.5 shrink-0 text-violet-500" aria-hidden />}
                        value={props.mode}
                        disabled={busy}
                        compact
                        onChange={props.onModeChange}
                        options={MODES.map((entry) => {
                            const Icon = entry.icon;
                            return { id: entry.id, label: tx(entry.label), description: tx(entry.description), icon: <Icon className="h-4 w-4" aria-hidden /> };
                        })}
                    />
                    <PillMenu
                        title={tx(C.agent)}
                        label={tx(agentOption.short)}
                        icon={<AgentIcon className={cx("h-3.5 w-3.5 shrink-0", props.agentMode === "off" ? "text-zinc-400" : "text-emerald-500")} aria-hidden />}
                        value={props.agentMode}
                        compact
                        onChange={props.onAgentModeChange}
                        options={AGENT_MODE_OPTIONS.map((entry) => {
                            const Icon = entry.icon;
                            return { id: entry.id, label: tx(entry.label), description: tx(entry.description), icon: <Icon className="h-4 w-4" aria-hidden /> };
                        })}
                        footer={(
                            <div className="space-y-1.5">
                                <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">{tx(AGENT_NEVER)}</p>
                                {props.grantedCount ? (
                                    <button type="button" onClick={props.onResetGrants} className="text-[11.5px] font-semibold text-violet-600 hover:underline dark:text-violet-300">
                                        {tx(C.resetGrants, { count: props.grantedCount })}
                                    </button>
                                ) : null}
                            </div>
                        )}
                    />
                    {props.connections ? <ModelPicker connections={props.connections} variant={variant} /> : null}
                    <span className="ms-auto flex items-center gap-2">
                        {input.length > MAX_INPUT * 0.8 ? <span className="text-[11px] tabular-nums text-zinc-400">{tx(C.chars, { count: input.length, max: MAX_INPUT })}</span> : null}
                        {busy ? (
                            <button type="button" onClick={props.onStop} className="grid h-9 w-9 place-items-center rounded-full bg-zinc-900 text-white transition hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 dark:bg-white dark:text-zinc-900" aria-label={tx(C.stop)} title={tx(C.stop)}>
                                <Square className="h-3.5 w-3.5 fill-current" />
                            </button>
                        ) : (
                            <button type="button" onClick={props.onSend} disabled={!input.trim()} className="grid h-9 w-9 place-items-center rounded-full bg-violet-600 text-white shadow-sm transition hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 disabled:bg-zinc-200 disabled:text-zinc-400 disabled:shadow-none dark:disabled:bg-white/10 dark:disabled:text-zinc-500" aria-label={tx(C.send)} title={tx(C.send)}>
                                <ArrowUp className="h-4.5 w-4.5" />
                            </button>
                        )}
                    </span>
                </div>
            </div>
            {props.attachError ? <p className="mt-1.5 px-2 text-[12px] font-semibold text-red-600 dark:text-red-400" role="alert">{props.attachError}</p> : null}
            <div className="mt-1.5 flex items-center justify-center gap-2 px-2 text-center text-[10.5px] text-zinc-400">
                <span className="truncate">{tx(C.disclaimer)}</span>
                {variant === "page" ? <span className="hidden shrink-0 md:inline">· {tx(C.keys)}</span> : null}
            </div>
        </div>
    );
}
