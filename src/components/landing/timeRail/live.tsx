"use client";

import * as React from "react";
import { IsoFigure } from "../../iso/react/draw";
import { asksForStillness, follow, useReadout } from "../../iso/react/live";
import { JourneyContext } from "../journeyContext";
import { needlePath } from "./geometry";
import { SETUP_SHIFT, TOTAL_FRESH, X0, carriageX, elapsedMs, needleAngle, readoutOf, totalMs } from "./rail";
import { HEIGHT, SEG_SINK, WIDTH, shift } from "./view";

const MOVE = 0.34; // seconds for the carriage to settle on a new position
const NEEDLE = 0.3;
const SLIDE = 0.36;
const LAST_STEP = 6;

interface Props {
  label: string;
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

/** The "use client" layer: it moves the carriage, the sensor, the needle and the sinking blocks on refs. */
export function TimeRailLive(props: Props) {
  const { step, reused } = React.useContext(JourneyContext);
  const { anchor, say } = useReadout<HTMLDivElement>();
  const carriage = React.useRef<SVGGElement | null>(null);
  const sensor = React.useRef<SVGGElement | null>(null);
  const needle = React.useRef<SVGPathElement | null>(null);
  const setup = React.useRef<SVGGElement | null>(null);
  const later = React.useRef<SVGGElement | null>(null);
  const lamp = React.useRef<SVGGElement | null>(null);
  const frame = React.useRef(0);
  const last = React.useRef(0);
  const shown = React.useRef<Values>({ x: X0, ms: 0, collapse: 0 });
  const goal = React.useRef({ step, reused });
  goal.current = { step, reused };

  const draw = React.useCallback(() => {
    const v = shown.current;
    const { reused: isReused, step: at } = goal.current;
    carriage.current?.setAttribute("transform", shift(v.x));
    sensor.current?.setAttribute("transform", shift(v.x));
    needle.current?.setAttribute("d", needlePath(needleAngle(v.ms)));
    // The three setup blocks sink out of the way on a reused connection; the other two slide back to close the gap.
    setup.current?.setAttribute("transform", shift(0, -SEG_SINK * v.collapse));
    if (setup.current) setup.current.style.opacity = `${1 - 0.9 * v.collapse}`;
    later.current?.setAttribute("transform", shift(-SETUP_SHIFT * v.collapse));
    if (lamp.current) {
      if (at === LAST_STEP) lamp.current.setAttribute("data-on", "");
      else lamp.current.removeAttribute("data-on");
    }
    say(readoutOf(v.ms, isReused ? totalMs(true) : totalMs(false)));
  }, [say]);

  const run = React.useCallback(() => {
    if (frame.current) return;
    last.current = 0;
    const tick = (now: number) => {
      const dt = last.current ? Math.min((now - last.current) / 1000, 1 / 30) : 1 / 60;
      last.current = now;
      const calm = asksForStillness();
      const want = goal.current;
      const target: Values = { x: carriageX(want.step, want.reused), ms: elapsedMs(want.step, want.reused), collapse: want.reused ? 1 : 0 };
      const v = shown.current;
      v.x = follow(v.x, target.x, dt, MOVE, calm);
      v.ms = follow(v.ms, target.ms, dt, NEEDLE, calm);
      v.collapse = follow(v.collapse, target.collapse, dt, SLIDE, calm);
      draw();
      const done = v.x === target.x && v.ms === target.ms && v.collapse === target.collapse;
      frame.current = done ? 0 : requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }, [draw]);

  React.useEffect(() => {
    run();
  }, [step, reused, run]);

  React.useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    },
    [],
  );

  return (
    <div ref={anchor} className="tr">
      <IsoFigure width={WIDTH} height={HEIGHT} label={props.label}>
        {props.base}
        {props.gateway}
        {props.logger}
        <g ref={lamp} className="tr-lamp">
          {props.lamp}
        </g>
        {props.rails}
        {props.bedFloor}
        <g ref={setup}>{props.setup}</g>
        <g ref={later}>{props.later}</g>
        {props.railFront}
        {props.ruler}
        {props.dial}
        <path ref={needle} className="iso-line tr-needle" data-tone="lit" data-free="" d={needlePath(needleAngle(0))} />
        {props.hub}
        <g ref={carriage} transform={shift(X0)}>
          {props.carriage}
        </g>
        <g ref={sensor} transform={shift(X0)}>
          {props.sensor}
        </g>
      </IsoFigure>
    </div>
  );
}

export const RESTING_READOUT = readoutOf(0, TOTAL_FRESH);
