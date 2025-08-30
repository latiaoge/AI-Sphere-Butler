import React from 'react';

export default function Clock() {
  const [now, setNow] = React.useState(new Date());

  React.useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatted = now.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).replace(/\//g, '-');

  return (
    <div
      style={{
        position: 'fixed',
        top: 30,
        right: 30,
        color: 'white',
        fontSize: 16,
        fontWeight: 'normal',
        userSelect: 'none',
        zIndex: 9999,
        fontFamily: 'sans-serif',
        backgroundColor: 'rgba(0,0,0,0.3)',
        padding: '2px 6px',
        borderRadius: 4,
      }}
      aria-label="当前时间和日期"
    >
      {formatted}
    </div>
  );
}
