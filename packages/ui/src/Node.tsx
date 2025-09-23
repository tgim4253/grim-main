// =========================
// Types
// =========================

import { GraphNodeType } from '@tgim/types/graph';

type GraphPalette = {
  label: string;
  circleFill: string;
  circleStroke: string;
  tagStroke: string;
  folderBack: string;
  folderFrontLight: string;
  folderFrontDark: string;
  folderEdge: string;
  documentPaper: string;
  documentEdge: string;
  documentShadow: string;
  documentLine: string;
  imageBg: string;
  imageBorder: string;
  placeholderStroke: string;
  placeholderAccent: string;
  placeholderFill: string;
  link: string;
};

const FALLBACK_PALETTE: GraphPalette = {
  label: '#f8fafc',
  circleFill: '#4f46e5',
  circleStroke: '#312e81',
  tagStroke: '#312e81',
  folderBack: '#4338ca',
  folderFrontLight: '#6366f1',
  folderFrontDark: '#4338ca',
  folderEdge: '#312e81',
  documentPaper: '#e0e7ff',
  documentEdge: '#4338ca',
  documentShadow: 'rgba(67, 56, 202, 0.35)',
  documentLine: '#c7d2fe',
  imageBg: '#4f46e5',
  imageBorder: '#312e81',
  placeholderStroke: 'rgba(248, 250, 252, 0.95)',
  placeholderAccent: 'rgba(248, 250, 252, 0.88)',
  placeholderFill: 'rgba(248, 250, 252, 0.8)',
  link: '#4338ca',
};

let graphPalette: GraphPalette = FALLBACK_PALETTE;

const COLOR_TOKENS: Array<[keyof GraphPalette, string]> = [
  ['label', '--ds-graph-node-label'],
  ['circleFill', '--ds-graph-node-default-bg'],
  ['circleStroke', '--ds-graph-node-default-border'],
  ['tagStroke', '--ds-graph-node-tag-stroke'],
  ['folderBack', '--ds-graph-node-folder-back'],
  ['folderFrontLight', '--ds-graph-node-folder-front-light'],
  ['folderFrontDark', '--ds-graph-node-folder-front-dark'],
  ['folderEdge', '--ds-graph-node-folder-edge'],
  ['documentPaper', '--ds-graph-node-document-paper'],
  ['documentEdge', '--ds-graph-node-document-edge'],
  ['documentShadow', '--ds-graph-node-document-shadow'],
  ['documentLine', '--ds-graph-node-document-line'],
  ['imageBg', '--ds-graph-node-image-bg'],
  ['imageBorder', '--ds-graph-node-image-border'],
  ['placeholderStroke', '--ds-graph-node-placeholder-stroke'],
  ['placeholderAccent', '--ds-graph-node-placeholder-accent'],
  ['placeholderFill', '--ds-graph-node-placeholder-fill'],
  ['link', '--ds-graph-link'],
];

const readToken = (styles: CSSStyleDeclaration, token: string, fallback: string) => {
  const value = styles.getPropertyValue(token).trim();
  return value || fallback;
};

const updateGraphPalette = () => {
  if (typeof window === 'undefined') {
    graphPalette = FALLBACK_PALETTE;
    return;
  }

  const styles = getComputedStyle(document.documentElement);
  const next: GraphPalette = { ...FALLBACK_PALETTE };
  COLOR_TOKENS.forEach(([key, token]) => {
    next[key] = readToken(styles, token, FALLBACK_PALETTE[key]);
  });
  graphPalette = next;
};

const ensurePaletteObservers = () => {
  if (typeof window === 'undefined') {
    return;
  }

  updateGraphPalette();

  if (typeof MutationObserver === 'undefined') {
    return;
  }

  const observer = new MutationObserver(updateGraphPalette);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme'],
  });

  const attachBodyObserver = () => {
    if (!document.body) return;
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      updateGraphPalette();
      attachBodyObserver();
    });
  } else {
    attachBodyObserver();
  }

  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  if (media) {
    if ('addEventListener' in media) {
      media.addEventListener('change', updateGraphPalette);
    } else if ('addListener' in media) {
      media.addListener(updateGraphPalette);
    }
  }
};

ensurePaletteObservers();

const getGraphPaletteInternal = () => graphPalette;

const colorParsingCtx =
  typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;

const normalizeColor = (value: string) => {
  if (!colorParsingCtx) return value;
  try {
    colorParsingCtx.fillStyle = '#000000';
    colorParsingCtx.fillStyle = value;
    return colorParsingCtx.fillStyle;
  } catch (error) {
    return value;
  }
};

const hexToRgba = (hex: string, alpha: number) => {
  let normalized = hex.replace('#', '');
  if (normalized.length === 3) {
    normalized = normalized
      .split('')
      .map(ch => ch + ch)
      .join('');
  }
  if (normalized.length !== 6) return hex;

  const r = parseInt(normalized.substring(0, 2), 16);
  const g = parseInt(normalized.substring(2, 4), 16);
  const b = parseInt(normalized.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const withAlpha = (color: string, alpha: number) => {
  const normalized = normalizeColor(color);
  if (normalized.startsWith('#')) {
    return hexToRgba(normalized, alpha);
  }
  const match = normalized
    .replace(/\s+/g, '')
    .match(/^rgba?\((\d+),(\d+),(\d+)(?:,(\d*\.?\d+))?\)$/i);
  if (match) {
    const [, r, g, b] = match;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
};

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
  const palette = getGraphPaletteInternal();
  const color = node.fgColor ?? palette.label;
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

function resolveImageSrc(node: NodeProp): string | undefined {
  if (typeof node.url === 'string' && node.url.length > 0) {
    return node.url;
  }
  if (typeof node.imageUrl === 'string' && node.imageUrl.length > 0) {
    return node.imageUrl;
  }
  if (typeof node.src === 'string' && node.src.length > 0) {
    return node.src;
  }
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
  const palette = getGraphPaletteInternal();
  const bg = node.color ?? node.bgColor ?? palette.circleFill;
  const fg = node.fgColor ?? palette.circleStroke;
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
  const palette = getGraphPaletteInternal();
  const fg = node.fgColor ?? palette.tagStroke;
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
  const palette = getGraphPaletteInternal();
  const bgBack = palette.folderBack;
  const frontLight = palette.folderFrontLight;
  const frontDark = palette.folderFrontDark;
  const edge = palette.folderEdge;
  const key = `folder|${w}|${h}|${bgBack}|${frontLight}|${frontDark}|${edge}|${scaleB}`;

  return getOrCreateSprite(key, w, h, g => {
    const tabH = h * 0.15;
    const tabW = w * 0.4;
    const cornerRadius = 12 * (r / 50);
    const x = 0,
      y = 0;

    g.shadowColor = withAlpha(edge, 0.28);
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
    g.strokeStyle = withAlpha(palette.label, 0.35);
    g.lineWidth = Math.max(1, 2 / Math.max(0.001, scaleB));
    g.stroke();
  });
}

function getDocumentSpriteNode(node: NodeProp, globalScale: number) {
  const r = node.size / 2;
  const w = r * 2.0 * 1.1;
  const h = r * 2.0 * 1.3;

  const scaleB = bucketScale(globalScale);
  const palette = getGraphPaletteInternal();
  const paper = palette.documentPaper;
  const edge = palette.documentEdge;
  const shadow = palette.documentShadow;
  const line = palette.documentLine;
  const key = `document|${w}|${h}|${paper}|${edge}|${shadow}|${line}|${scaleB}`;

  return getOrCreateSprite(key, w, h, g => {
    const dogEarSize = w * 0.25;
    const x = 0,
      y = 0;

    g.shadowColor = withAlpha(edge, 0.25);
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
  const baseSize = r * 2.0;
  const side = baseSize * 1.2;

  const palette = getGraphPaletteInternal();
  const bg = node.bgColor ?? withAlpha(palette.imageBg, 0.9);
  const fg = node.fgColor ?? palette.imageBorder;
  const scaleB = bucketScale(globalScale);
  const radius = Math.max(2, baseSize * 0.18);
  const padding = 0;
  const contentSize = Math.max(1, side - padding * 2);
  const clipRadius = Math.max(2, radius - padding * 0.5);

  const backKey = `imgback|${side}|${radius}|${bg}|${fg}|${scaleB}`;
  const backplate = getOrCreateSprite(backKey, side, side, g => {
    roundRect(g, 0, 0, side, side, radius);
    g.fillStyle = bg;
    g.fill();
    g.strokeStyle = fg;
    g.stroke();
  });

  ctx.drawImage(backplate, node.x - side / 2, node.y - side / 2, side, side);

  const src = resolveImageSrc(node);
  let tile: HTMLCanvasElement | undefined;
  if (src) tile = getMaskedImageTile(src, contentSize, contentSize, clipRadius);

  if (tile) {
    ctx.drawImage(
      tile,
      node.x - contentSize / 2,
      node.y - contentSize / 2,
      contentSize,
      contentSize,
    );
  } else {
    const phKey = `imgph|${side}|${radius}|${padding}|${clipRadius}|${scaleB}`;
    const placeholder = getOrCreateSprite(phKey, side, side, g => {
      roundRect(g, padding, padding, contentSize, contentSize, clipRadius);
      g.strokeStyle = palette.placeholderStroke;
      g.lineWidth = Math.max(1, 1.5 / Math.max(0.001, scaleB));
      g.stroke();

      g.beginPath();
      g.arc(
        padding + contentSize * 0.28,
        padding + contentSize * 0.32,
        contentSize * 0.12,
        0,
        Math.PI * 2,
      );
      g.fillStyle = palette.placeholderAccent;
      g.fill();

      g.beginPath();
      const baseY = padding + contentSize * 0.78;
      g.moveTo(padding + contentSize * 0.08, baseY);
      g.lineTo(padding + contentSize * 0.35, padding + contentSize * 0.48);
      g.lineTo(padding + contentSize * 0.55, baseY);
      g.lineTo(padding + contentSize * 0.48, baseY);
      g.lineTo(padding + contentSize * 0.72, padding + contentSize * 0.58);
      g.lineTo(padding + contentSize * 0.92, baseY);
      g.closePath();
      g.fillStyle = palette.placeholderFill;
      g.fill();
    });
    ctx.drawImage(placeholder, node.x - side / 2, node.y - side / 2, side, side);
  }

  // drawLabelCached(ctx, node);
};

// =========================
// Export
// =========================

type NodeRendererType = { [key in GraphNodeType]: NodeRenderer };

export const getGraphPalette = () => graphPalette;

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
