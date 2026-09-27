/** Public, non-secret site constants shared by pages, metadata and links. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://hanogtcodev.com").replace(/\/+$/, "");
export const SITE_NAME = "Hanogt Codev";
export const SITE_DESCRIPTION = "Tarayıcıda çalışan çok dilli kod editörü, C# ve C++ scriptli gerçek zamanlı 2D/3D oyun motoru, oyun vitrini ve geliştirici topluluğu.";

// The previous "HanogtLanguageSoftwareScript" repository does not exist, so the
// GitHub buttons on the landing page and footer led to a 404.
export const GITHUB_URL = "https://github.com/Hanstudios1/HanogtCodev";
export const RELEASES_URL = `${GITHUB_URL}/releases/latest`;
