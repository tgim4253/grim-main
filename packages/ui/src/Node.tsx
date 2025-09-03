type NodeProp = {
  [others: string]: any;
  id: string | number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number;
  fy: number;
};
type NodeRenderer = (ctx: CanvasRenderingContext2D, node: NodeProp, globalScale: number) => void;

const withCtx = (ctx: CanvasRenderingContext2D, draw: () => void) => {
  ctx.save();
  try {
    draw();
  } finally {
    ctx.restore();
  }
};

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

const getNodeRadius = (node: NodeProp) => {
  const base = node.size ?? 5; // logical px radius
  return base;
};

/** --- Default circle node --- */
const circleRenderer: NodeRenderer = (ctx, node, globalScale) => {
  const r = getNodeRadius(node);
  withCtx(ctx, () => {
    // keep lineWidth roughly constant regardless of zoom
    const lw = Math.max(1, 2 / Math.max(0.001, globalScale));

    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
    ctx.fillStyle = node.color ?? '#60a5fa'; // blue-400
    ctx.fill();

    ctx.lineWidth = lw;
    ctx.strokeStyle = '#1e3a8a'; // blue-900
    ctx.stroke();

    // optional label
    if (node.label) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#0f172a'; // slate-900
      ctx.fillText(String(node.label), node.x, node.y + r + 4);
    }
  });
};

const tagRenderer: NodeRenderer = (ctx, node, globalScale) => {
  const r = getNodeRadius(node);
  const s = r * 2.0;

  const t = Math.max(2, (s * 0.18) / Math.max(0.001, globalScale));

  withCtx(ctx, () => {
    ctx.translate(node.x, node.y);

    // soft plate behind the hash (optional, improves contrast)
    const plateR = 8;
    withCtx(ctx, () => {
      const w = s * 1.4;
      const h = s * 1.1;
      ctx.globalAlpha = 0.9;
      roundRect(ctx, -w / 2, -h / 2, w, h, plateR);
      ctx.fillStyle = node.bgColor ?? '#0ea5e9'; // sky-500
      ctx.fill();
      ctx.lineWidth = Math.max(1, 2 / Math.max(0.001, globalScale));
      ctx.strokeStyle = '#0c4a6e'; // slate-ish
      ctx.stroke();
    });

    // draw the hash (#) using 4 strokes
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = node.fgColor ?? '#e0f2fe'; // light text
    ctx.lineWidth = t;

    const half = s * 0.38; // half-length of bars
    const xOff = s * 0.18; // offset between the two vertical bars
    const yOff = s * 0.16; // offset between the two horizontal bars

    ctx.beginPath();
    // vertical bars
    ctx.moveTo(-xOff, -half);
    ctx.lineTo(-xOff, half);
    ctx.moveTo(+xOff, -half);
    ctx.lineTo(+xOff, half);
    // horizontal bars
    ctx.moveTo(-half - s * 0.06, -yOff);
    ctx.lineTo(half + s * 0.06, -yOff);
    ctx.moveTo(-half - s * 0.06, +yOff);
    ctx.lineTo(half + s * 0.06, +yOff);
    ctx.stroke();

    // optional label to the right of the glyph
    if (node.label) {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#e0f2fe';
      ctx.fillText(String(node.label), s * 0.85, 0);
    }
  });
};

export { circleRenderer, tagRenderer };
