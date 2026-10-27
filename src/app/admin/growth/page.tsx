import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { getGrowth } from "@/server/growth";
import { isAdminEmail } from "@/lib/admin";
import { formatRelativeTime } from "@/lib/format";
import { HomeBar } from "@/components/shell/HomeBar";
import { GrowthDashboard } from "@/components/analytics/GrowthDashboard";

export const metadata: Metadata = { title: "Growth", robots: { index: false } };
// Always live: these are counts of the signed-in admin's own database.
export const dynamic = "force-dynamic";

export default async function GrowthPage() {
  const session = await auth();
  // A 404, not a 403, so the page's existence is not revealed to anyone who is not an admin.
  if (!session?.user || !isAdminEmail(session.user.email, process.env.ADMIN_EMAILS)) notFound();

  const g = await getGrowth();

  return (
    <>
      <HomeBar email={session.user.email ?? ""} wide />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <GrowthDashboard
          totalUsers={g.totalUsers}
          signups7d={g.signups7d}
          signups30d={g.signups30d}
          daily={g.daily}
          funnelAll={g.funnelAll}
          funnel30d={g.funnel30d}
          sources={g.sources}
          countries={g.countries}
          recent={g.recent.map((r) => ({
            id: r.id,
            email: r.email,
            name: r.name,
            when: formatRelativeTime(r.createdAt),
            source: r.source,
            country: r.country,
            reached: r.reached,
          }))}
        />
      </main>
    </>
  );
}
