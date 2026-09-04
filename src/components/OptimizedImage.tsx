import Image from "next/image";
import type { ImgHTMLAttributes } from "react";

type OptimizedImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "width" | "height"> & {
    src: string;
    width?: number;
    height?: number;
    priority?: boolean;
};

/**
 * Optimizes same-origin product assets while keeping user-supplied remote
 * avatars outside the server-side image proxy allow-list.
 */
export default function OptimizedImage({
    src,
    alt,
    width = 96,
    height = 96,
    priority = false,
    loading,
    decoding = "async",
    ...props
}: OptimizedImageProps) {
    if (src.startsWith("/")) {
        return (
            <Image
                {...props}
                src={src}
                alt={alt || ""}
                width={width}
                height={height}
                priority={priority}
                loading={priority ? undefined : loading || "lazy"}
                decoding={decoding}
            />
        );
    }

    // Remote user content is deliberately not proxied by Next Image: allowing
    // arbitrary hosts in the optimizer would broaden the server request surface.
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} src={src} alt={alt || ""} width={width} height={height} loading={loading || "lazy"} decoding={decoding} />;
}
