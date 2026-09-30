declare module "sql.js/dist/sql-wasm-browser.js" {
    type SqlDatabase = {
        exec: (sql: string) => Array<{ columns: string[]; values: unknown[][] }>;
        getRowsModified: () => number;
        close: () => void;
    };
    const initSqlJs: (config?: { locateFile?: (file: string) => string }) => Promise<{ Database: new () => SqlDatabase }>;
    export default initSqlJs;
}
