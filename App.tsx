import React, { useState } from 'react';
import Dropzone from './components/Dropzone';
import Editor from './components/Editor';
import BatchProcessor from './components/BatchProcessor';
import { AppMode } from './types';
import { Camera } from 'lucide-react';
import { filterAcceptedFiles } from './constants';

const App: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<AppMode>(AppMode.IDLE);

  const handleFilesDropped = (droppedFiles: File[]) => {
    setFiles(droppedFiles);
    if (droppedFiles.length === 1) {
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
            © 2026 stechdrive. 画像はサーバーに送信されません。
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
