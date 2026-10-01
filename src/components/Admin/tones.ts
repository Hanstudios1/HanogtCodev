import type { FeedbackStatus, ReportCategory, SecurityRisk, UserRole } from "./types";

/** Accent colours used by badges and icons in the admin panel. */
export type Tone = "zinc" | "indigo" | "violet" | "fuchsia" | "sky" | "emerald" | "amber" | "red";

export const ROLE_TONES: Record<UserRole, Tone> = { owner: "fuchsia", admin: "violet", moderator: "emerald", user: "zinc" };

export const RISK_TONES: Record<SecurityRisk, Tone> = { critical: "red", high: "amber", medium: "sky", low: "zinc", unknown: "zinc" };

export const FEEDBACK_STATUS_TONES: Record<FeedbackStatus, Tone> = { open: "sky", planned: "violet", "in-progress": "amber", done: "emerald", closed: "zinc" };

export const CATEGORY_TONES: Record<ReportCategory, Tone> = { malware: "red", copyright: "violet", personal_data: "amber", spam: "sky", other: "zinc" };
