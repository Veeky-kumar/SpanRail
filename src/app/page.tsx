import Link from "next/link";
import { auth } from "@/server/auth";
import { listUserProjects } from "@/server/projects";
import { formatRelativeTime } from "@/lib/format";
import { HomeBar } from "@/components/shell/HomeBar";
import { Landing } from "@/components/landing/Landing";
import { SubmitButton } from "@/components/SubmitButton";
import { createProjectAction } from "./actions";

// Signed-out visitors see the landing page at this URL, so only signed-in views get the "Projects" title.
export async function generateMetadata() {
  const session = await auth();
  return session?.user ? { title: "Projects" } : {};
}

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) return <Landing />;

  const projects = await listUserProjects(session.user.id);

  return (
    <>
      <HomeBar email={session.user.email ?? ""} />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Projects</h1>
        <p className="mt-1 text-sm text-muted">Each project has its own traces, prompts, datasets and API keys.</p>

        {projects.length === 0 ? (
          <section className="mt-8 rounded-data border border-rule bg-surface p-6">
            <h2 className="text-base font-semibold">Create your first project</h2>
            <p className="mt-1 max-w-prose text-sm text-muted">
              A project keeps one application&apos;s traces together. Once it exists, create an API key in its settings
              and start the gateway to see where each call&apos;s time goes.
            </p>
            <ol className="mt-4 space-y-1.5 text-sm">
              <li>Create a project below.</li>
              <li>Open Settings and create an API key. Copy the secret; it is shown once.</li>
              <li>Start the gateway with that key and point your client at it.</li>
            </ol>
            <pre className="mt-4 overflow-x-auto rounded-data bg-canvas p-3 font-mono text-xs leading-relaxed">
{`export TRACEWELL_PUBLIC_KEY=pk-tw-...
export TRACEWELL_SECRET_KEY=sk-tw-...
docker compose --profile gateway up -d --build gateway`}
            </pre>
          </section>
        ) : (
          <div className="mt-8 overflow-x-auto rounded-data border border-rule bg-surface">
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
      </main>
    </>
  );
}
