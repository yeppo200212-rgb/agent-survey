export interface BehavioralSignals {
  processingMs?: number;
  selfReportedTokens?: number;
  acceptedAt?: string;
  submittedAt?: string;
  retryCount?: number;
}

/**
 * Sanitizes and normalizes incoming behavioral hints from the SDK.
 * Accepts loose input and returns a clean, typed object.
 */
export function normalizeBehavioralSignals(hints: Record<string, unknown>): BehavioralSignals {
  if (!hints || typeof hints !== 'object') {
    return {};
  }

  const signals: BehavioralSignals = {};

  // processingMs — must be positive integer
  if (hints.processingMs !== undefined) {
    const ms = Number(hints.processingMs);
    if (Number.isFinite(ms) && ms >= 0) {
      signals.processingMs = Math.round(ms);
    }
  }

  // Derive processingMs from acceptedAt/submittedAt if not provided
  if (signals.processingMs === undefined && hints.acceptedAt && hints.submittedAt) {
    try {
      const accepted = new Date(hints.acceptedAt as string).getTime();
      const submitted = new Date(hints.submittedAt as string).getTime();
      if (!isNaN(accepted) && !isNaN(submitted) && submitted > accepted) {
        signals.processingMs = submitted - accepted;
      }
    } catch {
      // ignore date parse errors
    }
  }

  // selfReportedTokens — positive integer
  if (hints.selfReportedTokens !== undefined) {
    const tokens = Number(hints.selfReportedTokens);
    if (Number.isFinite(tokens) && tokens > 0) {
      signals.selfReportedTokens = Math.round(tokens);
    }
  }

  // acceptedAt — ISO 8601 string
  if (hints.acceptedAt && typeof hints.acceptedAt === 'string') {
    try {
      const d = new Date(hints.acceptedAt);
      if (!isNaN(d.getTime())) {
        signals.acceptedAt = d.toISOString();
      }
    } catch {
      // ignore
    }
  }

  // submittedAt — ISO 8601 string
  if (hints.submittedAt && typeof hints.submittedAt === 'string') {
    try {
      const d = new Date(hints.submittedAt);
      if (!isNaN(d.getTime())) {
        signals.submittedAt = d.toISOString();
      }
    } catch {
      // ignore
    }
  }

  // retryCount — non-negative integer
  if (hints.retryCount !== undefined) {
    const retries = Number(hints.retryCount);
    if (Number.isFinite(retries) && retries >= 0) {
      signals.retryCount = Math.round(retries);
    }
  }

  return signals;
}
