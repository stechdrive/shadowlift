import { ImageSettings, ToneAlgorithm } from './types';

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

export const DEFAULT_TONE_ALGORITHM: ToneAlgorithm = 'classic';

export const TONE_ALGORITHM_OPTIONS: { id: ToneAlgorithm; label: string }[] = [
  { id: 'classic', label: '現行' },
  { id: 'review', label: 'レビュー' },
];

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
  'image/heic': ['.heic'],
  'image/heif': ['.heif'],
  'image/heic-sequence': ['.heic'],
  'image/heif-sequence': ['.heif'],
};

export const ACCEPTED_MIME_TYPES = Object.keys(ACCEPTED_TYPES);
export const ACCEPTED_MIME_TYPES_STRING = ACCEPTED_MIME_TYPES.join(',');
export const ACCEPTED_EXTENSIONS = Object.values(ACCEPTED_TYPES).flat();
export const HEIC_MIME_TYPES = [
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
];
export const HEIC_EXTENSIONS = ['.heic', '.heif'];

const EXTENSION_TO_MIME = Object.entries(ACCEPTED_TYPES).reduce<Record<string, string>>(
  (acc, [mime, extensions]) => {
    extensions.forEach((extension) => {
      acc[extension] = mime;
    });
    return acc;
  },
  {}
);

const getLowercaseExtension = (name: string): string | null => {
  const index = name.lastIndexOf('.');
  if (index === -1) return null;
  return name.slice(index).toLowerCase();
};

export const isHeicFile = (file: File): boolean => {
  const type = file.type.toLowerCase();
  const extension = getLowercaseExtension(file.name);
  return (
    (type !== '' && HEIC_MIME_TYPES.includes(type)) ||
    (extension !== null && HEIC_EXTENSIONS.includes(extension))
  );
};

export const filterAcceptedFiles = (files: File[]): File[] =>
  files.filter((file) => {
    const type = file.type.toLowerCase();
    if (type !== '' && ACCEPTED_MIME_TYPES.includes(type)) return true;
    const extension = getLowercaseExtension(file.name);
    return extension !== null && ACCEPTED_EXTENSIONS.includes(extension);
  });

export const getMimeTypeForFile = (file: File): string | null => {
  if (file.type) return file.type;
  const extension = getLowercaseExtension(file.name);
  if (!extension) return null;
  return EXTENSION_TO_MIME[extension] ?? null;
};
