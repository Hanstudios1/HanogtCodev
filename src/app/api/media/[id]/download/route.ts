import JSZip from "jszip";
import { NextRequest, NextResponse } from "next/server";
import { fileExtensionFor, languageFromFileName, normalizeLanguageId } from "@/lib/runtimes/languages";
import { getServerDocument, listServerCollection } from "@/lib/server/firebase-rest";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getClientKey, jsonSecurityHeaders } from "@/lib/server/request-security";

type MediaPost = { title?: string; status?: string; license?: string };
type MediaFile = { name?: string; lang?: string; code?: string; order?: number };

/** A file name without paths or characters that common file systems reject; letters such as "ç" or "ğ" stay. */
function safeName(value: string, fallback: string) {
    const name = value.normalize("NFC").replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, "_").replace(/^[.\s]+/, "").trim().slice(0, 100);
    return name || fallback;
}

/** "main" + python → "main.py"; names that already have an extension (or are known, like "Dockerfile") are kept. */
function withExtension(name: string, language: string | undefined) {
    if (/\.[^.\s]+$/.test(name) || languageFromFileName(name)) return name;
    return `${name}.${fileExtensionFor(normalizeLanguageId(language ?? "") ?? "plaintext")}`;
}

/** Older posts may repeat a name; inside a ZIP the later file would replace the earlier one. */
function uniqueName(name: string, used: Set<string>) {
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const extension = dot > 0 ? name.slice(dot) : "";
    let candidate = name;
    for (let index = 2; used.has(candidate.toLowerCase()); index += 1) candidate = `${stem}-${index}${extension}`;
    used.add(candidate.toLowerCase());
    return candidate;
}

/** Content-Disposition with an ASCII fallback and the real (UTF-8) name for current browsers. */
function attachment(name: string) {
    const ascii = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]/g, "_") || "download";
    const encoded = encodeURIComponent(name).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
    return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const { id } = await context.params;
    if (!/^[a-f0-9-]{20,100}$/i.test(id)) return NextResponse.json({ error: "Geçersiz proje." }, { status: 400 });
    const rate = await enforceRateLimit(`media-download:${getClientKey(request)}`, 20, 60_000);
    if (!rate.allowed) return NextResponse.json({ error: "İndirme sınırına ulaşıldı." }, { status: 429 });
    const post = await getServerDocument<MediaPost>(`media_posts/${id}`);
    if (!post || post.status !== "published") return NextResponse.json({ error: "Proje bulunamadı." }, { status: 404 });
    const files = await listServerCollection<MediaFile>(`media_posts/${id}/files`, 50);
    if (!files.length) return NextResponse.json({ error: "Dosya bulunamadı." }, { status: 404 });
    const sorted = files.sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    if (sorted.length === 1) {
        const file = sorted[0];
        const name = withExtension(safeName(file.name || "code", "code"), file.lang);
        return new NextResponse(file.code || "", {
            headers: jsonSecurityHeaders({
                "Content-Type": "text/plain; charset=utf-8",
                "Content-Disposition": attachment(name),
                "Cache-Control": "private, no-store",
                "X-Hanogt-Project-License": post.license || "all-rights-reserved",
            }),
        });
    }
    const zip = new JSZip();
    const used = new Set<string>();
    sorted.forEach((file, index) => {
        const name = uniqueName(withExtension(safeName(file.name || `file-${index + 1}`, `file-${index + 1}`), file.lang), used);
        zip.file(name, file.code || "");
    });
    if (post.license && post.license !== "all-rights-reserved") {
        zip.file(uniqueName("HANOGT-LICENSE-NOTICE.txt", used), `Bu proje Hanogt Media'da ${post.license} lisans etiketiyle yayımlanmıştır. Tam lisans metnini ve yayıncının proje açıklamasını doğrulayın.\n`);
    }
    const buffer = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    return new NextResponse(Buffer.from(buffer), {
        headers: jsonSecurityHeaders({
            "Content-Type": "application/zip",
            "Content-Disposition": attachment(`${safeName(post.title || "hanogt-project", "hanogt-project")}.zip`),
            "Cache-Control": "private, no-store",
            "X-Hanogt-Project-License": post.license || "all-rights-reserved",
        }),
    });
}
