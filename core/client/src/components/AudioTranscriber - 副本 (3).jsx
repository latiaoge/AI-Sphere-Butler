import React, { useState, useRef, useEffect } from 'react';
import { useRecorderContext } from '../contexts/RecorderProvider'; // 注意路径根据实际调整

export default function AudioTranscriber() {
  // 从全局录音上下文中取状态和操作
  const {
    isRecording,
    transcription,
    lang,
    speakerVerification,
    wakeWordEnabled,
    wakeWords,
    setLang,
    setSpeakerVerification,
    setWakeWordEnabled,
    setWakeWords,
    startRecording,
    stopRecording,
    setTranscription,
    // 新增：获取全局ASR面板可见性状态及更新方法
    asrPanelVisible,
    setAsrPanelVisible
  } = useRecorderContext();

  // 新增：面板显示/隐藏状态管理
  const [panelVisible, setPanelVisible] = useState(asrPanelVisible); // 初始值从全局状态获取
  const doubleClickTimerRef = useRef(null);
  const panelStateKey = 'audioTranscriberPanelVisible';

  // 拖拽相关引用
  const micButtonRef = useRef(null);
  const isDraggingRef = useRef(false);
  const offsetXRef = useRef(0);
  const offsetYRef = useRef(0);

  // localStorage 保存位置的 key
  const storageKey = 'audioTranscriberMicButtonPosition';

  // 新增声纹识别录音状态和上传状态（保持本组件私有状态）
  const [isSpeakerRecording, setIsSpeakerRecording] = useState(false);
  const [speakerUploadStatus, setSpeakerUploadStatus] = useState('');
  const speakerRecorderRef = useRef(null);
  const speakerAudioChunksRef = useRef([]);

  // 发送文本消息到 LLM 服务
  const sendTextMessage = async (text) => {
    if (!text.trim()) return;

    try {
      const response = await fetch('https://192.168.168.77:9010/qwener', {
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
      stopSpeakerRecording();
      if (doubleClickTimerRef.current) {
        clearTimeout(doubleClickTimerRef.current);
      }
    };
  }, []);

  // 监听语言和声纹识别开关的变化，保存状态到 localStorage，确保切换页时记忆选择
  useEffect(() => {
    try {
      localStorage.setItem('audioTranscriberLang', lang);
    } catch {}
  }, [lang]);

  useEffect(() => {
    try {
      localStorage.setItem('audioTranscriberSpeakerVerification', speakerVerification.toString());
    } catch {}
  }, [speakerVerification]);

  // 监听语音唤醒开关和唤醒词变化，保存到 localStorage
  useEffect(() => {
    try {
      localStorage.setItem('wakeWordEnabled', wakeWordEnabled.toString());
    } catch {}
  }, [wakeWordEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem('wakeWords', wakeWords);
    } catch {}
  }, [wakeWords]);

  // 新增：加载面板显示状态（改为从localStorage加载，同时同步到全局状态）
  useEffect(() => {
    try {
      const savedState = localStorage.getItem(panelStateKey);
      if (savedState !== null) {
        const parsedState = JSON.parse(savedState);
        setPanelVisible(parsedState);
        // 同步到全局状态
        setAsrPanelVisible(parsedState);
      }
    } catch (e) {
      console.warn('加载面板状态失败:', e);
    }
  }, []);

  // 新增：保存面板显示状态到localStorage，并同步到全局状态
  useEffect(() => {
    try {
      localStorage.setItem(panelStateKey, JSON.stringify(panelVisible));
      // 同步到全局状态
      setAsrPanelVisible(panelVisible);
    } catch (e) {
      console.warn('保存面板状态失败:', e);
    }
  }, [panelVisible, setAsrPanelVisible]);

  // 监听全局状态变化，保持与局部状态同步（处理多实例或其他组件修改全局状态的情况）
  useEffect(() => {
    if (panelVisible !== asrPanelVisible) {
      setPanelVisible(asrPanelVisible);
    }
  }, [asrPanelVisible]);

  // 录制声纹相关函数
  function startSpeakerRecording() {
    if (isSpeakerRecording) return;

    setSpeakerUploadStatus('请求麦克风权限...');
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => {
        setSpeakerUploadStatus('开始录音2秒...');
        speakerAudioChunksRef.current = [];
        const options = { mimeType: 'audio/wav' };
        let mediaRecorder;
        try {
          mediaRecorder = new MediaRecorder(stream, options);
        } catch (e) {
          mediaRecorder = new MediaRecorder(stream);
        }
        speakerRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            speakerAudioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          setSpeakerUploadStatus('录音结束，准备上传...');
          const blob = new Blob(speakerAudioChunksRef.current, { type: 'audio/wav' });

          try {
            const formData = new FormData();
            formData.append('file', blob, 'speaker.wav');

            const uploadUrl = 'http://192.168.168.77:6007/api/uploadSpeaker';

            const res = await fetch(uploadUrl, {
              method: 'POST',
              body: formData,
            });

            if (!res.ok) {
              throw new Error(`上传失败，状态码: ${res.status}`);
            }
            const result = await res.json();
            setSpeakerUploadStatus('上传成功');
            console.log('上传成功，服务器返回：', result);
          } catch (err) {
            setSpeakerUploadStatus('上传失败: ' + err.message);
            console.error('上传失败', err);
          }
          stream.getTracks().forEach(track => track.stop());
          setTimeout(() => setSpeakerUploadStatus(''), 3000);
          setIsSpeakerRecording(false);
        };

        mediaRecorder.start();

        setIsSpeakerRecording(true);

        setTimeout(() => {
          if (speakerRecorderRef.current && speakerRecorderRef.current.state !== 'inactive') {
            speakerRecorderRef.current.stop();
          }
        }, 2000);
      })
      .catch((err) => {
        setSpeakerUploadStatus('获取麦克风权限失败: ' + err.message);
        console.error('获取麦克风权限失败', err);
      });
  }

  function stopSpeakerRecording() {
    if (speakerRecorderRef.current && speakerRecorderRef.current.state !== 'inactive') {
      speakerRecorderRef.current.stop();
      setIsSpeakerRecording(false);
    }
  }

  // 拖拽事件处理
  useEffect(() => {
    if (!micButtonRef.current) return;
    const button = micButtonRef.current;

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
      } catch {}
    }

    button.style.position = 'fixed';
    button.style.left = `${left}px`;
    button.style.top = `${top}px`;
    button.style.zIndex = '10000';
    button.style.cursor = 'grab';

    isDraggingRef.current = false;
    offsetXRef.current = 0;
    offsetYRef.current = 0;

    const onMouseDown = (e) => {
      if (e.button !== 0) return;
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

  // 波纹动画相关
  const [ripples, setRipples] = useState([]);
  const rippleCountRef = useRef(0);
  const speakerButtonRef = useRef(null);

  // 录制声纹按钮点击函数封装，附加波纹效果
  const handleSpeakerRecordClick = (event) => {
    if (isRecording || isSpeakerRecording) return;

    createRipple(event);
    startSpeakerRecording();
  };

  // 创建波纹，添加到ripples数组
  const createRipple = (event) => {
    if (!speakerButtonRef.current) return;

    const rect = speakerButtonRef.current.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = event.clientX - rect.left - size / 2;
    const y = event.clientY - rect.top - size / 2;

    const newRipple = {
      key: rippleCountRef.current,
      size,
      x,
      y,
    };
    rippleCountRef.current += 1;

    setRipples((oldRipples) => [...oldRipples, newRipple]);

    setTimeout(() => {
      setRipples((oldRipples) => oldRipples.filter(r => r.key !== newRipple.key));
    }, 1000);
  };

  // 新增：处理双击事件（区分单击和双击）
  function handleMicClick() {
    if (doubleClickTimerRef.current) {
      // 双击事件：切换面板显示状态
      clearTimeout(doubleClickTimerRef.current);
      doubleClickTimerRef.current = null;
      setPanelVisible(!panelVisible);
    } else {
      // 单击事件：处理录音
      doubleClickTimerRef.current = setTimeout(function() {
        if (isRecording) {
          stopRecording();
        } else {
          startRecording();
        }
        doubleClickTimerRef.current = null;
      }, 300); // 300ms内连续点击视为双击
    }
  }

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
          flex-wrap: wrap;
        }
        #controls-container label {
          font-size: 14px;
          user-select: none;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        #langInput, #wakeWordsInput {
          padding: 6px;
          font-size: 12px;
          width: 140px;
          background-color: #333;
          border: 1px solid #666;
          border-radius: 3px;
          color: white;
          user-select: text;
        }
        #speakerVerificationLabel {
          font-size: 14px;
        }
        #wakeWordToggleLabel {
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        /* 纯 CSS 玻璃态录制声纹按钮 */
        #speaker-record-button {
          position: relative;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.3);
          color: white;
          padding: 3px 10px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          user-select: none;
          box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(12px);
          WebkitBackdropFilter: 'blur(10px)',
          transition: all 0.3s ease;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          outline: none;
          border-image: none;
        }
        #speaker-record-button:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.2);
          box-shadow: 0 8px 40px rgba(255, 255, 255, 0.3);
          transform: scale(1.05);
          filter: brightness(1.1);
        }
        #speaker-record-button:disabled {
          opacity: 0.4;
          cursor: not-allowed;
          box-shadow: none;
          background: rgba(255, 255, 255, 0.05);
          filter: none;
          transform: none;
        }

        /* 额外光泽层 */
        #speaker-record-button::before {
          content: '';
          position: absolute;
          top: -100%;
          left: -100%;
          width: 100%;
          height: 100%;
          background: radial-gradient(circle at 10% 10%, rgba(255, 255, 255, 0.3), transparent 10%);
          pointer-events: none;
          filter: blur(10px);
          opacity: 0.6;
          transition: opacity 0.3s ease;
          border-radius: inherit;
          z-index: 0;
        }

        /* 保留波纹效果的样式 */
        .ripple {
          position: absolute;
          border-radius: 150%;
          background: rgba(91, 155, 255, 0.7);
          animation: rippleEffect 1s ease-out;
          pointer-events: none;
          transform: scale(0);
          opacity: 0.75;
          z-index: 1;
        }

        @keyframes rippleEffect {
          to {
            transform: scale(4);
            opacity: 0;
          }
        }

        /* 新增：面板显示/隐藏控制 */
        #audio-panel-content {
          transition: all 0.3s ease;
        }
        #audio-panel-content.hidden {
          display: none;
        }
      `}</style>

      {/* 麦克风及“聆听中”容器，控制整体定位、拖拽 */}
      <div
        id="mic-button-wrapper"
        ref={micButtonRef}
        style={{ left: 26, top: 26, position: 'fixed' }}
      >
        <div id="listening-text" className={isRecording ? 'visible' : ''} aria-live="polite" role="status">
          聆听中...
        </div>

        <button
          id="mic-button"
          className={isRecording ? 'recording' : ''}
          onClick={handleMicClick}
          onDoubleClick={(e) => e.preventDefault()}
          aria-label={isRecording ? '停止录音' : '开始录音'}
          title={isRecording ? '点击停止录音，双击切换面板' : '点击开始录音，双击切换面板'}
          type="button"
          disabled={isSpeakerRecording}
        >
          <img
            src="/core/client/ai-butler/image/mic-icon.png"
            alt="麦克风"
            draggable={false}
          />
        </button>
      </div>

      {/* 新增：面板内容容器（控制显示/隐藏） */}
      <div id="audio-panel-content" className={panelVisible ? '' : 'hidden'}>
        {/* 语言、声纹识别及语音唤醒控制区域 */}
        <div id="controls-container" aria-label="语音识别设置">

          <label htmlFor="langInput">语言：</label>
          <input
            id="langInput"
            type="text"
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            disabled={isRecording || isSpeakerRecording}
            placeholder="auto"
            autoComplete="off"
          />

          <label id="speakerVerificationLabel" htmlFor="speakerVerificationCheckbox">
            <input
              id="speakerVerificationCheckbox"
              type="checkbox"
              checked={speakerVerification}
              disabled={isRecording || isSpeakerRecording}
              onChange={(e) => setSpeakerVerification(e.target.checked)}
            />
            声纹识别
          </label>

          {/* 语音唤醒开关 */}
          <label id="wakeWordToggleLabel" htmlFor="wakeWordToggleCheckbox">
            <input
              id="wakeWordToggleCheckbox"
              type="checkbox"
              checked={wakeWordEnabled}
              disabled={isRecording || isSpeakerRecording}
              onChange={(e) => setWakeWordEnabled(e.target.checked)}
            />
            语音唤醒
          </label>

          {/* 唤醒词输入框 */}
          <label htmlFor="wakeWordsInput" style={{ flexGrow: 1 }}>
            唤醒词（拼音，多个用逗号分隔）：
            <input
              id="wakeWordsInput"
              type="text"
              value={wakeWords}
              onChange={(e) => setWakeWords(e.target.value)}
              disabled={isRecording || isSpeakerRecording || !wakeWordEnabled}
              placeholder="如：zhan qi lai, ni hao xiao qian"
              autoComplete="off"
              style={{ marginLeft: 8 }}
            />
          </label>

          {/* 纯 CSS 玻璃态录制声纹按钮 */}
          <button
            id="speaker-record-button"
            ref={speakerButtonRef}
            onClick={handleSpeakerRecordClick}
            disabled={isRecording || isSpeakerRecording}
            type="button"
            aria-live="polite"
            aria-label="录制声纹"
            title="录制约2秒声音用于声纹识别，录制完成自动上传"
          >
            录制声纹 (2秒)
            {ripples.map(({ key, size, x, y }) => (
              <span
                key={key}
                className="ripple"
                style={{
                  width: size,
                  height: size,
                  top: y,
                  left: x,
                }}
              />
            ))}
          </button>
        </div>

        {/* 声纹上传状态显示 */}
        {speakerUploadStatus && (
          <div
            id="speaker-record-status"
            role="alert"
            aria-live="polite"
            aria-atomic="true"
            style={{ maxWidth: 700, margin: '4px auto 0 auto' }}
          >
            {speakerUploadStatus}
          </div>
        )}

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
      </div>
    </>
  );
}