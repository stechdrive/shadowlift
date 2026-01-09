import {
  ToneAlgorithmImpl,
  applyToneMap,
  clamp01,
  linearToSrgb,
  smoothstep,
} from './shared';

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

export const reviewAlgorithm: ToneAlgorithmImpl = {
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
