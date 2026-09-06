import { createPublicClient, http, type Log } from "viem";
import { celoSepolia } from "viem/chains";
import prisma from "./db.js";
import { REGISTRY_ABI } from "./abi.js";
import { parseSpecies, parseBehavior } from "./types.js";

const POLL_INTERVAL_MS = 5_000;
const MAX_BLOCK_RANGE = 5_000n;

/** Coordinates are stored on-chain as degrees x 1e6. */
function parseCoord(value: bigint): number {
  return Number(value) / 1_000_000;
}

/** Zero means the observation date was never recorded, not 1970. */
function parseObservedAt(value: bigint): Date | null {
  return value === 0n ? null : new Date(Number(value) * 1000);
}

function toRow(log: any) {
  const s = log.args.sighting;
  return {
    latitude:    parseCoord(s.latitude),
    longitude:   parseCoord(s.longitude),
    species:     parseSpecies(s.species),
    count:       Number(s.count),
    behavior:    parseBehavior(s.behavior),
    observedAt:  parseObservedAt(s.observedAt),
    mediaUrl:    s.mediaUrl || null,
    comment:     s.comment || null,
    siteName:    s.siteName || null,
    depthFt:     Number(s.depthFt) || null,
    sizeClass:   s.sizeClass || null,
    reporter:    String(log.args.reporter).toLowerCase(),
    blockNumber: log.blockNumber as bigint,
    txHash:      log.transactionHash as string,
  };
}

async function processLog(log: any) {
  const id = Number(log.args.recordId as bigint);

  if (log.eventName === "RecordVoided") {
    // The record may already be gone if the void is replayed; that is not an error.
    await prisma.record.deleteMany({ where: { id } });
    return;
  }

  // Upsert on both create and update: an update whose create was never indexed
  // (a raised START_BLOCK, a pruned RPC) must not throw, or the poll loop would
  // abort before advancing lastBlock and retry the same range forever.
  const data = toRow(log);
  await prisma.record.upsert({
    where:  { id },
    create: { id, ...data },
    update: data,
  });
}

export async function startListener(
  contractAddress: `0x${string}`,
  rpcUrl: string,
  startBlock: bigint,
) {
  const chain = {
    ...celoSepolia,
    rpcUrls: { default: { http: [rpcUrl] }, public: { http: [rpcUrl] } },
  };
  const client = createPublicClient({ chain, transport: http(rpcUrl) });

  const state = await prisma.indexerState.upsert({
    where:  { id: 1 },
    create: { id: 1, lastBlock: startBlock > 0n ? startBlock - 1n : 0n },
    update: {},
  });
  let lastBlock = state.lastBlock;

  console.log(`Indexer starting from block ${lastBlock}`);

  async function poll() {
    try {
      const latest = await client.getBlockNumber();
      if (lastBlock + 1n > latest) return;

      // Advance the cursor per chunk, so a failure midway does not force a
      // re-scan of everything already committed.
      let chunkFrom = lastBlock + 1n;
      while (chunkFrom <= latest) {
        const chunkTo =
          chunkFrom + MAX_BLOCK_RANGE - 1n < latest ? chunkFrom + MAX_BLOCK_RANGE - 1n : latest;

        const logs = await client.getLogs({
          address: contractAddress,
          events: REGISTRY_ABI as any,
          fromBlock: chunkFrom,
          toBlock: chunkTo,
        });

        for (const log of logs) {
          await processLog(log);
        }

        lastBlock = chunkTo;
        await prisma.indexerState.update({ where: { id: 1 }, data: { lastBlock } });

        if (logs.length > 0) {
          console.log(`Processed ${logs.length} log(s) up to block ${chunkTo}`);
        }
        chunkFrom = chunkTo + 1n;
      }
    } catch (err) {
      console.error("Poll error:", err instanceof Error ? err.message : err);
    }
  }

  setInterval(poll, POLL_INTERVAL_MS);
  poll();
}
