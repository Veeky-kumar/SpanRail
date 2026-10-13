import Link from "next/link";
import { listPromptNames } from "@/server/prompts";
import { createPromptVersionAction } from "./actions";
import { formatRelativeTime } from "@/lib/format";

export default async function PromptsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const prompts = await listPromptNames(projectId);
  const createAction = createPromptVersionAction.bind(null, projectId);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <h2 className="text-sm font-medium text-muted">Prompts</h2>
        {prompts.length === 0 ? (
          <div className="mt-4 rounded-xl border border-border bg-surface px-5 py-10 text-center text-sm text-muted">
            No prompts yet. Create one with the form, or via <code className="rounded bg-canvas px-1.5 py-0.5">POST /api/public/prompts</code>.
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Latest version</th>
                  <th className="px-4 py-2.5 font-medium">Labels</th>
                  <th className="px-4 py-2.5 font-medium">Versions</th>
                  <th className="px-4 py-2.5 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {prompts.map((p) => (
                  <tr key={p.name} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3">
                      <Link href={`/projects/${projectId}/prompts/${encodeURIComponent(p.name)}`} className="font-medium hover:underline">
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted">v{p.latest.version}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {p.latest.labels.map((l) => (
                          <span key={l} className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                            {l}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted">{p.versionCount}</td>
                    <td className="px-4 py-3 text-muted">{formatRelativeTime(p.latest.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <form action={createAction} className="h-fit rounded-xl border border-border bg-surface p-4">
        <h3 className="text-sm font-medium">New version</h3>
        <p className="mt-1 text-xs text-muted">Creates a new prompt, or a new version if the name already exists.</p>

        <label className="mt-4 block text-xs font-medium text-muted">Name</label>
        <input name="name" required className="mt-1 w-full rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-sm outline-none focus:border-accent" placeholder="support-agent-system-prompt" />

        <label className="mt-3 block text-xs font-medium text-muted">Prompt text</label>
        <textarea name="prompt" required rows={6} className="mt-1 w-full rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-sm outline-none focus:border-accent" placeholder="You are a helpful assistant. {{context}}" />

        <label className="mt-3 block text-xs font-medium text-muted">Labels (comma-separated)</label>
        <input name="labels" className="mt-1 w-full rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-sm outline-none focus:border-accent" placeholder="production" />

        <button type="submit" className="pressable mt-4 w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-colors duration-150 hover:opacity-90">
          Create version
        </button>
      </form>
    </div>
  );
}
