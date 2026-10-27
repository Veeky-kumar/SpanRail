import Link from "next/link";
import { notFound } from "next/navigation";
import { listPromptVersions } from "@/server/prompts";
import { formatRelativeTime } from "@/lib/format";

export default async function PromptDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; name: string }>;
}) {
  const { projectId, name } = await params;
  const decodedName = decodeURIComponent(name);
  const versions = await listPromptVersions(projectId, decodedName);
  if (versions.length === 0) notFound();

  return (
    <div>
      <Link href={`/projects/${projectId}/prompts`} className="text-xs text-muted hover:text-ink">
        ← Prompts
      </Link>
      <h2 className="mt-1 text-lg font-semibold tracking-tight">{decodedName}</h2>

      <div className="mt-4 space-y-3">
        {versions.map((v) => (
          <div key={v.id} className="rounded-data border border-rule bg-surface p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">v{v.version}</span>
                {v.labels.map((l) => (
                  <span
                    key={l}
                    className={`rounded-full border px-2 py-0.5 text-xs ${
                      l === "production" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600" : "border-border text-muted"
                    }`}
                  >
                    {l}
                  </span>
                ))}
              </div>
              <span className="text-xs text-muted">{formatRelativeTime(v.createdAt)}</span>
            </div>
            <pre className="mt-3 max-h-48 overflow-auto rounded-data bg-canvas p-3 text-xs">
              {typeof v.prompt === "string" ? v.prompt : JSON.stringify(v.prompt, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
