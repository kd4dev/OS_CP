import React, { useState, useEffect } from 'react';

export function Clock() {
  const [time, setTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toTimeString().split(' ')[0]);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="font-mono text-xs text-text-3 tabular-nums select-none tracking-wider px-2 py-1 rounded bg-surface-2 border border-border">
      {time || '--:--:--'}
    </div>
  );
}
