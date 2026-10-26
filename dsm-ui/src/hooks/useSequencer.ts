import { useRef, useCallback, useEffect } from 'react';

export interface SequenceStep {
  at: number; // Milliseconds from sequence start
  run: () => void;
}

export function useSequencer() {
  const timersRef = useRef<any[]>([]);

  const cancel = useCallback(() => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
  }, []);

  const play = useCallback((steps: SequenceStep[]) => {
    cancel();
    steps.forEach(({ at, run }) => {
      const timer = setTimeout(() => {
        run();
      }, at);
      timersRef.current.push(timer);
    });
  }, [cancel]);

  useEffect(() => {
    return () => cancel();
  }, [cancel]);

  return { play, cancel };
}
