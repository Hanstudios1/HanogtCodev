import type { NextConfig } from "next";

const isElectron = process.env.ELECTRON_BUILD === "true";
// Local Firebase Emulator Suite (see src/lib/firebase.ts); loopback hosts only.
const emulatorHost = /^(?:127\.0\.0\.1|localhost)$/.test(process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST?.trim() || "")
  ? process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST!.trim()
  : null;
const emulatorSources = emulatorHost
  ? [8080, 9099, 9199].flatMap((port) => [`http://${emulatorHost}:${port}`, `ws://${emulatorHost}:${port}`]).join(" ")
  : "";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Don't let `next dev` write AGENTS.md/CLAUDE.md into the repository root.
  agentRules: false,
  compress: true,
  reactStrictMode: true,
  output: isElectron ? "export" : undefined, // Static export ONLY for Electron
  images: {
    unoptimized: isElectron, // Required for static export, but optional for Vercel
  },
  // Ensure trailing slashes for file protocol to work correctly with relative paths
  trailingSlash: isElectron,
  // Cloud Health compares and deploys the repository's security rules, which
  // it reads from disk at runtime (src/lib/server/cloud-health.ts).
  outputFileTracingIncludes: {
    "/api/admin/cloud": ["./firestore.rules", "./storage.rules"],
  },
  async headers() {
    if (isElectron) return [];
    // Paddle Billing (Plans page): Paddle.js with its styles and fonts from
    // Paddle's CDNs, the checkout in an iframe on (sandbox-)buy.paddle.com and
    // its API calls. Paddle serves all of it from paddle.com subdomains, live
    // and sandbox alike, and adds hosts over time, so one wildcard covers them.
    // Paddle Retain, which Paddle.js loads for live accounts only, comes from
    // public.profitwell.com and talks to profitwell.com hosts.
    const paddle = "https://*.paddle.com";
    const retainScript = "https://public.profitwell.com";
    const retainApi = "https://*.profitwell.com";
    const contentSecurityPolicy = [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${paddle} ${retainScript}`,
      `style-src 'self' 'unsafe-inline' ${paddle}`,
      "img-src 'self' data: blob: https:",
      `font-src 'self' data: ${paddle}`,
      `frame-src 'self' ${paddle}`,
      `media-src 'self' blob: https://firebasestorage.googleapis.com${emulatorHost ? ` http://${emulatorHost}:9199` : ""}`,
      "worker-src 'self' blob:",
      `connect-src 'self' blob: https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://securetoken.googleapis.com https://identitytoolkit.googleapis.com ${paddle} ${retainApi}${emulatorSources ? ` ${emulatorSources}` : ""}`,
      "upgrade-insecure-requests",
    ].join("; ");
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: contentSecurityPolicy },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        // Payment Request (Apple Pay, Google Pay) is allowed for Paddle's checkout frame only.
        { key: "Permissions-Policy", value: 'camera=(), microphone=(self), geolocation=(), payment=(self "https://buy.paddle.com" "https://sandbox-buy.paddle.com"), usb=()' },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      ],
    }];
  },
};

export default nextConfig;
