import React, { useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'floatingHandPosition';

export default function FloatingContainer() {
  const handAreaRef = useRef(null);
  const feedbackRef = useRef(null);

  const isDraggingRef = useRef(false);
  const dragStartTimeoutRef = useRef(null);
  const offsetXRef = useRef(0);
  const offsetYRef = useRef(0);

  const [feedbackActive, setFeedbackActive] = useState(false);
  const [feedbackPos, setFeedbackPos] = useState({ left: 0, top: 0 });

  // 控制手臂区域边框样式，拖动时显示实线红边，非拖动时半透明细边
  const [dragging, setDragging] = useState(false);

  // 记录当前left/top状态，用于初始加载和保存
  const [position, setPosition] = useState({ left: 100, top: 100 });

  // 发送文本消息到服务器
  const sendTextMessage = async (text) => {
    if (!text.trim()) return;

    try {
      const response = await fetch('https://192.168.1.70:6010/qwener', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        throw new Error('网络响应失败，状态码: ' + response.status);
      }

      const data = await response.json();
      console.log('文本发送成功，服务器返回：', data);
    } catch (error) {
      console.error('文本发送失败：', error);
    }
  };

  // 读取本地存储位置，初始化位置状态
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const pos = JSON.parse(saved);
        // 合理性判断，防止异常数据
        if (
          typeof pos.left === 'number' &&
          typeof pos.top === 'number' &&
          pos.left >= 0 &&
          pos.top >= 0
        ) {
          setPosition(pos);
        }
      }
    } catch (e) {
      console.warn('读取保存位置失败', e);
    }
  }, []);

  useEffect(() => {
    const handArea = handAreaRef.current;
    if (!handArea) return;

    // 初始化位置样式
    handArea.style.position = 'fixed';
    handArea.style.left = `${position.left}px`;
    handArea.style.top = `${position.top}px`;
    handArea.style.userSelect = 'none';

    const startDraggingFeedback = (clientX, clientY) => {
      setFeedbackPos({ left: clientX, top: clientY });
      setFeedbackActive(true);

      const touchText = '我摸了摸你胸肌，你该怎么说，我希望你每次回答我不一样的话！';
      sendTextMessage(touchText);
    };
    const updateDraggingFeedback = (clientX, clientY) => {
      setFeedbackPos({ left: clientX, top: clientY });
    };
    const endDraggingFeedback = () => {
      setFeedbackActive(false);
    };

    const savePosition = (left, top) => {
      setPosition({ left, top });
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ left, top }));
      } catch (e) {
        console.warn('保存位置失败', e);
      }
    };

    const onMouseDown = (event) => {
      event.preventDefault();

      dragStartTimeoutRef.current = setTimeout(() => {
        isDraggingRef.current = true;
        setDragging(true);
        handArea.style.cursor = 'grabbing';

        const rect = handArea.getBoundingClientRect();
        offsetXRef.current = event.clientX - rect.left;
        offsetYRef.current = event.clientY - rect.top;

        startDraggingFeedback(event.clientX, event.clientY);
      }, 500);
    };
    const onMouseMove = (event) => {
      if (isDraggingRef.current) {
        let newLeft = event.clientX - offsetXRef.current;
        let newTop = event.clientY - offsetYRef.current;

        const maxLeft = window.innerWidth - handArea.offsetWidth;
        const maxTop = window.innerHeight - handArea.offsetHeight;

        newLeft = Math.min(Math.max(0, newLeft), maxLeft);
        newTop = Math.min(Math.max(0, newTop), maxTop);

        handArea.style.left = `${newLeft}px`;
        handArea.style.top = `${newTop}px`;

        updateDraggingFeedback(event.clientX, event.clientY);
      }
    };
    const onMouseUp = () => {
      clearTimeout(dragStartTimeoutRef.current);
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setDragging(false);
        handArea.style.cursor = 'grab';

        // 保存结束位置
        const rect = handArea.getBoundingClientRect();
        savePosition(rect.left, rect.top);

        endDraggingFeedback();
      }
    };

    const onTouchStart = (event) => {
      if (event.touches.length === 0) return;
      event.preventDefault();

      dragStartTimeoutRef.current = setTimeout(() => {
        isDraggingRef.current = true;
        setDragging(true);
        handArea.style.cursor = 'grabbing';

        const touch = event.touches[0];
        const rect = handArea.getBoundingClientRect();
        offsetXRef.current = touch.clientX - rect.left;
        offsetYRef.current = touch.clientY - rect.top;

        startDraggingFeedback(touch.clientX, touch.clientY);
      }, 500);
    };
    const onTouchMove = (event) => {
      if (isDraggingRef.current && event.touches.length > 0) {
        const touch = event.touches[0];

        let newLeft = touch.clientX - offsetXRef.current;
        let newTop = touch.clientY - offsetYRef.current;

        const maxLeft = window.innerWidth - handArea.offsetWidth;
        const maxTop = window.innerHeight - handArea.offsetHeight;

        newLeft = Math.min(Math.max(0, newLeft), maxLeft);
        newTop = Math.min(Math.max(0, newTop), maxTop);

        handArea.style.left = `${newLeft}px`;
        handArea.style.top = `${newTop}px`;

        updateDraggingFeedback(touch.clientX, touch.clientY);

        event.preventDefault();
      }
    };
    const onTouchEnd = () => {
      clearTimeout(dragStartTimeoutRef.current);
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setDragging(false);
        handArea.style.cursor = 'grab';

        const rect = handArea.getBoundingClientRect();
        savePosition(rect.left, rect.top);

        endDraggingFeedback();
      }
    };

    handArea.style.cursor = 'grab';

    handArea.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    handArea.addEventListener('touchstart', onTouchStart, { passive: false });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);

    return () => {
      handArea.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      handArea.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [position]);

  return (
    <>
      <style>{`
        .hand-area {
          width: 140px;
          height: 80px;
          border-radius: 10px;
          background-color: transparent;
          position: fixed;
          user-select: none;
          touch-action: none;
          z-index: 10001;
          border: 2px solid rgba(255, 0, 0, 0.08);
          transition: border-color 0.3s ease;
        }
        .hand-area.dragging {
          border-color: rgba(255, 0, 0, 0.8);
        }
        .touch-feedback {
          position: fixed;
          pointer-events: none;
          z-index: 10002;
          background: rgba(255, 255, 255, 0.85);
          color: #a00;
          font-weight: bold;
          padding: 6px 12px;
          border-radius: 12px;
          user-select: none;
          transform: translate(-50%, -50%);
          opacity: 0;
          transition: opacity 0.3s ease;
          font-family: Arial, sans-serif;
          white-space: nowrap;
          box-shadow: 0 0 5px rgba(160,0,0,0.6);
        }
        .touch-feedback.active {
          opacity: 1;
        }
      `}</style>

      <div
        className={`hand-area${dragging ? ' dragging' : ''}`}
        ref={handAreaRef}
        tabIndex={0}
        aria-label="可拖动触摸区域"
        role="button"
      />

      <div
        className={`touch-feedback${feedbackActive ? ' active' : ''}`}
        ref={feedbackRef}
        style={{ left: feedbackPos.left, top: feedbackPos.top }}
        aria-live="polite"
      >
        我摸了摸你胸肌，你该怎么说，我希望你每次回答我不一样的话！
      </div>
    </>
  );
}
