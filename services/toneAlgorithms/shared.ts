export type ToneParams = {
  exposureMult: number;
  S: number;
  H: number;
  W: number;
  B: number;
  C: number;
  contrastFactor: number;
  pivotLin: number;
};

export type ReconstructionState = {
  r: number;
  g: number;
  b: number;
};

export type ToneAlgorithmImpl = {
  toneMap: (y_base_lin: number, params: ToneParams) => number;
  toeMask: (y_target_lin: number) => number;
  postReconstruct?: (
    state: ReconstructionState,
    y_target_lin: number,
    params: ToneParams,
    toeMask: number
  ) => void;
};

/**
 * Accurate sRGB <-> Linear conversions (display-referred JPEG/PNG friendly).
 * NOTE: Canvas pixel data is sRGB-encoded; we convert to linear for luminance math.
 */
export const clamp01 = (x: number): number => Math.min(1.0, Math.max(0.0, x));

export const srgbToLinear = (c: number): number => {
  // c is in [0,1]
  if (c <= 0.04045) return c / 12.92;
  return Math.pow((c + 0.055) / 1.055, 2.4);
};

export const linearToSrgb = (c: number): number => {
  // c is linear (can be >1 before clipping)
  if (c <= 0.0031308) return 12.92 * c;
  return 1.055 * Math.pow(c, 1.0 / 2.4) - 0.055;
};

export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3.0 - 2.0 * t);
};

export const applyHighlights = (y_target_lin: number, H: number): number => {
  if (H === 0) return y_target_lin;
  const highlightMask = Math.pow(Math.min(1, y_target_lin), 3.0);
  return y_target_lin * (1.0 + H * 0.6 * highlightMask);
};

export const applyWhites = (y_target_lin: number, W: number): number => {
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

export const applyBlacks = (y_target_lin: number, B: number): number => {
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

export const applyContrast = (y_target_lin: number, params: ToneParams): number => {
  if (params.C === 0) return y_target_lin;
  if (y_target_lin <= 0) return y_target_lin;
  return params.pivotLin * Math.pow(y_target_lin / params.pivotLin, params.contrastFactor);
};

export const applyToneMap = (
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
