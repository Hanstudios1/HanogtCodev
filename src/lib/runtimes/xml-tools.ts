/**
 * XML well-formedness checking and pretty-printing (dependency-free; DOMParser
 * is not available in the runtime worker).
 *
 * Checks the rules a browser or a validating editor reports first: one root
 * element, properly nested and closed tags, quoted and unique attributes,
 * valid entity and character references, comments without "--", the XML
 * declaration at the very start and declared namespace prefixes. DTDs are
 * skipped (entities declared in the internal subset are recognised), so this
 * is a well-formedness check, not schema validation.
 *
 * The formatter re-indents element-only content and keeps text, CDATA,
 * entity references and mixed content exactly as written.
 */
import {
    ValidationError, count, describeChar, indentOf, issueAt, localeOf,
    type Bilingual, type ValidationIssue, type ValidationResult, type ValidatorLocale, type ValidatorOptions,
} from "./validation";

type Attribute = { name: string; raw: string; quote: "\"" | "'" };

export type XmlNode =
    | { type: "element"; name: string; attributes: Attribute[]; children: XmlNode[]; selfClosing: boolean; offset: number }
    | { type: "text"; raw: string }
    | { type: "cdata"; raw: string }
    | { type: "comment"; raw: string }
    | { type: "pi"; raw: string }
    | { type: "doctype"; raw: string };

export interface XmlStats {
    root: string;
    elements: number;
    attributes: number;
    maxDepth: number;
    namespaces: number;
}

export interface XmlAnalysis extends ValidationResult {
    stats?: XmlStats;
    /** Parsed document (top-level nodes) when well-formed. */
    nodes?: XmlNode[];
}

const NAME_START = ":A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\uD800-\\uDBFF\\uDC00-\\uDFFF";
const NAME_CHAR = `${NAME_START}\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040`;
const NAME = new RegExp(`[${NAME_START}][${NAME_CHAR}]*`, "y");
const PREDEFINED_ENTITIES = new Set(["amp", "lt", "gt", "quot", "apos"]);
const MAX_DEPTH = 1000;

function validCodePoint(code: number) {
    return code === 0x9 || code === 0xa || code === 0xd || (code >= 0x20 && code <= 0xd7ff) || (code >= 0xe000 && code <= 0xfffd) || (code >= 0x10000 && code <= 0x10ffff);
}

class XmlParser {
    private index = 0;
    readonly text: string;
    readonly locale: ValidatorLocale;
    readonly warnings: Array<{ message: string; offset: number }> = [];
    readonly entities = new Set<string>();
    private externalDtd = false;
    private unknownEntityWarned = false;
    stats = { elements: 0, attributes: 0, maxDepth: 0, namespaces: 0 };

    constructor(text: string, locale: ValidatorLocale) {
        this.text = text;
        this.locale = locale;
    }

    private say(message: Bilingual) {
        return message[this.locale];
    }

    private fail(message: Bilingual, offset = this.index): ValidationError {
        return new ValidationError(message[this.locale], offset);
    }

    private startsWith(token: string) {
        return this.text.startsWith(token, this.index);
    }

    private skipWhitespace() {
        while (this.index < this.text.length && /[ \t\r\n]/.test(this.text[this.index])) this.index += 1;
    }

    private readName(): string | null {
        NAME.lastIndex = this.index;
        const match = NAME.exec(this.text);
        if (!match) return null;
        this.index += match[0].length;
        return match[0];
    }

    parseDocument(): XmlNode[] {
        const nodes: XmlNode[] = [];
        if (this.text.charCodeAt(0) === 0xfeff) this.index = 1;
        if (/^<\?xml[\s?]/.test(this.text.slice(this.index, this.index + 6))) nodes.push(this.parseProcessingInstruction(true));
        let root: XmlNode | null = null;
        while (this.index < this.text.length) {
            const start = this.index;
            this.skipWhitespace();
            if (this.index >= this.text.length) break;
            if (this.startsWith("<!--")) {
                nodes.push(this.parseComment());
            } else if (this.startsWith("<?")) {
                nodes.push(this.parseProcessingInstruction(false));
            } else if (this.startsWith("<!DOCTYPE") || this.startsWith("<!doctype")) {
                if (root) throw this.fail({ tr: "DOCTYPE bildirimi kök öğeden önce gelmelidir.", en: "The DOCTYPE declaration must come before the root element." });
                if (nodes.some((node) => node.type === "doctype")) throw this.fail({ tr: "Bir belgede yalnızca bir DOCTYPE bildirimi olabilir.", en: "A document can have only one DOCTYPE declaration." });
                nodes.push(this.parseDoctype());
            } else if (this.startsWith("<![CDATA[")) {
                throw this.fail({ tr: "CDATA bölümleri yalnızca bir öğenin içinde kullanılabilir.", en: "CDATA sections are only allowed inside an element." });
            } else if (this.startsWith("</")) {
                const name = this.text.slice(this.index + 2).match(/^[^\s>]*/)?.[0] ?? "";
                throw this.fail({ tr: `Açılmamış bir öğenin kapanış etiketi: </${name}>.`, en: `Closing tag </${name}> has no matching start tag.` });
            } else if (this.text[this.index] === "<") {
                if (root) throw this.fail({ tr: "Bir XML belgesinde yalnızca bir kök öğe olabilir; öğeleri tek bir kök öğenin içine alın.", en: "An XML document can have only one root element; wrap the elements in a single root." });
                root = this.parseElement();
                nodes.push(root);
            } else {
                const offset = this.index;
                throw this.fail(root
                    ? { tr: "Kök öğeden sonra metin bulunamaz.", en: "Text is not allowed after the root element." }
                    : { tr: "Kök öğeden önce metin bulunamaz; belge bir öğeyle (<…>) başlamalıdır.", en: "Text is not allowed before the root element; the document must start with an element (<…>)." }, offset);
            }
            if (this.index === start) throw this.fail({ tr: "Ayrıştırma ilerleyemedi.", en: "The parser could not make progress." });
        }
        if (!root) throw this.fail({ tr: "Belgede kök öğe yok.", en: "The document has no root element." }, this.text.length);
        return nodes;
    }

    private parseComment(): XmlNode {
        const start = this.index;
        const end = this.text.indexOf("-->", start + 4);
        if (end < 0) throw this.fail({ tr: "Yorum kapatılmamış; '-->' ekleyin.", en: "Unterminated comment; add '-->'." }, start);
        const body = this.text.slice(start + 4, end);
        const doubleDash = body.indexOf("--");
        if (doubleDash >= 0) throw this.fail({ tr: "Yorumların içinde '--' bulunamaz.", en: "Comments cannot contain '--'." }, start + 4 + doubleDash);
        if (body.endsWith("-")) throw this.fail({ tr: "Yorum '-' ile bitemez ('--->' geçersizdir).", en: "A comment cannot end with '-' ('--->' is invalid)." }, end - 1);
        this.index = end + 3;
        return { type: "comment", raw: this.text.slice(start, this.index) };
    }

    private parseProcessingInstruction(declaration: boolean): XmlNode {
        const start = this.index;
        this.index += 2;
        const target = this.readName();
        if (!target) throw this.fail({ tr: "'<?' sonrasında bir işlem talimatı adı bekleniyordu.", en: "Expected a processing instruction name after '<?'." });
        if (!declaration && target.toLowerCase() === "xml") {
            throw this.fail({ tr: "XML bildirimi (<?xml …?>) yalnızca belgenin en başında olabilir; önündeki boşlukları ve satırları silin.", en: "The XML declaration (<?xml …?>) is only allowed at the very beginning of the document; remove anything before it." }, start);
        }
        const end = this.text.indexOf("?>", this.index);
        if (end < 0) throw this.fail({ tr: "İşlem talimatı kapatılmamış; '?>' ekleyin.", en: "Unterminated processing instruction; add '?>'." }, start);
        if (declaration) {
            const body = this.text.slice(this.index, end);
            if (!/\bversion\s*=\s*(["'])1\.[0-9]+\1/.test(body)) {
                throw this.fail({ tr: "XML bildiriminde version=\"1.0\" bulunmalıdır.", en: "The XML declaration needs version=\"1.0\"." }, start);
            }
        }
        this.index = end + 2;
        return { type: "pi", raw: this.text.slice(start, this.index) };
    }

    private parseDoctype(): XmlNode {
        const start = this.index;
        this.index += 9;
        let depth = 0;
        let quote: string | null = null;
        const header = this.text.slice(this.index, this.index + 400).split("[")[0];
        if (/\b(?:SYSTEM|PUBLIC)\b/.test(header)) this.externalDtd = true;
        while (this.index < this.text.length) {
            const char = this.text[this.index];
            if (quote) {
                if (char === quote) quote = null;
            } else if (char === "\"" || char === "'") {
                quote = char;
            } else if (char === "[") {
                depth += 1;
            } else if (char === "]") {
                depth -= 1;
            } else if (char === ">" && depth <= 0) {
                this.index += 1;
                const raw = this.text.slice(start, this.index);
                for (const match of raw.matchAll(/<!ENTITY\s+([^\s%][^\s]*)\s/g)) this.entities.add(match[1]);
                if (/<!ENTITY\s+%/.test(raw)) this.externalDtd = true;
                return { type: "doctype", raw };
            }
            this.index += 1;
        }
        throw this.fail({ tr: "DOCTYPE bildirimi kapatılmamış.", en: "Unterminated DOCTYPE declaration." }, start);
    }

    /** Validates an entity or character reference at this.index ('&'). */
    private checkReference(): void {
        const start = this.index;
        const match = /^&(#[0-9]+|#x[0-9a-fA-F]+|[^\s&;<>"']+)?(;?)/.exec(this.text.slice(start, start + 64));
        const body = match?.[1];
        if (!body || !match?.[2]) {
            throw this.fail({ tr: "Kaçışsız '&' karakteri; metinde &amp; yazın ya da başvuruyu ';' ile bitirin.", en: "Unescaped '&'; write &amp; in text, or end the reference with ';'." }, start);
        }
        if (body.startsWith("#")) {
            const code = body[1] === "x" ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
            if (!Number.isFinite(code) || !validCodePoint(code)) {
                throw this.fail({ tr: `&${body}; geçerli bir XML karakteri değil.`, en: `&${body}; is not a valid XML character.` }, start);
            }
        } else {
            NAME.lastIndex = 0;
            const name = NAME.exec(body);
            if (!name || name[0] !== body) throw this.fail({ tr: `Geçersiz varlık adı: &${body};`, en: `Invalid entity name: &${body};` }, start);
            if (!PREDEFINED_ENTITIES.has(body) && !this.entities.has(body)) {
                if (this.externalDtd) {
                    if (!this.unknownEntityWarned) {
                        this.unknownEntityWarned = true;
                        this.warnings.push({ message: this.say({ tr: `&${body}; dış DTD'de tanımlı olmalı; bu denetleyici dış DTD'leri okumaz.`, en: `&${body}; must be defined in the external DTD, which this checker does not read.` }), offset: start });
                    }
                } else {
                    const hint = body === "nbsp" ? this.say({ tr: " XML'de &#160; kullanın.", en: " In XML use &#160; instead." }) : this.say({ tr: " Yalnızca &amp; &lt; &gt; &quot; &apos; önceden tanımlıdır.", en: " Only &amp; &lt; &gt; &quot; &apos; are predefined." });
                    throw this.fail({ tr: `Tanımsız varlık &${body};.${hint}`, en: `Undefined entity &${body};.${hint}` }, start);
                }
            }
        }
        this.index = start + match[0].length;
    }

    private parseElement(): XmlNode {
        type Frame = { node: Extract<XmlNode, { type: "element" }>; prefixes: Map<string, string> };
        const stack: Frame[] = [];
        let rootNode: XmlNode | null = null;
        const scopeHas = (prefix: string) => prefix === "xml" || prefix === "xmlns" || stack.some((frame) => frame.prefixes.has(prefix));

        const openTag = () => {
            const start = this.index;
            this.index += 1;
            const name = this.readName();
            if (!name) {
                const found = describeChar(this.text[this.index], this.locale);
                throw this.fail({ tr: `'<' sonrasında bir öğe adı bekleniyordu, ancak ${found} bulundu. Metinde '<' yerine &lt; yazın.`, en: `Expected an element name after '<' but found ${found}. Write &lt; for a literal '<' in text.` });
            }
            const node: Extract<XmlNode, { type: "element" }> = { type: "element", name, attributes: [], children: [], selfClosing: false, offset: start };
            const prefixes = new Map<string, string>();
            const seen = new Map<string, number>();
            const attributeOffsets: Array<{ name: string; offset: number }> = [];
            for (;;) {
                const before = this.index;
                this.skipWhitespace();
                const char = this.text[this.index];
                if (char === ">" || this.startsWith("/>")) break;
                if (char === undefined) throw this.fail({ tr: `<${name}> etiketi kapatılmamış; '>' ekleyin.`, en: `The <${name}> tag is not closed; add '>'.` }, start);
                if (this.index === before) {
                    throw this.fail({ tr: `<${name}> etiketinde öznitelikten önce boşluk bekleniyordu, ancak ${describeChar(char, this.locale)} bulundu.`, en: `Expected whitespace before an attribute in <${name}> but found ${describeChar(char, this.locale)}.` });
                }
                const attributeStart = this.index;
                const attributeName = this.readName();
                if (!attributeName) {
                    throw this.fail({ tr: `<${name}> etiketinde bir öznitelik adı, '>' veya '/>' bekleniyordu, ancak ${describeChar(char, this.locale)} bulundu.`, en: `Expected an attribute name, '>' or '/>' in <${name}> but found ${describeChar(char, this.locale)}.` });
                }
                if (seen.has(attributeName)) throw this.fail({ tr: `<${name}> etiketinde ${attributeName} özniteliği birden fazla kez kullanılmış.`, en: `Duplicate attribute ${attributeName} in <${name}>.` }, attributeStart);
                seen.set(attributeName, attributeStart);
                this.skipWhitespace();
                if (this.text[this.index] !== "=") {
                    throw this.fail({ tr: `${attributeName} özniteliğinden sonra '=' ve tırnak içinde bir değer bekleniyordu (XML'de değersiz öznitelik olmaz).`, en: `Expected '=' and a quoted value after the attribute ${attributeName} (XML has no attributes without values).` });
                }
                this.index += 1;
                this.skipWhitespace();
                const quote = this.text[this.index];
                if (quote !== "\"" && quote !== "'") {
                    throw this.fail({ tr: `${attributeName} özniteliğinin değeri tırnak içinde olmalıdır.`, en: `The value of ${attributeName} must be in quotes.` });
                }
                this.index += 1;
                const valueStart = this.index;
                for (;;) {
                    const valueChar = this.text[this.index];
                    if (valueChar === undefined) throw this.fail({ tr: `${attributeName} özniteliğinin değeri kapatılmamış.`, en: `The value of ${attributeName} is not closed.` }, valueStart - 1);
                    if (valueChar === quote) break;
                    if (valueChar === "<") throw this.fail({ tr: "Öznitelik değerlerinde '<' bulunamaz; &lt; yazın.", en: "Attribute values cannot contain '<'; write &lt;." });
                    if (valueChar === "&") {
                        this.checkReference();
                        continue;
                    }
                    this.index += 1;
                }
                const raw = this.text.slice(valueStart, this.index);
                this.index += 1;
                node.attributes.push({ name: attributeName, raw, quote });
                attributeOffsets.push({ name: attributeName, offset: attributeStart });
                if (attributeName === "xmlns" || attributeName.startsWith("xmlns:")) {
                    const prefix = attributeName === "xmlns" ? "" : attributeName.slice(6);
                    if (prefix && !raw) throw this.fail({ tr: `${attributeName} ad alanı önekinin değeri boş olamaz.`, en: `The namespace prefix ${attributeName} cannot be bound to an empty value.` }, attributeStart);
                    prefixes.set(prefix, raw);
                    this.stats.namespaces += 1;
                }
            }
            this.stats.elements += 1;
            this.stats.attributes += node.attributes.length;
            // Namespace prefixes, checked once this element's own xmlns declarations are known.
            const frame: Frame = { node, prefixes };
            stack.push(frame);
            const check = (qualified: string, offset: number) => {
                const colon = qualified.indexOf(":");
                if (colon <= 0) return;
                const prefix = qualified.slice(0, colon);
                if (!scopeHas(prefix)) throw this.fail({ tr: `'${prefix}' ad alanı öneki tanımlanmamış; xmlns:${prefix}="…" ekleyin.`, en: `The namespace prefix '${prefix}' is not declared; add xmlns:${prefix}="…".` }, offset);
            };
            check(name, start + 1);
            for (const attribute of attributeOffsets) if (!attribute.name.startsWith("xmlns:")) check(attribute.name, attribute.offset);
            stack.pop();
            if (this.startsWith("/>")) {
                this.index += 2;
                node.selfClosing = true;
                return { node, prefixes, closed: true };
            }
            this.index += 1;
            return { node, prefixes, closed: false };
        };

        const first = openTag();
        rootNode = first.node;
        if (first.closed) {
            this.stats.maxDepth = Math.max(this.stats.maxDepth, 1);
            return rootNode;
        }
        stack.push({ node: first.node, prefixes: first.prefixes });
        this.stats.maxDepth = Math.max(this.stats.maxDepth, 1);

        while (stack.length) {
            const frame = stack[stack.length - 1];
            const char = this.text[this.index];
            if (char === undefined) {
                throw this.fail({ tr: `<${frame.node.name}> öğesi kapatılmamış; </${frame.node.name}> ekleyin.`, en: `The element <${frame.node.name}> is never closed; add </${frame.node.name}>.` }, frame.node.offset);
            }
            if (char === "<") {
                if (this.startsWith("</")) {
                    const closeStart = this.index;
                    this.index += 2;
                    const name = this.readName() ?? "";
                    this.skipWhitespace();
                    if (this.text[this.index] !== ">") throw this.fail({ tr: `</${name}> kapanış etiketinde '>' bekleniyordu.`, en: `Expected '>' to end the closing tag </${name}>.` });
                    if (name !== frame.node.name) {
                        const opened = issueAt(this.text, frame.node.offset, "");
                        const isOpenElsewhere = stack.some((item) => item.node.name === name);
                        throw this.fail(isOpenElsewhere
                            ? { tr: `Beklenmeyen </${name}>; önce ${opened.line}. satırda açılan <${frame.node.name}> kapatılmalı.`, en: `Unexpected </${name}>; close <${frame.node.name}> (opened on line ${opened.line}) first.` }
                            : { tr: `</${name}> kapanış etiketi açık öğeyle eşleşmiyor; </${frame.node.name}> bekleniyordu (${opened.line}. satırda açıldı).`, en: `Closing tag </${name}> does not match; expected </${frame.node.name}> (opened on line ${opened.line}).` }, closeStart);
                    }
                    this.index += 1;
                    stack.pop();
                    continue;
                }
                if (this.startsWith("<!--")) {
                    frame.node.children.push(this.parseComment());
                    continue;
                }
                if (this.startsWith("<![CDATA[")) {
                    const start = this.index;
                    const end = this.text.indexOf("]]>", start + 9);
                    if (end < 0) throw this.fail({ tr: "CDATA bölümü kapatılmamış; ']]>' ekleyin.", en: "Unterminated CDATA section; add ']]>'." }, start);
                    frame.node.children.push({ type: "cdata", raw: this.text.slice(start, end + 3) });
                    this.index = end + 3;
                    continue;
                }
                if (this.startsWith("<?")) {
                    frame.node.children.push(this.parseProcessingInstruction(false));
                    continue;
                }
                if (this.startsWith("<!")) throw this.fail({ tr: "Öğe içeriğinde bildirimlere (<!…>) izin verilmez.", en: "Declarations (<!…>) are not allowed inside elements." });
                if (stack.length >= MAX_DEPTH) throw this.fail({ tr: `İç içe öğeler ${MAX_DEPTH} düzeyden derin.`, en: `Elements are nested deeper than ${MAX_DEPTH} levels.` });
                const opened = openTag();
                frame.node.children.push(opened.node);
                if (!opened.closed) stack.push({ node: opened.node, prefixes: opened.prefixes });
                this.stats.maxDepth = Math.max(this.stats.maxDepth, stack.length + (opened.closed ? 1 : 0));
                continue;
            }
            // Character data up to the next markup.
            const start = this.index;
            while (this.index < this.text.length && this.text[this.index] !== "<") {
                if (this.text[this.index] === "&") {
                    this.checkReference();
                    continue;
                }
                if (this.startsWith("]]>")) throw this.fail({ tr: "Metin içinde ']]>' bulunamaz; '>' karakterini &gt; olarak yazın.", en: "Text cannot contain ']]>'; write the '>' as &gt;." });
                this.index += 1;
            }
            frame.node.children.push({ type: "text", raw: this.text.slice(start, this.index) });
        }
        return rootNode;
    }
}

// ------------------------------------------------------------------ formatting
function serializeAttributes(attributes: Attribute[]) {
    return attributes.map((attribute) => ` ${attribute.name}=${attribute.quote}${attribute.raw}${attribute.quote}`).join("");
}

function serializeInline(node: XmlNode): string {
    if (node.type !== "element") return node.raw;
    const open = `<${node.name}${serializeAttributes(node.attributes)}`;
    if (node.selfClosing) return `${open}/>`;
    return `${open}>${node.children.map(serializeInline).join("")}</${node.name}>`;
}

function formatNode(node: XmlNode, unit: string, level: number, lines: string[]) {
    const pad = unit.repeat(level);
    if (node.type !== "element") {
        if (node.type === "text") {
            const trimmed = node.raw.trim();
            if (trimmed) lines.push(`${pad}${trimmed}`);
            return;
        }
        lines.push(`${pad}${node.raw.trim()}`);
        return;
    }
    const open = `<${node.name}${serializeAttributes(node.attributes)}`;
    const meaningful = node.children.filter((child) => child.type !== "text" || child.raw.trim());
    if (node.selfClosing) {
        lines.push(`${pad}${open}/>`);
        return;
    }
    if (!meaningful.length) {
        lines.push(`${pad}${open}></${node.name}>`);
        return;
    }
    const hasText = node.children.some((child) => (child.type === "text" && child.raw.trim()) || child.type === "cdata");
    if (hasText) {
        // Text and mixed content keep their exact whitespace.
        lines.push(`${pad}${open}>${node.children.map(serializeInline).join("")}</${node.name}>`);
        return;
    }
    lines.push(`${pad}${open}>`);
    for (const child of meaningful) formatNode(child, unit, level + 1, lines);
    lines.push(`${pad}</${node.name}>`);
}

/** Pretty-prints parsed XML nodes (see the module comment for the rules). */
export function formatXmlNodes(nodes: XmlNode[], indent = 2): string {
    const lines: string[] = [];
    const unit = " ".repeat(Math.max(1, Math.min(8, indent)));
    for (const node of nodes) formatNode(node, unit, 0, lines);
    return lines.join("\n");
}

/** Checks that `text` is well-formed XML and pretty-prints it. */
export function analyzeXml(text: string, options: ValidatorOptions = {}): XmlAnalysis {
    const locale = localeOf(options);
    const parser = new XmlParser(text, locale);
    const toWarnings = (): ValidationIssue[] => parser.warnings.map((warning) => issueAt(text, warning.offset, warning.message));
    try {
        const nodes = parser.parseDocument();
        const root = nodes.find((node): node is Extract<XmlNode, { type: "element" }> => node.type === "element");
        const stats: XmlStats = { root: root?.name ?? "", ...parser.stats };
        const summary = locale === "tr"
            ? `✓ İyi biçimli XML · kök: <${stats.root}> · ${count(locale, stats.elements, "öğe", "element")} · ${count(locale, stats.attributes, "öznitelik", "attribute")} · derinlik ${stats.maxDepth}`
            : `✓ Well-formed XML · root: <${stats.root}> · ${count(locale, stats.elements, "öğe", "element")} · ${count(locale, stats.attributes, "öznitelik", "attribute")} · depth ${stats.maxDepth}`;
        return { ok: true, warnings: toWarnings(), summary, formatted: formatXmlNodes(nodes, indentOf(options)), stats, nodes };
    } catch (error) {
        if (error instanceof ValidationError) return { ok: false, error: issueAt(text, error.offset, error.message), warnings: toWarnings() };
        throw error;
    }
}
