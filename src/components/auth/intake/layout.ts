// Where each parcel sits on the desk for a given beat, in world units. Pure, shared by the static
// geometry (which positions the stations to match) and the live layer (which glides parcels to these poses).
import { PARCELS, type Beat } from "./model";

/** The bounds of the desk's base plate (see view.ts): a pose must stay inside. */
export const BASE_BOUNDS = { x0: -176, x1: 102, y0: -70, y1: 70 };

export const PARCEL = { w: 14, d: 10, h: 3 };
export const STACK = PARCEL.h + 0.2;

export const BIN = { x: -150, y: 0 };
export const TRAY = { x: -82, slotY: [-17, 0, 17] };
export const PRESS = { x: -34, y: 0 };
export const FILE = { x: 14, y: 0 };
export const REJECT = { x: -116, y: 56 };
export const AWAY = { x: -172, y: 0, z: -20 };

/** The tray slot a parcel waits in. Slots are reused: the first call has left before the second arrives. */
const SLOT: Record<string, number> = { T1: 0, C1: 1, U1: 2, T2: 0, U2: 1, C2: 2 };

export interface Pose {
  x: number;
  y: number;
  z: number;
  visible: boolean;
}

export function poseOf(beat: Beat, id: string): Pose {
  const place = beat.places[id];
  const same = (p: string) => PARCELS.filter((q) => beat.places[q.id] === p).map((q) => q.id);

  switch (place) {
    case "away":
      return { ...AWAY, visible: false };
    case "chute": {
      const k = same("chute").indexOf(id);
      return { x: BIN.x + (k % 2) * 1.5, y: BIN.y + (k % 2 ? 1.2 : -1.2), z: 2 + k * STACK, visible: true };
    }
    case "tray":
      return { x: TRAY.x, y: TRAY.slotY[SLOT[id] ?? 0], z: 3, visible: true };
    case "press": {
      const call = id.slice(1);
      const isPair = beat.merged !== null && String(beat.merged) === call && (id.startsWith("C") || id.startsWith("U"));
      if (!isPair) return { x: PRESS.x, y: PRESS.y, z: 4, visible: true };
      // A merged create and update lie one on the other under the plunger.
      return id.startsWith("C") ? { x: PRESS.x - 1.2, y: PRESS.y, z: 4, visible: true } : { x: PRESS.x + 1.2, y: PRESS.y, z: 4 + STACK, visible: true };
    }
    case "drawer": {
      const k = same("drawer").indexOf(id);
      return { x: FILE.x, y: FILE.y, z: 2 + k * STACK, visible: true };
    }
    case "bounced":
      return { x: REJECT.x, y: REJECT.y, z: 1.5, visible: true };
  }
}
