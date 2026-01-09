export interface ImageSettings {
  exposure: number;   // -5.00 to +5.00
  contrast: number;   // -100 to +100
  highlights: number; // -100 to +100
  shadows: number;    // -100 to +100
  whites: number;     // -100 to +100
  blacks: number;     // -100 to +100
}

export interface ProcessedFile {
  file: File;
  previewUrl: string;
  originalUrl: string;
  name: string;
  type: string;
  settings: ImageSettings;
}

export interface AppFile {
  file: File;
  outputName: string;
  outputType: string;
}

export enum AppMode {
  IDLE = 'IDLE',
  EDITOR = 'EDITOR',
  BATCH_PROCESSING = 'BATCH_PROCESSING',
  BATCH_COMPLETE = 'BATCH_COMPLETE',
}
