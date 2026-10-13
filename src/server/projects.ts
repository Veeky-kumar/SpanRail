import { prisma } from "./db";
import { auth } from "./auth";

export class ForbiddenError extends Error {
  constructor(message = "You do not have access to this project") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * The single choke point every project-scoped page and server action must call. Rendering
 * a nav item conditionally is not access control — this is the thing that actually gates
 * it, independent of what the UI happened to show. See ARCHITECTURE.md.
 */
export async function requireProjectMember(userId: string, projectId: string) {
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!membership) throw new ForbiddenError();
  return membership;
}

/**
 * For use at the top of every project-scoped server action — resolves the signed-in
 * user from the request and verifies membership in one call, independent of whatever
 * the calling page already rendered. Throws ForbiddenError (not a redirect): server
 * actions run as POSTs with no page to redirect, so the caller surfaces this as a form
 * error.
 */
export async function requireSessionProjectMember(projectId: string) {
  const session = await auth();
  if (!session?.user) throw new ForbiddenError("Not signed in");
  return requireProjectMember(session.user.id, projectId);
}

export async function listUserProjects(userId: string) {
  const memberships = await prisma.projectMember.findMany({
    where: { userId },
    include: { project: true },
    orderBy: { project: { createdAt: "desc" } },
  });
  return memberships.map((m) => m.project);
}

export async function createProjectForUser(userId: string, name: string) {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.create({ data: { name } });
    await tx.projectMember.create({ data: { projectId: project.id, userId, role: "OWNER" } });
    return project;
  });
}
