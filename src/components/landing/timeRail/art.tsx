import * as React from "react";
import { Dots, FaceText, Line, Solid } from "../../iso/react/draw";
import { BASE_ART, BED_ART, CARRIAGE_ART, DIAL_ART, GATEWAY_ART, LOGGER_ART, RAIL_ART, RULER_ART, SENSOR_ART, rulerOf, segmentsOf } from "./geometry";
import { TimeRailLive } from "./live";
import { SETUP_KEYS, readoutOf, type RailModel } from "./rail";

// Painter's order, back to front, bottom to top: base, then the gateway behind, the logger, the rails,
// the bed of phase blocks, the ruler, the dial, and last the two moving groups (carriage, then sensor).
// Each element prop carries a stable key (see the large-page key warning in the skill's react notes).

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

const GATEWAY = (
  <g key="gateway">
    {GATEWAY_ART.feet.map((paths, index) => (
      <Solid key={index} paths={paths} tone="lo" crease="faint" />
    ))}
    <Dots points={GATEWAY_ART.footScrews} size={0.45} tone="mid" />
    {GATEWAY_ART.posts.map((paths, index) => (
      <Solid key={index} paths={paths} tone="mid" crease="faint" />
    ))}
    <Line d={GATEWAY_ART.postLines} tone="faint" />
    <Solid paths={GATEWAY_ART.beam} tone="mid" crease="faint" />
    <Line d={GATEWAY_ART.beamMinor} tone="lo" />
    <Line d={GATEWAY_ART.beamMajor} tone="mid" />
    <Dots points={GATEWAY_ART.beamScrews} size={0.5} tone="mid" />
  </g>
);

const LOGGER = (
  <g key="logger">
    <path className="iso-halo" d={LOGGER_ART.halo} />
    <Solid paths={LOGGER_ART.case} tone="mid" crease="faint" inner={<Line d={LOGGER_ART.seam} tone="faint" />} />
    {LOGGER_ART.slots.map((d, index) => (
      <Line key={index} d={d} tone="lo" />
    ))}
    <Solid paths={LOGGER_ART.plate} tone="lo" crease="none" />
    <Line d={LOGGER_ART.plateRule} tone="lo" free />
    <Dots points={LOGGER_ART.screws} size={0.45} tone="mid" />
    <Solid paths={LOGGER_ART.lampSocket} tone="lo" crease="faint" />
  </g>
);

const LAMP = (
  <g key="lamp">
    <Solid paths={LOGGER_ART.lamp} tone="hi" crease="faint" />
    <Line d={LOGGER_ART.lampRing} tone="lo" />
  </g>
);

const RAILS = (
  <g key="rails">
    <Solid paths={RAIL_ART.rails[0]} tone="mid" crease="faint" />
    <Line d={RAIL_ART.railTops[0]} tone="faint" />
    <Line d={RAIL_ART.seams[0]} tone="faint" />
    <Dots points={RAIL_ART.railScrews.slice(0, 2)} size={0.45} tone="mid" />
  </g>
);

const BED_FLOOR = (
  <g key="bed-floor">
    <Solid paths={BED_ART.floor} tone="lo" crease="none" flat />
  </g>
);

function segments(model: RailModel) {
  const all = segmentsOf(model);
  const one = (seg: (typeof all)[number]) => (
    <g key={seg.key} className="tr-phase" data-phase={seg.key}>
      <Solid paths={seg.body} tone="mid" crease="faint" />
      {seg.groove ? <Line d={seg.groove} tone="faint" /> : null}
      {seg.screws.length ? <Dots points={seg.screws} size={0.4} tone="mid" /> : null}
    </g>
  );
  return {
    setup: <g key="setup">{all.filter((s) => SETUP_KEYS.includes(s.key)).map(one)}</g>,
    later: <g key="later">{all.filter((s) => !SETUP_KEYS.includes(s.key)).map(one)}</g>,
  };
}

const RAIL_FRONT = (
  <g key="rail-front">
    <Solid paths={RAIL_ART.rails[1]} tone="mid" crease="faint" />
    <Line d={RAIL_ART.railTops[1]} tone="faint" />
    <Line d={RAIL_ART.seams[1]} tone="faint" />
    <Dots points={RAIL_ART.railScrews.slice(2)} size={0.45} tone="mid" />
    {RAIL_ART.stops.map((paths, index) => (
      <Solid key={index} paths={paths} tone="mid" crease="faint" />
    ))}
  </g>
);

function ruler(model: RailModel) {
  const ticks = rulerOf(model);
  return (
    <g key="ruler">
      <Solid paths={RULER_ART.bar} tone="lo" crease="faint" />
      <Line d={ticks.base} tone="faint" />
      <Line d={ticks.minor} tone="lo" />
      <Line d={ticks.major} tone="mid" />
      <Line d={RULER_ART.zero} tone="hi" />
      <Dots points={RULER_ART.screws} size={0.45} tone="mid" />
    </g>
  );
}

const dial = (unit: string) => (
  <g key="dial">
    <Solid paths={DIAL_ART.stand} tone="lo" crease="faint" />
    <Dots points={DIAL_ART.standScrews} size={0.45} tone="mid" />
    <Solid paths={DIAL_ART.lug} tone="mid" crease="faint" />
    <Solid paths={DIAL_ART.crown} tone="mid" crease="faint" />
    <Solid paths={DIAL_ART.crownCap} tone="mid" crease="faint" />
    <Solid paths={DIAL_ART.puck} tone="hi" crease="lo" />
    <Line d={DIAL_ART.band} tone="faint" />
    <Line d={DIAL_ART.knurl} tone="faint" />
    <Line d={DIAL_ART.bezel} tone="lo" />
    <Line d={DIAL_ART.face} tone="faint" />
    <Line d={DIAL_ART.minor} tone="lo" />
    <Line d={DIAL_ART.major} tone="mid" />
    <FaceText transform={DIAL_ART.label} size={2.6} tone="lo" anchor="middle">
      {unit}
    </FaceText>
  </g>
);

const HUB = (
  <g key="hub">
    <Line d={DIAL_ART.hub} tone="hi" />
  </g>
);

const CARRIAGE = (
  <g key="carriage">
    <path className="iso-halo tr-shadow" d={CARRIAGE_ART.halo} />
    <Solid paths={CARRIAGE_ART.plate} tone="mid" crease="faint" lit />
    <Line d={CARRIAGE_ART.seat} tone="faint" />
    <Dots points={CARRIAGE_ART.rivets} size={0.4} tone="lo" />
    {CARRIAGE_ART.bushes.map((bush, index) => (
      <g key={index}>
        <Solid paths={bush.body} tone="mid" crease="faint" />
        <Dots points={bush.screws} size={0.45} tone="mid" />
      </g>
    ))}
    <Solid paths={CARRIAGE_ART.knob} tone="mid" crease="faint" />
    <Line d={CARRIAGE_ART.knobKnurl} tone="lo" />
    <Solid paths={CARRIAGE_ART.pointer} tone="mid" crease="none" />
    <Line d={CARRIAGE_ART.index} tone="lit" />
    <Dots points={[CARRIAGE_ART.indexDot]} size={0.6} tone="hi" />
  </g>
);

const SENSOR = (
  <g key="sensor">
    <Solid paths={SENSOR_ART.pad} tone="hi" crease="faint" />
    <Line d={SENSOR_ART.padRing} tone="lo" />
    <Solid paths={SENSOR_ART.stem} tone="mid" crease="none" />
    <Line d={SENSOR_ART.stemMarks} tone="lo" />
    <Solid paths={SENSOR_ART.block} tone="mid" crease="faint" />
    <Line d={SENSOR_ART.blockLine} tone="faint" />
    <Dots points={SENSOR_ART.blockScrews} size={0.45} tone="mid" />
    <Solid paths={SENSOR_ART.lens} tone="hi" crease="faint" />
    <Line d={SENSOR_ART.index} tone="lit" free />
    <Solid paths={SENSOR_ART.arm} tone="mid" crease="faint" />
    <Line d={SENSOR_ART.armLine} tone="faint" />
    <Dots points={SENSOR_ART.armScrews} size={0.45} tone="mid" />
  </g>
);

const label = (model: RailModel) =>
  `A measuring bench for one LLM call that took ${readoutOf(model.totalFresh, model.totalFresh).split(" of ")[1]}, with time laid out along its length. A carriage, the request, rides two guide rails over ${model.segs.length} blocks end to end, one for each phase of the round trip that happened: DNS lookup, TCP connect, TLS handshake, the provider's wait and the response transfer. A ruler in ${model.unit === "s" ? "seconds" : "milliseconds"} runs along the front and the carriage points at it. A sensor on the gateway's beam follows the carriage, a dial gauge reads the elapsed time, and a lamp on the logger box lights once the call has been reported to Tracewell.`;

export function TimeRailArt({ model, fixedStep, slideIn }: { model: RailModel; fixedStep?: number; slideIn?: boolean }) {
  const { setup, later } = segments(model);
  return (
    <TimeRailLive
      model={model}
      fixedStep={fixedStep}
      slideIn={slideIn}
      label={label(model)}
      base={BASE}
      gateway={GATEWAY}
      logger={LOGGER}
      lamp={LAMP}
      rails={RAILS}
      bedFloor={BED_FLOOR}
      setup={setup}
      later={later}
      railFront={RAIL_FRONT}
      ruler={ruler(model)}
      dial={dial(model.unit)}
      hub={HUB}
      carriage={CARRIAGE}
      sensor={SENSOR}
    />
  );
}
