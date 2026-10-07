declare module "sql.js/dist/sql-wasm-browser.js" {
    type SqlDatabase = {
        exec: (sql: string) => Array<{ columns: string[]; values: unknown[][] }>;
        getRowsModified: () => number;
        close: () => void;
    };
    const initSqlJs: (config?: { locateFile?: (file: string) => string }) => Promise<{ Database: new () => SqlDatabase }>;
    export default initSqlJs;
}

declare module "js-yaml" {
    export interface YamlMark { line: number; column: number; position?: number }
    export interface YAMLException extends Error { reason: string; mark?: YamlMark }
    export interface LoadOptions { filename?: string; json?: boolean; onWarning?: (warning: YAMLException) => void }
    export interface DumpOptions { indent?: number; lineWidth?: number; noRefs?: boolean; sortKeys?: boolean; flowLevel?: number }
    export function load(text: string, options?: LoadOptions): unknown;
    export function loadAll(text: string, iterator: (document: unknown) => void, options?: LoadOptions): void;
    export function dump(value: unknown, options?: DumpOptions): string;
}

// tau-prolog ships CommonJS without typings; src/lib/runtimes/prolog.ts describes the parts it uses.
declare module "tau-prolog" {
    const pl: unknown;
    export default pl;
}
declare module "tau-prolog/modules/lists.js" {
    const install: (pl: unknown) => void;
    export default install;
}
declare module "tau-prolog/modules/charsio.js" {
    const install: (pl: unknown) => void;
    export default install;
}
declare module "tau-prolog/modules/format.js" {
    const install: (pl: unknown) => void;
    export default install;
}
declare module "tau-prolog/modules/random.js" {
    const install: (pl: unknown) => void;
    export default install;
}

// Less ships no typings; src/lib/runtimes/less.ts uses the compiler's core without its browser bootstrap.
declare module "less/lib/less/index.js" {
    interface LessRenderOptions { filename?: string; javascriptEnabled?: boolean }
    interface LessCompiler {
        render(input: string, options?: LessRenderOptions): Promise<{ css: string; imports: string[] }>;
        /** Constructor of the plugin loader that @plugin uses (the browser and Node builds each set their own). */
        PluginLoader: unknown;
        version: number[];
    }
    const createLess: (environment?: unknown, fileManagers?: unknown, version?: string) => LessCompiler;
    export default createLess;
}
declare module "less/lib/less/environment/abstract-plugin-loader.js" {
    export default class AbstractPluginLoader {}
}

// The ES module build of the CoffeeScript compiler (its package has no typings).
declare module "coffeescript/lib/coffeescript-browser-compiler-modern/coffeescript.js" {
    export interface CoffeeSourceMap {
        /** Maps a 0-based [line, column] of the generated JavaScript back to the CoffeeScript source. */
        sourceLocation(generated: [number, number]): [number, number] | undefined;
    }
    export interface CoffeeCompileOptions { bare?: boolean; sourceMap?: boolean; filename?: string; literate?: boolean }
    export function compile(code: string, options: CoffeeCompileOptions & { sourceMap: true }): { js: string; sourceMap: CoffeeSourceMap };
    export function compile(code: string, options?: CoffeeCompileOptions): string;
    export const VERSION: string;
}
