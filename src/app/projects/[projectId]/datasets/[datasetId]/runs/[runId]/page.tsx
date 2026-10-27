import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { getRunItemsDetailed } from "@/server/datasets";

function JsonPreview({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-muted">—</span>;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return <span className="font-mono text-xs">{text.length > 120 ? text.slice(0, 120) + "…" : text}</span>;
}

export default async function DatasetRunDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; datasetId: string; runId: string }>;
}) {
  const { projectId, datasetId, runId } = await params;
  const run = await prisma.datasetRun.findFirst({ where: { id: runId, datasetId, projectId } });
  if (!run) notFound();

  const items = await getRunItemsDetailed(projectId, runId);

  return (
    <div>
      <Link href={`/projects/${projectId}/datasets/${datasetId}`} className="text-xs text-muted hover:text-ink">
        ← Dataset
      </Link>
      <h2 className="mt-1 text-lg font-semibold tracking-tight">{run.name}</h2>

      <div className="mt-4 overflow-hidden rounded-data border border-rule bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="px-3 py-2 font-medium">Input</th>
              <th className="px-3 py-2 font-medium">Expected</th>
              <th className="px-3 py-2 font-medium">Actual output</th>
              <th className="px-3 py-2 font-medium">Scores</th>
              <th className="px-3 py-2 font-medium">Trace</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-border align-top last:border-b-0">
                <td className="px-3 py-2">
                  <JsonPreview value={item.inputSnapshot} />
                </td>
                <td className="px-3 py-2 text-muted">
                  <JsonPreview value={item.expectedOutputSnapshot} />
                </td>
                <td className="px-3 py-2">
                  <JsonPreview value={item.observation?.output} />
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {item.scores.length === 0 ? (
                      <span className="text-xs text-muted">—</span>
                    ) : (
                      item.scores.map((s) => (
                        <span
                          key={s.id}
                          className={`rounded-full border px-2 py-0.5 text-xs ${
                            s.value === 1 ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600" : "border-fault/30 bg-fault/10 text-fault"
                          }`}
                        >
                          {s.name}
                        </span>
                      ))
                    )}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <Link href={`/projects/${projectId}/traces/${item.traceId}`} className="text-xs text-accent hover:underline">
                    view trace
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
