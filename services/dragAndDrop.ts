type FileSystemEntryLike = {
  isFile: boolean;
  isDirectory: boolean;
  name?: string;
};

type FileSystemFileEntryLike = FileSystemEntryLike & {
  file: (
    successCallback: (file: File) => void,
    errorCallback?: (error: DOMException) => void
  ) => void;
};

type FileSystemDirectoryReaderLike = {
  readEntries: (
    successCallback: (entries: FileSystemEntryLike[]) => void,
    errorCallback?: (error: DOMException) => void
  ) => void;
};

type FileSystemDirectoryEntryLike = FileSystemEntryLike & {
  createReader: () => FileSystemDirectoryReaderLike;
};

type WebkitDataTransferItem = DataTransferItem & {
  webkitGetAsEntry?: () => FileSystemEntryLike | null;
};

export type DragAndDropIssue = {
  name?: string;
  kind: 'file' | 'directory';
  detail?: string;
};

const readEntries = async (reader: FileSystemDirectoryReaderLike): Promise<FileSystemEntryLike[]> => {
  const entries: FileSystemEntryLike[] = [];

  while (true) {
    // readEntries returns entries in batches; an empty batch means we're done.
    const batch = await new Promise<FileSystemEntryLike[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });

    if (batch.length === 0) {
      break;
    }

    entries.push(...batch);
  }

  return entries;
};

const getEntryFile = (entry: FileSystemFileEntryLike): Promise<File> =>
  new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unknown error';

const getFileKey = (file: File): string =>
  `${file.name}-${file.size}-${file.lastModified}`;

const addFile = (collector: File[], seen: Set<string>, file: File): void => {
  const key = getFileKey(file);
  if (seen.has(key)) return;
  seen.add(key);
  collector.push(file);
};

const walkEntry = async (
  entry: FileSystemEntryLike,
  collector: File[],
  issues: DragAndDropIssue[],
  seen: Set<string>
): Promise<void> => {
  if (entry.isFile) {
    try {
      const file = await getEntryFile(entry as FileSystemFileEntryLike);
      addFile(collector, seen, file);
    } catch (error) {
      issues.push({
        name: entry.name,
        kind: 'file',
        detail: getErrorMessage(error),
      });
    }
    return;
  }

  if (entry.isDirectory) {
    try {
      const reader = (entry as FileSystemDirectoryEntryLike).createReader();
      const entries = await readEntries(reader);
      for (const child of entries) {
        await walkEntry(child, collector, issues, seen);
      }
    } catch (error) {
      issues.push({
        name: entry.name,
        kind: 'directory',
        detail: getErrorMessage(error),
      });
    }
  }
};

export const getFilesFromDataTransfer = async (
  dataTransfer: DataTransfer
): Promise<{ files: File[]; issues: DragAndDropIssue[] }> => {
  const items = Array.from(dataTransfer.items ?? []);
  const entries = items
    .filter((item) => item.kind === 'file')
    .map((item) => (item as WebkitDataTransferItem).webkitGetAsEntry?.() ?? null)
    .filter((entry): entry is FileSystemEntryLike => entry !== null);

  if (entries.length === 0) {
    return { files: Array.from(dataTransfer.files), issues: [] };
  }

  const files: File[] = [];
  const issues: DragAndDropIssue[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    try {
      await walkEntry(entry, files, issues, seen);
    } catch (error) {
      issues.push({
        name: entry.name,
        kind: entry.isDirectory ? 'directory' : 'file',
        detail: getErrorMessage(error),
      });
    }
  }

  const fallbackFiles = Array.from(dataTransfer.files);
  for (const file of fallbackFiles) {
    addFile(files, seen, file);
  }

  return { files, issues };
};
