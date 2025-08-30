// src/components/OldWebRTC.jsx
import React, { useEffect, useRef, useState } from 'react';

export default function OldWebRTC() {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const pcRef = useRef(null);

  const containerRef = useRef(null); // 父容器引用，用于范围限制

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

  // 维护聊天框位置状态，默认位置距父容器左上角20px,20px
  const [chatPos, setChatPos] = useState(() => {
    try {
      const saved = localStorage.getItem('chatbox-position');
      if (saved) {
        const pos = JSON.parse(saved);
        if (
          typeof pos.left === 'number' &&
          typeof pos.top === 'number'
        ) {
          return pos;
        }
      }
    } catch {}
    return { left: 20, top: 20 };
  });

  // 拖拽相关状态
  const draggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  // 拖拽事件处理
  function onDragStart(e) {
    draggingRef.current = true;
    const targetRect = e.currentTarget.getBoundingClientRect();
    if (e.type === 'touchstart' && e.touches && e.touches[0]) {
      dragOffsetRef.current = {
        x: e.touches[0].clientX - targetRect.left,
        y: e.touches[0].clientY - targetRect.top,
      };
    } else {
      dragOffsetRef.current = {
        x: e.clientX - targetRect.left,
        y: e.clientY - targetRect.top,
      };
    }
    e.preventDefault();
    e.stopPropagation();
  }

  function onDragMove(e) {
    if (!draggingRef.current) return;

    let clientX, clientY;
    if (e.type === 'touchmove' && e.touches && e.touches[0]) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if (e.type === 'mousemove') {
      clientX = e.clientX;
      clientY = e.clientY;
    } else {
      return;
    }

    if (!containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();

    // 计算相对于父容器左上角的新位置
    let newLeft = clientX - containerRect.left - dragOffsetRef.current.x;
    let newTop = clientY - containerRect.top - dragOffsetRef.current.y;

    // 限制拖拽范围在父容器内
    const chatWidth = 320;
    const chatHeight = 260;

    newLeft = Math.min(Math.max(0, newLeft), containerRect.width - chatWidth);
    newTop = Math.min(Math.max(0, newTop), containerRect.height - chatHeight);

    setChatPos({ left: newLeft, top: newTop });
    e.preventDefault();
    e.stopPropagation();
  }

  function onDragEnd(e) {
    if (draggingRef.current) {
      draggingRef.current = false;
      // 保存位置
      localStorage.setItem('chatbox-position', JSON.stringify(chatPos));
      e.preventDefault();
      e.stopPropagation();
    }
  }

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
    // 注释掉 STUN 服务器配置，禁用 stun 功能
    /*
    if (useStun) {
      config.iceServers = [{ urls: ['stun:stun.l.google.com:19302'] }];
    }
    */

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

    // 注意：根据需求，这里不关闭 pc 连接，不停止流，保持后台推流不中断
    // 如果你想真正停止，请取消下面注释
    /*
    setTimeout(() => {
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
    }, 500);

    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    if (audioRef.current && audioRef.current.srcObject) {
      audioRef.current.srcObject.getTracks().forEach((t) => t.stop());
      audioRef.current.srcObject = null;
    }
    */
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

  // 组件挂载时，重新绑定已有远端流到 video/audio 标签，防止切换回来黑屏
  useEffect(() => {
    if (pcRef.current && videoRef.current && audioRef.current) {
      const pc = pcRef.current;

      // 视频流绑定
      let remoteVideoStream = null;
      pc.getReceivers().forEach((receiver) => {
        if (receiver.track && receiver.track.kind === 'video') {
          if (receiver.track.readyState === 'live') {
            if (receiver.track.streams && receiver.track.streams[0]) {
              remoteVideoStream = receiver.track.streams[0];
            }
          }
        }
      });
      if (remoteVideoStream) {
        videoRef.current.srcObject = remoteVideoStream;
      }

      // 音频流绑定
      let remoteAudioStream = null;
      pc.getReceivers().forEach((receiver) => {
        if (receiver.track && receiver.track.kind === 'audio') {
          if (receiver.track.readyState === 'live') {
            if (receiver.track.streams && receiver.track.streams[0]) {
              remoteAudioStream = receiver.track.streams[0];
            }
          }
        }
      });
      if (remoteAudioStream) {
        audioRef.current.srcObject = remoteAudioStream;
      }
    }
  }, []); // 仅挂载时执行一次

  // 通用磨砂玻璃按钮样式（纯 CSS 磨砂玻璃效果）
  const frostedGlassBtnStyle = {
    backgroundColor: 'rgba(255, 255, 255, 0.1)', // 半透明背景
    border: '1px solid rgba(255, 255, 255, 0.3)', // 半透明边框
    color: 'white',
    fontWeight: 'bold',
    padding: '8px 16px',
    cursor: 'pointer',
    borderRadius: 4,
    outline: 'none',
    transition: 'background-color 0.3s, color 0.3s, box-shadow 0.3s, transform 0.3s',
    fontSize: 14,
    lineHeight: '1.2',
    backdropFilter: 'blur(10px)', // 磨砂玻璃模糊
    WebkitBackdropFilter: 'blur(10px)',
    boxShadow: '0 4px 10px rgba(255, 255, 255, 0.15)',
  };

  // 按钮禁用样式
  const disabledBtnStyle = {
    ...frostedGlassBtnStyle,
    opacity: 0.4,
    cursor: 'not-allowed',
    boxShadow: 'none',
  };

  // 按钮 hover 效果内联样式函数
  const getBtnHoverStyle = (disabled) => {
    if (disabled) return {};
    return {
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      boxShadow: '0 6px 20px rgba(255, 255, 255, 0.3)',
      transform: 'scale(1.05)',
    };
  };

  // 本组件内部按钮 hover 状态管理
  const [startBtnHover, setStartBtnHover] = useState(false);
  const [stopBtnHover, setStopBtnHover] = useState(false);
  const [zoomInHover, setZoomInHover] = useState(false);
  const [zoomOutHover, setZoomOutHover] = useState(false);

  return (
    <div ref={containerRef} style={{ maxWidth: 1280, position: 'relative' }}>
      <div className="option" style={{ marginBottom: 8 }}>
        <input
          id="use-stun"
          type="checkbox"
          checked={useStun}
          onChange={(e) => setUseStun(e.target.checked)}
          style={{ accentColor: 'white' }}
          disabled={started} // 连接启动后禁用切换，避免状态不一致
          // 注释掉STUN功能，禁用选择
          hidden
        />
        {/* <label htmlFor="use-stun" style={{ marginLeft: 4, color: 'white' }}>
          Use STUN server
        </label> */}
      </div>

      {/* 将 Zoom 按钮放到 Start、Stop 上面 */}
      <div style={{ marginBottom: 8 }}>
        <button
          onClick={zoomIn}
          style={{
            ...frostedGlassBtnStyle,
            marginRight: 8,
            ...(zoomInHover ? getBtnHoverStyle(false) : {}),
          }}
          onMouseEnter={() => setZoomInHover(true)}
          onMouseLeave={() => setZoomInHover(false)}
          type="button"
        >
          放大
        </button>
        <button
          onClick={zoomOut}
          style={{
            ...frostedGlassBtnStyle,
            ...(zoomOutHover ? getBtnHoverStyle(false) : {}),
          }}
          onMouseEnter={() => setZoomOutHover(true)}
          onMouseLeave={() => setZoomOutHover(false)}
          type="button"
        >
          缩小
        </button>
      </div>

      <button
        onClick={start}
        disabled={started}
        style={{
          ...(started ? disabledBtnStyle : frostedGlassBtnStyle),
          ...(startBtnHover && !started ? getBtnHoverStyle(false) : {}),
          marginRight: 8,
        }}
        onMouseEnter={() => setStartBtnHover(true)}
        onMouseLeave={() => setStartBtnHover(false)}
        type="button"
      >
        启动
      </button>
      <button
        onClick={stop}
        disabled={!started}
        style={{
          ...(!started ? disabledBtnStyle : frostedGlassBtnStyle),
          ...(stopBtnHover && started ? getBtnHoverStyle(false) : {}),
        }}
        onMouseEnter={() => setStopBtnHover(true)}
        onMouseLeave={() => setStopBtnHover(false)}
        type="button"
      >
        停止
      </button>

      {/* 视频区域 */}
      <div id="media" style={{ marginTop: 20 }}>
        <h2 style={{ color: 'white' }}>管家</h2>

        <audio ref={audioRef} autoPlay />
        <video
          ref={videoRef}
          style={{ width: zoomWidth, height: (zoomWidth * initialHeight) / initialWidth, display: 'block' }}
          autoPlay
          playsInline
        />
      </div>

      {/* 可拖拽的聊天对话框容器 */}
      <div
        style={{
          position: 'absolute',
          left: chatPos.left,
          top: chatPos.top,
          width: 320,
          // 去掉背景色，保持透明
          borderRadius: 8,
          padding: 12,
          // 去掉阴影，保持无背景
          color: 'white',
          userSelect: 'none',
          cursor: draggingRef.current ? 'grabbing' : 'grab',
          zIndex: 9999,
        }}
        onMouseDown={onDragStart}
        onMouseMove={onDragMove}
        onMouseUp={onDragEnd}
        onMouseLeave={onDragEnd}
        onTouchStart={onDragStart}
        onTouchMove={onDragMove}
        onTouchEnd={onDragEnd}
      >
        {/* 文本发送表单，放在聊天框内 */}
        <form
          id="echo-form"
          onSubmit={handleSubmit}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
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
              backgroundColor: 'rgba(255, 255, 255, 0.1)', // 半透明白色
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
                ...frostedGlassBtnStyle,
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
                ...frostedGlassBtnStyle,
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
