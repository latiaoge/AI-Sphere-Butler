// D:\XM\AI-Sphere-Butler\core\client\src\components\TTSPanel.jsx
import React, { useState, useRef } from 'react';

export default function TTSPanel() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const [chatText, setChatText] = useState('');
  const [chatResponse, setChatResponse] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const fileInputRef = useRef(null);

  // *** 修改开始：定义一个函数来获取动态配置的 URLs ***
  const getDynamicUrls = () => {
    let serverUrls = {};
    try {
      const savedUrls = localStorage.getItem('serverUrls');
      if (savedUrls) {
        serverUrls = JSON.parse(savedUrls);
      }
    } catch (e) {
      console.error("TTSPanel: Failed to parse serverUrls from localStorage", e);
    }
    // 优先使用配置项，如果没有则 fallback 到环境变量或默认值
    // 注意：这里假设 ServerUrlConfig.jsx 中配置项的键名是 ttsChatApiUrl 和 ttsUploadApiUrl
    // 如果键名不同，请相应调整
    const ttsChatApiUrl = serverUrls.ttsChatApiUrl || process.env.REACT_APP_TTS_CHAT_API || 'http://192.168.168.77:6010/say';
    const ttsUploadApiUrl = serverUrls.ttsUploadApiUrl || process.env.REACT_APP_TTS_UPLOAD_API || 'http://192.168.168.77:6008/api/uploadSpeaker';

    return {
      chatApi: ttsChatApiUrl,
      uploadApi: ttsUploadApiUrl
    };
  };
  // *** 修改结束 ***

  const baseButtonStyle = {
    borderRadius: '8px',
    border: '2px solid rgba(255,255,255,0.6)',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
    padding: '8px 16px',
    cursor: 'pointer',
    userSelect: 'none',
    outline: 'none',
    transition: 'none', // 关闭所有动画效果，保持静态
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    boxShadow: '0 4px 20px rgba(255, 255, 255, 0.4)',
  };

  const disabledButtonStyle = {
    ...baseButtonStyle,
    color: 'rgba(255,255,255,0.4)',
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(255,255,255,0.1)',
    boxShadow: 'none',
    cursor: 'not-allowed',
    opacity: 0.5,
  };

  const handleFileChange = (e) => {
    setSelectedFile(e.target.files[0]);
    setUploadMessage('');
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setUploadMessage('请选择一个音频文件');
      return;
    }
    setUploading(true);
    setUploadMessage('');

    // *** 修改：动态获取 Upload API URL ***
    const { uploadApi } = getDynamicUrls();

    try {
      // const uploadApi = process.env.REACT_APP_TTS_UPLOAD_API || 'http://192.168.168.77:6008/api/uploadSpeaker';
      const formData = new FormData();
      formData.append('file', selectedFile);

      const resp = await fetch(uploadApi, { // 使用动态 URL
        method: 'POST',
        body: formData,
      });

      if (!resp.ok) {
        throw new Error(`上传失败，状态码: ${resp.status}`);
      }

      const data = await resp.json();
      setUploadMessage(data.message || '上传成功，服务器已接收音频');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = null;
    } catch (e) {
      setUploadMessage(`上传失败: ${e.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleSendChat = async () => {
    if (!chatText.trim()) return;
    setChatLoading(true);
    setChatResponse('');

    // *** 修改：动态获取 Chat API URL ***
    const { chatApi } = getDynamicUrls();

    try {
      // const chatApi = process.env.REACT_APP_TTS_CHAT_API || 'http://192.168.168.77:6010/say';
      const resp = await fetch(chatApi, { // 使用动态 URL
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: chatText.trim() }),
      });
      if (!resp.ok) {
        throw new Error(`请求失败，状态码: ${resp.status}`);
      }
      const data = await resp.json();
      setChatResponse(data.message || '已发送到合成服务');
      setChatText('');
    } catch (e) {
      setChatResponse(`发送失败: ${e.message}`);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontSize: 12, color: 'white' }}>
        <section style={{ marginBottom: 20 }}>
          <h3>上传克隆参考音频（WAV格式）</h3>

          <label
            tabIndex={0}
            htmlFor="file-upload"
            className="glass-button"
            style={{
              display: 'inline-block',
              marginBottom: 11,
              userSelect: 'none',
              width: 'fit-content',
              opacity: uploading ? 0.5 : 1,
              cursor: uploading ? 'not-allowed' : 'pointer',
              ...baseButtonStyle,
            }}
          >
            选择文件
          </label>
          <input
            id="file-upload"
            type="file"
            accept="audio/*"
            onChange={handleFileChange}
            ref={fileInputRef}
            style={{ display: 'none' }}
            disabled={uploading}
          />

          <div>
            <button
              type="button"
              className="glass-button"
              onClick={handleUpload}
              disabled={uploading || !selectedFile}
              style={uploading || !selectedFile ? disabledButtonStyle : baseButtonStyle}
              tabIndex={0}
            >
              {uploading ? '上传中...' : '上传音频'}
            </button>
          </div>

          {uploadMessage && (
            <div
              style={{
                marginTop: 8,
                color: uploadMessage.startsWith('上传成功') ? '#ccffcc' : '#ffcccc',
                whiteSpace: 'pre-wrap',
                userSelect: 'text',
              }}
            >
              {uploadMessage}
            </div>
          )}
        </section>

        <section style={{ flexGrow: 1 }}>
          <h3>文本复读合成</h3>
          <textarea
            value={chatText}
            onChange={(e) => setChatText(e.target.value)}
            placeholder="输入要管家复读的文本，发送后将合成语音"
            rows={4}
            style={{
              width: '100%',
              resize: 'vertical',
              padding: 8,
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.3)',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              color: 'white',
              marginBottom: 8,
              fontSize: 14,
              fontFamily: 'inherit',
              outline: 'none',
              userSelect: 'text',
              boxShadow: '0 0 5px rgba(255,255,255,0.5)',
            }}
            disabled={chatLoading}
          />

          <button
            type="button"
            className="glass-button"
            onClick={handleSendChat}
            disabled={chatLoading || !chatText.trim()}
            style={chatLoading || !chatText.trim() ? disabledButtonStyle : baseButtonStyle}
            tabIndex={0}
          >
            {chatLoading ? '发送中...' : '发送文本'}
          </button>

          {chatResponse && (
            <div
              style={{
                marginTop: 8,
                color: chatResponse.startsWith('发送失败') ? '#ffcccc' : '#ccffcc',
                whiteSpace: 'pre-wrap',
                userSelect: 'text',
              }}
            >
              {chatResponse}
            </div>
          )}
        </section>
      </div>
    </>
  );
}