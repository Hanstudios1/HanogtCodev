import OptimizedImage from "@/components/OptimizedImage";
import { logoSrc, type LogoId } from "@/lib/products";

/**
 * A product's logo (src/lib/products.ts) at `size` CSS pixels. The main mark
 * follows the theme: dark lines on the light theme, light ones on the dark.
 * Decorative by default; pass `alt` where the logo is the only label.
 */
export default function ProductLogo({ product, size = 32, alt = "", className = "", priority = false }: {
    product: LogoId;
    size?: number;
    alt?: string;
    className?: string;
    priority?: boolean;
}) {
    const box = `shrink-0 object-contain ${className}`;
    if (product !== "hanogt") {
        return <OptimizedImage src={logoSrc(product, size)} alt={alt} width={size} height={size} priority={priority} className={box} style={{ width: size, height: size }} />;
    }
    return (
        <>
            <OptimizedImage src={logoSrc("hanogt", size, "light")} alt={alt} width={size} height={size} priority={priority} className={`${box} dark:hidden`} style={{ width: size, height: size }} />
            <OptimizedImage src={logoSrc("hanogt", size, "dark")} alt={alt} width={size} height={size} priority={priority} className={`${box} hidden dark:block`} style={{ width: size, height: size }} />
        </>
    );
}
