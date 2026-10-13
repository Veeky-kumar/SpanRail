import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { listUserProjects } from "@/server/projects";
import { createProjectAction, logoutAction } from "./actions";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const projects = await listUserProjects(session.user.id);

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tracewell</h1>
          <p className="mt-2 text-sm text-muted">Self-hostable LLM observability, evaluation, and prompt management.</p>
        </div>
        <form action={logoutAction}>
          <button type="submit" className="pressable text-xs text-muted hover:text-ink">
            Sign out ({session.user.email})
          </button>
        </form>
      </div>

      <div className="mt-10 space-y-2">
        {projects.length === 0 && (
          <div className="rounded-xl border border-border bg-surface px-5 py-8 text-center text-sm text-muted">
            No projects yet. Create one below.
          </div>
        )}
        {projects.map((project) => (
          <Link
            key={project.id}
            href={`/projects/${project.id}`}
            className="pressable block rounded-xl border border-border bg-surface px-5 py-4 transition-colors duration-150 hover:border-accent/40"
          >
            <div className="font-medium">{project.name}</div>
            <div className="text-xs text-muted">{project.id}</div>
          </Link>
        ))}
      </div>

      <form action={createProjectAction} className="mt-6 flex gap-2">
        <input
          name="name"
          required
          placeholder="New project name"
          className="flex-1 rounded-lg border border-border bg-canvas px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button type="submit" className="pressable rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:opacity-90">
          Create project
        </button>
      </form>
    </main>
  );
}
