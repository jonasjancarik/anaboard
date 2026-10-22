import { decode, encode } from 'npm:fast-png@8.0.0';

// Emoji render at fontSize = 0.62 × the tile's visual box (TileVisual.tsx), and the glyph
// itself draws slightly larger: measured at about 69% of the box on a Pixel 5. AI pictures
// are stretched to fill the whole box, so their drawing is re-centred at the same share.
export const TILE_CONTENT_FRACTION = 0.68;

const ALPHA_THRESHOLD = 8;

type Rgba = { width: number; height: number; data: Uint8Array };

const toRgba8 = (png: ReturnType<typeof decode>): Rgba | null => {
  if (png.depth !== 8 || png.palette || png.channels !== 4) {
    return null;
  }

  return { width: png.width, height: png.height, data: png.data as Uint8Array };
};

const findContentBox = ({ width, height, data }: Rgba) => {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
};

// Area-weighted resampling on premultiplied alpha, so it works for shrinking and enlarging
// without dark fringes around transparent edges.
const resampleInto = (
  source: Rgba,
  box: { x: number; y: number; width: number; height: number },
  target: Rgba,
  offsetX: number,
  offsetY: number,
  outWidth: number,
  outHeight: number,
) => {
  const scaleX = box.width / outWidth;
  const scaleY = box.height / outHeight;

  for (let oy = 0; oy < outHeight; oy += 1) {
    const sy0 = box.y + oy * scaleY;
    const sy1 = sy0 + scaleY;

    for (let ox = 0; ox < outWidth; ox += 1) {
      const sx0 = box.x + ox * scaleX;
      const sx1 = sx0 + scaleX;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let weight = 0;

      for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy += 1) {
        const wy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
        if (wy <= 0 || sy < 0 || sy >= source.height) continue;

        for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx += 1) {
          const wx = Math.min(sx + 1, sx1) - Math.max(sx, sx0);
          if (wx <= 0 || sx < 0 || sx >= source.width) continue;

          const w = wx * wy;
          const i = (sy * source.width + sx) * 4;
          const alpha = source.data[i + 3];
          r += source.data[i] * alpha * w;
          g += source.data[i + 1] * alpha * w;
          b += source.data[i + 2] * alpha * w;
          a += alpha * w;
          weight += w;
        }
      }

      if (weight === 0 || a === 0) continue;

      const o = ((offsetY + oy) * target.width + (offsetX + ox)) * 4;
      target.data[o] = Math.round(r / a);
      target.data[o + 1] = Math.round(g / a);
      target.data[o + 2] = Math.round(b / a);
      target.data[o + 3] = Math.round(a / weight);
    }
  }
};

/**
 * Trims the transparent border of a generated tile picture and re-centres the drawing on a
 * same-size square canvas so its longer side is TILE_CONTENT_FRACTION of the canvas.
 * Returns the original bytes when the image has no usable transparency or an unexpected format.
 */
export const normalizeTileImage = (
  pngBytes: Uint8Array,
  contentFraction = TILE_CONTENT_FRACTION,
): { bytes: Uint8Array; normalized: boolean } => {
  const source = toRgba8(decode(pngBytes));
  if (!source || source.width !== source.height) {
    return { bytes: pngBytes, normalized: false };
  }

  const box = findContentBox(source);
  const size = source.width;
  // Nothing drawn, or the background is opaque: leave the picture alone.
  if (!box || (box.width >= size - 2 && box.height >= size - 2)) {
    return { bytes: pngBytes, normalized: false };
  }

  const scale = (size * contentFraction) / Math.max(box.width, box.height);
  const outWidth = Math.max(1, Math.round(box.width * scale));
  const outHeight = Math.max(1, Math.round(box.height * scale));
  const target: Rgba = { width: size, height: size, data: new Uint8Array(size * size * 4) };

  resampleInto(
    source,
    box,
    target,
    Math.floor((size - outWidth) / 2),
    Math.floor((size - outHeight) / 2),
    outWidth,
    outHeight,
  );

  return {
    bytes: encode({ width: size, height: size, data: target.data, channels: 4, depth: 8 }),
    normalized: true,
  };
};
