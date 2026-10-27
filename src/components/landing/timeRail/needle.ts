// The dial needle is the only geometry the browser rebuilds each frame, so it lives apart from the
// static geometry module and ships alone.
import { lineOnTop, type Plane } from "../../iso/iso-kit";
import { DIAL, DIAL_R, DIAL_TOP, P } from "./view";

const [DX, DY] = DIAL;
const OUTER = DIAL_R - 2.4;

/** The needle at `angle` (radians, 0 = straight up, clockwise): a tail past the hub and a tip near the ticks. */
export function needlePath(angle: number): string {
  const tip: Plane = [DX + Math.sin(angle) * (OUTER - 1.2), DY - Math.cos(angle) * (OUTER - 1.2)];
  const tail: Plane = [DX - Math.sin(angle) * 3.4, DY + Math.cos(angle) * 3.4];
  return lineOnTop(tail, tip, DIAL_TOP + 0.2, P);
}
