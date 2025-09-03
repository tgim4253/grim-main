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
  const base = node.size ?? 18; // logical px radius
  return base;
};

const tagRenderer: NodeRenderer = (ctx, node, globalScale) => {
  const r = getNodeRadius(node);
  const w = r * 2.4,
    h = r * 1.4;
  withCtx(ctx, () => {
    ctx.translate(node.x - w / 2, node.y - h / 2);
    roundRect(ctx, 0, 0, w, h, 10);
    ctx.fillStyle = node.color ?? '#0ea5e9'; // sky-500
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#0c4a6e'; // slate-ish
    ctx.stroke();
    // icon + label
    ctx.font = `${Math.max(10, h * 0.45)}px inter, system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e0f2fe';
    ctx.fillText('🏢', w * 0.14, h * 0.52);
    ctx.font = `${Math.max(10, h * 0.35)}px inter, system-ui`;
    ctx.fillText(node.label || 'Company', w * 0.62, h * 0.52);
  });
};

export { tagRenderer };
