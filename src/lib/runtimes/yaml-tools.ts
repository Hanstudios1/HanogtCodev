/**
 * YAML validation and formatting on top of js-yaml (YAML 1.2 core schema).
 *
 * Every document of a multi-document stream is checked; errors keep js-yaml's
 * reason with a line and column, and the most common reasons are translated
 * to Turkish. The formatter re-emits the data with consistent indentation
 * (comments and anchors are not preserved, which the report mentions).
 */
import { dump, loadAll } from "js-yaml";
import { count, indentOf, localeOf, type ValidationIssue, type ValidationResult, type ValidatorLocale, type ValidatorOptions } from "./validation";

const TURKISH_REASONS: Array<[RegExp, string]> = [
    [/^bad indentation of a mapping entry/, "eşleme girdisinin girintisi hatalı; aynı düzeydeki anahtarlar aynı sütunda başlamalı"],
    [/^bad indentation of a sequence entry/, "liste öğesinin (-) girintisi hatalı"],
    [/^duplicated mapping key/, "yinelenen anahtar; bir eşlemede her anahtar bir kez kullanılabilir"],
    [/^tab characters must not be used in indentation/, "girintide sekme karakteri kullanılamaz; boşluk kullanın"],
    [/^unexpected end of the (?:stream|document) within a double quoted scalar/, "çift tırnaklı değer kapatılmadan belge bitti"],
    [/^unexpected end of the (?:stream|document) within a single quoted scalar/, "tek tırnaklı değer kapatılmadan belge bitti"],
    [/^unexpected end of the stream within a flow collection/, "[ ] veya { } kapatılmadan belge bitti"],
    [/^end of the stream or a document separator is expected/, "belge sonu veya belge ayırıcı (---) bekleniyordu; girintiyi ve ':' işaretlerini kontrol edin"],
    [/^can not read a block mapping entry; a multiline key may not be an implicit key/, "eşleme girdisi okunamadı; büyük olasılıkla bir ':' eksik ya da girinti hatalı"],
    [/^can not read an implicit mapping pair; a colon is missed/, "anahtar-değer çifti okunamadı; ':' eksik"],
    [/^a whitespace character is expected after the key-value separator/, "anahtar-değer ayırıcısından (:) sonra boşluk gerekir"],
    [/^missed comma between flow collection entries/, "[ ] veya { } içindeki öğeler arasında virgül eksik"],
    [/^incomplete explicit mapping pair/, "eksik açık eşleme çifti; anahtar eksik ya da ardından girintisiz boş bir satır geliyor"],
    [/^unidentified alias/, "tanımsız takma ad (alias); önce &ad ile bir çapa tanımlayın"],
    [/^unknown tag/, "bilinmeyen etiket"],
    [/^unknown escape sequence/, "bilinmeyen kaçış dizisi"],
    [/^expected the node content, but found ','/, "bir değer bekleniyordu, ancak ',' bulundu"],
    [/^the stream contains non-printable characters/, "belge yazdırılamayan karakterler içeriyor"],
    [/^null byte is not allowed in input/, "belgede boş bayt (NUL) karakteri olamaz"],
];

function translate(reason: string, locale: ValidatorLocale) {
    if (locale !== "tr") return reason;
    for (const [pattern, text] of TURKISH_REASONS) if (pattern.test(reason)) return text;
    return reason;
}

type YamlError = Error & { reason?: string; mark?: { line: number; column: number } };

function measure(value: unknown, depth: number, stats: { keys: number; maxDepth: number }, seen: Set<object>) {
    stats.maxDepth = Math.max(stats.maxDepth, depth);
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
        for (const item of value) measure(item, depth + 1, stats, seen);
        return;
    }
    if (value instanceof Date) return;
    for (const item of Object.values(value as Record<string, unknown>)) {
        stats.keys += 1;
        measure(item, depth + 1, stats, seen);
    }
}

function kindOf(value: unknown, locale: ValidatorLocale) {
    const tr = locale === "tr";
    if (Array.isArray(value)) return tr ? "liste" : "sequence";
    if (value && typeof value === "object" && !(value instanceof Date)) return tr ? "eşleme" : "mapping";
    if (value === null || value === undefined) return tr ? "boş" : "null";
    return tr ? "skaler değer" : "scalar";
}

/** Validates a YAML stream and re-emits it with consistent indentation. */
export function analyzeYaml(text: string, options: ValidatorOptions = {}): ValidationResult {
    const locale = localeOf(options);
    const warnings: ValidationIssue[] = [];
    const documents: unknown[] = [];
    try {
        loadAll(text, (document: unknown) => {
            documents.push(document);
        }, {
            onWarning: (warning: YamlError) => {
                if (warnings.length < 100) warnings.push({ message: translate(warning.reason ?? warning.message, locale), line: (warning.mark?.line ?? 0) + 1, column: (warning.mark?.column ?? 0) + 1 });
            },
        });
    } catch (error) {
        const yamlError = error as YamlError;
        if (!yamlError || typeof yamlError !== "object" || !("mark" in yamlError)) throw error;
        const reason = translate(yamlError.reason ?? yamlError.message, locale);
        return { ok: false, error: { message: reason, line: (yamlError.mark?.line ?? 0) + 1, column: (yamlError.mark?.column ?? 0) + 1 }, warnings };
    }
    const indent = indentOf(options);
    const stats = { keys: 0, maxDepth: 0 };
    for (const document of documents) measure(document, 1, stats, new Set());
    const formatted = documents.length
        ? documents.map((document) => dump(document, { indent, lineWidth: 100, noRefs: true }).replace(/\n$/, "")).join("\n---\n")
        : "";
    const first = documents[0];
    const summary = locale === "tr"
        ? `✓ Geçerli YAML · ${documents.length} belge · kök: ${kindOf(first, locale)} · ${stats.keys} anahtar · derinlik ${stats.maxDepth}`
        : `✓ Valid YAML · ${count(locale, documents.length, "belge", "document")} · root: ${kindOf(first, locale)} · ${count(locale, stats.keys, "anahtar", "key")} · depth ${stats.maxDepth}`;
    const notes: string[] = [];
    if (/(^|\s)#/.test(text) || /(^|[\s:[{,-])[&*][A-Za-z0-9_-]/.test(text)) {
        notes.push(locale === "tr" ? "Not: biçimlendirilmiş çıktıda yorumlar ve çapalar (&ad/*ad) korunmaz." : "Note: comments and anchors (&name/*name) are not kept in the formatted output.");
    }
    return { ok: true, warnings, summary, formatted, notes: notes.length ? notes : undefined };
}
