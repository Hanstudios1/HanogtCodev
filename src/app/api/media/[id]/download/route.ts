import JSZip from "jszip";
import { NextRequest, NextResponse } from "next/server";
import { getServerDocument, listServerCollection } from "@/lib/server/firebase-rest";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getClientKey, jsonSecurityHeaders } from "@/lib/server/request-security";

type MediaPost = { title?: string; status?: string; license?: string };
type MediaFile = { name?: string; lang?: string; code?: string; order?: number };

const extension: Record<string, string> = {
    python: "py", javascript: "js", typescript: "ts", csharp: "cs", c: "c", cpp: "cpp", "c++": "cpp",
    java: "java", html: "html", css: "css", php: "php", go: "go", swift: "swift", ruby: "rb", rust: "rs",
    kotlin: "kt", sql: "sql", sqlite3: "sql", lua: "lua",
};

function safeName(value: string, fallback: string) {
    const name = value.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "").slice(0, 100);
    return name || fallback;
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
        const rawName = safeName(file.name || "code", "code");
        const name = rawName.includes(".") ? rawName : `${rawName}.${extension[String(file.lang || "").toLowerCase()] || "txt"}`;
        return new NextResponse(file.code || "", {
            headers: jsonSecurityHeaders({
                "Content-Type": "text/plain; charset=utf-8",
                "Content-Disposition": `attachment; filename="${name}"`,
                "Cache-Control": "private, no-store",
                "X-Hanogt-Project-License": post.license || "all-rights-reserved",
            }),
        });
    }
    const zip = new JSZip();
    sorted.forEach((file, index) => {
        const rawName = safeName(file.name || `file-${index + 1}`, `file-${index + 1}`);
        const name = rawName.includes(".") ? rawName : `${rawName}.${extension[String(file.lang || "").toLowerCase()] || "txt"}`;
        zip.file(name, file.code || "");
    });
    if (post.license && post.license !== "all-rights-reserved") {
        zip.file("HANOGT-LICENSE-NOTICE.txt", `Bu proje Hanogt Media'da ${post.license} lisans etiketiyle yayımlanmıştır. Tam lisans metnini ve yayıncının proje açıklamasını doğrulayın.\n`);
    }
    const buffer = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    return new NextResponse(Buffer.from(buffer), {
        headers: jsonSecurityHeaders({
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="${safeName(post.title || "hanogt-project", "hanogt-project")}.zip"`,
            "Cache-Control": "private, no-store",
            "X-Hanogt-Project-License": post.license || "all-rights-reserved",
        }),
    });
}
