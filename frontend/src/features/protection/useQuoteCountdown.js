import { useEffect, useState } from 'react';

export default function useQuoteCountdown(expiresAt) {
  const calculate = () => {
    if (!expiresAt) return null;
    return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
  };

  const [seconds, setSeconds] = useState(calculate);

  useEffect(() => {
    setSeconds(calculate());
    if (!expiresAt) return undefined;

    const timer = window.setInterval(() => setSeconds(calculate()), 250);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  return seconds;
}
