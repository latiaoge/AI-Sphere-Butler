import React, { createContext, useState, useRef, useEffect, useContext } from 'react';
import { useRecorder } from '../hooks/useRecorder';

const RecorderContext = createContext(null);

export function RecorderProvider({ children }) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [lang, setLang] = useState(() => {
    try {
      return localStorage.getItem('audioTranscriberLang') || 'auto';
    } catch {
      return 'auto';
    }
  });
  const [speakerVerification, setSpeakerVerification] = useState(() => {
    try {
      return localStorage.getItem('audioTranscriberSpeakerVerification') === 'true';
    } catch {
      return false;
    }
  });

  const recorder = useRecorder();

  const wsRef = useRef(null);
  const intervalRef = useRef(null);
  const unmountedRef = useRef(false);

  const sendTextMessage = async (text) => {
    if (!text.trim()) return;
    try {
      const response = await fetch('https://192.168.1.70:6010/qwener', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) throw new Error('网络响应失败，状态码: ' + response.status);
      const data = await response.json();
      console.log('文本发送成功，服务器返回：', data);
    } catch (error) {
      console.error('文本发送失败：', error);
    }
  };

  const stopRecording = () => {
    if (!isRecording) {
      console.log('[stopRecording] 当前非录音状态，忽略重复调用');
      return;
    }
    console.trace('[stopRecording] 停止录音流程启动，调用栈');
    if (wsRef.current) {
      console.log('[stopRecording] 关闭 WebSocket 连接');
      wsRef.current.onclose = null; // 避免触发 onclose 回调死循环
      wsRef.current.close();
      wsRef.current = null;
    }
    recorder.stop();
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRecording(false);
  };

  const startRecording = () => {
    if (isRecording) {
      console.log('[startRecording] 已经在录音中，忽略重复调用');
      return;
    }

    setIsRecording(true); // 先置为true，防止重复调用

    console.log('[startRecording] 请求麦克风权限...');
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(() => {
        if (unmountedRef.current) {
          stopRecording();
          return;
        }
        let params = [];
        if (lang) params.push(`lang=${encodeURIComponent(lang)}`);
        if (speakerVerification) params.push('sv=1');
        const queryStr = params.length > 0 ? `?${params.join('&')}` : '';

        const wsUrl = `ws://192.168.168.77:6007/ws/transcribe${queryStr}`;
        console.log('[startRecording] 创建 WebSocket 连接', wsUrl);
        const ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer';

        ws.onopen = () => {
          console.log('[WebSocket] 连接已打开');
          recorder.start()
            .then(() => {
              console.log('[Recorder] 录音开始');
              // isRecording 之前已设置true，无需重复set
              intervalRef.current = setInterval(() => {
                if (ws.readyState === 1) {
                  const audioBlob = recorder.getAudioBlob();
                  if (audioBlob.size > 0) {
                    console.log('[WebSocket] 发送音频数据，大小：', audioBlob.size);
                    ws.send(audioBlob);
                    recorder.clearBuffer();
                  }
                }
              }, 500);
            })
            .catch(e => {
              alert('启动录音失败: ' + e.message);
              console.error('[Recorder] 启动失败', e);
              ws.close();
              setIsRecording(false);
            });
        };

        ws.onmessage = evt => {
          try {
            const resJson = JSON.parse(evt.data);
            if (resJson.code === 0) {
              const recognizedText = resJson.data || '无识别结果';
              setTranscription(prev => (prev ? prev + '\n' + recognizedText : recognizedText));
              if (recognizedText && recognizedText.trim() && recognizedText !== '无识别结果') {
                sendTextMessage(recognizedText);
              }
            } else {
              console.warn('[WebSocket] 返回非0 code:', resJson);
            }
          } catch (e) {
            console.error('[WebSocket] 解析转写消息失败', e);
            setTranscription(prev => (prev ? prev + '\n' + evt.data : evt.data));
          }
        };

        ws.onclose = (event) => {
          console.log('[WebSocket] 连接关闭，代码:', event.code, '原因:', event.reason);
          // 不再调用 stopRecording，防止死循环
          setIsRecording(false);
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          wsRef.current = null;
        };

        ws.onerror = (e) => {
          console.error('[WebSocket] 错误', e);
          alert('WebSocket 连接出错，请检查服务器状态和网络连接。');
        };

        wsRef.current = ws;
      })
      .catch(error => {
        alert('请求麦克风权限失败: ' + error.message);
        console.error('[startRecording] 获取麦克风权限失败', error);
        setIsRecording(false);
      });
  };

  useEffect(() => {
    try { localStorage.setItem('audioTranscriberLang', lang); } catch {}
  }, [lang]);

  useEffect(() => {
    try { localStorage.setItem('audioTranscriberSpeakerVerification', speakerVerification.toString()); } catch {}
  }, [speakerVerification]);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      stopRecording();
    };
  }, []);

  return (
    <RecorderContext.Provider value={{
      isRecording,
      transcription,
      lang,
      speakerVerification,
      setLang,
      setSpeakerVerification,
      startRecording,
      stopRecording,
      setTranscription,
    }}>
      {children}
    </RecorderContext.Provider>
  );
}

export function useRecorderContext() {
  const context = useContext(RecorderContext);
  if (!context) {
    throw new Error('useRecorderContext 必须在 RecorderProvider 内使用');
  }
  return context;
}
