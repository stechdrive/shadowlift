import React from 'react';
import { clsx } from 'clsx';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
  disabled?: boolean;
}

const Slider: React.FC<SliderProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  onCommit,
  disabled = false,
}) => {
  // Calculate percentage for background gradient
  const percentage = ((value - min) / (max - min)) * 100;

  const handlePointerUp = () => {
    if (onCommit) {
      onCommit(value);
    }
  };

  const handleBlur = () => {
    if (onCommit) {
      onCommit(value);
    }
  };

  return (
    <div className="mb-5">
      <div className="flex justify-between items-center mb-1.5">
        <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
          {label}
        </label>
        <span className={clsx("text-xs font-mono", value !== 0 ? "text-blue-400" : "text-gray-500")}>
          {value > 0 ? `+${value}` : value}
        </span>
      </div>
      <div className="relative w-full h-6 flex items-center group">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          onPointerUp={handlePointerUp}
          onBlur={handleBlur}
          disabled={disabled}
          className="appearance-none w-full h-1 bg-gray-700 rounded-full outline-none focus:bg-gray-600 slider-thumb-custom"
          style={{
             background: `linear-gradient(to right, #3b82f6 ${percentage}%, #374151 ${percentage}%)`
          }}
        />
      </div>
      <style>{`
        .slider-thumb-custom::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #d1d5db;
          cursor: pointer;
          transition: background 0.15s ease-in-out, transform 0.1s;
        }
        .slider-thumb-custom::-webkit-slider-thumb:hover {
          background: #ffffff;
          transform: scale(1.1);
        }
        .slider-thumb-custom::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #d1d5db;
          cursor: pointer;
          border: none;
          transition: background 0.15s ease-in-out, transform 0.1s;
        }
        .slider-thumb-custom::-moz-range-thumb:hover {
          background: #ffffff;
          transform: scale(1.1);
        }
      `}</style>
    </div>
  );
};

export default Slider;