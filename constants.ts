import { ImageSettings } from './types';

// Default settings: Shadows +70 as requested
export const DEFAULT_SETTINGS: ImageSettings = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 70,
  whites: 0,
  blacks: 0,
};

export const RESET_SETTINGS: ImageSettings = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
};

// Limits
export const LIMITS = {
  exposure: { min: -5, max: 5, step: 0.05 },
  others: { min: -100, max: 100, step: 1 },
};

// Map file extensions to MIME types if needed, though mostly handled by browser
export const ACCEPTED_TYPES = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/tiff': ['.tif', '.tiff'], 
};