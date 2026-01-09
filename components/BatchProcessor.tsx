import React, { useEffect, useState } from 'react';
import JSZip from 'jszip';
import saveAs from 'file-saver';
import { DEFAULT_SETTINGS } from '../constants';
import { loadImage, processImage } from '../services/imageProcessor';
import { Loader2, CheckCircle, Download, AlertCircle } from 'lucide-react';
import { AppFile } from '../types';

interface BatchProcessorProps {
  files: AppFile[];
  onReset: () => void;
}

const BatchProcessor: React.FC<BatchProcessorProps> = ({ files, onReset }) => {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'processing' | 'zipping' | 'complete' | 'error'>('processing');
  const [zipBlob, setZipBlob] = useState<Blob | null>(null);
  const [failedFiles, setFailedFiles] = useState<{ name: string; reason: string }[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    const processFiles = async () => {
      try {
        const zip = new JSZip();
        let completed = 0;
        let successCount = 0;
        const failures: { name: string; reason: string }[] = [];

        for (const file of files) {
          try {
            // Sequential processing to prevent memory crash
            const img = await loadImage(file.file);
            // Apply default Shadows +70
            const processedBlob = await processImage(
              img,
              DEFAULT_SETTINGS,
              file.outputType
            );
            
            zip.file(`edited_${file.outputName}`, processedBlob);
            successCount++;
          } catch (error) {
            const reason = error instanceof Error ? error.message : '不明なエラー';
            failures.push({ name: file.outputName, reason });
            console.error('Failed to process file', file.outputName, error);
          } finally {
            completed++;
            setProgress(Math.round((completed / files.length) * 100));
          }
        }

        if (failures.length > 0) {
          setFailedFiles(failures);
        }

        if (successCount === 0) {
          setErrorMessage('すべての画像の処理に失敗しました。');
          setStatus('error');
          return;
        }

        try {
          setStatus('zipping');
          const content = await zip.generateAsync({ type: 'blob' });
          setZipBlob(content);
          setStatus('complete');
        } catch (error) {
          console.error('Failed to generate ZIP', error);
          setErrorMessage('ZIPの作成に失敗しました。');
          setStatus('error');
        }
      } catch (error) {
        console.error('Batch processing failed', error);
        setErrorMessage('処理中に問題が発生しました。');
        setStatus('error');
      }
    };

    processFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  const handleDownload = () => {
    if (zipBlob) {
      try {
        const date = new Date().toISOString().slice(0, 10);
        saveAs(zipBlob, `adjusted_photos_${date}.zip`);
        setDownloadError(null);
      } catch (error) {
        console.error('Failed to save ZIP', error);
        setDownloadError('ダウンロードに失敗しました。');
      }
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
            <p className="text-gray-400 mb-8">
              {files.length - failedFiles.length}枚の画像を処理しました。
              {failedFiles.length > 0 && ` ${failedFiles.length}枚はスキップしました。`}
            </p>
            
            <button
              onClick={handleDownload}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold flex items-center justify-center gap-2 mb-4 transition-colors shadow-lg shadow-blue-900/20"
            >
              <Download size={20} />
              一括ダウンロード (ZIP)
            </button>

            {downloadError && (
              <p className="text-sm text-red-400 mb-4">{downloadError}</p>
            )}

            {failedFiles.length > 0 && (
              <div className="mb-6 text-left bg-gray-900/60 border border-gray-800 rounded-lg p-3 text-xs text-gray-400">
                <p className="text-gray-300 font-semibold mb-2">処理できなかったファイル</p>
                <ul className="max-h-32 overflow-y-auto space-y-1">
                  {failedFiles.map((file, index) => (
                    <li key={`${file.name}-${index}`} className="truncate">
                      {file.name} - {file.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
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
                <p className="text-gray-400 mb-6">
                  {errorMessage ?? '処理中に問題が発生しました。'}
                </p>
                {failedFiles.length > 0 && (
                  <div className="mb-6 text-left bg-gray-900/60 border border-gray-800 rounded-lg p-3 text-xs text-gray-400">
                    <p className="text-gray-300 font-semibold mb-2">処理できなかったファイル</p>
                    <ul className="max-h-32 overflow-y-auto space-y-1">
                      {failedFiles.map((file, index) => (
                        <li key={`${file.name}-${index}`} className="truncate">
                          {file.name} - {file.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
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
