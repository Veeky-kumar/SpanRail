// Read-only queries for the admin growth page. Everything is counted from rows the app already stores (users and
// their projects, keys and observations), so the numbers cannot drift from what actually happened.
import { Prisma } from "@prisma/client";
import { funnelOf, furthestStep, sourceLabel, type FunnelCounts, type FunnelStep, type FunnelStepId } from "@/lib/growth";
import { prisma } from "./db";

export interface DailySignups {
  day: string; // YYYY-MM-DD
  count: number;
}

export interface SourceRow {
  label: string;
  count: number;
}

export interface RecentSignup {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
  source: string;
  country: string | null;
  reached: FunnelStepId;
}

export interface GrowthData {
  totalUsers: number;
  signups7d: number;
  signups30d: number;
  daily: DailySignups[];
  funnelAll: FunnelStep[];
  funnel30d: FunnelStep[];
  sources: SourceRow[];
  countries: SourceRow[];
  recent: RecentSignup[];
}

// One row per user with the four things they may have done. A user "has" a project, key or trace if they are a member
// of a project that does.
const USER_FLAGS = Prisma.sql`
  SELECT u.id, u.email, u.name, u."createdAt",
    u."signupReferrer", u."signupUtmSource", u."signupCountry",
    EXISTS (SELECT 1 FROM "ProjectMember" m WHERE m."userId" = u.id) AS project,
    EXISTS (SELECT 1 FROM "ProjectMember" m JOIN "ApiKey" k ON k."projectId" = m."projectId" WHERE m."userId" = u.id) AS api_key,
    EXISTS (SELECT 1 FROM "ProjectMember" m JOIN "Observation" o ON o."projectId" = m."projectId"
            WHERE m."userId" = u.id AND o."parentObservationId" IS NULL) AS trace,
    EXISTS (SELECT 1 FROM "ProjectMember" m JOIN "Observation" o ON o."projectId" = m."projectId"
            WHERE m."userId" = u.id AND o.type = 'GENERATION' AND o.metadata->'gateway'->'timingMs' IS NOT NULL) AS gateway
  FROM "User" u`;

interface FlagRow {
  signed_up: number;
  project: number;
  api_key: number;
  trace: number;
  gateway: number;
}

const countsOf = (r: FlagRow | undefined): FunnelCounts => ({
  signedUp: r?.signed_up ?? 0,
  project: r?.project ?? 0,
  apiKey: r?.api_key ?? 0,
  trace: r?.trace ?? 0,
  gateway: r?.gateway ?? 0,
});

export async function getGrowth(): Promise<GrowthData> {
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const funnelQuery = (where: Prisma.Sql) => prisma.$queryRaw<FlagRow[]>`
    WITH f AS (${USER_FLAGS} ${where})
    SELECT count(*)::int AS signed_up,
      (count(*) FILTER (WHERE project))::int AS project,
      (count(*) FILTER (WHERE api_key))::int AS api_key,
      (count(*) FILTER (WHERE trace))::int AS trace,
      (count(*) FILTER (WHERE gateway))::int AS gateway
    FROM f`;

  const [all, last30, daily, sources, countries, recent, signups7d] = await Promise.all([
    funnelQuery(Prisma.empty),
    funnelQuery(Prisma.sql`WHERE u."createdAt" >= ${since30}`),
    prisma.$queryRaw<{ day: string; count: number }[]>`
      SELECT to_char(d, 'YYYY-MM-DD') AS day,
        (SELECT count(*)::int FROM "User" u WHERE u."createdAt" >= d AND u."createdAt" < d + interval '1 day') AS count
      FROM generate_series(date_trunc('day', ${since30}::timestamp), date_trunc('day', now()::timestamp), interval '1 day') AS d
      ORDER BY d`,
    prisma.$queryRaw<{ label: string; count: number }[]>`
      SELECT coalesce("signupUtmSource", "signupReferrer", 'direct') AS label, count(*)::int AS count
      FROM "User" GROUP BY 1 ORDER BY count DESC, label LIMIT 10`,
    prisma.$queryRaw<{ label: string; count: number }[]>`
      SELECT "signupCountry" AS label, count(*)::int AS count
      FROM "User" WHERE "signupCountry" IS NOT NULL GROUP BY 1 ORDER BY count DESC, label LIMIT 10`,
    prisma.$queryRaw<
      {
        id: string; email: string; name: string | null; createdAt: Date;
        signupReferrer: string | null; signupUtmSource: string | null; signupCountry: string | null;
        project: boolean; api_key: boolean; trace: boolean; gateway: boolean;
      }[]
    >`SELECT * FROM (${USER_FLAGS}) f ORDER BY "createdAt" DESC LIMIT 25`,
    prisma.user.count({ where: { createdAt: { gte: since7 } } }),
  ]);

  const allCounts = countsOf(all[0]);
  return {
    totalUsers: allCounts.signedUp,
    signups7d,
    signups30d: last30[0]?.signed_up ?? 0,
    daily: daily.map((d) => ({ day: d.day, count: d.count })),
    funnelAll: funnelOf(allCounts),
    funnel30d: funnelOf(countsOf(last30[0])),
    sources: sources.map((s) => ({ label: s.label, count: s.count })),
    countries: countries.map((c) => ({ label: c.label, count: c.count })),
    recent: recent.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      createdAt: r.createdAt,
      source: sourceLabel({ referrer: r.signupReferrer, utmSource: r.signupUtmSource }),
      country: r.signupCountry,
      reached: furthestStep({ project: r.project, apiKey: r.api_key, trace: r.trace, gateway: r.gateway }),
    })),
  };
}
