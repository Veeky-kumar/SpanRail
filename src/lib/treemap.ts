// Slice-and-dice treemap: split the list in two halves of near-equal value, along the longer side, and recurse.
// Simple, deterministic and good enough for the five to eight tiles we draw.
export interface TreemapItem {
  key: string;
  value: number;
}
export interface TreemapTile extends TreemapItem {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function layoutTreemap(items: TreemapItem[], w: number, h: number): TreemapTile[] {
  const live = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const out: TreemapTile[] = [];
  const split = (list: TreemapItem[], x: number, y: number, bw: number, bh: number) => {
    if (list.length === 0) return;
    if (list.length === 1) {
      out.push({ ...list[0], x, y, w: bw, h: bh });
      return;
    }
    const total = list.reduce((a, b) => a + b.value, 0);
    let acc = 0;
    let cut = 1;
    for (let i = 0; i < list.length - 1; i++) {
      acc += list[i].value;
      cut = i + 1;
      if (acc >= total / 2) break;
    }
    const a = list.slice(0, cut);
    const b = list.slice(cut);
    const share = a.reduce((s, q) => s + q.value, 0) / total;
    if (bw >= bh) {
      split(a, x, y, bw * share, bh);
      split(b, x + bw * share, y, bw * (1 - share), bh);
    } else {
      split(a, x, y, bw, bh * share);
      split(b, x, y + bh * share, bw, bh * (1 - share));
    }
  };
  split(live, 0, 0, w, h);
  return out;
}
