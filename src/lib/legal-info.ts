/**
 * Who operates Hanogt Codev, as shown in the legal texts (Terms, Privacy,
 * KVKK disclosure, Refund Policy). Paddle's website review needs the legal
 * name in the Terms; the owner fills this in under Admin Panel > Subscriptions
 * and it is stored in site_config/legal. Client-safe.
 */

export type OperatorInfo = {
    /** Legal name: the company's trade name or the sole proprietor's full name. */
    legalName: string;
    /** Brand the service is offered under. */
    brand: string;
    contactEmail: string;
    address: string;
    /** VKN / MERSİS number, if the owner wants it published. */
    taxId: string;
    /** KEP (registered electronic mail) address, optional. */
    kep: string;
    updatedAt: string | null;
};

export const DEFAULT_BRAND = "HanStudios / Hanogt Codev";

export const OPERATOR_LIMITS = { legalName: 160, brand: 120, contactEmail: 254, address: 300, taxId: 40, kep: 254 } as const;

export const EMPTY_OPERATOR_INFO: OperatorInfo = { legalName: "", brand: DEFAULT_BRAND, contactEmail: "", address: "", taxId: "", kep: "", updatedAt: null };

const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
// Control characters and bidi overrides (which can disguise text) are removed.
const UNSAFE = /[\u0000-\u001f\u007f‪-‮⁦-⁩]/g;

function clean(value: unknown, max: number) {
    return typeof value === "string" ? value.replace(UNSAFE, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export function normalizeOperatorInfo(record: Record<string, unknown> | null | undefined): OperatorInfo {
    if (!record) return EMPTY_OPERATOR_INFO;
    const email = clean(record.contactEmail, OPERATOR_LIMITS.contactEmail).toLowerCase();
    const kep = clean(record.kep, OPERATOR_LIMITS.kep).toLowerCase();
    return {
        legalName: clean(record.legalName, OPERATOR_LIMITS.legalName),
        brand: clean(record.brand, OPERATOR_LIMITS.brand) || DEFAULT_BRAND,
        contactEmail: EMAIL.test(email) ? email : "",
        address: clean(record.address, OPERATOR_LIMITS.address),
        taxId: clean(record.taxId, OPERATOR_LIMITS.taxId),
        kep: EMAIL.test(kep) ? kep : "",
        updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : null,
    };
}

/** Field errors for the admin form; empty when the input can be saved. */
export function operatorInfoErrors(input: Record<string, unknown>): Array<keyof typeof OPERATOR_LIMITS> {
    const errors: Array<keyof typeof OPERATOR_LIMITS> = [];
    for (const key of Object.keys(OPERATOR_LIMITS) as Array<keyof typeof OPERATOR_LIMITS>) {
        const value = input[key];
        if (value !== undefined && value !== null && (typeof value !== "string" || value.length > OPERATOR_LIMITS[key])) errors.push(key);
    }
    const email = typeof input.contactEmail === "string" ? input.contactEmail.trim() : "";
    if (email && !EMAIL.test(email)) errors.push("contactEmail");
    const kep = typeof input.kep === "string" ? input.kep.trim() : "";
    if (kep && !EMAIL.test(kep)) errors.push("kep");
    return [...new Set(errors)];
}

/** The legal texts name the operator once both the legal name and a contact address are set. */
export function isOperatorPublished(info: OperatorInfo) {
    return Boolean(info.legalName && info.contactEmail);
}
