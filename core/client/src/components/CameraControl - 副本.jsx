import React, { useEffect, useState, useRef } from 'react';
import cameraSwitchIcon from '../assets/icons/camera-switch.png';

export default function CameraControl() {
  const videoRef = useRef(null);
  const floatingContainerRef = useRef(null);

  const [stream, setStream] = useState(null);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [isCameraOn, setIsCameraOn] = useState(false);

  const currentStreamRef = useRef(null);
  const currentCameraDeviceIdRef = useRef(null);

  // 用于区分单击和双击
  const clickTimeoutRef = useRef(null);

  // localStorage key，保存浮动容器位置
  const storageKey = 'cameraControlFloatingPosition';

  // 新增：安全上下文及API支持判断
  function hasMediaDevices() {
    return (
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.enumerateDevices === 'function' &&
      typeof navigator.mediaDevices.getUserMedia === 'function'
    );
  }

  async function getCameraDevices() {
    if (!hasMediaDevices()) {
      console.error('浏览器不支持 mediaDevices.enumerateDevices API 或未在安全上下文中，无法获取摄像头设备列表');
      return [];
    }
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      return allDevices.filter((d) => d.kind === 'videoinput');
    } catch (error) {
      console.error('无法获取摄像头设备列表:', error);
      return [];
    }
  }

  async function initializeCamera(deviceId) {
    stopCamera(); // 先关闭已有流

    if (!hasMediaDevices()) {
      alert('摄像头功能无法使用，请确保浏览器支持并且页面通过HTTPS访问');
      throw new Error('浏览器不支持 mediaDevices.getUserMedia 或未在安全上下文中');
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
        audio: false,
      });
      currentStreamRef.current = stream;
      currentCameraDeviceIdRef.current = deviceId;
      setStream(stream);
      setSelectedDeviceId(deviceId);
      setIsCameraOn(true);
      return stream;
    } catch (error) {
      console.error('摄像头初始化失败:', error);
      alert('摄像头初始化失败: ' + error.message);
      throw error;
    }
  }

  function stopCamera() {
    if (currentStreamRef.current) {
      currentStreamRef.current.getTracks().forEach((track) => track.stop());
      currentStreamRef.current = null;
      currentCameraDeviceIdRef.current = null;
    }
    setStream(null);
    setIsCameraOn(false);
  }

  async function switchCamera() {
    if (!isCameraOn) {
      console.log('摄像头未打开，无法切换');
      return;
    }
    const videoDevices = await getCameraDevices();
    if (videoDevices.length < 2) {
      console.log('仅有一个摄像头，无法切换');
      return;
    }

    let nextDeviceId;
    for (const device of videoDevices) {
      if (device.deviceId !== currentCameraDeviceIdRef.current) {
        nextDeviceId = device.deviceId;
        break;
      }
    }
    if (!nextDeviceId) nextDeviceId = videoDevices[0].deviceId;

    try {
      await initializeCamera(nextDeviceId);
      console.log('摄像头已切换:', nextDeviceId);
    } catch (e) {
      console.error('切换失败:', e);
    }
  }

  async function toggleCameraOnOff() {
    if (isCameraOn) {
      stopCamera();
    } else {
      let deviceIdToUse = selectedDeviceId;
      if (!deviceIdToUse) {
        const videoDevices = await getCameraDevices();
        setDevices(videoDevices);
        if (videoDevices.length === 0) {
          alert('无摄像头设备');
          return;
        }
        deviceIdToUse = videoDevices[0].deviceId;
      }
      try {
        await initializeCamera(deviceIdToUse);
      } catch {}
    }
  }

  // 单击和双击区分处理
  function handleButtonClick() {
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    clickTimeoutRef.current = setTimeout(() => {
      switchCamera();
      clickTimeoutRef.current = null;
    }, 250); // 单击延迟250ms触发
  }

  function handleButtonDoubleClick() {
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    toggleCameraOnOff();
  }

  useEffect(() => {
    async function init() {
      if (!hasMediaDevices()) {
        console.warn('浏览器不支持 mediaDevices API 或未在安全上下文中，摄像头功能不可用');
        return;
      }
      const videoDevices = await getCameraDevices();
      setDevices(videoDevices);
    }
    init();

    return () => {
      stopCamera();
      if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
      if (floatingContainerRef.current) {
        floatingContainerRef.current.removeEventListener('mousedown', onMouseDown);
        floatingContainerRef.current.removeEventListener('touchstart', onTouchStart);
      }
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (video && stream) {
      video.srcObject = stream;
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch((e) => {
          console.warn('video.play()失败:', e);
        });
      }
    } else if (video) {
      video.srcObject = null;
    }
  }, [stream]);

  // 拖动相关状态
  const isDraggingRef = useRef(false);
  const offsetXRef = useRef(0);
  const offsetYRef = useRef(0);

  const onMouseDown = (e) => {
    if (!floatingContainerRef.current) return;
    isDraggingRef.current = true;
    offsetXRef.current = e.clientX - floatingContainerRef.current.offsetLeft;
    offsetYRef.current = e.clientY - floatingContainerRef.current.offsetTop;
    floatingContainerRef.current.style.cursor = 'grabbing';
    e.preventDefault();
  };
  const onMouseMove = (e) => {
    if (isDraggingRef.current && floatingContainerRef.current) {
      let newLeft = e.clientX - offsetXRef.current;
      let newTop = e.clientY - offsetYRef.current;

      // 限制拖动范围
      const container = floatingContainerRef.current;
      const maxLeft = window.innerWidth - container.offsetWidth;
      const maxTop = window.innerHeight - container.offsetHeight;

      newLeft = Math.min(Math.max(0, newLeft), maxLeft);
      newTop = Math.min(Math.max(0, newTop), maxTop);

      container.style.left = `${newLeft}px`;
      container.style.top = `${newTop}px`;
    }
  };
  const onMouseUp = () => {
    if (floatingContainerRef.current) {
      isDraggingRef.current = false;
      floatingContainerRef.current.style.cursor = 'grab';

      // 保存位置
      const container = floatingContainerRef.current;
      localStorage.setItem(
        storageKey,
        JSON.stringify({ left: container.offsetLeft, top: container.offsetTop })
      );
    }
  };
  const onTouchStart = (e) => {
    if (!floatingContainerRef.current || e.touches.length === 0) return;
    isDraggingRef.current = true;
    const touch = e.touches[0];
    offsetXRef.current = touch.clientX - floatingContainerRef.current.offsetLeft;
    offsetYRef.current = touch.clientY - floatingContainerRef.current.offsetTop;
    floatingContainerRef.current.style.cursor = 'grabbing';
  };
  const onTouchMove = (e) => {
    if (isDraggingRef.current && floatingContainerRef.current && e.touches.length > 0) {
      const touch = e.touches[0];
      let newLeft = touch.clientX - offsetXRef.current;
      let newTop = touch.clientY - offsetYRef.current;

      const container = floatingContainerRef.current;
      const maxLeft = window.innerWidth - container.offsetWidth;
      const maxTop = window.innerHeight - container.offsetHeight;

      newLeft = Math.min(Math.max(0, newLeft), maxLeft);
      newTop = Math.min(Math.max(0, newTop), maxTop);

      container.style.left = `${newLeft}px`;
      container.style.top = `${newTop}px`;

      e.preventDefault();
    }
  };
  const onTouchEnd = () => {
    if (floatingContainerRef.current) {
      isDraggingRef.current = false;
      floatingContainerRef.current.style.cursor = 'grab';

      // 保存位置
      const container = floatingContainerRef.current;
      localStorage.setItem(
        storageKey,
        JSON.stringify({ left: container.offsetLeft, top: container.offsetTop })
      );
    }
  };

  useEffect(() => {
    if (!floatingContainerRef.current) return;
    const container = floatingContainerRef.current;

    // 恢复位置
    const savedPosStr = localStorage.getItem(storageKey);
    let left = 10;
    let top = 10;
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
        // 解析失败忽略
      }
    }

    container.style.position = 'fixed';
    container.style.left = `${left}px`;
    container.style.top = `${top}px`;
    container.style.cursor = 'grab';
    container.style.zIndex = '10000';
    container.style.width = '160px';

    // 绑定拖拽事件
    container.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    container.addEventListener('touchstart', onTouchStart);
    document.addEventListener('touchmove', onTouchMove);
    document.addEventListener('touchend', onTouchEnd);

    return () => {
      container.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      container.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  return (
    <>
      <style>{`
        #video {
          border-radius: 50%;
          object-fit: cover;
          width: 120px;
          height: 120px;
          background-color: black;
          display: block;
          user-select: none;
          pointer-events: none;
        }
        #floating-container {
          user-select: none;
          background: transparent;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 4px;
          box-sizing: border-box;
        }
        #toggle-switch-camera {
          cursor: pointer;
          width: 46px;
          height: 46px;
          border-radius: 50%;
          border: 1px solid #ffffff;
          background-color: transparent;
          display: flex;
          justify-content: center;
          align-items: center;
          transition: background-color 0.3s, border-color 0.3s;
        }
        #toggle-switch-camera:hover {
          background-color: rgba(0, 229, 255, 0.15);
          border-color: #00e5ff;
        }
        #toggle-switch-camera img {
          width: 45px;
          height: 45px;
          pointer-events: none;
          user-select: none;
        }
      `}</style>

      <div id="floating-container" ref={floatingContainerRef}>
        {isCameraOn && (
          <video
            id="video"
            ref={videoRef}
            autoPlay
            playsInline
            muted
            onDragStart={(e) => e.preventDefault()}
          />
        )}
        <button
          id="toggle-switch-camera"
          type="button"
          aria-label={isCameraOn ? '切换摄像头' : '打开摄像头'}
          onClick={handleButtonClick}
          onDoubleClick={handleButtonDoubleClick}
          title={isCameraOn ? '单击切换摄像头，双击关闭摄像头' : '双击打开摄像头'}
        >
          <img src={cameraSwitchIcon} alt="切换摄像头" draggable={false} />
        </button>
      </div>
    </>
  );
}
