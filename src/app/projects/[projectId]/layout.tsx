import { notFound, redirect } from "next/navigation";
import { getProject } from "@/server/queries";
import { auth } from "@/server/auth";
import { requireProjectMember, ForbiddenError, listUserProjects } from "@/server/projects";
import { ShellNav } from "@/components/shell/ShellNav";
import { TopBar } from "@/components/shell/TopBar";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const session = await auth();
  if (!session?.user) redirect("/login");

  try {
    await requireProjectMember(session.user.id, projectId);
  } catch (err) {
    if (err instanceof ForbiddenError) notFound(); // don't leak project existence to non-members
    throw err;
  }

  const project = await getProject(projectId);
  if (!project) notFound();

  const projects = (await listUserProjects(session.user.id)).map((p) => ({ id: p.id, name: p.name }));
  const current = { id: project.id, name: project.name };
  const email = session.user.email ?? "";

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen border-r border-rule bg-surface lg:block">
        <ShellNav project={current} projects={projects} email={email} />
      </aside>
      <div className="min-w-0">
        <TopBar project={current} projects={projects} email={email} />
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          <h1 className="sr-only">{project.name}</h1>
          {children}
        </main>
      </div>
    </div>
  );
}
