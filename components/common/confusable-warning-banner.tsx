"use client";

import { ReactNode, useState, useId } from "react";
import {
  analyzeUnicodeConfusables,
  type ConfusableAnalysisResult,
} from "@/lib/security/unicode-confusables";
import {
  BIDI_ISOLATE_STYLE,
  makeBidiSafeForDisplay,
  stripBidiControlCharacters,
} from "@/lib/i18n/bidi-isolation";

export interface ConfusableWarningBadgeProps {
  analysis: ConfusableAnalysisResult;
  onAcknowledge?: () => void;
  isAcknowledged?: boolean;
}

/**
 * Visual warning banner and canonical inspection panel for confusable security identifiers.
 *
 * Requirements:
 * - Warnings never rewrite signed identifiers
 * - Bidirectional text remains isolated
 * - Canonical representation rendered for visual comparison
 */
export function ConfusableWarningBanner({
  analysis,
  isAcknowledged,
  onAcknowledge,
}: ConfusableWarningBadgeProps) {
  const [showDetails, setShowDetails] = useState(false);
  const detailsId = useId();

  if (!analysis.hasRisk) {
    return null;
  }

  const { displayValue: isolatedOriginal } = makeBidiSafeForDisplay(analysis.originalValue);
  const { displayValue: isolatedCanonical } = makeBidiSafeForDisplay(analysis.canonicalValue);

  return (
    <div
      role="alert"
      className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-amber-100 uppercase tracking-wide">
            Deceptive Identifier Warning
          </span>
          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-mono text-amber-300">
            Confusable / Mixed-Script
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowDetails((prev) => !prev)}
          aria-expanded={showDetails}
          aria-controls={detailsId}
          className="text-amber-300 underline underline-offset-2 hover:text-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
        >
          {showDetails ? "Hide details" : "Inspect canonical value"}
        </button>
      </div>

      <p className="mt-1.5 text-amber-200/90 leading-relaxed">
        This identifier contains mixed scripts or visually confusable Unicode characters that may disguise its true identity.
      </p>

      {showDetails && (
        <div id={detailsId} className="mt-2.5 space-y-2 border-t border-amber-500/30 pt-2 text-slate-300">
          <ul className="list-disc pl-4 space-y-1 text-[11px] text-amber-200/80">
            {analysis.reasons.map((reason, idx) => (
              <li key={idx}>{reason}</li>
            ))}
          </ul>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 pt-1 font-mono text-[11px]">
            <div className="rounded bg-black/40 p-2 border border-white/10">
              <span className="block text-[10px] uppercase text-slate-400 font-sans">
                Original (Raw Value):
              </span>
              <span
                dir="ltr"
                style={BIDI_ISOLATE_STYLE}
                className="text-amber-200 break-all select-all"
              >
                {isolatedOriginal}
              </span>
            </div>
            <div className="rounded bg-black/40 p-2 border border-cyan-500/30">
              <span className="block text-[10px] uppercase text-cyan-300 font-sans">
                Canonical (ASCII / Normalized):
              </span>
              <span
                dir="ltr"
                style={BIDI_ISOLATE_STYLE}
                className="text-cyan-200 break-all select-all"
              >
                {isolatedCanonical}
              </span>
            </div>
          </div>
        </div>
      )}

      {onAcknowledge && (
        <div className="mt-2.5 flex items-center gap-2 pt-1.5 border-t border-amber-500/20">
          <label className="flex items-center gap-2 cursor-pointer text-amber-100 select-none">
            <input
              type="checkbox"
              checked={isAcknowledged ?? false}
              onChange={(e) => {
                if (e.target.checked) onAcknowledge();
              }}
              className="h-3.5 w-3.5 rounded border-amber-400 bg-transparent text-amber-500 focus:ring-amber-400"
            />
            <span>I acknowledge the deceptive character risk for this identifier</span>
          </label>
        </div>
      )}
    </div>
  );
}

export interface RiskyCopyDialogProps {
  isOpen: boolean;
  analysis: ConfusableAnalysisResult;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Modal / confirmation dialog required before copying an identifier with detected confusables.
 */
export function RiskyCopyConfirmationDialog({
  isOpen,
  analysis,
  onConfirm,
  onCancel,
}: RiskyCopyDialogProps) {
  if (!isOpen) return null;

  const { displayValue: isolatedOriginal } = makeBidiSafeForDisplay(analysis.originalValue);
  const { displayValue: isolatedCanonical } = makeBidiSafeForDisplay(analysis.canonicalValue);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="risky-copy-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <div className="w-full max-w-md rounded-lg border border-amber-400/50 bg-slate-900 p-6 shadow-xl text-white">
        <h3 id="risky-copy-title" className="text-lg font-semibold text-amber-200">
          Acknowledge Risky Identifier Copy
        </h3>
        <p className="mt-2 text-sm text-slate-300 leading-relaxed">
          The identifier you are copying contains visually confusable Unicode characters or mixed scripts. Please review the canonical equivalent before proceeding:
        </p>

        <div className="mt-3 space-y-2 rounded bg-black/50 p-3 border border-white/10 font-mono text-xs">
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-sans">Raw signed identifier:</span>
            <span dir="ltr" style={BIDI_ISOLATE_STYLE} className="text-amber-300 break-all">
              {isolatedOriginal}
            </span>
          </div>
          <div>
            <span className="text-cyan-400 block text-[10px] uppercase font-sans">Canonical preview:</span>
            <span dir="ltr" style={BIDI_ISOLATE_STYLE} className="text-cyan-300 break-all">
              {isolatedCanonical}
            </span>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-white/20 px-4 py-2 text-sm text-slate-300 hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-amber-300"
          >
            Acknowledge & Copy
          </button>
        </div>
      </div>
    </div>
  );
}
