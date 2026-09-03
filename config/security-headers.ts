import {
  loadPublicEnv,
  resolveDeploymentProfile,
  type EnvLike,
  type PublicEnv,
} from "../lib/validation/env";

export type SecurityHeader = { key: string; value: string };

export type SecurityPolicy = {
  profile: ReturnType<typeof resolveDeploymentProfile>;
  env: PublicEnv;
  headers: SecurityHeader[];
  csp: string;
  connectSrc: string[];
  scriptSrc: string[];
};

export type BuildSecurityPolicyOptions = {
  env?: EnvLike;
  nonce?: string;
};

const CSP_SEPARATOR = "; ";

function originOf(url: string): string {
  return new URL(url).origin;
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function cspValue(parts: string[]): string {
  return parts.filter(Boolean).join(" ");
}

/**
 * Build the browser security policy for a deployment profile.
 *
 * Script and style element sources use a per-request nonce. `'unsafe-inline'`
 * is limited to style attributes because Next/Image and progress indicators
 * emit reviewed inline style attributes; script sources and style elements
 * still do not permit inline execution.
 */
export function buildSecurityPolicy(
  options: BuildSecurityPolicyOptions = {},
): SecurityPolicy {
  const envSource = options.env ?? process.env;
  const env = loadPublicEnv(envSource);
  const profile = resolveDeploymentProfile(envSource);
  const appOrigin = originOf(env.NEXT_PUBLIC_APP_URL);
  const apiOrigin = originOf(env.NEXT_PUBLIC_API_URL);
  const horizonOrigin = originOf(env.NEXT_PUBLIC_STELLAR_HORIZON_URL);
  const vitalsOrigin = env.NEXT_PUBLIC_WEB_VITALS_ENDPOINT
    ? originOf(env.NEXT_PUBLIC_WEB_VITALS_ENDPOINT)
    : undefined;

  const nonce = options.nonce;
  const nonceSource = nonce ? `'nonce-${nonce}'` : undefined;
  // `'strict-dynamic'` lets the nonce-bearing Next.js runtime load its own
  // scripts. It is not a host wildcard and does not allow attacker-supplied
  // inline event handlers.
  const scriptSrc = unique(["'self'", nonceSource, nonce ? "'strict-dynamic'" : undefined]);
  const styleSrc = unique(["'self'", nonceSource]);
  const connectSrc = unique([
    "'self'",
    appOrigin,
    apiOrigin,
    horizonOrigin,
    vitalsOrigin,
  ]);

  const isHttpsApp = env.NEXT_PUBLIC_APP_URL.startsWith("https://");

  const directives = [
    `default-src ${cspValue(["'self'"])}`,
    `script-src ${cspValue(scriptSrc)}`,
    `style-src ${cspValue(styleSrc)}`,
    `style-src-elem ${cspValue(styleSrc)}`,
    `style-src-attr ${cspValue(["'unsafe-inline'"])}`,
    `img-src ${cspValue(["'self'", "data:", "blob:"])}`,
    `font-src ${cspValue(["'self'"])}`,
    `connect-src ${cspValue(connectSrc)}`,
    `media-src ${cspValue(["'self'", "blob:"])}`,
    `worker-src ${cspValue(["'self'", "blob:"])}`,
    `manifest-src ${cspValue(["'self'"])}`,
    `object-src ${cspValue(["'none'"])}`,
    `base-uri ${cspValue(["'self'"])}`,
    `form-action ${cspValue(["'self'"])}`,
    `frame-src ${cspValue(["'none'"])}`,
    `frame-ancestors ${cspValue(["'none'"])}`,
    `child-src ${cspValue(["'none'"])}`,
    isHttpsApp ? "upgrade-insecure-requests" : "",
  ].filter(Boolean);

  const csp = directives.join(CSP_SEPARATOR);

  const headers: SecurityHeader[] = [
    { key: "Content-Security-Policy", value: csp },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: [
        "camera=(self)",
        "microphone=()",
        "geolocation=()",
        "payment=()",
        "usb=()",
        "interest-cohort=()",
      ].join(", "),
    },
    { key: "X-DNS-Prefetch-Control", value: "off" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  ];

  if (isHttpsApp) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    });
  }

  return {
    profile,
    env,
    headers,
    csp,
    connectSrc,
    scriptSrc,
  };
}

export function nextHeaderList(policy: SecurityPolicy): Array<{ key: string; value: string }> {
  return policy.headers;
}

export function documentedConnectOrigins(env: PublicEnv): string[] {
  return unique([
    new URL(env.NEXT_PUBLIC_APP_URL).origin,
    new URL(env.NEXT_PUBLIC_API_URL).origin,
    new URL(env.NEXT_PUBLIC_STELLAR_HORIZON_URL).origin,
    env.NEXT_PUBLIC_WEB_VITALS_ENDPOINT
      ? new URL(env.NEXT_PUBLIC_WEB_VITALS_ENDPOINT).origin
      : undefined,
  ]);
}
