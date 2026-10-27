import { Plate } from "../../iso/react/draw";
import type { GatewayTiming } from "@/lib/gatewayTiming";
import { SAMPLE_TIMING } from "@/lib/sampleTrace";
import { TimeRailArt } from "./art";
import { MIN_SEG, railOf, readoutOf } from "./rail";
import "../../iso/iso.css";
import "./timeRail.css";

interface Props {
  /** The call to draw. The sample call by default. */
  timing?: GatewayTiming;
  fig?: string;
  title?: string;
  hint?: string;
  caption?: React.ReactNode;
  /** Show one stage of the call instead of following the stepper (6 is the finished call). */
  fixedStep?: number;
  /** With a fixed step: travel there once on load instead of showing it at once. */
  slideIn?: boolean;
  /** Replay the call on a loop while it is in view (see TimeRailLive). */
  tour?: boolean;
}

/** The card around the figure: Fig label, title, hint, live readout, legend and a true caption. */
export function TimeRailFigure({ timing = SAMPLE_TIMING, fig = "Fig 1", title = "The time rail", hint = "Use the steps below", caption, fixedStep, slideIn, tour }: Props) {
  const model = railOf(timing);
  const finished = fixedStep !== undefined && !slideIn;
  const resting = finished ? readoutOf(model.totalFresh, model.totalFresh) : readoutOf(0, model.totalFresh);
  const widened = model.widened.length
    ? ` Phases thinner than ${MIN_SEG} units (${model.widened.join(", ")}) are widened so they stay visible.`
    : "";
  return (
    <div className="iso">
      <Plate
        fig={fig}
        title={title}
        hint={hint}
        readout={resting}
        keys={[
          { mark: "raised", label: "One block per phase of the call" },
          { mark: "lit", label: "The carriage: the request" },
          { mark: "edge", label: "The gateway's sensor, following it" },
        ]}
        caption={
          caption ??
          `A measuring bench for one call. The carriage rides a ruler graduated in ${model.unit === "s" ? "seconds" : "milliseconds"} across one block per phase of the round trip, drawn to scale.${widened} A sensor on the gateway's beam follows it, the dial reads the elapsed time, and the lamp on the logger lights once the call has been reported to Tracewell. Sample data.`
        }
      >
        <TimeRailArt model={model} fixedStep={fixedStep} slideIn={slideIn} tour={tour} />
      </Plate>
    </div>
  );
}
