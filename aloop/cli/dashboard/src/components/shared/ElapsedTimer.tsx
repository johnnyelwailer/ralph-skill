import React, { useState, useEffect } from 'react';
import { formatSecs } from '../../lib/format';

export function ElapsedTimer({ since }: { since: string }) {
  const [elapsed, setElapsed] = useState('');
  useEffect(() => {
    if (!since) return;
    const start = new Date(since).getTime();
    const tick = () => {
      const diff = Math.max(0, Math.floor((Date.now() - start) / 1000));
      setElapsed(formatSecs(diff));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [since]);

  return <>{elapsed}</>;
}
