import "server-only";

import { acceptedRulesVersion, mustAcceptRules, readGroupRules, type GroupRole, type StoredGroupRules } from "@/lib/groups";
import { memberKey } from "./group-keys";

/*
 * The group's Rules section on the server: one check every write path asks
 * (messages, edits, files, voice messages, reactions and the voice channel)
 * before it lets a member take part. Acceptance lives on the group document
 * as `rulesAccepted.{memberKey}: version`, by pseudonymous key (never the
 * e-mail address), like the typing state.
 */

/** The fields of a group document the rules check reads. */
export type RulesGateGroup = StoredGroupRules & {
    ownerEmail?: unknown;
    admins?: unknown;
    moderators?: unknown;
    members?: unknown;
    rulesAccepted?: unknown;
};

/** Shown to the person (Turkish, the primary language); the interface translates the code. */
export const RULES_NOT_ACCEPTED_MESSAGE = "Grupta yazmadan, tepki vermeden veya sesli kanala katılmadan önce grubun kurallarını kabul etmelisiniz.";

const listed = (value: unknown, email: string) => Array.isArray(value) && value.includes(email);

function roleIn(group: RulesGateGroup, email: string): GroupRole | null {
    if (!listed(group.members, email)) return null;
    if (group.ownerEmail === email) return "owner";
    if (listed(group.admins, email)) return "admin";
    if (listed(group.moderators, email)) return "moderator";
    return "member";
}

/** The `rulesAccepted` field of one member (for update masks). */
export function rulesAcceptedField(groupId: string, email: string) {
    return `rulesAccepted.${memberKey(groupId, email)}`;
}

/**
 * True when `email` must accept the group's rules before writing, reacting,
 * sending files or voice messages or joining the voice channel: screening is
 * on, the group has rules, the person isn't the owner, an admin or a
 * moderator, and hasn't accepted the version members must accept.
 */
export function rulesBlock(groupId: string, group: RulesGateGroup, email: string) {
    return mustAcceptRules(readGroupRules(group), roleIn(group, email), acceptedRulesVersion(group.rulesAccepted, memberKey(groupId, email)));
}
