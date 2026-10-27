// Plain-language notes about what changed between two periods, worked out from the same numbers the tables show.
import { pctChange } from "./series";

export interface ModelPeriod {
  model: string;
  cost: number;
  prevCost: number;
  generations: number;
  errors: number;
}

export interface Insight {
  head: string;
  body: string;
}

const usd = (n: number) => (n < 100 ? `$${n.toFixed(2)}` : `$${Math.round(n).toLocaleString("en-US")}`);
const pct = (f: number) => `${Math.abs(Math.round(f * 100))}%`;

export function modelInsights(models: ModelPeriod[]): Insight[] {
  const out: Insight[] = [];
  const spend = models.reduce((a, m) => a + m.cost, 0);

  // The model whose spend moved the most, in dollars, so a tiny model doubling does not outrank a big one shifting.
  const mover = [...models].sort((a, b) => Math.abs(b.cost - b.prevCost) - Math.abs(a.cost - a.prevCost))[0];
  if (mover && mover.cost !== mover.prevCost) {
    const change = pctChange(mover.cost, mover.prevCost);
    const dir = mover.cost > mover.prevCost ? "up" : "down";
    out.push({
      head: `${mover.model} moved the most.`,
      body:
        change === null
          ? `It spent ${usd(mover.cost)} this period and nothing in the one before.`
          : `Its spend is ${dir} ${pct(change)} to ${usd(mover.cost)}, ${usd(Math.abs(mover.cost - mover.prevCost))} ${dir === "up" ? "more" : "less"} than before.`,
    });
  }

  // How concentrated the bill is.
  const ranked = [...models].sort((a, b) => b.cost - a.cost);
  if (ranked.length >= 3 && spend > 0) {
    const share = (ranked[0].cost + ranked[1].cost) / spend;
    if (share >= 0.6) {
      out.push({
        head: `Two models are ${pct(share)} of spend.`,
        body: `${ranked[0].model} and ${ranked[1].model} carry most of the bill. Cheaper models for the simple calls are where savings are.`,
      });
    }
  }

  // A model that fails noticeably more than the rest, once it has enough calls to mean something.
  const totalGen = models.reduce((a, m) => a + m.generations, 0);
  const totalErr = models.reduce((a, m) => a + m.errors, 0);
  const base = totalGen > 0 ? totalErr / totalGen : 0;
  const worst = models
    .filter((m) => m.generations >= 20)
    .map((m) => ({ m, rate: m.errors / m.generations }))
    .sort((a, b) => b.rate - a.rate)[0];
  if (worst && worst.rate >= 0.02 && worst.rate >= base * 1.5) {
    out.push({
      head: `${worst.m.model} fails most often.`,
      body: `${pct(worst.rate)} of its ${worst.m.generations.toLocaleString("en-US")} calls ended in an error, against ${pct(base)} across all models.`,
    });
  }
  return out;
}
