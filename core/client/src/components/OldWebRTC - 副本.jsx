// src/components/OldWebRTC.jsx
import React, { useEffect, useRef, useState } from 'react';

export default function OldWebRTC() {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const pcRef = useRef(null);

  const [useStun, setUseStun] = useState(false);
  const [started, setStarted] = useState(false);
  const [zoomWidth, setZoomWidth] = useState(600);

  // 视频初始宽高
  const initialWidth = 600;
  const initialHeight = 450; // 按你代码比例

  // 信令服务器地址（根据你实际后端调整）
  const SIGNALING_URL = '/offer'; // POST 地址

  // 视频缩放比例
  const zoomStep = 50;

  // 创建并协商 WebRTC 连接
  async function negotiate() {
    const pc = pcRef.current;
    if (!pc) return;

    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // 等待 ICE gathering 完成
      await new Promise((resolve) => {
        if (pc.iceGatheringState === 'complete') {
          resolve();
        } else {
          const checkState = () => {
            if (pc.iceGatheringState === 'complete') {
              pc.removeEventListener('icegatheringstatechange', checkState);
              resolve();
            }
          };
          pc.addEventListener('icegatheringstatechange', checkState);
        }
      });

      // 发送本地 SDP offer 到服务器，等待答复 SDP answer
      const response = await fetch(SIGNALING_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sdp: pc.localDescription.sdp,
          type: pc.localDescription.type,
        }),
      });
      const answer = await response.json();

      // 设置远端 SDP
      await pc.setRemoteDescription(answer);

      // 你原来页面有 sessionid 字段，这里不展示，需要的话可以自行扩展
    } catch (e) {
      alert('协商失败: ' + e.message);
    }
  }

  function start() {
    if (started) return;

    const config = { sdpSemantics: 'unified-plan' };
    if (useStun) {
      config.iceServers = [{ urls: ['stun:stun.l.google.com:19302'] }];
    }

    const pc = new RTCPeerConnection(config);
    pcRef.current = pc;

    // 监听远端 track，绑定到 video/audio 标签
    pc.addEventListener('track', (evt) => {
      if (evt.track.kind === 'video') {
        if (videoRef.current) {
          videoRef.current.srcObject = evt.streams[0];
        }
      } else if (evt.track.kind === 'audio') {
        if (audioRef.current) {
          audioRef.current.srcObject = evt.streams[0];
        }
      }
    });

    setStarted(true);

    negotiate();

    // 初始化视频缩放（首次设置）
    setZoomWidth(initialWidth);
  }

  function stop() {
    if (!started) return;

    setStarted(false);

    // 延迟关闭 peer connection 避免卡顿
    setTimeout(() => {
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
    }, 500);

    // 停止视频音频流
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    if (audioRef.current && audioRef.current.srcObject) {
      audioRef.current.srcObject.getTracks().forEach((t) => t.stop());
      audioRef.current.srcObject = null;
    }
  }

  // 缩放视频
  function zoomIn() {
    setZoomWidth((w) => w + zoomStep);
  }
  function zoomOut() {
    setZoomWidth((w) => (w - zoomStep > 0 ? w - zoomStep : w));
  }

  // 文本框输入状态
  const [message, setMessage] = useState('');
  // 图片文件状态
  const [imageFile, setImageFile] = useState(null);

  // 发送文本消息函数，发送到 LLM 服务
  const sendTextMessage = async () => {
    if (!message.trim()) return;

    try {
      const response = await fetch('https://192.168.1.70:6010/qwener', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: message }),
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

  // 发送图片+文本消息函数，发送到多模态服务
  const sendMultiModal = async () => {
    if (!imageFile) return;

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64data = reader.result;

        const payload = {
          text: message.trim(), // 文字
          image: base64data,     // 图片 base64
        };

        const response = await fetch('https://192.168.1.70:6010/multimodal', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error('网络响应失败，状态码: ' + response.status);
        }
        const data = await response.json();
        console.log('多模态发送成功，服务器返回：', data);
        setImageFile(null); // 清空图片
        setMessage(''); // 清空文本
      };
      reader.readAsDataURL(imageFile);
    } catch (error) {
      console.error('多模态发送失败：', error);
    }
  };

  // 表单提交处理
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (imageFile) {
      // 有图片时，文本和图片一起发送到多模态服务
      await sendMultiModal();
    } else {
      // 仅文本时，发送到 LLM 服务
      await sendTextMessage();
      setMessage(''); // 清空文本
    }
  };

  // 选择图片处理
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    setImageFile(file || null);
  };

  // 通用透明背景按钮样式（改成白色文字）
  const transparentBtnStyle = {
    backgroundColor: 'transparent',
    border: '1px solid white',
    color: 'white',
    fontWeight: 'bold',
    padding: '8px 16px',
    cursor: 'pointer',
    borderRadius: 4,
    outline: 'none',
    transition: 'background-color 0.3s, color 0.3s',
    fontSize: 14,
    lineHeight: '1.2',
  };

  // 禁用按钮样式
  const disabledBtnStyle = {
    ...transparentBtnStyle,
    opacity: 0.4,
    cursor: 'not-allowed',
  };

  return (
    <div style={{ maxWidth: 1280 }}>
      <div className="option" style={{ marginBottom: 8 }}>
        <input
          id="use-stun"
          type="checkbox"
          checked={useStun}
          onChange={(e) => setUseStun(e.target.checked)}
          style={{ accentColor: 'white' }}
        />
        <label htmlFor="use-stun" style={{ marginLeft: 4, color: 'white' }}>
          Use STUN server
        </label>
      </div>

      {/* 将 Zoom 按钮放到 Start、Stop 上面 */}
      <div style={{ marginBottom: 8 }}>
        <button onClick={zoomIn} style={{ ...transparentBtnStyle, marginRight: 8 }}>
          Zoom In
        </button>
        <button onClick={zoomOut} style={transparentBtnStyle}>
          Zoom Out
        </button>
      </div>

      <button
        onClick={start}
        disabled={started}
        style={started ? disabledBtnStyle : transparentBtnStyle}
      >
        Start
      </button>
      <button
        onClick={stop}
        disabled={!started}
        style={!started ? disabledBtnStyle : transparentBtnStyle}
      >
        Stop
      </button>

      {/* 视频区域和文本输入表单放在同一个容器内，文本框放在视频底部 */}
      <div id="media" style={{ marginTop: 20 }}>
        <h2 style={{ color: 'white' }}>管家</h2>

        <audio ref={audioRef} autoPlay />
        <video
          ref={videoRef}
          style={{ width: zoomWidth, height: (zoomWidth * initialHeight) / initialWidth, display: 'block' }}
          autoPlay
          playsInline
        />

        {/* 文本发送表单，放在视频下方 */}
        <form
          id="echo-form"
          onSubmit={handleSubmit}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            maxWidth: zoomWidth,
          }}
        >
          <label htmlFor="message" style={{ fontWeight: 'bold', color: '#ccc' }}>
            {/* 可自定义标签内容 */}
          </label>
          <textarea
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            style={{
              width: '100%',
              resize: 'vertical',
              fontSize: 14,
              padding: 8,
              borderRadius: 8,
              border: '1px solid rgba(255, 255, 255, 0.3)',
              backgroundColor: 'rgba(255 255 255 / 0.1)', // 半透明白色
              backdropFilter: 'blur(10px)', // 磨砂玻璃效果
              WebkitBackdropFilter: 'blur(10px)', // Safari 支持
              color: 'white',
              fontFamily: 'inherit',
              outline: 'none',
              transition: 'border-color 0.3s',
            }}
            placeholder="请输入要发送给管家文本..."
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {/* 上传图片按钮 */}
            <label
              htmlFor="image-upload"
              style={{
                ...transparentBtnStyle,
                display: 'inline-flex',
                alignItems: 'center',
                cursor: 'pointer',
                padding: '6px 12px',
                userSelect: 'none',
                fontSize: 14,
                lineHeight: '1.2',
              }}
              title="上传图片"
            >
              上传图片
            </label>
            <input
              id="image-upload"
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleImageChange}
            />

            <button
              type="submit"
              style={{
                ...transparentBtnStyle,
                padding: '6px 16px',
                fontSize: 14,
                lineHeight: '1.2',
              }}
            >
              发送
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
