/**
 * Unicode confusable and mixed-script detection for security identifiers (#370).
 *
 * Requirements:
 * - Detect mixed scripts and confusables in security identifiers (issuer names, domains, key labels, IDs).
 * - Render canonical values (e.g. Punycode / ASCII-canonical / NFKC representation).
 * - Require user acknowledgement for risky copy actions when confusables or mixed scripts are detected.
 * - Warnings never rewrite signed identifiers, and bidirectional text remains isolated.
 * - Deterministic, bounded, observable, and compatible with existing authorization and privacy guarantees.
 */

export interface ScriptRange {
  name: string;
  start: number;
  end: number;
}

// Common script Unicode block definitions
const COMMON_SCRIPT_RANGES: ScriptRange[] = [
  { name: "Latin", start: 0x0041, end: 0x024f },
  { name: "Cyrillic", start: 0x0400, end: 0x04ff },
  { name: "Greek", start: 0x0370, end: 0x03ff },
  { name: "Arabic", start: 0x0600, end: 0x06ff },
  { name: "Hebrew", start: 0x0590, end: 0x05ff },
  { name: "Devanagari", start: 0x0900, end: 0x097f },
  { name: "CJK", start: 0x4e00, end: 0x9fff },
  { name: "Hiragana", start: 0x3040, end: 0x309f },
  { name: "Katakana", start: 0x30a0, end: 0x30ff },
];

/**
 * Common visually deceptive character mappings (Cyrillic / Greek / full-width homoglyphs to Latin ASCII).
 * Covers high-risk confusables frequently used in homograph attacks.
 */
export const CONFUSABLE_HOMOGLYPH_MAP: Record<string, string> = {
  // Cyrillic small & capital letters confusable with Latin
  "а": "a", "А": "A", // Cyrillic a
  "с": "c", "С": "C", // Cyrillic es
  "е": "e", "Е": "E", // Cyrillic ie
  "і": "i", "І": "I", // Cyrillic i
  "ј": "j", "Ј": "J", // Cyrillic je
  "о": "o", "О": "O", // Cyrillic o
  "р": "p", "Р": "P", // Cyrillic er
  "ѕ": "s", "Ѕ": "S", // Cyrillic dze
  "х": "x", "Х": "X", // Cyrillic ha
  "у": "y", "У": "Y", // Cyrillic u
  "В": "B",           // Cyrillic ve
  "Н": "H",           // Cyrillic en
  "К": "K",           // Cyrillic ka
  "М": "M",           // Cyrillic em
  "Т": "T",           // Cyrillic te
  // Greek homoglyphs
  "α": "a", "Α": "A",
  "β": "b", "Β": "B",
  "ε": "e", "Ε": "E",
  "η": "n", "Η": "H",
  "ι": "i", "Ι": "I",
  "κ": "k", "Κ": "K",
  "ο": "o", "Ο": "O",
  "ρ": "p", "Ρ": "P",
  "τ": "t", "Τ": "T",
  "υ": "u", "Υ": "Y",
  "χ": "x", "Χ": "X",
  // Punctuation / lookalike symbols
  "⁄": "/", "∕": "/", // fraction / division slashes
  "∶": ":",           // ratio
  "․": ".", "‥": "..", // one dot leader
};

export interface ConfusableAnalysisResult {
  /** Original raw value (never rewritten) */
  originalValue: string;
  /** Whether any confusable homoglyphs or mixed scripts were detected */
  hasRisk: boolean;
  /** List of detected risk reasons */
  reasons: string[];
  /** Detected scripts present in the text */
  detectedScripts: string[];
  /** Whether multiple disparate scripts are mixed (e.g. Latin + Cyrillic) */
  isMixedScript: boolean;
  /** Whether specific homoglyphs were found */
  hasHomoglyphs: boolean;
  /** Individual confusable characters detected: mapping of char -> { replacement, codePoint } */
  confusableChars: Array<{
    char: string;
    codePoint: string;
    suggestedAscii: string;
    index: number;
  }>;
  /**
   * Deterministic canonical representation for visual comparison:
   * Replaces homoglyphs with their ASCII equivalents and applies NFKC normalization.
   * NOTE: Used for canonical preview only — NEVER rewrites signed identifiers.
   */
  canonicalValue: string;
}

/**
 * Identifies the script of a given character code point.
 */
export function getCharacterScript(codePoint: number): string | null {
  // ASCII common characters (digits, punctuation, spaces) are considered neutral Common
  if ((codePoint >= 0x0020 && codePoint <= 0x0040) ||
      (codePoint >= 0x005b && codePoint <= 0x0060) ||
      (codePoint >= 0x007b && codePoint <= 0x007e)) {
    return "Common";
  }

  for (const range of COMMON_SCRIPT_RANGES) {
    if (codePoint >= range.start && codePoint <= range.end) {
      return range.name;
    }
  }

  return "Other";
}

/**
 * Analyzes a string identifier (e.g., issuer name, domain, key label, proof ID)
 * for Unicode confusables, homoglyphs, and mixed scripts.
 */
export function analyzeUnicodeConfusables(value: string): ConfusableAnalysisResult {
  if (!value || typeof value !== "string") {
    return {
      originalValue: value ?? "",
      hasRisk: false,
      reasons: [],
      detectedScripts: [],
      isMixedScript: false,
      hasHomoglyphs: false,
      confusableChars: [],
      canonicalValue: value ?? "",
    };
  }

  const scripts = new Set<string>();
  const confusableChars: ConfusableAnalysisResult["confusableChars"] = [];
  const reasons: string[] = [];

  let canonicalChars = "";

  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    const codePoint = char.codePointAt(0) ?? 0;
    const script = getCharacterScript(codePoint);

    if (script && script !== "Common") {
      scripts.add(script);
    }

    const homoglyph = CONFUSABLE_HOMOGLYPH_MAP[char];
    if (homoglyph) {
      confusableChars.push({
        char,
        codePoint: `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`,
        suggestedAscii: homoglyph,
        index: i,
      });
      canonicalChars += homoglyph;
    } else {
      canonicalChars += char;
    }
  }

  const detectedScripts = Array.from(scripts);
  // Mixed script risk if 2 or more distinct alphabetic/ideographic scripts are detected (e.g. Latin + Cyrillic)
  const isMixedScript = detectedScripts.length > 1;
  const hasHomoglyphs = confusableChars.length > 0;

  if (isMixedScript) {
    reasons.push(`Mixed scripts detected (${detectedScripts.join(", ")}), which may visually disguise the identifier.`);
  }

  if (hasHomoglyphs) {
    const uniqueChars = Array.from(new Set(confusableChars.map((c) => `${c.char} (${c.codePoint} -> ${c.suggestedAscii})`)));
    reasons.push(`Visually confusable Unicode homoglyphs detected: ${uniqueChars.join(", ")}.`);
  }

  // Canonical value is NFKC normalized canonical representation
  const canonicalValue = canonicalChars.normalize("NFKC");
  const hasRisk = isMixedScript || hasHomoglyphs;

  return {
    originalValue: value,
    hasRisk,
    reasons,
    detectedScripts,
    isMixedScript,
    hasHomoglyphs,
    confusableChars,
    canonicalValue,
  };
}
