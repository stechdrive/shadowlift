import React, { useCallback } from 'react';
import { Upload, Image as ImageIcon } from 'lucide-react';
import { clsx } from 'clsx';
import { ACCEPTED_MIME_TYPES_STRING, filterAcceptedFiles } from '../constants';

interface DropzoneProps {
  onFilesDropped: (files: File[]) => void;
}

const Dropzone: React.FC<DropzoneProps> = ({ onFilesDropped }) => {
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();

      const droppedFiles = filterAcceptedFiles(Array.from(e.dataTransfer.files) as File[]);
      if (droppedFiles.length > 0) {
        onFilesDropped(droppedFiles);
      }
    },
    [onFilesDropped]
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = filterAcceptedFiles(Array.from(e.target.files));
      if (selectedFiles.length > 0) {
        onFilesDropped(selectedFiles);
      }
    }
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className={clsx(
        "flex flex-col items-center justify-center w-full h-full min-h-[320px]",
        "border-2 border-dashed border-gray-700 rounded-xl bg-gray-900/30",
        "hover:bg-gray-800/50 hover:border-blue-500/50 transition-all duration-300",
        "cursor-pointer group relative overflow-hidden"
      )}
    >
      <input
        type="file"
        multiple
        accept={ACCEPTED_MIME_TYPES_STRING}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        onChange={handleFileInput}
      />
      
      <div className="flex flex-col items-center justify-center p-6 text-center z-0">
        <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 shadow-xl border border-gray-700">
            <Upload className="w-9 h-9 text-blue-400" />
        </div>
        
        <h3 className="mb-2 text-xl font-bold text-gray-200">
          画像を追加
        </h3>
        
        <p className="text-gray-400 mb-8 max-w-xs mx-auto text-sm leading-relaxed">
           <span className="hidden md:inline">ここにファイルをドラッグ＆ドロップ<br/>または</span>
           <span className="md:hidden">タップしてカメラロールから選択</span>
        </p>

        {/* Fake Button for Visual Affordance */}
        <div className="bg-blue-600 text-white px-8 py-3 rounded-full font-medium shadow-lg shadow-blue-900/30 transition-all group-hover:bg-blue-500 group-hover:shadow-blue-500/20 flex items-center gap-2 transform group-hover:-translate-y-0.5">
            <ImageIcon size={18} />
            ファイルを選択
        </div>

        <p className="mt-8 text-xs text-gray-600 font-mono">
          JPG, PNG, WEBP, HEIC/HEIF 対応
        </p>
      </div>
    </div>
  );
};

export default Dropzone;
