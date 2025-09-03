// =========================
// Types

import { GraphNodeType } from '@tgim/types/graph';

// =========================
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

/** Draws the label below a node */
const drawLabel = (ctx: CanvasRenderingContext2D, node: NodeProp) => {
  // NOTE: keep font tiny; the host can scale canvas for HiDPI
  ctx.font = `7px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = node.fgColor ?? '#e0f2fe';
  const padding = 8;
  const textX = node.x;
  const textY = node.y + node.size / 2 + padding;
  const maxWidth = node.size * 4;

  const text = String(node.label ?? '');
  const ellipsis = '...';
  const ellipsisWidth = ctx.measureText(ellipsis).width;

  // If fits, draw directly
  if (ctx.measureText(text).width <= maxWidth) {
    ctx.fillText(text, textX, textY);
    return;
  }

  // Else, cut off and add "..."
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const temp = result + text[i];
    const tempWidth = ctx.measureText(temp).width;
    if (tempWidth + ellipsisWidth > maxWidth) {
      ctx.fillText(result + ellipsis, textX, textY);
      return;
    }
    result = temp;
  }

  ctx.fillText(result, textX, textY);
  // color bg
};

// =========================
// Base Renderers
// =========================

/** --- Default circle node --- */
const circleRenderer: NodeRenderer = (ctx, node, globalScale) => {
  const r = getNodeRadius(node);
  withCtx(ctx, () => {
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
    ctx.fillStyle = node.color ?? node.bgColor ?? '#60a5fa'; // blue-400
    ctx.fill();

    ctx.lineWidth = constPx(2, globalScale);
    ctx.strokeStyle = node.fgColor ?? '#1e3a8a'; // blue-900
    ctx.stroke();

    drawLabel(ctx, node);
  });
};

/** --- Hashtag/tag node (#) --- */
const tagRenderer: NodeRenderer = (ctx, node, globalScale) => {
  const r = node.size / 2;
  const s = r * 2.0;
  const stroke = Math.max(1, (s * 0.18) / Math.max(0.001, globalScale));

  withCtx(ctx, () => {
    ctx.translate(node.x, node.y);

    // hash strokes
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = node.fgColor ?? '#e0f2fe';
    ctx.lineWidth = stroke;

    const half = s * 0.38;
    const xOff = s * 0.18;
    const yOff = s * 0.16;

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

    // label uses absolute coordinates → draw later outside translate
  });

  drawLabel(ctx, node);
};

// =========================
// New: Folder Icon Renderer
// =========================

/** --- Folder icon node --- */
const folderRenderer: NodeRenderer = (ctx, node, globalScale) => {
  const r = getNodeRadius(node);
  const w = r * 2.0 * 1.4; // Slightly wider
  const h = r * 2.0 * 1.0; // Slightly taller
  const tabH = h * 0.15;
  const tabW = w * 0.4;
  const cornerRadius = 12 * (r / 50);

  const x = node.x - w / 2;
  const y = node.y - h / 2;

  // A more modern blue color palette
  const backColor = '#4299e1'; // blue-500
  const frontColorLight = '#63b3ed'; // blue-400
  const frontColorDark = '#3182ce'; // blue-600
  const edgeColor = '#2c5282'; // blue-800
  const paperColor = '#edf2f7'; // gray-200

  withCtx(ctx, () => {
    // 1. Draw Drop Shadow for the whole folder
    ctx.shadowColor = 'rgba(0,0,0,0.2)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;

    // 2. Draw the back part of the folder
    ctx.fillStyle = backColor;
    ctx.strokeStyle = edgeColor;
    ctx.lineWidth = constPx(2.5, globalScale);

    ctx.beginPath();
    ctx.moveTo(x, y + cornerRadius);
    ctx.arcTo(x, y, x + cornerRadius, y, cornerRadius);
    ctx.lineTo(x + tabW - cornerRadius, y);
    ctx.arcTo(x + tabW, y, x + tabW, y + cornerRadius, cornerRadius);
    ctx.lineTo(x + tabW, y + tabH);
    ctx.lineTo(x + w - cornerRadius, y + tabH);
    ctx.arcTo(x + w, y + tabH, x + w, y + tabH + cornerRadius, cornerRadius);
    ctx.lineTo(x + w, y + h - cornerRadius);
    ctx.arcTo(x + w, y + h, x + w - cornerRadius, y + h, cornerRadius);
    ctx.lineTo(x + cornerRadius, y + h);
    ctx.arcTo(x, y + h, x, y + h - cornerRadius, cornerRadius);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // // 3. Draw the piece of paper inside
    // withCtx(ctx, () => {
    //   ctx.shadowColor = 'rgba(0,0,0,0.1)';
    //   ctx.shadowBlur = 5;
    //   ctx.shadowOffsetY = 0;
    //   ctx.shadowOffsetX = -2;

    //   const paperX = x + 8;
    //   const paperY = y + tabH * 0.8;
    //   const paperW = w - 16;
    //   const paperH = h - tabH * 2;
    //   roundRect(ctx, paperX, paperY, paperW, paperH, cornerRadius * 0.5);
    //   ctx.fillStyle = paperColor;
    //   ctx.fill();
    // });

    // Remove shadow for the front part for a crisp look
    ctx.shadowColor = 'transparent';

    // 4. Draw the front part of the folder with a gradient
    const frontGradient = ctx.createLinearGradient(x, y, x, y + h);
    frontGradient.addColorStop(0, frontColorLight);
    frontGradient.addColorStop(1, frontColorDark);

    ctx.fillStyle = frontGradient;
    ctx.strokeStyle = edgeColor;

    const frontY = y + tabH + 2;
    roundRect(ctx, x, frontY, w, h - frontY + y, cornerRadius);
    ctx.fill();
    ctx.stroke();

    // 5. Add a subtle highlight on the front top edge for 3D effect
    withCtx(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(x + cornerRadius, frontY);
      ctx.lineTo(x + w - cornerRadius, frontY);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = constPx(2, globalScale);
      ctx.stroke();
    });
  });

  // 6. Draw the label last, on top of everything
  drawLabel(ctx, node);
};
function resolveImageSrc(_node: NodeProp): string | undefined {
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

const documentRenderer: NodeRenderer = (ctx, node, globalScale) => {
  const r = getNodeRadius(node);
  const w = r * 2.0 * 1.1; // Document width
  const h = r * 2.0 * 1.3; // Document height
  const cornerRadius = 8 * (r / 50);
  const dogEarSize = w * 0.25;

  const x = node.x - w / 2;
  const y = node.y - h / 2;

  const paperColor = '#f7fafc'; // gray-100
  const edgeColor = '#a0aec0'; // gray-500
  const shadowColor = '#e2e8f0'; // gray-300
  const lineColor = '#cbd5e0'; // gray-400

  withCtx(ctx, () => {
    // 1. Draw Drop Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.15)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;

    // 2. Draw Main Paper Body
    ctx.fillStyle = paperColor;
    ctx.strokeStyle = edgeColor;
    ctx.lineWidth = constPx(2, globalScale);

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w - dogEarSize, y); // Top edge
    ctx.lineTo(x + w, y + dogEarSize); // Folded corner edge
    ctx.lineTo(x + w, y + h); // Right edge
    ctx.lineTo(x, y + h); // Bottom edge
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 3. Draw Folded Corner (Dog Ear)
    ctx.shadowColor = 'transparent'; // Remove shadow for crisp lines
    ctx.fillStyle = shadowColor;
    ctx.strokeStyle = edgeColor;
    ctx.beginPath();
    ctx.moveTo(x + w - dogEarSize, y);
    ctx.lineTo(x + w - dogEarSize, y + dogEarSize);
    ctx.lineTo(x + w, y + dogEarSize);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 4. Draw lines to represent text
    withCtx(ctx, () => {
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = constPx(1.5, globalScale);
      const lineYstart = y + h * 0.3;
      const lineYgap = h * 0.1;
      const lineXstart = x + w * 0.15;
      const lineXend = x + w * 0.85;

      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(lineXstart, lineYstart + i * lineYgap);
        ctx.lineTo(lineXend - (i === 4 ? w * 0.2 : 0), lineYstart + i * lineYgap); // Make last line shorter
        ctx.stroke();
      }
    });
  });

  drawLabel(ctx, node);
};

const imageRenderer: NodeRenderer = (ctx, node, globalScale) => {
  const r = getNodeRadius(node);
  const w = r * 2.0 * 1.2; // tile width
  const h = r * 2.0 * 1.0; // tile height
  const radius = 8;

  const x = node.x - w / 2;
  const y = node.y - h / 2;

  // backplate
  withCtx(ctx, () => {
    ctx.globalAlpha = 0.95;
    roundRect(ctx, x, y, w, h, radius);
    ctx.fillStyle = node.bgColor ?? '#0ea5e9'; // sky-500
    ctx.fill();

    ctx.lineWidth = constPx(2, globalScale);
    ctx.strokeStyle = node.fgColor ?? '#0c4a6e';
    ctx.stroke();
  });

  // try to draw the image if available
  const src = resolveImageSrc(node);
  if (src) {
    const img = getOrCreateImage(src);
    if (img.complete && img.naturalWidth > 0) {
      // clip to rounded rect and draw the image fitted
      withCtx(ctx, () => {
        roundRect(ctx, x + 2, y + 2, w - 4, h - 4, radius * 0.8);
        ctx.clip();

        // cover-fit while preserving aspect ratio
        const iw = img.naturalWidth;
        const ih = img.naturalHeight;
        const arImg = iw / ih;
        const arBox = (w - 4) / (h - 4);

        let dw = w - 4;
        let dh = h - 4;
        if (arImg > arBox) {
          // image is wider → match height
          dw = dh * arImg;
        } else {
          // image is taller → match width
          dh = dw / arImg;
        }
        const dx = node.x - dw / 2;
        const dy = node.y - dh / 2;
        ctx.drawImage(img, dx, dy, dw, dh);
      });
    } else {
      // not ready yet → draw placeholder icon
      drawPicturePlaceholder(ctx, x, y, w, h, globalScale);
    }
  } else {
    // no src provided → draw placeholder icon
    drawPicturePlaceholder(ctx, x, y, w, h, globalScale);
  }

  drawLabel(ctx, node);
};

/** Simple "picture" placeholder (mountains + sun) */
function drawPicturePlaceholder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  globalScale: number,
) {
  withCtx(ctx, () => {
    // inner frame
    roundRect(ctx, x + 4, y + 4, w - 8, h - 8, 6);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = constPx(1.5, globalScale);
    ctx.stroke();

    // sun
    ctx.beginPath();
    ctx.arc(x + w * 0.25, y + h * 0.32, Math.min(w, h) * 0.07, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fill();

    // mountains
    ctx.beginPath();
    const baseY = y + h * 0.72;
    ctx.moveTo(x + w * 0.12, baseY);
    ctx.lineTo(x + w * 0.4, y + h * 0.45);
    ctx.lineTo(x + w * 0.6, baseY);
    ctx.lineTo(x + w * 0.48, baseY);
    ctx.lineTo(x + w * 0.7, y + h * 0.55);
    ctx.lineTo(x + w * 0.88, baseY);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fill();
  });
}

type NodeRendererType = { [key: GraphNodeType]: NodeRenderer };
export default (key: GraphNodeType) => {
  return {
    default: circleRenderer,
    tag: tagRenderer,
    folder: folderRenderer,
    image: imageRenderer,
    document: documentRenderer,
  }[key];
};
