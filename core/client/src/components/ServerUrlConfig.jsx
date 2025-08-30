// ./src/components/ServerUrlConfig.jsx
import React, { useState, useEffect } from 'react';

const ServerUrlConfig = () => {
  const [urls, setUrls] = useState({
    // Home Assistant URL
    homeAssistantUrl: 'http://192.168.168.10:8123',
    
    // ButlerShowcase.jsx 后端 API 基础 URL
    apiBaseUrl: process.env.REACT_APP_BACKEND_URL || 'http://localhost:6010',
    
    // 当前管家中文件上传基础地址 (OldWebRTC.jsx 配置)
    uploadFileUrl: 'http://192.168.168.77:6010',
    
    // 当前管家中LLM文本处理 API 地址
    qwenerUrl: 'https://192.168.168.77:6010/qwener',
    
    // 打断当前语音播放的 API 地址
    interruptUrl: 'http://192.168.168.77:6010/api/interrupt_speaking',

    // TTSPanel.jsx 专用配置项
    ttsChatApiUrl: process.env.REACT_APP_TTS_CHAT_API || 'http://192.168.168.77:6010/say',
    ttsUploadApiUrl: process.env.REACT_APP_TTS_UPLOAD_API || 'http://192.168.168.77:6008/api/uploadSpeaker',

    // 新增 ASR语音识别AudioTranscriber 相关配置项
    audioTranscriberQwenerUrl: 'https://192.168.168.77:9010/qwener',
    audioTranscriberUploadSpeakerUrl: 'http://192.168.168.77:6007/api/uploadSpeaker',

    // Settings.jsx 背景文件上传地址 (如果需要独立配置)
    // uploadBgFileUrl: 'http://192.168.168.77:6010/api/upload_print_file',
  });

  const [status, setStatus] = useState({ message: '', type: '' });

  useEffect(() => {
    const savedUrls = localStorage.getItem('serverUrls');
    if (savedUrls) {
      try {
        const parsedUrls = JSON.parse(savedUrls);
        // 合并默认值（包括环境变量）和已保存值
        setUrls(prevUrls => ({ ...prevUrls, ...parsedUrls }));
      } catch (e) {
        console.error("Failed to parse serverUrls from localStorage", e);
        setStatus({ message: '读取配置失败', type: 'error' });
        setTimeout(() => setStatus({ message: '', type: '' }), 3000);
      }
    }
  }, []);

  const saveConfig = (e) => {
    e.preventDefault();
    try {
      localStorage.setItem('serverUrls', JSON.stringify(urls));
      setStatus({ message: '配置已保存', type: 'success' });

      // 通知其他组件配置已更新
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'serverUrls',
        newValue: JSON.stringify(urls)
      }));

      setTimeout(() => setStatus({ message: '', type: '' }), 3000);
    } catch (e) {
      console.error("Failed to save serverUrls to localStorage", e);
      setStatus({ message: '保存失败', type: 'error' });
      setTimeout(() => setStatus({ message: '', type: '' }), 3000);
    }
  };

  const handleUrlChange = (key, value) => {
    setUrls(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const styles = {
    container: {
      padding: '20px',
      backgroundColor: 'rgba(255, 255, 255, 0.05)',
      borderRadius: '8px',
      marginBottom: '20px',
      color: 'white',
    },
    title: {
      marginBottom: '15px',
      fontSize: '1.2em',
      fontWeight: 'bold',
    },
    formGroup: {
      marginBottom: '15px',
    },
    label: {
      display: 'block',
      marginBottom: '5px',
      fontWeight: 'bold',
    },
    input: {
      width: '100%',
      padding: '8px',
      borderRadius: '4px',
      border: '1px solid #ccc',
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
      color: 'white',
      boxSizing: 'border-box',
    },
    button: {
      padding: '10px 20px',
      backgroundColor: '#1976d2',
      color: 'white',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      fontWeight: 'bold',
    },
    buttonHover: {
      backgroundColor: '#1565c0',
    },
    status: {
      marginTop: '10px',
      padding: '8px',
      borderRadius: '4px',
    },
    statusSuccess: {
      backgroundColor: 'rgba(76, 175, 80, 0.2)',
      border: '1px solid #4CAF50',
      color: '#4CAF50',
    },
    statusError: {
      backgroundColor: 'rgba(244, 67, 54, 0.2)',
      border: '1px solid #F44336',
      color: '#F44336',
    },
    helperText: {
      fontSize: '0.8em',
      color: 'rgba(255, 255, 255, 0.7)',
      marginTop: '4px',
    }
  };

  const statusStyle = status.message
    ? {
        ...styles.status,
        ...(status.type === 'success' ? styles.statusSuccess : styles.statusError),
      }
    : { display: 'none' };

  return (
    <div style={styles.container}>
      <div style={styles.title}>服务地址设置</div>
      <form onSubmit={saveConfig}>
        {/* Home Assistant 地址 */}
        <div style={styles.formGroup}>
          <label style={styles.label}>Home Assistant 地址:</label>
          <input
            type="text"
            value={urls.homeAssistantUrl}
            onChange={(e) => handleUrlChange('homeAssistantUrl', e.target.value)}
            placeholder="http://192.168.168.10:8123"
            style={styles.input}
          />
        </div>

        {/* ButlerShowcase.jsx 后端 API 基础 URL */}
        <div style={styles.formGroup}>
          <label style={styles.label}>管家后端 API 地址:</label>
          <input
            type="text"
            value={urls.apiBaseUrl}
            onChange={(e) => handleUrlChange('apiBaseUrl', e.target.value)}
            placeholder={process.env.REACT_APP_BACKEND_URL || "http://localhost:6010"}
            style={styles.input}
          />
          <div style={styles.helperText}>
            用于管家形象管理、切换等 API 接口的基础 URL。
          </div>
        </div>

        {/* --- 当前管家中OldWebRTC.jsx 配置项开始 --- */}

        {/* 文件上传基础地址 */}
        <div style={styles.formGroup}>
          <label style={styles.label}>当前管家中 文件上传基础地址:</label>
          <input
            type="text"
            value={urls.uploadFileUrl}
            onChange={(e) => handleUrlChange('uploadFileUrl', e.target.value)}
            placeholder="http://192.168.168.77:6010"
            style={styles.input}
          />
          <div style={styles.helperText}>
            用于 当前管家中 组件（如聊天文件上传）的基础服务器地址。完整路径将由组件内部拼接（例如 /api/upload_print_file）。
          </div>
        </div>

        {/*  WebRTC Qwen API 地址 */}
        <div style={styles.formGroup}>
          <label style={styles.label}>当前管家中LLM文本处理 API 地址:</label>
          <input
            type="text"
            value={urls.qwenerUrl}
            onChange={(e) => handleUrlChange('qwenerUrl', e.target.value)}
            placeholder="https://192.168.168.77:6010/qwener"
            style={styles.input}
          />
          <div style={styles.helperText}>
            用于当前管家中 组件中发送文本消息给 LLM 进行处理的 API 端点。
          </div>
        </div>

        {/* 打断说话 API 地址 */}
        <div style={styles.formGroup}>
          <label style={styles.label}>打断语音播放 API 地址:</label>
          <input
            type="text"
            value={urls.interruptUrl}
            onChange={(e) => handleUrlChange('interruptUrl', e.target.value)}
            placeholder="http://192.168.168.77:6010/api/interrupt_speaking"
            style={styles.input}
          />
          <div style={styles.helperText}>
            用于 WebRTC 组件中发送请求以打断当前正在进行的语音播放。
          </div>
        </div>

        {/* --- OldWebRTC.jsx 配置项结束 --- */}

        {/* --- TTSPanel.jsx 配置项开始 --- */}

        {/* TTS 语音合成文本合成 API 地址 */}
        <div style={styles.formGroup}>
          <label style={styles.label}>TTS 语音合成文本合成 API 地址:</label>
          <input
            type="text"
            value={urls.ttsChatApiUrl}
            onChange={(e) => handleUrlChange('ttsChatApiUrl', e.target.value)}
            placeholder={process.env.REACT_APP_TTS_CHAT_API || "http://192.168.168.77:6010/say"}
            style={styles.input}
          />
          <div style={styles.helperText}>
            用于 TTS 语音合成面板发送文本进行语音合成的 API 端点。
          </div>
        </div>

        {/* TTS 语音合成 音色克隆上传 API 地址 */}
        <div style={styles.formGroup}>
          <label style={styles.label}>TTS语音合成 音色克隆上传 API 地址:</label>
          <input
            type="text"
            value={urls.ttsUploadApiUrl}
            onChange={(e) => handleUrlChange('ttsUploadApiUrl', e.target.value)}
            placeholder={process.env.REACT_APP_TTS_UPLOAD_API || "http://192.168.168.77:6008/api/uploadSpeaker"}
            style={styles.input}
          />
          <div style={styles.helperText}>
            用于 TTS语音合成 面板上传参考音频以克隆音色的 API 端点。
          </div>
        </div>

        {/* --- TTSPanel.jsx 配置项结束 --- */}

        {/* 新增 ASR语音识别AudioTranscriber 相关配置项 */}
        <div style={styles.formGroup}>
          <label style={styles.label}>ASR语音识别 LLM URL:</label>
          <input
            type="text"
            value={urls.audioTranscriberQwenerUrl || ''}
            onChange={(e) => handleUrlChange('audioTranscriberQwenerUrl', e.target.value)}
            placeholder="https://192.168.168.77:9010/qwener"
            style={styles.input}
          />
          <div style={styles.helperText}>
          ASR语音识别 组件用来发送文本消息的 LLM API 端点。
          </div>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>ASR语音识别 上传声纹 API URL:</label>
          <input
            type="text"
            value={urls.audioTranscriberUploadSpeakerUrl || ''}
            onChange={(e) => handleUrlChange('audioTranscriberUploadSpeakerUrl', e.target.value)}
            placeholder="http://192.168.168.77:6007/api/uploadSpeaker"
            style={styles.input}
          />
          <div style={styles.helperText}>
            ASR语音识别 组件上传声纹音频的服务器端点地址。
          </div>
        </div>

        {/* Settings.jsx 背景文件上传地址 (如果需要独立配置) */}
        {/* 
        <div style={styles.formGroup}>
          <label style={styles.label}>背景文件上传地址:</label>
          <input
            type="text"
            value={urls.uploadBgFileUrl || urls.uploadFileUrl} // Fallback to uploadFileUrl if not set
            onChange={(e) => handleUrlChange('uploadBgFileUrl', e.target.value)}
            placeholder={urls.uploadFileUrl || "http://192.168.168.77:6010/api/upload_print_file"}
            style={styles.input}
          />
          <div style={styles.helperText}>
            用于设置页面上传背景图片/视频的服务器端点。(如果未单独配置，则使用 WebRTC 文件上传基础地址)
          </div>
        </div>
        */}

        <button
          type="submit"
          style={styles.button}
          onMouseEnter={(e) => e.target.style.backgroundColor = styles.buttonHover.backgroundColor}
          onMouseLeave={(e) => e.target.style.backgroundColor = styles.button.backgroundColor}
        >
          保存配置
        </button>
      </form>

      <div style={statusStyle}>
        {status.message}
      </div>
    </div>
  );
};

export default ServerUrlConfig;
