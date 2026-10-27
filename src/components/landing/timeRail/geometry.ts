// Every static path of the time rail, computed once at module load (server side). The client only
// receives finished path strings; it rebuilds just the dial needle each frame.
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
  radialTicks,
  ring as kitRing,
  segment as kitSegment,
  sideArc,
  sideSeam,
  slabOf,
  topMatrix,
  topTicks,
  type Flat,
  type Plan,
  type Plane,
  type Point3,
} from "../../iso/iso-kit";
import { DIAL_FROM, DIAL_SPAN, X0, type RailModel } from "./rail";
import {
  ARM_H,
  ARM_Z,
  BASE,
  BASE_H,
  BEAM_D,
  BEAM_H,
  BEAM_X0,
  BEAM_X1,
  BEAM_Y,
  BEAM_Z,
  BED_D,
  BED_Y,
  BLOCK_H,
  BLOCK_Z,
  BUSH_D,
  BUSH_H,
  BUSH_W,
  CAR,
  CAR_H,
  CAR_TOP,
  CAR_Z,
  DIAL,
  DIAL_COUNT,
  DIAL_H,
  DIAL_R,
  DIAL_TOP,
  DIAL_Z,
  FOOT_H,
  LAMP,
  LOGGER,
  LOGGER_H,
  P,
  POST,
  POST_XS,
  POST_Y,
  RAIL_A_Y,
  RAIL_B_Y,
  RAIL_D,
  RAIL_H,
  RAIL_X0,
  RAIL_X1,
  RULER,
  RULER_H,
  SEG_H,
  STEM_TOP,
  STEM_Y,
  at,
} from "./view";

const solid = (plan: Plan, z: number, h: number, steps = 6, bevel = 0) => slabOf(plan, z, h, P, steps, bevel);
const cyl = (cx: number, cy: number, r: number, z: number, h: number, steps = 32) => extrude(circleRing(cx, cy, r, steps), z, h, P, { convex: true });
const ring = (cx: number, cy: number, r: number, z: number, steps = 40) => kitRing(cx, cy, r, z, P, steps);
const segment = (a: Point3, b: Point3) => kitSegment(a, b, P);
const knurl = (cx: number, cy: number, r: number, z0: number, z1: number, count: number) => kitKnurl(cx, cy, r, z0, z1, count, P);
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

// ---------------------------------------------------------------- rails, bed and ruler
const RAIL_PLANS: Plan[] = [RAIL_A_Y, RAIL_B_Y].map((y) => ({ x: RAIL_X0, y: y - RAIL_D / 2, w: RAIL_X1 - RAIL_X0, d: RAIL_D, r: 2 }));
const RAIL_FEET_X = [RAIL_X0 + 14, RAIL_X1 - 14];

export const RAIL_ART = {
  rails: RAIL_PLANS.map((plan) => solid(plan, 0, RAIL_H, 4, 0.8)),
  railTops: RAIL_PLANS.map((plan) => onTop([[plan.x + 3, plan.y + plan.d / 2], [plan.x + plan.w - 3, plan.y + plan.d / 2]], RAIL_H, P)),
  railScrews: RAIL_PLANS.flatMap((plan) => RAIL_FEET_X.map((x) => at([x, plan.y + plan.d / 2, RAIL_H]))),
  seams: RAIL_PLANS.map((plan) => join([-50, 40, 120].map((x) => segment([x, plan.y + plan.d, 0], [x, plan.y + plan.d, RAIL_H])))),
  stops: [RAIL_X0 - 2, RAIL_X1 - 1].map((x) => solid({ x, y: RAIL_A_Y - RAIL_D / 2 - 1, w: 3, d: RAIL_B_Y - RAIL_A_Y + RAIL_D + 2, r: 0.8 }, 0, RAIL_H + 3, 3, 0.4)),
};

const RULER_TOP = RULER_H;

/** The ruler bar itself: the same for every call. */
export const RULER_ART = {
  bar: solid(RULER, 0, RULER_H, 4, 0.6),
  zero: lineOnTop([X0, RULER.y + 0.6], [X0, RULER.y + RULER.d - 1.2], RULER_TOP, P),
  screws: [RAIL_X0 + 6, RAIL_X1 - 6].map((x) => at([x, RULER.y + RULER.d - 2.2, RULER_TOP])),
};

/**
 * The graduations for one call: a major tick every `tickMs` (a round number of ms for this call's
 * size), four minor ticks between, from zero to the end of the ruler.
 */
export function rulerOf(model: RailModel) {
  const end = X0 + model.spanMs * model.k;
  const minorStep = (model.tickMs / 5) * model.k;
  const ticks = topTicks(X0, end, minorStep, 5, RULER.y + 0.6, RULER_TOP, [2, 4.2], P);
  return {
    base: onTop([[X0 - 3, RULER.y + 0.6], [end + 3, RULER.y + 0.6]], RULER_TOP, P),
    minor: ticks.minor,
    major: ticks.major,
  };
}

// ---------------------------------------------------------------- phase blocks (the bed)
const SEG_Y = BED_Y;
export const BED_ART = {
  floor: solid({ x: RAIL_X0 + 3, y: BED_Y - 3, w: RAIL_X1 - RAIL_X0 - 6, d: BED_D + 6, r: 1 }, 0, 0.8, 2),
};

/** One block per phase that happened, as long as the phase was (widened only to stay visible). */
export function segmentsOf(model: RailModel) {
  return model.segs.map((seg) => {
    const plan: Plan = { x: seg.x0 + 0.25, y: SEG_Y, w: Math.max(seg.w - 0.5, 0.9), d: BED_D, r: Math.min(1.4, seg.w / 3) };
    const mid = seg.x0 + seg.w / 2;
    return {
      key: seg.key,
      body: solid(plan, 0.8, SEG_H - 0.8, 3, 0.4),
      groove: seg.w > 12 ? planOutline(insetPlan(plan, 2.2), SEG_H, P, 3) : "",
      screws: seg.w > 8 ? [at([mid, SEG_Y + 3.6, SEG_H]), at([mid, SEG_Y + BED_D - 3.6, SEG_H])] : [],
    };
  });
}

// ---------------------------------------------------------------- the carriage (moves along x)
const BUSH_PLANS: Plan[] = [-10, 10].flatMap((x) => [RAIL_A_Y, RAIL_B_Y].map((y) => ({ x: x - BUSH_W / 2, y: y - BUSH_D / 2, w: BUSH_W, d: BUSH_D, r: 2 })));
const POINTER: Plan = { x: -2.2, y: CAR.y + CAR.d, w: 4.4, d: RULER.y + 6 - (CAR.y + CAR.d), r: 0.8 };
const KNOB: Flat = [0, 4];

export const CARRIAGE_ART = {
  halo: solid(insetPlan(CAR, 3), 0.8, 0.1).fill,
  plate: solid(CAR, CAR_Z, CAR_H, 6, 0.8),
  seat: planOutline(insetPlan(CAR, 5), CAR_TOP, P, 6),
  rivets: [-12, -6, 0, 6, 12].map((x) => at([x, CAR.y + CAR.d - 2.6, CAR_TOP])),
  bushes: byDepth(BUSH_PLANS, (plan) => [plan.x, plan.y, 0]).map((plan) => ({
    body: solid(plan, RAIL_H, BUSH_H, 3, 0.6),
    screws: [at([plan.x + 2.6, plan.y + plan.d / 2, RAIL_H + BUSH_H]), at([plan.x + plan.w - 2.6, plan.y + plan.d / 2, RAIL_H + BUSH_H])],
  })),
  knob: cyl(KNOB[0], KNOB[1], 3.4, CAR_TOP, 3.4, 20),
  knobKnurl: knurl(KNOB[0], KNOB[1], 3.4, CAR_TOP, CAR_TOP + 3.4, 18),
  pointer: solid(POINTER, CAR_Z + 1, 2.4, 2, 0.3),
  index: lineOnTop([0, POINTER.y + 1.2], [0, POINTER.y + POINTER.d - 0.4], CAR_Z + 3.4, P),
  indexDot: at([0, POINTER.y + POINTER.d - 0.4, CAR_Z + 3.4]),
};

// ---------------------------------------------------------------- the gateway: beam, posts, sensor
const POST_PLANS: Plan[] = POST_XS.map((x) => ({ x: x - POST / 2, y: POST_Y - POST / 2, w: POST, d: POST, r: 2 }));
const BEAM: Plan = { x: BEAM_X0, y: BEAM_Y, w: BEAM_X1 - BEAM_X0, d: BEAM_D, r: 1.5 };
const BEAM_TOP = BEAM_Z + BEAM_H;
const BEAM_RULE_FROM = BEAM_X0 + 6;
const BEAM_RULE_TO = BEAM_X1 - 6;

function beamTicks() {
  const minor: string[] = [];
  const major: string[] = [];
  for (let x = Math.ceil(BEAM_RULE_FROM / 7) * 7; x <= BEAM_RULE_TO; x += 7) {
    const big = Math.round(x / 7) % 5 === 0;
    (big ? major : minor).push(segment([x, BEAM_Y + BEAM_D, BEAM_TOP], [x, BEAM_Y + BEAM_D, BEAM_TOP - (big ? 3.6 : 2.2)]));
  }
  return { minor: join(minor), major: join(major) };
}
const BEAM_TICKS = beamTicks();

export const GATEWAY_ART = {
  feet: POST_PLANS.map((plan) => solid(insetPlan(plan, -3), 0, 2, 4)),
  footScrews: POST_PLANS.flatMap((plan) => [at([plan.x - 1, plan.y + POST / 2, 2]), at([plan.x + POST + 1, plan.y + POST / 2, 2])]),
  posts: POST_PLANS.map((plan) => solid(plan, 2, BEAM_Z - 2, 4, 0.5)),
  postLines: join(POST_PLANS.map((plan) => segment([plan.x + POST / 2, plan.y + POST, 2], [plan.x + POST / 2, plan.y + POST, BEAM_Z]))),
  beam: solid(BEAM, BEAM_Z, BEAM_H, 4, 0.7),
  beamMinor: BEAM_TICKS.minor,
  beamMajor: BEAM_TICKS.major,
  beamScrews: POST_PLANS.map((plan) => at([plan.x + POST / 2, BEAM_Y + BEAM_D / 2, BEAM_TOP])),
};

const BLOCK: Plan = { x: -9, y: BEAM_Y - 3, w: 18, d: BEAM_D + 6, r: 2.5 };
const ARM: Plan = { x: -3, y: BLOCK.y + BLOCK.d, w: 6, d: STEM_Y - (BLOCK.y + BLOCK.d) + 3, r: 1.2 };

export const SENSOR_ART = {
  halo: solid(insetPlan(ARM, -1), CAR_TOP, 0.1).fill,
  pad: cyl(0, STEM_Y, 4.4, CAR_TOP, 2.6, 28),
  padRing: ring(0, STEM_Y, 3, CAR_TOP + 2.6, 24),
  stem: cyl(0, STEM_Y, 1.7, CAR_TOP + 2.6, STEM_TOP - CAR_TOP - 2.6, 16),
  stemMarks: join([5, 9, 13].map((rise) => sideArc(0, STEM_Y, 1.7, CAR_TOP + 2.6 + rise, P, 12))),
  arm: solid(ARM, ARM_Z, ARM_H, 4, 0.5),
  armLine: lineOnTop([0, ARM.y + 2], [0, STEM_Y], ARM_Z + ARM_H, P),
  armScrews: [at([0, ARM.y + 2.4, ARM_Z + ARM_H]), at([0, STEM_Y + 1.2, ARM_Z + ARM_H])],
  block: solid(BLOCK, BLOCK_Z, BLOCK_H, 5, 0.7),
  blockLine: planOutline(insetPlan(BLOCK, 2), BLOCK_Z + BLOCK_H, P, 4),
  blockScrews: [at([BLOCK.x + 3, BLOCK.y + 3, BLOCK_Z + BLOCK_H]), at([BLOCK.x + BLOCK.w - 3, BLOCK.y + 3, BLOCK_Z + BLOCK_H])],
  lens: cyl(0, BLOCK.y + BLOCK.d - 0.4, 2.6, BLOCK_Z + 3, 4, 20),
  index: kitSegment([0, BLOCK.y + BLOCK.d + 0.2, BLOCK_Z + BLOCK_H - 1], [0, BLOCK.y + BLOCK.d + 0.2, BLOCK_Z + 1.4], P),
};

// ---------------------------------------------------------------- the dial gauge: elapsed time
const [DX, DY] = DIAL;
const STAND: Plan = { x: DX - 20, y: DY - 18, w: 40, d: 36, r: 3 };
const DIAL_TICKS = radialTicks(DX, DY, DIAL_R - 2.6, DIAL_COUNT, 5, DIAL_TOP, [1.4, 2.8], P, DIAL_FROM, DIAL_SPAN);

export const DIAL_ART = {
  stand: solid(STAND, 0, DIAL_Z, 4, 0.6),
  standScrews: [
    at([STAND.x + 3.6, STAND.y + 3.6, DIAL_Z]),
    at([STAND.x + STAND.w - 3.6, STAND.y + STAND.d - 3.6, DIAL_Z]),
    at([STAND.x + 3.6, STAND.y + STAND.d - 3.6, DIAL_Z]),
    at([STAND.x + STAND.w - 3.6, STAND.y + 3.6, DIAL_Z]),
  ],
  puck: cyl(DX, DY, DIAL_R, DIAL_Z, DIAL_H, 56),
  band: sideArc(DX, DY, DIAL_R, DIAL_Z + DIAL_H - 3, P, 40),
  knurl: kitKnurl(DX, DY, DIAL_R, DIAL_Z + DIAL_H - 3, DIAL_Z + DIAL_H, 56, P),
  bezel: ring(DX, DY, DIAL_R - 1, DIAL_TOP, 56),
  face: ring(DX, DY, DIAL_R - 2.4, DIAL_TOP, 56),
  minor: DIAL_TICKS.minor,
  major: DIAL_TICKS.major,
  hub: ring(DX, DY, 1.6, DIAL_TOP, 16),
  crown: solid({ x: DX - 2.4, y: DY - DIAL_R - 3.6, w: 4.8, d: 4, r: 1.2 }, DIAL_Z + 2, 4, 3),
  crownCap: solid({ x: DX - 3.2, y: DY - DIAL_R - 6.2, w: 6.4, d: 2.8, r: 1.2 }, DIAL_Z + 1.4, 5.4, 3),
  lug: solid({ x: DX - DIAL_R - 3.2, y: DY - 3, w: 4, d: 6, r: 1.2 }, DIAL_Z + 1.5, 5, 3),
  label: topMatrix([DX, DY + 7.2], DIAL_TOP, P, "x"),
};

// ---------------------------------------------------------------- the logger box: Spanrail
const SLOT_PLANS: Plan[] = [0, 1, 2].map((row) => ({ x: LOGGER.x + 6, y: LOGGER.y + 20 + row * 4.2, w: 24, d: 2, r: 1 }));
const LOGGER_PLATE: Plan = { x: LOGGER.x + 6, y: LOGGER.y + 4, w: 26, d: 8, r: 1.5 };

export const LOGGER_ART = {
  halo: solid(LOGGER, 0, 0.1).fill,
  case: solid(LOGGER, 0, LOGGER_H, 5, 0.8),
  seam: sideSeam(LOGGER, 15, P, 5),
  slots: SLOT_PLANS.map((plan) => planOutline(plan, LOGGER_H, P, 3)),
  plate: solid(LOGGER_PLATE, LOGGER_H, 0.7, 3),
  plateRule: join([0, 1].map((row) => lineOnTop([LOGGER_PLATE.x + 3, LOGGER_PLATE.y + 2.6 + row * 2.6], [LOGGER_PLATE.x + (row ? 14 : 21), LOGGER_PLATE.y + 2.6 + row * 2.6], LOGGER_H + 0.7, P))),
  screws: [at([LOGGER.x + 3, LOGGER.y + 3, LOGGER_H]), at([LOGGER.x + LOGGER.w - 3, LOGGER.y + 3, LOGGER_H]), at([LOGGER.x + 3, LOGGER.y + LOGGER.d - 3, LOGGER_H]), at([LOGGER.x + LOGGER.w - 3, LOGGER.y + LOGGER.d - 3, LOGGER_H])],
  lampSocket: cyl(LAMP[0], LAMP[1], 4.6, LOGGER_H, 1.4, 28),
  lamp: cyl(LAMP[0], LAMP[1], 3.2, LOGGER_H + 1.4, 3, 24),
  lampRing: ring(LAMP[0], LAMP[1], 2.2, LOGGER_H + 4.4, 20),
};

