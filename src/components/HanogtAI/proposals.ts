import type { AiConversation, AiMessage } from "@/lib/ai/conversations";
import { proposedEdit, type ProposedEdit } from "@/lib/ai/file-edit";

/**
 * The change an answer proposes for its file, worked out once per answer and
 * kept (answers only grow, so the length tells versions apart): the chat
 * re-renders every frame while another answer streams.
 */
const proposals = new Map<string, ProposedEdit | null>();
const PROPOSALS_KEPT = 120;

export function proposalOf(message: AiMessage): ProposedEdit | null {
    const edit = message.edit;
    if (message.role !== "assistant" || !edit || !message.content || message.error) return null;
    const key = `${message.id}:${message.content.length}:${edit.base.length}`;
    const cached = proposals.get(key);
    if (cached !== undefined) return cached;
    const value = proposedEdit(message.content, { code: edit.base, language: edit.language, fileName: edit.fileName });
    proposals.set(key, value);
    if (proposals.size > PROPOSALS_KEPT) proposals.delete(proposals.keys().next().value!);
    return value;
}

/** working: the answer is being written · ready: a change waits · applied · dismissed · answered: no change to the file. */
export type TaskState = "working" | "ready" | "applied" | "dismissed" | "answered";

export interface ChatTask {
    conversation: AiConversation;
    fileName: string;
    state: TaskState;
    added: number;
    removed: number;
}

/**
 * A conversation about a file in the editor is a task (Codex-style): its
 * newest answer about the file says where it stands.
 */
export function taskOf(conversation: AiConversation, streamingId: string | null): ChatTask | null {
    for (let index = conversation.messages.length - 1; index >= 0; index -= 1) {
        const message = conversation.messages[index];
        if (message.role !== "assistant" || !message.edit) continue;
        const proposal = proposalOf(message);
        const state: TaskState = message.id === streamingId ? "working" : message.edit.status ?? (proposal ? "ready" : "answered");
        return { conversation, fileName: message.edit.fileName, state, added: proposal?.added ?? 0, removed: proposal?.removed ?? 0 };
    }
    return null;
}
