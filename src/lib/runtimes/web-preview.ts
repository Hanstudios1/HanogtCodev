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
 *
 * SVG files are shown as an image (scripts inside them never run). Mermaid
 * diagrams, LaTeX math, Graphviz DOT graphs, ABC sheet music, AsciiDoc
 * documents and GLSL shaders use "live" frames: the page fetches the library
 * once from /runtimes (same origin), inlines it into a frame that has no
 * network access, and then sends each new version of the file to that frame
 * with postMessage, so editing does not reload the library. The newer live
 * frames only run scripts that carry the frame's nonce, so markup a document
 * produces (AsciiDoc passthrough, a graph's links) can never run code. Logo
 * runs in the page (src/lib/runtimes/logo.ts) and is shown as a static SVG.
 */
import type { LogoResult } from "./logo";
import { analyzeXml } from "./xml-tools";

export interface PreviewSourceFile {
    name: string;
    language: string;
    code: string;
}

export type PreviewKind = "web" | "css" | "markdown" | "svg" | "mermaid" | "latex" | "dot" | "abc" | "asciidoc" | "glsl" | "logo";

/** Kinds rendered by a library (or, for GLSL, WebGL) inside a long-lived frame that receives updates by postMessage. */
export type LivePreviewKind = "mermaid" | "latex" | "dot" | "abc" | "asciidoc" | "glsl";

const LIVE_KINDS: ReadonlySet<string> = new Set(["mermaid", "latex", "dot", "abc", "asciidoc", "glsl"]);

export function isLivePreviewKind(kind: PreviewKind | null | undefined): kind is LivePreviewKind {
    return typeof kind === "string" && LIVE_KINDS.has(kind);
}

/** Files of these languages preview themselves when they are the active tab. */
const SELF_PREVIEW: ReadonlySet<string> = new Set(["markdown", "svg", "mermaid", "latex", "dot", "abc", "asciidoc", "glsl", "logo"]);

/** When no previewable file is active, the first of these found in the project is shown. */
const FALLBACK_ORDER = ["markdown", "asciidoc", "latex", "mermaid", "dot", "abc", "logo", "glsl", "svg"] as const;

export interface PreviewTarget {
    kind: PreviewKind;
    /** The file that is rendered (entry HTML, a stylesheet, or a file that previews itself). */
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

/** No scripts at all: used for Markdown, SVG and CSS showcase documents. */
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
    if (active && SELF_PREVIEW.has(active.language)) return { kind: active.language as PreviewKind, file: active };
    const htmlFiles = files.filter((file) => file.language === "html");
    if (htmlFiles.length) {
        const entry = active?.language === "html"
            ? active
            : htmlFiles.find((file) => baseName(file.name).toLowerCase() === "index.html") ?? htmlFiles[0];
        return { kind: "web", file: entry };
    }
    if (active?.language === "css") return { kind: "css", file: active };
    for (const language of FALLBACK_ORDER) {
        const file = files.find((item) => item.language === language);
        if (file) return { kind: language, file };
    }
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
        // A sandboxed frame has no storage of its own (reading localStorage throws), so pages get an in-memory
        // stand-in that lasts until the preview reloads.
        + "function mem(){var d=Object.create(null);return{getItem:function(k){k=String(k);return k in d?d[k]:null},setItem:function(k,v){d[String(k)]=String(v)},removeItem:function(k){delete d[String(k)]},clear:function(){d=Object.create(null)},key:function(i){var k=Object.keys(d);return i>=0&&i<k.length?k[i]:null},get length(){return Object.keys(d).length}}}"
        + "['localStorage','sessionStorage'].forEach(function(name){var ok=false;try{var st=window[name];st.setItem('__hanogt','1');st.removeItem('__hanogt');ok=true}catch(e){}if(!ok){try{Object.defineProperty(window,name,{value:mem(),configurable:true})}catch(e){}}});"
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

// ------------------------------------------------------------------ SVG
const SVG_STYLE = `
:root { color-scheme: light; --fg: #27272a; --muted: #71717a; --bg: #ffffff; --check: #f4f4f5; --border: #e4e4e7; --error: #b91c1c; }
:root[data-theme="dark"] { color-scheme: dark; --fg: #e4e4e7; --muted: #a1a1aa; --bg: #18181b; --check: #27272a; --border: #3f3f46; --error: #f87171; }
html, body { margin: 0; min-height: 100%; background: var(--bg); color: var(--fg); font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { min-height: calc(100vh - 48px); display: grid; place-items: center; padding: 16px; box-sizing: border-box;
  background-color: var(--bg); background-image: linear-gradient(45deg, var(--check) 25%, transparent 25%), linear-gradient(-45deg, var(--check) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--check) 75%), linear-gradient(-45deg, transparent 75%, var(--check) 75%);
  background-size: 20px 20px; background-position: 0 0, 0 10px, 10px -10px, -10px 0; }
img { max-width: 100%; height: auto; }
footer { padding: 8px 16px; border-top: 1px solid var(--border); color: var(--muted); font-size: 12px; }
.error { max-width: 720px; margin: 24px auto; padding: 16px; border: 1px solid var(--error); border-radius: 12px; color: var(--error); }
.error pre { margin: 12px 0 0; overflow: auto; color: var(--fg); font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
`;

export interface SvgPreviewLabels {
    /** "This SVG is not well-formed" */
    invalid: string;
    /** "The root element must be <svg>" */
    notSvg: string;
    /** "line {line}, column {column}" */
    location: string;
    /** "xmlns was added for the preview" */
    namespaceAdded: string;
    /** "Scripts inside SVG files do not run in the preview." */
    note: string;
}

function escapeText(text: string) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** A static (script-free) page that shows an SVG file as an image, or why it cannot be shown. */
export function buildSvgDocument(svg: string, options: { dark?: boolean; labels: SvgPreviewLabels }): string {
    const { labels } = options;
    const head = `<!DOCTYPE html><html${options.dark ? " data-theme=\"dark\"" : ""}><head><meta http-equiv="Content-Security-Policy" content="${STATIC_PREVIEW_CSP}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${SVG_STYLE}</style></head><body>`;
    const analysis = analyzeXml(svg);
    if (!analysis.ok || !analysis.stats) {
        const issue = analysis.error ?? { message: labels.invalid, line: 1, column: 1 };
        const sourceLine = svg.split("\n")[issue.line - 1] ?? "";
        const caret = `${" ".repeat(Math.max(0, issue.column - 1))}^`;
        const where = labels.location.replace("{line}", String(issue.line)).replace("{column}", String(issue.column));
        return `${head}<div class="error" role="alert"><strong>${escapeText(labels.invalid)}</strong> (${escapeText(where)})<br>${escapeText(issue.message)}<pre>${escapeText(sourceLine)}\n${caret}</pre></div></body></html>`;
    }
    const root = analysis.stats.root;
    if (root !== "svg" && !root.endsWith(":svg")) {
        return `${head}<div class="error" role="alert"><strong>${escapeText(labels.notSvg)}</strong></div></body></html>`;
    }
    // A standalone SVG needs the SVG namespace (inline <svg> in HTML does not), so add it when missing.
    let fixed = svg;
    let namespaceAdded = false;
    const start = /<svg\b[^>]*>/.exec(svg);
    if (start && !/\sxmlns\s*=/.test(start[0])) {
        fixed = svg.slice(0, start.index + 4) + " xmlns=\"http://www.w3.org/2000/svg\"" + svg.slice(start.index + 4);
        namespaceAdded = true;
    }
    const attribute = (name: string) => (start ? new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`).exec(start[0])?.[1] : undefined);
    const size = [attribute("width") && attribute("height") ? `${attribute("width")} × ${attribute("height")}` : "", attribute("viewBox") ? `viewBox ${attribute("viewBox")}` : ""].filter(Boolean).join(" · ");
    const details = [size, namespaceAdded ? labels.namespaceAdded : "", labels.note].filter(Boolean).map(escapeText).join(" · ");
    return `${head}<main><img alt="" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(fixed)}"></main><footer>${details}</footer></body></html>`;
}

// ------------------------------------------------------------------ live frames (Mermaid, LaTeX)
/** Policy of live frames: inline library code may run; nothing can be loaded from the network. */
export const LIVE_PREVIEW_CSP = [
    "default-src 'none'",
    "script-src 'unsafe-inline' 'unsafe-eval'",
    "style-src 'unsafe-inline'",
    "img-src data: blob:",
    "font-src data:",
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "manifest-src 'none'",
].join("; ");

/** Source of messages the editor sends to live frames. */
export const PREVIEW_HOST_SOURCE = "hanogt-preview-host";

export interface LivePreviewLabels {
    /** "The diagram could not be drawn" / "The formula could not be rendered" */
    error: string;
    /** "line {line}" */
    line: string;
    /** "Nothing to show yet." */
    empty: string;
    /** "Not supported in the preview: {list}" */
    unsupported: string;
    /** "Warnings" (ABC notation, AsciiDoc) */
    warnings?: string;
    /** GLSL controls and the message shown without WebGL. */
    pause?: string;
    play?: string;
    noWebgl?: string;
}

export type LivePreviewPayload =
    | { kind: "mermaid"; code: string }
    | { kind: "latex"; html: string; macros: Record<string, string>; warnings: string[] }
    | { kind: "dot" | "abc" | "asciidoc" | "glsl"; code: string };

const LIVE_STYLE = `
:root { color-scheme: light; --fg: #1f2328; --muted: #59636e; --bg: #ffffff; --soft: #f6f8fa; --border: #d1d9e0; --error: #b91c1c; --error-bg: #fef2f2; --link: #0969da; }
:root[data-theme="dark"] { color-scheme: dark; --fg: #e6edf3; --muted: #9198a1; --bg: #0d1117; --soft: #151b23; --border: #3d444d; --error: #f87171; --error-bg: #2a1215; --link: #4493f8; }
html { background: var(--bg); }
body { margin: 0; color: var(--fg); background: var(--bg); font: 16px/1.6 system-ui, -apple-system, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif; overflow-wrap: break-word; counter-reset: katexEqnNo mmlEqnNo; }
.hanogt-error { margin: 16px; padding: 12px 14px; border: 1px solid var(--error); border-radius: 10px; background: var(--error-bg); color: var(--error); white-space: pre-wrap; font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.hanogt-empty { margin: 24px; color: var(--muted); font-style: italic; }
.hanogt-note { margin: 24px 0 0; padding-top: 8px; border-top: 1px solid var(--border); color: var(--muted); font-size: 12px; }
`;

const MERMAID_STYLE = `
#out { display: flex; justify-content: center; padding: 16px; }
#out svg { max-width: 100%; height: auto; }
`;

const LATEX_STYLE = `
#out { max-width: 860px; margin: 0 auto; padding: 24px 28px 48px; }
h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 24px 0 12px; font-weight: 600; }
h1 { font-size: 1.9em; } h2 { font-size: 1.5em; } h3 { font-size: 1.25em; } h4 { font-size: 1.05em; }
.secnum { color: var(--muted); margin-right: .35em; }
.title-block { text-align: center; margin: 8px 0 32px; } .title-block .title { font-size: 2em; margin: 0 0 8px; } .author, .date { margin: 4px 0; color: var(--muted); }
p { margin: 0 0 14px; } .math-block { margin: 14px 0; overflow-x: auto; overflow-y: hidden; }
.hanogt-math.math-error { color: var(--error); background: var(--error-bg); border-radius: 4px; padding: 0 3px; font: 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre-wrap; }
.math-block .math-error { display: block; padding: 8px 10px; }
blockquote { margin: 0 0 14px; padding: 0 1em; color: var(--muted); border-left: .25em solid var(--border); }
pre { background: var(--soft); border-radius: 8px; padding: 12px 14px; overflow: auto; } code { font: .9em ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
table.tabular { border-collapse: collapse; margin: 0 auto 14px; } table.tabular td { padding: 4px 10px; } table.ruled td { border: 1px solid var(--border); }
.center { text-align: center; } .flushright { text-align: right; }
.abstract { margin: 0 auto 24px; max-width: 640px; font-size: .95em; } .abstract h3 { text-align: center; font-size: 1em; }
.theorem, .proof { margin: 0 0 14px; } .theorem > p:first-of-type, .proof > p:first-of-type { display: inline; } .qed { float: right; }
.toc ul { list-style: none; padding-left: 0; } .toc .toc-3 { padding-left: 1.5em; } .toc a, .fn a, .footnotes a { color: var(--link); text-decoration: none; }
.footnotes { margin-top: 32px; padding-top: 8px; border-top: 1px solid var(--border); font-size: .9em; }
.sc { font-variant: small-caps; } .sf { font-family: system-ui, sans-serif; } .fbox { border: 1px solid currentColor; padding: 0 3px; }
.size-large { font-size: 1.2em; } .size-Large { font-size: 1.44em; } .size-LARGE { font-size: 1.73em; } .size-huge { font-size: 2.07em; } .size-small { font-size: .9em; } .size-tiny { font-size: .7em; }
.link { color: var(--link); text-decoration: underline dotted; cursor: help; } .ref { color: var(--link); }
.image-placeholder { display: inline-block; padding: 24px; border: 1px dashed var(--border); border-radius: 8px; color: var(--muted); }
figure { margin: 0 0 14px; text-align: center; } figcaption { color: var(--muted); font-size: .9em; }
.latex-a { font-size: .75em; vertical-align: .25em; margin-left: -.36em; margin-right: -.15em; } .latex-e { vertical-align: -.5ex; margin-left: -.1667em; margin-right: -.125em; text-transform: uppercase; }
dt { font-weight: 600; } dd { margin: 0 0 8px 1.5em; } li.custom-label { list-style: none; } li.custom-label .item-label { margin-left: -1.2em; margin-right: .3em; font-weight: 600; }
`;

/**
 * The bootstrap of a live frame: it waits for {source: PREVIEW_HOST_SOURCE, token,
 * type: "render", payload} messages from the parent window and renders them.
 * Kept free of template literals and line breaks so it can be embedded as-is.
 */
function liveBootstrap(kind: LivePreviewKind, token: string, dark: boolean, labels: LivePreviewLabels) {
    const json = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    const common = `var T=${json(token)},S=${json(PREVIEW_MESSAGE_SOURCE)},H=${json(PREVIEW_HOST_SOURCE)},L=${json(labels)},P=window.parent,out=document.getElementById('out'),seq=0;`
        + "function post(type){try{P.postMessage({source:S,token:T,type:type},'*')}catch(e){}}"
        + "function box(text,cls){var d=document.createElement('div');d.className=cls;d.textContent=text;return d}"
        + "function lineOf(message){var m=/line (\\d+)/i.exec(String(message||''));return m?Number(m[1]):0}";
    const render = kind === "mermaid"
        ? `mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:${json(dark ? "dark" : "default")},suppressErrorRendering:true,fontFamily:'system-ui, -apple-system, "Segoe UI", sans-serif'});`
            + "function render(p){var id=++seq,code=String(p&&p.code||'');if(!code.trim()){out.replaceChildren(box(L.empty,'hanogt-empty'));return}"
            + "mermaid.render('hanogt-diagram-'+id,code).then(function(r){if(id!==seq)return;out.innerHTML=r.svg;if(r.bindFunctions)r.bindFunctions(out)},"
            + "function(e){if(id!==seq)return;var stray=document.getElementById('dhanogt-diagram-'+id);if(stray)stray.remove();var msg=(e&&e.message)?e.message:String(e),n=Math.min(lineOf(msg),code.split('\\n').length);"
            + "out.replaceChildren(box(L.error+(n?' ('+L.line.replace('{line}',n)+')':'')+'\\n\\n'+msg,'hanogt-error'))})}"
        : "var macros={};"
            + "function render(p){seq++;out.innerHTML=String(p&&p.html||'');macros={};var m=p&&p.macros||{};for(var k in m)if(Object.prototype.hasOwnProperty.call(m,k))macros[k]=m[k];"
            + "if(!out.textContent.trim()&&!out.querySelector('.hanogt-math')){out.replaceChildren(box(L.empty,'hanogt-empty'));return}"
            + "var nodes=out.querySelectorAll('.hanogt-math');for(var i=0;i<nodes.length;i++){var el=nodes[i],tex=el.textContent,display=el.getAttribute('data-display')==='1',start=Number(el.getAttribute('data-line'))||0;"
            + "try{katex.render(tex,el,{displayMode:display,throwOnError:true,trust:false,strict:'ignore',macros:macros,globalGroup:true,output:'htmlAndMathml'})}"
            + "catch(e){var msg=(e&&e.message)?e.message:String(e),pos=typeof e.position==='number'?e.position:-1,n=start+(pos>0?tex.slice(0,pos).split('\\n').length-1:0);"
            + "el.className='hanogt-math math-error';el.textContent=tex+'  \\u26a0 '+msg.replace(/^KaTeX parse error: /,'');el.title=L.error+' ('+L.line.replace('{line}',n)+')'}}"
            + "if(p&&p.warnings&&p.warnings.length)out.appendChild(box(L.unsupported.replace('{list}',p.warnings.slice(0,12).join(', ')),'hanogt-note'))}";
    return `<script>(function(){${common}${render}`
        + "window.addEventListener('message',function(e){if(e.source!==P)return;var d=e.data;if(!d||d.source!==H||d.token!==T||d.type!=='render')return;try{render(d.payload)}catch(err){out.replaceChildren(box(L.error+'\\n\\n'+(err&&err.message||err),'hanogt-error'))}});"
        + "post('ready')})();</script>";
}

/**
 * A long-lived preview frame. `library` is the library's JavaScript
 * (mermaid.min.js, katex.min.js, graphviz.js, abcjs or asciidoctor.js; GLSL
 * needs none) and `css` extra CSS (KaTeX's, with embedded fonts); both are
 * inlined because the frame cannot fetch. Frames other than Mermaid and
 * LaTeX run only scripts that carry `nonce` (a fresh random one by default).
 */
export function buildLiveShell(kind: LivePreviewKind, options: { token: string; dark?: boolean; library: string; css?: string; labels: LivePreviewLabels; nonce?: string }): string {
    const dark = Boolean(options.dark);
    if (kind !== "mermaid" && kind !== "latex") return buildStrictShell(kind, { ...options, dark, nonce: options.nonce ?? createPreviewToken() });
    const style = `${LIVE_STYLE}${kind === "mermaid" ? MERMAID_STYLE : LATEX_STYLE}`;
    return `<!DOCTYPE html><html${dark ? " data-theme=\"dark\"" : ""}><head><meta http-equiv="Content-Security-Policy" content="${LIVE_PREVIEW_CSP}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">`
        + `${options.css ? `<style>${protect(options.css, "style")}</style>` : ""}<style>${style}</style></head><body><main id="out" aria-live="polite"></main>`
        + `<script>${protect(options.library, "script")}</script>${liveBootstrap(kind, options.token, dark, options.labels)}</body></html>`;
}

// ------------------------------------------------------------------ live frames (DOT, ABC, AsciiDoc, GLSL)
type StrictKind = Exclude<LivePreviewKind, "mermaid" | "latex">;

/**
 * Policy of the newer live frames: only scripts with the frame's nonce run, so
 * neither inline event handlers nor javascript: links in rendered markup can.
 * Graphviz compiles WebAssembly ('unsafe-eval'); AsciiDoc documents may show
 * images over https, like Markdown.
 */
export function strictPreviewCsp(kind: StrictKind, nonce: string): string {
    return [
        "default-src 'none'",
        `script-src 'nonce-${nonce}'${kind === "dot" ? " 'unsafe-eval'" : ""}`,
        "style-src 'unsafe-inline'",
        `img-src data: blob:${kind === "asciidoc" ? " https:" : ""}`,
        "font-src data:",
        "connect-src 'none'",
        "form-action 'none'",
        "base-uri 'none'",
        "frame-src 'none'",
        "worker-src 'none'",
        "manifest-src 'none'",
    ].join("; ");
}

const PAPER_STYLE = `
#out { padding: 16px; }
.paper { box-sizing: border-box; background: #ffffff; color: #111827; border-radius: 10px; padding: 12px; box-shadow: 0 1px 2px rgba(0, 0, 0, .08); overflow: auto; }
:root[data-theme="dark"] .paper { box-shadow: none; }
.paper + .paper { margin-top: 16px; }
.paper svg { display: block; max-width: 100%; height: auto; margin: 0 auto; }
.hanogt-note { margin: 16px 0 0; white-space: pre-wrap; }
`;

const ASCIIDOC_STYLE = `
#out { max-width: 860px; margin: 0 auto; padding: 24px 28px 48px; overflow-wrap: break-word; }
h1, h2, h3, h4, h5, h6 { margin: 24px 0 12px; font-weight: 600; line-height: 1.25; }
h1 { font-size: 2em; padding-bottom: .3em; border-bottom: 1px solid var(--border); }
h2 { font-size: 1.5em; padding-bottom: .3em; border-bottom: 1px solid var(--border); }
h3 { font-size: 1.25em; } h4 { font-size: 1em; } h5 { font-size: .875em; } h6 { font-size: .85em; color: var(--muted); }
p, ul, ol, dl, blockquote, table, pre { margin: 0 0 16px; } li > p { margin: 0 0 4px; }
a { color: var(--link); text-decoration: none; } a:hover { text-decoration: underline; }
code { font: .875em/1.5 ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace; background: var(--soft); border-radius: 6px; padding: .2em .4em; }
pre { background: var(--soft); border-radius: 8px; padding: 16px; overflow: auto; } pre code { background: none; padding: 0; font-size: .85em; }
.title { font-weight: 600; margin: 0 0 6px; color: var(--muted); }
.paragraph, .ulist, .olist, .dlist, .listingblock, .literalblock, .imageblock, .quoteblock, .verseblock, .exampleblock, .sidebarblock, .admonitionblock, .tableblock { margin: 0 0 16px; }
.quoteblock blockquote, .verseblock pre { margin: 0; padding: 0 1em; color: var(--muted); border-left: .25em solid var(--border); background: none; }
.quoteblock .attribution, .verseblock .attribution { color: var(--muted); font-size: .9em; margin-top: 4px; }
.exampleblock > .content { border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px; }
.sidebarblock { background: var(--soft); border-radius: 8px; padding: 12px 16px; }
.admonitionblock > table { border-collapse: collapse; width: 100%; border: 0; display: table; }
.admonitionblock td { border: 0; padding: 8px 12px; vertical-align: top; }
.admonitionblock td.icon { width: 1%; white-space: nowrap; font-weight: 700; border-right: 3px solid var(--link); }
.admonitionblock.tip td.icon { border-color: #16a34a; } .admonitionblock.warning td.icon, .admonitionblock.caution td.icon { border-color: #d97706; } .admonitionblock.important td.icon { border-color: #dc2626; }
.admonitionblock td.icon .title { color: var(--fg); margin: 0; text-transform: uppercase; font-size: .8em; letter-spacing: .04em; }
table.tableblock { border-collapse: collapse; display: block; overflow: auto; }
table.tableblock th, table.tableblock td { padding: 6px 13px; border: 1px solid var(--border); } table.tableblock p { margin: 0; }
img { max-width: 100%; border-radius: 6px; }
#toc { margin: 0 0 24px; padding: 12px 16px; border: 1px solid var(--border); border-radius: 8px; } #toctitle { font-weight: 600; margin-bottom: 6px; }
#toc ul { list-style: none; padding-left: 1em; margin: 0; } #toc > ul { padding-left: 0; }
.checklist { list-style: none; padding-left: 1.25em; } .conum { font-weight: 700; color: var(--link); }
.footnotes { margin-top: 32px; padding-top: 8px; border-top: 1px solid var(--border); font-size: .9em; }
kbd { font: 11px ui-monospace, monospace; padding: 3px 5px; border: 1px solid var(--border); border-bottom-width: 2px; border-radius: 6px; background: var(--soft); }
mark { background: #fde68a; color: #111827; } hr { height: .25em; padding: 0; margin: 24px 0; background: var(--border); border: 0; }
`;

const GLSL_STYLE = `
html, body { height: 100%; }
body { display: flex; flex-direction: column; }
#out:empty { display: none; }
.stage { position: relative; flex: 1; min-height: 160px; }
canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; background: #000; touch-action: none; }
.bar { display: flex; align-items: center; gap: 12px; padding: 6px 10px; border-top: 1px solid var(--border); font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--muted); }
.bar button { font: 600 12px system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--fg); background: var(--soft); border: 1px solid var(--border); border-radius: 8px; padding: 4px 12px; cursor: pointer; }
.bar button:focus-visible { outline: 2px solid var(--link); outline-offset: 2px; }
`;

const STRICT_STYLES: Record<StrictKind, string> = { dot: PAPER_STYLE, abc: PAPER_STYLE, asciidoc: ASCIIDOC_STYLE, glsl: GLSL_STYLE };

/** Keeps only inert markup: no scripts, frames, forms, meta refreshes, event handlers or script URLs. */
const SANITIZE = String.raw`
function clean(root){
  var bad=root.querySelectorAll('script,iframe,frame,frameset,object,embed,applet,meta,base,link,form,portal');
  for(var i=0;i<bad.length;i++){bad[i].remove();}
  var all=root.querySelectorAll('*');
  for(var j=0;j<all.length;j++){
    var el=all[j],at=el.attributes;
    for(var k=at.length-1;k>=0;k--){
      var n=at[k].name.toLowerCase(),v=at[k].value;
      if(n.indexOf('on')===0||((n==='href'||n==='src'||n==='xlink:href'||n==='action'||n==='formaction'||n==='srcdoc')&&/^\s*(javascript|vbscript|data:text)/i.test(v))){el.removeAttribute(at[k].name);}
    }
  }
}
function show(html){var tpl=document.createElement('template');tpl.innerHTML=html;clean(tpl.content);return tpl.content;}
function links(external){
  document.addEventListener('click',function(e){
    var a=e.target&&e.target.closest?e.target.closest('a'):null;if(!a)return;
    var h=a.getAttribute('href')||a.getAttributeNS('http://www.w3.org/1999/xlink','href')||'';
    if(h.charAt(0)==='#'){e.preventDefault();var t=document.getElementById(decodeURIComponent(h.slice(1)));if(t)t.scrollIntoView();return;}
    if(external&&/^https?:\/\//i.test(h)){a.setAttribute('target','_blank');a.setAttribute('rel','noopener noreferrer');return;}
    e.preventDefault();
  });
}
`;

const STRICT_RENDERERS: Record<StrictKind, string> = {
    // Graphviz: the layout engine comes from a layout=… attribute (dot by default).
    dot: String.raw`
links(false);
function engineOf(code){var m=/\blayout\s*=\s*"?(dot|neato|fdp|sfdp|circo|twopi|osage|patchwork)\b/.exec(code);return m?m[1]:'dot';}
function render(p){
  var id=++seq,code=String(p&&p.code||'');
  if(!code.trim()){out.replaceChildren(box(L.empty,'hanogt-empty'));return;}
  HanogtGraphviz.Graphviz.load().then(function(g){
    if(id!==seq)return;
    var svg;
    try{svg=g.layout(code,'svg',engineOf(code));}
    catch(e){var msg=(e&&e.message)?e.message:String(e),n=Math.min(lineOf(msg),code.split('\n').length);out.replaceChildren(box(L.error+(n?' ('+L.line.replace('{line}',n)+')':'')+'\n\n'+msg,'hanogt-error'));return;}
    var paper=document.createElement('div');paper.className='paper';
    var at=svg.indexOf('<svg');paper.appendChild(show(at>=0?svg.slice(at):svg));
    out.replaceChildren(paper);
  },function(e){if(id!==seq)return;out.replaceChildren(box(L.error+'\n\n'+((e&&e.message)||e),'hanogt-error'));});
}
`,
    // abcjs: every tune (X: header) gets its own sheet; parser warnings are listed below.
    abc: String.raw`
links(false);
function text(html){return new DOMParser().parseFromString(String(html),'text/html').body.textContent||'';}
function render(p){
  seq++;var code=String(p&&p.code||'');
  if(!code.trim()){out.replaceChildren(box(L.empty,'hanogt-empty'));return;}
  var count=Math.max(1,Math.min(50,ABCJS.numberOfTunes(code)||1)),targets=[];
  out.replaceChildren();
  for(var i=0;i<count;i++){var d=document.createElement('div');d.className='paper';out.appendChild(d);targets.push(d);}
  var tunes=ABCJS.renderAbc(targets,code,{responsive:'resize',add_classes:true,foregroundColor:'#111827'})||[],warnings=[];
  for(var t=0;t<tunes.length;t++){var w=tunes[t].warnings||[];for(var k=0;k<w.length&&warnings.length<20;k++){warnings.push(text(w[k]));}}
  if(warnings.length){out.appendChild(box(L.warnings+'\n'+warnings.join('\n'),'hanogt-note'));}
}
`,
    // Asciidoctor in secure mode (no includes); its log becomes a list of warnings with line numbers.
    asciidoc: String.raw`
links(true);
var A=HanogtAsciidoctor,logger=A.MemoryLogger.create();A.LoggerManager.setLogger(logger);
function render(p){
  var id=++seq,code=String(p&&p.code||'');
  if(!code.trim()){out.replaceChildren(box(L.empty,'hanogt-empty'));return;}
  logger.clear();
  A.convert(code,{safe:'secure',standalone:false,attributes:{showtitle:''}}).then(function(html){
    if(id!==seq)return;
    out.replaceChildren(show(String(html)));
    var m=logger.getMessages(),w=[];
    for(var i=0;i<m.length&&w.length<20;i++){var loc=m[i].getSourceLocation(),n=loc&&loc.getLineNumber?loc.getLineNumber():0;w.push((n?L.line.replace('{line}',n)+': ':'')+m[i].getText());}
    if(w.length){out.appendChild(box(L.warnings+'\n'+w.join('\n'),'hanogt-note'));}
  },function(e){if(id!==seq)return;out.replaceChildren(box(L.error+'\n\n'+((e&&e.message)||e),'hanogt-error'));});
}
`,
    // WebGL fragment shaders: Shadertoy-style mainImage(out vec4, in vec2) or a complete shader with main().
    glsl: String.raw`
var stage=document.createElement('div'),canvas=document.createElement('canvas'),bar=document.createElement('div'),button=document.createElement('button'),clock=document.createElement('span');
stage.className='stage';bar.className='bar';button.type='button';stage.appendChild(canvas);bar.appendChild(button);bar.appendChild(clock);
document.body.appendChild(stage);document.body.appendChild(bar);
var gl=canvas.getContext('webgl2',{alpha:false,antialias:false}),gl2=true;
if(!gl){gl=canvas.getContext('webgl',{alpha:false,antialias:false})||canvas.getContext('experimental-webgl');gl2=false;}
var reduce=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
var program=null,uniforms={},paused=reduce,elapsed=0,last=0,frame=0,raf=0,mouse=[0,0,0,0],down=false;
function label(){button.textContent=paused?L.play:L.pause;button.setAttribute('aria-pressed',paused?'true':'false');}
function tick(){clock.textContent='iTime '+(elapsed/1000).toFixed(2)+' s';}
function resize(){var r=Math.min(window.devicePixelRatio||1,2),w=Math.max(1,Math.round(canvas.clientWidth*r)),h=Math.max(1,Math.round(canvas.clientHeight*r));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}}
function compile(type,source){var s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){var log=gl.getShaderInfoLog(s)||'';gl.deleteShader(s);throw {log:log};}return s;}
function describe(log,offset,total){
  var lines=String(log).split('\n'),found=[],first=0;
  for(var i=0;i<lines.length;i++){
    var t=lines[i].replace(/\u0000/g,'').trim();if(!t)continue;
    var m=/^(?:ERROR|WARNING):\s*\d+:(\d+):\s*(.*)$/.exec(t);
    if(m){var n=Number(m[1])-offset;if(n<1||n>total){found.push(m[2]);continue;}if(!first)first=n;found.push(L.line.replace('{line}',n)+': '+m[2]);}
    else if(!/compilation errors?\.\s*No code generated/i.test(t))found.push(t);
  }
  return {first:first,text:found.join('\n')};
}
function build(code){
  var total=code.split('\n').length,toy=/\bmainImage\s*\(/.test(code)&&!/\bvoid\s+main\s*\(\s*(void)?\s*\)/.test(code),es3=/^\s*#version\s+300\s+es\b/m.test(code),offset=0,fragment;
  if(toy){
    var u='uniform vec3 iResolution;\nuniform float iTime;\nuniform float iTimeDelta;\nuniform int iFrame;\nuniform vec4 iMouse;\nuniform vec4 iDate;\n',header;
    if(gl2){header='#version 300 es\nprecision highp float;\nprecision highp int;\n'+u+'out vec4 hanogtFragColor;\n';fragment=header+code+'\nvoid main(){vec4 c=vec4(0.0,0.0,0.0,1.0);mainImage(c,gl_FragCoord.xy);hanogtFragColor=c;}';}
    else{header='precision highp float;\n'+u;fragment=header+code+'\nvoid main(){vec4 c=vec4(0.0,0.0,0.0,1.0);mainImage(c,gl_FragCoord.xy);gl_FragColor=c;}';}
    offset=header.split('\n').length-1;es3=gl2;
  }else if(/\bprecision\s+(lowp|mediump|highp)\s+float\b/.test(code)){fragment=code;}
  else if(es3){
    var v=/^\s*#version\s+300\s+es\b[^\n]*\n/m.exec(code),cut=v?v.index+v[0].length:0;
    fragment=code.slice(0,cut)+'precision highp float;\n'+code.slice(cut);offset=-1;
  }else{fragment='precision highp float;\n'+code;offset=1;}
  var vertex=es3?'#version 300 es\nin vec2 hanogtPosition;\nvoid main(){gl_Position=vec4(hanogtPosition,0.0,1.0);}':'attribute vec2 hanogtPosition;\nvoid main(){gl_Position=vec4(hanogtPosition,0.0,1.0);}';
  var versionLine=es3&&offset===-1?code.slice(0,code.search(/#version/)).split('\n').length:0;
  var vs=compile(gl.VERTEX_SHADER,vertex),fs;
  try{fs=compile(gl.FRAGMENT_SHADER,fragment);}
  catch(e){gl.deleteShader(vs);var d=offset===-1?describeAfter(e.log,versionLine,total):describe(e.log,offset,total);throw {line:d.first,text:d.text};}
  var p=gl.createProgram();gl.attachShader(p,vs);gl.attachShader(p,fs);gl.bindAttribLocation(p,0,'hanogtPosition');gl.linkProgram(p);gl.deleteShader(vs);gl.deleteShader(fs);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS)){var log=gl.getProgramInfoLog(p)||'';gl.deleteProgram(p);throw {line:0,text:log};}
  return p;
}
function describeAfter(log,versionLine,total){
  var shifted=String(log).replace(/^((?:ERROR|WARNING):\s*\d+:)(\d+)/gm,function(all,head,n){n=Number(n);return head+(n>versionLine?n-1:n);});
  return describe(shifted,0,total);
}
function draw(){
  if(!gl||!program)return;resize();gl.viewport(0,0,canvas.width,canvas.height);gl.useProgram(program);
  var u=uniforms,now=new Date();
  if(u.iResolution)gl.uniform3f(u.iResolution,canvas.width,canvas.height,1);
  if(u.iTime)gl.uniform1f(u.iTime,elapsed/1000);
  if(u.iTimeDelta)gl.uniform1f(u.iTimeDelta,1/60);
  if(u.iFrame)gl.uniform1i(u.iFrame,frame);
  if(u.iMouse)gl.uniform4f(u.iMouse,mouse[0],mouse[1],mouse[2],mouse[3]);
  if(u.iDate)gl.uniform4f(u.iDate,now.getFullYear(),now.getMonth(),now.getDate(),now.getHours()*3600+now.getMinutes()*60+now.getSeconds());
  if(u.u_resolution)gl.uniform2f(u.u_resolution,canvas.width,canvas.height);
  if(u.u_time)gl.uniform1f(u.u_time,elapsed/1000);
  if(u.u_mouse)gl.uniform2f(u.u_mouse,mouse[0],mouse[1]);
  gl.drawArrays(gl.TRIANGLES,0,3);frame++;tick();
}
function loop(now){raf=0;if(paused)return;if(last)elapsed+=Math.min(250,now-last);last=now;draw();raf=requestAnimationFrame(loop);}
function start(){if(!raf&&!paused){last=0;raf=requestAnimationFrame(loop);}}
function stop(){if(raf){cancelAnimationFrame(raf);raf=0;}}
button.addEventListener('click',function(){paused=!paused;label();if(paused){stop();draw();}else{start();}});
function point(e){var r=canvas.getBoundingClientRect(),s=canvas.width/Math.max(1,r.width);return [(e.clientX-r.left)*s,(r.bottom-e.clientY)*s];}
canvas.addEventListener('pointerdown',function(e){down=true;var q=point(e);mouse=[q[0],q[1],q[0],q[1]];if(canvas.setPointerCapture)canvas.setPointerCapture(e.pointerId);if(paused)draw();});
canvas.addEventListener('pointermove',function(e){if(!down)return;var q=point(e);mouse[0]=q[0];mouse[1]=q[1];if(paused)draw();});
canvas.addEventListener('pointerup',function(){down=false;mouse[2]=-Math.abs(mouse[2]);mouse[3]=-Math.abs(mouse[3]);if(paused)draw();});
if(window.ResizeObserver){new ResizeObserver(function(){if(paused)draw();}).observe(canvas);}
if(gl){var buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);}
label();tick();
function render(p){
  seq++;var code=String(p&&p.code||'');
  if(!gl){out.replaceChildren(box(L.noWebgl,'hanogt-error'));return;}
  if(!code.trim()){stop();if(program){gl.deleteProgram(program);program=null;}out.replaceChildren(box(L.empty,'hanogt-empty'));return;}
  var next;
  try{next=build(code);}
  catch(e){stop();if(program){gl.deleteProgram(program);program=null;}out.replaceChildren(box(L.error+(e&&e.line?' ('+L.line.replace('{line}',e.line)+')':'')+'\n\n'+((e&&e.text)||String(e)),'hanogt-error'));return;}
  if(program){gl.deleteProgram(program);}
  program=next;uniforms={};
  var names=['iResolution','iTime','iTimeDelta','iFrame','iMouse','iDate','u_resolution','u_time','u_mouse'];
  for(var i=0;i<names.length;i++){var loc=gl.getUniformLocation(program,names[i]);if(loc){uniforms[names[i]]=loc;}}
  out.replaceChildren();draw();start();
}
`,
};

/** The bootstrap of a strict live frame: the shared helpers, the kind's renderer and the message listener. */
function strictBootstrap(kind: StrictKind, token: string, labels: LivePreviewLabels) {
    const json = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    const common = `var T=${json(token)},S=${json(PREVIEW_MESSAGE_SOURCE)},H=${json(PREVIEW_HOST_SOURCE)},L=${json(labels)},P=window.parent,out=document.getElementById('out'),seq=0;`
        + "function post(type){try{P.postMessage({source:S,token:T,type:type},'*')}catch(e){}}"
        + "function box(text,cls){var d=document.createElement('div');d.className=cls;d.textContent=text;return d}"
        + "function lineOf(message){var m=/line (\\d+)/i.exec(String(message||''));return m?Number(m[1]):0}";
    // Indentation and line breaks are layout only (every statement ends with ; or }).
    const body = (SANITIZE + STRICT_RENDERERS[kind]).replace(/\n\s*/g, "");
    return `(function(){${common}${body}`
        + "window.addEventListener('message',function(e){if(e.source!==P)return;var d=e.data;if(!d||d.source!==H||d.token!==T||d.type!=='render')return;try{render(d.payload)}catch(err){out.replaceChildren(box(L.error+'\\n\\n'+(err&&err.message||err),'hanogt-error'))}});"
        + "post('ready')})();";
}

function buildStrictShell(kind: StrictKind, options: { token: string; dark: boolean; library: string; css?: string; labels: LivePreviewLabels; nonce: string }): string {
    const nonce = options.nonce.replace(/[^A-Za-z0-9+/=_-]/g, "");
    const library = options.library ? `<script nonce="${nonce}">${protect(options.library, "script")}</script>` : "";
    return `<!DOCTYPE html><html${options.dark ? " data-theme=\"dark\"" : ""}><head><meta http-equiv="Content-Security-Policy" content="${strictPreviewCsp(kind, nonce)}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">`
        + `${options.css ? `<style>${protect(options.css, "style")}</style>` : ""}<style>${LIVE_STYLE}${STRICT_STYLES[kind]}</style></head><body><main id="out" aria-live="polite"></main>`
        + `${library}<script nonce="${nonce}">${protect(strictBootstrap(kind, options.token, options.labels), "script")}</script></body></html>`;
}

// ------------------------------------------------------------------ Logo
export interface LogoPreviewLabels {
    /** "Output" */
    output: string;
    /** "The program stopped with an error" */
    error: string;
    /** "line {line}, column {column}" */
    location: string;
    /** "Lines: {lines} · Steps: {steps}" */
    stats: string;
    /** "The turtle's drawing" (the SVG's accessible name) */
    drawing: string;
}

const LOGO_STYLE = `
:root { color-scheme: light; --fg: #27272a; --muted: #71717a; --bg: #f4f4f5; --border: #e4e4e7; --soft: #ffffff; --error: #b91c1c; --error-bg: #fef2f2; }
:root[data-theme="dark"] { color-scheme: dark; --fg: #e4e4e7; --muted: #a1a1aa; --bg: #18181b; --border: #3f3f46; --soft: #27272a; --error: #f87171; --error-bg: #2a1215; }
html, body { margin: 0; min-height: 100%; background: var(--bg); color: var(--fg); font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { padding: 16px; display: grid; gap: 12px; }
.paper { border-radius: 10px; overflow: hidden; box-shadow: 0 1px 2px rgba(0, 0, 0, .08); }
.paper svg { display: block; width: 100%; height: auto; max-height: calc(100vh - 32px); }
h2 { margin: 0 0 4px; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); }
pre { margin: 0; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--soft); white-space: pre-wrap; overflow-wrap: anywhere; font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.error { padding: 12px 14px; border: 1px solid var(--error); border-radius: 10px; background: var(--error-bg); color: var(--error); }
.error pre { margin-top: 8px; border: 0; padding: 0; background: none; color: var(--fg); }
footer { color: var(--muted); font-size: 12px; }
`;

/**
 * A static (script-free) page with a Logo program's drawing (`svg`, from
 * renderLogoSvg; the interpreter is loaded only when a Logo file is
 * previewed), its printed text and its error.
 */
export function buildLogoDocument(result: LogoResult, source: string, options: { dark?: boolean; labels: LogoPreviewLabels; svg: string }): string {
    const { labels, svg } = options;
    const output = result.output ? `<section><h2>${escapeText(labels.output)}</h2><pre>${escapeText(result.output.replace(/\n$/, ""))}</pre></section>` : "";
    let error = "";
    if (result.error) {
        const { line, column } = result.error;
        const where = line ? ` (${escapeText(labels.location.replace("{line}", String(line)).replace("{column}", String(column ?? 1)))})` : "";
        const frame = line ? `<pre>${escapeText(source.split("\n")[line - 1] ?? "")}\n${" ".repeat(Math.max(0, (column ?? 1) - 1))}^</pre>` : "";
        error = `<div class="error" role="alert"><strong>${escapeText(labels.error)}</strong>${where}<br>${escapeText(result.error.message)}${frame}</div>`;
    }
    const stats = escapeText(labels.stats.replace("{lines}", String(result.segments.length)).replace("{steps}", String(result.steps)));
    return `<!DOCTYPE html><html${options.dark ? " data-theme=\"dark\"" : ""}><head><meta http-equiv="Content-Security-Policy" content="${STATIC_PREVIEW_CSP}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${LOGO_STYLE}</style></head><body>`
        + `<main>${error}<div class="paper" style="background:${/^#[0-9A-F]{6}$/i.test(result.background) ? result.background : "#FFFFFF"}">${svg}</div>${output}<footer>${stats}</footer></main></body></html>`;
}
