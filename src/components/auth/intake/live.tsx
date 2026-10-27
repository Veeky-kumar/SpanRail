"use client";

import * as React from "react";
import { IsoFigure } from "../../iso/react/draw";
import { asksForStillness, follow, useInView, useReadout, useStillness } from "../../iso/react/live";
import { poseOf } from "./layout";
import { PARCELS, SCENARIO, countersOf, readoutOf } from "./model";
import { HEIGHT, SLIP_LIFT, SQUEEZE, WIDTH, shift } from "./view";

const GLIDE = 0.42; // seconds for a parcel to settle at its next station
const HOP = 0.2; // seconds for the lift that carries a parcel over a wall
const FADE = 0.25;
const PRESSING = 0.28;
const MAX_HOP = 9;
const LAST = SCENARIO.length - 1;

interface Props {
  label: string;
  base: React.ReactNode;
  back: React.ReactNode;
  slip: React.ReactNode;
  printer: React.ReactNode;
  middle: React.ReactNode;
  viewerRows: React.ReactNode;
  lamps: React.ReactNode[];
  parcels: React.ReactNode[];
  front: React.ReactNode;
  plunger: React.ReactNode;
  pressFront: React.ReactNode;
}

interface ParcelState {
  x: number;
  y: number;
  z: number;
  hop: number;
  o: number;
}

const first = SCENARIO[0];
const initialParcels = (): ParcelState[] =>
  PARCELS.map((p) => {
    const pose = poseOf(first, p.id);
    return { x: pose.x, y: pose.y, z: pose.z, hop: 0, o: pose.visible ? 1 : 0 };
  });

/**
 * The "use client" layer of the intake desk. It replays the scenario beat by beat (an idle tour that
 * pauses under the pointer, restarts on click, stops when out of view), gliding parcels between stations,
 * pressing, lifting the receipt slip and lighting the queue lamps, all on refs.
 */
export function IntakeLive(props: Props) {
  const { anchor, say } = useReadout<HTMLDivElement>();
  const stillness = useStillness();
  const inView = useInView(anchor);
  const [index, setIndex] = React.useState(0);
  const [pass, setPass] = React.useState<number | null>(null);
  const [restarts, setRestarts] = React.useState(0);
  const cursor = React.useRef(0);
  const hovering = React.useRef(false);

  // Reduced motion: the desk rests on its finished state, and a click plays it through once, gently.
  const onePass = stillness && pass !== null;
  const looping = !stillness && inView;
  const shownIndex = stillness && !onePass ? LAST : index;
  const goal = React.useRef(shownIndex);
  goal.current = shownIndex;
  const passing = React.useRef(false);
  passing.current = onePass;

  const parcelEls = React.useRef<(SVGGElement | null)[]>([]);
  const lampEls = React.useRef<(SVGGElement | null)[]>([]);
  const plungerEl = React.useRef<SVGGElement | null>(null);
  const slipEl = React.useRef<SVGGElement | null>(null);
  const viewEl = React.useRef<SVGGElement | null>(null);
  const shown = React.useRef<ParcelState[]>(initialParcels());
  const plunge = React.useRef(0);
  const lift = React.useRef(0);
  const frame = React.useRef(0);
  const last = React.useRef(0);

  // The idle tour.
  React.useEffect(() => {
    if (!looping && !onePass) return;
    let timer = 0;
    const step = () => {
      if (hovering.current) {
        timer = window.setTimeout(step, 300); // paused while the pointer is over it
        return;
      }
      const next = cursor.current + 1;
      if (next > LAST) {
        if (onePass) {
          setPass(null); // one pass played: settle on the finished desk
          return;
        }
        cursor.current = 0; // the loop starts over
      } else {
        cursor.current = next;
      }
      setIndex(cursor.current);
      timer = window.setTimeout(step, SCENARIO[cursor.current].dwellMs);
    };
    timer = window.setTimeout(step, SCENARIO[cursor.current].dwellMs);
    return () => window.clearTimeout(timer);
  }, [looping, onePass, restarts]);

  const replay = React.useCallback(() => {
    hovering.current = false; // asking for the replay overrides the pause the pointer is causing
    cursor.current = 0;
    setIndex(0);
    if (stillness) setPass((n) => (n ?? 0) + 1);
    setRestarts((n) => n + 1);
  }, [stillness]);

  // The words and the lamps follow the beat.
  React.useEffect(() => {
    const beat = SCENARIO[shownIndex];
    const counters = countersOf(beat);
    say(readoutOf(beat));
    const plate = anchor.current?.closest(".iso-plate");
    const hint = plate?.querySelector('[data-corner="hint"]');
    if (hint && hint.textContent !== beat.title) hint.textContent = beat.title;
    const detail = anchor.current?.closest("figure")?.querySelector("[data-detail]");
    if (detail && detail.textContent !== beat.detail) detail.textContent = beat.detail;
    lampEls.current.forEach((el, i) => {
      if (!el) return;
      if (i < counters.waiting) el.setAttribute("data-on", "");
      else el.removeAttribute("data-on");
    });
    viewEl.current?.setAttribute("data-n", String(counters.traces));
  }, [shownIndex, say, anchor]);

  const draw = React.useCallback(() => {
    shown.current.forEach((s, i) => {
      const el = parcelEls.current[i];
      if (!el) return;
      el.setAttribute("transform", shift(s.x, s.y, s.z + s.hop));
      el.style.opacity = `${s.o}`;
    });
    plungerEl.current?.setAttribute("transform", shift(0, 0, -SQUEEZE * plunge.current));
    slipEl.current?.setAttribute("transform", shift(0, 0, SLIP_LIFT * lift.current));
  }, []);

  const run = React.useCallback(() => {
    if (frame.current) return;
    last.current = 0;
    const tick = (now: number) => {
      const dt = last.current ? Math.min((now - last.current) / 1000, 1 / 30) : 1 / 60;
      last.current = now;
      const calm = asksForStillness() && !passing.current;
      const beat = SCENARIO[goal.current];
      let settled = true;
      PARCELS.forEach((p, i) => {
        const s = shown.current[i];
        const pose = poseOf(beat, p.id);
        if (pose.visible && s.o < 0.05) {
          // A parcel that arrives appears where it lands, then fades in: it never glides in from off the desk.
          s.x = pose.x;
          s.y = pose.y;
          s.z = pose.z;
          s.hop = 0;
        }
        const dist = Math.hypot(pose.x - s.x, pose.y - s.y);
        s.x = follow(s.x, pose.x, dt, GLIDE, calm);
        s.y = follow(s.y, pose.y, dt, GLIDE, calm);
        s.z = follow(s.z, pose.z, dt, GLIDE, calm);
        s.hop = follow(s.hop, pose.visible ? Math.min(MAX_HOP, dist * 0.25) : 0, dt, HOP, calm);
        s.o = follow(s.o, pose.visible ? 1 : 0, dt, FADE, calm);
        if (s.x !== pose.x || s.y !== pose.y || s.z !== pose.z || s.hop !== 0 || s.o !== (pose.visible ? 1 : 0)) settled = false;
      });
      plunge.current = follow(plunge.current, beat.merged !== null ? 1 : 0, dt, PRESSING, calm);
      lift.current = follow(lift.current, beat.ack ? 1 : 0, dt, PRESSING, calm);
      if (plunge.current !== (beat.merged !== null ? 1 : 0) || lift.current !== (beat.ack ? 1 : 0)) settled = false;
      draw();
      frame.current = settled ? 0 : requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }, [draw]);

  React.useEffect(() => {
    run();
  }, [shownIndex, run]);

  React.useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    },
    [],
  );

  return (
    <div
      ref={anchor}
      className="ip"
      data-tour=""
      data-still={stillness ? "" : undefined}
      onPointerEnter={() => (hovering.current = true)}
      onPointerLeave={() => (hovering.current = false)}
      onClick={replay}
    >
      <IsoFigure width={WIDTH} height={HEIGHT} label={props.label}>
        {props.base}
        {props.back}
        <g ref={slipEl} transform={shift(0, 0, 0)}>
          {props.slip}
        </g>
        {props.printer}
        {props.middle}
        <g ref={viewEl} className="ip-view" data-n="0">
          {props.viewerRows}
        </g>
        {props.lamps.map((lamp, i) => (
          <g
            key={i}
            ref={(el) => {
              lampEls.current[i] = el;
            }}
            className="ip-lamp-wrap"
          >
            {lamp}
          </g>
        ))}
        {props.parcels.map((node, i) => {
          const s = shown.current[i];
          return (
            <g
              key={PARCELS[i].id}
              ref={(el) => {
                parcelEls.current[i] = el;
              }}
              transform={shift(s.x, s.y, s.z + s.hop)}
              style={{ opacity: s.o }}
            >
              {node}
            </g>
          );
        })}
        {props.front}
        <g ref={plungerEl} transform={shift(0, 0, 0)}>
          {props.plunger}
        </g>
        {props.pressFront}
      </IsoFigure>
      <button
        type="button"
        className="ip-replay"
        onClick={(e) => {
          e.stopPropagation();
          replay();
        }}
      >
        {stillness ? "Play through once" : "Replay"}
      </button>
    </div>
  );
}
