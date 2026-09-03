import type { NextConfig } from "next";
import { buildSecurityPolicy, nextHeaderList } from "./config/security-headers";
import { cacheHeaderRules } from "./config/cache-headers";

const securityPolicy = buildSecurityPolicy();
const publicEnv = securityPolicy.env;
const nextPublicEnv: Record<string, string> = {
  NEXT_PUBLIC_APP_URL: publicEnv.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_API_URL: publicEnv.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_STELLAR_NETWORK: publicEnv.NEXT_PUBLIC_STELLAR_NETWORK,
  NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE:
    publicEnv.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE,
  NEXT_PUBLIC_STELLAR_HORIZON_URL: publicEnv.NEXT_PUBLIC_STELLAR_HORIZON_URL,
};

if (publicEnv.NEXT_PUBLIC_HELP_URL) {
  nextPublicEnv.NEXT_PUBLIC_HELP_URL = publicEnv.NEXT_PUBLIC_HELP_URL;
}

if (publicEnv.NEXT_PUBLIC_STELLAR_EXPLORER_URL) {
  nextPublicEnv.NEXT_PUBLIC_STELLAR_EXPLORER_URL =
    publicEnv.NEXT_PUBLIC_STELLAR_EXPLORER_URL;
}

if (publicEnv.NEXT_PUBLIC_WEB_VITALS_ENDPOINT) {
  nextPublicEnv.NEXT_PUBLIC_WEB_VITALS_ENDPOINT =
    publicEnv.NEXT_PUBLIC_WEB_VITALS_ENDPOINT;
}

/**
 * Client source maps are the only reliable way to attribute a minified
 * Turbopack chunk back to the packages and files that produced it, which is
 * what the bundle composition gate (`scripts/bundle/`) needs.
 *
 * They are emitted **only** when the analyzer explicitly asks for them
 * (`ANALYZE_BUNDLE=1`), never in a normal `next build`: shipping browser
 * source maps to production would publish the app's original sources, and
 * that is a deliberate trade-off this flag keeps opt-in and local to the
 * analysis run.
 */
const analyzeBundle = process.env.ANALYZE_BUNDLE === "1";

const nextConfig: NextConfig = {
  env: nextPublicEnv,
  productionBrowserSourceMaps: analyzeBundle,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: nextHeaderList(securityPolicy).map((header) => ({
          key: header.key,
          value: header.value,
        })),
      },
      // See docs/cache-policy.md for the per-route Cache-Control rationale.
      ...cacheHeaderRules().map(({ source, headers }) => ({ source, headers })),
    ];
  },
};

export default nextConfig;
