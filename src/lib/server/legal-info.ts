import "server-only";

import { normalizeOperatorInfo, type OperatorInfo } from "@/lib/legal-info";
import { commitServerMutations, getServerDocument, isFirebaseServerConfigured } from "./firebase-rest";

export const LEGAL_INFO_PATH = "site_config/legal";

let cache: { at: number; info: OperatorInfo } | null = null;

/** Operator details for the legal pages; empty (the "not published yet" notice) when unreadable. */
export async function getOperatorInfo(fresh = false): Promise<OperatorInfo> {
    if (!fresh && cache && Date.now() - cache.at < 60_000) return cache.info;
    if (!isFirebaseServerConfigured()) return normalizeOperatorInfo(null);
    try {
        const info = normalizeOperatorInfo(await getServerDocument<Record<string, unknown>>(LEGAL_INFO_PATH));
        cache = { at: Date.now(), info };
        return info;
    } catch {
        return cache?.info ?? normalizeOperatorInfo(null);
    }
}

/** Saves what the owner entered (already validated with operatorInfoErrors). */
export async function saveOperatorInfo(input: Partial<Record<keyof OperatorInfo, unknown>>, actor: string, extraMutations: Parameters<typeof commitServerMutations>[0] = []) {
    const info = normalizeOperatorInfo({ ...input, updatedAt: new Date().toISOString() });
    await commitServerMutations([
        {
            type: "update",
            path: LEGAL_INFO_PATH,
            data: { legalName: info.legalName, brand: info.brand, contactEmail: info.contactEmail, address: info.address, taxId: info.taxId, kep: info.kep, updatedAt: info.updatedAt, updatedBy: actor },
        },
        ...extraMutations,
    ]);
    cache = null;
    return info;
}
