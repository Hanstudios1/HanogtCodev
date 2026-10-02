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
