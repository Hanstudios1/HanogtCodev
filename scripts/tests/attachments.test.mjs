// Run: node --test scripts/tests/
// File attachments of Hanogt Social messages (lib/social/attachments.ts):
// what a file is from its bytes, safe names, image sizes, photo metadata
// removal (with the orientation kept) and the stored attachment.
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const files = await load("lib/social/attachments.ts");

const bytes = (...parts) => {
    const list = parts.flatMap((part) => (typeof part === "string" ? [...Buffer.from(part, "latin1")] : Array.isArray(part) ? part : [...part]));
    return Uint8Array.from(list);
};
const u16be = (value) => [(value >> 8) & 0xff, value & 0xff];
const u32be = (value) => [(value >>> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
const u32le = (value) => [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >>> 24) & 0xff];
const has = (haystack, needle) => Buffer.from(haystack).includes(Buffer.from(needle, "latin1"));

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const pngChunk = (type, data = []) => bytes(u32be(data.length), type, data, [0, 0, 0, 0]);
function png(width, height, extra = []) {
    return bytes(PNG_SIGNATURE, pngChunk("IHDR", [...u32be(width), ...u32be(height), 8, 6, 0, 0, 0]), ...extra, pngChunk("IDAT", [1, 2, 3]), pngChunk("IEND"));
}

const segment = (marker, payload) => bytes([0xff, marker], u16be(payload.length + 2), payload);
/** EXIF with an orientation and a planted location string. */
function exif(orientation) {
    const tiff = [0x49, 0x49, 0x2a, 0x00, ...u32le(8), 0x02, 0x00,
        0x12, 0x01, 0x03, 0x00, ...u32le(1), orientation, 0x00, 0x00, 0x00,
        0x25, 0x88, 0x04, 0x00, ...u32le(1), ...u32le(38), 0, 0, 0, 0];
    return segment(0xe1, bytes("Exif\u0000\u0000", tiff, "GPS 41.0082N 28.9784E"));
}
function jpeg(width, height, { orientation = 0, comment = true } = {}) {
    const jfif = segment(0xe0, bytes("JFIF\u0000", [1, 1, 0, 0, 1, 0, 1, 0, 0]));
    const sof = segment(0xc0, bytes([8], u16be(height), u16be(width), [3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]));
    const sos = segment(0xda, bytes([3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0]));
    return bytes([0xff, 0xd8], jfif, orientation ? exif(orientation) : [], comment ? segment(0xfe, bytes("Ali'nin telefonu")) : [], segment(0xed, bytes("Photoshop 3.0\u0000IPTC city")), sof, sos, [1, 2, 3, 4], [0xff, 0xd9]);
}

const riffChunk = (type, data) => bytes(type, u32le(data.length), data, data.length % 2 ? [0] : []);
function webpExtended(width, height, flags) {
    const vp8x = riffChunk("VP8X", [flags, 0, 0, 0, (width - 1) & 0xff, ((width - 1) >> 8) & 0xff, 0, (height - 1) & 0xff, ((height - 1) >> 8) & 0xff, 0]);
    const body = bytes("WEBP", vp8x, riffChunk("VP8 ", [9, 9, 9, 9, 9]), riffChunk("EXIF", bytes("GPS here")), riffChunk("XMP ", bytes("<x:creator>Ali</x:creator>")));
    return bytes("RIFF", u32le(body.length), body);
}

test("what a file is comes from its bytes, never its name", () => {
    const sniff = (data, name) => files.sniffFile(data, name);
    assert.deepEqual(sniff(png(4, 3), "a.png"), { kind: "image", contentType: "image/png", extension: "png" });
    assert.equal(sniff(jpeg(4, 3), "photo.jpeg").contentType, "image/jpeg");
    assert.equal(sniff(bytes("GIF89a", [1, 0, 1, 0]), "x").contentType, "image/gif");
    assert.equal(sniff(webpExtended(10, 10, 0), "x").contentType, "image/webp");
    assert.equal(sniff(bytes("%PDF-1.7\n"), "doc").kind, "pdf");
    assert.equal(sniff(bytes([0, 0, 0, 0x18], "ftypisom", [0, 0, 0, 0]), "clip.mp4").contentType, "video/mp4");
    assert.equal(sniff(bytes([0, 0, 0, 0x18], "ftypM4A ", [0, 0, 0, 0]), "song").contentType, "audio/mp4");
    assert.equal(sniff(bytes([0, 0, 0, 0x14], "ftypqt  ", [0, 0, 0, 0]), "x").contentType, "video/quicktime");
    assert.equal(sniff(bytes([0x1a, 0x45, 0xdf, 0xa3, 1]), "x.webm").contentType, "video/webm");
    assert.equal(sniff(bytes("OggS", [0, 2]), "x").contentType, "audio/ogg");
    assert.equal(sniff(bytes("RIFF", [0, 0, 0, 0], "WAVEfmt "), "x").contentType, "audio/wav");
    assert.equal(sniff(bytes("fLaC", [0]), "x").contentType, "audio/flac");
    assert.equal(sniff(bytes("ID3", [4, 0]), "x").contentType, "audio/mpeg");
    assert.equal(sniff(bytes([0xff, 0xfb, 0x90, 0x00]), "x.bin"), null, "a bare MP3 frame counts only when named .mp3 (or it is just noise)");
    assert.equal(sniff(bytes("PK", [3, 4, 20, 0]), "rapor.docx").contentType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    assert.deepEqual(sniff(bytes("PK", [3, 4, 20, 0]), "code.zip"), { kind: "archive", contentType: "application/zip", extension: "zip" });
    assert.equal(sniff(bytes([0x1f, 0x8b, 8, 0]), "x.tar.gz").contentType, "application/gzip");
    assert.equal(sniff(bytes([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0, 4]), "x.7z").kind, "archive");
    assert.deepEqual(sniff(bytes(Buffer.from("const şehir = 'İstanbul';\n", "utf8")), "main.ts"), { kind: "text", contentType: "text/plain; charset=utf-8", extension: "ts" });
    assert.equal(sniff(bytes(Buffer.from("notlar", "utf8")), "notlar").extension, "txt");
    // Programs: by their name, and binaries that aren't any of the above.
    assert.equal(sniff(bytes(Buffer.from("echo hi", "utf8")), "setup.bat"), null);
    assert.equal(sniff(bytes("PK", [3, 4]), "app.apk"), null);
    assert.equal(sniff(bytes("MZ", [0x90, 0, 3, 0, 0, 0]), "tool.dat"), null);
    assert.equal(sniff(bytes([0x7f], "ELF", [2, 1, 1]), "a.out"), null);
    assert.equal(sniff(bytes([0xc3, 0x28]), "bad.txt"), null, "not UTF-8");
    assert.equal(sniff(new Uint8Array(0), "empty.txt"), null);
});

test("file names are safe to show and to download", () => {
    assert.equal(files.cleanFileName("C:\\Users\\ali\\Desktop\\rapor.pdf"), "rapor.pdf");
    assert.equal(files.cleanFileName("../../etc/passwd"), "passwd");
    assert.equal(files.cleanFileName("..gizli"), "gizli");
    // A right-to-left override can't disguise an extension.
    assert.equal(files.cleanFileName("foto\u202Egnp.exe"), "fotognp.exe");
    assert.equal(files.extensionOf(files.cleanFileName("foto\u202Egnp.exe")), "exe");
    assert.equal(files.cleanFileName("a<b>c?.txt"), "a_b_c_.txt");
    assert.equal(files.cleanFileName("   "), "dosya");
    assert.equal(files.cleanFileName(null, "file"), "file");
    const long = files.cleanFileName(`${"çok uzun bir ad ".repeat(20)}.pdf`);
    assert.ok(long.length <= files.ATTACHMENT_LIMITS.nameMax);
    assert.ok(long.endsWith(".pdf"));
    // The extension follows the contents.
    const pngType = files.sniffFile(png(1, 1), "kedi.pdf");
    assert.equal(files.nameForType("kedi.pdf", pngType), "kedi.png");
    assert.equal(files.nameForType("foto.jpeg", files.sniffFile(jpeg(1, 1), "foto.jpeg")), "foto.jpeg");
    assert.equal(files.nameForType("README", files.sniffFile(bytes("# Merhaba"), "README")), "README");
});

test("image sizes from their headers", () => {
    assert.deepEqual(files.imageSize(png(640, 480), "image/png"), { width: 640, height: 480 });
    assert.deepEqual(files.imageSize(jpeg(1920, 1080), "image/jpeg"), { width: 1920, height: 1080 });
    assert.deepEqual(files.imageSize(bytes("GIF89a", [0x2c, 0x01, 0xc8, 0x00]), "image/gif"), { width: 300, height: 200 });
    assert.deepEqual(files.imageSize(webpExtended(800, 600, 0), "image/webp"), { width: 800, height: 600 });
    const lossless = bytes("RIFF", u32le(30), "WEBP", "VP8L", u32le(10), [0x2f, (99) & 0xff, ((99 >> 8) & 0x3f) | ((49 & 0x3) << 6), (49 >> 2) & 0xff, ((49 >> 10) & 0xf)], [0, 0, 0, 0, 0]);
    assert.deepEqual(files.imageSize(lossless, "image/webp"), { width: 100, height: 50 });
    assert.equal(files.imageSize(bytes([0xff, 0xd8, 0xff, 0xda, 0, 2]), "image/jpeg"), null);
});

test("photos lose their location and camera details, keep their orientation", () => {
    const original = jpeg(4000, 3000, { orientation: 6 });
    assert.ok(has(original, "GPS") && has(original, "telefonu") && has(original, "IPTC"));
    assert.equal(files.jpegOrientation(original), 6);
    const clean = files.stripImageMetadata(original, "image/jpeg");
    assert.ok(!has(clean, "GPS"), "the location is gone");
    assert.ok(!has(clean, "telefonu"), "comments are gone");
    assert.ok(!has(clean, "IPTC"), "IPTC is gone");
    assert.equal(files.jpegOrientation(clean), 6, "a phone photo still shows the right way up");
    assert.deepEqual(files.imageSize(clean, "image/jpeg"), { width: 4000, height: 3000 });
    // JFIF stays first, the picture data and the end marker are untouched.
    assert.deepEqual([...clean.subarray(0, 4)], [0xff, 0xd8, 0xff, 0xe0]);
    assert.deepEqual([...clean.subarray(-6)], [1, 2, 3, 4, 0xff, 0xd9]);
    // Upright photos keep no EXIF at all.
    const upright = files.stripImageMetadata(jpeg(10, 10, { orientation: 1 }), "image/jpeg");
    assert.ok(!has(upright, "Exif"));

    const taggedPng = png(5, 5, [pngChunk("tEXt", [...Buffer.from("Location\u0000Ankara", "latin1")]), pngChunk("eXIf", [1, 2, 3]), pngChunk("iCCP", [7, 7])]);
    const cleanPng = files.stripImageMetadata(taggedPng, "image/png");
    assert.ok(!has(cleanPng, "Ankara") && !has(cleanPng, "eXIf"));
    assert.ok(has(cleanPng, "iCCP"), "colour profiles stay");
    assert.deepEqual(files.imageSize(cleanPng, "image/png"), { width: 5, height: 5 });
    assert.ok(has(cleanPng.subarray(-12), "IEND"));

    const webp = webpExtended(64, 32, 0x0c | 0x10);
    const cleanWebp = files.stripImageMetadata(webp, "image/webp");
    assert.ok(!has(cleanWebp, "GPS") && !has(cleanWebp, "creator"));
    assert.equal(cleanWebp[20] & 0x0c, 0, "the EXIF and XMP flags are cleared");
    assert.equal(cleanWebp[20] & 0x10, 0x10, "other flags stay");
    assert.equal(Buffer.from(cleanWebp).readUInt32LE(4), cleanWebp.length - 8, "the RIFF size matches");
    assert.deepEqual(files.imageSize(cleanWebp, "image/webp"), { width: 64, height: 32 });
    // Anything that doesn't parse comes back unchanged.
    const broken = bytes([0xff, 0xd8, 0x00, 0x01]);
    assert.equal(files.stripImageMetadata(broken, "image/jpeg"), broken);
});

test("the attachment a message stores, and sizes for people", () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    const stored = { id, name: "rapor.pdf", size: 2048, contentType: "application/pdf", kind: "pdf", width: null, height: null };
    assert.deepEqual(files.readMessageAttachment(stored), stored);
    assert.equal(files.readMessageAttachment({ ...stored, id: "x" }), null);
    assert.equal(files.readMessageAttachment({ ...stored, size: files.ATTACHMENT_LIMITS.maxBytes + 1 }), null);
    assert.equal(files.readMessageAttachment({ ...stored, contentType: "text/html" }), null);
    assert.equal(files.readMessageAttachment({ ...stored, kind: "program" }), null);
    const image = files.readMessageAttachment({ ...stored, kind: "image", contentType: "image/png", width: 800, height: 0 });
    assert.equal(image.width, null, "a size needs both sides");
    assert.equal(files.attachmentPreview(stored), "📎 rapor.pdf");
    assert.equal(files.attachmentUrl(id), `/api/social/files/${id}`);
    assert.equal(files.attachmentUrl(id, true), `/api/social/files/${id}?download=1`);
    assert.equal(files.formatBytes(512), "512 B");
    assert.equal(files.formatBytes(820 * 1024), "820 KB");
    assert.equal(files.formatBytes(3.4 * 1024 * 1024, "TR"), "3,4 MB");
    assert.equal(files.formatBytes(3.4 * 1024 * 1024, "EN"), "3.4 MB");
    assert.equal(files.formatBytes(1024 * 1024 * 1024, "EN"), "1 GB");
});
