import React, { useEffect, useRef, useState } from 'react';
import Dropzone from './components/Dropzone';
import Editor from './components/Editor';
import BatchProcessor from './components/BatchProcessor';
import { AppMode } from './types';
import { Camera } from 'lucide-react';
import { filterAcceptedFiles, isHeicFile } from './constants';

const App: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<AppMode>(AppMode.IDLE);
  const appVersion = __APP_VERSION__;
  const lastCheckedRef = useRef(0);

  useEffect(() => {
    const baseUrl = new URL(import.meta.env.BASE_URL, window.location.origin).toString();
    const versionUrl = `${baseUrl}version.json`;

    const checkVersion = async () => {
      try {
        const now = Date.now();
        if (now - lastCheckedRef.current < 60_000) return;
        lastCheckedRef.current = now;
        const response = await fetch(`${versionUrl}?t=${now}`, { cache: 'no-store' });
        if (!response.ok) return;
        const data = (await response.json()) as { version?: string };
        if (data.version && data.version !== appVersion) {
          const storageKey = 'shadowlift:last-reload-version';
          const lastReloaded = sessionStorage.getItem(storageKey);
          if (lastReloaded !== data.version) {
            sessionStorage.setItem(storageKey, data.version);
            window.location.replace(`${baseUrl}?v=${data.version}`);
          }
          return;
        }
        sessionStorage.removeItem('shadowlift:last-reload-version');
      } catch {
        // Ignore network errors and keep the current session running.
      }
    };

    checkVersion();
    return () => {};
  }, [appVersion]);

  const dropCounterRef = useRef(0);

  const convertHeicToJpeg = async (file: File): Promise<File> => {
    const heic2anyModule = await import('heic2any');
    const heic2any = heic2anyModule.default;
    const result = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.92,
    });
    const blob = Array.isArray(result) ? result[0] : result;
    const jpegBlob =
      blob instanceof Blob ? blob : new Blob([blob], { type: 'image/jpeg' });
    const baseName = file.name.replace(/\.(heic|heif)$/i, '') || file.name;
    return new File([jpegBlob], `${baseName}.jpg`, {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
  };

  const normalizeDroppedFiles = async (droppedFiles: File[]): Promise<File[]> => {
    const normalized: File[] = [];
    for (const file of droppedFiles) {
      if (isHeicFile(file)) {
        try {
          normalized.push(await convertHeicToJpeg(file));
        } catch (error) {
          console.error('HEIC/HEIF conversion failed', error);
        }
      } else {
        normalized.push(file);
      }
    }
    return normalized;
  };

  const handleFilesDropped = async (droppedFiles: File[]) => {
    const dropId = ++dropCounterRef.current;
    const normalizedFiles = await normalizeDroppedFiles(droppedFiles);
    if (dropId !== dropCounterRef.current) return;
    if (normalizedFiles.length === 0) return;
    setFiles(normalizedFiles);
    if (normalizedFiles.length === 1) {
      setMode(AppMode.EDITOR);
    } else {
      setMode(AppMode.BATCH_PROCESSING);
    }
  };

  const handleReset = () => {
    setFiles([]);
    setMode(AppMode.IDLE);
  };

  // Global drag and drop handlers to allow dropping anywhere (e.g. over the Editor)
  // to immediately load new files without confirmation.
  const handleGlobalDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleGlobalDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    
    // If files are dropped, we process them.
    // Dropzone component stops propagation, so this only runs if dropped outside Dropzone 
    // (e.g. in Editor mode, or blank areas).
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = filterAcceptedFiles(Array.from(e.dataTransfer.files) as File[]);
      
      if (droppedFiles.length > 0) {
        handleFilesDropped(droppedFiles);
      }
    }
  };

  return (
    <div 
      className="min-h-screen bg-gray-950 text-white"
      onDragOver={handleGlobalDragOver}
      onDrop={handleGlobalDrop}
    >
      {mode === AppMode.IDLE && (
        <div className="container mx-auto px-4 h-screen flex flex-col">
          <header className="py-6 flex items-center justify-center gap-3">
             <Camera className="w-8 h-8 text-blue-500" />
             <h1 className="text-2xl font-bold tracking-tight text-gray-100">ShadowLift</h1>
          </header>
          
          <main className="flex-1 flex flex-col items-center justify-center max-w-4xl mx-auto w-full pb-20">
            <div className="text-center mb-10 max-w-lg">
                <p className="text-gray-400 text-lg leading-relaxed">
                    画像を選択するだけで、シャドウを自動補正。<br/>
                    1枚なら詳細編集、複数なら一括変換・ダウンロード。
                </p>
            </div>
            
            <div className="w-full h-80">
              <Dropzone onFilesDropped={handleFilesDropped} />
            </div>

            <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-6 text-center text-sm text-gray-500">
                <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-800">
                    <strong className="block text-gray-300 mb-1">自動補正</strong>
                    シャドウ +70
                </div>
                 <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-800">
                    <strong className="block text-gray-300 mb-1">詳細編集</strong>
                    露光量・コントラスト等
                </div>
                 <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-800">
                    <strong className="block text-gray-300 mb-1">一括変換</strong>
                    複数枚まとめてDL
                </div>
                 <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-800">
                    <strong className="block text-gray-300 mb-1">セキュア</strong>
                    処理は全てブラウザ内で
                </div>
            </div>
          </main>
          
          <footer className="py-6 text-center text-gray-600 text-xs">
            <div>© 2026 stechdrive. v{appVersion}</div>
            <div className="mt-1">処理はブラウザで完結し、画像が外部送信されることはありません。</div>
          </footer>
        </div>
      )}

      {mode === AppMode.EDITOR && files.length > 0 && (
        <Editor file={files[0]} onBack={handleReset} />
      )}

      {mode === AppMode.BATCH_PROCESSING && files.length > 0 && (
        <BatchProcessor files={files} onReset={handleReset} />
      )}
    </div>
  );
};

export default App;
