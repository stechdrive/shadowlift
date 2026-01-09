import { ImageSettings } from '../types';

/**
 * Loads a File object into an HTMLImageElement
 */
export const loadImage = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
};

/**
 * Creates a resized version of an image for performance
 */
export const createResizedImage = (original: HTMLImageElement, maxWidth: number): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        if (original.naturalWidth <= maxWidth) {
            resolve(original);
            return;
        }

        const canvas = document.createElement('canvas');
        const ratio = maxWidth / original.naturalWidth;
        canvas.width = maxWidth;
        canvas.height = original.naturalHeight * ratio;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            reject(new Error("Could not get canvas context"));
            return;
        }

        // Use higher quality for resize to preserve details for shadow recovery
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(original, 0, 0, canvas.width, canvas.height);

        canvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error("Resize failed"));
                return;
            }
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                resolve(img);
            };
            img.onerror = (e) => {
                URL.revokeObjectURL(url);
                reject(e);
            };
            img.src = url;
        }, 'image/jpeg', 0.98);
    });
};

/**
 * Helper to get pixel data from a canvas
 */
const getImageData = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    return ctx.getImageData(0, 0, width, height).data;
};

/**
 * Accurate sRGB <-> Linear conversions (display-referred JPEG/PNG friendly).
 * NOTE: Canvas pixel data is sRGB-encoded; we convert to linear for luminance math.
 */
const clamp01 = (x: number): number => Math.min(1.0, Math.max(0.0, x));

const srgbToLinear = (c: number): number => {
    // c is in [0,1]
    if (c <= 0.04045) return c / 12.92;
    return Math.pow((c + 0.055) / 1.055, 2.4);
};

const linearToSrgb = (c: number): number => {
    // c is linear (can be >1 before clipping)
    if (c <= 0.0031308) return 12.92 * c;
    return 1.055 * Math.pow(c, 1.0 / 2.4) - 0.055;
};

const smoothstep = (edge0: number, edge1: number, x: number): number => {
    const t = clamp01((x - edge0) / (edge1 - edge0));
    return t * t * (3.0 - 2.0 * t);
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const boxFilter = (
    src: Float32Array,
    width: number,
    height: number,
    radius: number
): Float32Array => {
    const size = width * height;
    const tmp = new Float32Array(size);
    const dst = new Float32Array(size);
    const windowSize = radius * 2 + 1;
    const area = windowSize * windowSize;

    // Horizontal pass (edge-replicated)
    for (let y = 0; y < height; y++) {
        const row = y * width;
        let sum = 0;
        for (let x = -radius; x <= radius; x++) {
            const xi = Math.min(width - 1, Math.max(0, x));
            sum += src[row + xi];
        }
        for (let x = 0; x < width; x++) {
            tmp[row + x] = sum;
            const addX = Math.min(width - 1, x + radius + 1);
            const subX = Math.max(0, x - radius);
            sum += src[row + addX] - src[row + subX];
        }
    }

    // Vertical pass (edge-replicated)
    for (let x = 0; x < width; x++) {
        let sum = 0;
        for (let y = -radius; y <= radius; y++) {
            const yi = Math.min(height - 1, Math.max(0, y));
            sum += tmp[yi * width + x];
        }
        for (let y = 0; y < height; y++) {
            dst[y * width + x] = sum / area;
            const addY = Math.min(height - 1, y + radius + 1);
            const subY = Math.max(0, y - radius);
            sum += tmp[addY * width + x] - tmp[subY * width + x];
        }
    }

    return dst;
};

// Guided filter (self-guided) for edge-preserving smoothing of luminance.
const guidedFilter = (
    input: Float32Array,
    width: number,
    height: number,
    radius: number,
    eps: number
): Float32Array => {
    const size = input.length;
    const meanI = boxFilter(input, width, height, radius);

    const inputSquared = new Float32Array(size);
    for (let i = 0; i < size; i++) {
        inputSquared[i] = input[i] * input[i];
    }
    const meanII = boxFilter(inputSquared, width, height, radius);

    const a = new Float32Array(size);
    const b = new Float32Array(size);
    for (let i = 0; i < size; i++) {
        const varI = meanII[i] - meanI[i] * meanI[i];
        const ai = varI / (varI + eps);
        a[i] = ai;
        b[i] = meanI[i] - ai * meanI[i];
    }

    const meanA = boxFilter(a, width, height, radius);
    const meanB = boxFilter(b, width, height, radius);

    const output = new Float32Array(size);
    for (let i = 0; i < size; i++) {
        output[i] = meanA[i] * input[i] + meanB[i];
    }

    return output;
};

const createToneMapper = (settings: ImageSettings) => {
    const exposureMult = Math.pow(2, settings.exposure);
    const S = settings.shadows / 100;
    const H = settings.highlights / 100;
    const W = settings.whites / 100;
    const B = settings.blacks / 100;
    const C = settings.contrast / 100;

    return (yLin: number): number => {
        let y = Math.max(0, yLin) * exposureMult;
        let yDisp = clamp01(linearToSrgb(y));

        // Adobe Basic panel target ranges (display-referred):
        // Shadows: 10-30%, Highlights: 70-90%, Whites: 90-100%, Blacks: 0-10%, Contrast: 30-70%.
        const wShadows = 1.0 - smoothstep(0.10, 0.30, yDisp);
        const wHighlights = smoothstep(0.70, 0.90, yDisp);
        const wWhites = smoothstep(0.90, 1.00, yDisp);
        const wBlacks = 1.0 - smoothstep(0.00, 0.10, yDisp);
        const wMid = smoothstep(0.20, 0.40, yDisp) * (1.0 - smoothstep(0.60, 0.80, yDisp));

        if (C !== 0) {
            const contrastFactor = Math.max(0.1, 1 + C * 0.8);
            const yContrast = (yDisp - 0.5) * contrastFactor + 0.5;
            yDisp = lerp(yDisp, yContrast, Math.abs(C) * wMid);
        }

        if (S !== 0) {
            const shadowPower = S >= 0 ? 1 - S * 0.6 : 1 - S * 1.0;
            const yShadow = Math.pow(yDisp, shadowPower);
            yDisp = lerp(yDisp, yShadow, Math.abs(S) * wShadows);
        }

        if (H !== 0) {
            const highlightPower = H >= 0 ? 1 + H * 1.3 : 1 / (1 + (-H) * 1.3);
            const yHighlight = 1 - Math.pow(1 - yDisp, highlightPower);
            yDisp = lerp(yDisp, yHighlight, Math.abs(H) * wHighlights);
        }

        if (W !== 0) {
            const delta = W > 0 ? (1 - yDisp) : yDisp;
            yDisp += W * wWhites * delta;
        }

        if (B !== 0) {
            const delta = B > 0 ? (0.10 - yDisp) : yDisp;
            yDisp += B * wBlacks * delta;
        }

        yDisp = clamp01(yDisp);
        return srgbToLinear(yDisp);
    };
};

/**
 * Main processing function
 * Implements Base/Detail separation with improved Shadow Recovery logic
 * based on user feedback (Deep blacks lift & Stronger Toe lift).
 */
export const processImage = async (
  img: HTMLImageElement,
  settings: ImageSettings,
  outputType: string
): Promise<Blob> => {
  const width = img.naturalWidth;
  const height = img.naturalHeight;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  if (!ctx) throw new Error('Could not get canvas context');

  // 1. Draw Original Image
  ctx.drawImage(img, 0, 0);
  const originalData = getImageData(ctx, width, height);

  // 2. Create edge-preserving "Base" luminance using a guided filter.
  const size = width * height;
  const luma = new Float32Array(size);
  for (let i = 0, p = 0; i < originalData.length; i += 4, p++) {
    const r = srgbToLinear(originalData[i] / 255);
    const g = srgbToLinear(originalData[i + 1] / 255);
    const b = srgbToLinear(originalData[i + 2] / 255);
    luma[p] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const radius = Math.max(4, Math.round(Math.min(width, height) * 0.015));
  const eps = 1e-3;
  const baseLuma = guidedFilter(luma, width, height, radius, eps);

  // Create output buffer
  const outputImageData = ctx.createImageData(width, height);
  const outputData = outputImageData.data;

  // --- Pre-calculate Parameters ---
  const toneMap = createToneMapper(settings);
  const S = settings.shadows / 100;
  const B = settings.blacks / 100;

  // Process Pixels
  const len = originalData.length;
  
  for (let i = 0, p = 0; i < len; i += 4, p++) {
    // --- 1. Read Original (Detail source) ---
    const r_orig = originalData[i] / 255;
    const g_orig = originalData[i + 1] / 255;
    const b_orig = originalData[i + 2] / 255;

    // Convert to linear (we'll do tone mapping in linear luminance)
    const ro_lin = srgbToLinear(r_orig);
    const go_lin = srgbToLinear(g_orig);
    const bo_lin = srgbToLinear(b_orig);
    const y_orig_lin = luma[p];
    const y_base_lin = Math.max(0.0001, baseLuma[p]);
    const y_target_lin = toneMap(y_base_lin);

    // --- 3. Reconstruct (shadow-friendly, less "crunchy") ---
    // Ratio = NewBase / OldBase (linear)
    const liftRatio = y_target_lin / y_base_lin;

    // JPEG/PNG are already display-referred; very high ratios tend to look harsh/noisy.
    // Keep a generous cap, but lower than RAW-style workflows.
    const clampedRatio = Math.min(liftRatio, 64.0);

    // Scale ORIGINAL in linear, but gently reduce micro-contrast in deep shadows by
    // blending toward the (blurred) base there. This helps match LR's "softer" shadow lift.
    const r_scaled_orig_lin = ro_lin * clampedRatio;
    const g_scaled_orig_lin = go_lin * clampedRatio;
    const b_scaled_orig_lin = bo_lin * clampedRatio;

    // Approximate base RGB from luminance ratio to preserve color.
    const baseRatio = y_orig_lin > 0 ? (y_base_lin / y_orig_lin) : 1.0;
    const r_scaled_base_lin = ro_lin * baseRatio * clampedRatio;
    const g_scaled_base_lin = go_lin * baseRatio * clampedRatio;
    const b_scaled_base_lin = bo_lin * baseRatio * clampedRatio;

    // Toe / shadow mask: 1.0 in deep shadows, 0.0 by ~25% luminance.
    const toeEnd = 0.25;
    const toeMask = 1.0 - smoothstep(0.0, toeEnd, Math.min(1.0, y_target_lin));

    // Detail damping (reduces perceived contrast/noise in lifted shadows)
    const detailDamp = Math.max(0.0, S) * 0.25; // reduce micro-contrast in lifted shadows
    const detailWeight = Math.max(0.35, 1.0 - detailDamp * toeMask);

    let r_out_lin = r_scaled_base_lin * (1.0 - detailWeight) + r_scaled_orig_lin * detailWeight;
    let g_out_lin = g_scaled_base_lin * (1.0 - detailWeight) + g_scaled_orig_lin * detailWeight;
    let b_out_lin = b_scaled_base_lin * (1.0 - detailWeight) + b_scaled_orig_lin * detailWeight;

    // Small additive toe lift (fixes "pure black never lifts" when using multiplicative detail preservation).
    // This intentionally behaves a bit like a tiny built-in "Blacks +" when Shadows is positive.
    const toeFromShadows = Math.max(0.0, S) * 0.0010; // ~0.0 to ~0.0010 linear
    const toeFromBlacks = Math.max(0.0, B) * 0.0020;  // allow explicit matte toe via Blacks +
    const toeLiftLin = (toeFromShadows + toeFromBlacks) * toeMask;

    r_out_lin = Math.max(0.0, r_out_lin + toeLiftLin);
    g_out_lin = Math.max(0.0, g_out_lin + toeLiftLin);
    b_out_lin = Math.max(0.0, b_out_lin + toeLiftLin);

    // Convert back to sRGB for canvas output
    let r_out = linearToSrgb(r_out_lin);
    let g_out = linearToSrgb(g_out_lin);
    let b_out = linearToSrgb(b_out_lin);
// --- 5. Saturation / Output Clamp ---
    r_out = Math.min(1.0, Math.max(0, r_out));
    g_out = Math.min(1.0, Math.max(0, g_out));
    b_out = Math.min(1.0, Math.max(0, b_out));

    outputData[i] = r_out * 255;
    outputData[i + 1] = g_out * 255;
    outputData[i + 2] = b_out * 255;
    outputData[i + 3] = originalData[i + 3];
  }

  ctx.putImageData(outputImageData, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Canvas to Blob failed'));
      }
    }, outputType, 0.95);
  });
};
