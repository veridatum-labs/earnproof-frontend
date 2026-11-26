import {
  analyzeUnicodeConfusables,
  getCharacterScript,
  CONFUSABLE_HOMOGLYPH_MAP,
} from "../unicode-confusables";

describe("Unicode Confusables and Mixed Script Detection", () => {
  describe("getCharacterScript", () => {
    it("identifies Latin characters", () => {
      expect(getCharacterScript("A".charCodeAt(0))).toBe("Latin");
      expect(getCharacterScript("z".charCodeAt(0))).toBe("Latin");
    });

    it("identifies Cyrillic characters", () => {
      expect(getCharacterScript("а".charCodeAt(0))).toBe("Cyrillic");
      expect(getCharacterScript("Б".charCodeAt(0))).toBe("Cyrillic");
    });

    it("identifies Greek characters", () => {
      expect(getCharacterScript("α".charCodeAt(0))).toBe("Greek");
      expect(getCharacterScript("Ω".charCodeAt(0))).toBe("Greek");
    });

    it("identifies Common characters", () => {
      expect(getCharacterScript("0".charCodeAt(0))).toBe("Common");
      expect(getCharacterScript("-".charCodeAt(0))).toBe("Common");
      expect(getCharacterScript(" ".charCodeAt(0))).toBe("Common");
    });
  });

  describe("analyzeUnicodeConfusables — positive detection", () => {
    it("detects mixed Latin and Cyrillic homoglyphs in an issuer name", () => {
      // "pаypal" with Cyrillic 'а' (U+0430)
      const deceptiveInput = "p\u0430ypal";
      const result = analyzeUnicodeConfusables(deceptiveInput);

      expect(result.hasRisk).toBe(true);
      expect(result.isMixedScript).toBe(true);
      expect(result.hasHomoglyphs).toBe(true);
      expect(result.detectedScripts).toContain("Latin");
      expect(result.detectedScripts).toContain("Cyrillic");
      expect(result.confusableChars).toHaveLength(1);
      expect(result.confusableChars[0].codePoint).toBe("U+0430");
      expect(result.canonicalValue).toBe("paypal");
      // Original signed value must be preserved without rewriting
      expect(result.originalValue).toBe(deceptiveInput);
    });

    it("detects Greek homoglyphs in a key label", () => {
      // "vеridatum" with Cyrillic 'е' (U+0435)
      const input = "v\u0435ridatum";
      const result = analyzeUnicodeConfusables(input);

      expect(result.hasRisk).toBe(true);
      expect(result.hasHomoglyphs).toBe(true);
      expect(result.canonicalValue).toBe("veridatum");
    });

    it("detects mixed scripts without homoglyphs", () => {
      // Latin letters followed by Hebrew
      const input = "Issuerשָׁלוֹם";
      const result = analyzeUnicodeConfusables(input);

      expect(result.hasRisk).toBe(true);
      expect(result.isMixedScript).toBe(true);
      expect(result.detectedScripts).toContain("Latin");
      expect(result.detectedScripts).toContain("Hebrew");
    });
  });

  describe("analyzeUnicodeConfusables — negative / clean identifiers", () => {
    it("reports no risk for pure ASCII alphanumeric identifiers", () => {
      const cleanAddress = "GA7QYNF7SOWQ3GLR2BGMZEHXAVAVGVHWGD5CDGDRA7VYAGF5D5MFBXBW";
      const result = analyzeUnicodeConfusables(cleanAddress);

      expect(result.hasRisk).toBe(false);
      expect(result.isMixedScript).toBe(false);
      expect(result.hasHomoglyphs).toBe(false);
      expect(result.confusableChars).toHaveLength(0);
      expect(result.canonicalValue).toBe(cleanAddress);
    });

    it("reports no risk for single-script non-Latin text without homoglyphs", () => {
      const cyrillicPure = "Иван";
      const result = analyzeUnicodeConfusables(cyrillicPure);

      expect(result.isMixedScript).toBe(false);
      expect(result.detectedScripts).toEqual(["Cyrillic"]);
    });
  });

  describe("analyzeUnicodeConfusables — boundaries", () => {
    it("handles empty strings safely", () => {
      const result = analyzeUnicodeConfusables("");
      expect(result.hasRisk).toBe(false);
      expect(result.originalValue).toBe("");
    });

    it("handles non-string values gracefully", () => {
      // @ts-expect-error testing invalid type boundary
      const result = analyzeUnicodeConfusables(null);
      expect(result.hasRisk).toBe(false);
    });
  });
});
