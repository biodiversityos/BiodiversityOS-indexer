import prisma from "./db.js";

/**
 * Liveness is not the useful question here: the indexer can sit in its poll
 * loop for hours while getting nowhere, which is exactly what a stuck RPC or a
 * throwing write looks like. Health is therefore "did a poll succeed recently",
 * not "is the process running".
 */
const STALE_AFTER_MS = 120_000;

let lastPollOk: number | null = null;
let lastPollError: string | null = null;

export function recordPollSuccess(): void {
  lastPollOk = Date.now();
  lastPollError = null;
}

export function recordPollFailure(message: string): void {
  lastPollError = message;
}

export interface Health {
  ok: boolean;
  reason?: string;
  lastBlock: string | null;
  records: number | null;
  secondsSinceLastPoll: number | null;
  lastPollError: string | null;
}

export async function checkHealth(): Promise<Health> {
  let lastBlock: string | null = null;
  let records: number | null = null;

  try {
    const [state, count] = await Promise.all([
      prisma.indexerState.findUnique({ where: { id: 1 } }),
      prisma.record.count(),
    ]);
    lastBlock = state?.lastBlock.toString() ?? null;
    records = count;
  } catch (err) {
    return {
      ok: false,
      reason: `database unreachable: ${err instanceof Error ? err.message : err}`,
      lastBlock: null,
      records: null,
      secondsSinceLastPoll: lastPollOk ? Math.round((Date.now() - lastPollOk) / 1000) : null,
      lastPollError,
    };
  }

  const sinceMs = lastPollOk === null ? null : Date.now() - lastPollOk;
  const secondsSinceLastPoll = sinceMs === null ? null : Math.round(sinceMs / 1000);

  // Before the first poll completes there is nothing to be stale about yet.
  if (sinceMs !== null && sinceMs > STALE_AFTER_MS) {
    return {
      ok: false,
      reason: `no successful poll for ${secondsSinceLastPoll}s`,
      lastBlock, records, secondsSinceLastPoll, lastPollError,
    };
  }

  return { ok: true, lastBlock, records, secondsSinceLastPoll, lastPollError };
}
