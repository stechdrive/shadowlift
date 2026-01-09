import React, { useEffect, useState } from 'react';
import JSZip from 'jszip';
import saveAs from 'file-saver';
import { DEFAULT_SETTINGS } from '../constants';
import { loadImage, processImage } from '../services/imageProcessor';
import { Loader2, CheckCircle, Download, AlertCircle } from 'lucide-react';

interface BatchProcessorProps {
  files: File[];
  onReset: () => void;
}

const BatchProcessor: React.FC<BatchProcessorProps> = ({ files, onReset }) => {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'processing' | 'zipping' | 'complete' | 'error'>('processing');
  const [zipBlob, setZipBlob] = useState<Blob | null>(null);

  useEffect(() => {
    const processFiles = async () => {
      try {
        const zip = new JSZip();
        let completed = 0;

        for (const file of files) {
          // Sequential processing to prevent memory crash
          const img = await loadImage(file);
          // Apply default Shadows +70
          const processedBlob = await processImage(img, DEFAULT_SETTINGS, file.type);
          
          zip.file(`edited_${file.name}`, processedBlob);
          
          completed++;
          setProgress(Math.round((completed / files.length) * 100));
        }

        setStatus('zipping');
        const content = await zip.generateAsync({ type: 'blob' });
        setZipBlob(content);
        setStatus('complete');
      } catch (err) {
        console.error(err);
        setStatus('error');
      }
    };

    processFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  const handleDownload = () => {
    if (zipBlob) {
      const date = new Date().toISOString().slice(0, 10);
      saveAs(zipBlob, `adjusted_photos_${date}.zip`);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 p-6">
      <div className="w-full max-w-md bg-gray-900 rounded-xl shadow-2xl p-8 border border-gray-800 text-center">
        
        {status === 'processing' && (
          <>
            <Loader2 className="w-16 h-16 text-blue-500 animate-spin mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-white mb-2">画像処理中...</h2>
            <p className="text-gray-400 mb-6">シャドウ +70 を適用しています</p>
            <div className="w-full bg-gray-800 rounded-full h-2.5 mb-2">
              <div 
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <p className="text-right text-sm text-gray-500">{progress}%</p>
          </>
        )}

        {status === 'zipping' && (
           <>
            <Loader2 className="w-16 h-16 text-green-500 animate-spin mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-white mb-2">ZIP作成中...</h2>
            <p className="text-gray-400">ファイルを圧縮しています</p>
           </>
        )}

        {status === 'complete' && (
          <>
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-white mb-2">完了</h2>
            <p className="text-gray-400 mb-8">{files.length}枚の画像を処理しました。</p>
            
            <button
              onClick={handleDownload}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold flex items-center justify-center gap-2 mb-4 transition-colors shadow-lg shadow-blue-900/20"
            >
              <Download size={20} />
              一括ダウンロード (ZIP)
            </button>
            
            <button
              onClick={onReset}
              className="text-gray-500 hover:text-white text-sm underline"
            >
              最初に戻る
            </button>
          </>
        )}

        {status === 'error' && (
            <>
                <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-6" />
                <h2 className="text-2xl font-bold text-white mb-2">エラー発生</h2>
                <p className="text-gray-400 mb-6">処理中に問題が発生しました。</p>
                <button
                    onClick={onReset}
                    className="px-6 py-2 bg-gray-800 hover:bg-gray-700 rounded text-white"
                >
                    戻る
                </button>
            </>
        )}

      </div>
    </div>
  );
};

export default BatchProcessor;