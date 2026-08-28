/**
 * Localization readiness helpers. See `lib/i18n/README.md` for the
 * conventions these exist to make cheap to follow.
 */

export {
  DEFAULT_LOCALE,
  PSEUDO_LOCALE,
  SUPPORTED_LOCALES,
  isPseudoLocaleEnabled,
  resolveLocale,
  type SupportedLocale,
} from "./locale";

export {
  formatDate,
  formatDateRange,
  formatDateTime,
  formatList,
  formatNumber,
  formatPlural,
  formatRelativeTime,
  formatTime,
  selectPlural,
  type PluralForms,
} from "./format";

export {
  defineMessages,
  formatMessage,
  type MessageCatalog,
  type OwnedMessages,
} from "./messages";

export {
  EXPANSION_RATIO,
  PSEUDO_PREFIX,
  PSEUDO_SUFFIX,
  countPseudoRuns,
  pseudoLocalize,
  pseudoLocalizeDeep,
  stripPseudoDelimiters,
  type PseudoLocalizeOptions,
} from "./pseudo-locale";
