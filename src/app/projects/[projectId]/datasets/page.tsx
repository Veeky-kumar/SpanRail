import Link from "next/link";
import { listDatasets } from "@/server/datasets";
import { DETERMINISTIC_SCORERS } from "@/server/scorers";
import { createDatasetAction } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";

export default async function DatasetsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const datasets = await listDatasets(projectId);
  const createAction = createDatasetAction.bind(null, projectId);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <h2 className="text-sm font-medium text-muted">Datasets</h2>
        {datasets.length === 0 ? (
          <div className="mt-4 rounded-xl border border-border bg-surface px-5 py-10 text-center text-sm text-muted">
            No datasets yet. Create one to start running repeatable evaluations.
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Items</th>
                  <th className="px-4 py-2.5 font-medium">Runs</th>
                  <th className="px-4 py-2.5 font-medium">Scorers</th>
                </tr>
              </thead>
              <tbody>
                {datasets.map((d) => (
                  <tr key={d.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3">
                      <Link href={`/projects/${projectId}/datasets/${d.id}`} className="font-medium hover:underline">
                        {d.name}
                      </Link>
                      {d.description && <p className="text-xs text-muted">{d.description}</p>}
                    </td>
                    <td className="px-4 py-3 text-muted">{d._count.items}</td>
                    <td className="px-4 py-3 text-muted">{d._count.runs}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {d.scorers.map((s) => (
                          <span key={s} className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <form action={createAction} className="h-fit rounded-xl border border-border bg-surface p-4">
        <h3 className="text-sm font-medium">New dataset</h3>

        <label className="mt-4 block text-xs font-medium text-muted">Name</label>
        <input name="name" required className="mt-1 w-full rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-sm outline-none focus:border-accent" placeholder="support-qa-golden-set" />

        <label className="mt-3 block text-xs font-medium text-muted">Description</label>
        <input name="description" className="mt-1 w-full rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-sm outline-none focus:border-accent" />

        <label className="mt-3 block text-xs font-medium text-muted">Deterministic scorers to auto-run</label>
        <div className="mt-1 space-y-1.5">
          {DETERMINISTIC_SCORERS.map((s) => (
            <label key={s} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="scorers" value={s} className="rounded border-border" />
              {s}
            </label>
          ))}
        </div>

        <SubmitButton
          pendingLabel="Creating…"
          className="pressable mt-4 w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-colors duration-150 hover:opacity-90"
        >
          Create dataset
        </SubmitButton>
      </form>
    </div>
  );
}
