import Link from "next/link";
import { notFound } from "next/navigation";
import { getDataset, getDatasetItems, getDatasetRuns, getRunScoreSummary } from "@/server/datasets";
import { formatRelativeTime } from "@/lib/format";
import { addDatasetItemAction, createDatasetRunAction } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";

function JsonPreview({ value }: { value: unknown }) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return <span className="font-mono text-xs">{text.length > 80 ? text.slice(0, 80) + "…" : text}</span>;
}

export default async function DatasetDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; datasetId: string }>;
}) {
  const { projectId, datasetId } = await params;
  const dataset = await getDataset(projectId, datasetId);
  if (!dataset) notFound();

  const [items, runs] = await Promise.all([
    getDatasetItems(projectId, datasetId),
    getDatasetRuns(projectId, datasetId),
  ]);
  const runSummaries = await Promise.all(runs.map((r) => getRunScoreSummary(projectId, r.id)));

  const addItem = addDatasetItemAction.bind(null, projectId, datasetId);
  const createRun = createDatasetRunAction.bind(null, projectId, datasetId);

  return (
    <div>
      <Link href={`/projects/${projectId}/datasets`} className="text-xs text-muted hover:text-ink">
        ← Datasets
      </Link>
      <h2 className="mt-1 text-lg font-semibold tracking-tight">{dataset.name}</h2>
      {dataset.description && <p className="text-sm text-muted">{dataset.description}</p>}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-medium text-muted">Items ({items.length})</h3>
          </div>
          <div className="mt-3 overflow-hidden rounded-data border border-rule bg-surface">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">No items yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th className="px-3 py-2 font-medium">Input</th>
                    <th className="px-3 py-2 font-medium">Expected output</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-2">
                        <JsonPreview value={item.input} />
                      </td>
                      <td className="px-3 py-2 text-muted">
                        {item.expectedOutput ? <JsonPreview value={item.expectedOutput} /> : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <form action={addItem} className="mt-3 rounded-data border border-rule bg-surface p-4">
            <h4 className="text-xs font-medium text-muted">Add item</h4>
            <label className="mt-2 block text-xs text-muted">Input (plain text or JSON)</label>
            <textarea name="input" required rows={2} className="mt-1 input" />
            <label className="mt-2 block text-xs text-muted">Expected output (optional)</label>
            <textarea name="expectedOutput" rows={2} className="mt-1 input" />
            <SubmitButton
              pendingLabel="Adding…"
              className="pressable mt-2 rounded-data border border-border px-3 py-1.5 text-xs font-medium transition-colors duration-150 hover:bg-canvas"
            >
              Add item
            </SubmitButton>
          </form>
        </section>

        <section>
          <h3 className="text-sm font-medium text-muted">Runs ({runs.length})</h3>
          <div className="mt-3 space-y-3">
            {runs.length === 0 ? (
              <div className="rounded-data border border-rule bg-surface px-4 py-6 text-center text-sm text-muted">
                No runs yet. Create one, then link traces to it via
                <code className="ml-1 rounded bg-canvas px-1.5 py-0.5">
                  POST /api/public/datasets/{datasetId}/runs/:runId/items
                </code>
                .
              </div>
            ) : (
              runs.map((run, i) => (
                <Link
                  key={run.id}
                  href={`/projects/${projectId}/datasets/${datasetId}/runs/${run.id}`}
                  className="pressable block rounded-data border border-rule bg-surface p-4 transition-colors duration-150 hover:border-accent/40"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{run.name}</span>
                    <span className="text-xs text-muted">{formatRelativeTime(run.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">{run._count.items} items</p>
                  {runSummaries[i].length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {runSummaries[i].map((s) => (
                        <span key={s.name} className="rounded-full border border-border px-2 py-0.5 text-xs">
                          {s.name}: {Math.round(s.passRate * 100)}% ({s.passCount}/{s.totalCount})
                        </span>
                      ))}
                    </div>
                  )}
                </Link>
              ))
            )}
          </div>

          <form action={createRun} className="mt-3 rounded-data border border-rule bg-surface p-4">
            <h4 className="text-xs font-medium text-muted">New run</h4>
            <input name="name" required placeholder="run-2026-10-13" className="mt-2 input" />
            <SubmitButton
              pendingLabel="Creating…"
              className="pressable mt-2 rounded-data border border-border px-3 py-1.5 text-xs font-medium transition-colors duration-150 hover:bg-canvas"
            >
              Create run
            </SubmitButton>
          </form>
        </section>
      </div>
    </div>
  );
}
