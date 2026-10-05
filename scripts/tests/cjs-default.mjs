// The default export of a CommonJS module compiled from an ES module, as the
// bundler resolves it: `exports.default` rather than the whole exports object
// (see ts-hooks.mjs). The module name comes in the `module` query parameter.
const name = new URL(import.meta.url).searchParams.get("module");
const loaded = await import(name);
const exported = loaded.default;

export default exported && typeof exported === "object" && "default" in exported ? exported.default : exported;
