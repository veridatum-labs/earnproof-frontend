/**
 * Locale-aware formatting helpers.
 *
 * Every assertion pins an explicit locale, so these tests are independent of
 * the runtime's ambient locale — which is the same property the helpers give
 * the app.
 */

import {
  DEFAULT_LOCALE,
  formatDate,
  formatDateRange,
  formatDateTime,
  formatList,
  formatNumber,
  formatPlural,
  formatRelativeTime,
  formatTime,
  resolveLocale,
  selectPlural,
} from "@/lib/i18n";

const MOMENT = new Date("2026-08-28T14:37:52.000Z");

describe("dates and times", () => {
  it("formats for an explicit locale rather than the runtime default", () => {
    expect(formatDate(MOMENT, "en-US")).not.toBe(formatDate(MOMENT, "de-DE"));
    expect(formatDate("2026-08-28T00:00:00.000Z", "en-US")).toContain("2026");
  });

  it("accepts a Date, an ISO string or an epoch number interchangeably", () => {
    expect(formatDate(MOMENT, "en-US")).toBe(formatDate(MOMENT.toISOString(), "en-US"));
    expect(formatDate(MOMENT, "en-US")).toBe(formatDate(MOMENT.getTime(), "en-US"));
  });

  it("formats a date range as one locale phrase, not two dates joined by 'to'", () => {
    const range = formatDateRange(
      "2026-01-03T00:00:00.000Z",
      "2026-01-09T00:00:00.000Z",
      "en-US",
    );
    expect(range).not.toContain(" to ");
    // An en dash is the locale's own range connector; the app never supplies one.
    expect(range).toMatch(/[–-]/);
    expect(formatDateRange("2026-01-03T00:00:00.000Z", "2026-01-09T00:00:00.000Z", "de-DE")).not.toBe(
      range,
    );
  });

  it("renders an unparseable value as-is instead of throwing", () => {
    // These formatters take API data. A formatter that throws takes the
    // whole render down with it.
    expect(() => formatDate("not-a-date", "en-US")).not.toThrow();
    expect(formatDate("not-a-date", "en-US")).toBe("not-a-date");
    expect(formatDateTime("not-a-date", "en-US")).toBe("not-a-date");
    expect(formatTime("not-a-date", "en-US")).toBe("not-a-date");
    expect(formatRelativeTime("not-a-date", "en-US")).toBe("not-a-date");
    expect(formatDateRange("not-a-date", "also-not", "en-US")).toBe("not-a-date also-not");
  });

  it("formats a time without a date component", () => {
    expect(formatTime(MOMENT, "en-US")).not.toContain("2026");
    expect(formatDateTime(MOMENT, "en-US")).toContain("2026");
  });
});

describe("relative time", () => {
  const now = new Date("2026-08-28T14:40:00.000Z");

  it("produces a whole phrase, with the unit chosen from the magnitude", () => {
    expect(formatRelativeTime(new Date("2026-08-28T14:38:00.000Z"), "en-US", now)).toBe(
      "2 minutes ago",
    );
    expect(formatRelativeTime(new Date("2026-08-28T12:40:00.000Z"), "en-US", now)).toBe(
      "2 hours ago",
    );
    expect(formatRelativeTime(new Date("2026-08-26T14:40:00.000Z"), "en-US", now)).toBe(
      "2 days ago",
    );
  });

  it("handles the singular form without the caller testing count === 1", () => {
    expect(formatRelativeTime(new Date("2026-08-28T14:39:00.000Z"), "en-US", now)).toBe(
      "1 minute ago",
    );
  });

  it("handles future times and 'now'", () => {
    expect(formatRelativeTime(new Date("2026-08-28T14:45:00.000Z"), "en-US", now)).toBe(
      "in 5 minutes",
    );
    expect(formatRelativeTime(now, "en-US", now)).toBe("now");
  });

  it("is locale-aware", () => {
    expect(formatRelativeTime(new Date("2026-08-28T14:38:00.000Z"), "de-DE", now)).not.toBe(
      formatRelativeTime(new Date("2026-08-28T14:38:00.000Z"), "en-US", now),
    );
  });
});

describe("numbers and lists", () => {
  it("groups numbers for the locale", () => {
    expect(formatNumber(1234567.5, "en-US")).toBe("1,234,567.5");
    expect(formatNumber(1234567.5, "de-DE")).toBe("1.234.567,5");
  });

  it("formats a list with the locale's own separator and conjunction", () => {
    expect(formatList(["API", "database", "indexer"], "en-US")).toBe(
      "API, database, and indexer",
    );
    expect(formatList(["API", "database"], "en-US", "disjunction")).toBe("API or database");
  });
});

describe("plural-sensitive text", () => {
  const forms = { one: "{count} payment", other: "{count} payments" };

  it("selects by CLDR plural category, not by count === 1", () => {
    expect(selectPlural(1, forms, "en-US")).toBe("{count} payment");
    expect(selectPlural(0, forms, "en-US")).toBe("{count} payments");
    expect(selectPlural(2, forms, "en-US")).toBe("{count} payments");
  });

  it("uses a language's extra categories when the catalog provides them", () => {
    const polish = { one: "jeden", few: "kilka", many: "wiele", other: "inne" };
    expect(selectPlural(1, polish, "pl-PL")).toBe("jeden");
    expect(selectPlural(3, polish, "pl-PL")).toBe("kilka");
    expect(selectPlural(25, polish, "pl-PL")).toBe("wiele");
  });

  it("falls back to `other` for a category the catalog omits", () => {
    expect(selectPlural(3, { other: "inne" }, "pl-PL")).toBe("inne");
  });

  it("interpolates and formats the count, so the caller never concatenates", () => {
    expect(formatPlural(1, forms, "en-US")).toBe("1 payment");
    expect(formatPlural(1234, forms, "en-US")).toBe("1,234 payments");
    expect(formatPlural(1234, forms, "de-DE")).toBe("1.234 payments");
  });
});

describe("locale resolution", () => {
  it("falls back to the default rather than passing an unknown tag to Intl", () => {
    expect(resolveLocale(undefined)).toBe(DEFAULT_LOCALE);
    expect(resolveLocale("")).toBe(DEFAULT_LOCALE);
    expect(resolveLocale("xx-YY")).toBe(DEFAULT_LOCALE);
    expect(resolveLocale(DEFAULT_LOCALE)).toBe(DEFAULT_LOCALE);
  });

  it("never resolves to the pseudo-locale, which is a test locale only", () => {
    expect(resolveLocale("en-XA")).toBe(DEFAULT_LOCALE);
  });
});
