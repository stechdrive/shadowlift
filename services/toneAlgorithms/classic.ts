import { ToneAlgorithmImpl, applyToneMap, smoothstep } from './shared';

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

export const classicAlgorithm: ToneAlgorithmImpl = {
  toneMap: (y_base_lin, params) => applyToneMap(y_base_lin, params, applyShadowsClassic),
  toeMask: (y_target_lin) => 1.0 - smoothstep(0.0, 0.25, Math.min(1.0, y_target_lin)),
};
