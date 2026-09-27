/** Only same-origin relative paths are accepted as post-login destinations. */
export function safeCallbackPath(value: string | null) {
    if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/dashboard";
    if (value.startsWith("/login") || value.startsWith("/signup")) return "/dashboard";
    return value.slice(0, 500);
}
