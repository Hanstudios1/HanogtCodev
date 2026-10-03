"use client";

import { useState, useEffect, useId } from "react";
import { useI18n } from "@/lib/i18n";
import { X, Github, Linkedin, Twitter, Globe2, Download, Heart, ExternalLink } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import { formatRelativeTime, useNow } from "@/components/Admin/hooks";
import type { StaffRole } from "@/components/Admin/types";
import PlanBadge from "@/components/PlanBadge";
import PresenceAvatar from "@/components/PresenceAvatar";
import StaffBadge, { parseStaffRole } from "@/components/StaffBadge";
import type { PlanBadge as PlanBadgeId } from "@/lib/plan-badge";
import { LAST_SEEN_COPY, PRESENCE_STATUS_COPY, effectiveStatus, lastSeenTime } from "@/lib/presence";

/** Profile values are user-written: only plain https URLs reach CSS url(). */
function safeBannerUrl(value?: string) {
    return value && value.length <= 2048 && /^https:\/\/[^\s"'()<>\\]+$/.test(value) ? value : "";
}

/** Accepts #rgb / #rrggbb / #rrggbbaa and returns #rrggbb (alpha is appended by the gradients). */
function safeAccent(value?: string) {
    if (!value || !/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value)) return "#3B82F6";
    if (value.length === 4) return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
    return value.slice(0, 7);
}

// 15 User Badges
const ALL_BADGES = [
    { id: "early_adopter", labelKey: "badge_early_adopter", icon: "🌟", color: "#EAB308" },
    { id: "bug_hunter", labelKey: "badge_bug_hunter", icon: "🐛", color: "#EF4444" },
    { id: "contributor", labelKey: "badge_contributor", icon: "🤝", color: "#3B82F6" },
    { id: "pro_coder", labelKey: "badge_pro_coder", icon: "💻", color: "#8B5CF6" },
    { id: "helper", labelKey: "badge_helper", icon: "🤗", color: "#22C55E" },
    { id: "top_creator", labelKey: "badge_top_creator", icon: "🏆", color: "#F97316" },
    { id: "verified", labelKey: "badge_verified", icon: "✅", color: "#06B6D4" },
    { id: "streamer", labelKey: "badge_streamer", icon: "🎬", color: "#EC4899" },
    { id: "translator", labelKey: "badge_translator", icon: "🌐", color: "#14B8A6" },
    { id: "mentor", labelKey: "badge_mentor", icon: "🎓", color: "#6366F1" },
    { id: "night_owl", labelKey: "badge_night_owl", icon: "🦉", color: "#7C3AED" },
    { id: "speed_coder", labelKey: "badge_speed_coder", icon: "⚡", color: "#FACC15" },
    { id: "artist", labelKey: "badge_artist", icon: "🎨", color: "#F43F5E" },
    { id: "pioneer", labelKey: "badge_pioneer", icon: "🚀", color: "#0EA5E9" },
    { id: "community_star", labelKey: "badge_community_star", icon: "⭐", color: "#D946EF" },
];

interface UserProfile {
    username: string;
    nickname?: string;
    nicknameTag?: string;
    avatarUrl?: string;
    bannerUrl?: string;
    bio?: string;
    customStatus?: string;
    statusEmoji?: string;
    accentColor?: string;
    favoriteLangs?: string[];
    socialGithub?: string;
    socialLinkedin?: string;
    socialTwitter?: string;
    socialWebsite?: string;
    /** Presence as public_profiles stores it (lib/presence.ts); without any of these no status is shown. */
    presence?: unknown;
    lastSeenAt?: unknown;
    isOnline?: boolean;
    dndMode?: boolean;
    publicProfile?: boolean;
    publicProjects?: boolean;
    badges?: string[];
    email?: string;
    /** Hanogt team role; written by the server only (public_profiles/{email}.staffRole). */
    staffRole?: StaffRole | null;
    /** The Plus / Pro badge while it lasts; written by the server only (public_profiles/{email}.planBadge). */
    planBadge?: PlanBadgeId | null;
}

interface Project {
    id: string;
    name: string;
    language: string;
    code?: string;
    likes?: number;
}

interface ProfileModalProps {
    user: UserProfile;
    projects?: Project[];
    isOpen: boolean;
    onClose: () => void;
    onLikeProject?: (projectId: string) => void;
    onDownloadProject?: (project: Project) => void;
}

const LANG_ICONS: Record<string, { icon: string; color: string }> = {
    "JavaScript": { icon: "JS", color: "#F7DF1E" },
    "TypeScript": { icon: "TS", color: "#3178C6" },
    "Python": { icon: "PY", color: "#3776AB" },
    "Java": { icon: "JV", color: "#ED8B00" },
    "C++": { icon: "C+", color: "#00599C" },
    "C#": { icon: "C#", color: "#239120" },
    "Go": { icon: "GO", color: "#00ADD8" },
    "Rust": { icon: "RS", color: "#CE422B" },
    "Ruby": { icon: "RB", color: "#CC342D" },
    "PHP": { icon: "PH", color: "#777BB4" },
    "Swift": { icon: "SW", color: "#FA7343" },
    "Kotlin": { icon: "KT", color: "#7F52FF" },
    "HTML": { icon: "HT", color: "#E34F26" },
    "CSS": { icon: "CS", color: "#1572B6" },
    "React": { icon: "RE", color: "#61DAFB" },
    "Vue": { icon: "VU", color: "#4FC08D" },
    "Angular": { icon: "NG", color: "#DD0031" },
    "Node.js": { icon: "NJ", color: "#339933" },
    "Next.js": { icon: "NX", color: "#000000" },
    "Flutter": { icon: "FL", color: "#02569B" },
    "Dart": { icon: "DT", color: "#0175C2" },
    "Scala": { icon: "SC", color: "#DC322F" },
    "R": { icon: "R", color: "#276DC3" },
    "SQL": { icon: "SQ", color: "#4479A1" },
};

const getFileExtension = (lang: string): string => {
    const map: Record<string, string> = {
        "JavaScript": ".js", "TypeScript": ".ts", "Python": ".py", "Java": ".java",
        "C++": ".cpp", "C#": ".cs", "Go": ".go", "Rust": ".rs", "Ruby": ".rb",
        "PHP": ".php", "Swift": ".swift", "Kotlin": ".kt", "HTML": ".html",
        "CSS": ".css", "React": ".jsx", "Vue": ".vue", "Angular": ".ts",
        "Node.js": ".js", "Next.js": ".tsx", "Flutter": ".dart", "Dart": ".dart",
        "Scala": ".scala", "R": ".r", "SQL": ".sql",
    };
    return map[lang] || ".txt";
};

export default function ProfileModal({ user, projects = [], isOpen, onClose, onLikeProject, onDownloadProject }: ProfileModalProps) {
    const { t, tx, locale } = useI18n();
    const now = useNow();
    const titleId = useId();
    const [activeTab, setActiveTab] = useState<"about" | "projects">("about");
    const [fetchedProjects, setFetchedProjects] = useState<Project[]>([]);
    const [loadingProjects, setLoadingProjects] = useState(false);

    // Fetch user projects from Firestore
    useEffect(() => {
        if (!isOpen || !user.email || !user.publicProjects) return;
        const fetchProjects = async () => {
            setLoadingProjects(true);
            try {
                const q = query(collection(db, "projects"), where("email", "==", user.email));
                const snap = await getDocs(q);
                const projs: Project[] = snap.docs.map(d => ({ id: d.id, ...d.data() as Omit<Project, "id"> }));
                setFetchedProjects(projs);
            } catch {
                setFetchedProjects([]);
            }
            setLoadingProjects(false);
        };
        fetchProjects();
    }, [isOpen, user.email, user.publicProjects]);

    if (!isOpen) return null;

    const allProjects = projects.length > 0 ? projects : fetchedProjects;

    const accent = safeAccent(user.accentColor);
    const banner = safeBannerUrl(user.bannerUrl);
    const userBadges = ALL_BADGES.filter(b => user.badges?.includes(b.id));
    // Profiles handed over without presence fields (e.g. from the admin panel) show no status at all.
    const status = now && ("presence" in user || "isOnline" in user || "lastSeenAt" in user) ? effectiveStatus(user, now) : null;
    const lastSeen = status === "offline" ? lastSeenTime(user) : 0;
    const lastSeenText = lastSeen ? formatRelativeTime(new Date(lastSeen).toISOString(), now, locale) : "";

    const handleDownload = (project: Project) => {
        if (onDownloadProject) {
            onDownloadProject(project);
        } else if (project.code) {
            const ext = getFileExtension(project.language);
            const blob = new Blob([project.code], { type: "text/plain" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${project.name}${ext}`;
            a.click();
            URL.revokeObjectURL(url);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="bg-white dark:bg-zinc-900 rounded-2xl max-w-md w-full overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Banner */}
                <div
                    className="h-28 relative"
                    style={{
                        background: banner
                            ? `url("${banner}") center/cover no-repeat`
                            : `linear-gradient(135deg, ${accent}, ${accent}60)`
                    }}
                >
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={tx({ TR: "Kapat", EN: "Close" })}
                        className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center text-white transition-colors"
                    >
                        <X className="w-4 h-4" aria-hidden="true" />
                    </button>
                </div>

                {/* Avatar with the Discord-style status mark */}
                <div className="px-6 -mt-12 relative">
                    <span className="inline-block rounded-full border-4 border-white bg-white dark:border-zinc-900 dark:bg-zinc-900">
                        <PresenceAvatar src={user.avatarUrl} name={user.username || "U"} status={status} size="xl" ring="bg-white dark:bg-zinc-900" />
                    </span>
                </div>

                {/* User Info */}
                <div className="px-6 pt-3 pb-4">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <h3 id={titleId} className="min-w-0 break-words text-xl font-bold">{user.username}</h3>
                        <StaffBadge role={parseStaffRole(user.staffRole)} />
                        <PlanBadge plan={user.planBadge} />
                    </div>
                    {user.nickname && (
                        <p className="text-sm text-zinc-500 font-mono">
                            {user.nickname}#{user.nicknameTag || "0000"}
                        </p>
                    )}
                    {status ? (
                        <p className="mt-1 text-[12.5px] text-zinc-500 dark:text-zinc-400">
                            {tx(PRESENCE_STATUS_COPY[status])}
                            {lastSeenText ? <> · {tx(LAST_SEEN_COPY, { time: lastSeenText })}</> : null}
                        </p>
                    ) : null}

                    {/* Custom Status */}
                    {user.customStatus && (
                        <div className="mt-2 flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
                            <span>{user.statusEmoji || "😊"}</span>
                            <span>{user.customStatus}</span>
                        </div>
                    )}

                    {/* Badges */}
                    {userBadges.length > 0 && (
                        <div className="flex gap-1 mt-3 flex-wrap">
                            {userBadges.map(badge => (
                                <div
                                    key={badge.id}
                                    className="w-7 h-7 rounded-full flex items-center justify-center text-sm cursor-default"
                                    style={{ backgroundColor: badge.color + "20" }}
                                    title={t(badge.labelKey)}
                                    role="img"
                                    aria-label={t(badge.labelKey)}
                                >
                                    {badge.icon}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Separator */}
                    <div className="h-px bg-zinc-200 dark:bg-zinc-700 my-4" />

                    {/* Tabs */}
                    <div className="flex gap-1 mb-4 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
                        <button
                            onClick={() => setActiveTab("about")}
                            className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${activeTab === "about"
                                ? "bg-white dark:bg-zinc-700 shadow-sm"
                                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                                }`}
                        >
                            {t("bio") || "Hakkında"}
                        </button>
                        {user.publicProjects && (
                            <button
                                onClick={() => setActiveTab("projects")}
                                className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${activeTab === "projects"
                                    ? "bg-white dark:bg-zinc-700 shadow-sm"
                                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                                    }`}
                            >
                                {t("projects") || "Projeler"} ({allProjects.length})
                            </button>
                        )}
                    </div>

                    {/* Tab Content */}
                    {activeTab === "about" ? (
                        <div className="space-y-4">
                            {/* Bio */}
                            <div>
                                <h4 className="text-xs font-bold text-zinc-500 uppercase mb-1">{t("bio") || "Hakkında"}</h4>
                                <p className="text-sm text-zinc-700 dark:text-zinc-300">
                                    {user.bio || t("no_bio") || "Hakkında bölümüne bir şey yazılmamış."}
                                </p>
                            </div>

                            {/* Favorite Languages */}
                            {user.favoriteLangs && user.favoriteLangs.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-bold text-zinc-500 uppercase mb-2">{t("favorite_langs") || "Favori Diller"}</h4>
                                    <div className="flex gap-2 flex-wrap">
                                        {user.favoriteLangs.map(lang => {
                                            const info = LANG_ICONS[lang];
                                            return (
                                                <span
                                                    key={lang}
                                                    className="px-2.5 py-1 rounded-full text-xs font-medium text-white"
                                                    style={{ backgroundColor: info?.color || "#6B7280" }}
                                                >
                                                    {lang}
                                                </span>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Social Links */}
                            {(user.socialGithub || user.socialLinkedin || user.socialTwitter || user.socialWebsite) && (
                                <div>
                                    <h4 className="text-xs font-bold text-zinc-500 uppercase mb-2">{t("social_links") || "Bağlantılar"}</h4>
                                    <div className="space-y-2">
                                        {user.socialGithub && (
                                            <a href={user.socialGithub.startsWith("http") ? user.socialGithub : `https://${user.socialGithub}`} target="_blank" className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-blue-500 transition-colors">
                                                <Github className="w-4 h-4" />
                                                <span className="truncate">{user.socialGithub}</span>
                                                <ExternalLink className="w-3 h-3 ml-auto flex-shrink-0" />
                                            </a>
                                        )}
                                        {user.socialLinkedin && (
                                            <a href={user.socialLinkedin.startsWith("http") ? user.socialLinkedin : `https://${user.socialLinkedin}`} target="_blank" className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-blue-500 transition-colors">
                                                <Linkedin className="w-4 h-4" />
                                                <span className="truncate">{user.socialLinkedin}</span>
                                                <ExternalLink className="w-3 h-3 ml-auto flex-shrink-0" />
                                            </a>
                                        )}
                                        {user.socialTwitter && (
                                            <a href={user.socialTwitter.startsWith("http") ? user.socialTwitter : `https://${user.socialTwitter}`} target="_blank" className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-blue-500 transition-colors">
                                                <Twitter className="w-4 h-4" />
                                                <span className="truncate">{user.socialTwitter}</span>
                                                <ExternalLink className="w-3 h-3 ml-auto flex-shrink-0" />
                                            </a>
                                        )}
                                        {user.socialWebsite && (
                                            <a href={user.socialWebsite.startsWith("http") ? user.socialWebsite : `https://${user.socialWebsite}`} target="_blank" className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-blue-500 transition-colors">
                                                <Globe2 className="w-4 h-4" />
                                                <span className="truncate">{user.socialWebsite}</span>
                                                <ExternalLink className="w-3 h-3 ml-auto flex-shrink-0" />
                                            </a>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Projects Tab */
                        <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                            {loadingProjects ? (
                                <p className="text-sm text-zinc-500 text-center py-4">{t("loading") || "Yükleniyor..."}</p>
                            ) : allProjects.length === 0 ? (
                                <p className="text-sm text-zinc-500 text-center py-4">{t("no_projects") || "Henüz proje yok."}</p>
                            ) : (
                                allProjects.map(project => {
                                    const langInfo = LANG_ICONS[project.language];
                                    return (
                                        <div
                                            key={project.id}
                                            className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700"
                                        >
                                            <div className="flex items-start justify-between">
                                                <div className="flex items-center gap-2">
                                                    {langInfo && (
                                                        <span
                                                            className="w-7 h-7 rounded-md flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                                                            style={{ backgroundColor: langInfo.color }}
                                                        >
                                                            {langInfo.icon}
                                                        </span>
                                                    )}
                                                    <div>
                                                        <h5 className="text-sm font-semibold">{project.name}</h5>
                                                        <p className="text-xs text-zinc-500">{project.language}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <button
                                                        onClick={() => onLikeProject?.(project.id)}
                                                        className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors group"
                                                        title={t("like") || "Beğen"}
                                                    >
                                                        <Heart className="w-4 h-4 text-zinc-400 group-hover:text-red-500 transition-colors" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDownload(project)}
                                                        className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors group"
                                                        title={t("download") || "İndir"}
                                                    >
                                                        <Download className="w-4 h-4 text-zinc-400 group-hover:text-blue-500 transition-colors" />
                                                    </button>
                                                </div>
                                            </div>
                                            {project.likes !== undefined && project.likes > 0 && (
                                                <div className="mt-2 flex items-center gap-1 text-xs text-zinc-500">
                                                    <Heart className="w-3 h-3 text-red-400 fill-red-400" />
                                                    <span>{project.likes}</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export { ALL_BADGES, LANG_ICONS, getFileExtension };
export type { UserProfile, Project };
