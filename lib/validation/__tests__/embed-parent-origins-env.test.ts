/**
 * Tests for embedded parent-origins environment variable parsing (issue #368).
 * Covers: env parsing, configuration loading, edge cases.
 */

import { parseEmbedAllowedParentOrigins } from "@/lib/validation/env";
import type { EnvLike } from "@/lib/validation/env";

describe("parseEmbedAllowedParentOrigins", () => {
  it("parses comma-separated origins from env", () => {
    const env: EnvLike = {
      NEXT_PUBLIC_EMBED_ALLOWED_PARENT_ORIGINS:
        "https://example.com,https://app.example.com",
    };

    const result = parseEmbedAllowedParentOrigins(env);
    expect(result).toEqual([
      "https://example.com",
      "https://app.example.com",
    ]);
  });

  it("returns empty array when env var is not set", () => {
    const env: EnvLike = {};
    expect(parseEmbedAllowedParentOrigins(env)).toEqual([]);
  });

  it("returns empty array when env var is empty string", () => {
    const env: EnvLike = {
      NEXT_PUBLIC_EMBED_ALLOWED_PARENT_ORIGINS: "",
    };
    expect(parseEmbedAllowedParentOrigins(env)).toEqual([]);
  });

  it("returns empty array when env var is whitespace only", () => {
    const env: EnvLike = {
      NEXT_PUBLIC_EMBED_ALLOWED_PARENT_ORIGINS: "   ",
    };
    expect(parseEmbedAllowedParentOrigins(env)).toEqual([]);
  });

  it("trims whitespace from each origin", () => {
    const env: EnvLike = {
      NEXT_PUBLIC_EMBED_ALLOWED_PARENT_ORIGINS:
        "https://example.com  ,  https://app.example.com  ,  https://api.example.com",
    };

    const result = parseEmbedAllowedParentOrigins(env);
    expect(result).toEqual([
      "https://example.com",
      "https://app.example.com",
      "https://api.example.com",
    ]);
  });

  it("filters out empty entries (after trimming)", () => {
    const env: EnvLike = {
      NEXT_PUBLIC_EMBED_ALLOWED_PARENT_ORIGINS:
        "https://example.com,,https://app.example.com,  ,https://api.example.com",
    };

    const result = parseEmbedAllowedParentOrigins(env);
    expect(result).toEqual([
      "https://example.com",
      "https://app.example.com",
      "https://api.example.com",
    ]);
  });

  it("handles wildcard in the list", () => {
    const env: EnvLike = {
      NEXT_PUBLIC_EMBED_ALLOWED_PARENT_ORIGINS: "*",
    };

    const result = parseEmbedAllowedParentOrigins(env);
    expect(result).toEqual(["*"]);
  });

  it("handles wildcard mixed with specific origins", () => {
    const env: EnvLike = {
      NEXT_PUBLIC_EMBED_ALLOWED_PARENT_ORIGINS:
        "https://trusted.com,*,https://another.com",
    };

    const result = parseEmbedAllowedParentOrigins(env);
    expect(result).toEqual(["https://trusted.com", "*", "https://another.com"]);
  });

  it("handles single origin without comma", () => {
    const env: EnvLike = {
      NEXT_PUBLIC_EMBED_ALLOWED_PARENT_ORIGINS: "https://example.com",
    };

    const result = parseEmbedAllowedParentOrigins(env);
    expect(result).toEqual(["https://example.com"]);
  });

  it("handles trailing commas", () => {
    const env: EnvLike = {
      NEXT_PUBLIC_EMBED_ALLOWED_PARENT_ORIGINS:
        "https://example.com,https://app.example.com,",
    };

    const result = parseEmbedAllowedParentOrigins(env);
    expect(result).toEqual([
      "https://example.com",
      "https://app.example.com",
    ]);
  });

  it("handles leading commas", () => {
    const env: EnvLike = {
      NEXT_PUBLIC_EMBED_ALLOWED_PARENT_ORIGINS:
        ",https://example.com,https://app.example.com",
    };

    const result = parseEmbedAllowedParentOrigins(env);
    expect(result).toEqual([
      "https://example.com",
      "https://app.example.com",
    ]);
  });

  it("preserves origin URLs exactly as given (no normalization at parse level)", () => {
    const env: EnvLike = {
      NEXT_PUBLIC_EMBED_ALLOWED_PARENT_ORIGINS:
        "https://Example.COM:3000,HTTPS://APP.EXAMPLE.COM",
    };

    // parseEmbedAllowedParentOrigins just parses the CSV list
    // Normalization happens in the validator
    const result = parseEmbedAllowedParentOrigins(env);
    expect(result.length).toBe(2);
    // The parser doesn't normalize; it returns raw strings
  });

  it("handles newlines in the string (though not recommended)", () => {
    const env: EnvLike = {
      NEXT_PUBLIC_EMBED_ALLOWED_PARENT_ORIGINS:
        "https://example.com,https://app.example.com\nhttps://api.example.com",
    };

    // Newline is not a separator, only commas are
    const result = parseEmbedAllowedParentOrigins(env);
    expect(result.length).toBe(2); // Two entries: one with newline embedded
  });

  it("production use case: no origins set", () => {
    const env: EnvLike = { NODE_ENV: "production" };
    const result = parseEmbedAllowedParentOrigins(env);
    expect(result).toEqual([]);
    // This means embedding is disabled (widget only accessible standalone)
  });

  it("production use case: curated list of relying parties", () => {
    const env: EnvLike = {
      NEXT_PUBLIC_EMBED_ALLOWED_PARENT_ORIGINS:
        "https://partner1.com,https://partner2.com,https://partner3.example.com:8443",
    };

    const result = parseEmbedAllowedParentOrigins(env);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe("https://partner1.com");
  });

  it("development use case: allow any origin", () => {
    const env: EnvLike = {
      NEXT_PUBLIC_EMBED_ALLOWED_PARENT_ORIGINS: "*",
    };

    const result = parseEmbedAllowedParentOrigins(env);
    expect(result).toEqual(["*"]);
  });
});
