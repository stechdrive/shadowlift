import { ImageSettings, ToneAlgorithm } from '../types';
import { getToneAlgorithm } from './toneAlgorithms';
import { ToneParams, linearToSrgb, srgbToLinear } from './toneAlgorithms/shared';

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
