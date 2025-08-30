import React, { createContext, useState, useRef, useEffect, useContext } from 'react';
import { useButler } from '../components/ButlersContext';
import { useRecorder } from '../hooks/useRecorder';

const RecorderContext = createContext(null);

// 新增：获取动态服务地址函数，统一读取localStorage中serverUrls配置
function getDynamicUrls() {
  try {
    const serverUrlsStr = localStorage.getItem('serverUrls');
    if (serverUrlsStr) {
      const serverUrls = JSON.parse(serverUrlsStr);
      return {
        switchAvatarUrl: serverUrls.apiBaseUrl ? serverUrls.apiBaseUrl.replace(/\/+$/, '') + '/api/switch_avatar' : 'http://192.168.168.77:6010/api/switch_avatar',
        interruptSpeakingUrl: serverUrls.interruptUrl || 'http://192.168.168.77:6010/api/interrupt_speaking',
        qwenerUrl: serverUrls.qwenerUrl || 'http://192.168.168.77:6010/qwener',
        wsTranscribeBaseUrl: serverUrls.uploadFileUrl ? serverUrls.uploadFileUrl.replace(/\/+$/, '') : 'http://192.168.168.77:6007',
      };
    }
  } catch (e) {
    console.warn('读取serverUrls配置失败，使用默认地址', e);
  }
  return {
    switchAvatarUrl: 'http://192.168.168.77:6010/api/switch_avatar',
    interruptSpeakingUrl: 'http://192.168.168.77:6010/api/interrupt_speaking',
    qwenerUrl: 'http://192.168.168.77:6010/qwener',
    wsTranscribeBaseUrl: 'http://192.168.168.77:6007',
  };
}

export function RecorderProvider({ children }) {
  const { activeButlerId, setActiveButlerId, butlers } = useButler(); // 新增butlers获取所有管家

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

  // ASR面板可见性状态
  const [asrPanelVisible, setAsrPanelVisible] = useState(() => {
    try {
      const stored = localStorage.getItem('asrPanelVisible');
      return stored === null ? false : stored === 'true';
    } catch {
      return false;
    }
  });

  const recorder = useRecorder();

  const wsRef = useRef(null);
  const intervalRef = useRef(null);
  const unmountedRef = useRef(false);

  // 后台数字人说话打断关键词列表
  const interruptKeywords = ['先说', '你停一下', '等等', '暂停', '打断'];

  // 统一切换管家函数（支持名称/ID，因名称与ID一致）
  const activateButler = async (target) => {
    if (!target) return;
    if (target === activeButlerId) {
      console.log('[activateButler] 已激活该管家，无需切换:', target);
      return;
    }

    const { switchAvatarUrl } = getDynamicUrls();

    try {
      // 因名称与ID一致，直接使用target作为ID
      console.log('[activateButler] 尝试切换到管家（名称/ID）:', target);
      const resp = await fetch(switchAvatarUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ butler_id: target }), // 传递名称（即ID）
      });

      if (!resp.ok) throw new Error('后端错误，状态码: ' + resp.status);
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      
      setActiveButlerId(target);
      console.log('[activateButler] 成功切换管家:', target);
    } catch (e) {
      alert('切换管家失败: ' + e.message);
      console.error('[activateButler] 切换失败:', e);
    }
  };

  // 通知后台停止数字人当前说话
  const interruptSpeaking = async () => {
    const { interruptSpeakingUrl } = getDynamicUrls();
    try {
      const resp = await fetch(interruptSpeakingUrl, {
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
    const { qwenerUrl } = getDynamicUrls();
    try {
      const response = await fetch(qwenerUrl, {
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

        const { wsTranscribeBaseUrl } = getDynamicUrls();
        // 注意这里wsTranscribeBaseUrl可能是http://ip:port，无需强制ws:// prefix，保证协议一致
        const wsUrl = wsTranscribeBaseUrl.replace(/^http/, 'ws') + `/ws/transcribe${queryStr}`;
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
                // 检测打断关键词
                if (interruptKeywords.some(kw => cleanedText.includes(kw))) {
                  console.log('【检测到打断关键词】', cleanedText);
                  interruptSpeaking();
                  stopRecording();
                }

                // 语音指令切换管家（支持名称匹配，因名称与ID一致）
                const switchCmdMatch = cleanedText.match(/切换(到)?(.+)/); // 匹配"切换X"或"切换到X"
                if (switchCmdMatch && switchCmdMatch[2]) {
                  const targetName = switchCmdMatch[2].trim(); // 提取要切换的名称
                  console.log('【识别到切换指令】目标名称:', targetName);
                  
                  // 查找是否存在该名称的管家（因名称与ID一致）
                  const targetButler = butlers.find(butler => 
                    butler.name.includes(targetName) || targetName.includes(butler.name)
                  );
                  
                  if (targetButler) {
                    activateButler(targetButler.name); // 直接使用名称（即ID）切换
                  } else {
                    console.log('【未找到对应管家】目标名称:', targetName);
                  }
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

  useEffect(() => {
    try { localStorage.setItem('asrPanelVisible', asrPanelVisible.toString()); } catch {}
  }, [asrPanelVisible]);

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
      activateButler,
      interruptSpeaking,
      asrPanelVisible,
      setAsrPanelVisible
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
