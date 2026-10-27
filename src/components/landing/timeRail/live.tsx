"use client";

import * as React from "react";
import { IsoFigure } from "../../iso/react/draw";
import { asksForStillness, follow, useReadout } from "../../iso/react/live";
import { JourneyContext } from "../journeyContext";
import { needlePath } from "./needle";
import { X0, carriageX, elapsedMs, needleAngle, readoutOf, totalMs, type RailModel } from "./rail";
import { HEIGHT, SEG_SINK, WIDTH, shift } from "./view";

const MOVE = 0.34; // seconds for the carriage to settle on a new position
const NEEDLE = 0.3;
const SLIDE = 0.36;
const LAST_STEP = 6;
/** The slide-in on the landing hero is slower than a step, so the eye can follow the whole call. */
const SLOW_MOVE = 1.1;

interface Props {
  model: RailModel;
  label: string;
  /** Show this stage of the call instead of following the stepper (the home page shows the finished call). */
  fixedStep?: number;
  /** With a fixed step: start at zero and travel there once on load, instead of showing the end at once. */
  slideIn?: boolean;
  base: React.ReactNode;
  gateway: React.ReactNode;
  logger: React.ReactNode;
  lamp: React.ReactNode;
  rails: React.ReactNode;
  bedFloor: React.ReactNode;
  setup: React.ReactNode;
  later: React.ReactNode;
  railFront: React.ReactNode;
  ruler: React.ReactNode;
  dial: React.ReactNode;
  hub: React.ReactNode;
  carriage: React.ReactNode;
  sensor: React.ReactNode;
}

interface Values {
  x: number;
  ms: number;
  collapse: number;
}

function valuesFor(model: RailModel, step: number, reused: boolean): Values {
  return { x: carriageX(model, step, reused), ms: elapsedMs(model, step, reused), collapse: reused ? 1 : 0 };
}

/** The "use client" layer: it moves the carriage, the sensor, the needle and the sinking blocks on refs. */
export function TimeRailLive({ model, fixedStep, slideIn = false, ...props }: Props) {
  const journey = React.useContext(JourneyContext);
  const step = fixedStep ?? journey.step;
  const reused = fixedStep !== undefined ? false : journey.reused;
  const { anchor, say } = useReadout<HTMLDivElement>();
  const carriage = React.useRef<SVGGElement | null>(null);
  const sensor = React.useRef<SVGGElement | null>(null);
  const needle = React.useRef<SVGPathElement | null>(null);
  const setup = React.useRef<SVGGElement | null>(null);
  const later = React.useRef<SVGGElement | null>(null);
  const lamp = React.useRef<SVGGElement | null>(null);
  const frame = React.useRef(0);
  const last = React.useRef(0);

  // The pose rendered on the server and on the first client render: at rest, unless a fixed step is
  // shown without a slide-in, in which case the finished call is drawn straight away.
  const initial = React.useMemo<Values>(
    () => (fixedStep !== undefined && !slideIn ? valuesFor(model, fixedStep, false) : { x: X0, ms: 0, collapse: reused ? 1 : 0 }),
    [model, fixedStep, slideIn, reused],
  );
  const shown = React.useRef<Values>({ ...initial });
  const goal = React.useRef({ step, reused });
  goal.current = { step, reused };
  const modelRef = React.useRef(model);
  modelRef.current = model;
  const slow = React.useRef(fixedStep !== undefined && slideIn);

  const draw = React.useCallback(() => {
    const v = shown.current;
    const m = modelRef.current;
    const { reused: isReused, step: at } = goal.current;
    carriage.current?.setAttribute("transform", shift(v.x));
    sensor.current?.setAttribute("transform", shift(v.x));
    needle.current?.setAttribute("d", needlePath(needleAngle(m, v.ms)));
    // The three setup blocks sink out of the way on a reused connection; the other blocks slide back to close the gap.
    setup.current?.setAttribute("transform", shift(0, -SEG_SINK * v.collapse));
    if (setup.current) setup.current.style.opacity = `${1 - 0.9 * v.collapse}`;
    later.current?.setAttribute("transform", shift(-m.setupShift * v.collapse));
    if (lamp.current) {
      if (at === LAST_STEP) lamp.current.setAttribute("data-on", "");
      else lamp.current.removeAttribute("data-on");
    }
    say(readoutOf(v.ms, totalMs(m, isReused)));
  }, [say]);

  const run = React.useCallback(() => {
    if (frame.current) return;
    last.current = 0;
    const tick = (now: number) => {
      const dt = last.current ? Math.min((now - last.current) / 1000, 1 / 30) : 1 / 60;
      last.current = now;
      const calm = asksForStillness();
      const want = goal.current;
      const target = valuesFor(modelRef.current, want.step, want.reused);
      const v = shown.current;
      const move = slow.current ? SLOW_MOVE : MOVE;
      v.x = follow(v.x, target.x, dt, move, calm);
      v.ms = follow(v.ms, target.ms, dt, slow.current ? SLOW_MOVE : NEEDLE, calm);
      v.collapse = follow(v.collapse, target.collapse, dt, SLIDE, calm);
      draw();
      const done = v.x === target.x && v.ms === target.ms && v.collapse === target.collapse;
      if (done) slow.current = false;
      frame.current = done ? 0 : requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }, [draw]);

  React.useEffect(() => {
    run();
  }, [step, reused, model, run]);

  React.useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    },
    [],
  );

  const initiallyDone = fixedStep === LAST_STEP && !slideIn;

  return (
    <div ref={anchor} className="tr">
      <IsoFigure width={WIDTH} height={HEIGHT} label={props.label}>
        {props.base}
        {props.gateway}
        {props.logger}
        <g ref={lamp} className="tr-lamp" data-on={initiallyDone ? "" : undefined}>
          {props.lamp}
        </g>
        {props.rails}
        {props.bedFloor}
        <g ref={setup} transform={shift(0, -SEG_SINK * initial.collapse)} style={{ opacity: 1 - 0.9 * initial.collapse }}>
          {props.setup}
        </g>
        <g ref={later} transform={shift(-model.setupShift * initial.collapse)}>
          {props.later}
        </g>
        {props.railFront}
        {props.ruler}
        {props.dial}
        <path ref={needle} className="iso-line tr-needle" data-tone="lit" data-free="" d={needlePath(needleAngle(model, initial.ms))} />
        {props.hub}
        <g ref={carriage} transform={shift(initial.x)}>
          {props.carriage}
        </g>
        <g ref={sensor} transform={shift(initial.x)}>
          {props.sensor}
        </g>
      </IsoFigure>
    </div>
  );
}
