import prisma from "./db.js";
import type { Prisma } from "@prisma/client";

const MAX_LIMIT = 1000;

interface RecordsFilter {
  species?: string;
  behavior?: string;
  reporter?: string;
  siteName?: string;
  observedAtGt?: string;
  observedAtGte?: string;
  observedAtLt?: string;
  observedAtLte?: string;
}

/** Ignore unparseable dates rather than silently filtering everything out. */
function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function buildWhere(filter?: RecordsFilter): Prisma.RecordWhereInput {
  if (!filter) return {};
  const where: Prisma.RecordWhereInput = {};
  if (filter.species) where.species = filter.species;
  if (filter.behavior) where.behavior = filter.behavior;
  if (filter.reporter) where.reporter = filter.reporter.toLowerCase();
  if (filter.siteName) where.siteName = filter.siteName;

  const gt  = parseDate(filter.observedAtGt);
  const gte = parseDate(filter.observedAtGte);
  const lt  = parseDate(filter.observedAtLt);
  const lte = parseDate(filter.observedAtLte);
  if (gt || gte || lt || lte) {
    const range: Prisma.DateTimeNullableFilter = {};
    if (gt)  range.gt  = gt;
    if (gte) range.gte = gte;
    if (lt)  range.lt  = lt;
    if (lte) range.lte = lte;
    where.observedAt = range;
  }
  return where;
}

function serializeRecord(r: Prisma.RecordGetPayload<object>) {
  return {
    ...r,
    blockNumber: r.blockNumber.toString(),
    observedAt:  r.observedAt?.toISOString() ?? null,
    createdAt:   r.createdAt.toISOString(),
    updatedAt:   r.updatedAt.toISOString(),
  };
}

export const resolvers = {
  Query: {
    records: async (
      _: unknown,
      { limit = 50, offset = 0, filter }: { limit?: number; offset?: number; filter?: RecordsFilter },
    ) => {
      const take = Math.min(Math.max(limit, 0), MAX_LIMIT);
      const skip = Math.max(offset, 0);
      const where = buildWhere(filter);

      const [items, total] = await Promise.all([
        prisma.record.findMany({ where, take, skip, orderBy: { id: "desc" } }),
        prisma.record.count({ where }),
      ]);

      return {
        items: items.map(serializeRecord),
        total,
        hasMore: skip + items.length < total,
      };
    },

    record: async (_: unknown, { id }: { id: number }) => {
      const r = await prisma.record.findUnique({ where: { id } });
      return r ? serializeRecord(r) : null;
    },

    sites: async () => {
      const rows = await prisma.record.findMany({
        where: { siteName: { not: null } },
        distinct: ["siteName"],
        select: { siteName: true },
        orderBy: { siteName: "asc" },
      });
      return rows.map((r) => r.siteName!);
    },

    speciesCounts: async (_: unknown, { filter }: { filter?: RecordsFilter }) => {
      const grouped = await prisma.record.groupBy({
        by: ["species"],
        where: buildWhere(filter),
        _count: { species: true },
      });
      return grouped
        .map((g) => ({ species: g.species, count: g._count.species }))
        .sort((a, b) => b.count - a.count);
    },
  },
};
