import { Plate } from "../../iso/react/draw";
import { TimeRailArt } from "./art";
import { RESTING_READOUT } from "./live";
import { MIN_SEG } from "./rail";
import "../../iso/iso.css";
import "./timeRail.css";

/** The card around the figure: Fig label, title, hint, live readout, legend and a true caption. */
export function TimeRailFigure() {
  return (
    <div className="iso">
      <Plate
        fig="Fig 1"
        title="The time rail"
        hint="Use the steps below"
        readout={RESTING_READOUT}
        keys={[
          { mark: "raised", label: "One block per phase of the call" },
          { mark: "lit", label: "The carriage: your request" },
          { mark: "edge", label: "The gateway's sensor, following it" },
        ]}
        caption={`A measuring bench for one call. The carriage rides a ruler graduated in milliseconds across five blocks, one per phase of the round trip, drawn to scale (a phase thinner than ${MIN_SEG} units is widened so it stays visible). A sensor on the gateway's beam follows it, the dial reads the elapsed time, and the lamp on the logger lights once the call has been reported to Tracewell. Sample data.`}
      >
        <TimeRailArt />
      </Plate>
    </div>
  );
}
