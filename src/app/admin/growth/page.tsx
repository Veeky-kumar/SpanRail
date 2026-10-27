import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { getGrowth, type SourceRow } from "@/server/growth";
import { isAdminEmail } from "@/lib/admin";
import { formatRelativeTime } from "@/lib/format";
import type { FunnelStep, FunnelStepId } from "@/lib/growth";
import { HomeBar } from "@/components/shell/HomeBar";

export const metadata: Metadata = { title: "Growth", robots: { index: false } };
// Always live: these are counts of the signed-in admin's own database.
export const dynamic = "force-dynamic";

const REACHED: Record<FunnelStepId, string> = {
  "signed-up": "Signed up",
  project: "Created a project",
  "api-key": "Created an API key",
  "first-trace": "Sent a trace",
  "gateway-call": "Sent a gateway call",
};

function Funnel({ title, steps }: { title: string; steps: FunnelStep[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ol className="mt-4 space-y-3">
        {steps.map((s) => (
          <li key={s.id}>
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <span>{s.label}</span>
              <span className="tabular-nums text-muted">
                <span className="font-medium text-ink">{s.count}</span>
                {s.pctOfSignups !== null ? ` · ${s.pctOfSignups}%` : ""}
                {s.pctOfPrevious !== null && s.id !== "signed-up" && s.id !== "project" ? ` · ${s.pctOfPrevious}% of the step before` : ""}
              </span>
            </div>
            <div className="mt-1.5 h-2 bg-rule/60" role="img" aria-label={`${s.label}: ${s.count}`}>
              <div className="h-2 bg-accent" style={{ width: `${s.pctOfSignups ?? 0}%` }} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Rank({ title, rows, empty }: { title: string; rows: SourceRow[]; empty: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{empty}</p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-rule">
                <td className="py-2 pr-4">{r.label}</td>
                <td className="py-2 text-right tabular-nums">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default async function GrowthPage() {
  const session = await auth();
  // A 404, not a 403, so the page's existence is not revealed to anyone who is not an admin.
  if (!session?.user || !isAdminEmail(session.user.email, process.env.ADMIN_EMAILS)) notFound();

  const g = await getGrowth();
  const peak = Math.max(1, ...g.daily.map((d) => d.count));

  return (
    <>
      <HomeBar email={session.user.email ?? ""} />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Growth</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Who signed up, where they came from, and how far they got. Counted from your own database. Page views and
          visitors are in Umami, if you have set it up.
        </p>

        <dl className="mt-8 grid grid-cols-3 gap-6 border-y border-rule py-5">
          {[
            ["Accounts", g.totalUsers],
            ["Last 7 days", g.signups7d],
            ["Last 30 days", g.signups30d],
          ].map(([label, value]) => (
            <div key={label as string}>
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>

        <section aria-labelledby="daily-title" className="mt-10">
          <h2 id="daily-title" className="text-lg font-semibold">
            Signups per day
          </h2>
          <div className="mt-4 flex h-24 items-end gap-1" role="img" aria-label={`Signups per day over the last 30 days, peak ${peak}`}>
            {g.daily.map((d) => (
              <div
                key={d.day}
                title={`${d.day}: ${d.count}`}
                className={d.count > 0 ? "flex-1 bg-accent" : "flex-1 bg-rule"}
                style={{ height: `${d.count > 0 ? Math.max(6, (d.count / peak) * 100) : 3}%` }}
              />
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-xs text-muted">
            <span>{g.daily[0]?.day}</span>
            <span>{g.daily[g.daily.length - 1]?.day}</span>
          </div>
        </section>

        <section aria-labelledby="funnel-title" className="mt-12">
          <h2 id="funnel-title" className="text-lg font-semibold">
            How far people get
          </h2>
          <div className="mt-5 grid gap-10 md:grid-cols-2">
            <Funnel title="Everyone" steps={g.funnelAll} />
            <Funnel title="Signed up in the last 30 days" steps={g.funnel30d} />
          </div>
        </section>

        <section aria-labelledby="sources-title" className="mt-12">
          <h2 id="sources-title" className="text-lg font-semibold">
            Where they came from
          </h2>
          <div className="mt-5 grid gap-10 md:grid-cols-2">
            <Rank title="Source" rows={g.sources} empty="No signups yet." />
            <Rank
              title="Country"
              rows={g.countries}
              empty="No country recorded. It comes from a header your host's edge network adds, and may be absent."
            />
          </div>
        </section>

        <section aria-labelledby="recent-title" className="mt-12">
          <h2 id="recent-title" className="text-lg font-semibold">
            Recent signups
          </h2>
          {g.recent.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nobody has signed up yet.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th className="pb-2 pr-4 font-normal">Account</th>
                    <th className="pb-2 pr-4 font-normal">When</th>
                    <th className="pb-2 pr-4 font-normal">Source</th>
                    <th className="pb-2 pr-4 font-normal">Country</th>
                    <th className="pb-2 font-normal">Got as far as</th>
                  </tr>
                </thead>
                <tbody>
                  {g.recent.map((r) => (
                    <tr key={r.id} className="border-t border-rule align-top">
                      <td className="max-w-[14rem] truncate py-2 pr-4" title={r.email}>
                        {r.email}
                        {r.name ? <span className="block text-xs text-muted">{r.name}</span> : null}
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap text-muted">{formatRelativeTime(r.createdAt)}</td>
                      <td className="py-2 pr-4">{r.source}</td>
                      <td className="py-2 pr-4">{r.country ?? "—"}</td>
                      <td className="py-2">{REACHED[r.reached]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
