/**
 * BM25 retrieval over the Hanogt knowledge base. Shared by the offline engine
 * and the /api/ai route (retrieval-augmented generation).
 */
import { allKnowledge, knowledgeSearchText, type KnowledgeEntry } from "./knowledge";
import { Bm25Index } from "./nlp.mjs";

let knowledgeIndex: { index: InstanceType<typeof Bm25Index>; byId: Map<string, KnowledgeEntry> } | null = null;

function knowledge() {
    if (!knowledgeIndex) {
        const entries = allKnowledge();
        knowledgeIndex = {
            index: new Bm25Index(entries.map((entry) => ({ id: entry.id, text: knowledgeSearchText(entry), boost: entry.id.startsWith("guide:") ? 0.85 : 1 }))),
            byId: new Map(entries.map((entry) => [entry.id, entry])),
        };
    }
    return knowledgeIndex;
}

export function knowledgeById(id: string) {
    return knowledge().byId.get(id);
}

/** Best knowledge entries for a query. */
export function searchKnowledge(query: string, limit = 4) {
    const { index, byId } = knowledge();
    return index.search(query, limit)
        .map((hit) => ({ ...hit, entry: byId.get(hit.id) }))
        .filter((hit): hit is typeof hit & { entry: KnowledgeEntry } => Boolean(hit.entry));
}
