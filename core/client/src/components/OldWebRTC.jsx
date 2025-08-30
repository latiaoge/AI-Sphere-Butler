import React, { useEffect, useRef, useState } from 'react';

export default function OldWebRTC({ renderVideo = true, keepConnection = false, onStart, onStop }) {
  // 引用定义
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const pcRef = useRef(null);
  const textareaRef = useRef(null);
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const animationFrameIdRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const pipVideoRef = useRef(null); // 自定义画中画视频引用
  const hiddenVideoRef = useRef(null); // 标准画中画隐藏视频元素
  const isPiPModeChangingRef = useRef(false); // 画中画模式切换中标志
  const pipExitReasonRef = useRef(''); // 画中画退出原因
  const isStoppingRef = useRef(false); // 应用正在停止的标志
  const containerRef = useRef(null);
  const isStartedRef = useRef(false); // 标记开始状态
  const isVideoReadyRef = useRef(false); // 标记视频就绪状态
  const pipCanvasStreamRef = useRef(null); // 记录画中画启用前的canvas状态
  const wasCanvasVisibleRef = useRef(true);
  const isPipActiveRef = useRef(false); // 画中画激活状态
  const draggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  // 状态管理
  const [useStun, setUseStun] = useState(false);
  const [started, setStarted] = useState(false);
  const [zoomWidth, setZoomWidth] = useState(600);
  const [videoReady, setVideoReady] = useState(false);
  const [alphaReady, setAlphaReady] = useState(false);
  const [processingMode, setProcessingMode] = useState('rgba');
  const [errorMessage, setErrorMessage] = useState('');
  const [debugInfo, setDebugInfo] = useState('');
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const [maxConnectionAttempts] = useState(5);
  const [enablePip, setEnablePip] = useState(false); // 自定义画中画开关
  const [isPiPMode, setIsPiPMode] = useState(false); // 标准画中画模式
  const [isSending, setIsSending] = useState(false); // 发送状态
  
  // 抠图参数
  const [edgeSmoothing, setEdgeSmoothing] = useState(2);
  const [greenThreshold, setGreenThreshold] = useState(1.3);
  const [chromaKeyColor, setChromaKeyColor] = useState('green'); // 'green' | 'blue' | 'red'
  const [customChromaKeyColor, setCustomChromaKeyColor] = useState('#00FF00'); // 默认绿色
  const [useCustomColor, setUseCustomColor] = useState(false);
  const [globalAlpha, setGlobalAlpha] = useState(1.0);
  
  // 控制区状态
  const [isControlsCollapsed, setIsControlsCollapsed] = useState(false);
  const [usePresetColorOpen, setUsePresetColorOpen] = useState(false);
  
  // 聊天框状态
  const [chatPos, setChatPos] = useState(() => {
    try {
      const saved = localStorage.getItem('chatbox-position');
      if (saved) {
        const pos = JSON.parse(saved);
        if (typeof pos.left === 'number' && typeof pos.top === 'number') {
          return pos;
        }
      }
    } catch {}
    return { left: 20, top: 20 };
  });
  const [message, setMessage] = useState('');
  const [file, setFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(''); // 文件上传状态
  
  // 按钮悬停状态
  const [startBtnHover, setStartBtnHover] = useState(false);
  const [stopBtnHover, setStopBtnHover] = useState(false);
  const [zoomInHover, setZoomInHover] = useState(false);
  const [zoomOutHover, setZoomOutHover] = useState(false);
  const [interruptBtnHover, setInterruptBtnHover] = useState(false);
  const [pipToggleHover, setPipToggleHover] = useState(false);
  const [toggleControlsHover, setToggleControlsHover] = useState(false);

  // 预设颜色选项
  const presetColors = [
    { value: 'green', label: '绿色' },
    { value: 'blue', label: '蓝色' },
    { value: 'red', label: '红色' },
  ];

  // 配置常量
  const SIGNALING_URL = '/offer';
  const zoomStep = 50;
  const touchEventOptions = { passive: false };

  // 样式定义
  const frostedGlassBtnStyle = {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    color: 'white',
    fontWeight: 'bold',
    padding: '8px 16px',
    cursor: 'pointer',
    borderRadius: 4,
    outline: 'none',
    transition: 'all 0.3s',
    fontSize: 14,
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    boxShadow: '0 4px 10px rgba(255, 255, 255, 0.15)',
  };

  const disabledBtnStyle = {
    ...frostedGlassBtnStyle,
    opacity: 0.4,
    cursor: 'not-allowed',
    boxShadow: 'none',
  };

  const getBtnHoverStyle = (disabled) => {
    if (disabled) return {};
    return {
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      boxShadow: '0 6px 20px rgba(255, 255, 255, 0.3)',
      transform: 'scale(1.05)',
    };
  };

  // 拖拽事件处理
  function onDragStart(e) {
    // 检查是否是输入元素，避免干扰输入
    if (e.target.tagName.toLowerCase() === 'textarea' || 
        e.target.tagName.toLowerCase() === 'button' ||
        e.target.type === 'file') {
      draggingRef.current = false;
      return;
    }
    
    draggingRef.current = true;
    const targetRect = e.currentTarget.getBoundingClientRect();
    
    if (e.type === 'touchstart' && e.touches?.[0]) {
      dragOffsetRef.current = {
        x: e.touches[0].clientX - targetRect.left,
        y: e.touches[0].clientY - targetRect.top,
      };
      if (e.cancelable) e.preventDefault();
    } else {
      dragOffsetRef.current = {
        x: e.clientX - targetRect.left,
        y: e.clientY - targetRect.top,
      };
    }
    
    e.stopPropagation();
  }

  function onDragMove(e) {
    if (!draggingRef.current) return;
    
    let clientX, clientY;
    if (e.type === 'touchmove' && e.touches?.[0]) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
      if (e.cancelable) e.preventDefault();
    } else if (e.type === 'mousemove') {
      clientX = e.clientX;
      clientY = e.clientY;
    } else {
      return;
    }
    
    if (!containerRef.current || !e.currentTarget) return;
    
    const containerRect = containerRef.current.getBoundingClientRect();
    const chatRect = e.currentTarget.getBoundingClientRect();
    const chatWidth = chatRect.width;
    const chatHeight = chatRect.height;
    
    let newLeft = clientX - containerRect.left - dragOffsetRef.current.x;
    let newTop = clientY - containerRect.top - dragOffsetRef.current.y;
    newLeft = Math.min(Math.max(0, newLeft), containerRect.width - chatWidth);
    newTop = Math.min(Math.max(0, newTop), containerRect.height - chatHeight);
    
    setChatPos({ left: newLeft, top: newTop });
    e.stopPropagation();
  }

  function onDragEnd(e) {
    if (draggingRef.current) {
      draggingRef.current = false;
      localStorage.setItem('chatbox-position', JSON.stringify(chatPos));
      if (e.type === 'touchend' && e.cancelable) e.preventDefault();
      e.stopPropagation();
    }
  }

  // 获取动态配置的 URLs
  const getDynamicUrls = () => {
    let serverUrls = {};
    try {
      const savedUrls = localStorage.getItem('serverUrls');
      if (savedUrls) {
        serverUrls = JSON.parse(savedUrls);
      }
    } catch (e) {
      console.error("OldWebRTC: Failed to parse serverUrls from localStorage", e);
    }
    // 优先使用配置项，如果没有则 fallback 到环境变量或默认值
    const baseUrl = serverUrls.uploadFileUrl || 'http://192.168.168.77:6010';
    const qwenerUrl = serverUrls.qwenerUrl || 'https://192.168.168.77:6010/qwener';
    const interruptUrl = serverUrls.interruptUrl || 'http://192.168.168.77:6010/api/interrupt_speaking';

    return {
      uploadPrintFileUrl: `${baseUrl}/api/upload_print_file`,
      qwenerUrl: qwenerUrl,
      interruptUrl: interruptUrl
    };
  };

  // 视频处理相关函数
  function calculateTransparencyPercentage(data) {
    if (!data || data.length === 0) return '0.00';
    
    let transparentPixels = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] === 0) transparentPixels++;
    }
    
    return ((transparentPixels / (data.length / 4)) * 100).toFixed(2);
  }

  // 绿幕抠图算法
  function processVideoFrameWithGreenScreen() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    
    if (!video || !canvas || !ctx || !isStartedRef.current || !isVideoReadyRef.current) {
      animationFrameIdRef.current = requestAnimationFrame(processVideoFrameWithGreenScreen);
      return;
    }
    
    if (video.paused || video.ended) {
      console.log('视频已暂停或结束，继续处理帧...');
      animationFrameIdRef.current = requestAnimationFrame(processVideoFrameWithGreenScreen);
      return;
    }
    
    try {
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = frame.data;
      
      // 解析自定义颜色为RGB值
      const hexToRgb = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16)
        } : null;
      };
      
      const customRgb = hexToRgb(customChromaKeyColor);
      const customR = customRgb?.r || 0;
      const customG = customRgb?.g || 255;
      const customB = customRgb?.b || 0;

      // 判断是否应该透明化
      function shouldMakeTransparent(r, g, b) {
        const threshold = 100;
        const ratio = greenThreshold;
        
        if (useCustomColor) {
          const colorDistance = Math.sqrt(
            Math.pow(r - customR, 2) + 
            Math.pow(g - customG, 2) + 
            Math.pow(b - customB, 2)
          );
          return colorDistance < threshold * ratio;
        }
        
        switch (chromaKeyColor) {
          case 'green':
            return g > threshold && r < threshold && b < threshold && g > r * ratio && g > b * ratio;
          case 'blue':
            return b > threshold && r < threshold && g < threshold && b > r * ratio && b > g * ratio;
          case 'red':
            return r > threshold && g < threshold && b < threshold && r > g * ratio && r > b * ratio;
          default:
            return false;
        }
      }
      
      // 处理每个像素
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (shouldMakeTransparent(r, g, b)) {
          data[i + 3] = 0; // 设置透明度为0
        }
      }
      
      // 边缘平滑处理
      if (edgeSmoothing > 0) {
        const tempData = new Uint8ClampedArray(data);
        const width = canvas.width;
        const height = canvas.height;
        const radius = edgeSmoothing;
        
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            if (data[i + 3] === 0) continue;
            
            let transparentNeighbors = 0;
            let totalNeighbors = 0;
            
            for (let dy = -radius; dy <= radius; dy++) {
              for (let dx = -radius; dx <= radius; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
                
                const ni = (ny * width + nx) * 4;
                if (tempData[ni + 3] === 0) transparentNeighbors++;
                totalNeighbors++;
              }
            }
            
            if (transparentNeighbors > 0 && totalNeighbors > 0) {
              const ratio = transparentNeighbors / totalNeighbors;
              data[i + 3] = Math.round(data[i + 3] * (1 - ratio));
            }
          }
        }
      }
      
      // 应用整体透明度
      if (globalAlpha < 1.0) {
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] > 0) {
            data[i] = Math.round(data[i] * globalAlpha);
          }
        }
      }
      
      ctx.putImageData(frame, 0, 0);
      
      // 更新调试信息
      const transparencyPercentage = calculateTransparencyPercentage(data);
      setDebugInfo(`抠图透明度: ${transparencyPercentage}% | 边缘平滑: ${edgeSmoothing} | 阈值: ${greenThreshold} | 色块: ${useCustomColor ? '自定义' : chromaKeyColor}${useCustomColor ? `(${customChromaKeyColor})` : ''} | 整体透明度: ${(globalAlpha * 100).toFixed(0)}%`);
      setAlphaReady(parseFloat(transparencyPercentage) > 1);
      
    } catch (e) {
      console.error('抠图处理异常:', e);
      setErrorMessage('视频处理异常，请检查视频源');
    }
    
    animationFrameIdRef.current = requestAnimationFrame(processVideoFrameWithGreenScreen);
  }

  function fallbackToCanvasDrawing() {
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
    }
    processVideoFrameWithGreenScreen();
  }

  // 更新调试信息
  function updateDebugInfo() {
    console.log('Debug info updated');
  }

  // WebRTC相关函数
  async function negotiate() {
    const pc = pcRef.current;
    if (!pc) return;
    
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });
    
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
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
      
      const response = await fetch(SIGNALING_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pc.localDescription),
      });
      
      if (!response.ok) throw new Error(`服务器响应错误: ${response.status}`);
      
      const answer = await response.json();
      await pc.setRemoteDescription(answer);
      
    } catch (e) {
      setErrorMessage(`WebRTC连接失败: ${e.message}`);
      
      if (connectionAttempts < maxConnectionAttempts) {
        setConnectionAttempts(connectionAttempts + 1);
        reconnectTimerRef.current = setTimeout(() => {
          if (isStartedRef.current) {
            stop();
            start();
          }
        }, 2000);
      } else {
        alert('连接失败，请检查网络连接或刷新页面');
      }
    }
  }

  // 缩放控制
  function zoomIn() {
    setZoomWidth((w) => w + zoomStep);
  }

  function zoomOut() {
    setZoomWidth((w) => (w - zoomStep > 0 ? w - zoomStep : w));
  }

  function resetZoom() {
    setZoomWidth(600);
  }

  // 画中画控制
  async function togglePictureInPicture() {
    if (isPiPModeChangingRef.current) {
      console.log('忽略画中画切换请求：正在切换中');
      return;
    }
    
    isPiPModeChangingRef.current = true;
    pipExitReasonRef.current = '';
    
    try {
      if (document.pictureInPictureElement) {
        isStoppingRef.current = true;
        console.log('尝试退出标准画中画模式');
        await document.exitPictureInPicture();
        console.log('已成功退出标准画中画模式');
        isStoppingRef.current = false;
        setIsPiPMode(false);
      } else {
        console.log('尝试进入标准画中画模式');
        
        if (!document.pictureInPictureEnabled) {
          throw new Error('浏览器不支持画中画功能');
        }
        
        if (!hiddenVideoRef.current) {
          const videoElement = document.createElement('video');
          videoElement.style.display = 'none';
          document.body.appendChild(videoElement);
          hiddenVideoRef.current = videoElement;
          
          // 绑定画中画事件
          videoElement.addEventListener('enterpictureinpicture', () => {
            console.log('进入标准画中画模式 - 视频元素状态:', videoElement.readyState);
            setIsPiPMode(true);
            isPiPModeChangingRef.current = false;
          });
          
          videoElement.addEventListener('leavepictureinpicture', () => {
            console.log('退出标准画中画模式 - 原因:', pipExitReasonRef.current || '未知');
            setIsPiPMode(false);
            isPiPModeChangingRef.current = false;
          });
          
          videoElement.addEventListener('error', (e) => {
            console.error('画中画视频元素错误:', e);
            setErrorMessage('画中画视频元素错误');
            isPiPModeChangingRef.current = false;
          });
        }
        
        if (!canvasRef.current || !ctxRef.current) {
          setErrorMessage('Canvas未初始化，无法启动画中画');
          isPiPModeChangingRef.current = false;
          return;
        }
        
        if (canvasRef.current.width === 0 || canvasRef.current.height === 0) {
          console.error('Canvas尺寸为0，无法启动画中画');
          setErrorMessage('Canvas尺寸为0，无法启动画中画');
          isPiPModeChangingRef.current = false;
          return;
        }
        
        const stream = canvasRef.current.captureStream(30);
        hiddenVideoRef.current.srcObject = stream;
        console.log('创建Canvas流成功，帧率:', 30);
        pipCanvasStreamRef.current = stream;
        
        if (!stream || stream.getTracks().length === 0) {
          throw new Error('Canvas流为空或无效');
        }
        
        console.log('尝试播放画中画视频元素...');
        await hiddenVideoRef.current.play();
        console.log('画中画视频元素播放成功');
        console.log('尝试请求进入画中画模式...');
        await hiddenVideoRef.current.requestPictureInPicture();
        console.log('成功进入画中画模式');
      }
    } catch (e) {
      console.error('标准画中画错误:', e);
      setErrorMessage(`标准画中画错误: ${e.message}`);
      pipExitReasonRef.current = e.message;
      
      if (!isPiPMode) {
        setEnablePip((v) => !v);
      }
    } finally {
      isPiPModeChangingRef.current = false;
    }
  }

  async function notifyBackendStop() {
    console.log('notifyBackendStop called but ignored due to no backend stop API');
  }

  // 启动WebRTC连接
  function start() {
    if (isStartedRef.current) return;
    
    const config = { sdpSemantics: 'unified-plan' };
    if (useStun) {
      config.iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
    }
    
    const pc = new RTCPeerConnection(config);
    pcRef.current = pc;
    isStartedRef.current = true;
    setConnectionAttempts(0);
    
    // 连接状态变化处理
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        if (isPiPMode) {
          console.log('WebRTC连接断开，但处于画中画模式，尝试重新连接');
          setErrorMessage('WebRTC连接断开，尝试重连');
          
          if (!reconnectTimerRef.current) {
            reconnectTimerRef.current = setTimeout(() => {
              if (isStartedRef.current) {
                negotiate();
              }
            }, 2000);
          }
        } else {
          setErrorMessage('WebRTC连接断开或失败，尝试重连');
          
          if (!reconnectTimerRef.current) {
            reconnectTimerRef.current = setTimeout(() => {
              if (isStartedRef.current) {
                stop();
                start();
              }
            }, 2000);
          }
        }
      } else if (pc.connectionState === 'connected') {
        setErrorMessage('');
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
      }
    });
    
    // 处理音视频轨道
    pc.addEventListener('track', (evt) => {
      if (evt.track.kind === 'video') {
        if (videoRef.current) {
          videoRef.current.srcObject = evt.streams[0];
          
          videoRef.current.addEventListener(
            'loadedmetadata',
            () => {
              if (!videoRef.current.videoWidth || !videoRef.current.videoHeight) return;
              
              isVideoReadyRef.current = true;
              setVideoReady(true);
              console.log('视频元数据加载完成:', 
                videoRef.current.videoWidth, 'x', videoRef.current.videoHeight);
              
              const canvas = canvasRef.current;
              const ctx = canvas.getContext('2d', { willReadFrequently: true });
              
              if (!ctx) {
                setErrorMessage('无法获取Canvas上下文');
                return;
              }
              
              ctxRef.current = ctx;
              canvas.width = videoRef.current.videoWidth;
              canvas.height = videoRef.current.videoHeight;
              updateCanvasSize();
              fallbackToCanvasDrawing();
              
              if (enablePip && pipVideoRef.current) {
                setTimeout(() => setupPipStream(), 100);
              }
            },
            { once: true }
          );
        }
      } else if (evt.track.kind === 'audio') {
        if (audioRef.current) {
          audioRef.current.srcObject = evt.streams[0];
        }
      }
    });
    
    setStarted(true);
    setErrorMessage('');
    negotiate();
    
    // 调用外部提供的onStart回调
    if (typeof onStart === 'function') {
      onStart();
    }
  }

  // 自定义画中画设置
  async function setupPipStream() {
    if (!canvasRef.current || !pipVideoRef.current || isPipActiveRef.current) return;
    
    try {
      wasCanvasVisibleRef.current = canvasRef.current.style.display !== 'none';
      pipCanvasStreamRef.current = canvasRef.current.captureStream(30);
      pipVideoRef.current.srcObject = pipCanvasStreamRef.current;
      isPipActiveRef.current = true;
      await pipVideoRef.current.play();
      console.log('自定义画中画已成功启动');
    } catch (err) {
      console.error('自定义画中画视频播放失败:', err);
      setErrorMessage('自定义画中画功能启动失败');
      isPipActiveRef.current = false;
      
      if (pipVideoRef.current) {
        pipVideoRef.current.srcObject = null;
      }
      
      if (pipCanvasStreamRef.current) {
        pipCanvasStreamRef.current.getTracks().forEach(track => track.stop());
        pipCanvasStreamRef.current = null;
      }
    }
  }

  // 停止自定义画中画
  function stopPipStream() {
    if (!isPipActiveRef.current) return;
    
    try {
      if (pipCanvasStreamRef.current) {
        pipCanvasStreamRef.current.getTracks().forEach(track => track.stop());
        pipCanvasStreamRef.current = null;
      }
      
      if (pipVideoRef.current) {
        pipVideoRef.current.srcObject = null;
      }
      
      if (wasCanvasVisibleRef.current) {
        canvasRef.current.style.display = '';
      }
      
      isPipActiveRef.current = false;
      console.log('自定义画中画已成功关闭');
    } catch (err) {
      console.error('自定义画中画关闭时出错:', err);
    }
  }

  // 停止所有功能
  function stop() {
    isStoppingRef.current = true;
    console.log('开始执行完全停止操作...');
    
    try {
      // 清理动画帧
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
        console.log('已取消动画帧');
      }
      
      // 清理重连计时器
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
        console.log('已清除重连计时器');
      }
      
      // 处理画中画状态
      if (isPiPMode) {
        pipExitReasonRef.current = '手动停止应用';
      }
      
      stopPipStream();
      
      // 退出画中画模式
      if (document.pictureInPictureElement) {
        console.log('停止时退出标准画中画模式');
        document.exitPictureInPicture().catch(err => {
          console.error('退出标准画中画失败:', err);
        });
      }
      
      // 清理隐藏视频元素
      if (hiddenVideoRef.current && hiddenVideoRef.current.parentNode) {
        hiddenVideoRef.current.parentNode.removeChild(hiddenVideoRef.current);
        hiddenVideoRef.current = null;
        console.log('已移除隐藏视频元素');
      }
      
      // 停止视频流
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = null;
        console.log('已停止视频流');
      }
      
      // 停止音频流
      if (audioRef.current?.srcObject) {
        audioRef.current.srcObject.getTracks().forEach((t) => t.stop());
        audioRef.current.srcObject = null;
        console.log('已停止音频流');
      }
      
      // 关闭WebRTC连接
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
        console.log('已关闭WebRTC连接');
      }
      
      // 清理自定义画中画
      if (pipVideoRef.current) {
        pipVideoRef.current.pause();
        pipVideoRef.current.srcObject = null;
        console.log('已清理自定义画中画');
      }
      
      // 更新状态
      isStartedRef.current = false;
      isVideoReadyRef.current = false;
      setStarted(false);
      setVideoReady(false);
      setAlphaReady(false);
      setErrorMessage('');
      setDebugInfo('');
      setIsPiPMode(false);
      
      console.log('完全停止操作执行完毕');
      
      // 调用外部提供的onStop回调
      if (typeof onStop === 'function') {
        onStop();
      }
    } catch (error) {
      console.error('停止过程中发生错误:', error);
    } finally {
      isStoppingRef.current = false;
    }
  }

  // 更新Canvas尺寸
  function updateCanvasSize() {
    if (!videoRef.current || !canvasRef.current) return;
    
    const ratio = videoRef.current.videoHeight / videoRef.current.videoWidth;
    const width = zoomWidth;
    const height = width * ratio;
    
    canvasRef.current.style.width = `${width}px`;
    canvasRef.current.style.height = `${height}px`;
  }

  // 消息和文件处理
  function handleFileChange(e) {
    const f = e.target.files[0];
    setFile(f || null);
    
    if (f) {
      setUploadStatus(`已选择: ${f.name}`);
    } else {
      setUploadStatus('');
    }
  }

  // Qwen请求处理
  const qwener = async (text) => {
    try {
      console.log('Sending request to Qwen:', text);
      return { success: true };
    } catch (error) {
      console.error('Qwen request failed:', error);
      return { success: false, error: error.message };
    }
  };

  // 文件上传功能，使用动态 URL
  const sendFile = async (e) => {
    e.preventDefault();
    if (!file) return;

    // 动态获取上传 URL
    const { uploadPrintFileUrl } = getDynamicUrls();

    try {
      setUploadStatus('正在上传...');
      const formData = new FormData();
      formData.append('file', file);

      // 打印调试信息
      console.log('准备上传文件:', {
        name: file.name,
        size: file.size,
        type: file.type,
        url: uploadPrintFileUrl
      });

      const response = await fetch(uploadPrintFileUrl, {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json',
        },
        timeout: 30000
      });

      // 读取响应文本
      const responseText = await response.text();
      console.log(`上传响应 (状态码: ${response.status}):`, responseText);

      // 尝试解析JSON
      let result;
      try {
        result = JSON.parse(responseText);
      } catch (e) {
        console.error('解析响应JSON失败:', e, '响应文本:', responseText);
        throw new Error(`服务器返回无效JSON: ${responseText.substring(0, 100)}`);
      }

      if (!response.ok) {
        throw new Error(result.error || `上传失败: ${response.status}`);
      }

      setUploadStatus(result.message || '文件上传成功');
      setFile(null);
      // 清空文件输入
      const fileInput = document.getElementById('file-upload');
      if (fileInput) fileInput.value = '';
      console.log('文件上传成功:', result);
    } catch (error) {
      console.error('文件发送失败:', error);
      setUploadStatus(`上传失败: ${error.message}`);
    }
  };

  // 处理打断说话请求，使用动态 URL
  const handleInterruptClick = async () => {
    setIsSending(true);
    setErrorMessage('');

    // 动态获取打断 URL
    const { interruptUrl } = getDynamicUrls();

    try {
      const resp = await fetch(interruptUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
      });
      if (!resp.ok) throw new Error('状态码: ' + resp.status);
      const result = await resp.json();
      console.log('打断请求成功:', result);
    } catch (error) {
      console.error('打断请求失败:', error);
      setErrorMessage(`打断失败: ${error.message}`);
    } finally {
      setIsSending(false);
    }
  };

  // 生命周期钩子
  useEffect(() => {
    updateCanvasSize();
    
    if (enablePip && !isPiPMode) {
      setupPipStream();
    } else if (!enablePip && isPipActiveRef.current) {
      stopPipStream();
    }
  }, [zoomWidth, enablePip, isPiPMode]);

  useEffect(() => {
    function handleVisibilityChange() {
      console.log('页面可见性变化:', document.visibilityState);
      
      if (document.visibilityState === 'hidden') {
        console.log('页面已隐藏');
        if (isPiPMode) {
          pipExitReasonRef.current = '页面隐藏';
        }
        return;
      }
      
      // 恢复视频播放
      if (videoRef.current && videoRef.current.paused) {
        console.log('尝试恢复主视频播放');
        videoRef.current.play().catch(err => {
          console.error('恢复主视频播放失败:', err);
        });
      }
      
      if (pipVideoRef.current && enablePip && !isPiPMode && pipVideoRef.current.paused) {
        console.log('尝试恢复自定义画中画播放');
        pipVideoRef.current.play().catch(err => {
          console.error('恢复自定义画中画播放失败:', err);
        });
      }
      
      if (hiddenVideoRef.current && isPiPMode && hiddenVideoRef.current.paused) {
        console.log('尝试恢复标准画中画播放');
        hiddenVideoRef.current.play().catch(err => {
          console.error('恢复标准画中画播放失败:', err);
        });
      }
    }
    
    function handleBeforeUnload() {
      console.log('页面即将卸载，清理资源');
      stopPipStream();
      
      if (document.pictureInPictureElement) {
        console.log('页面卸载时退出标准画中画模式');
        document.exitPictureInPicture().catch(err => {
          console.error('页面卸载时退出标准画中画失败:', err);
        });
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (!keepConnection) {
        stop();
      }
    };
  }, [enablePip, isPiPMode, keepConnection]);

  // 抠图参数变化时触发重新处理
  useEffect(() => {
    if (isStartedRef.current && isVideoReadyRef.current) {
       fallbackToCanvasDrawing();
    }
  }, [edgeSmoothing, greenThreshold, chromaKeyColor, customChromaKeyColor, useCustomColor, globalAlpha]);

  // 处理 Qwen 请求，使用动态 URL
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;

    // 动态获取 Qwen URL
    const { qwenerUrl } = getDynamicUrls();

    try {
      const response = await fetch(qwenerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ text: message.trim() })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Qwen请求失败，响应内容:', errorText);
        throw new Error(`状态码: ${response.status}, 内容: ${errorText}`);
      }

      const result = await response.json();
      console.log('Qwen请求成功:', result);
      setMessage('');
    } catch (error) {
      console.error('Qwen请求失败:', error);
      setErrorMessage(`请求失败: ${error.message}`);
    }
  };

  // 渲染组件
  return (
    <div ref={containerRef} style={{ maxWidth: 1280, position: 'relative', minHeight: '100vh' }}>
      {/* 折叠控制区按钮 */}
      <button
        onClick={() => setIsControlsCollapsed(!isControlsCollapsed)}
        style={{
          ...frostedGlassBtnStyle,
          marginBottom: 8,
          ...(toggleControlsHover ? getBtnHoverStyle(false) : {}),
        }}
        onMouseEnter={() => setToggleControlsHover(true)}
        onMouseLeave={() => setToggleControlsHover(false)}
        onTouchStart={(e) => {
          if (e.cancelable) e.preventDefault();
          setIsControlsCollapsed(!isControlsCollapsed);
        }}
        onTouchEnd={(e) => {
          if (e.cancelable) e.preventDefault();
        }}
      >
        {isControlsCollapsed ? '展开控制' : '折叠控制'}
      </button>

      {/* 控制区域 (可折叠) */}
      {!isControlsCollapsed && (
        <>
          <div className="option" style={{ marginBottom: 8 }}>
            <input
              id="use-stun"
              type="checkbox"
              checked={useStun}
              onChange={(e) => setUseStun(e.target.checked)}
              style={{ accentColor: 'white' }}
              disabled={started}
              hidden
            />
          </div>
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
              // 添加触摸事件处理，避免被动监听器问题
              onTouchStart={(e) => {
                if (e.cancelable) {
                  e.preventDefault();
                }
                zoomIn();
              }}
              onTouchEnd={(e) => {
                if (e.cancelable) {
                  e.preventDefault();
                }
              }}
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
              // 添加触摸事件处理，避免被动监听器问题
              onTouchStart={(e) => {
                if (e.cancelable) {
                  e.preventDefault();
                }
                zoomOut();
              }}
              onTouchEnd={(e) => {
                if (e.cancelable) {
                  e.preventDefault();
                }
              }}
            >
              缩小
            </button>
            <button
              onClick={togglePictureInPicture}
              style={{
                ...frostedGlassBtnStyle,
                marginLeft: 8,
                ...(pipToggleHover ? getBtnHoverStyle(false) : {}),
              }}
              onMouseEnter={() => setPipToggleHover(true)}
              onMouseLeave={() => setPipToggleHover(false)}
              // 添加触摸事件处理，避免被动监听器问题
              onTouchStart={(e) => {
                if (e.cancelable) {
                  e.preventDefault();
                }
                togglePictureInPicture();
              }}
              onTouchEnd={(e) => {
                if (e.cancelable) {
                  e.preventDefault();
                }
              }}
            >
              {isPiPMode ? '退出画中画' : '开启画中画'}
            </button>
          </div>
          {/* 画中画状态显示 */}
          {isPiPMode && (
            <div
              style={{
                position: 'fixed',
                top: 10,
                right: 10,
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                color: 'white',
                padding: '5px 10px',
                borderRadius: 4,
                fontSize: 12,
                zIndex: 10000,
              }}
            >
              标准画中画模式
            </div>
          )}
          {/* 抠图参数调节控件 */}
          <div style={{ color: 'white', margin: '8px 0', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label>边缘平滑:</label>
            <input
              type="range"
              min="0"
              max="10"
              step="1"
              value={edgeSmoothing}
              onChange={(e) => setEdgeSmoothing(parseInt(e.target.value))}
              style={{ 
                width: 150,
                accentColor: '#00e5ff',
                WebkitAppearance: 'none',
                height: '6px',
                borderRadius: '3px',
                backgroundColor: '#00e5ff',
              }}
              // 添加触摸事件处理，避免被动监听器问题
              onTouchStart={(e) => {
                if (e.cancelable) {
                  e.preventDefault();
                }
              }}
              onTouchMove={(e) => {
                if (e.cancelable) {
                  e.preventDefault();
                }
              }}
            />
            <span>{edgeSmoothing}</span>
            <label style={{ marginLeft: 10 }}>绿幕阈值:</label>
            <input
              type="range"
              min="1.0"
              max="3.0"
              step="0.1"
              value={greenThreshold}
              onChange={(e) => setGreenThreshold(parseFloat(e.target.value))}
              style={{ 
                width: 150,
                accentColor: '#00e5ff',
                WebkitAppearance: 'none',
                height: '6px',
                borderRadius: '3px',
                backgroundColor: '#00e5ff',
              }}
              // 添加触摸事件处理，避免被动监听器问题
              onTouchStart={(e) => {
                if (e.cancelable) {
                  e.preventDefault();
                }
              }}
              onTouchMove={(e) => {
                if (e.cancelable) {
                  e.preventDefault();
                }
              }}
            />
            <span>{greenThreshold.toFixed(1)}</span>
            <label style={{ marginLeft: 10 }}>整体透明度:</label>
            <input
              type="range"
              min="0.0"
              max="1.0"
              step="0.05"
              value={globalAlpha}
              onChange={(e) => setGlobalAlpha(parseFloat(e.target.value))}
              style={{ 
                width: 150,
                accentColor: '#00e5ff',
                WebkitAppearance: 'none',
                height: '6px',
                borderRadius: '3px',
                backgroundColor: '#00e5ff',
              }}
              // 添加触摸事件处理，避免被动监听器问题
              onTouchStart={(e) => {
                if (e.cancelable) {
                  e.preventDefault();
                }
              }}
              onTouchMove={(e) => {
                if (e.cancelable) {
                  e.preventDefault();
                }
              }}
            />
            <span>{(globalAlpha * 100).toFixed(0)}%</span>
            <label style={{ marginLeft: 20 }}>抠图模式:</label>
            <div style={{ display: 'flex', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center' }}>
                <input
                  type="radio"
                  name="chromaMode"
                  value="preset"
                  checked={!useCustomColor}
                  onChange={() => setUseCustomColor(false)}
                  style={{ 
                    marginRight: 5,
                    accentColor: '#00e5ff',
                    width: '16px',
                    height: '16px'
                  }}
                  // 添加触摸事件处理，避免被动监听器问题
                  onTouchStart={(e) => {
                    if (e.cancelable) {
                      e.preventDefault();
                    }
                  }}
                />
                预设颜色
              </label>
              <label style={{ display: 'flex', alignItems: 'center' }}>
                <input
                  type="radio"
                  name="chromaMode"
                  value="custom"
                  checked={useCustomColor}
                  onChange={() => setUseCustomColor(true)}
                  style={{ 
                    marginRight: 5,
                    accentColor: '#00e5ff',
                    width: '16px',
                    height: '16px'
                  }}
                  // 添加触摸事件处理，避免被动监听器问题
                  onTouchStart={(e) => {
                    if (e.cancelable) {
                      e.preventDefault();
                    }
                  }}
                />
                自定义颜色
              </label>
            </div>
          </div>
          {/* 预设颜色选择器 */}
          {!useCustomColor && (
            <div style={{ color: 'white', margin: '10px 0', width: 140, position: 'relative', userSelect: 'none' }}>
              <label style={{ display: 'block', marginBottom: 6, color: 'white' }}>预设色块:</label>
              <div
                role="button"
                tabIndex={0}
                onClick={() => setUsePresetColorOpen((v) => !v)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setUsePresetColorOpen((v) => !v);
                  }
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: 4,
                  border: '1px solid rgba(255,255,255,0.3)',
                  backgroundColor: 'transparent',
                  color: 'white',
                  cursor: 'pointer',
                  userSelect: 'none',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontWeight: 'bold',
                  fontSize: 14,
                }}
                aria-haspopup="listbox"
                aria-expanded={usePresetColorOpen}
                // 添加触摸事件处理，避免被动监听器问题
                onTouchStart={(e) => {
                  if (e.cancelable) {
                    e.preventDefault();
                  }
                  setUsePresetColorOpen((v) => !v);
                }}
                onTouchEnd={(e) => {
                  if (e.cancelable) {
                    e.preventDefault();
                  }
                }}
              >
                {presetColors.find(c => c.value === chromaKeyColor)?.label || '请选择'}
                <svg
                  style={{ width: 16, height: 16, transform: usePresetColorOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.3s' }}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
              {usePresetColorOpen && (
                <ul
                  role="listbox"
                  tabIndex={-1}
                  aria-activedescendant={chromaKeyColor}
                  style={{
                    marginTop: 4,
                    border: '1px solid rgba(255,255,255,0.3)',
                    borderRadius: 4,
                    backgroundColor: 'rgba(255, 255, 255, 0.15)',
                    maxHeight: 150,
                    overflowY: 'auto',
                    listStyle: 'none',
                    padding: 0,
                    position: 'absolute',
                    width: '100%',
                    zIndex: 1000,
                    userSelect: 'none',
                  }}
                >
                  {presetColors.map(({ value, label }) => {
                    const isSelected = value === chromaKeyColor;
                    return (
                      <li
                        id={value}
                        key={value}
                        role="option"
                        aria-selected={isSelected}
                        tabIndex={0}
                        onClick={() => {
                          setChromaKeyColor(value);
                          setUsePresetColorOpen(false);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setChromaKeyColor(value);
                            setUsePresetColorOpen(false);
                          }
                        }}
                        style={{
                          padding: '8px 12px',
                          cursor: 'pointer',
                          backgroundColor: isSelected ? '#00e5ff' : 'transparent',
                          color: isSelected ? '#fff' : 'white',
                          fontWeight: isSelected ? '700' : '500',
                          transition: 'background-color 0.2s, color 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.backgroundColor = 'rgba(0, 229, 255, 0.15)';
                            e.currentTarget.style.color = '#00e5ff';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.backgroundColor = 'transparent';
                            e.currentTarget.style.color = 'white';
                          }
                        }}
                        // 添加触摸事件处理，避免被动监听器问题
                        onTouchStart={(e) => {
                          if (e.cancelable) {
                            e.preventDefault();
                          }
                          setChromaKeyColor(value);
                          setUsePresetColorOpen(false);
                        }}
                        onTouchEnd={(e) => {
                          if (e.cancelable) {
                            e.preventDefault();
                          }
                        }}
                      >
                        {label}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
          {/* 自定义颜色选择器 */}
          {useCustomColor && (
            <div style={{ color: 'white', margin: '8px 0', display: 'flex', gap: 10, alignItems: 'center' }}>
              <label>自定义颜色:</label>
              <input
                type="color"
                value={customChromaKeyColor}
                onChange={(e) => setCustomChromaKeyColor(e.target.value)}
                style={{ width: 36, height: 36, border: 'none', cursor: 'pointer' }}
                // 添加触摸事件处理，避免被动监听器问题
                onTouchStart={(e) => {
                  if (e.cancelable) {
                    e.preventDefault();
                  }
                }}
              />
              <span style={{ width: 60, height: 24, backgroundColor: customChromaKeyColor, borderRadius: 4 }} />
              <span>{customChromaKeyColor}</span>
            </div>
          )}
          <button
            onClick={start}
            disabled={isStartedRef.current}
            style={{
              ...(isStartedRef.current ? disabledBtnStyle : frostedGlassBtnStyle),
              ...(startBtnHover && !isStartedRef.current ? getBtnHoverStyle(false) : {}),
            }}
            onMouseEnter={() => setStartBtnHover(true)}
            onMouseLeave={() => setStartBtnHover(false)}
            // 添加触摸事件处理，避免被动监听器问题
            onTouchStart={(e) => {
              if (e.cancelable) {
                e.preventDefault();
              }
              if (!isStartedRef.current) {
                start();
              }
            }}
            onTouchEnd={(e) => {
              if (e.cancelable) {
                e.preventDefault();
              }
            }}
          >
            启动
          </button>
          <button
            onClick={stop}
            disabled={!isStartedRef.current}
            style={{
              ...(!isStartedRef.current ? disabledBtnStyle : frostedGlassBtnStyle),
              ...(stopBtnHover && isStartedRef.current ? getBtnHoverStyle(false) : {}),
            }}
            onMouseEnter={() => setStopBtnHover(true)}
            onMouseLeave={() => setStopBtnHover(false)}
            // 添加触摸事件处理，避免被动监听器问题
            onTouchStart={(e) => {
              if (e.cancelable) {
                e.preventDefault();
              }
              if (isStartedRef.current) {
                stop();
              }
            }}
            onTouchEnd={(e) => {
              if (e.cancelable) {
                e.preventDefault();
              }
            }}
          >
            停止
          </button>
        </>
      )}

      {errorMessage && (
        <div
          style={{
            color: 'red',
            margin: '10px 0',
            padding: '10px',
            background: 'rgba(0,0,0,0.5)',
            borderRadius: 4,
          }}
        >
          <strong>错误:</strong> {errorMessage}
        </div>
      )}
      <div style={{ color: 'white', margin: '10px 0' }}>
        <strong>状态:</strong> {started ? '已连接' : '未连接'} | <strong>模式:</strong> {processingMode} |{' '}
        <strong>视频:</strong> {videoReady ? '就绪' : '加载中'} | <strong>Alpha:</strong>{' '}
        {alphaReady ? '就绪' : '未检测到'} | <strong>WebCodecs:</strong> 不使用 |{' '}
        <strong>连接尝试:</strong> {connectionAttempts}/{maxConnectionAttempts}
      </div>
      {debugInfo && (
        <div
          style={{
            color: 'yellow',
            margin: '10px 0',
            padding: '10px',
            background: 'transparent',
            borderRadius: 4,
            whiteSpace: 'pre-wrap',
          }}
        >
          <strong>调试信息:</strong> {debugInfo}
        </div>
      )}
      {renderVideo && (
        <div id="media" style={{ marginTop: 20, position: 'relative' }}>
          <h2 style={{ color: 'white' }}>管家</h2>
          <audio ref={audioRef} autoPlay />
          {/* 原视频窗口 - 极小化且透明 */}
          <video
            ref={videoRef}
            style={{
              position: 'fixed',
              width: '2px',
              height: '2px',
              opacity: 0.01,
              pointerEvents: 'none',
              left: '10px',
              top: '10px',
            }}
            autoPlay
            playsInline
            muted
          />
          {/* 抠图画布 */}
          <canvas
            ref={canvasRef}
            style={{
              width: zoomWidth,
              height: 'auto',
              display: 'block',
              position: 'relative',
              zIndex: 10,
              backgroundColor: 'transparent',
              maxWidth: '100%',
              boxSizing: 'border-box',
            }}
          />
          {/* 自定义画中画 */}
          {enablePip && !isPiPMode && (
            <video
              ref={pipVideoRef}
              style={{
                position: 'fixed',
                bottom: 10,
                right: 10,
                width: 160,
                height: 'auto',
                backgroundColor: 'transparent',
                zIndex: 10000,
                border: 'none',
                boxShadow: '0 0 15px rgba(255, 255, 255, 0.5)',
                borderRadius: 4,
              }}
              muted
              playsInline
              autoPlay
            />
          )}
        </div>
      )}
      {/* 聊天框区域 - 优化触摸事件处理 */}
      <div
        style={{
          position: 'absolute',
          left: chatPos.left,
          top: chatPos.top,
          width: 320,
          borderRadius: 6,
          padding: 12,
          color: 'white',
          userSelect: 'none',
          cursor: draggingRef.current ? 'grabbing' : 'grab',
          zIndex: 9999,
          backgroundColor: 'rgba(255, 255, 255, 0.1)',  // 半透明背景
          backdropFilter: 'blur(10px)',                 // 背景模糊
          border: '1px solid rgba(255,255,255,0.3)',
          boxShadow: '0 4px 10px rgba(255, 255, 255, 0.15)',
          overflow: 'hidden',                           // 防止内容溢出
        }}
        onMouseDown={onDragStart}
        onMouseMove={onDragMove}
        onMouseUp={onDragEnd}
        onMouseLeave={onDragEnd}
        onTouchStart={onDragStart}
        onTouchMove={onDragMove}
        onTouchEnd={onDragEnd}
      >
        <form
          id="echo-form"
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          <textarea
            ref={textareaRef}
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            style={{
              width: '95%',//内框大小
              resize: 'vertical',
              padding: 8,
              borderRadius: 8,
              border: '0.8px solid rgba(255,255,255,0.3)',
              backgroundColor: 'transparent',
              color: 'white',
              outline: 'none',
              fontWeight: 'bold',
              fontSize: 14,
              userSelect: 'text',
              backdropFilter: 'none',  // 阻止文字模糊
            }}
            placeholder="请输入和管家说的话..."
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => { e.stopPropagation(); }}
            onTouchMove={(e) => { e.stopPropagation(); }}
            onTouchEnd={(e) => { e.stopPropagation(); }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              onClick={handleInterruptClick}
              style={{
                ...frostedGlassBtnStyle,
                padding: '6px 16px',
                fontSize: 14,
              }}
              onMouseEnter={() => setInterruptBtnHover(true)}
              onMouseLeave={() => setInterruptBtnHover(false)}
              onClickCapture={(e) => e.stopPropagation()}
              onTouchStart={(e) => {
                if (e.cancelable) e.preventDefault();
                e.stopPropagation();
                handleInterruptClick();
              }}
              onTouchEnd={(e) => {
                if (e.cancelable) e.preventDefault();
                e.stopPropagation();
              }}
            >
              打断说话
            </button>
            <label
              htmlFor="file-upload"
              style={{
                ...frostedGlassBtnStyle,
                padding: '6px 12px',
                cursor: 'pointer',
              }}
              onClickCapture={(e) => e.stopPropagation()}
              // 添加触摸事件处理
              onTouchStart={(e) => {
                if (e.cancelable) {
                  e.preventDefault();
                }
                e.stopPropagation();
                // 触发文件输入的点击
                const fileInput = document.getElementById('file-upload');
                if (fileInput) {
                  fileInput.click();
                }
              }}
              onTouchEnd={(e) => {
                if (e.cancelable) {
                  e.preventDefault();
                }
                e.stopPropagation();
              }}
            >
              上传文件
            </label>
            <input
              id="file-upload"
              type="file"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <button
              type="submit"
              style={{
                ...frostedGlassBtnStyle,
                padding: '6px 16px',
              }}
              onClickCapture={(e) => e.stopPropagation()}
              // 添加触摸事件处理
              onTouchStart={(e) => {
                if (e.cancelable) {
                  e.preventDefault();
                }
                e.stopPropagation();
                handleSubmit(e);
              }}
              onTouchEnd={(e) => {
                if (e.cancelable) {
                  e.preventDefault();
                }
                e.stopPropagation();
              }}
            >
              发送
            </button>
          </div>
          {uploadStatus && (
            <div style={{ 
              marginTop: '8px', 
              color: uploadStatus.includes('失败') ? 'red' : 'white',
              fontSize: 13
            }}>
              {uploadStatus}
            </div>
          )}
          {file && (
            <div
              style={{
                margin: '10px 0',
                padding: 8,
                border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: 4,
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                color: 'white',
                wordBreak: 'break-all',
              }}
            >
              <p style={{ margin: '0 0 8px 0', fontWeight: '600' }}>
                已选择文件: {file.name}
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  style={{
                    backgroundColor: 'rgba(255, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 0, 0, 0.5)',
                    color: 'white',
                    padding: '4px 8px',
                    cursor: 'pointer',
                    borderRadius: 4,
                    outline: 'none',
                    fontSize: 12,
                  }}
                  onClickCapture={(e) => e.stopPropagation()}
                  // 添加触摸事件处理
                  onTouchStart={(e) => {
                    if (e.cancelable) {
                      e.preventDefault();
                    }
                    e.stopPropagation();
                    setFile(null);
                  }}
                  onTouchEnd={(e) => {
                    if (e.cancelable) {
                      e.preventDefault();
                    }
                    e.stopPropagation();
                  }}
                >
                  移除
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
