// =========================
// Types
// =========================

import { GraphNodeType } from '@tgim/types/graph';

type NodeProp = {
  [key: string]: any; // extensible payload
  x: number;
  y: number;
  color?: string; // primary fill (legacy)
  bgColor?: string; // background fill (preferred)
  fgColor?: string; // foreground (strokes/text)
  size: number; // logical diameter
  label: string;
  icon?: 'circle' | 'tag' | 'folder' | 'image';
};

type NodeRenderer = (ctx: CanvasRenderingContext2D, node: NodeProp, globalScale: number) => void;

// =========================
// Utils
// =========================

const withCtx = (ctx: CanvasRenderingContext2D, draw: () => void) => {
  ctx.save();
  try {
    draw();
  } finally {
    ctx.restore();
  }
};

/** Keep stroke width roughly constant regardless of zoom */
const constPx = (v: number, globalScale: number) => Math.max(1, v / Math.max(0.001, globalScale));

/** Rounded-rect path helper */
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

/** Node radius in logical pixels */
const getNodeRadius = (node: NodeProp) => node.size / 2;

// =========================
// Sprite Cache & Helpers (NEW)
// =========================

const _spriteCache = new Map<string, HTMLCanvasElement>(); // shapes/icons
const _textSpriteCache = new Map<string, HTMLCanvasElement>(); // labels
const _imgTileCache = new Map<string, HTMLCanvasElement>(); // masked image tiles

const DPR = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

/** Quantize scale so we don't explode cache cardinality */
function bucketScale(globalScale: number, step = 0.2) {
  return Math.max(0.2, Math.round(globalScale / step) * step);
}

/** Create or reuse a sprite canvas with a given key. draw receives a HiDPI ctx */
function getOrCreateSprite(
  key: string,
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, pxW: number, pxH: number) => void,
): HTMLCanvasElement {
  const hit = _spriteCache.get(key);
  if (hit) return hit;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * DPR));
  canvas.height = Math.max(1, Math.round(h * DPR));
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(DPR, DPR);
  draw(ctx, w, h);

  _spriteCache.set(key, canvas);
  return canvas;
}

// =========================
// Label Sprites (NEW)
// =========================

function getLabelSprite(
  text: string,
  color: string,
  font = '7px sans-serif',
  maxWidth: number,
): HTMLCanvasElement {
  // Pre-measure and ellipsize once
  const tmp = document.createElement('canvas').getContext('2d')!;
  tmp.font = font;
  const ellipsis = '...';
  const ellW = tmp.measureText(ellipsis).width;

  let renderText = text;
  if (tmp.measureText(text).width > maxWidth) {
    let acc = '';
    for (let i = 0; i < text.length; i++) {
      const next = acc + text[i];
      if (tmp.measureText(next).width + ellW > maxWidth) {
        renderText = acc + ellipsis;
        break;
      }
      acc = next;
    }
  }

  const key = `label|${font}|${color}|${maxWidth}|${renderText}`;
  const hit = _textSpriteCache.get(key);
  if (hit) return hit;

  const padX = 2;
  const padY = 2;
  const textW = Math.ceil(tmp.measureText(renderText).width);
  const textH = 10; // enough for 7px baseline

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round((textW + padX * 2) * DPR));
  canvas.height = Math.max(1, Math.round((textH + padY * 2) * DPR));
  canvas.style.width = `${textW + padX * 2}px`;
  canvas.style.height = `${textH + padY * 2}px`;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(DPR, DPR);
  ctx.font = font;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(renderText, padX, (textH + padY * 2) / 2);

  _textSpriteCache.set(key, canvas);
  return canvas;
}

function drawLabelCached(ctx: CanvasRenderingContext2D, node: NodeProp) {
  const font = '7px sans-serif';
  const color = node.fgColor ?? '#e0f2fe';
  const maxWidth = node.size * 4;
  const text = String(node.label ?? '');

  const padding = 8;
  const textX = node.x;
  const textY = node.y + node.size / 2 + padding;

  const sprite = getLabelSprite(text, color, font, maxWidth);

  const pxW = sprite.width / DPR;
  const pxH = sprite.height / DPR;
  ctx.drawImage(sprite, textX - pxW / 2, textY - pxH / 2, pxW, pxH);
}

// =========================
/** External images */
// =========================

function resolveImageSrc(_node: NodeProp): string | undefined {
  // TODO: Implement project-specific mapping from node payload to URL
  return undefined;
}

const _imgCache = new Map<string, HTMLImageElement>();
function getOrCreateImage(src: string) {
  let img = _imgCache.get(src);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.loading = 'eager';
    img.src = src;
    _imgCache.set(src, img);
  }
  return img;
}

// =========================
// Shape/Icon Sprites (NEW)
// =========================

function getCircleSpriteNode(node: NodeProp, globalScale: number) {
  const r = node.size / 2;
  const w = r * 2;
  const h = r * 2;

  const scaleB = bucketScale(globalScale);
  const bg = node.color ?? node.bgColor ?? '#60a5fa';
  const fg = node.fgColor ?? '#1e3a8a';
  const key = `circle|${w}|${h}|${bg}|${fg}|${scaleB}`;

  return getOrCreateSprite(key, w, h, g => {
    const stroke = Math.max(1, 2 / Math.max(0.001, scaleB));
    g.beginPath();
    g.arc(w / 2, h / 2, r, 0, Math.PI * 2);
    g.fillStyle = bg;
    g.fill();
    g.lineWidth = stroke;
    g.strokeStyle = fg;
    g.stroke();
  });
}

function getTagSpriteNode(node: NodeProp, globalScale: number) {
  const r = node.size / 2;
  const s = r * 2.0;
  const w = s;
  const h = s;

  const scaleB = bucketScale(globalScale);
  const fg = node.fgColor ?? '#e0f2fe';
  const key = `tag|${w}|${h}|${fg}|${scaleB}`;

  return getOrCreateSprite(key, w, h, g => {
    const stroke = Math.max(1, (s * 0.18) / Math.max(0.001, scaleB));
    g.translate(w / 2, h / 2);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = fg;
    g.lineWidth = stroke;

    const half = s * 0.38;
    const xOff = s * 0.18;
    const yOff = s * 0.16;

    g.beginPath();
    g.moveTo(-xOff, -half);
    g.lineTo(-xOff, half);
    g.moveTo(+xOff, -half);
    g.lineTo(+xOff, half);
    g.moveTo(-half - s * 0.06, -yOff);
    g.lineTo(half + s * 0.06, -yOff);
    g.moveTo(-half - s * 0.06, +yOff);
    g.lineTo(half + s * 0.06, +yOff);
    g.stroke();
  });
}

function getFolderSpriteNode(node: NodeProp, globalScale: number) {
  const r = node.size / 2;
  const w = r * 2.0 * 1.4;
  const h = r * 2.0 * 1.0;

  const scaleB = bucketScale(globalScale);
  const bgBack = '#4299e1';
  const frontLight = '#63b3ed';
  const frontDark = '#3182ce';
  const edge = '#2c5282';
  const key = `folder|${w}|${h}|${bgBack}|${frontLight}|${frontDark}|${edge}|${scaleB}`;

  return getOrCreateSprite(key, w, h, g => {
    const tabH = h * 0.15;
    const tabW = w * 0.4;
    const cornerRadius = 12 * (r / 50);
    const x = 0,
      y = 0;

    g.shadowColor = 'rgba(0,0,0,0.2)';
    g.shadowBlur = 10;
    g.shadowOffsetY = 4;

    g.fillStyle = bgBack;
    g.strokeStyle = edge;
    g.lineWidth = Math.max(1, 2.5 / Math.max(0.001, scaleB));

    g.beginPath();
    g.moveTo(x, y + cornerRadius);
    g.arcTo(x, y, x + cornerRadius, y, cornerRadius);
    g.lineTo(x + tabW - cornerRadius, y);
    g.arcTo(x + tabW, y, x + tabW, y + cornerRadius, cornerRadius);
    g.lineTo(x + tabW, y + tabH);
    g.lineTo(x + w - cornerRadius, y + tabH);
    g.arcTo(x + w, y + tabH, x + w, y + tabH + cornerRadius, cornerRadius);
    g.lineTo(x + w, y + h - cornerRadius);
    g.arcTo(x + w, y + h, x + w - cornerRadius, y + h, cornerRadius);
    g.lineTo(x + cornerRadius, y + h);
    g.arcTo(x, y + h, x, y + h - cornerRadius, cornerRadius);
    g.closePath();
    g.fill();
    g.stroke();

    g.shadowColor = 'transparent';
    const frontY = y + tabH + 2;
    const grad = g.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, frontLight);
    grad.addColorStop(1, frontDark);
    g.fillStyle = grad;
    g.strokeStyle = edge;

    roundRect(g, x, frontY, w, h - frontY + y, cornerRadius);
    g.fill();
    g.stroke();

    g.beginPath();
    g.moveTo(x + cornerRadius, frontY);
    g.lineTo(x + w - cornerRadius, frontY);
    g.strokeStyle = 'rgba(255,255,255,0.4)';
    g.lineWidth = Math.max(1, 2 / Math.max(0.001, scaleB));
    g.stroke();
  });
}

function getDocumentSpriteNode(node: NodeProp, globalScale: number) {
  const r = node.size / 2;
  const w = r * 2.0 * 1.1;
  const h = r * 2.0 * 1.3;

  const scaleB = bucketScale(globalScale);
  const paper = '#f7fafc';
  const edge = '#a0aec0';
  const shadow = '#e2e8f0';
  const line = '#cbd5e0';
  const key = `document|${w}|${h}|${paper}|${edge}|${shadow}|${line}|${scaleB}`;

  return getOrCreateSprite(key, w, h, g => {
    const dogEarSize = w * 0.25;
    const x = 0,
      y = 0;

    g.shadowColor = 'rgba(0,0,0,0.15)';
    g.shadowBlur = 12;
    g.shadowOffsetY = 4;

    g.fillStyle = paper;
    g.strokeStyle = edge;
    g.lineWidth = Math.max(1, 2 / Math.max(0.001, scaleB));

    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + w - dogEarSize, y);
    g.lineTo(x + w, y + dogEarSize);
    g.lineTo(x + w, y + h);
    g.lineTo(x, y + h);
    g.closePath();
    g.fill();
    g.stroke();

    g.shadowColor = 'transparent';
    g.fillStyle = shadow;
    g.strokeStyle = edge;
    g.beginPath();
    g.moveTo(x + w - dogEarSize, y);
    g.lineTo(x + w - dogEarSize, y + dogEarSize);
    g.lineTo(x + w, y + dogEarSize);
    g.closePath();
    g.fill();
    g.stroke();

    g.strokeStyle = line;
    g.lineWidth = Math.max(1, 1.5 / Math.max(0.001, scaleB));
    const lineYstart = y + h * 0.3;
    const lineYgap = h * 0.1;
    const lineXstart = x + w * 0.15;
    const lineXend = x + w * 0.85;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.moveTo(lineXstart, lineYstart + i * lineYgap);
      g.lineTo(lineXend - (i === 4 ? w * 0.2 : 0), lineYstart + i * lineYgap);
      g.stroke();
    }
  });
}

// =========================
// Masked Image Tile (NEW)
// =========================

function getMaskedImageTile(
  src: string,
  w: number,
  h: number,
  radius: number,
): HTMLCanvasElement | undefined {
  const key = `imgtile|${src}|${w}|${h}|${radius}`;
  const hit = _imgTileCache.get(key);
  if (hit) return hit;

  const img = getOrCreateImage(src);
  if (!(img.complete && img.naturalWidth > 0)) return undefined;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * DPR));
  canvas.height = Math.max(1, Math.round(h * DPR));
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(DPR, DPR);

  roundRect(ctx, 0, 0, w, h, radius);
  ctx.clip();

  // cover-fit while preserving aspect ratio
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const arImg = iw / ih;
  const arBox = w / h;
  let dw = w,
    dh = h;
  if (arImg > arBox) {
    dw = dh * arImg;
  } else {
    dh = dw / arImg;
  }
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);

  _imgTileCache.set(key, canvas);
  return canvas;
}

// =========================
// Cached Renderers (REPLACEMENTS)
// =========================

const circleRenderer: NodeRenderer = (ctx, node, globalScale) => {
  const r = node.size / 2;
  const sprite = getCircleSpriteNode(node, globalScale);
  const w = r * 2,
    h = r * 2;
  ctx.drawImage(sprite, node.x - w / 2, node.y - h / 2, w, h);
  drawLabelCached(ctx, node);
};

const tagRenderer: NodeRenderer = (ctx, node, globalScale) => {
  const r = node.size / 2;
  const sprite = getTagSpriteNode(node, globalScale);
  const w = r * 2,
    h = r * 2;
  ctx.drawImage(sprite, node.x - w / 2, node.y - h / 2, w, h);
  drawLabelCached(ctx, node);
};

const folderRenderer: NodeRenderer = (ctx, node, globalScale) => {
  const r = getNodeRadius(node);
  const w = r * 2.0 * 1.4;
  const h = r * 2.0 * 1.0;
  const sprite = getFolderSpriteNode(node, globalScale);
  ctx.drawImage(sprite, node.x - w / 2, node.y - h / 2, w, h);
  drawLabelCached(ctx, node);
};

const documentRenderer: NodeRenderer = (ctx, node, globalScale) => {
  const r = getNodeRadius(node);
  const w = r * 2.0 * 1.1;
  const h = r * 2.0 * 1.3;
  const sprite = getDocumentSpriteNode(node, globalScale);
  ctx.drawImage(sprite, node.x - w / 2, node.y - h / 2, w, h);
  drawLabelCached(ctx, node);
};

const imageRenderer: NodeRenderer = (ctx, node, globalScale) => {
  const r = getNodeRadius(node);
  const w = r * 2.0 * 1.2;
  const h = r * 2.0 * 1.0;
  const radius = 8;

  // backplate sprite
  const bg = node.bgColor ?? '#0ea5e9';
  const fg = node.fgColor ?? '#0c4a6e';
  const scaleB = bucketScale(globalScale);
  const backKey = `imgback|${w}|${h}|${radius}|${bg}|${fg}|${scaleB}`;
  const backplate = getOrCreateSprite(backKey, w, h, g => {
    g.globalAlpha = 0.95;
    roundRect(g, 0, 0, w, h, radius);
    g.fillStyle = bg;
    g.fill();
    g.lineWidth = Math.max(1, 2 / Math.max(0.001, scaleB));
    g.strokeStyle = fg;
    g.stroke();
  });

  ctx.drawImage(backplate, node.x - w / 2, node.y - h / 2, w, h);

  const src = resolveImageSrc(node);
  let tile: HTMLCanvasElement | undefined;
  if (src) tile = getMaskedImageTile(src, w - 4, h - 4, radius * 0.8);

  if (tile) {
    ctx.drawImage(tile, node.x - (w - 4) / 2, node.y - (h - 4) / 2, w - 4, h - 4);
  } else {
    // placeholder sprite
    const phKey = `imgph|${w}|${h}|${radius}|${scaleB}`;
    const placeholder = getOrCreateSprite(phKey, w, h, g => {
      roundRect(g, 4, 4, w - 8, h - 8, 6);
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineWidth = Math.max(1, 1.5 / Math.max(0.001, scaleB));
      g.stroke();

      g.beginPath();
      g.arc(w * 0.25, h * 0.32, Math.min(w, h) * 0.07, 0, Math.PI * 2);
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.fill();

      g.beginPath();
      const baseY = h * 0.72;
      g.moveTo(w * 0.12, baseY);
      g.lineTo(w * 0.4, h * 0.45);
      g.lineTo(w * 0.6, baseY);
      g.lineTo(w * 0.48, baseY);
      g.lineTo(w * 0.7, h * 0.55);
      g.lineTo(w * 0.88, baseY);
      g.closePath();
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.fill();
    });
    ctx.drawImage(placeholder, node.x - w / 2, node.y - h / 2, w, h);
  }

  // drawLabelCached(ctx, node);
};

// =========================
// Export
// =========================

type NodeRendererType = { [key in GraphNodeType]: NodeRenderer };

export default (key: GraphNodeType): NodeRenderer => {
  const map: Partial<NodeRendererType> = {
    default: circleRenderer as NodeRenderer,
    tag: tagRenderer as NodeRenderer,
    folder: folderRenderer as NodeRenderer,
    image: imageRenderer as NodeRenderer,
    document: documentRenderer as NodeRenderer,
  };
  return (map as NodeRendererType)[key];
};

// =========================
// Maintenance helpers (optional)
// =========================

export function clearNodeSpriteCaches() {
  _spriteCache.clear();
  _textSpriteCache.clear();
  _imgTileCache.clear();
}
