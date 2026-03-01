"use client";

import { useState, useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import { X, Github, Linkedin, Twitter, Globe2, Download, Heart, Code, Award, ExternalLink } from "lucide-react";

// 15 User Badges
const ALL_BADGES = [
    { id: "early_adopter", icon: "🌟", color: "#EAB308" },
    { id: "bug_hunter", icon: "🐛", color: "#EF4444" },
    { id: "contributor", icon: "🤝", color: "#3B82F6" },
    { id: "pro_coder", icon: "💻", color: "#8B5CF6" },
    { id: "helper", icon: "🤗", color: "#22C55E" },
    { id: "top_creator", icon: "🏆", color: "#F97316" },
    { id: "verified", icon: "✅", color: "#06B6D4" },
    { id: "streamer", icon: "🎬", color: "#EC4899" },
    { id: "translator", icon: "🌐", color: "#14B8A6" },
    { id: "mentor", icon: "🎓", color: "#6366F1" },
    { id: "night_owl", icon: "🦉", color: "#7C3AED" },
    { id: "speed_coder", icon: "⚡", color: "#FACC15" },
    { id: "artist", icon: "🎨", color: "#F43F5E" },
    { id: "pioneer", icon: "🚀", color: "#0EA5E9" },
    { id: "community_star", icon: "⭐", color: "#D946EF" },
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
    isOnline?: boolean;
    publicProfile?: boolean;
    publicProjects?: boolean;
    badges?: string[];
    email?: string;
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
    const { t } = useI18n();
    const [activeTab, setActiveTab] = useState<"about" | "projects">("about");

    if (!isOpen) return null;

    const accent = user.accentColor || "#3B82F6";
    const userBadges = ALL_BADGES.filter(b => user.badges?.includes(b.id));

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
                className="bg-white dark:bg-zinc-900 rounded-2xl max-w-md w-full overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Banner */}
                <div
                    className="h-28 relative"
                    style={{
                        background: user.bannerUrl
                            ? `url(${user.bannerUrl}) center/cover no-repeat`
                            : `linear-gradient(135deg, ${accent}, ${accent}60)`
                    }}
                >
                    <button
                        onClick={onClose}
                        className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center text-white transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Avatar + Online Status */}
                <div className="px-6 -mt-10 relative">
                    <div className="relative inline-block">
                        {user.avatarUrl ? (
                            <img
                                src={user.avatarUrl}
                                alt={user.username}
                                className="w-20 h-20 rounded-full object-cover border-4 border-white dark:border-zinc-900"
                                referrerPolicy="no-referrer"
                            />
                        ) : (
                            <div
                                className="w-20 h-20 rounded-full flex items-center justify-center text-white font-bold text-2xl border-4 border-white dark:border-zinc-900"
                                style={{ background: `linear-gradient(135deg, ${accent}, ${accent}80)` }}
                            >
                                {user.username?.charAt(0) || "U"}
                            </div>
                        )}
                        {/* Online indicator: centered dot + colored ring */}
                        <div className="absolute bottom-0 right-0">
                            <div className={`w-6 h-6 rounded-full border-[3px] border-white dark:border-zinc-900 flex items-center justify-center ${user.isOnline ? "bg-green-500" : "bg-zinc-400"}`}>
                                <div className="w-2 h-2 rounded-full bg-black/30" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* User Info */}
                <div className="px-6 pt-3 pb-4">
                    <h3 className="text-xl font-bold">{user.username}</h3>
                    {user.nickname && (
                        <p className="text-sm text-zinc-500 font-mono">
                            {user.nickname}#{user.nicknameTag || "0000"}
                        </p>
                    )}

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
                                    title={t(badge.id) || badge.id}
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
                                {t("projects") || "Projeler"} ({projects.length})
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
                            {projects.length === 0 ? (
                                <p className="text-sm text-zinc-500 text-center py-4">{t("no_projects") || "Henüz proje yok."}</p>
                            ) : (
                                projects.map(project => {
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
