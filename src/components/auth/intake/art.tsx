import * as React from "react";
import { Dots, Line, Solid } from "../../iso/react/draw";
import {
  BASE_ART,
  FILE_ART,
  GATE_ART,
  INTAKE_ART,
  LAMP_ART,
  MAT_ART,
  PARCEL_ART,
  PRESS_ART,
  PRINTER_ART,
  TRAY_ART,
  VIEWER_ART,
} from "./geometry";
import { IntakeLive } from "./live";
import { PARCELS } from "./model";

// Painter's order, back to front, bottom to top: the base, the stations' back and floor parts, the
// viewer, then the parcels, then everything that must pass in front of a parcel (the bin's front wall,
// the gate, the press, the tray lip, the filing tray's front). Element props carry stable keys.

const BASE = (
  <g key="base">
    <path className="iso-halo" d={BASE_ART.halo} />
    {BASE_ART.feet.map((parts, index) => (
      <g key={index}>
        {parts.map((paths, part) => (
          <Solid key={part} paths={paths} tone={part ? "mid" : "lo"} crease="faint" />
        ))}
      </g>
    ))}
    <Solid paths={BASE_ART.slab} tone="mid" crease="faint" />
    <Line d={BASE_ART.groove} tone="lo" />
    <Line d={BASE_ART.screwRings} tone="lo" />
    <Dots points={BASE_ART.screws} size={0.5} tone="mid" />
    <Solid paths={BASE_ART.plate} tone="lo" crease="none" />
    <Line d={BASE_ART.plateLine} tone="faint" />
    <Line d={BASE_ART.plateRule} tone="lo" free />
    <Dots points={BASE_ART.plateScrews} size={0.45} tone="mid" />
  </g>
);

const BACK = (
  <g key="back">
    <Solid paths={MAT_ART.mat} tone="lo" crease="none" />
    <Line d={MAT_ART.mark} tone="faint" />

    <Solid paths={INTAKE_ART.table} tone="mid" crease="faint" />
    <Dots points={INTAKE_ART.tableScrews} size={0.45} tone="mid" />
    <Solid paths={INTAKE_ART.binBack} tone="mid" crease="faint" />
    <Solid paths={INTAKE_ART.binLeft} tone="mid" crease="faint" />
    <Solid paths={INTAKE_ART.binRight} tone="mid" crease="faint" />
  </g>
);

// The receipt slip rises out of the printer's slot when the API acknowledges a batch. It is drawn before
// the printer box, which hides the part that is still inside.
const SLIP = (
  <g key="slip">
    <Solid paths={PRINTER_ART.slip} tone="hi" crease="faint" />
    <Line d={PRINTER_ART.slipRule} tone="lo" free />
  </g>
);

const PRINTER = (
  <g key="printer">
    <Solid paths={PRINTER_ART.box} tone="mid" crease="faint" inner={<Line d={PRINTER_ART.seam} tone="faint" />} />
    <Line d={PRINTER_ART.slot} tone="lo" />
    <Dots points={PRINTER_ART.screws} size={0.45} tone="mid" />
  </g>
);

const MIDDLE = (
  <g key="middle">
    <Solid paths={TRAY_ART.base} tone="mid" crease="faint" />
    <Line d={TRAY_ART.slotLines} tone="faint" />
    <Dots points={TRAY_ART.screws} size={0.45} tone="mid" />
    <Solid paths={TRAY_ART.back} tone="mid" crease="faint" />

    <Solid paths={LAMP_ART.panel} tone="lo" crease="faint" />
    <Line d={LAMP_ART.panelLine} tone="faint" />
    {LAMP_ART.sockets.map((paths, index) => (
      <Solid key={index} paths={paths} tone="mid" crease="faint" />
    ))}

    <Solid paths={PRESS_ART.bed} tone="mid" crease="faint" />
    <Line d={PRESS_ART.bedGroove} tone="faint" />
    <Dots points={PRESS_ART.bedScrews} size={0.45} tone="mid" />
    <Solid paths={PRESS_ART.postBack} tone="mid" crease="faint" />

    <Solid paths={FILE_ART.floor} tone="lo" crease="faint" />
    <Solid paths={FILE_ART.back} tone="mid" crease="faint" />
    <Solid paths={FILE_ART.left} tone="mid" crease="faint" />
    <Solid paths={FILE_ART.right} tone="mid" crease="faint" />

    <Solid paths={VIEWER_ART.base} tone="lo" crease="faint" />
    <Dots points={VIEWER_ART.baseScrews} size={0.45} tone="mid" />
    <Solid paths={VIEWER_ART.neck} tone="mid" crease="none" />
    <Solid paths={VIEWER_ART.screen} tone="hi" crease="faint" />
    <Line d={VIEWER_ART.bezel} tone="faint" />
  </g>
);

const VIEWER_ROWS = (
  <g key="viewer-rows">
    {VIEWER_ART.rows.map((row, index) => (
      <g key={index} className="ip-row" data-row={index + 1}>
        {/* What the screen displays, like printed text: its strokes may end in the open. */}
        <Line d={row.line} tone="lit" free />
        <Dots points={row.dots} size={0.8} tone="hi" />
      </g>
    ))}
  </g>
);

const LAMPS = LAMP_ART.lamps.map((paths, index) => (
  <g key={`lamp-${index}`} className="ip-lamp">
    <Solid paths={paths} tone="hi" crease="faint" />
  </g>
));

const parcel = (id: string, kind: keyof typeof PARCEL_ART.marks, duplicate: boolean) => (
  <g key={id} className="ip-parcel" data-kind={kind} data-duplicate={duplicate ? "" : undefined}>
    <Solid paths={PARCEL_ART.body} tone="mid" crease="faint" />
    <Line d={PARCEL_ART.marks[kind]} tone="lo" free />
  </g>
);

const PARCEL_NODES = PARCELS.map((p) => parcel(p.id, p.kind, p.duplicateOf !== undefined));

const FRONT = (
  <g key="front">
    <Solid paths={INTAKE_ART.binFront} tone="mid" crease="faint" />

    <Solid paths={TRAY_ART.front} tone="mid" crease="faint" />

    <Solid paths={FILE_ART.front} tone="mid" crease="faint" />
    <Solid paths={FILE_ART.label} tone="lo" crease="none" />
    <Line d={FILE_ART.labelRule} tone="lo" free />

    <Solid paths={GATE_ART.postBack} tone="mid" crease="faint" />
    <Solid paths={GATE_ART.postFront} tone="mid" crease="faint" />
    <Line d={GATE_ART.postLines} tone="faint" />
    <Solid paths={GATE_ART.bar} tone="mid" crease="faint" />
    <Solid paths={GATE_ART.plate} tone="lo" crease="faint" />
    <Line d={GATE_ART.slot} tone="faint" />
    <Dots points={GATE_ART.screws} size={0.45} tone="mid" />
    <Solid paths={GATE_ART.keyBlade} tone="mid" crease="none" />
    <Solid paths={GATE_ART.keyBow} tone="mid" crease="faint" />
    <Line d={GATE_ART.keyKnurl} tone="lo" />
  </g>
);

const PLUNGER = (
  <g key="plunger">
    <Solid paths={PRESS_ART.rod} tone="mid" crease="none" />
    <Solid paths={PRESS_ART.head} tone="hi" crease="faint" lit />
    <Line d={PRESS_ART.headRing} tone="lo" />
    <Line d={PRESS_ART.headKnurl} tone="lo" />
  </g>
);

const PRESS_FRONT = (
  <g key="press-front">
    <Solid paths={PRESS_ART.sleeve} tone="mid" crease="faint" />
    <Line d={PRESS_ART.sleeveSeam} tone="faint" />
    <Solid paths={PRESS_ART.postFront} tone="mid" crease="faint" />
    <Line d={PRESS_ART.postLines} tone="faint" />
    <Solid paths={PRESS_ART.beam} tone="mid" crease="faint" />
    <Dots points={PRESS_ART.beamScrews} size={0.5} tone="mid" />
  </g>
);

const LABEL =
  "A desk that shows how Tracewell turns an LLM call into a stored trace. A batch of three events, small paper parcels, waits in a bin on the left. They pass a gate with a key slot, where a receipt slip pops out at once: the API answers before any work is done. The parcels go into a numbered tray, and one lamp for each waiting event lights on the queue panel. A press takes them one at a time and merges the create and update parcels of one call into a single layer. The result is filed in a tray, and a screen on the right builds the trace tree from what is filed. A second batch arrives with its update first and a resend of an event already seen; the resend is turned away onto a mat, and the rest are merged all the same.";

/** The intake desk: how a batch of events becomes stored observations. Pure server markup around one client layer. */
export function IntakeArt() {
  return (
    <IntakeLive
      label={LABEL}
      base={BASE}
      back={BACK}
      slip={SLIP}
      printer={PRINTER}
      middle={MIDDLE}
      viewerRows={VIEWER_ROWS}
      lamps={LAMPS}
      parcels={PARCEL_NODES}
      front={FRONT}
      plunger={PLUNGER}
      pressFront={PRESS_FRONT}
    />
  );
}
