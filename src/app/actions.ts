"use server";

import { redirect } from "next/navigation";
import { auth, signOut } from "@/server/auth";
import { createProjectForUser } from "@/server/projects";

export async function createProjectAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Name is required");

  const project = await createProjectForUser(session.user.id, name);
  redirect(`/projects/${project.id}`);
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
