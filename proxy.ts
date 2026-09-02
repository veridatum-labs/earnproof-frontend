import { NextRequest, NextResponse } from "next/server";
import { buildSecurityPolicy } from "@/config/security-headers";

function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

export function proxy(request: NextRequest) {
  const nonce = createNonce();
  const policy = buildSecurityPolicy({ nonce });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", policy.csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  for (const header of policy.headers) {
    response.headers.set(header.key, header.value);
  }

  return response;
}

export const config = {
  matcher: [
    {
      source:
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
    },
  ],
};
