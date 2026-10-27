import Link from "next/link";
import { auth } from "@/server/auth";
import { listUserProjects } from "@/server/projects";
import { getHomeData } from "@/server/home";
import { formatRelativeTime } from "@/lib/format";
import { nextStepOf, setupSteps } from "@/lib/setupProgress";
import { HomeBar } from "@/components/shell/HomeBar";
import { HomeRail } from "@/components/home/HomeRail";
import { LatestCall } from "@/components/home/LatestCall";
import { Landing } from "@/components/landing/Landing";
import { OnThisPage, type PageSection } from "@/components/landing/OnThisPage";
import { SubmitButton } from "@/components/SubmitButton";
import { createProjectAction } from "./actions";

// Signed-out visitors see the landing page at this URL, so only signed-in views get the "Projects" title.
export async function generateMetadata() {
  const session = await auth();
  return session?.user ? { title: "Projects" } : {};
}

const SECTIONS: PageSection[] = [
  { id: "latest-call", label: "Your latest call" },
  { id: "projects", label: "Projects" },
  { id: "getting-started", label: "Getting started" },
  { id: "guides", label: "Self-hosting guides" },
  { id: "whats-new", label: "What's new" },
];

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) return <Landing />;

  const projects = await listUserProjects(session.user.id);
  const home = await getHomeData(projects.map((p) => ({ id: p.id, name: p.name })));
  const steps = setupSteps(home.progress, projects[0]?.id ?? null);

  return (
    <>
      <HomeBar email={session.user.email ?? ""} />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 xl:grid xl:grid-cols-[15rem_minmax(0,1fr)_11rem] xl:gap-10">
        <main className="order-1 min-w-0 xl:order-2">
          <section id="latest-call" aria-labelledby="latest-title" className="scroll-mt-20 pb-12 pt-10 xl:pt-16">
            <h1 id="latest-title" className="display">
              {home.latest ? "Where your latest call spent its time." : "See where a call spends its time."}
            </h1>
            <p className="mt-3 max-w-xl text-base text-muted">
              {home.latest
                ? "The newest call that went through your gateway, drawn to scale from the milliseconds it measured."
                : "Route a client through the gateway and your own calls appear here, one block per phase of the round trip."}
            </p>
            <div className="mt-8">
              <LatestCall latest={home.latest} next={nextStepOf(steps)} />
            </div>
          </section>

          <div className="ruler-band" aria-hidden />

          <section id="projects" aria-labelledby="projects-title" className="scroll-mt-20 py-12">
            <h2 id="projects-title" className="text-2xl font-semibold tracking-[-0.02em]">
              Projects
            </h2>
            <p className="mt-1 text-sm text-muted">Each project has its own traces, prompts, datasets and API keys.</p>

            {projects.length === 0 ? (
              <p className="mt-6 max-w-xl rounded-data border border-rule bg-surface px-5 py-6 text-sm text-muted">
                You have no projects yet. Create one below, then follow the checklist to send your first trace.
              </p>
            ) : (
              <div className="mt-6 overflow-x-auto rounded-data border border-rule bg-surface">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-rule text-left text-xs text-muted">
                      <th className="px-4 py-2.5 font-medium">Name</th>
                      <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Project ID</th>
                      <th className="px-4 py-2.5 text-right font-medium">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((project) => (
                      <tr key={project.id} className="border-b border-border transition-colors duration-100 last:border-b-0 hover:bg-canvas/60">
                        <td className="px-4 py-3">
                          <Link href={`/projects/${project.id}`} className="font-medium hover:underline">
                            {project.name}
                          </Link>
                        </td>
                        <td className="hidden px-4 py-3 font-mono text-xs text-muted sm:table-cell">{project.id}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-muted">
                          {formatRelativeTime(project.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <form action={createProjectAction} className="mt-6 flex gap-2">
              <label htmlFor="project-name" className="sr-only">
                New project name
              </label>
              <input id="project-name" name="name" required placeholder="New project name" className="input flex-1" />
              <SubmitButton pendingLabel="Creating…" className="btn-primary pressable">
                Create project
              </SubmitButton>
            </form>
          </section>
        </main>

        <HomeRail summary={home.summary} steps={steps} />

        <aside className="order-3 hidden xl:block">
          <div className="pt-16">
            <OnThisPage sections={SECTIONS} />
          </div>
        </aside>
      </div>
    </>
  );
}
