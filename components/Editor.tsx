import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Download, ArrowLeft, RotateCcw, Undo2, Redo2, Eye, EyeOff } from 'lucide-react';
import { ImageSettings } from '../types';
import { DEFAULT_SETTINGS, LIMITS, RESET_SETTINGS } from '../constants';
import Slider from './Slider';
import { processImage, loadImage, createResizedImage } from '../services/imageProcessor';
import saveAs from 'file-saver';

interface EditorProps {
  file: File;
  onBack: () => void;
}

const Editor: React.FC<EditorProps> = ({ file, onBack }) => {
  // Main settings state (live)
  const [settings, setSettings] = useState<ImageSettings>(DEFAULT_SETTINGS);
  
  // History management
  const [history, setHistory] = useState<ImageSettings[]>([DEFAULT_SETTINGS]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [originalPreviewUrl, setOriginalPreviewUrl] = useState<string | null>(null);
  const [isCompareView, setIsCompareView] = useState(false);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const timeoutRef = useRef<number | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const originalPreviewUrlRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);

  // We keep two references:
  // 1. Full resolution for final export
  // 2. Resized (approx 1080p) for fluid live preview
  const originalFullImageRef = useRef<HTMLImageElement | null>(null);
  const previewSourceImageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
      if (originalPreviewUrlRef.current) {
        URL.revokeObjectURL(originalPreviewUrlRef.current);
      }
    };
  }, []);

  // Initialize
  useEffect(() => {
    let active = true;
    const init = async () => {
      try {
        const img = await loadImage(file);
        if (!active) return;
        
        originalFullImageRef.current = img;
        
        // Create a smaller version for UI performance
        const smallImg = await createResizedImage(img, 1500); 
        if (!active) return;
        
        previewSourceImageRef.current = smallImg;

        // Generate URL for original (resized) image for comparison
        const canvas = document.createElement('canvas');
        canvas.width = smallImg.naturalWidth;
        canvas.height = smallImg.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.drawImage(smallImg, 0, 0);
            canvas.toBlob((blob) => {
                if (!blob) return;
                const url = URL.createObjectURL(blob);
                if (active && isMountedRef.current) {
                    setOriginalPreviewUrl((prev) => {
                        if (prev) URL.revokeObjectURL(prev);
                        originalPreviewUrlRef.current = url;
                        return url;
                    });
                } else {
                    URL.revokeObjectURL(url);
                }
            }, file.type);
        }
        
        updatePreview(DEFAULT_SETTINGS); // Apply default Shadow +70
      } catch (error) {
        console.error("Failed to load image", error);
      }
    };
    init();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const updatePreview = useCallback(async (currentSettings: ImageSettings) => {
    if (!previewSourceImageRef.current || !isMountedRef.current) return;
    setIsProcessing(true);

    // If there's a pending update, cancel it
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }

    // Delay actual processing slightly for slider responsiveness
    timeoutRef.current = window.setTimeout(async () => {
      if (!previewSourceImageRef.current || !isMountedRef.current) return;
      
      try {
        // Process the RESIZED image for preview
        const blob = await processImage(previewSourceImageRef.current, currentSettings, file.type);
        const url = URL.createObjectURL(blob);
        if (!isMountedRef.current) {
          URL.revokeObjectURL(url);
          return;
        }
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          previewUrlRef.current = url;
          return url;
        });
      } catch (err) {
        console.error(err);
      } finally {
        if (isMountedRef.current) {
          setIsProcessing(false);
        }
      }
    }, 20); // 20ms debounce for smoother live preview
  }, [file.type]);

  // Update live settings and preview without committing to history
  const handleSettingChange = (key: keyof ImageSettings, value: number) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    updatePreview(newSettings);
  };

  // Commit current settings to history (called on slider release)
  const handleSettingCommit = () => {
    // Prevent duplicate history entries if value hasn't effectively changed from history tip
    const currentHistoryHead = history[historyIndex];
    if (JSON.stringify(currentHistoryHead) === JSON.stringify(settings)) {
      return;
    }

    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(settings);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      const prevSettings = history[newIndex];
      setHistoryIndex(newIndex);
      setSettings(prevSettings);
      updatePreview(prevSettings);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      const nextSettings = history[newIndex];
      setHistoryIndex(newIndex);
      setSettings(nextSettings);
      updatePreview(nextSettings);
    }
  };

  const handleDownload = async () => {
    if (!originalFullImageRef.current) return;
    setIsSaving(true);
    
    // Use a small timeout to allow UI to update (show loading state)
    setTimeout(async () => {
        try {
            // Process the FULL RESOLUTION image for download
            const blob = await processImage(originalFullImageRef.current!, settings, file.type);
            saveAs(blob, `edited_${file.name}`);
        } catch (e) {
            console.error(e);
            alert("保存に失敗しました");
        } finally {
            setIsSaving(false);
        }
    }, 50);
  };

  const handleReset = () => {
      // Commit reset to history as well
      const newSettings = RESET_SETTINGS;
      setSettings(newSettings);
      updatePreview(newSettings);
      
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(newSettings);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
  };

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  // Compare button handler (Toggle)
  const toggleCompare = () => setIsCompareView(prev => !prev);

  return (
    <div className="flex flex-col md:flex-row h-screen bg-gray-950 text-gray-200">
      {/* Header / Toolbar for mobile */}
      <div className="md:hidden flex items-center justify-between p-4 bg-gray-900 border-b border-gray-800">
         <button onClick={onBack} className="text-gray-400 hover:text-white">
            <ArrowLeft />
         </button>
         <div className="flex items-center gap-4">
            <button onClick={handleUndo} disabled={!canUndo} className="text-gray-400 disabled:opacity-30">
                <Undo2 size={20} />
            </button>
            <button onClick={handleRedo} disabled={!canRedo} className="text-gray-400 disabled:opacity-30">
                <Redo2 size={20} />
            </button>
         </div>
         <button onClick={handleDownload} disabled={!previewUrl || isSaving} className="text-blue-400 disabled:opacity-50">
            <Download />
         </button>
      </div>

      {/* Main Preview Area */}
      <div className="flex-1 relative bg-gray-900 flex items-center justify-center p-4 overflow-hidden select-none">
        {previewUrl ? (
          <>
            <img
              src={isCompareView && originalPreviewUrl ? originalPreviewUrl : previewUrl}
              alt="Preview"
              className="max-w-full max-h-full object-contain shadow-2xl"
              style={{ opacity: isProcessing ? 0.9 : 1, transition: 'opacity 0.1s' }}
            />
            
            {/* Compare Indicator Badge */}
            {isCompareView && (
                <div className="absolute top-6 left-1/2 transform -translate-x-1/2 bg-blue-600/90 text-white px-6 py-2 rounded-full text-sm font-bold shadow-lg pointer-events-none border border-white/20 backdrop-blur-md z-20 animate-in fade-in slide-in-from-top-2">
                    BEFORE (Original)
                </div>
            )}

            {/* Compare Button (Floating) - Toggle Style */}
            <div className="absolute top-6 right-6 z-20">
                <button
                    className={`p-3 rounded-full backdrop-blur-md transition-all duration-200 shadow-xl border border-white/10 ${
                        isCompareView 
                        ? 'bg-blue-600 text-white ring-2 ring-blue-400' 
                        : 'bg-black/60 text-gray-200 hover:bg-black/80'
                    }`}
                    onClick={toggleCompare}
                    title={isCompareView ? "編集に戻る" : "オリジナルと比較"}
                >
                    {isCompareView ? <EyeOff size={24} /> : <Eye size={24} />}
                </button>
            </div>
          </>
        ) : (
            <div className="flex flex-col items-center">
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                <span className="text-gray-500">Processing...</span>
            </div>
        )}

        {isSaving && (
             <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-50">
                <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin mb-4"></div>
                <span className="text-white font-medium">最高画質で生成中...</span>
             </div>
        )}
        
        {/* Desktop Back Button Overlay */}
        <button 
            onClick={onBack}
            className="hidden md:flex absolute top-6 left-6 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full backdrop-blur-sm transition z-20"
            title="戻る"
        >
            <ArrowLeft size={20} />
        </button>
      </div>

      {/* Sidebar Controls */}
      <div className="w-full md:w-80 bg-gray-850 border-l border-gray-800 flex flex-col z-10">
        <div className="p-4 border-b border-gray-800">
            <div className="flex justify-between items-center mb-4">
                <h2 className="font-semibold text-sm text-gray-300 uppercase tracking-widest">ライト (Light)</h2>
                <button 
                    onClick={handleReset}
                    className="text-xs text-gray-500 hover:text-white flex items-center gap-1 transition-colors"
                    title="設定をリセット"
                >
                    <RotateCcw size={12} /> リセット
                </button>
            </div>
            
            <div className="flex justify-center gap-6 pb-1">
                <button 
                    onClick={handleUndo} 
                    disabled={!canUndo} 
                    className="flex flex-col items-center gap-1 text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 transition-colors"
                    title="元に戻す"
                >
                    <Undo2 size={18} />
                    <span className="text-[10px]">元に戻す</span>
                </button>
                <button 
                    onClick={handleRedo} 
                    disabled={!canRedo}
                    className="flex flex-col items-center gap-1 text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 transition-colors"
                    title="やり直す"
                >
                    <Redo2 size={18} />
                    <span className="text-[10px]">やり直す</span>
                </button>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          <Slider
            label="露光量"
            value={settings.exposure}
            min={LIMITS.exposure.min}
            max={LIMITS.exposure.max}
            step={LIMITS.exposure.step}
            onChange={(v) => handleSettingChange('exposure', v)}
            onCommit={handleSettingCommit}
          />
          <Slider
            label="コントラスト"
            value={settings.contrast}
            min={LIMITS.others.min}
            max={LIMITS.others.max}
            onChange={(v) => handleSettingChange('contrast', v)}
            onCommit={handleSettingCommit}
          />
          
          <div className="my-6 border-t border-gray-800"></div>

          <Slider
            label="ハイライト"
            value={settings.highlights}
            min={LIMITS.others.min}
            max={LIMITS.others.max}
            onChange={(v) => handleSettingChange('highlights', v)}
            onCommit={handleSettingCommit}
          />
          <Slider
            label="シャドウ"
            value={settings.shadows}
            min={LIMITS.others.min}
            max={LIMITS.others.max}
            onChange={(v) => handleSettingChange('shadows', v)}
            onCommit={handleSettingCommit}
          />
          <Slider
            label="白レベル"
            value={settings.whites}
            min={LIMITS.others.min}
            max={LIMITS.others.max}
            onChange={(v) => handleSettingChange('whites', v)}
            onCommit={handleSettingCommit}
          />
          <Slider
            label="黒レベル"
            value={settings.blacks}
            min={LIMITS.others.min}
            max={LIMITS.others.max}
            onChange={(v) => handleSettingChange('blacks', v)}
            onCommit={handleSettingCommit}
          />
        </div>

        <div className="p-5 border-t border-gray-800 bg-gray-850">
           <button
             onClick={handleDownload}
             disabled={!previewUrl || isProcessing || isSaving}
             className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded font-medium transition-colors flex items-center justify-center gap-2"
           >
             {isSaving ? (
                 <>保存中...</>
             ) : (
                 <>
                    <Download size={18} />
                    保存 (最高画質)
                 </>
             )}
           </button>
        </div>
      </div>
    </div>
  );
};

export default Editor;
