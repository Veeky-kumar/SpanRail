import { boxCorners, iso, fitProjection, type Flat, type Plan, type Point3 } from "../../iso/iso-kit";

export const WIDTH = 600;
export const HEIGHT = 340;
const PAD = 18;
export const AZIMUTH = 58;

// The bench: a base plate on four feet. The long axis is x, which is time.
export const BASE: Plan = { x: -176, y: -74, w: 400, d: 148, r: 9 };
export const BASE_H = 9;
export const FOOT_H = 5;

// Two guide rails, with the bed of phase blocks between them.
export const RAIL_X0 = -144;
export const RAIL_X1 = 166;
export const RAIL_H = 6;
export const RAIL_D = 8;
export const RAIL_A_Y = -30;
export const RAIL_B_Y = 18;
export const BED_Y = -12;
export const BED_D = 24;
export const SEG_H = 4;
/** How far the setup blocks sink on a reused connection: below the bed, out of sight. */
export const SEG_SINK = SEG_H + 0.8;

// The ruler bar in front of the rails, graduated in milliseconds.
export const RULER: Plan = { x: RAIL_X0, y: 34, w: RAIL_X1 - RAIL_X0, d: 11, r: 1.5 };
export const RULER_H = 5;

// The carriage (the request), built centred on x = 0 and moved along x.
export const CAR: Plan = { x: -18, y: -46, w: 36, d: 76, r: 3 };
export const CAR_Z = RAIL_H + 2;
export const CAR_H = 5;
export const CAR_TOP = CAR_Z + CAR_H;
export const BUSH_W = 10;
export const BUSH_D = 10;
export const BUSH_H = 9;

// The gateway: a measuring beam on two posts behind the rails, with a sensor that follows the carriage.
export const POST_Y = -71;
export const POST = 10;
export const POST_XS = [-154, 150];
export const BEAM_Z = 38;
export const BEAM_H = 6;
export const BEAM_X0 = -158;
export const BEAM_X1 = 164;
export const BEAM_Y = -69;
export const BEAM_D = 6;
export const BLOCK_Z = BEAM_Z - 3;
export const BLOCK_H = BEAM_H + 6;
export const ARM_Z = BEAM_Z - 2;
export const ARM_H = 4;
export const STEM_Y = -39;
export const STEM_TOP = ARM_Z;

// The dial gauge (elapsed time), at the right end of the rails.
export const DIAL: Flat = [194, 30];
export const DIAL_R = 17;
export const DIAL_Z = 3;
export const DIAL_H = 9;
export const DIAL_TOP = DIAL_Z + DIAL_H;
export const DIAL_COUNT = 20;

// The logger box (Spanrail), at the back right.
export const LOGGER: Plan = { x: 180, y: -64, w: 38, d: 36, r: 3 };
export const LOGGER_H = 24;
export const LAMP: Flat = [191, -46];

function fit() {
  const points: Point3[] = [
    ...boxCorners(BASE, -BASE_H - FOOT_H, 0),
    ...boxCorners({ x: BEAM_X0, y: BEAM_Y, w: BEAM_X1 - BEAM_X0, d: BEAM_D, r: 0 }, BEAM_Z, BEAM_Z + BEAM_H + 8),
    ...boxCorners(LOGGER, 0, LOGGER_H + 6),
  ];
  return fitProjection(points, WIDTH, HEIGHT, { pad: PAD, azimuth: AZIMUTH });
}

export const P = fit();
export const at = (point: Point3): Flat => iso(point, P);

const ORIGIN = at([0, 0, 0]);
const minus = (a: Flat, b: Flat): Flat => [a[0] - b[0], a[1] - b[1]];
/** Screen vector of one world unit along x and along z. */
export const EX = minus(at([1, 0, 0]), ORIGIN);
export const EZ = minus(at([0, 0, 1]), ORIGIN);

const fine = (value: number) => Math.round(value * 100) / 100;

/** A transform that moves a pre-built group by `x` along the rail and `z` up. */
export const shift = (x: number, z = 0) => `translate(${fine(EX[0] * x + EZ[0] * z)} ${fine(EX[1] * x + EZ[1] * z)})`;
