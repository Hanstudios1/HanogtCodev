"use client";

/**
 * Runs Hanogt AI agent tools in the browser, with the signed-in user's own
 * session and the site's existing APIs: no new endpoints, no extra rights.
 * Each call is re-validated here (agentArgsProblem) because the user may have
 * edited the arguments on the confirmation card.
 *
 * Results have two parts: `output`, a small JSON summary that goes back to the
 * language model as the tool result, and `view`, what the card shows.
 */
import { GROUP_ERROR_COPY, GroupRequestError, groupsApi, type GroupClientErrorCode } from "@/components/Groups/api";
import { openInEditor } from "@/lib/editor-bridge";
import { getGroupTemplate, isGroupId, seedLanguageFor } from "@/lib/groups";
import type { Copy } from "@/lib/i18n";
import type { AgentResultView } from "./agent-protocol";
import { AGENT_TOOL_REQUIRES_AUTH, agentArgsProblem, summarizeProfile, type AgentCallInput } from "./agent-tools";
import { knowledgeText } from "./knowledge";
import { searchKnowledge } from "./retrieval";

export type AgentExecResult = { ok: true; output: string; view?: AgentResultView } | { ok: false; error: string };

export interface AgentExecContext {
    /** Client-side navigation (router.push), also used to open the editor. */
    navigate: (href: string) => void;
    /** UI language code ("TR", "EN"…): the language of a new group's starter files and of search results. */
    language: string;
    signedIn: boolean;
}

export const AGENT_ERROR_COPY: Record<string, Copy> = {
    sign_in: { TR: "Bunun için giriş yapman gerekiyor.", EN: "You need to sign in for this." },
    rate_limited: { TR: "Çok fazla istek yapıldı. Biraz bekleyip tekrar dene.", EN: "Too many requests. Wait a moment and try again." },
    network: { TR: "Sunucuya ulaşılamadı. Bağlantını kontrol edip tekrar dene.", EN: "The server couldn't be reached. Check your connection and try again." },
    server_error: { TR: "İşlem şu anda yapılamadı. Biraz sonra tekrar dene.", EN: "The action couldn't be completed right now. Try again later." },
    too_large: { TR: "Bu, kaydetmek için fazla büyük.", EN: "This is too large to save." },
    storage_unavailable: { TR: "Tarayıcı depolaması kullanılamıyor (gizli pencere veya dolu depolama olabilir).", EN: "Browser storage is unavailable (a private window or full storage, perhaps)." },
    unsupported_language: { TR: "Bu dil Kod Editörü'nde desteklenmiyor.", EN: "The Code Editor doesn't support this language." },
    empty_code: { TR: "Açılacak kod yok.", EN: "There's no code to open." },
    code_too_large: { TR: "Kod, editöre aktarmak için fazla uzun.", EN: "The code is too long to send to the editor." },
    invalid_arguments: { TR: "İşlemin ayrıntıları geçersiz.", EN: "The action's details are invalid." },
    name_too_short: { TR: "Lütfen daha uzun bir ad yaz.", EN: "Please enter a longer name." },
    invalid_template: { TR: "Bu şablon bulunamadı.", EN: "This template doesn't exist." },
    invalid_route: { TR: "Bu sayfayı açamam.", EN: "I can't open this page." },
    empty_query: { TR: "Aranacak bir şey yazılmadı.", EN: "There's nothing to search for." },
    unknown_tool: { TR: "Hanogt AI bu işlemi yapamaz.", EN: "Hanogt AI can't perform this action." },
    interrupted: { TR: "Sayfa kapandığı için işlem yarıda kaldı; sonucu ilgili sayfadan kontrol et.", EN: "The page closed before the action finished; check the result on the related page." },
    plan_group_limit: { TR: "Planının grup sınırına ulaştın. Yeni grup için bir grubu silebilir ya da Fiyatlandırma'dan planını yükseltebilirsin.", EN: "You've reached your plan's group limit. Delete a group or upgrade your plan on Pricing to create a new one." },
    plan_game_limit: { TR: "Planının oyun projesi sınırına ulaştın. Eski bir projeyi silebilir ya da Fiyatlandırma'dan planını yükseltebilirsin.", EN: "You've reached your plan's game project limit. Delete an old project or upgrade your plan on Pricing." },
};

/** Localized text for an AgentArgError, an execution error or a group API code ("group_rate_limited"). */
export function agentErrorText(code: string | undefined, tx: (copy: Copy) => string): string {
    if (code?.startsWith("group_")) {
        const groupCode = code.slice(6) as GroupClientErrorCode;
        if (groupCode in GROUP_ERROR_COPY) return tx(GROUP_ERROR_COPY[groupCode]);
    }
    return tx(AGENT_ERROR_COPY[code ?? ""] ?? AGENT_ERROR_COPY.server_error);
}

const fail = (error: string): AgentExecResult => ({ ok: false, error });

function statusError(status: number): string {
    if (status === 401) return "sign_in";
    if (status === 429) return "rate_limited";
    if (status === 413) return "too_large";
    if (status === 0) return "network";
    return "server_error";
}

async function readProfile(): Promise<AgentExecResult> {
    let response: Response;
    try {
        response = await fetch("/api/account/profile", { cache: "no-store", credentials: "same-origin" });
    } catch {
        return fail("network");
    }
    if (!response.ok) return fail(statusError(response.status));
    const summary = summarizeProfile(await response.json().catch(() => null));
    if (!summary) return fail("server_error");
    return { ok: true, output: JSON.stringify({ status: "ok", profile: summary }), view: { profile: summary } };
}

async function createGroup(call: Extract<AgentCallInput, { name: "create_group" }>, context: AgentExecContext): Promise<AgentExecResult> {
    const template = getGroupTemplate(call.args.template);
    try {
        // The same request the "New group" wizard sends.
        const result = await groupsApi.action<{ success: true; id: string }>({
            action: "create",
            name: call.args.name.trim(),
            description: call.args.description.trim(),
            emoji: template.emoji,
            color: call.args.color ?? template.color,
            template: template.id,
            language: seedLanguageFor(context.language),
        });
        if (!isGroupId(result.id)) return fail("server_error");
        const href = `/social/g/${encodeURIComponent(result.id)}`;
        return {
            ok: true,
            output: JSON.stringify({ status: "created", groupId: result.id, name: call.args.name.trim(), template: template.id, url: href }),
            view: { href, title: call.args.name.trim() },
        };
    } catch (error) {
        if (error instanceof GroupRequestError) return fail(error.code === "unauthorized" ? "sign_in" : error.code === "group_limit" ? "plan_group_limit" : `group_${error.code}`);
        return fail("network");
    }
}

async function createGame(call: Extract<AgentCallInput, { name: "create_game" }>, context: AgentExecContext): Promise<AgentExecResult> {
    try {
        // The engine modules are large; they load only when a game is created.
        const [{ createProjectFromTemplate, PROJECT_TEMPLATES }, { createCloudProject, PersistenceError }] = await Promise.all([
            import("@/lib/game-engine/templates"),
            import("@/components/GameEngine/editor/persistence"),
        ]);
        const template = PROJECT_TEMPLATES.find((entry) => entry.id === call.args.template);
        if (!template) return fail("invalid_template");
        try {
            const project = createProjectFromTemplate(template.id, call.args.name.trim());
            if (call.args.description.trim()) project.description = call.args.description.trim();
            const created = await createCloudProject(project);
            const href = `/game-engine?project=${encodeURIComponent(created.id)}&source=cloud`;
            context.navigate(href);
            return {
                ok: true,
                output: JSON.stringify({ status: "created", projectId: created.id, name: call.args.name.trim(), template: template.id, url: href, opened: true }),
                view: { href, title: call.args.name.trim() },
            };
        } catch (error) {
            if (error instanceof PersistenceError && error.code === "game_limit") return fail("plan_game_limit");
            return fail(error instanceof PersistenceError ? statusError(error.status) : "server_error");
        }
    } catch {
        return fail("network");
    }
}

function openEditor(call: Extract<AgentCallInput, { name: "open_editor_with_code" }>, context: AgentExecContext): AgentExecResult {
    const result = openInEditor({ name: call.args.fileName, language: call.args.language, code: call.args.code }, { navigate: context.navigate });
    if (!result.ok) {
        const map: Record<string, string> = { too_large: "code_too_large", unsupported_language: "unsupported_language", empty_code: "empty_code" };
        return fail(map[result.error] ?? "storage_unavailable");
    }
    return {
        ok: true,
        output: JSON.stringify({ status: "opened", fileName: call.args.fileName, note: "The code is open in a new unsaved Code Editor tab." }),
        view: { href: "/editor", title: call.args.fileName },
    };
}

function searchSite(call: Extract<AgentCallInput, { name: "search_site" }>, context: AgentExecContext): AgentExecResult {
    const turkish = context.language.toUpperCase() === "TR";
    const hits = searchKnowledge(call.args.query, 4);
    const results = hits.map((hit) => ({
        id: hit.entry.id,
        title: knowledgeText(hit.entry.title, turkish),
        text: (hit.entry.parts ? hit.entry.parts.map((part) => knowledgeText(part, turkish)).join("\n") : knowledgeText(hit.entry.body, turkish)).slice(0, 700),
        links: hit.entry.links?.map((link) => link.href) ?? [],
    }));
    return { ok: true, output: JSON.stringify({ status: "ok", query: call.args.query, results }), view: { hits: hits.map((hit) => hit.entry.id) } };
}

/** Runs one approved call. Never throws. */
export async function executeAgentCall(call: AgentCallInput, context: AgentExecContext): Promise<AgentExecResult> {
    const problem = agentArgsProblem(call);
    if (problem) return fail(problem);
    if (AGENT_TOOL_REQUIRES_AUTH[call.name] && !context.signedIn) return fail("sign_in");
    try {
        switch (call.name) {
            case "get_my_profile":
                return await readProfile();
            case "create_group":
                return await createGroup(call, context);
            case "create_game":
                return await createGame(call, context);
            case "open_editor_with_code":
                return openEditor(call, context);
            case "navigate":
                context.navigate(call.args.route);
                return { ok: true, output: JSON.stringify({ status: "opened", route: call.args.route }), view: { href: call.args.route } };
            case "search_site":
                return searchSite(call, context);
        }
    } catch {
        return fail("server_error");
    }
    return fail("unknown_tool");
}
