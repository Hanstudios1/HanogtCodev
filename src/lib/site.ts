/** Public, non-secret site constants shared by pages, metadata and links. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://hanogtcodev.com").replace(/\/+$/, "");
export const SITE_NAME = "Hanogt Codev";
export const SITE_DESCRIPTION = "Tarayıcıda çalışan çok dilli kod editörü, C# ve C++ scriptli gerçek zamanlı 2D/3D oyun motoru, oyun vitrini ve geliştirici topluluğu.";

// The previous "HanogtLanguageSoftwareScript" repository does not exist, so the
// GitHub buttons on the landing page and footer led to a 404.
export const GITHUB_URL = "https://github.com/Hanstudios1/HanogtCodev";
export const RELEASES_URL = `${GITHUB_URL}/releases/latest`;

/** Live totals behind /api/stats/public (null when a count isn't available). */
export type PublicStats = {
    users: number | null;
    projects: number | null;
    games: number | null;
    posts: number | null;
    generatedAt: string;
};

/** Releases shown on the About page, newest last. */
export const SITE_MILESTONES = [
    { version: "0.0.5", date: "2026-09-04", key: "ab2_m1" },
    { version: "0.1.0", date: "2026-09-28", key: "ab2_m2" },
    { version: "0.1.2", date: "2026-10-01", key: "ab2_m3" },
] as const;
