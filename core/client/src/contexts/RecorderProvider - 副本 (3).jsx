import React, { createContext, useState, useRef, useEffect, useContext } from 'react';
import { useRecorder } from '../hooks/useRecorder';
import { useButler } from '../components/ButlersContext';

const RecorderContext = createContext(null);

export function RecorderProvider({ children }) {
  const { activeButlerId, setActiveButlerId } = useButler();

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

  const [wakeWordEnabled, setWakeWordEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem('wakeWordEnabled');
      return stored === null ? true : stored === 'true';
    } catch {
      return true;
    }
  });
  const [wakeWords, setWakeWords] = useState(() => {
    try {
      const stored = localStorage.getItem('wakeWords');
      return stored ? stored : 'xiao li';
    } catch {
      return 'xiao li';
    }
  });

  const recorder = useRecorder();

  const wsRef = useRef(null);
  const intervalRef = useRef(null);
  const unmountedRef = useRef(false);

  // 新增：后台数字人说话打断关键词列表，检测到任意关键字即触发打断
  // 这里可根据需求增加更多打断词
  const interruptKeywords = ['先说', '你停一下', '等等', '暂停', '打断'];

  // 统一切换管家函数（核心功能）
  const activateButler = async (id) => {
    if (!id) return;
    if (id === activeButlerId) return;

    try {
      const resp = await fetch('http://192.168.168.77:6010/api/switch_avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ butler_id: id }),
      });
      if (!resp.ok) throw new Error('后端错误，状态码: ' + resp.status);
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      setActiveButlerId(id);
      console.log('[activateButler] 成功切换管家:', id);
    } catch (e) {
      alert('切换管家失败: ' + e.message);
      console.error('[activateButler] 切换失败:', e);
    }
  };

  // 新增函数：通知后台停止数字人当前说话（打断功能）
  // 假设后端提供了停止接口，您需要后端配合实现此接口
  const interruptSpeaking = async () => {
    try {
      const resp = await fetch('http://192.168.168.77:6010/api/interrupt_speaking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!resp.ok) {
        console.warn('[interruptSpeaking] 后端停止接口调用失败，状态码:', resp.status);
      } else {
        console.log('[interruptSpeaking] 成功通知后台打断数字人说话');
      }
    } catch (e) {
      console.error('[interruptSpeaking] 调用停止接口异常:', e);
    }
  };

  // 发送文本消息到服务器
  const sendTextMessage = async (text) => {
    if (!text.trim()) return;
    try {
      const response = await fetch('http://192.168.168.77:6010/qwener', {
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

  // 停止录音
  const stopRecording = () => {
    if (!isRecording) {
      console.log('[stopRecording] 当前非录音状态，忽略重复调用');
      return;
    }
    if (wsRef.current) {
      wsRef.current.onclose = null;
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

  // 开始录音
  const startRecording = () => {
    if (isRecording) {
      console.log('[startRecording] 已经在录音中，忽略重复调用');
      return;
    }

    setIsRecording(true);

    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(() => {
        if (unmountedRef.current) {
          stopRecording();
          return;
        }
        let params = [];
        if (lang) params.push(`lang=${encodeURIComponent(lang)}`);
        if (speakerVerification) params.push('sv=1');
        if (wakeWordEnabled) params.push('wakeword=1');
        if (wakeWords) {
          const cleanedWakeWords = wakeWords.split(',').map(w => w.trim()).filter(w => w.length > 0).join(',');
          if (cleanedWakeWords.length > 0) {
            params.push(`wakewords=${encodeURIComponent(cleanedWakeWords)}`);
          }
        }
        const queryStr = params.length > 0 ? `?${params.join('&')}` : '';

        const wsUrl = `ws://192.168.168.77:6007/ws/transcribe${queryStr}`;
        console.log('[startRecording] 创建 WebSocket 连接', wsUrl);
        const ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer';

        ws.onmessage = (evt) => {
          try {
            const resJson = JSON.parse(evt.data);
            if (resJson.code === 0) {
              const recognizedText = resJson.data || '无识别结果';
              console.log('【原始识别文本】', recognizedText);

              const cleanedText = recognizedText.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').trim();
              console.log('【清洗后文本】', cleanedText);

              setTranscription(prev => (prev ? prev + '\n' + recognizedText : recognizedText));

              if (cleanedText) {
                // 先检测是否包含打断关键词，若包含，先中断后台数字人说话并停止当前录音/播放等
                if (interruptKeywords.some(kw => cleanedText.includes(kw))) {
                  console.log('【检测到打断关键词】', cleanedText);
                  // 调用后台打断接口
                  interruptSpeaking();
                  // 也可以停止当前录音，重新开始录音（如果需要）
                  stopRecording();
                  // 这里也可以根据需求决定是否立即开始新一轮录音或其他逻辑
                  // startRecording(); // 若想自动开始新录音，可解开此注释
                }

                // 语音指令切换管家
                if (cleanedText.includes('切换小丽')) {
                  console.log('【匹配成功】切换到小丽');
                  activateButler('xl');
                } else if (cleanedText.includes('切换法师')) {
                  activateButler('cs');
                } else if (cleanedText.includes('小贾')) {
                  activateButler('butler3');
                } else if (cleanedText.includes('星期天')) {
                  activateButler('butler4');
                }

                sendTextMessage(recognizedText);
              }
            }
          } catch (e) {
            console.error('【解析失败】', e);
          }
        };

        ws.onopen = () => {
          console.log('[WebSocket] 连接已打开');
          recorder.start()
            .then(() => {
              console.log('[Recorder] 录音开始');
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

        ws.onclose = (event) => {
          console.log('[WebSocket] 连接关闭，代码:', event.code, '原因:', event.reason);
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

  // 组件卸载清理
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      stopRecording();
    };
  }, []);

  // 持久化设置
  useEffect(() => {
    try { localStorage.setItem('audioTranscriberLang', lang); } catch {}
  }, [lang]);

  useEffect(() => {
    try { localStorage.setItem('audioTranscriberSpeakerVerification', speakerVerification.toString()); } catch {}
  }, [speakerVerification]);

  useEffect(() => {
    try { localStorage.setItem('wakeWordEnabled', wakeWordEnabled.toString()); } catch {}
  }, [wakeWordEnabled]);

  useEffect(() => {
    try { localStorage.setItem('wakeWords', wakeWords); } catch {}
  }, [wakeWords]);

  // 暴露所有状态和方法（关键：包含activateButler）
  return (
    <RecorderContext.Provider value={{
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
      activateButler, // 暴露切换管家函数
      interruptSpeaking, // 暴露打断后台数字人说话函数
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
