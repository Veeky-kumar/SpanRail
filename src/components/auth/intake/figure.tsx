import { Plate } from "../../iso/react/draw";
import { IntakeArt } from "./art";
import { SCENARIO, readoutOf } from "./model";
import "../../iso/iso.css";
import "./intake.css";

/**
 * The card around the intake desk. Its hint corner, readout and caption start on the first beat of the
 * scenario and are rewritten by the live layer as the desk plays (so they are right before any script runs).
 */
export function IntakeFigure({ fig = "Fig 1" }: { fig?: string }) {
  const first = SCENARIO[0];
  return (
    <div className="iso">
      <Plate
        fig={fig}
        title="The intake desk"
        hint={first.title}
        readout={readoutOf(first)}
        keys={[
          { mark: "raised", label: "One parcel: one event, one rule for each kind" },
          { mark: "lit", label: "The press: the worker" },
          { mark: "dotted", label: "A resend, turned away" },
        ]}
        caption={
          <>
            <span data-detail="">{first.detail}</span> Click to replay. The events are illustrative; the steps are what Spanrail&apos;s ingestion pipeline does.
          </>
        }
      >
        <IntakeArt />
      </Plate>
    </div>
  );
}
