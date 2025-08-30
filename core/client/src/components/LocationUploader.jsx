import React, { useEffect } from 'react';

export default function SseListener({ onMessage }) {
  useEffect(() => {
    const internalUrl = 'https://192.168.1.70:5000/capture_events';
    const externalUrl = 'https://101.50.118.42:5000/capture_events';

    const isInternal = /^192\.168\./.test(window.location.hostname)
      || /^10\./.test(window.location.hostname)
      || /^172\.(1[6-9]|2\d|3[0-1])\./.test(window.location.hostname);

    const primaryUrl = isInternal ? internalUrl : externalUrl;
    const fallbackUrl = isInternal ? externalUrl : internalUrl;

    let eventSource = new EventSource(primaryUrl);

    eventSource.onopen = () => console.log('SSE 已连接');

    eventSource.onmessage = e => {
      if (onMessage) onMessage(e.data);
    };

    eventSource.onerror = () => {
      console.warn('SSE 连接错误，尝试备用地址');
      eventSource.close();
      eventSource = new EventSource(fallbackUrl);
      eventSource.onmessage = e => {
        if (onMessage) onMessage(e.data);
      };
    };

    return () => {
      eventSource.close();
    };
  }, [onMessage]);

  return null;
}
