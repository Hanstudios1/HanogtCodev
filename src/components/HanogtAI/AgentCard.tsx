"use client";

import {
    AlertTriangle, Ban, Bot, Check, Code2, Compass, FolderPlus, Gamepad2, Loader2, LogIn, Search, SquareArrowOutUpRight, UserRound,
} from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState, type ReactNode } from "react";
import { agentErrorText } from "@/lib/ai/agent-client";
import type { AgentCallRecord } from "@/lib/ai/agent-protocol";
import {
    AGENT_GAME_DESCRIPTION_MAX, AGENT_GAME_NAME_MAX, AGENT_ROUTES, AGENT_TOOL_KIND, AGENT_TOOL_REQUIRES_AUTH, AGENT_TOOL_TITLES,
    agentArgsProblem, agentGameTemplates, agentRouteLabel, sanitizeAgentCall, type AgentMode, type AgentProfileSummary, type AgentToolName,
} from "@/lib/ai/agent-tools";
import { knowledgeById } from "@/lib/ai/retrieval";
import { GROUP_LIMITS, GROUP_TEMPLATES } from "@/lib/groups";
import { useI18n, type Copy } from "@/lib/i18n";
import { languageDisplayName } from "@/lib/runtimes/languages";
import { cx } from "./ui";

const C = {
    wants: { TR: "Hanogt AI şunu yapmak istiyor:", EN: "Hanogt AI wants to:" },
    did: { TR: "Hanogt AI işlemi:", EN: "Hanogt AI action:" },
    allow: { TR: "İzin ver", EN: "Allow" },
    allowSession: { TR: "Bu oturumda hep izin ver", EN: "Always allow this session" },
    deny: { TR: "Reddet", EN: "Deny" },
    running: { TR: "Yapılıyor…", EN: "Working…" },
    denied: { TR: "Reddettin; hiçbir şey yapılmadı.", EN: "You denied it; nothing was done." },
    dismissed: { TR: "Yanıtlanmadı; hiçbir şey yapılmadı.", EN: "Not answered; nothing was done." },
    agentOff: { TR: "Ajan modu kapalı. Bu işlemi onaylamak için sohbetteki ajan modunu aç.", EN: "Agent mode is off. Turn it on in the chat to approve this action." },
    signIn: { TR: "Giriş yap", EN: "Sign in" },
    signInNeeded: { TR: "Bu işlem senin hesabınla yapılır; önce giriş yapmalısın.", EN: "This runs with your account; please sign in first." },
    kind: {
        read: { TR: "Yalnızca görünen profil bilgilerin okunur; bu oturumda bir daha sorulmaz.", EN: "Only your visible profile details are read; you won't be asked again this session." },
        write: { TR: "Hesabında yeni bir şey oluşturulur. Ayrıntıları göndermeden önce değiştirebilirsin.", EN: "Something new is created on your account. You can change the details before allowing it." },
        navigate: { TR: "Bir sayfa ya da editör sekmesi açılır; hiçbir şey kaydedilmez ya da çalıştırılmaz.", EN: "A page or an editor tab opens; nothing is saved or run." },
        info: { TR: "Sitenin bilgi tabanında arama yapılır.", EN: "Searches the site's knowledge base." },
    } satisfies Record<string, Copy>,
    groupName: { TR: "Grup adı", EN: "Group name" },
    template: { TR: "Şablon", EN: "Template" },
    description: { TR: "Açıklama (isteğe bağlı)", EN: "Description (optional)" },
    projectName: { TR: "Proje adı", EN: "Project name" },
    gameTemplate: { TR: "{emoji} {name} · {dimension}", EN: "{emoji} {name} · {dimension}" },
    fileName: { TR: "Dosya adı", EN: "File name" },
    language: { TR: "Dil: {language}", EN: "Language: {language}" },
    showCode: { TR: "Kodu göster ve düzenle ({lines} satır)", EN: "Show and edit the code ({lines} lines)" },
    page: { TR: "Sayfa", EN: "Page" },
    query: { TR: "Arama", EN: "Search" },
    profileReads: { TR: "Okunacaklar: görünen ad, takma ad ve etiket, biyografi, durum, favori diller, üyelik tarihi, rol ve sayılar (proje, oyun, grup, arkadaş, Media gönderisi). E-posta ve özel ayarlar okunmaz.", EN: "Read: display name, nickname and tag, bio, status, favourite languages, member since, role and counts (projects, games, groups, friends, Media posts). Your e-mail and private settings are not read." },
    groupCreated: { TR: "**{name}** grubu oluşturuldu.", EN: "The group **{name}** was created." },
    openGroup: { TR: "Grubu aç", EN: "Open the group" },
    gameCreated: { TR: "**{name}** projesi oluşturuldu ve Oyun Motoru'nda açıldı.", EN: "The project **{name}** was created and opened in the Game Engine." },
    openProject: { TR: "Projeyi aç", EN: "Open the project" },
    editorOpened: { TR: "**{name}** Kod Editörü'nde açıldı.", EN: "**{name}** opened in the Code Editor." },
    goEditor: { TR: "Editöre git", EN: "Go to the editor" },
    pageOpened: { TR: "**{page}** açıldı.", EN: "**{page}** opened." },
    goPage: { TR: "Sayfaya git", EN: "Go to the page" },
    searched: { TR: "Sitede arandı: “{query}”", EN: "Searched the site: “{query}”" },
    noHits: { TR: "Sonuç bulunamadı.", EN: "No results." },
    profileRead: { TR: "Profil bilgilerin okundu.", EN: "Your profile was read." },
    memberSince: { TR: "Üyelik: {date}", EN: "Member since {date}" },
    nicknameTag: { TR: "{nickname}#{tag}", EN: "{nickname}#{tag}" },
    projects: { TR: "Proje", EN: "Projects" },
    games: { TR: "Oyun", EN: "Games" },
    groups: { TR: "Grup", EN: "Groups" },
    friends: { TR: "Arkadaş", EN: "Friends" },
    posts: { TR: "Media", EN: "Media" },
    roles: {
        owner: { TR: "Kurucu", EN: "Owner" },
        admin: { TR: "Yönetici", EN: "Admin" },
        moderator: { TR: "Moderatör", EN: "Moderator" },
    } satisfies Record<string, Copy>,
} satisfies Record<string, unknown>;

const TOOL_ICONS: Record<AgentToolName, typeof Bot> = {
    get_my_profile: UserRound,
    create_group: FolderPlus,
    open_editor_with_code: Code2,
    create_game: Gamepad2,
    navigate: Compass,
    search_site: Search,
};

const FIELD = "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[13px] text-zinc-900 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10 dark:border-white/10 dark:bg-zinc-950/60 dark:text-zinc-100";
const LABEL = "mb-1 block text-[11.5px] font-semibold text-zinc-600 dark:text-zinc-300";

/** Renders **bold** in a short, already translated line. */
function Strong({ text }: { text: string }) {
    const parts = text.split(/\*\*(.+?)\*\*/g);
    return <>{parts.map((part, index) => (index % 2 ? <strong key={index} className="font-semibold text-zinc-900 dark:text-white">{part}</strong> : part))}</>;
}

function ResultLink({ href, label, onNavigate }: { href: string; label: string; onNavigate?: () => void }) {
    return (
        <Link href={href} onClick={onNavigate} className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
            <SquareArrowOutUpRight className="h-3.5 w-3.5" aria-hidden />{label}
        </Link>
    );
}

function ProfileView({ profile }: { profile: AgentProfileSummary }) {
    const { tx, locale } = useI18n();
    const stats: Array<[Copy, number | null]> = [
        [C.projects, profile.stats.projects], [C.games, profile.stats.gameProjects], [C.groups, profile.stats.groups], [C.friends, profile.stats.friends], [C.posts, profile.stats.mediaPosts],
    ];
    return (
        <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[14px] font-bold text-zinc-900 dark:text-white">{profile.displayName || profile.nickname}</span>
                {profile.nickname ? <span className="font-mono text-[12px] text-zinc-500 dark:text-zinc-400" dir="ltr">{profile.tag ? tx(C.nicknameTag, { nickname: profile.nickname, tag: profile.tag }) : profile.nickname}</span> : null}
                {profile.staffRole ? <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] font-bold text-violet-700 dark:text-violet-300">{tx(C.roles[profile.staffRole])}</span> : null}
            </div>
            {profile.customStatus ? <p className="text-[12.5px] text-zinc-600 dark:text-zinc-300">{profile.customStatus}</p> : null}
            {profile.bio ? <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">{profile.bio}</p> : null}
            {profile.favoriteLanguages.length ? (
                <div className="flex flex-wrap gap-1.5">
                    {profile.favoriteLanguages.map((name) => <span key={name} className="rounded-full border border-zinc-200 px-2 py-0.5 text-[11.5px] font-semibold text-zinc-600 dark:border-white/10 dark:text-zinc-300">{name}</span>)}
                </div>
            ) : null}
            <dl className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                {stats.map(([label, value]) => (
                    <div key={label.EN} className="rounded-xl bg-white px-2 py-1.5 text-center dark:bg-white/[0.04]">
                        <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-zinc-400">{tx(label)}</dt>
                        <dd className="text-[15px] font-black tabular-nums text-zinc-900 dark:text-white">{value ?? "—"}</dd>
                    </div>
                ))}
            </dl>
            {profile.memberSince ? <p className="text-[11.5px] text-zinc-500 dark:text-zinc-400">{tx(C.memberSince, { date: new Date(profile.memberSince).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" }) })}</p> : null}
        </div>
    );
}

function Fields({ name, draft, setDraft }: { name: AgentToolName; draft: Record<string, unknown>; setDraft: (patch: Record<string, unknown>) => void }) {
    const { tx } = useI18n();
    const id = useId();
    const text = (key: string) => (typeof draft[key] === "string" ? draft[key] as string : "");
    switch (name) {
        case "create_group":
            return (
                <div className="grid gap-2 sm:grid-cols-2">
                    <label className="sm:col-span-2">
                        <span className={LABEL}>{tx(C.groupName)}</span>
                        <input value={text("name")} maxLength={GROUP_LIMITS.nameMax} onChange={(event) => setDraft({ name: event.target.value })} className={FIELD} required />
                    </label>
                    <label>
                        <span className={LABEL}>{tx(C.template)}</span>
                        <select value={text("template") || "blank"} onChange={(event) => setDraft({ template: event.target.value })} className={FIELD}>
                            {GROUP_TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.emoji} {tx(template.name)}</option>)}
                        </select>
                    </label>
                    <label className="sm:col-span-2">
                        <span className={LABEL}>{tx(C.description)}</span>
                        <textarea value={text("description")} maxLength={GROUP_LIMITS.descriptionMax} rows={2} onChange={(event) => setDraft({ description: event.target.value })} className={cx(FIELD, "resize-y")} />
                    </label>
                </div>
            );
        case "create_game":
            return (
                <div className="grid gap-2 sm:grid-cols-2">
                    <label>
                        <span className={LABEL}>{tx(C.projectName)}</span>
                        <input value={text("name")} maxLength={AGENT_GAME_NAME_MAX} onChange={(event) => setDraft({ name: event.target.value })} className={FIELD} required />
                    </label>
                    <label>
                        <span className={LABEL}>{tx(C.template)}</span>
                        <select value={text("template")} onChange={(event) => setDraft({ template: event.target.value })} className={FIELD}>
                            {agentGameTemplates().map((template) => <option key={template.id} value={template.id}>{tx(C.gameTemplate, { emoji: template.emoji, name: tx(template.name), dimension: template.dimension.toUpperCase() })}</option>)}
                        </select>
                    </label>
                    <label className="sm:col-span-2">
                        <span className={LABEL}>{tx(C.description)}</span>
                        <textarea value={text("description")} maxLength={AGENT_GAME_DESCRIPTION_MAX} rows={2} onChange={(event) => setDraft({ description: event.target.value })} className={cx(FIELD, "resize-y")} />
                    </label>
                </div>
            );
        case "open_editor_with_code": {
            const code = text("code");
            return (
                <div className="space-y-2">
                    <label className="block">
                        <span className={LABEL}>{tx(C.fileName)}</span>
                        <input value={text("fileName")} maxLength={120} onChange={(event) => setDraft({ fileName: event.target.value })} className={cx(FIELD, "font-mono")} dir="ltr" />
                    </label>
                    <p className="text-[11.5px] text-zinc-500 dark:text-zinc-400">{tx(C.language, { language: languageDisplayName(text("language")) })}</p>
                    <details className="rounded-xl border border-zinc-200 dark:border-white/10">
                        <summary className="cursor-pointer select-none px-3 py-2 text-[12.5px] font-semibold text-zinc-600 dark:text-zinc-300">{tx(C.showCode, { lines: code.split("\n").length })}</summary>
                        <textarea
                            id={`${id}-code`}
                            aria-label={tx(C.showCode, { lines: code.split("\n").length })}
                            value={code}
                            onChange={(event) => setDraft({ code: event.target.value })}
                            rows={10}
                            spellCheck={false}
                            dir="ltr"
                            className="block w-full resize-y rounded-b-xl border-t border-zinc-200 bg-zinc-950 p-3 font-mono text-[12px] leading-relaxed text-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400/50 dark:border-white/10"
                        />
                    </details>
                </div>
            );
        }
        case "navigate":
            return (
                <label className="block">
                    <span className={LABEL}>{tx(C.page)}</span>
                    <select value={text("route")} onChange={(event) => setDraft({ route: event.target.value })} className={FIELD}>
                        {AGENT_ROUTES.map((route) => <option key={route.path} value={route.path}>{tx(route.label)}</option>)}
                    </select>
                </label>
            );
        case "search_site":
            return (
                <label className="block">
                    <span className={LABEL}>{tx(C.query)}</span>
                    <input value={text("query")} maxLength={200} onChange={(event) => setDraft({ query: event.target.value })} className={FIELD} />
                </label>
            );
        default:
            return <p className="text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-300">{tx(C.profileReads)}</p>;
    }
}

function DoneView({ call, onNavigate }: { call: AgentCallRecord; onNavigate?: () => void }) {
    const { tx } = useI18n();
    const name = typeof call.args.name === "string" ? call.args.name : "";
    const href = call.view?.href;
    switch (call.name) {
        case "get_my_profile":
            return call.view?.profile ? <ProfileView profile={call.view.profile} /> : <p>{tx(C.profileRead)}</p>;
        case "create_group":
            return (
                <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 flex-1"><Strong text={tx(C.groupCreated, { name: call.view?.title ?? name })} /></p>
                    {href ? <ResultLink href={href} label={tx(C.openGroup)} onNavigate={onNavigate} /> : null}
                </div>
            );
        case "create_game":
            return (
                <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 flex-1"><Strong text={tx(C.gameCreated, { name: call.view?.title ?? name })} /></p>
                    {href ? <ResultLink href={href} label={tx(C.openProject)} onNavigate={onNavigate} /> : null}
                </div>
            );
        case "open_editor_with_code":
            return (
                <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 flex-1"><Strong text={tx(C.editorOpened, { name: call.view?.title ?? String(call.args.fileName ?? "") })} /></p>
                    <ResultLink href="/editor" label={tx(C.goEditor)} onNavigate={onNavigate} />
                </div>
            );
        case "navigate": {
            const route = AGENT_ROUTES.find((entry) => entry.path === call.args.route);
            return (
                <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 flex-1"><Strong text={tx(C.pageOpened, { page: route ? tx(agentRouteLabel(route.path)) : String(call.args.route) })} /></p>
                    {route ? <ResultLink href={route.path} label={tx(C.goPage)} onNavigate={onNavigate} /> : null}
                </div>
            );
        }
        case "search_site": {
            const hits = (call.view?.hits ?? []).map((id) => knowledgeById(id)).filter((entry) => entry !== undefined);
            return (
                <div className="space-y-1.5">
                    <p className="text-[12px] text-zinc-500 dark:text-zinc-400">{tx(C.searched, { query: String(call.args.query ?? "") })}</p>
                    {hits.length ? (
                        <ul className="flex flex-wrap gap-1.5">
                            {hits.map((entry) => (
                                <li key={entry.id}>
                                    {entry.links?.[0]
                                        ? <Link href={entry.links[0].href} onClick={onNavigate} className="inline-block rounded-full border border-zinc-200 px-2.5 py-1 text-[12px] font-semibold text-zinc-600 transition hover:border-violet-400 hover:text-violet-700 dark:border-white/10 dark:text-zinc-300 dark:hover:text-violet-300">{tx(entry.title)}</Link>
                                        : <span className="inline-block rounded-full border border-zinc-200 px-2.5 py-1 text-[12px] font-semibold text-zinc-600 dark:border-white/10 dark:text-zinc-300">{tx(entry.title)}</span>}
                                </li>
                            ))}
                        </ul>
                    ) : <p className="text-[12px]">{tx(C.noHits)}</p>}
                </div>
            );
        }
        default:
            return null;
    }
}

/**
 * The permission card of one agent action: what Hanogt AI wants to do, the
 * exact (editable) details, and Allow / Always allow this session / Deny.
 * After a decision the same card shows the progress and the result.
 */
export default function AgentCard({ call, agentMode, signedIn, onApprove, onDeny, onNavigate }: {
    call: AgentCallRecord;
    agentMode: AgentMode;
    signedIn: boolean;
    onApprove: (args: Record<string, unknown>, remember: boolean) => void;
    onDeny: () => void;
    /** Called when a result link is followed (the floating panel closes on small screens). */
    onNavigate?: () => void;
}) {
    const { tx } = useI18n();
    const titleId = useId();
    const [draft, setDraftState] = useState<Record<string, unknown>>(call.args);
    const setDraft = (patch: Record<string, unknown>) => setDraftState((current) => ({ ...current, ...patch }));
    const checked = useMemo(() => sanitizeAgentCall(call.name, draft), [call.name, draft]);
    const problem = checked.ok ? agentArgsProblem(checked.call) : checked.error;
    const kind = AGENT_TOOL_KIND[call.name];
    const Icon = TOOL_ICONS[call.name];
    const pending = call.status === "pending";
    const needsSignIn = AGENT_TOOL_REQUIRES_AUTH[call.name] && !signedIn;
    const blocked = agentMode === "off" || needsSignIn;
    const approve = (remember: boolean) => {
        if (checked.ok && !problem && !blocked) onApprove(checked.call.args as Record<string, unknown>, remember);
    };

    let status: ReactNode = null;
    if (call.status === "running") {
        status = <p className="flex items-center gap-2 text-[12.5px] font-semibold text-violet-700 dark:text-violet-300"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{tx(C.running)}</p>;
    } else if (call.status === "done") {
        status = <div className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden /><div className="min-w-0 flex-1 text-[13px] text-zinc-700 dark:text-zinc-200"><DoneView call={call} onNavigate={onNavigate} /></div></div>;
    } else if (call.status === "error") {
        status = (
            <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-red-600 dark:text-red-400">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">{agentErrorText(call.error, tx)}</span>
                {call.error === "sign_in" ? <ResultLink href="/login?callbackUrl=/ai" label={tx(C.signIn)} onNavigate={onNavigate} /> : null}
            </div>
        );
    } else if (call.status === "denied" || call.status === "dismissed") {
        status = <p className="flex items-center gap-2 text-[12.5px] text-zinc-500 dark:text-zinc-400"><Ban className="h-4 w-4 shrink-0" aria-hidden />{tx(call.status === "denied" ? C.denied : C.dismissed)}</p>;
    }

    return (
        <div
            role="group"
            aria-labelledby={titleId}
            className={cx(
                "overflow-hidden rounded-2xl border text-[13px]",
                pending ? "border-violet-300/70 bg-violet-50/70 shadow-sm shadow-violet-500/5 dark:border-violet-400/25 dark:bg-violet-500/[0.07]" : "border-zinc-200 bg-zinc-50/80 dark:border-white/10 dark:bg-white/[0.03]",
            )}
        >
            <div className="flex items-start gap-2.5 px-3 pb-2 pt-3">
                <span className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-xl", pending ? "bg-violet-600 text-white" : "bg-zinc-200 text-zinc-600 dark:bg-white/10 dark:text-zinc-300")}><Icon className="h-4 w-4" aria-hidden /></span>
                <div className="min-w-0 flex-1">
                    <p id={titleId} className="leading-snug text-zinc-600 dark:text-zinc-300">
                        {tx(pending ? C.wants : C.did)} <strong className="font-bold text-zinc-900 dark:text-white">{tx(AGENT_TOOL_TITLES[call.name])}</strong>
                    </p>
                    {pending ? <p className="mt-0.5 text-[11.5px] leading-snug text-zinc-500 dark:text-zinc-400">{tx(C.kind[kind])}</p> : null}
                </div>
            </div>
            {pending ? (
                <>
                    <div className="px-3 pb-3"><Fields name={call.name} draft={draft} setDraft={setDraft} /></div>
                    {problem ? <p className="px-3 pb-2 text-[12px] font-semibold text-red-600 dark:text-red-400" role="alert">{agentErrorText(problem, tx)}</p> : null}
                    {agentMode === "off" ? <p className="px-3 pb-2 text-[12px] text-amber-700 dark:text-amber-300">{tx(C.agentOff)}</p> : null}
                    {needsSignIn ? (
                        <div className="flex flex-wrap items-center gap-2 px-3 pb-2 text-[12px] text-amber-700 dark:text-amber-300">
                            <LogIn className="h-4 w-4 shrink-0" aria-hidden /><span className="min-w-0 flex-1">{tx(C.signInNeeded)}</span>
                            <ResultLink href="/login?callbackUrl=/ai" label={tx(C.signIn)} onNavigate={onNavigate} />
                        </div>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2 border-t border-violet-200/70 bg-white/60 px-3 py-2.5 dark:border-violet-400/15 dark:bg-black/10">
                        <button type="button" onClick={() => approve(false)} disabled={Boolean(problem) || blocked} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 text-[13px] font-bold text-white shadow-sm transition hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 focus-visible:ring-offset-2 disabled:opacity-50 dark:focus-visible:ring-offset-zinc-900">
                            <Check className="h-4 w-4" aria-hidden />{tx(C.allow)}
                        </button>
                        {kind !== "read" ? (
                            <button type="button" onClick={() => approve(true)} disabled={Boolean(problem) || blocked} className="inline-flex h-9 items-center rounded-xl border border-violet-300 bg-white px-3 text-[12.5px] font-semibold text-violet-700 transition hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 disabled:opacity-50 dark:border-violet-400/30 dark:bg-transparent dark:text-violet-300 dark:hover:bg-violet-500/10">
                                {tx(C.allowSession)}
                            </button>
                        ) : null}
                        <button type="button" onClick={onDeny} className="inline-flex h-9 items-center rounded-xl px-3 text-[12.5px] font-semibold text-zinc-600 transition hover:bg-zinc-900/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 dark:text-zinc-300 dark:hover:bg-white/10">
                            {tx(C.deny)}
                        </button>
                    </div>
                </>
            ) : (
                <div className="px-3 pb-3" aria-live="polite">{status}</div>
            )}
        </div>
    );
}
