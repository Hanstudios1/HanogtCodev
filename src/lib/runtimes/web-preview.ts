/**
 * Builds the srcdoc documents shown in the editor's live preview
 * (dependency-free, so it can be tested in plain Node).
 *
 * The documents are rendered in an <iframe sandbox="allow-scripts allow-forms">
 * WITHOUT allow-same-origin, so they run in an opaque origin with no access to
 * the site's cookies or storage. A Content-Security-Policy meta tag blocks all
 * network access except images, and a small bridge script forwards console
 * output to the editor with postMessage (the parent checks the message source
 * and a per-render token).
 */

export interface PreviewSourceFile {
    name: string;
    language: string;
    code: string;
}

export type PreviewKind = "web" | "css" | "markdown";

export interface PreviewTarget {
    kind: PreviewKind;
    /** The file that is rendered (entry HTML, stylesheet or Markdown file). */
    file: PreviewSourceFile;
}

export interface WebPreviewResult {
    html: string;
    /** Local files referenced by the HTML but missing from the project. */
    missing: string[];
    /** Project files that were inlined into the page. */
    inlined: string[];
}

/** The policy every preview document carries (in addition to the site's own). */
export const PREVIEW_CSP = [
    "default-src 'none'",
    "script-src 'unsafe-inline' 'unsafe-eval'",
    "style-src 'unsafe-inline'",
    "img-src data: blob: https:",
    "media-src data: blob: https:",
    "font-src data:",
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "manifest-src 'none'",
].join("; ");

/** No scripts at all: used for Markdown and CSS showcase documents. */
export const STATIC_PREVIEW_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; base-uri 'none'; form-action 'none'";

export const PREVIEW_MESSAGE_SOURCE = "hanogt-preview";

const baseName = (name: string) => name.trim().replace(/\\/g, "/").split("/").pop() ?? name;

function normalizeReference(reference: string) {
    return reference.trim().replace(/[?#].*$/, "").replace(/^\.\//, "").replace(/^\/+/, "");
}

function isLocalReference(reference: string) {
    return Boolean(reference) && !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(reference.trim());
}

function findFile(files: PreviewSourceFile[], reference: string) {
    const wanted = normalizeReference(reference).toLowerCase();
    if (!wanted) return undefined;
    return files.find((file) => file.name.trim().replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase() === wanted)
        ?? files.find((file) => baseName(file.name).toLowerCase() === baseName(wanted));
}

function attribute(tag: string, name: string): string | null {
    const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i").exec(tag);
    return match ? (match[1] ?? match[2] ?? match[3] ?? "") : null;
}

function escapeAttribute(value: string) {
    return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** Keeps inlined code from closing its own <style>/<script> element early. */
function protect(code: string, tag: "style" | "script") {
    return code.replace(new RegExp(`</(${tag})`, "gi"), "<\\/$1");
}

/** Chooses what the preview panel shows for the active file. */
export function resolvePreviewTarget(files: PreviewSourceFile[], active: PreviewSourceFile | undefined): PreviewTarget | null {
    if (active?.language === "markdown") return { kind: "markdown", file: active };
    const htmlFiles = files.filter((file) => file.language === "html");
    if (htmlFiles.length) {
        const entry = active?.language === "html"
            ? active
            : htmlFiles.find((file) => baseName(file.name).toLowerCase() === "index.html") ?? htmlFiles[0];
        return { kind: "web", file: entry };
    }
    if (active?.language === "css") return { kind: "css", file: active };
    const markdown = files.find((file) => file.language === "markdown");
    if (markdown) return { kind: "markdown", file: markdown };
    const css = files.find((file) => file.language === "css");
    return css ? { kind: "css", file: css } : null;
}

type Segment = { text: string; file: string | null; line: number };

function countLines(text: string) {
    let count = 0;
    for (let index = 0; index < text.length; index += 1) if (text.charCodeAt(index) === 10) count += 1;
    return count;
}

function lineAt(text: string, offset: number) {
    return countLines(text.slice(0, offset)) + 1;
}

/**
 * The bridge runs before any page script. It must stay on a single line so
 * the line numbers of everything after it are known in advance.
 */
function bridgeScript(token: string, stdin: string[], map: Array<{ s: number; e: number; f: string; l: number }>, dark: boolean) {
    const json = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    const theme = dark ? "dark" : "light";
    return `<script>(function(){var T=${json(token)},S=${json(PREVIEW_MESSAGE_SOURCE)},I=${json(stdin.slice(0, 1000))},M=${json(map)},P=window.parent,n=0;`
        + "function send(type,level,args){if(n>2000)return;n++;try{P.postMessage({source:S,token:T,type:type,level:level,args:args},'*')}catch(e){}}"
        + "function where(line){for(var i=0;i<M.length;i++){var m=M[i];if(line>=m.s&&line<=m.e)return m.f+':'+(m.l+line-m.s)}return line?'line '+line:''}"
        + "function fmt(v,d){d=d||0;try{if(v===null)return 'null';if(v===undefined)return 'undefined';var t=typeof v;if(t==='string')return d?JSON.stringify(v.length>2000?v.slice(0,2000)+'…':v):(v.length>8000?v.slice(0,8000)+'…':v);if(t==='number'||t==='boolean')return String(v);if(t==='bigint')return v+'n';if(t==='symbol')return v.toString();if(t==='function')return '[Function '+(v.name||'anonymous')+']';if(v instanceof Error)return v.name+': '+v.message;if(typeof Element!=='undefined'&&v instanceof Element){return '<'+v.tagName.toLowerCase()+(v.id?' id=\"'+v.id+'\"':'')+(v.className&&typeof v.className==='string'?' class=\"'+v.className+'\"':'')+'>'}if(d>3)return Array.isArray(v)?'[Array]':'[Object]';if(Array.isArray(v)){var a=[];for(var i=0;i<v.length&&i<100;i++)a.push(fmt(v[i],d+1));if(v.length>100)a.push('… '+(v.length-100)+' more');return '[ '+a.join(', ')+' ]'}if(v instanceof Map){var o=[];v.forEach(function(x,k){if(o.length<50)o.push(fmt(k,d+1)+' => '+fmt(x,d+1))});return 'Map('+v.size+') { '+o.join(', ')+' }'}if(v instanceof Set){var s=[];v.forEach(function(x){if(s.length<50)s.push(fmt(x,d+1))});return 'Set('+v.size+') { '+s.join(', ')+' }'}var keys=Object.keys(v),p=[];for(var j=0;j<keys.length&&j<50;j++)p.push(keys[j]+': '+fmt(v[keys[j]],d+1));if(keys.length>50)p.push('…');var name=v.constructor&&v.constructor!==Object&&v.constructor.name?v.constructor.name+' ':'';return name+'{ '+p.join(', ')+' }'}catch(e){return '[unprintable]'}}"
        + "['log','info','warn','error','debug','table','dir','trace'].forEach(function(k){var o=console[k];console[k]=function(){var a=[];for(var i=0;i<arguments.length&&i<50;i++)a.push(fmt(arguments[i]));send('console',k==='warn'||k==='error'||k==='info'||k==='debug'?k:'log',a);try{if(o)o.apply(console,arguments)}catch(e){}}});"
        + "console.clear=function(){send('clear','info',[])};"
        + "window.addEventListener('error',function(e){var at=where(e.lineno);send('console','error',[(e.message||'Error')+(at?' ('+at+(e.colno?':'+e.colno:'')+')':'')])});"
        + "window.addEventListener('unhandledrejection',function(e){send('console','error',['Unhandled promise rejection: '+fmt(e.reason)])});"
        + "function toast(text){try{var b=document.body||document.documentElement,d=document.createElement('div');d.textContent=text;d.setAttribute('role','status');d.style.cssText='position:fixed;left:50%;bottom:16px;transform:translateX(-50%);max-width:90%;z-index:2147483647;padding:10px 14px;border-radius:12px;font:14px system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.25);background:"
        + (theme === "dark" ? "#27272a;color:#fafafa" : "#18181b;color:#fafafa")
        + "';b.appendChild(d);setTimeout(function(){d.remove()},3500)}catch(e){}}"
        + "window.alert=function(m){var t=fmt(m);send('console','info',['[alert] '+t]);toast(t)};"
        + "window.confirm=function(m){send('console','info',['[confirm] '+fmt(m)+' → true']);return true};"
        + "window.prompt=function(m,d){var v=I.length?I.shift():(d===undefined?null:String(d));send('console','info',['[prompt] '+fmt(m)+' → '+(v===null?'null':JSON.stringify(v))]);return v};"
        + "window.open=function(u){send('console','warn',['window.open is disabled in the preview: '+u]);return null};"
        + "window.addEventListener('submit',function(e){if(!e.defaultPrevented){e.preventDefault();send('console','info',['[form] submit was prevented; the preview has no server to send it to'])}});"
        + "window.addEventListener('click',function(e){var a=e.target&&e.target.closest?e.target.closest('a[href]'):null;if(!a||e.defaultPrevented)return;var h=a.getAttribute('href')||'';if(h.charAt(0)==='#')return;e.preventDefault();send('console','info',['[link] '+h+' (links do not navigate inside the preview)'])});"
        + "send('ready','info',[]);})();</script>";
}

/** Inlines the project's stylesheets and scripts into the entry HTML page. */
export function buildWebPreview(files: PreviewSourceFile[], entry: PreviewSourceFile, options: { token: string; stdin?: string; dark?: boolean }): WebPreviewResult {
    const source = entry.code;
    const missing: string[] = [];
    const inlined: string[] = [];
    const segments: Segment[] = [];
    const tagPattern = /<link\b[^>]*>|<script\b[^>]*\bsrc\s*=[^>]*>\s*<\/script\s*>/gi;
    let cursor = 0;
    let referencesLocalFiles = false;
    const pushSource = (end: number) => {
        if (end > cursor) segments.push({ text: source.slice(cursor, end), file: entry.name, line: lineAt(source, cursor) });
    };
    for (let match = tagPattern.exec(source); match; match = tagPattern.exec(source)) {
        const tag = match[0];
        const isScript = /^<script/i.test(tag);
        if (!isScript && !/\bstylesheet\b/i.test(attribute(tag, "rel") ?? "")) continue;
        const reference = attribute(tag, isScript ? "src" : "href") ?? "";
        if (!isLocalReference(reference)) continue;
        referencesLocalFiles = true;
        pushSource(match.index);
        cursor = match.index + tag.length;
        const file = findFile(files, reference);
        if (!file || file.language !== (isScript ? "javascript" : "css")) {
            missing.push(normalizeReference(reference));
            segments.push({ text: `<!-- ${escapeAttribute(normalizeReference(reference))} is not in this project -->`, file: null, line: 0 });
            continue;
        }
        inlined.push(file.name);
        const marker = escapeAttribute(file.name);
        if (isScript) {
            const type = attribute(tag, "type");
            const typeAttribute = type && /module/i.test(type) ? " type=\"module\"" : "";
            segments.push({ text: `<script data-hanogt-file="${marker}"${typeAttribute}>\n`, file: null, line: 0 });
            segments.push({ text: protect(file.code, "script"), file: file.name, line: 1 });
            segments.push({ text: "\n</script>", file: null, line: 0 });
        } else {
            segments.push({ text: `<style data-hanogt-file="${marker}">\n`, file: null, line: 0 });
            segments.push({ text: protect(file.code, "style"), file: file.name, line: 1 });
            segments.push({ text: "\n</style>", file: null, line: 0 });
        }
    }
    pushSource(source.length);

    // CodePen-style projects without any <link>/<script src> get every
    // stylesheet in the head and every script at the end of the body.
    if (!referencesLocalFiles) {
        const styles = files.filter((file) => file.language === "css" && file !== entry);
        const scripts = files.filter((file) => file.language === "javascript");
        const insertBefore = (pattern: RegExp, addition: Segment[], atEnd: boolean) => {
            for (let index = 0; index < segments.length; index += 1) {
                const segment = segments[index];
                if (segment.file !== entry.name) continue;
                const found = pattern.exec(segment.text);
                if (!found) continue;
                const before: Segment = { text: segment.text.slice(0, found.index), file: segment.file, line: segment.line };
                const after: Segment = { text: segment.text.slice(found.index), file: segment.file, line: segment.line + countLines(segment.text.slice(0, found.index)) };
                segments.splice(index, 1, before, ...addition, after);
                return;
            }
            if (atEnd) segments.push(...addition);
            else segments.unshift(...addition);
        };
        const styleSegments = styles.flatMap((file): Segment[] => {
            inlined.push(file.name);
            return [
                { text: `<style data-hanogt-file="${escapeAttribute(file.name)}">\n`, file: null, line: 0 },
                { text: protect(file.code, "style"), file: file.name, line: 1 },
                { text: "\n</style>", file: null, line: 0 },
            ];
        });
        const scriptSegments = scripts.flatMap((file): Segment[] => {
            inlined.push(file.name);
            return [
                { text: `<script data-hanogt-file="${escapeAttribute(file.name)}">\n`, file: null, line: 0 },
                { text: protect(file.code, "script"), file: file.name, line: 1 },
                { text: "\n</script>", file: null, line: 0 },
            ];
        });
        if (styleSegments.length) insertBefore(/<\/head\s*>/i, styleSegments, true);
        if (scriptSegments.length) insertBefore(/<\/body\s*>/i, scriptSegments, true);
    }

    // The security policy and the bridge go right after <head> (or <html>, or the
    // doctype) without adding line breaks, so the page's own line numbers stay valid.
    const headSegment: Segment = { text: "", file: null, line: 0 };
    const entrySegments = segments.filter((segment) => segment.file === entry.name);
    let placed = false;
    for (const segment of entrySegments) {
        const tag = /<head\b[^>]*>/i.exec(segment.text) ?? /<html\b[^>]*>/i.exec(segment.text);
        if (!tag) continue;
        const at = tag.index + tag[0].length;
        const index = segments.indexOf(segment);
        segments.splice(index, 1,
            { text: segment.text.slice(0, at), file: segment.file, line: segment.line },
            headSegment,
            { text: segment.text.slice(at), file: segment.file, line: segment.line + countLines(segment.text.slice(0, at)) });
        placed = true;
        break;
    }
    let wrapHead = false;
    if (!placed) {
        wrapHead = true;
        const first = entrySegments[0];
        const doctype = first ? /^\s*<!doctype[^>]*>/i.exec(first.text) : null;
        if (first && doctype) {
            const index = segments.indexOf(first);
            segments.splice(index, 1,
                { text: first.text.slice(0, doctype[0].length), file: first.file, line: first.line },
                headSegment,
                { text: first.text.slice(doctype[0].length), file: first.file, line: first.line + countLines(first.text.slice(0, doctype[0].length)) });
        } else {
            segments.unshift({ text: "<!DOCTYPE html>", file: null, line: 0 }, headSegment);
        }
    } else if (!/^\s*<!doctype/i.test(source)) {
        segments.unshift({ text: "<!DOCTYPE html>", file: null, line: 0 });
    }

    // Map document lines back to project files for error messages. The head
    // segment is still empty here and never contains line breaks.
    const map: Array<{ s: number; e: number; f: string; l: number }> = [];
    let line = 1;
    for (const segment of segments) {
        const lines = countLines(segment.text);
        if (segment.file && segment.text) map.push({ s: line, e: line + lines, f: segment.file, l: segment.line });
        line += lines;
    }
    const stdinLines = (options.stdin ?? "").replace(/\r\n/g, "\n").split("\n");
    if (stdinLines[stdinLines.length - 1] === "") stdinLines.pop();
    const head = `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}"><meta charset="utf-8">${bridgeScript(options.token, stdinLines, map, Boolean(options.dark))}`;
    headSegment.text = wrapHead ? `<head>${head}</head>` : head;
    const html = segments.map((segment) => segment.text).join("");
    return { html, missing: [...new Set(missing)], inlined: [...new Set(inlined)] };
}

const SHOWCASE_BASE = `
:root { color-scheme: light dark; }
body { margin: 0; padding: 24px; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; line-height: 1.6; }
.hanogt-showcase { display: grid; gap: 20px; max-width: 760px; }
`;

/** A page of common elements styled by a stylesheet that has no HTML page of its own. */
export function buildCssShowcase(css: string, options: { dark?: boolean; labels: { title: string; paragraph: string; button: string; input: string; box: string; card: string; listItem: string; quote: string } }): string {
    const { labels } = options;
    const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    return `<!DOCTYPE html><html${options.dark ? " data-theme=\"dark\"" : ""}><head><meta http-equiv="Content-Security-Policy" content="${STATIC_PREVIEW_CSP}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${SHOWCASE_BASE}</style><style>${protect(css, "style")}</style></head><body>
<main class="hanogt-showcase container">
<h1>${escape(labels.title)}</h1>
<h2>${escape(labels.title)} · h2</h2>
<p>${escape(labels.paragraph)} <a href="#">link</a> <strong>strong</strong> <em>em</em> <code>code</code></p>
<div><button type="button">${escape(labels.button)}</button> <button type="button" class="button btn primary">${escape(labels.button)} 2</button></div>
<label>${escape(labels.input)} <input type="text" placeholder="${escape(labels.input)}"></label>
<select><option>${escape(labels.listItem)} 1</option><option>${escape(labels.listItem)} 2</option></select>
<ul><li>${escape(labels.listItem)} 1</li><li>${escape(labels.listItem)} 2</li></ul>
<ol><li>${escape(labels.listItem)} 1</li><li>${escape(labels.listItem)} 2</li></ol>
<blockquote>${escape(labels.quote)}</blockquote>
<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>
<div class="box">${escape(labels.box)}</div>
<div class="card"><h3>${escape(labels.card)}</h3><p>${escape(labels.paragraph)}</p></div>
</main>
</body></html>`;
}

const MARKDOWN_STYLE = `
:root { color-scheme: light; --fg: #1f2328; --muted: #59636e; --border: #d1d9e0; --bg: #ffffff; --soft: #f6f8fa; --link: #0969da; --quote: #59636e; }
:root[data-theme="dark"] { color-scheme: dark; --fg: #e6edf3; --muted: #9198a1; --border: #3d444d; --bg: #0d1117; --soft: #151b23; --link: #4493f8; --quote: #9198a1; }
html { background: var(--bg); }
body { margin: 0 auto; max-width: 860px; padding: 24px 28px 48px; color: var(--fg); background: var(--bg); font: 16px/1.6 system-ui, -apple-system, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif; overflow-wrap: break-word; }
h1, h2, h3, h4, h5, h6 { margin: 24px 0 12px; font-weight: 600; line-height: 1.25; }
h1 { font-size: 2em; padding-bottom: .3em; border-bottom: 1px solid var(--border); }
h2 { font-size: 1.5em; padding-bottom: .3em; border-bottom: 1px solid var(--border); }
h3 { font-size: 1.25em; } h4 { font-size: 1em; } h5 { font-size: .875em; } h6 { font-size: .85em; color: var(--muted); }
p, ul, ol, blockquote, table, pre, details { margin: 0 0 16px; }
a { color: var(--link); text-decoration: none; } a:hover { text-decoration: underline; }
a.relative-link { color: var(--link); cursor: help; text-decoration: underline dotted; }
code { font: .875em/1.5 ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace; background: var(--soft); border-radius: 6px; padding: .2em .4em; }
pre { background: var(--soft); border-radius: 8px; padding: 16px; overflow: auto; }
pre code { background: none; padding: 0; font-size: .85em; }
blockquote { margin-left: 0; padding: 0 1em; color: var(--quote); border-left: .25em solid var(--border); }
hr { height: .25em; padding: 0; margin: 24px 0; background: var(--border); border: 0; }
table { border-collapse: collapse; display: block; overflow: auto; }
th, td { padding: 6px 13px; border: 1px solid var(--border); }
th { font-weight: 600; } tr:nth-child(2n) td { background: var(--soft); }
.align-left { text-align: left; } .align-center { text-align: center; } .align-right { text-align: right; }
img { max-width: 100%; border-radius: 6px; }
ul.contains-task-list { padding-left: 1.25em; } li.task-list-item { list-style: none; } li.task-list-item input { margin: 0 .35em 0 -1.3em; vertical-align: middle; }
kbd { font: 11px ui-monospace, monospace; padding: 3px 5px; border: 1px solid var(--border); border-bottom-width: 2px; border-radius: 6px; background: var(--soft); }
details { border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; } summary { cursor: pointer; font-weight: 600; }
.empty { color: var(--muted); font-style: italic; }
`;

/** Wraps rendered Markdown HTML in a styled, script-free document. */
export function buildMarkdownDocument(renderedHtml: string, options: { dark?: boolean; emptyText: string }): string {
    const body = renderedHtml.trim() ? renderedHtml : `<p class="empty">${options.emptyText.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`;
    return `<!DOCTYPE html><html${options.dark ? " data-theme=\"dark\"" : ""}><head><meta http-equiv="Content-Security-Policy" content="${STATIC_PREVIEW_CSP}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${MARKDOWN_STYLE}</style></head><body>${body}</body></html>`;
}

/** A random token for one preview render (parent and frame compare it). */
export function createPreviewToken(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type PreviewLogLevel = "log" | "info" | "warn" | "error" | "debug";

export type PreviewMessage =
    | { type: "console"; level: PreviewLogLevel; args: string[] }
    | { type: "clear" }
    | { type: "ready" };

/** Validates a message received from a preview frame; returns null when it is not ours. */
export function parsePreviewMessage(data: unknown, token: string): PreviewMessage | null {
    if (!data || typeof data !== "object") return null;
    const message = data as Record<string, unknown>;
    if (message.source !== PREVIEW_MESSAGE_SOURCE || message.token !== token) return null;
    if (message.type === "clear") return { type: "clear" };
    if (message.type === "ready") return { type: "ready" };
    if (message.type !== "console") return null;
    const level = message.level;
    if (level !== "log" && level !== "info" && level !== "warn" && level !== "error" && level !== "debug") return null;
    if (!Array.isArray(message.args)) return null;
    const args = message.args.slice(0, 50).map((arg) => (typeof arg === "string" ? arg.slice(0, 10_000) : String(arg).slice(0, 10_000)));
    return { type: "console", level, args };
}
