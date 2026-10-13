import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProject } from "@/server/queries";
import { auth } from "@/server/auth";
import { requireProjectMember, ForbiddenError } from "@/server/projects";
import { ProjectNav } from "@/components/ProjectNav";

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

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <Link href="/" className="text-xs text-muted hover:text-ink">
        ← Projects
      </Link>
      <h1 className="mt-1 text-xl font-semibold tracking-tight">{project.name}</h1>
      <ProjectNav projectId={projectId} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
