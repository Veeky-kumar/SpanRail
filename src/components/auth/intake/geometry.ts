// Every static path of the intake desk, computed once at module load on the server. The browser only
// receives finished path strings and moves the parcels, the plunger, the slip and the lamps.
import {
  circleRing,
  corners,
  depthOf,
  extrude,
  insetPlan,
  knurl as kitKnurl,
  lineOnTop,
  onTop,
  planOutline,
  ring as kitRing,
  segment as kitSegment,
  sideArc,
  sideSeam,
  slabOf,
  type Plan,
  type Plane,
  type Point3,
} from "../../iso/iso-kit";
import {
  BASE,
  BASE_H,
  BED,
  BED_H,
  BIN_D,
  BIN_H,
  BIN_W,
  BIN_WALL,
  BIN_X0,
  BIN_Y0,
  FILE_FLOOR,
  FILE_PLAN,
  FILE_WALL_H,
  FOOT_H,
  GATE_POST,
  GATE_X,
  GATE_Y,
  GATE_Z,
  GATE_BAR_H,
  LAMPS,
  LAMP_H,
  LAMP_XS,
  P,
  PRESS_BEAM_H,
  PRESS_BEAM_Z,
  PRESS_POST,
  PRESS_X,
  PRINTER,
  PRINTER_H,
  REJECT_MAT,
  SCREEN,
  SCREEN_H,
  SCREEN_Z,
  TABLE,
  TABLE_TOP,
  TRAY_H,
  TRAY_PLAN,
  VIEW_BASE,
  at,
} from "./view";
import { PRESS, PARCEL } from "./layout";

const solid = (plan: Plan, z: number, h: number, steps = 6, bevel = 0) => slabOf(plan, z, h, P, steps, bevel);
const cyl = (cx: number, cy: number, r: number, z: number, h: number, steps = 28) => extrude(circleRing(cx, cy, r, steps), z, h, P, { convex: true });
const ring = (cx: number, cy: number, r: number, z: number, steps = 32) => kitRing(cx, cy, r, z, P, steps);
const segment = (a: Point3, b: Point3) => kitSegment(a, b, P);
const join = (paths: string[]) => paths.join("");
const byDepth = <T,>(items: T[], pointOf: (item: T) => Point3) => [...items].sort((a, b) => depthOf(pointOf(a), P) - depthOf(pointOf(b), P));

// ---------------------------------------------------------------- base
const FEET: Plane[] = byDepth(
  [
    [BASE.x + 20, BASE.y + 18],
    [BASE.x + BASE.w - 20, BASE.y + 18],
    [BASE.x + 20, BASE.y + BASE.d - 18],
    [BASE.x + BASE.w - 20, BASE.y + BASE.d - 18],
  ] as Plane[],
  ([x, y]) => [x, y, 0],
);
const BASE_SCREWS = corners(BASE, 8);
const PLATE: Plan = { x: BASE.x + 22, y: BASE.y + BASE.d - 22, w: 58, d: 11, r: 2 };

export const BASE_ART = {
  halo: solid(BASE, -BASE_H - FOOT_H, BASE_H).fill,
  feet: FEET.map(([x, y]) => [cyl(x, y, 7, -BASE_H - FOOT_H, 1.6), cyl(x, y, 5.5, -BASE_H - FOOT_H + 1.6, FOOT_H - 1.6)]),
  slab: solid(BASE, -BASE_H, BASE_H, 8, 1.6),
  groove: planOutline(insetPlan(BASE, 4.5), 0, P),
  screws: BASE_SCREWS.map(([x, y]) => at([x, y, 0])),
  screwRings: join(BASE_SCREWS.map(([x, y]) => ring(x, y, 2.2, 0, 16))),
  plate: solid(PLATE, 0, 0.8, 4),
  plateLine: planOutline(insetPlan(PLATE, 1.6), 0.8, P),
  plateScrews: [at([PLATE.x + 3.5, PLATE.y + PLATE.d / 2, 0.8]), at([PLATE.x + PLATE.w - 3.5, PLATE.y + PLATE.d / 2, 0.8])],
  plateRule: join([0, 1, 2].map((row) => lineOnTop([PLATE.x + 8, PLATE.y + 3.4 + row * 2.1], [PLATE.x + (row === 1 ? 34 : 46), PLATE.y + 3.4 + row * 2.1], 0.8, P))),
};

// ---------------------------------------------------------------- intake: table, bin, gate, printer
const BIN_BACK: Plan = { x: BIN_X0, y: BIN_Y0, w: BIN_W, d: BIN_WALL, r: 0.6 };
const BIN_LEFT: Plan = { x: BIN_X0, y: BIN_Y0 + BIN_WALL, w: BIN_WALL, d: BIN_D - BIN_WALL * 2, r: 0.4 };
const BIN_RIGHT: Plan = { x: BIN_X0 + BIN_W - BIN_WALL, y: BIN_Y0 + BIN_WALL, w: BIN_WALL, d: BIN_D - BIN_WALL * 2, r: 0.4 };
const BIN_FRONT: Plan = { x: BIN_X0, y: BIN_Y0 + BIN_D - BIN_WALL, w: BIN_W, d: BIN_WALL, r: 0.6 };

export const INTAKE_ART = {
  table: solid(TABLE, 0, TABLE_TOP, 6, 0.6),
  tableGroove: planOutline(insetPlan(TABLE, 2.4), TABLE_TOP, P, 4),
  tableScrews: corners(TABLE, 4).map(([x, y]) => at([x, y, TABLE_TOP])),
  binBack: solid(BIN_BACK, TABLE_TOP, BIN_H, 2, 0.4),
  binLeft: solid(BIN_LEFT, TABLE_TOP, BIN_H, 2, 0.4),
  binRight: solid(BIN_RIGHT, TABLE_TOP, BIN_H, 2, 0.4),
  binFront: solid(BIN_FRONT, TABLE_TOP, BIN_H - 3, 2, 0.4),
};

const GATE_POSTS: Plan[] = [-GATE_Y, GATE_Y - GATE_POST].map((y) => ({ x: GATE_X, y, w: GATE_POST, d: GATE_POST, r: 1.2 }));
const GATE_BAR: Plan = { x: GATE_X, y: -GATE_Y, w: GATE_POST, d: GATE_Y * 2, r: 1.2 };
const GATE_TOP = GATE_Z + GATE_BAR_H;
const KEY_PLATE: Plan = { x: GATE_X + 1, y: -9, w: GATE_POST - 2, d: 18, r: 1 };
const KEY_AT: Plane = [GATE_X + GATE_POST / 2, 0];

export const GATE_ART = {
  postBack: solid(GATE_POSTS[0], 0, GATE_Z, 4, 0.5),
  postFront: solid(GATE_POSTS[1], 0, GATE_Z, 4, 0.5),
  postLines: join(GATE_POSTS.map((plan) => segment([plan.x + GATE_POST / 2, plan.y + GATE_POST, 0], [plan.x + GATE_POST / 2, plan.y + GATE_POST, GATE_Z]))),
  bar: solid(GATE_BAR, GATE_Z, GATE_BAR_H, 4, 0.6),
  plate: solid(KEY_PLATE, GATE_TOP, 1.2, 3),
  slot: planOutline(insetPlan(KEY_PLATE, 1.4), GATE_TOP + 1.2, P, 3),
  keyBlade: cyl(KEY_AT[0], KEY_AT[1], 1.1, GATE_TOP + 1.2, 6, 14),
  keyBow: cyl(KEY_AT[0], KEY_AT[1], 2.8, GATE_TOP + 7.2, 2.4, 20),
  keyKnurl: kitKnurl(KEY_AT[0], KEY_AT[1], 2.8, GATE_TOP + 7.2, GATE_TOP + 9.6, 14, P),
  screws: [at([GATE_X + 3, -GATE_Y + 3, GATE_TOP]), at([GATE_X + 3, GATE_Y - 3, GATE_TOP])],
};

const SLIP: Plan = { x: PRINTER.x + 4, y: PRINTER.y + 4, w: 10, d: 0.9, r: 0.2 };

export const PRINTER_ART = {
  slip: solid(SLIP, PRINTER_H - 6, 6, 2),
  slipRule: join([0, 1, 2].map((row) => segment([SLIP.x + 2, SLIP.y + SLIP.d, PRINTER_H - 1.4 - row * 1.5], [SLIP.x + SLIP.w - (row === 1 ? 4 : 2), SLIP.y + SLIP.d, PRINTER_H - 1.4 - row * 1.5]))),
  box: solid(PRINTER, 0, PRINTER_H, 5, 0.7),
  slot: planOutline({ x: PRINTER.x + 3, y: PRINTER.y + 3.2, w: PRINTER.w - 6, d: 1.8, r: 0.8 }, PRINTER_H, P, 3),
  // A seam on a box wraps its visible corners and ends under the outline (the kit's sideSeam, drawn as `inner`).
  seam: sideSeam(PRINTER, 5, P, 5),
  screws: [at([PRINTER.x + 3, PRINTER.y + PRINTER.d - 3, PRINTER_H]), at([PRINTER.x + PRINTER.w - 3, PRINTER.y + PRINTER.d - 3, PRINTER_H])],
};

// ---------------------------------------------------------------- staging tray and queue lamps
const TRAY_BACK: Plan = { x: TRAY_PLAN.x, y: TRAY_PLAN.y, w: TRAY_PLAN.w, d: 2, r: 0.6 };
const TRAY_FRONT: Plan = { x: TRAY_PLAN.x, y: TRAY_PLAN.y + TRAY_PLAN.d - 2, w: TRAY_PLAN.w, d: 2, r: 0.6 };

export const TRAY_ART = {
  base: solid(TRAY_PLAN, 0, TRAY_H, 5, 0.6),
  back: solid(TRAY_BACK, TRAY_H, 4, 2, 0.4),
  front: solid(TRAY_FRONT, TRAY_H, 3, 2, 0.4),
  // The lines that separate the three slots run the full width of the tray, edge to edge.
  slotLines: join([-8.5, 8.5].map((y) => onTop([[TRAY_PLAN.x, y], [TRAY_PLAN.x + TRAY_PLAN.w, y]], TRAY_H, P))),
  screws: [at([TRAY_PLAN.x + 3, TRAY_PLAN.y + 6, TRAY_H]), at([TRAY_PLAN.x + TRAY_PLAN.w - 3, TRAY_PLAN.y + 6, TRAY_H]), at([TRAY_PLAN.x + 3, TRAY_PLAN.y + TRAY_PLAN.d - 6, TRAY_H]), at([TRAY_PLAN.x + TRAY_PLAN.w - 3, TRAY_PLAN.y + TRAY_PLAN.d - 6, TRAY_H])],
};

export const LAMP_ART = {
  panel: solid(LAMPS, 0, LAMP_H, 4, 0.6),
  panelLine: planOutline(insetPlan(LAMPS, 1.4), LAMP_H, P, 3),
  sockets: LAMP_XS.map((x) => cyl(x, LAMPS.y + LAMPS.d / 2, 2.6, LAMP_H, 1, 20)),
  lamps: LAMP_XS.map((x) => cyl(x, LAMPS.y + LAMPS.d / 2, 1.8, LAMP_H + 1, 1.8, 18)),
};

// ---------------------------------------------------------------- the worker press
const PRESS_POSTS: Plan[] = [-26, 20].map((y) => ({ x: PRESS_X, y, w: PRESS_POST, d: PRESS_POST, r: 1.2 }));
const PRESS_BEAM: Plan = { x: PRESS_X - 1, y: -26, w: PRESS_POST + 2, d: 52, r: 1.5 };
const SLEEVE_TOP = PRESS_BEAM_Z;
const SLEEVE_BOTTOM = 22;
const PCX = PRESS.x;
const PCY = PRESS.y;

export const PRESS_ART = {
  bed: solid(BED, 0, BED_H, 5, 0.6),
  bedGroove: planOutline(insetPlan(BED, 2.4), BED_H, P, 4),
  bedScrews: corners(BED, 4).map(([x, y]) => at([x, y, BED_H])),
  postBack: solid(PRESS_POSTS[0], 0, PRESS_BEAM_Z, 4, 0.5),
  postFront: solid(PRESS_POSTS[1], 0, PRESS_BEAM_Z, 4, 0.5),
  postLines: join(PRESS_POSTS.map((plan) => segment([plan.x + PRESS_POST / 2, plan.y + PRESS_POST, 0], [plan.x + PRESS_POST / 2, plan.y + PRESS_POST, PRESS_BEAM_Z]))),
  beam: solid(PRESS_BEAM, PRESS_BEAM_Z, PRESS_BEAM_H, 4, 0.6),
  beamScrews: [at([PRESS_X + PRESS_POST / 2, -22, PRESS_BEAM_Z + PRESS_BEAM_H]), at([PRESS_X + PRESS_POST / 2, 22, PRESS_BEAM_Z + PRESS_BEAM_H])],
  sleeve: cyl(PCX, PCY, 4, SLEEVE_BOTTOM, SLEEVE_TOP - SLEEVE_BOTTOM, 24),
  sleeveSeam: join([SLEEVE_BOTTOM + 3, SLEEVE_BOTTOM + 8].map((z) => sideArc(PCX, PCY, 4, z, P, 14))),
  // The moving plunger: a rod that slides in the sleeve, and the head that presses.
  rod: cyl(PCX, PCY, 2.2, SLEEVE_BOTTOM - 4, SLEEVE_TOP - SLEEVE_BOTTOM + 3, 18),
  head: cyl(PCX, PCY, 6.5, SLEEVE_BOTTOM - 8, 4, 28),
  headRing: ring(PCX, PCY, 4.6, SLEEVE_BOTTOM - 4, 22),
  headKnurl: kitKnurl(PCX, PCY, 6.5, SLEEVE_BOTTOM - 8, SLEEVE_BOTTOM - 4, 26, P),
};

// ---------------------------------------------------------------- the filing tray (Observation table)
const FILE_BACK: Plan = { x: FILE_PLAN.x, y: FILE_PLAN.y, w: FILE_PLAN.w, d: 2, r: 0.6 };
const FILE_LEFT: Plan = { x: FILE_PLAN.x, y: FILE_PLAN.y + 2, w: 2, d: FILE_PLAN.d - 4, r: 0.4 };
const FILE_RIGHT: Plan = { x: FILE_PLAN.x + FILE_PLAN.w - 2, y: FILE_PLAN.y + 2, w: 2, d: FILE_PLAN.d - 4, r: 0.4 };
const FILE_FRONT: Plan = { x: FILE_PLAN.x, y: FILE_PLAN.y + FILE_PLAN.d - 2, w: FILE_PLAN.w, d: 2, r: 0.6 };
const FILE_LABEL: Plan = { x: FILE_PLAN.x + 8, y: FILE_PLAN.y + FILE_PLAN.d, w: 16, d: 0.8, r: 0.2 };

export const FILE_ART = {
  floor: solid(FILE_PLAN, 0, FILE_FLOOR, 5, 0.5),
  back: solid(FILE_BACK, FILE_FLOOR, FILE_WALL_H, 2, 0.4),
  left: solid(FILE_LEFT, FILE_FLOOR, FILE_WALL_H, 2, 0.4),
  right: solid(FILE_RIGHT, FILE_FLOOR, FILE_WALL_H, 2, 0.4),
  front: solid(FILE_FRONT, FILE_FLOOR, FILE_WALL_H - 2, 2, 0.4),
  label: solid(FILE_LABEL, 2, 3, 2),
  labelRule: join([0, 1].map((row) => segment([FILE_LABEL.x + 2, FILE_LABEL.y + FILE_LABEL.d, 3 + row * 1.4], [FILE_LABEL.x + (row ? 9 : 13), FILE_LABEL.y + FILE_LABEL.d, 3 + row * 1.4]))),
};

// ---------------------------------------------------------------- the viewer (the dashboard)
const FACE_Y = SCREEN.y + SCREEN.d;
const SCREEN_TOP = SCREEN_Z + SCREEN_H;
const row = (z: number, rootX: number) => ({
  line: join([segment([rootX, FACE_Y, z], [rootX + 17, FACE_Y, z]), segment([rootX + 4, FACE_Y, z], [rootX + 4, FACE_Y, z - 5]), segment([rootX + 4, FACE_Y, z - 5], [rootX + 14, FACE_Y, z - 5])]),
  dots: [at([rootX, FACE_Y, z]), at([rootX + 4, FACE_Y, z - 5])],
});

export const VIEWER_ART = {
  base: solid(VIEW_BASE, 0, 3, 4, 0.5),
  baseScrews: corners(VIEW_BASE, 4).map(([x, y]) => at([x, y, 3])),
  neck: solid({ x: VIEW_BASE.x + VIEW_BASE.w / 2 - 3, y: -4, w: 6, d: 6, r: 1 }, 3, SCREEN_Z - 3, 3),
  screen: solid(SCREEN, SCREEN_Z, SCREEN_H, 4, 0.6),
  bezel: join([
    segment([SCREEN.x + 3, FACE_Y, SCREEN_Z + 3], [SCREEN.x + SCREEN.w - 3, FACE_Y, SCREEN_Z + 3]),
    segment([SCREEN.x + SCREEN.w - 3, FACE_Y, SCREEN_Z + 3], [SCREEN.x + SCREEN.w - 3, FACE_Y, SCREEN_TOP - 3]),
    segment([SCREEN.x + SCREEN.w - 3, FACE_Y, SCREEN_TOP - 3], [SCREEN.x + 3, FACE_Y, SCREEN_TOP - 3]),
    segment([SCREEN.x + 3, FACE_Y, SCREEN_TOP - 3], [SCREEN.x + 3, FACE_Y, SCREEN_Z + 3]),
  ]),
  rows: [row(SCREEN_TOP - 9, SCREEN.x + 7), row(SCREEN_TOP - 20, SCREEN.x + 7)],
};

// ---------------------------------------------------------------- the reject mat
export const MAT_ART = {
  mat: solid(REJECT_MAT, 0, 1.5, 4, 0.3),
  mark: planOutline(insetPlan(REJECT_MAT, 2), 1.5, P, 3),
};

// ---------------------------------------------------------------- parcels (moved by the live layer)
const PARCEL_PLAN: Plan = { x: -PARCEL.w / 2, y: -PARCEL.d / 2, w: PARCEL.w, d: PARCEL.d, r: 1.2 };
const ruleAt = (rows: number) =>
  join(
    Array.from({ length: rows }, (_, i) => {
      const y = -PARCEL.d / 2 + 2.4 + i * 2.4;
      return lineOnTop([-PARCEL.w / 2 + 2.4, y], [PARCEL.w / 2 - (i === 1 ? 5 : 2.4), y], PARCEL.h, P);
    }),
  );

export const PARCEL_ART = {
  body: solid(PARCEL_PLAN, 0, PARCEL.h, 3, 0.4),
  // One rule for a trace-create, two for a generation-create, three for a generation-update.
  marks: { "trace-create": ruleAt(1), "generation-create": ruleAt(2), "generation-update": ruleAt(3) },
  halo: solid(insetPlan(PARCEL_PLAN, 1), 0, 0.1).fill,
};
