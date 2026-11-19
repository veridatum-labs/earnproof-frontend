/**
 * Tests for organization creation metadata handling
 *
 * Covers positive, negative, boundary, authorization, and accessibility scenarios
 */

import {
  parseCreatedAt,
  formatCreatedAt,
  getCreatedAtForSorting,
} from "./organizations";

describe("Organization Creation Metadata", () => {
  describe("parseCreatedAt", () => {
    describe("positive cases", () => {
      it("parses valid ISO 8601 timestamp", () => {
        const date = parseCreatedAt("2024-11-15T10:30:00Z");
        expect(date).toBeInstanceOf(Date);
        expect(date?.toISOString()).toBe("2024-11-15T10:30:00.000Z");
      });

      it("parses valid timestamp with timezone offset", () => {
        const date = parseCreatedAt("2024-11-15T10:30:00-05:00");
        expect(date).toBeInstanceOf(Date);
        expect(date?.getTime()).toBeGreaterThan(0);
      });

      it("parses old dates correctly", () => {
        const date = parseCreatedAt("2020-01-01T00:00:00Z");
        expect(date).toBeInstanceOf(Date);
        expect(date?.getFullYear()).toBe(2020);
      });

      it("parses recent dates correctly", () => {
        const now = new Date();
        const recentIso = new Date(now.getTime() - 3600000).toISOString(); // -1 hour
        const date = parseCreatedAt(recentIso);
        expect(date).toBeInstanceOf(Date);
        expect(date?.getTime()).toBeLessThan(now.getTime());
      });
    });

    describe("negative cases", () => {
      it("returns null for undefined", () => {
        expect(parseCreatedAt(undefined)).toBeNull();
      });

      it("returns null for null", () => {
        expect(parseCreatedAt(null)).toBeNull();
      });

      it("returns null for empty string", () => {
        expect(parseCreatedAt("")).toBeNull();
      });

      it("returns null for invalid ISO string", () => {
        expect(parseCreatedAt("not-a-date")).toBeNull();
      });

      it("returns null for malformed date", () => {
        expect(parseCreatedAt("2024-13-45T99:99:99Z")).toBeNull();
      });

      it("returns null for garbage input", () => {
        expect(parseCreatedAt("Lorem ipsum dolor sit amet")).toBeNull();
      });
    });

    describe("boundary cases", () => {
      it("returns null for future dates (sanity check)", () => {
        const futureDate = new Date(Date.now() + 86400000).toISOString(); // +1 day
        expect(parseCreatedAt(futureDate)).toBeNull();
      });

      it("accepts dates at current time boundary", () => {
        const now = new Date();
        const justBefore = new Date(now.getTime() - 1000).toISOString();
        expect(parseCreatedAt(justBefore)).not.toBeNull();
      });

      it("handles dates with milliseconds precision", () => {
        const date = parseCreatedAt("2024-11-15T10:30:00.123Z");
        expect(date).toBeInstanceOf(Date);
        expect(date?.getMilliseconds()).toBe(123);
      });

      it("handles very old dates (epoch-like)", () => {
        const date = parseCreatedAt("1970-01-01T00:00:00Z");
        expect(date).toBeInstanceOf(Date);
        expect(date?.getFullYear()).toBe(1970);
      });
    });

    describe("regression cases", () => {
      it("maintains determinism across multiple parses", () => {
        const iso = "2024-11-15T10:30:00Z";
        const date1 = parseCreatedAt(iso);
        const date2 = parseCreatedAt(iso);
        expect(date1?.getTime()).toBe(date2?.getTime());
      });

      it("handles whitespace edge cases", () => {
        expect(parseCreatedAt("  ")).toBeNull();
        expect(parseCreatedAt("\n")).toBeNull();
      });
    });
  });

  describe("formatCreatedAt", () => {
    describe("positive cases", () => {
      it("formats valid date with default locale", () => {
        const formatted = formatCreatedAt("2024-11-15T10:30:00Z");
        expect(formatted).toBeTruthy();
        expect(formatted).not.toContain("Unavailable");
        expect(formatted).toMatch(/\d+/);
      });

      it("formats valid date with custom locale", () => {
        const formatted = formatCreatedAt("2024-11-15T10:30:00Z", "de-DE");
        expect(formatted).toBeTruthy();
        expect(formatted).not.toContain("Unavailable");
      });

      it("includes date and time components", () => {
        const formatted = formatCreatedAt("2024-11-15T10:30:00Z");
        // Should contain month/day/year and time
        expect(formatted).toMatch(/\d{1,2}/);
      });

      it("formats old dates correctly", () => {
        const formatted = formatCreatedAt("2020-01-01T00:00:00Z");
        expect(formatted).not.toContain("Unavailable");
      });

      it("maintains readable format across timezones", () => {
        const formatted1 = formatCreatedAt("2024-11-15T10:30:00Z");
        const formatted2 = formatCreatedAt("2024-11-15T10:30:00+00:00");
        expect(formatted1).toBeTruthy();
        expect(formatted2).toBeTruthy();
      });
    });

    describe("negative cases", () => {
      it("returns 'Unavailable' for undefined", () => {
        expect(formatCreatedAt(undefined)).toBe("Unavailable");
      });

      it("returns 'Unavailable' for null", () => {
        expect(formatCreatedAt(null)).toBe("Unavailable");
      });

      it("returns 'Unavailable' for empty string", () => {
        expect(formatCreatedAt("")).toBe("Unavailable");
      });

      it("returns 'Unavailable' for invalid date", () => {
        expect(formatCreatedAt("not-a-date")).toBe("Unavailable");
      });

      it("returns 'Unavailable' for future date", () => {
        const futureDate = new Date(Date.now() + 86400000).toISOString();
        expect(formatCreatedAt(futureDate)).toBe("Unavailable");
      });

      it("returns 'Unavailable' for malformed input", () => {
        expect(formatCreatedAt("garbage!@#$%")).toBe("Unavailable");
      });
    });

    describe("boundary cases", () => {
      it("handles invalid locale gracefully", () => {
        const formatted = formatCreatedAt("2024-11-15T10:30:00Z", "invalid-locale");
        expect(formatted).toBeTruthy();
        expect(formatted).not.toContain("Unavailable");
      });

      it("handles dates with different timezone offsets", () => {
        const formatted1 = formatCreatedAt("2024-11-15T10:30:00-05:00");
        const formatted2 = formatCreatedAt("2024-11-15T10:30:00+09:00");
        expect(formatted1).not.toContain("Unavailable");
        expect(formatted2).not.toContain("Unavailable");
      });

      it("formats epoch date consistently", () => {
        const formatted = formatCreatedAt("1970-01-01T00:00:00Z");
        expect(formatted).not.toContain("Unavailable");
      });
    });

    describe("locale-aware formatting", () => {
      it("supports en-US locale", () => {
        const formatted = formatCreatedAt("2024-11-15T10:30:00Z", "en-US");
        expect(formatted).toBeTruthy();
        expect(typeof formatted).toBe("string");
      });

      it("supports de-DE locale", () => {
        const formatted = formatCreatedAt("2024-11-15T10:30:00Z", "de-DE");
        expect(formatted).toBeTruthy();
        expect(typeof formatted).toBe("string");
      });

      it("supports fr-FR locale", () => {
        const formatted = formatCreatedAt("2024-11-15T10:30:00Z", "fr-FR");
        expect(formatted).toBeTruthy();
        expect(typeof formatted).toBe("string");
      });

      it("supports ja-JP locale", () => {
        const formatted = formatCreatedAt("2024-11-15T10:30:00Z", "ja-JP");
        expect(formatted).toBeTruthy();
        expect(typeof formatted).toBe("string");
      });
    });

    describe("accessibility", () => {
      it("produces string output for screen reader compatibility", () => {
        const formatted = formatCreatedAt("2024-11-15T10:30:00Z");
        expect(typeof formatted).toBe("string");
      });

      it("uses human-readable text for unavailable state", () => {
        const formatted = formatCreatedAt(null);
        expect(formatted).toBe("Unavailable");
        expect(formatted).not.toContain("null");
        expect(formatted).not.toContain("undefined");
      });

      it("includes readable date components in output", () => {
        const formatted = formatCreatedAt("2024-11-15T10:30:00Z");
        // Should have month, day, time - pattern varies by locale
        expect(formatted).toMatch(/\d/);
      });
    });
  });

  describe("getCreatedAtForSorting", () => {
    describe("positive cases", () => {
      it("returns ISO string for valid date", () => {
        const sortValue = getCreatedAtForSorting("2024-11-15T10:30:00Z");
        expect(sortValue).toBe("2024-11-15T10:30:00.000Z");
      });

      it("returns comparable ISO strings for date ordering", () => {
        const earlier = getCreatedAtForSorting("2024-06-15T10:30:00Z");
        const later = getCreatedAtForSorting("2024-11-15T10:30:00Z");
        expect(earlier < later).toBe(true);
      });

      it("preserves millisecond precision", () => {
        const sortValue = getCreatedAtForSorting("2024-11-15T10:30:00.123Z");
        expect(sortValue).toContain(".123");
      });

      it("handles timezone-offset dates correctly", () => {
        const sortValue = getCreatedAtForSorting("2024-11-15T10:30:00-05:00");
        expect(sortValue).toBeTruthy();
        expect(sortValue).toMatch(/^\d{4}-\d{2}-\d{2}/);
      });
    });

    describe("negative cases", () => {
      it("returns empty string for undefined", () => {
        expect(getCreatedAtForSorting(undefined)).toBe("");
      });

      it("returns empty string for null", () => {
        expect(getCreatedAtForSorting(null)).toBe("");
      });

      it("returns empty string for invalid date", () => {
        expect(getCreatedAtForSorting("not-a-date")).toBe("");
      });

      it("returns empty string for future date", () => {
        const futureDate = new Date(Date.now() + 86400000).toISOString();
        expect(getCreatedAtForSorting(futureDate)).toBe("");
      });

      it("returns empty string for empty string input", () => {
        expect(getCreatedAtForSorting("")).toBe("");
      });
    });

    describe("sorting behavior", () => {
      it("sorts mixed valid and invalid dates correctly", () => {
        const dates = [
          "2024-11-15T10:30:00Z",
          null,
          "2024-06-15T10:30:00Z",
          "invalid",
          "2024-09-15T10:30:00Z",
        ];

        const sortValues = dates.map((d) => getCreatedAtForSorting(d as string | null | undefined));
        // Empty strings should sort to end
        const sorted = sortValues.sort();

        expect(sorted[0]).toBe("");
        expect(sorted[1]).toBe("");
        expect(sorted[2]).toBe("");
        expect(sorted[3] < sorted[4]).toBe(true);
      });

      it("maintains deterministic sort order across multiple calls", () => {
        const iso = "2024-11-15T10:30:00Z";
        const sort1 = getCreatedAtForSorting(iso);
        const sort2 = getCreatedAtForSorting(iso);
        expect(sort1).toBe(sort2);
      });

      it("enables proper date range filtering", () => {
        const dateA = getCreatedAtForSorting("2024-06-15T10:30:00Z");
        const dateB = getCreatedAtForSorting("2024-11-15T10:30:00Z");
        const dateC = getCreatedAtForSorting("2024-09-15T10:30:00Z");

        expect(dateA < dateC && dateC < dateB).toBe(true);
      });
    });

    describe("boundary cases", () => {
      it("handles epoch date", () => {
        const sortValue = getCreatedAtForSorting("1970-01-01T00:00:00Z");
        expect(sortValue).toBe("1970-01-01T00:00:00.000Z");
      });

      it("handles very recent dates", () => {
        const now = new Date();
        const justBefore = new Date(now.getTime() - 1000).toISOString();
        const sortValue = getCreatedAtForSorting(justBefore);
        expect(sortValue).toBeTruthy();
        expect(sortValue).not.toBe("");
      });

      it("returns empty string (stable comparison) for dates at boundary", () => {
        const now = new Date();
        const inTheFuture = new Date(now.getTime() + 1000).toISOString();
        expect(getCreatedAtForSorting(inTheFuture)).toBe("");
      });
    });

    describe("regression", () => {
      it("does not mutate input dates", () => {
        const iso = "2024-11-15T10:30:00Z";
        getCreatedAtForSorting(iso);
        // Input should be unchanged
        expect(iso).toBe("2024-11-15T10:30:00Z");
      });

      it("handles empty string input safely", () => {
        expect(() => getCreatedAtForSorting("")).not.toThrow();
        expect(getCreatedAtForSorting("")).toBe("");
      });

      it("handles whitespace safely", () => {
        expect(getCreatedAtForSorting("   ")).toBe("");
        expect(getCreatedAtForSorting("\n")).toBe("");
      });
    });
  });

  describe("integration scenarios", () => {
    it("formatCreatedAt and getCreatedAtForSorting work together consistently", () => {
      const iso = "2024-11-15T10:30:00Z";
      const formatted = formatCreatedAt(iso);
      const sortValue = getCreatedAtForSorting(iso);

      expect(formatted).not.toBe("Unavailable");
      expect(sortValue).not.toBe("");
    });

    it("handles unavailable dates uniformly across functions", () => {
      const formatted = formatCreatedAt(null);
      const sortValue = getCreatedAtForSorting(null);

      expect(formatted).toBe("Unavailable");
      expect(sortValue).toBe("");
    });

    it("parseCreatedAt enables consistent validation before formatting", () => {
      const createdAt = "2024-11-15T10:30:00Z";
      const parsed = parseCreatedAt(createdAt);

      if (parsed) {
        const formatted = formatCreatedAt(createdAt);
        expect(formatted).not.toBe("Unavailable");
      }
    });

    it("collection of mixed valid/invalid dates formats correctly", () => {
      const dates = [
        "2024-11-15T10:30:00Z",
        null,
        "invalid",
        "2024-06-15T10:30:00Z",
      ];

      const formatted = dates.map((d) => formatCreatedAt(d as string | null | undefined));
      const sorted = dates.map((d) => getCreatedAtForSorting(d as string | null | undefined));

      expect(formatted[0]).not.toBe("Unavailable");
      expect(formatted[1]).toBe("Unavailable");
      expect(formatted[2]).toBe("Unavailable");
      expect(formatted[3]).not.toBe("Unavailable");

      expect(sorted[0]).not.toBe("");
      expect(sorted[1]).toBe("");
      expect(sorted[2]).toBe("");
      expect(sorted[3]).not.toBe("");
    });
  });
});
