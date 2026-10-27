// The intake desk's model: a deterministic scenario, pure data. It replays what Spanrail's ingestion
// pipeline really does (ARCHITECTURE.md, "Ingestion flow"): the API checks the key pair and every event,
// files each event in a staging table keyed by project + event id, queues only a ticket, and answers 207
// at once; a worker later pulls a ticket, reads its row, and merges the create and update events of one id
// into one observation, in whatever order they arrived. A resent event id is ignored.
//
// Two batches are played: a call whose events arrive in order, then a call whose update arrives before its
// create, together with a resend of an event the desk has already seen.

export type EventKind = "trace-create" | "generation-create" | "generation-update";

/** Where a parcel (one event) is on the desk. */
export type Place = "away" | "chute" | "tray" | "press" | "drawer" | "bounced";

export interface Parcel {
  id: string;
  kind: EventKind;
  /** The call (1 or 2) the event belongs to. */
  call: number;
  /** Set on a resend: the id of the event it repeats. */
  duplicateOf?: string;
}

export const PARCELS: Parcel[] = [
  { id: "T1", kind: "trace-create", call: 1 },
  { id: "C1", kind: "generation-create", call: 1 },
  { id: "U1", kind: "generation-update", call: 1 },
  { id: "T2", kind: "trace-create", call: 2 },
  { id: "U2", kind: "generation-update", call: 2 },
  { id: "C2", kind: "generation-create", call: 2 },
  { id: "D1", kind: "generation-update", call: 1, duplicateOf: "U1" },
];

export interface Beat {
  title: string;
  /** One true sentence about what the pipeline does at this point. */
  detail: string;
  dwellMs: number;
  places: Record<string, Place>;
  /** The call whose create and update the worker is holding merged at the press, if any. */
  merged: number | null;
  /** The receipt for the batch at the gate is out. */
  ack: boolean;
}

const IDS = PARCELS.map((p) => p.id);

/** A beat with every parcel `away` except the ones named. */
function beat(
  title: string,
  detail: string,
  dwellMs: number,
  placed: Partial<Record<string, Place>>,
  extra: { merged?: number | null; ack?: boolean } = {},
): Beat {
  const places: Record<string, Place> = {};
  for (const id of IDS) places[id] = placed[id] ?? "away";
  return { title, detail, dwellMs, places, merged: extra.merged ?? null, ack: extra.ack ?? false };
}

export const SCENARIO: Beat[] = [
  beat(
    "A batch arrives",
    "Your app or the gateway sends a batch of events: one to start the trace, one to start the generation, one to finish it.",
    1300,
    { T1: "chute", C1: "chute", U1: "chute" },
  ),
  beat(
    "Accepted at once",
    "The API checks the key pair and each event, files each in the staging table, queues a ticket for it, and answers 207 before any work is done.",
    1900,
    { T1: "tray", C1: "tray", U1: "tray" },
    { ack: true },
  ),
  beat("The worker takes a ticket", "The worker pulls a ticket from the queue and reads that event's row from staging.", 1300, { T1: "press", C1: "tray", U1: "tray" }, { ack: true }),
  beat("The trace root is stored", "The trace-create event becomes the root observation of the trace.", 1300, { T1: "drawer", C1: "tray", U1: "tray" }, { ack: true }),
  beat("The next ticket", "Each event is processed on its own, so a slow or failed one never holds up the batch's acknowledgement.", 1100, { T1: "drawer", C1: "press", U1: "tray" }, { ack: true }),
  beat(
    "Create and update are merged",
    "A start event and its end event for the same id are merged into one observation. Fields the second event does not carry are kept, not erased.",
    2200,
    { T1: "drawer", C1: "press", U1: "press" },
    { ack: true, merged: 1 },
  ),
  beat(
    "One call, one trace",
    "The merged observation is stored. The dashboard builds the trace tree from these rows when you open it.",
    2200,
    { T1: "drawer", C1: "drawer", U1: "drawer" },
    { ack: true },
  ),
  beat(
    "A second batch, out of order",
    "Events can arrive in any order, and can be resent. Here the update arrives before its create, with a repeat of an event already stored.",
    1700,
    { T1: "drawer", C1: "drawer", U1: "drawer", T2: "chute", U2: "chute", C2: "chute", D1: "chute" },
  ),
  beat(
    "A resend is ignored",
    "An event id the desk has already seen is not stored twice, so retrying a failed delivery is always safe.",
    2000,
    { T1: "drawer", C1: "drawer", U1: "drawer", T2: "tray", U2: "tray", C2: "tray", D1: "bounced" },
    { ack: true },
  ),
  beat(
    "Tickets, one at a time",
    "The worker takes tickets in the order they were queued, whatever order the events were sent in.",
    1200,
    { T1: "drawer", C1: "drawer", U1: "drawer", T2: "press", U2: "tray", C2: "tray", D1: "bounced" },
    { ack: true },
  ),
  beat(
    "An update, before its create",
    "The update is processed first. It waits for its create instead of failing or being dropped.",
    1500,
    { T1: "drawer", C1: "drawer", U1: "drawer", T2: "drawer", U2: "press", C2: "tray", D1: "bounced" },
    { ack: true },
  ),
  beat(
    "Merged all the same",
    "When the create arrives, the two are merged exactly as if they had come in order.",
    2000,
    { T1: "drawer", C1: "drawer", U1: "drawer", T2: "drawer", U2: "press", C2: "press", D1: "bounced" },
    { ack: true, merged: 2 },
  ),
  beat(
    "Two calls, two traces",
    "Both traces are stored and the queue is empty. The desk now starts over to show it again.",
    3000,
    { T1: "drawer", C1: "drawer", U1: "drawer", T2: "drawer", U2: "drawer", C2: "drawer", D1: "bounced" },
    { ack: true },
  ),
];

export interface Counters {
  /** Events filed in staging and waiting for a worker. */
  waiting: number;
  /** Observations stored (a merged create and update counts once). */
  observations: number;
  traces: number;
  /** Resent events turned away. */
  rejected: number;
}

export function countersOf(b: Beat): Counters {
  const at = (id: string) => b.places[id];
  const waiting = IDS.filter((id) => at(id) === "tray").length;
  const rejected = IDS.filter((id) => at(id) === "bounced").length;
  let observations = 0;
  let traces = 0;
  for (const call of [1, 2]) {
    if (at(`T${call}`) === "drawer") {
      observations += 1;
      traces += 1;
    }
    if (at(`C${call}`) === "drawer" && at(`U${call}`) === "drawer") observations += 1;
  }
  return { waiting, observations, traces, rejected };
}

export function readoutOf(b: Beat): string {
  const c = countersOf(b);
  return `waiting ${c.waiting}, stored ${c.observations}, rejected ${c.rejected}`;
}
