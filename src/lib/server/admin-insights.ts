import "server-only";

import type { ActivityRange, AdminAiUsageResponse, AdminSocialResponse, StatCount } from "@/components/Admin/types";
import { PLAN_AI_LIMITS } from "@/lib/plans";
import { AUTOMOD_RULE_COPY } from "@/lib/social/automod-config";
import { countDocuments } from "./admin";
import { activityBuckets } from "./admin-activity";
import { AI_USAGE_COLLECTION, AI_USAGE_PLANS, AI_USAGE_SOURCES, dayKeyStart, readAiUsageDays, usageDayKey } from "./ai-usage-stats";
import { getServerDocument, runServerQuery, sumServerQuery } from "./firebase-rest";
import { providerConfig } from "./hanogt-ai";

/*
 * The admin panel's Hanogt AI and Social pages. Both show totals only: the AI
 * page reads the daily totals (lib/server/ai-usage-stats.ts), the Social page
 * counts records with aggregation queries and never returns a message, a
 * reporter or a reported person: the group's own moderators handle those.
 */

const zeroSources = () => Object.fromEntries(AI_USAGE_SOURCES.map((source) => [source, 0])) as AdminAiUsageResponse["totals"]["sources"];
const zeroPlans = () => Object.fromEntries(AI_USAGE_PLANS.map((plan) => [plan, 0])) as AdminAiUsageResponse["totals"]["plans"];

/** The first day the totals were kept (counting started with this release). */
async function firstUsageDay() {
    const [first] = await runServerQuery<{ day?: unknown }>({ collectionId: AI_USAGE_COLLECTION, orderBy: [{ field: "day", direction: "ASCENDING" }], select: ["day"], limit: 1 });
    return typeof first?.day === "string" ? first.day : null;
}

export async function buildAiUsage(range: ActivityRange, now = Date.now()): Promise<AdminAiUsageResponse> {
    const buckets = activityBuckets(range, now);
    const rangeStart = buckets[0].start;
    const rangeEnd = buckets[buckets.length - 1].end;
    const span = rangeEnd - rangeStart;
    const [days, firstDay] = await Promise.all([
        readAiUsageDays(usageDayKey(rangeStart - span), usageDayKey(rangeEnd - 1)),
        firstUsageDay().catch(() => null),
    ]);

    const list = buckets.map((bucket) => ({ start: new Date(bucket.start).toISOString(), end: new Date(bucket.end).toISOString(), messages: 0, refunds: 0 }));
    const totals = { messages: 0, refunds: 0, sources: zeroSources(), plans: zeroPlans() };
    const previous = { messages: 0, refunds: 0 };
    for (const day of days) {
        const start = dayKeyStart(day.day);
        if (start < rangeStart) {
            previous.messages += day.messages;
            previous.refunds += day.refunds;
            continue;
        }
        const index = buckets.findIndex((bucket) => start >= bucket.start && start < bucket.end);
        if (index === -1) continue;
        list[index].messages += day.messages;
        list[index].refunds += day.refunds;
        totals.messages += day.messages;
        totals.refunds += day.refunds;
        for (const source of AI_USAGE_SOURCES) totals.sources[source] += day.sources[source];
        for (const plan of AI_USAGE_PLANS) totals.plans[plan] += day.plans[plan];
    }

    const config = providerConfig();
    return {
        range,
        unit: range === 90 ? "week" : "day",
        buckets: list,
        totals,
        previous,
        firstDay,
        model: { configured: Boolean(config), name: config?.model ?? null },
        limits: {
            free: { ...PLAN_AI_LIMITS.free },
            plus: { ...PLAN_AI_LIMITS.plus },
            pro: { ...PLAN_AI_LIMITS.pro },
        },
        generatedAt: new Date(now).toISOString(),
    };
}

const AUTOMOD_RULES = Object.keys(AUTOMOD_RULE_COPY);
/** A voice channel counts as live while someone checked in within this (tabs check in every 10 s). */
const VOICE_LIVE_MS = 45_000;

const counted = (promise: Promise<{ count: number; capped: boolean }>): Promise<StatCount> => promise.catch(() => null);

/** Groups with the most open /report records: a bounded read of the open reports' group ids. */
async function mostReportedGroups(limit = 5) {
    const open = await runServerQuery<{ groupId?: unknown }>({
        collectionId: "group_reports",
        where: [{ field: "status", op: "EQUAL", value: "open" }],
        select: ["groupId"],
        limit: 300,
    });
    const tally = new Map<string, number>();
    for (const record of open) {
        if (typeof record.groupId === "string" && record.groupId) tally.set(record.groupId, (tally.get(record.groupId) ?? 0) + 1);
    }
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
    return Promise.all(top.map(async ([id, count]) => {
        const group = await getServerDocument<{ name?: unknown }>(`groups/${id}`).catch(() => null);
        return { id, name: typeof group?.name === "string" && group.name.trim() ? group.name.trim().slice(0, 80) : "—", open: count };
    }));
}

export async function buildSocialOverview(now = Date.now()): Promise<AdminSocialResponse> {
    const [groups, directChats, voiceChannelsLive, reportsOpen, reportsTotal, automodStops, files, fileBytes, automodByRule, reportedGroups] = await Promise.all([
        counted(countDocuments("groups")),
        counted(countDocuments("chats")),
        counted(countDocuments("group_voice", [{ field: "updatedAt", op: "GREATER_THAN_OR_EQUAL", value: new Date(now - VOICE_LIVE_MS) }])),
        counted(countDocuments("group_reports", [{ field: "status", op: "EQUAL", value: "open" }])),
        counted(countDocuments("group_reports")),
        counted(countDocuments("automod_events")),
        counted(countDocuments("message_files")),
        sumServerQuery({ collectionId: "message_files", field: "size" }).catch(() => null),
        Promise.all(AUTOMOD_RULES.map(async (rule) => ({ rule, count: (await countDocuments("automod_events", [{ field: "rule", op: "EQUAL", value: rule }])).count })))
            .then((rows) => rows.sort((a, b) => b.count - a.count))
            .catch(() => null),
        mostReportedGroups().catch(() => null),
    ]);
    return {
        counts: { groups, directChats, voiceChannelsLive, reportsOpen, reportsTotal, automodStops, files },
        fileBytes,
        automodByRule,
        reportedGroups,
        generatedAt: new Date(now).toISOString(),
    };
}
