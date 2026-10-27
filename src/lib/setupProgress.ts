// The getting-started checklist on the home page. Each step is derived from a real count in the
// database, never stored, so it can only say "done" for something that actually happened.
export interface SetupProgress {
  projects: number;
  apiKeys: number;
  traces: number;
  /** Generations that carry gateway network timing. */
  gatewayCalls: number;
}

export interface SetupStep {
  id: "project" | "api-key" | "first-trace" | "gateway-call";
  title: string;
  detail: string;
  done: boolean;
  /** Where to do it, when there is somewhere to go. */
  href?: string;
}

export function setupSteps(progress: SetupProgress, firstProjectId: string | null): SetupStep[] {
  const inProject = (path: string) => (firstProjectId ? `/projects/${encodeURIComponent(firstProjectId)}${path}` : undefined);
  return [
    {
      id: "project",
      title: "Create a project",
      detail: "A project keeps one application's traces, prompts and keys together.",
      done: progress.projects > 0,
      href: "#projects",
    },
    {
      id: "api-key",
      title: "Create an API key",
      detail: "Open the project's settings. The secret is shown once.",
      done: progress.apiKeys > 0,
      href: inProject("/settings"),
    },
    {
      id: "first-trace",
      title: "Send your first trace",
      detail: "From the SDK, or by routing a client through the gateway.",
      done: progress.traces > 0,
      href: inProject(""),
    },
    {
      id: "gateway-call",
      title: "See a call's time budget",
      detail: "Start the gateway with your key and send one request through it.",
      done: progress.gatewayCalls > 0,
      href: inProject(""),
    },
  ];
}

export const doneCount = (steps: SetupStep[]) => steps.filter((s) => s.done).length;

/** The first step still to do, or null when the checklist is complete. */
export const nextStepOf = (steps: SetupStep[]) => steps.find((s) => !s.done) ?? null;
