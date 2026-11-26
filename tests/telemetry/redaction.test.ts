/**
 * Redaction contract: no sensitive value from a representative browser
 * error may survive into a reportable message shape, and what does survive
 * must still be useful for telling failures apart.
 */

import {
  MAX_MESSAGE_SHAPE_LENGTH,
  redactMessage,
  toEventTimestamp,
} from "@/lib/telemetry/redact";
import {
  REPRESENTATIVE_ERRORS,
  SENSITIVE_VALUES,
  WALLET_ADDRESS,
  BEARER_TOKEN,
  FULL_URL,
  PROOF_ID,
  EMAIL,
} from "./fixtures/sensitive-values";

describe("redactMessage", () => {
  it.each(REPRESENTATIVE_ERRORS)(
    "strips every sensitive value from: $label",
    ({ error }) => {
      const shape = redactMessage(error.message);
      for (const value of SENSITIVE_VALUES) {
        expect(shape).not.toContain(value);
      }
    },
  );

  describe("URL query strings and fragments", () => {
    it("redacts URLs with tokens in query strings", () => {
      const url = "https://app.example.com/verify?proof=ABC123&token=secret_jwt_token";
      const shape = redactMessage(url);
      expect(shape).toBe("<url>");
      expect(shape).not.toContain("secret");
      expect(shape).not.toContain("token");
    });

    it("redacts URLs with credentials in query strings", () => {
      const url = "https://api.example.com/check?credential=%7B%22proof%22%3A%22data%22%7D";
      const shape = redactMessage(url);
      expect(shape).toBe("<url>");
      expect(shape).not.toContain("credential");
    });

    it("redacts URLs with api_key in query strings", () => {
      const url = "https://external.api.com/resource?api_key=sk_live_abc123def456";
      const shape = redactMessage(url);
      expect(shape).toBe("<url>");
      expect(shape).not.toContain("api_key");
      expect(shape).not.toContain("sk_live");
    });

    it("redacts URLs with email in query strings", () => {
      const url = "https://example.com/verify?email=user%40example.com&code=12345";
      const shape = redactMessage(url);
      expect(shape).toBe("<url>");
      expect(shape).not.toContain("user@example.com");
    });

    it("redacts URLs with wallet addresses in query strings", () => {
      const address = "GBXYZABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWX2Z5EE";
      const url = `https://example.com/verify?wallet=${address}`;
      const shape = redactMessage(url);
      expect(shape).toBe("<url>");
      expect(shape).not.toContain(address);
    });

    it("redacts URLs with multiple sensitive query params", () => {
      const url = "https://api.example.com/resource?token=xyz&password=secret&api_key=key123";
      const shape = redactMessage(url);
      expect(shape).toBe("<url>");
      expect(shape).not.toContain("token");
      expect(shape).not.toContain("password");
      expect(shape).not.toContain("api_key");
    });

    it("redacts URLs with fragments containing sensitive data", () => {
      const url = "https://example.com/page#token=secret";
      const shape = redactMessage(url);
      expect(shape).toBe("<url>");
      expect(shape).not.toContain("secret");
    });

    it("redacts mixed URL with query string and fragment", () => {
      const url =
        "https://example.com/verify?proof=ABC&token=secret#top";
      const shape = redactMessage(url);
      expect(shape).toBe("<url>");
    });

    it("redacts HTTP URLs as well as HTTPS", () => {
      const url = "http://example.com/verify?token=secret";
      const shape = redactMessage(url);
      expect(shape).toBe("<url>");
      expect(shape).not.toContain("token");
    });

    it("redacts URLs appearing in error context messages", () => {
      const message = `Failed to fetch from https://api.example.com/check?token=secret_token: 401 Unauthorized`;
      const shape = redactMessage(message);
      expect(shape).not.toContain("secret_token");
      expect(shape).toContain("Failed to fetch from");
      expect(shape).toContain("<url>");
    });
  });

  it("replaces each sensitive shape with a named placeholder", () => {
    expect(redactMessage(`account ${WALLET_ADDRESS} rejected`)).toBe("account <address> rejected");
    expect(redactMessage(`bearer ${BEARER_TOKEN} expired`)).toBe("bearer <token> expired");
    expect(redactMessage(`GET ${FULL_URL} failed`)).toBe("GET <url> failed");
    expect(redactMessage(`proof ${PROOF_ID} missing`)).toBe("proof <proof-id> missing");
    expect(redactMessage(`mail ${EMAIL} bounced`)).toBe("mail <email> bounced");
  });

  it("drops any JSON-shaped payload wholesale", () => {
    const shape = redactMessage('Invalid credential: {"credentialSubject":{"income":"4200.00"}}');
    expect(shape).toBe("Invalid credential: <object>");
  });

  it("keeps enough signal to distinguish two different failures", () => {
    expect(redactMessage("Failed to fetch")).toBe("Failed to fetch");
    expect(redactMessage("Unexpected token < in JSON at position 0")).toBe(
      "Unexpected token < in JSON at position 0",
    );
    expect(redactMessage("Failed to fetch")).not.toBe(
      redactMessage("Unexpected token < in JSON at position 0"),
    );
  });

  it("preserves short numbers that carry diagnostic value", () => {
    expect(redactMessage("EarnProof API request failed with 503")).toContain("503");
  });

  it("caps the message shape length", () => {
    const shape = redactMessage("boundary ".repeat(200));
    expect(shape.length).toBeLessThanOrEqual(MAX_MESSAGE_SHAPE_LENGTH);
  });

  it("does not inspect or coerce non-string input", () => {
    expect(redactMessage(undefined)).toBe("");
    expect(redactMessage(null)).toBe("");
    expect(redactMessage({ walletAddress: WALLET_ADDRESS })).toBe("");
    expect(redactMessage(12345)).toBe("");
  });
});

describe("toEventTimestamp", () => {
  it("truncates to the minute so a timestamp cannot single out a session", () => {
    expect(toEventTimestamp(new Date("2026-08-28T14:37:52.481Z"))).toBe("2026-08-28T14:37:00.000Z");
  });

  it("produces the same value for two errors in the same minute", () => {
    expect(toEventTimestamp(new Date("2026-08-28T14:37:01.000Z"))).toBe(
      toEventTimestamp(new Date("2026-08-28T14:37:59.999Z")),
    );
  });
});
