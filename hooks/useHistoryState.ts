import { useState } from 'react';

type EqualityFn<T> = (a: T, b: T) => boolean;

const defaultIsEqual = <T,>(a: T, b: T): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

export const useHistoryState = <T,>(
  initial: T,
  isEqual: EqualityFn<T> = defaultIsEqual
) => {
  const [state, setState] = useState<T>(initial);
  const [history, setHistory] = useState<T[]>([initial]);
  const [index, setIndex] = useState(0);

  const commit = (next: T = state): void => {
    const current = history[index];
    if (isEqual(current, next)) {
      return;
    }
    const newHistory = history.slice(0, index + 1);
    newHistory.push(next);
    setHistory(newHistory);
    setIndex(newHistory.length - 1);
  };

  const undo = (): T | null => {
    if (index <= 0) return null;
    const newIndex = index - 1;
    const next = history[newIndex];
    setIndex(newIndex);
    setState(next);
    return next;
  };

  const redo = (): T | null => {
    if (index >= history.length - 1) return null;
    const newIndex = index + 1;
    const next = history[newIndex];
    setIndex(newIndex);
    setState(next);
    return next;
  };

  const reset = (next: T): T => {
    setState(next);
    const newHistory = history.slice(0, index + 1);
    newHistory.push(next);
    setHistory(newHistory);
    setIndex(newHistory.length - 1);
    return next;
  };

  return {
    state,
    setState,
    commit,
    undo,
    redo,
    reset,
    canUndo: index > 0,
    canRedo: index < history.length - 1,
  };
};
