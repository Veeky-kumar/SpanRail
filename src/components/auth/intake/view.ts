import { boxCorners, fitProjection, iso, type Flat, type Plan, type Point3 } from "../../iso/iso-kit";

export const WIDTH = 600;
export const HEIGHT = 340;
const PAD = 22;
export const AZIMUTH = 50;
/** A higher camera than the default 30 degrees, so the long desk fills the card and the stations stay readable. */
export const ELEVATION = 42;

// The desk: a base plate on four feet. The stations stand along x, in the order a call is processed.
export const BASE: Plan = { x: -176, y: -70, w: 278, d: 140, r: 9 };
export const BASE_H = 9;
export const FOOT_H = 5;

// Intake: a table, a bin for the arriving batch, and a gate with a key slot and a receipt printer.
export const TABLE: Plan = { x: -166, y: -24, w: 62, d: 48, r: 3 };
export const TABLE_TOP = 2;
export const BIN_WALL = 2;
export const BIN_X0 = -164;
export const BIN_W = 28;
export const BIN_Y0 = -20;
export const BIN_D = 40;
export const BIN_H = 8;
export const GATE_X = -131;
export const GATE_POST = 6;
export const GATE_Y = 30;
export const GATE_Z = 32;
export const GATE_BAR_H = 5;
export const PRINTER: Plan = { x: -136, y: 30, w: 18, d: 12, r: 2 };
export const PRINTER_H = 9;
export const SLIP_LIFT = 8;

// Staging tray (the staging table) and the queue lamps.
export const TRAY_PLAN: Plan = { x: -100, y: -26, w: 36, d: 52, r: 2 };
export const TRAY_H = 3;
export const LAMPS: Plan = { x: -100, y: 30, w: 36, d: 8, r: 1.5 };
export const LAMP_H = 6;
export const LAMP_XS = [-91, -82, -73];

// The worker press.
export const BED: Plan = { x: -50, y: -18, w: 32, d: 36, r: 2 };
export const BED_H = 4;
export const PRESS_POST = 6;
export const PRESS_X = -37;
export const PRESS_BEAM_Z = 34;
export const PRESS_BEAM_H = 6;
export const SQUEEZE = 6.6;

// The filing tray (the Observation table).
export const FILE_PLAN: Plan = { x: -2, y: -14, w: 32, d: 28, r: 2 };
export const FILE_FLOOR = 2;
export const FILE_WALL_H = 6;

// The viewer (the dashboard).
export const VIEW_BASE: Plan = { x: 46, y: -14, w: 32, d: 28, r: 2 };
export const SCREEN: Plan = { x: 44, y: -8, w: 36, d: 5, r: 1.5 };
export const SCREEN_Z = 16;
export const SCREEN_H = 30;

// The mat that turned-away duplicates land on.
export const REJECT_MAT: Plan = { x: -126, y: 48, w: 20, d: 14, r: 2 };

function fit() {
  const points: Point3[] = [
    ...boxCorners(BASE, -BASE_H - FOOT_H, 0),
    ...boxCorners({ x: GATE_X, y: -GATE_Y, w: GATE_POST, d: GATE_Y * 2, r: 0 }, 0, GATE_Z + 12),
    ...boxCorners({ x: PRESS_X, y: -26, w: PRESS_POST, d: 52, r: 0 }, 0, PRESS_BEAM_Z + PRESS_BEAM_H),
    ...boxCorners(SCREEN, SCREEN_Z, SCREEN_Z + SCREEN_H),
  ];
  return fitProjection(points, WIDTH, HEIGHT, { pad: PAD, azimuth: AZIMUTH, elevation: ELEVATION });
}

export const P = fit();
export const at = (point: Point3): Flat => iso(point, P);

const ORIGIN = at([0, 0, 0]);
const minus = (a: Flat, b: Flat): Flat => [a[0] - b[0], a[1] - b[1]];
/** Screen vector of one world unit along x, y and z. */
export const EX = minus(at([1, 0, 0]), ORIGIN);
export const EY = minus(at([0, 1, 0]), ORIGIN);
export const EZ = minus(at([0, 0, 1]), ORIGIN);

const fine = (value: number) => Math.round(value * 100) / 100;

/** A transform that moves a pre-built group by (x, y, z) world units. */
export const shift = (x: number, y = 0, z = 0) =>
  `translate(${fine(EX[0] * x + EY[0] * y + EZ[0] * z)} ${fine(EX[1] * x + EY[1] * y + EZ[1] * z)})`;
