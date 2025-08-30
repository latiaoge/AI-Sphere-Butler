import React, { useState, useRef, useEffect } from 'react';
import { useRecorder } from '../hooks/useRecorder';

export default function AudioTranscriber() {
  // 录音状态
  const [isRecording, setIsRecording] = useState(false);
  // 转写文本内容
  const [transcription, setTranscription] = useState('');
  // 语言参数，默认 auto
  const [lang, setLang] = useState('auto');
  // 是否开启声纹识别
  const [speakerVerification, setSpeakerVerification] = useState(false);

  // 自定义录音 Hook，管理录音功能
  const recorder = useRecorder();

  // WebSocket 实例引用
  const wsRef = useRef(null);
  // 定时发送音频的定时器引用
  const intervalRef = useRef(null);

  // 拖拽相关引用，仅用于麦克风按钮
  const micButtonRef = useRef(null);
  const isDraggingRef = useRef(false);
  const offsetXRef = useRef(0);
  const offsetYRef = useRef(0);

  // localStorage 保存位置的 key
  const storageKey = 'audioTranscriberMicButtonPosition';

  /**
   * 发送文本消息到 LLM 服务
   * @param {string} text - 要发送的文本
   */
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

  // 组件卸载时清理资源
  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, []);

  /**
   * 启动录音并建立 WebSocket 连接
   */
  function startRecording() {
    if (isRecording) return;

    // 先请求麦克风权限
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(() => {
        // 根据语言和声纹识别参数拼接 WebSocket URL 查询参数
        let params = [];
        if (lang) params.push(`lang=${encodeURIComponent(lang)}`);
        if (speakerVerification) params.push('sv=1'); // 声纹识别参数，勾选时添加
        const queryStr = params.length > 0 ? `?${params.join('&')}` : '';

        // 请根据实际服务器地址修改此处 ws 地址和端口
        const wsUrl = `ws://192.168.168.77:6007/ws/transcribe${queryStr}`;
        const ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer';

        ws.onopen = () => {
          console.log('WebSocket 已连接');

          // 启动录音
          recorder.start().catch((e) => {
            alert('启动录音失败: ' + e.message);
            ws.close();
          });

          // 定时发送音频数据（每 500ms 发送一次）
          intervalRef.current = setInterval(() => {
            if (ws.readyState === 1) {
              const audioBlob = recorder.getAudioBlob();
              if (audioBlob.size > 0) {
                console.log('发送音频数据，大小：', audioBlob.size);
                ws.send(audioBlob);
                recorder.clearBuffer();
              }
            }
          }, 500);
        };

        ws.onmessage = (evt) => {
          try {
            const resJson = JSON.parse(evt.data);
            if (resJson.code === 0) {
              // 收到转写正确结果
              const recognizedText = resJson.data || '无识别结果';

              // 更新转写文本展示
              setTranscription((prev) => (prev ? prev + '\n' + recognizedText : recognizedText));

              // 识别到有效文本时，发送给后端 LLM 服务
              if (recognizedText && recognizedText.trim() && recognizedText !== '无识别结果') {
                sendTextMessage(recognizedText);
              }
            } else {
              // 其他情况输出原始数据
              setTranscription((prev) => (prev ? prev + '\n' + evt.data : evt.data));
            }
          } catch (e) {
            console.error('解析转写消息失败', e);
            setTranscription((prev) => (prev ? prev + '\n' + evt.data : evt.data));
          }
        };

        ws.onclose = () => {
          console.log('WebSocket 已关闭');
          stopRecording();
        };

        ws.onerror = (e) => {
          console.error('WebSocket 错误', e);
        };

        wsRef.current = ws;
        setIsRecording(true);
      })
      .catch((error) => {
        alert('请求麦克风权限失败: ' + error.message);
      });
  }

  /**
   * 停止录音并关闭 WebSocket 连接
   */
  function stopRecording() {
    if (!isRecording) return;

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    recorder.stop();

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    setIsRecording(false);
  }

  // 拖拽事件处理，仅麦克风按钮
  useEffect(() => {
    if (!micButtonRef.current) return;
    const button = micButtonRef.current;

    // 读取并恢复按钮位置
    const savedPosStr = localStorage.getItem(storageKey);
    let left = 26;
    let top = 26;
    if (savedPosStr) {
      try {
        const pos = JSON.parse(savedPosStr);
        if (
          typeof pos.left === 'number' &&
          typeof pos.top === 'number' &&
          pos.left >= 0 &&
          pos.top >= 0
        ) {
          left = pos.left;
          top = pos.top;
        }
      } catch {
        // 解析失败忽略，使用默认
      }
    }

    button.style.position = 'fixed';
    button.style.left = `${left}px`;
    button.style.top = `${top}px`;
    button.style.zIndex = '10000';
    button.style.cursor = 'grab';

    // 拖拽相关变量
    isDraggingRef.current = false;
    offsetXRef.current = 0;
    offsetYRef.current = 0;

    const onMouseDown = (e) => {
      if (e.button !== 0) return; // 仅左键拖拽
      isDraggingRef.current = true;
      offsetXRef.current = e.clientX - button.offsetLeft;
      offsetYRef.current = e.clientY - button.offsetTop;
      button.style.cursor = 'grabbing';
      e.preventDefault();
    };
    const onMouseMove = (e) => {
      if (!isDraggingRef.current) return;
      let newLeft = e.clientX - offsetXRef.current;
      let newTop = e.clientY - offsetYRef.current;

      const maxLeft = window.innerWidth - button.offsetWidth;
      const maxTop = window.innerHeight - button.offsetHeight;
      newLeft = Math.min(Math.max(0, newLeft), maxLeft);
      newTop = Math.min(Math.max(0, newTop), maxTop);

      button.style.left = `${newLeft}px`;
      button.style.top = `${newTop}px`;
    };
    const onMouseUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      button.style.cursor = 'grab';

      // 保存位置
      localStorage.setItem(
        storageKey,
        JSON.stringify({ left: button.offsetLeft, top: button.offsetTop })
      );
    };

    const onTouchStart = (e) => {
      if (e.touches.length === 0) return;
      isDraggingRef.current = true;
      const touch = e.touches[0];
      offsetXRef.current = touch.clientX - button.offsetLeft;
      offsetYRef.current = touch.clientY - button.offsetTop;
      button.style.cursor = 'grabbing';
    };
    const onTouchMove = (e) => {
      if (!isDraggingRef.current || e.touches.length === 0) return;
      const touch = e.touches[0];
      let newLeft = touch.clientX - offsetXRef.current;
      let newTop = touch.clientY - offsetYRef.current;

      const maxLeft = window.innerWidth - button.offsetWidth;
      const maxTop = window.innerHeight - button.offsetHeight;
      newLeft = Math.min(Math.max(0, newLeft), maxLeft);
      newTop = Math.min(Math.max(0, newTop), maxTop);

      button.style.left = `${newLeft}px`;
      button.style.top = `${newTop}px`;

      e.preventDefault();
    };
    const onTouchEnd = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      button.style.cursor = 'grab';

      // 保存位置
      localStorage.setItem(
        storageKey,
        JSON.stringify({ left: button.offsetLeft, top: button.offsetTop })
      );
    };

    button.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    button.addEventListener('touchstart', onTouchStart, { passive: false });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);

    return () => {
      button.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      button.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  return (
    <>
      <style>{`
        /* 麦克风按钮样式 */
        #mic-button-wrapper {
          position: fixed;
          z-index: 10000;
          user-select: none;
          pointer-events: auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          /* 位置由JS直接设置mic-button-wrapper定位 */
        }

        #listening-text {
          font-size: 12px;
          color: rgba(128, 128, 128, 0.7);
          user-select: none;
          pointer-events: none;
          font-weight: 500;
          opacity: 0;
          transition: opacity 0.3s ease;
          height: 16px;
          line-height: 16px;
        }
        #listening-text.visible {
          opacity: 1;
        }

        #mic-button {
          background: none;
          border: none;
          padding: 0;
          outline: none;
          display: flex;
          align-items: center;
          justify-content: center;
          filter: none;
          transition: filter 0.3s ease;

          width: 68px;
          height: 68px;
          cursor: grab;
          /* 不再设置fixed定位，由wrapper定位 */
        }
        #mic-button.recording {
          filter: drop-shadow(0 0 5px red);
        }
        #mic-button img {
          width: 48px;
          height: 48px;
          user-select: none;
          pointer-events: none;
          -webkit-user-drag: none;
        }

        /* 语言和声纹识别区域样式 */
        #controls-container {
          max-width: 700px;
          margin: 20px auto 12px auto;
          font-family: Arial, sans-serif;
          color: white;
          display: flex;
          align-items: center;
          gap: 20px;
          user-select: none;
        }
        #controls-container label {
          font-size: 14px;
          user-select: none;
        }
        #langInput {
          padding: 4px;
          font-size: 14px;
          width: 120px;
          background-color: #333;
          border: 1px solid #666;
          border-radius: 3px;
          color: white;
          user-select: text;
        }
        #speakerVerificationLabel {
          display: flex;
          align-items: center;
          font-size: 14px;
          user-select: none;
        }
        #speakerVerificationLabel input {
          margin-right: 6px;
        }
      `}</style>

      {/* 麦克风及“聆听中”容器，控制整体定位、拖拽 */}
      <div
        id="mic-button-wrapper"
        ref={micButtonRef}
        style={{ left: 26, top: 26, position: 'fixed' }}
      >
        {/* 聆听中提示 */}
        <div id="listening-text" className={isRecording ? 'visible' : ''} aria-live="polite" role="status">
          聆听中...
        </div>

        {/* 麦克风按钮 */}
        <button
          id="mic-button"
          className={isRecording ? 'recording' : ''}
          onClick={() => (isRecording ? stopRecording() : startRecording())}
          aria-label={isRecording ? '停止录音' : '开始录音'}
          title={isRecording ? '点击停止录音' : '点击开始录音'}
          type="button"
        >
          <img
            src="/core/client/ai-butler/image/mic-icon.png"
            alt="麦克风"
            draggable={false}
          />
        </button>
      </div>

      {/* 语言和声纹识别控制 */}
      <div id="controls-container" aria-label="语音识别设置">
        <label htmlFor="langInput">语言：</label>
        <input
          id="langInput"
          type="text"
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          disabled={isRecording}
          placeholder="auto"
          autoComplete="off"
        />

        <label id="speakerVerificationLabel" htmlFor="speakerVerificationCheckbox">
          <input
            id="speakerVerificationCheckbox"
            type="checkbox"
            checked={speakerVerification}
            disabled={isRecording}
            onChange={(e) => setSpeakerVerification(e.target.checked)}
          />
          声纹识别
        </label>
      </div>

      {/* 转写结果展示 */}
      <div
        id="transcriptionResult"
        style={{
          maxWidth: 700,
          margin: '12px auto 20px auto',
          fontFamily: 'Arial, sans-serif',
          whiteSpace: 'pre-wrap',
          backgroundColor: 'transparent',
          padding: 10,
          border: '1px solid transparent',
          borderRadius: 5,
          minHeight: 150,
          fontFamily: 'monospace',
          fontSize: 14,
          overflowY: 'auto',
          maxHeight: 300,
          userSelect: 'text',
          color: transcription ? 'white' : 'rgba(255, 255, 255, 0.5)',
        }}
      >
        {transcription || '识别文字展示区...'}
      </div>
    </>
  );
}
