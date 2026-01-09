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
    let y_target_lin = y_base_lin;

    // A. Exposure
    if (exposureMult !== 1) {
        y_target_lin *= exposureMult;
    }

    // B. Shadows (Improved: Stronger Lift & Toe Lift)
    // Refined based on feedback: "Lift pure black more, allow it to look slightly washed/matte."
    if (S !== 0) {
        // Power Curve: Slightly stronger lift (0.60 -> 0.65)
        const shadowPower = 1.0 - (S * 0.65); 
        
        let y_lifted = Math.pow(y_target_lin, shadowPower);

        // Toe Lift (Matte Black Effect):
        // Increased from 0.02 to 0.05 to allow visible lifting of pure blacks.
        // This mimics the "Blacks" slider or strong Shadow recovery in LR.
        if (S > 0) {
            const toeLift = S * 0.05; 
            // Decay function: Relaxed decay (-12.0 -> -9.0) to spread the lift effect wider (softer look)
            y_lifted += toeLift * Math.exp(-9.0 * y_target_lin);
        }
        
        // Blend Weight: Apply mostly to darks.
        // Relaxed power (4.0 -> 3.0) to allow the shadow lift to blend smoother into midtones, reducing perceived contrast.
        const blend = Math.pow(1.0 - Math.min(1.0, y_target_lin), 3.0);
        
        y_target_lin = y_target_lin * (1.0 - blend) + y_lifted * blend;
    }

    // C. Highlights (Compression)
    if (H !== 0) {
        // Focus on top end
        const highlightMask = Math.pow(Math.min(1, y_target_lin), 3.0);
        if (H < 0) {
             y_target_lin = y_target_lin * (1.0 + H * 0.6 * highlightMask);
        } else {
             y_target_lin = y_target_lin * (1.0 + H * 0.6 * highlightMask);
        }
    }

    // D. Whites / Blacks (Additive/Offset)
    // These shift the floor/ceiling.
    if (W !== 0) y_target_lin += W * 0.15 * Math.pow(y_target_lin, 2.0);
    if (B !== 0) y_target_lin += B * 0.15 * Math.pow(1.0 - y_target_lin, 3.0);

    // E. Contrast (Pivot)
    if (C !== 0) {
        if (y_target_lin > 0) {
             y_target_lin = pivotLin * Math.pow(y_target_lin / pivotLin, contrastFactor);
        }
    }
    
    y_target_lin = Math.max(0, y_target_lin);

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
    const toeEnd = 0.25;
    const toeMask = 1.0 - smoothstep(0.0, toeEnd, Math.min(1.0, y_target_lin));

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
