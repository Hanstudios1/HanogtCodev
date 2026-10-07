/**
 * Emmet abbreviations for the code editors (emmet-monaco-es): "ul>li*3" in
 * HTML, "m10" in CSS/SCSS/Less and "div.box" in JSX/TSX files show their
 * expansion in the suggestion list (Tab or Enter inserts it).
 *
 * Monaco's completion providers are global, so they are registered once
 * while at least one editor wants Emmet (the "emmet" editor setting) and
 * removed when the last one stops. The plugin loads on first use.
 */
import type { editor, languages } from "monaco-editor";
import type { MonacoApi } from "@/lib/monaco";

export const EMMET_HTML_LANGUAGES = ["html"] as const;
export const EMMET_CSS_LANGUAGES = ["css", "scss", "less"] as const;
/** JSX lives in the JavaScript and TypeScript grammars; only .jsx/.tsx files get Emmet. */
export const EMMET_JSX_LANGUAGES = ["javascript", "typescript"] as const;

/** True for models of .jsx and .tsx files (plain .js/.ts files keep their usual suggestions). */
export function isJsxModelPath(path: string): boolean {
    return /\.(jsx|tsx)$/i.test(path);
}

type TokenizedModel = editor.ITextModel & { tokenization?: { forceTokenization?: (lineNumber: number) => void } };

/**
 * The Monaco API as emmet-monaco-es sees it: every completion provider it
 * registers first tokenizes the model up to the cursor (the plugin reads the
 * tokenizer state of the line, which Monaco 0.57 computes lazily) and never
 * lets an error escape; with `jsxOnly` the providers only answer in JSX/TSX
 * models (emmetJSX registers for the whole JavaScript/TypeScript languages).
 */
function guardedMonaco(monaco: MonacoApi, jsxOnly: boolean): MonacoApi {
    const register = (language: languages.LanguageSelector, provider: languages.CompletionItemProvider) => monaco.languages.registerCompletionItemProvider(language, {
        ...provider,
        triggerCharacters: provider.triggerCharacters,
        provideCompletionItems: (model: editor.ITextModel, position, context, token) => {
            if (jsxOnly && !isJsxModelPath(model.uri.path)) return undefined;
            try {
                (model as TokenizedModel).tokenization?.forceTokenization?.(position.lineNumber);
                return provider.provideCompletionItems(model, position, context, token);
            } catch {
                return undefined;
            }
        },
    });
    const languagesApi = Object.create(monaco.languages, { registerCompletionItemProvider: { value: register } }) as MonacoApi["languages"];
    return Object.create(monaco, { languages: { value: languagesApi } }) as MonacoApi;
}

type Registration = { monaco: MonacoApi; users: number; dispose: (() => void) | null; loading: boolean };
let registration: Registration | null = null;

/** Registers Emmet for one more editor; call the returned function when that editor no longer wants it. */
export function retainEmmet(monaco: MonacoApi): () => void {
    if (!registration || registration.monaco !== monaco) {
        registration?.dispose?.();
        registration = { monaco, users: 0, dispose: null, loading: false };
    }
    const current = registration;
    current.users += 1;
    if (current.users === 1 && !current.dispose && !current.loading) {
        current.loading = true;
        void import("emmet-monaco-es")
            .then(({ emmetCSS, emmetHTML, emmetJSX }) => {
                current.loading = false;
                if (registration !== current || current.users === 0 || current.dispose) return;
                const disposers = [
                    emmetHTML(guardedMonaco(monaco, false), [...EMMET_HTML_LANGUAGES]),
                    emmetCSS(guardedMonaco(monaco, false), [...EMMET_CSS_LANGUAGES]),
                    emmetJSX(guardedMonaco(monaco, true), [...EMMET_JSX_LANGUAGES]),
                ];
                current.dispose = () => disposers.forEach((dispose) => dispose());
            })
            .catch(() => {
                // Without the plugin the editor works as before.
                current.loading = false;
            });
    }
    let released = false;
    return () => {
        if (released) return;
        released = true;
        current.users -= 1;
        if (current.users > 0 || registration !== current) return;
        current.dispose?.();
        current.dispose = null;
    };
}
