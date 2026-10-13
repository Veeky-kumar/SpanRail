import { notFound } from "next/navigation";
import Link from "next/link";
import { getTraceObservations, getTraceLevelScores } from "@/server/queries";
import { buildObservationTree } from "@/server/traceTree";
import { serializeTree, type SerializedScore } from "@/server/serialize";
import { TraceExplorer } from "@/components/TraceExplorer";

export default async function TraceDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; traceId: string }>;
}) {
  const { projectId, traceId } = await params;
  const [observations, traceLevelScores] = await Promise.all([
    getTraceObservations(projectId, traceId),
    getTraceLevelScores(projectId, traceId),
  ]);
  if (observations.length === 0) notFound();

  const root = observations.find((o) => o.parentObservationId === null) ?? observations[0];

  const scoresByObsId = new Map<string, SerializedScore[]>();
  for (const obs of observations) {
    if (obs.scores.length) {
      scoresByObsId.set(
        obs.id,
        obs.scores.map((s) => ({ id: s.id, name: s.name, value: s.value, stringValue: s.stringValue, source: s.source, comment: s.comment })),
      );
    }
  }
  if (traceLevelScores.length) {
    const existing = scoresByObsId.get(root.id) ?? [];
    scoresByObsId.set(root.id, [
      ...existing,
      ...traceLevelScores.map((s) => ({ id: s.id, name: s.name, value: s.value, stringValue: s.stringValue, source: s.source, comment: s.comment })),
    ]);
  }

  const tree = buildObservationTree(observations);
  const serializedTree = serializeTree(tree, scoresByObsId);

  return (
    <div>
      <Link href={`/projects/${projectId}`} className="text-xs text-muted hover:text-ink">
        ← Traces
      </Link>
      <h2 className="mt-1 text-lg font-semibold tracking-tight">{root.traceName ?? root.name ?? "(unnamed trace)"}</h2>
      <p className="mt-1 text-xs text-muted">{traceId}</p>

      <div className="mt-6">
        <TraceExplorer tree={serializedTree} />
      </div>
    </div>
  );
}
