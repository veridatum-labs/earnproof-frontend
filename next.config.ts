import type { NextConfig } from "next";
import { buildSecurityPolicy, nextHeaderList } from "./config/security-headers";
import { cacheHeaderRules } from "./config/cache-headers";

const securityPolicy = buildSecurityPolicy();

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
