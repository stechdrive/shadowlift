import { ImageSettings, ToneAlgorithm } from '../types';

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

type ToneParams = {
    exposureMult: number;
    S: number;
    H: number;
    W: number;
    B: number;
    C: number;
    contrastFactor: number;
    pivotLin: number;
};

type ReconstructionState = {
    r: number;
    g: number;
    b: number;
};

type ToneAlgorithmImpl = {
    toneMap: (y_base_lin: number, params: ToneParams) => number;
    toeMask: (y_target_lin: number) => number;
    postReconstruct?: (
        state: ReconstructionState,
        y_target_lin: number,
        params: ToneParams,
        toeMask: number
    ) => void;
};

const applyShadowsClassic = (y_target_lin: number, S: number): number => {
    // Power Curve: Slightly stronger lift (0.60 -> 0.65)
    const shadowPower = 1.0 - (S * 0.65);

    let y_lifted = Math.pow(y_target_lin, shadowPower);

    // Toe Lift (Matte Black Effect): allow visible lifting of pure blacks.
    if (S > 0) {
        const toeLift = S * 0.05;
        y_lifted += toeLift * Math.exp(-9.0 * y_target_lin);
    }

    // Blend Weight: apply mostly to darks.
    const blend = Math.pow(1.0 - Math.min(1.0, y_target_lin), 3.0);

    return y_target_lin * (1.0 - blend) + y_lifted * blend;
};

const applyShadowsReview = (y_target_lin: number, S: number): number => {
    // Review-tuned: softer toe lift and display-domain blend for stability.
    const shadowPower = 1.0 - (S * 0.65);
    let y_lifted = Math.pow(y_target_lin, shadowPower);

    if (S > 0) {
        const toeLift = S * 0.006;
        y_lifted += toeLift * Math.exp(-25.0 * y_target_lin);
    }

    const yDisp = linearToSrgb(clamp01(y_target_lin));
    const blend = Math.pow(1.0 - yDisp, 2.6);

    return y_target_lin * (1.0 - blend) + y_lifted * blend;
};

const applyHighlights = (y_target_lin: number, H: number): number => {
    if (H === 0) return y_target_lin;
    const highlightMask = Math.pow(Math.min(1, y_target_lin), 3.0);
    return y_target_lin * (1.0 + H * 0.6 * highlightMask);
};

const applyWhites = (y_target_lin: number, W: number): number => {
    if (W === 0) return y_target_lin;

    const yClamped = clamp01(y_target_lin);
    const highlightMask = smoothstep(0.35, 1.0, yClamped);
    const posHighlightMask = smoothstep(0.25, 1.0, yClamped);
    const wideMask = smoothstep(0.15, 0.9, yClamped);
    const headroom = 1.0 - yClamped;

    if (W > 0) {
        const whiteStrength = W * 1.25;
        const lift = whiteStrength * 0.28 * wideMask;
        const base = yClamped + lift;
        const rolloff = 1.0 - Math.pow(1.0 - clamp01(base), 1.0 + whiteStrength * 1.15);
        // Push highlights above 1.0 to allow visible clipping ("blow-out").
        const blow = whiteStrength * 0.7 * Math.pow(posHighlightMask, 1.4);
        const mapped = rolloff + blow;
        return base * (1.0 - posHighlightMask) + mapped * posHighlightMask;
    }

    const whiteStrength = Math.abs(W) * 1.6;
    const whiteExponent = 1.0 / (1.0 + whiteStrength);
    const mapped = 1.0 - Math.pow(headroom, whiteExponent);
    return yClamped * (1.0 - highlightMask) + mapped * highlightMask;
};

const applyBlacks = (y_target_lin: number, B: number): number => {
    if (B === 0) return y_target_lin;

    const yClamped = clamp01(y_target_lin);
    const shadowMask = 1.0 - smoothstep(0.0, 0.22, yClamped);

    if (B > 0) {
        // Subtle black point lift focused on the deepest shadows (not a midtone lift).
        const blackStrength = B * 0.7;
        const lift = blackStrength * 0.06 * Math.pow(shadowMask, 1.6) * (1.0 - yClamped);
        const mapped = yClamped + lift;
        return yClamped * (1.0 - shadowMask) + mapped * shadowMask;
    }

    const blackStrength = Math.abs(B) * 1.3;
    const blackExponent = 1.0 + blackStrength;
    const mapped = Math.pow(yClamped, blackExponent);
    return yClamped * (1.0 - shadowMask) + mapped * shadowMask;
};

const applyContrast = (y_target_lin: number, params: ToneParams): number => {
    if (params.C === 0) return y_target_lin;
    if (y_target_lin <= 0) return y_target_lin;
    return params.pivotLin * Math.pow(y_target_lin / params.pivotLin, params.contrastFactor);
};

const applyToneMap = (
    y_base_lin: number,
    params: ToneParams,
    applyShadows: (y_target_lin: number, S: number) => number
): number => {
    let y_target_lin = y_base_lin;

    // A. Exposure
    if (params.exposureMult !== 1) {
        y_target_lin *= params.exposureMult;
    }

    // B. Shadows
    if (params.S !== 0) {
        y_target_lin = applyShadows(y_target_lin, params.S);
    }

    // C. Highlights
    y_target_lin = applyHighlights(y_target_lin, params.H);

    // D. Whites / Blacks
    y_target_lin = applyWhites(y_target_lin, params.W);
    y_target_lin = applyBlacks(y_target_lin, params.B);

    // E. Contrast (Pivot)
    y_target_lin = applyContrast(y_target_lin, params);

    return Math.max(0, y_target_lin);
};

const classicAlgorithm: ToneAlgorithmImpl = {
    toneMap: (y_base_lin, params) => applyToneMap(y_base_lin, params, applyShadowsClassic),
    toeMask: (y_target_lin) => 1.0 - smoothstep(0.0, 0.25, Math.min(1.0, y_target_lin)),
};

const reviewAlgorithm: ToneAlgorithmImpl = {
    toneMap: (y_base_lin, params) => applyToneMap(y_base_lin, params, applyShadowsReview),
    toeMask: (y_target_lin) =>
        1.0 - smoothstep(0.0, 0.25, linearToSrgb(clamp01(y_target_lin))),
    postReconstruct: (state, y_target_lin, params, toeMask) => {
        const y_out_lin = 0.2126 * state.r + 0.7152 * state.g + 0.0722 * state.b;
        const fillK = 0.8;
        const fill = Math.max(0.0, y_target_lin - y_out_lin) * toeMask * fillK;
        state.r += fill;
        state.g += fill;
        state.b += fill;

        const satK = Math.max(0.0, params.S) * 0.15 * toeMask;
        if (satK > 0) {
            const yN = 0.2126 * state.r + 0.7152 * state.g + 0.0722 * state.b;
            state.r = state.r * (1.0 - satK) + yN * satK;
            state.g = state.g * (1.0 - satK) + yN * satK;
            state.b = state.b * (1.0 - satK) + yN * satK;
        }
    },
};

const TONE_ALGORITHMS: Record<ToneAlgorithm, ToneAlgorithmImpl> = {
    classic: classicAlgorithm,
    review: reviewAlgorithm,
};

const getToneAlgorithm = (algorithm: ToneAlgorithm): ToneAlgorithmImpl =>
    TONE_ALGORITHMS[algorithm] ?? classicAlgorithm;

/**
 * Main processing function
 * Implements Base/Detail separation with improved Shadow Recovery logic
 * based on user feedback (Deep blacks lift & Stronger Toe lift).
 */
export const processImage = async (
  img: HTMLImageElement,
  settings: ImageSettings,
  outputType: string,
  algorithm: ToneAlgorithm = 'classic'
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

  // 2. Create "Base" Layer (Low Frequency)
  // We use a blurred version to represent local lighting.
  const blurRadius = Math.max(2, Math.floor(Math.min(width, height) * 0.012));
  
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;
  const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
  if (!tempCtx) throw new Error('Could not get temp canvas context');

  tempCtx.filter = `blur(${blurRadius}px)`;
  tempCtx.drawImage(img, 0, 0);
  const baseData = getImageData(tempCtx, width, height);
  tempCtx.filter = 'none';

  // Create output buffer
  const outputImageData = ctx.createImageData(width, height);
  const outputData = outputImageData.data;

  // --- Pre-calculate Parameters ---
  const exposureMult = Math.pow(2, settings.exposure);
  
  const S = settings.shadows / 100;
  const H = settings.highlights / 100;
  const W = settings.whites / 100;
  const B = settings.blacks / 100;
  const C = settings.contrast / 100;

  const contrastFactor = C >= 0 ? 1 + C : 1 / (1 - C);
  const pivotLin = 0.18; // Linear Middle Gray
  const toneParams: ToneParams = {
    exposureMult,
    S,
    H,
    W,
    B,
    C,
    contrastFactor,
    pivotLin,
  };
  const algorithmImpl = getToneAlgorithm(algorithm);
  const postState = algorithmImpl.postReconstruct ? { r: 0, g: 0, b: 0 } : null;

  // Process Pixels
  const len = originalData.length;
  
  for (let i = 0; i < len; i += 4) {
    // --- 1. Read Original (Detail source) ---
    const r_orig = originalData[i] / 255;
    const g_orig = originalData[i + 1] / 255;
    const b_orig = originalData[i + 2] / 255;

    // --- 2. Read Base (Lighting source) ---
    const r_base = baseData[i] / 255;
    const g_base = baseData[i + 1] / 255;
    const b_base = baseData[i + 2] / 255;

    // Convert to linear (we'll do tone mapping in linear luminance)
    const ro_lin = srgbToLinear(r_orig);
    const go_lin = srgbToLinear(g_orig);
    const bo_lin = srgbToLinear(b_orig);

    const rb_lin = srgbToLinear(r_base);
    const gb_lin = srgbToLinear(g_base);
    const bb_lin = srgbToLinear(b_base);

    // Linear Luminance (base)
    let y_base_lin = 0.2126 * rb_lin + 0.7152 * gb_lin + 0.0722 * bb_lin;

    // Add epsilon to prevent divide-by-zero later (also stabilizes deep-black math)
    y_base_lin = Math.max(0.0001, y_base_lin);
    // --- 3. Tone Map the Base Layer ---
    const y_target_lin = algorithmImpl.toneMap(y_base_lin, toneParams);

    // --- 4. Reconstruct (shadow-friendly, less "crunchy") ---
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

    const r_scaled_base_lin = rb_lin * clampedRatio;
    const g_scaled_base_lin = gb_lin * clampedRatio;
    const b_scaled_base_lin = bb_lin * clampedRatio;

    // Toe / shadow mask: 1.0 in deep shadows, 0.0 by ~25% luminance.
    const toeMask = algorithmImpl.toeMask(y_target_lin);

    // Detail damping (reduces perceived contrast/noise in lifted shadows)
    const detailDamp = Math.max(0.0, S) * 0.35; // up to 35% at Shadows +100
    const detailWeight = Math.max(0.35, 1.0 - detailDamp * toeMask);

    let r_out_lin = r_scaled_base_lin * (1.0 - detailWeight) + r_scaled_orig_lin * detailWeight;
    let g_out_lin = g_scaled_base_lin * (1.0 - detailWeight) + g_scaled_orig_lin * detailWeight;
    let b_out_lin = b_scaled_base_lin * (1.0 - detailWeight) + b_scaled_orig_lin * detailWeight;

    // Small additive toe lift (fixes "pure black never lifts" when using multiplicative detail preservation).
    // This intentionally behaves a bit like a tiny built-in "Blacks +" when Shadows is positive.
    const toeFromShadows = Math.max(0.0, S) * 0.0012; // ~0.0 to ~0.0012 linear
    const toeFromBlacks = Math.max(0.0, B) * 0.0024;  // allow explicit matte toe via Blacks +
    const toeLiftLin = (toeFromShadows + toeFromBlacks) * toeMask;

    r_out_lin = Math.max(0.0, r_out_lin + toeLiftLin);
    g_out_lin = Math.max(0.0, g_out_lin + toeLiftLin);
    b_out_lin = Math.max(0.0, b_out_lin + toeLiftLin);

    if (algorithmImpl.postReconstruct && postState) {
        postState.r = r_out_lin;
        postState.g = g_out_lin;
        postState.b = b_out_lin;
        algorithmImpl.postReconstruct(postState, y_target_lin, toneParams, toeMask);
        r_out_lin = postState.r;
        g_out_lin = postState.g;
        b_out_lin = postState.b;
    }

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
