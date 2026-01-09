import React from 'react';
import { clsx } from 'clsx';
import { ToneAlgorithm } from '../types';

interface AlgorithmOption {
  id: ToneAlgorithm;
  label: string;
}

interface AlgorithmSelectProps {
  value: ToneAlgorithm;
  options: AlgorithmOption[];
  onChange: (value: ToneAlgorithm) => void;
  label?: string;
  className?: string;
}

const AlgorithmSelect: React.FC<AlgorithmSelectProps> = ({
  value,
  options,
  onChange,
  label = 'アルゴリズム',
  className,
}) => {
  return (
    <div className={clsx('space-y-2', className)}>
      <div className="text-[10px] uppercase tracking-widest text-gray-500">
        {label}
      </div>
      <div className="relative">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value as ToneAlgorithm)}
          className={clsx(
            'w-full appearance-none rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-200',
            'focus:outline-none focus:ring-2 focus:ring-blue-500/60'
          )}
          aria-label={label}
        >
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
          ▾
        </span>
      </div>
    </div>
  );
};

export default AlgorithmSelect;
