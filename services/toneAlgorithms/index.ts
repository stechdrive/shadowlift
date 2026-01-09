import { ToneAlgorithm } from '../../types';
import { ToneAlgorithmImpl } from './shared';
import { classicAlgorithm } from './classic';
import { reviewAlgorithm } from './review';

const TONE_ALGORITHMS: Record<ToneAlgorithm, ToneAlgorithmImpl> = {
  classic: classicAlgorithm,
  review: reviewAlgorithm,
};

export const getToneAlgorithm = (algorithm: ToneAlgorithm): ToneAlgorithmImpl =>
  TONE_ALGORITHMS[algorithm] ?? classicAlgorithm;
