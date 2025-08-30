import React, { useEffect, useRef, useState } from 'react';

export default function OldWebRTC({ renderVideo = true, keepConnection = false }) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const pcRef = useRef(null);
  const textareaRef = useRef(null);
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const animationFrameIdRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const pipVideoRef = useRef(null); // 自定义画中画 video 引用
  const hiddenVideoRef = useRef(null); // 标准画中画隐藏视频元素
  const isPiPModeChangingRef = useRef(false); // 画中画模式切换中标志
  const pipExitReasonRef = useRef(''); // 画中画退出原因
  const isStoppingRef = useRef(false); // 应用正在停止的标志

  const containerRef = useRef(null);

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

  // 标记开始及视频就绪状态，方便外部跳出循环等
  const isStartedRef = useRef(false);
  const isVideoReadyRef = useRef(false);
  
  // 记录画中画启用前的 canvas 状态
  const pipCanvasStreamRef = useRef(null);
  const wasCanvasVisibleRef = useRef(true);
  const isPipActiveRef = useRef(false); // 画中画激活状态

  // 新增：边缘平滑参数
  const [edgeSmoothing, setEdgeSmoothing] = useState(2);
  // 新增：绿幕敏感度参数
  const [greenThreshold, setGreenThreshold] = useState(1.3);

  // 新增：抠图色块选择，默认绿
  const [chromaKeyColor, setChromaKeyColor] = useState('green'); // 'green' | 'blue' | 'red'
  // 新增：色盘选择的自定义颜色
  const [customChromaKeyColor, setCustomChromaKeyColor] = useState('#00FF00'); // 默认绿色
  // 新增：自定义颜色模式开关
  const [useCustomColor, setUseCustomColor] = useState(false);

  const SIGNALING_URL = '/offer';
  const zoomStep = 50;

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

  const draggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  function onDragStart(e) {
    if (e.target.tagName.toLowerCase() === 'textarea') {
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
    if (e.type === 'touchmove' && e.touches?.[0]) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
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
    let newTop = clientY - containerRef.current.offsetTop - dragOffsetRef.current.y;
    newLeft = Math.min(Math.max(0, newLeft), containerRect.width - chatWidth);
    newTop = Math.min(Math.max(0, newTop), containerRect.height - chatHeight);
    setChatPos({ left: newLeft, top: newTop });
    e.preventDefault();
    e.stopPropagation();
  }
  function onDragEnd(e) {
    if (draggingRef.current) {
      draggingRef.current = false;
      localStorage.setItem('chatbox-position', JSON.stringify(chatPos));
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function calculateTransparencyPercentage(data) {
    if (!data || data.length === 0) return '0.00';
    let transparentPixels = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] === 0) {
        transparentPixels++;
      }
    }
    return ((transparentPixels / (data.length / 4)) * 100).toFixed(2);
  }

  // 改进的绿幕抠图算法，增加边缘平滑处理，支持多色抠图（绿、蓝、红）和自定义颜色
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

      // 解析自定义颜色为 RGB 值
      const hexToRgb = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16)
        } : null;
      };
      
      // 自定义颜色的 RGB 值
      const customRgb = hexToRgb(customChromaKeyColor);
      const customR = customRgb?.r || 0;
      const customG = customRgb?.g || 255;
      const customB = customRgb?.b || 0;
      
      // 选择抠图色块阈值和判断函数
      // 这里使用简易的色块抠图逻辑，根据选择不同色块，调整判定条件
      // 参数可以根据需要微调
      function shouldMakeTransparent(r, g, b) {
        const threshold = 100; // 基础阈值
        const ratio = greenThreshold; // 之前的阈值参数，复用
        
        if (useCustomColor) {
          // 自定义颜色模式：计算与目标颜色的欧氏距离
          const colorDistance = Math.sqrt(
            Math.pow(r - customR, 2) + 
            Math.pow(g - customG, 2) + 
            Math.pow(b - customB, 2)
          );
          // 距离越小越接近目标颜色，越应该透明
          return colorDistance < threshold * ratio;
        }
        
        // 预设颜色模式
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

      // 第一遍处理：基本抠图色块检测
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        if (shouldMakeTransparent(r, g, b)) {
          data[i + 3] = 0; // 完全透明
        }
      }

      // 第二遍处理：边缘平滑（羽化效果）
      if (edgeSmoothing > 0) {
        const tempData = new Uint8ClampedArray(data);
        const width = canvas.width;
        const height = canvas.height;
        const radius = edgeSmoothing;

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            if (data[i + 3] === 0) continue; // 已经是透明的，不需要处理

            // 计算周围的透明度
            let transparentNeighbors = 0;
            let totalNeighbors = 0;

            for (let dy = -radius; dy <= radius; dy++) {
              for (let dx = -radius; dx <= radius; dx++) {
                const nx = x + dx;
                const ny = y + dy;

                if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

                const ni = (ny * width + nx) * 4;
                if (tempData[ni + 3] === 0) {
                  transparentNeighbors++;
                }
                totalNeighbors++;
              }
            }

            // 如果周围有透明像素，说明这是边缘，应用羽化效果
            if (transparentNeighbors > 0 && totalNeighbors > 0) {
              const ratio = transparentNeighbors / totalNeighbors;
              data[i + 3] = Math.round(data[i + 3] * (1 - ratio));
            }
          }
        }
      }

      ctx.putImageData(frame, 0, 0);

      const transparencyPercentage = calculateTransparencyPercentage(data);
      setDebugInfo(`抠图透明度: ${transparencyPercentage}% | 边缘平滑: ${edgeSmoothing} | 阈值: ${greenThreshold} | 色块: ${useCustomColor ? '自定义' : chromaKeyColor}${useCustomColor ? `(${customChromaKeyColor})` : ''}`);
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

  function zoomIn() {
    setZoomWidth((w) => w + zoomStep);
  }
  function zoomOut() {
    setZoomWidth((w) => (w - zoomStep > 0 ? w - zoomStep : w));
  }

  // 改进的标准画中画实现，增加稳定性和详细日志
  async function togglePictureInPicture() {
    // 如果正在切换模式，不重复操作
    if (isPiPModeChangingRef.current) {
      console.log('忽略画中画切换请求：正在切换中');
      return;
    }
    
    isPiPModeChangingRef.current = true;
    pipExitReasonRef.current = '';
    
    try {
      if (document.pictureInPictureElement) {
        // 如果已有画中画元素，则退出
        isStoppingRef.current = true;
        console.log('尝试退出标准画中画模式');
        await document.exitPictureInPicture();
        console.log('已成功退出标准画中画模式');
        isStoppingRef.current = false;
        setIsPiPMode(false);
      } else {
        // 进入标准画中画模式
        console.log('尝试进入标准画中画模式');
        
        // 检查浏览器是否支持画中画
        if (!document.pictureInPictureEnabled) {
          throw new Error('浏览器不支持画中画功能');
        }
        
        // 创建或获取隐藏的视频元素
        if (!hiddenVideoRef.current) {
          const videoElement = document.createElement('video');
          videoElement.style.display = 'none';
          document.body.appendChild(videoElement);
          hiddenVideoRef.current = videoElement;
          
          // 添加事件监听，处理画中画状态变化
          videoElement.addEventListener('enterpictureinpicture', () => {
            console.log('进入标准画中画模式 - 视频元素状态:', videoElement.readyState);
            console.log('画中画元素尺寸:', videoElement.videoWidth, 'x', videoElement.videoHeight);
            setIsPiPMode(true);
            isPiPModeChangingRef.current = false;
          });
          
          videoElement.addEventListener('leavepictureinpicture', () => {
            console.log('退出标准画中画模式 - 原因:', pipExitReasonRef.current || '未知');
            console.log('画中画退出时视频元素状态:', videoElement.readyState);
            setIsPiPMode(false);
            isPiPModeChangingRef.current = false;
          });
          
          // 添加错误监听
          videoElement.addEventListener('error', (e) => {
            console.error('画中画视频元素错误:', e);
            console.error('错误详情:', videoElement.error);
            setErrorMessage('画中画视频元素错误');
            isPiPModeChangingRef.current = false;
          });
          
          // 添加暂停事件监听
          videoElement.addEventListener('pause', () => {
            console.log('画中画视频暂停');
            if (isPiPMode) {
              pipExitReasonRef.current = '视频暂停';
              // 尝试继续播放
              videoElement.play().catch(err => {
                console.error('画中画视频暂停后尝试播放失败:', err);
              });
            }
          });
          
          // 添加 ended 事件监听
          videoElement.addEventListener('ended', () => {
            console.log('画中画视频播放结束');
            if (isPiPMode) {
              pipExitReasonRef.current = '视频播放结束';
            }
          });
          
          // 添加 loadedmetadata 事件监听
          videoElement.addEventListener('loadedmetadata', () => {
            console.log('画中画视频元数据加载完成:', 
              videoElement.videoWidth, 'x', videoElement.videoHeight, 
              'duration:', videoElement.duration);
          });
          
          // 添加 timeupdate 事件监听，用于检测视频是否在播放
          let lastTime = 0;
          videoElement.addEventListener('timeupdate', () => {
            if (isPiPMode && videoElement.currentTime === lastTime && !videoElement.paused) {
              console.log('画中画视频时间未更新，可能已停止');
              pipExitReasonRef.current = '视频时间未更新';
            }
            lastTime = videoElement.currentTime;
          });
        }
        
        // 确保Canvas已准备好
        if (!canvasRef.current || !ctxRef.current) {
          setErrorMessage('Canvas未初始化，无法启动画中画');
          isPiPModeChangingRef.current = false;
          return;
        }
        
        // 检查Canvas是否有内容
        if (canvasRef.current.width === 0 || canvasRef.current.height === 0) {
          console.error('Canvas尺寸为0，无法启动画中画');
          setErrorMessage('Canvas尺寸为0，无法启动画中画');
          isPiPModeChangingRef.current = false;
          return;
        }
        
        // 获取Canvas流并设置到隐藏视频元素
        const stream = canvasRef.current.captureStream(30);
        hiddenVideoRef.current.srcObject = stream;
        console.log('创建Canvas流成功，帧率:', 30);
        
        // 保存当前流的引用，用于后续检查
        pipCanvasStreamRef.current = stream;
        
        // 检查流是否有效
        if (!stream || stream.getTracks().length === 0) {
          throw new Error('Canvas流为空或无效');
        }
        
        // 播放视频
        console.log('尝试播放画中画视频元素...');
        await hiddenVideoRef.current.play();
        console.log('画中画视频元素播放成功');
        
        // 进入画中画模式
        console.log('尝试请求进入画中画模式...');
        await hiddenVideoRef.current.requestPictureInPicture();
        console.log('成功进入画中画模式');
      }
    } catch (e) {
      console.error('标准画中画错误:', e);
      console.error('错误堆栈:', e.stack);
      setErrorMessage(`标准画中画错误: ${e.message}`);
      pipExitReasonRef.current = e.message;
      
      // 如果标准画中画失败，尝试使用自定义画中画
      if (!isPiPMode) {
        setEnablePip((v) => !v);
      }
    } finally {
      isPiPModeChangingRef.current = false;
    }
  }

  // 新增：通知后端停止处理的函数
  async function notifyBackendStop() {
    try {
      console.log('通知后端停止处理...');
      const response = await fetch('http://192.168.168.77:6010/api/stop_stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        console.error(`后端停止请求失败: ${response.status}`);
      } else {
        console.log('后端已确认停止处理');
      }
    } catch (e) {
      console.error('通知后端停止时发生错误:', e);
    }
  }

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

    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        // 如果处于画中画模式，尝试重新连接而不是完全停止
        if (isPiPMode) {
          console.log('WebRTC连接断开，但处于画中画模式，尝试重新连接');
          setErrorMessage('WebRTC连接断开，尝试重连');
          if (!reconnectTimerRef.current) {
            reconnectTimerRef.current = setTimeout(() => {
              if (isStartedRef.current) {
                // 只重新协商连接，不停止整个应用
                negotiate();
              }
            }, 2000);
          }
        } else {
          // 非画中画模式下的正常处理
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
                videoRef.current.videoWidth, 'x', videoRef.current.videoHeight, 
                'duration:', videoRef.current.duration);

              const canvas = canvasRef.current;
              // 修改：添加willReadFrequently参数
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

              // 如果启用了画中画，延迟启动以确保Canvas已初始化
              if (enablePip && pipVideoRef.current) {
                setTimeout(() => setupPipStream(), 100);
              }
            },
            { once: true }
          );
          
          // 添加视频状态监听
          videoRef.current.addEventListener('play', () => {
            console.log('主视频开始播放');
          });
          
          videoRef.current.addEventListener('pause', () => {
            console.log('主视频已暂停');
          });
          
          videoRef.current.addEventListener('ended', () => {
            console.log('主视频播放结束');
          });
          
          videoRef.current.addEventListener('error', () => {
            console.error('主视频错误:', videoRef.current.error);
          });
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
  }

  // 改进的画中画流设置，增加错误处理和状态管理
  async function setupPipStream() {
    if (!canvasRef.current || !pipVideoRef.current || isPipActiveRef.current) return;
    
    try {
      // 保存当前 canvas 状态
      wasCanvasVisibleRef.current = canvasRef.current.style.display !== 'none';
      
      // 创建 canvas 流
      pipCanvasStreamRef.current = canvasRef.current.captureStream(30);
      pipVideoRef.current.srcObject = pipCanvasStreamRef.current;
      
      // 标记画中画已激活
      isPipActiveRef.current = true;
      
      // 确保视频播放
      await pipVideoRef.current.play();
      
      console.log('自定义画中画已成功启动');
    } catch (err) {
      console.error('自定义画中画视频播放失败:', err);
      setErrorMessage('自定义画中画功能启动失败');
      
      // 重置状态
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

  function stopPipStream() {
    if (!isPipActiveRef.current) return;
    
    try {
      // 停止流
      if (pipCanvasStreamRef.current) {
        pipCanvasStreamRef.current.getTracks().forEach(track => track.stop());
        pipCanvasStreamRef.current = null;
      }
      
      if (pipVideoRef.current) {
        pipVideoRef.current.srcObject = null;
      }
      
      // 恢复主 canvas 显示状态
      if (wasCanvasVisibleRef.current) {
        canvasRef.current.style.display = '';
      }
      
      // 标记画中画已停用
      isPipActiveRef.current = false;
      console.log('自定义画中画已成功关闭');
    } catch (err) {
      console.error('自定义画中画关闭时出错:', err);
    }
  }

  // 修改：完全停止并清理资源，通知后端
  function stop() {
    // 标记正在停止
    isStoppingRef.current = true;
    console.log('开始执行完全停止操作...');
    
    try {
      // 取消动画帧
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
        console.log('已取消动画帧');
      }
      
      // 清除重连计时器
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
        console.log('已清除重连计时器');
      }
      
      // 记录画中画退出原因
      if (isPiPMode) {
        pipExitReasonRef.current = '手动停止应用';
      }
      
      // 停止画中画流
      stopPipStream();
      
      // 退出标准画中画模式
      if (document.pictureInPictureElement) {
        console.log('停止时退出标准画中画模式');
        document.exitPictureInPicture().catch(err => {
          console.error('退出标准画中画失败:', err);
        });
      }
      
      // 移除隐藏视频元素
      if (hiddenVideoRef.current && hiddenVideoRef.current.parentNode) {
        hiddenVideoRef.current.parentNode.removeChild(hiddenVideoRef.current);
        hiddenVideoRef.current = null;
        console.log('已移除隐藏视频元素');
      }
      
      // 停止并清理视频流
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => {
          t.stop();
        });
        videoRef.current.srcObject = null;
        console.log('已停止视频流');
      }
      
      // 停止并清理音频流
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
      
      // 通知后端停止处理
      notifyBackendStop();
      
      // 重置状态
      isStartedRef.current = false;
      isVideoReadyRef.current = false;
      setStarted(false);
      setVideoReady(false);
      setAlphaReady(false);
      setErrorMessage('');
      setDebugInfo('');
      setIsPiPMode(false);
      
      console.log('完全停止操作执行完毕');
    } catch (error) {
      console.error('停止过程中发生错误:', error);
    } finally {
      // 重置停止标志
      isStoppingRef.current = false;
    }
  }

  function updateCanvasSize() {
    if (!videoRef.current || !canvasRef.current) return;
    const ratio = videoRef.current.videoHeight / videoRef.current.videoWidth;
    const width = zoomWidth;
    const height = width * ratio;
    canvasRef.current.style.width = `${width}px`;
    canvasRef.current.style.height = `${height}px`;
  }

  useEffect(() => {
    updateCanvasSize();
    
    if (enablePip && !isPiPMode) {
      // 启用自定义画中画
      setupPipStream();
    } else if (!enablePip && isPipActiveRef.current) {
      // 禁用自定义画中画
      stopPipStream();
    }
  }, [zoomWidth, enablePip, isPiPMode]);

  useEffect(() => {
    // 监听页面可见性变化
    function handleVisibilityChange() {
      console.log('页面可见性变化:', document.visibilityState);
      
      if (document.visibilityState === 'hidden') {
        console.log('页面已隐藏');
        // 页面不可见时，记录画中画可能退出的原因
        if (isPiPMode) {
          pipExitReasonRef.current = '页面隐藏';
        }
        return;
      }
      
      // 页面可见时，确保视频和画中画继续播放
      if (videoRef.current && videoRef.current.paused) {
        console.log('尝试恢复主视频播放');
        videoRef.current.play().catch(err => {
          console.error('恢复主视频播放失败:', err);
        });
      }
      
      if (pipVideoRef.current && enablePip && !isPiPMode && pipVideoRef.current.paused) {
        // 确保自定义画中画视频也在可见时继续播放
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
    
    // 监听页面卸载事件
    function handleBeforeUnload() {
      console.log('页面即将卸载，清理资源');
      // 在页面卸载前，清理画中画资源
      stopPipStream();
      
      // 退出标准画中画模式
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
      stop();
    };
  }, [enablePip, isPiPMode]);

  const [message, setMessage] = useState('');
  const [imageFile, setImageFile] = useState(null);

  function handleImageChange(e) {
    const file = e.target.files[0];
    setImageFile(file || null);
  }

  const sendTextMessage = async () => {
    if (!message.trim()) return;
    try {
      const response = await fetch('https://192.168.168.77:6010/qwener', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message }),
      });
      if (!response.ok) throw new Error('状态码: ' + response.status);
    } catch (error) {
      console.error('文本发送失败:', error);
    }
  };

  const sendMultiModal = async () => {
    if (!imageFile) return;
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const response = await fetch('https://192.168.1.70:6010/multimodal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: message.trim(), image: reader.result }),
        });
        if (!response.ok) throw new Error('状态码: ' + response.status);
        setImageFile(null);
        setMessage('');
      };
      reader.readAsDataURL(imageFile);
    } catch (error) {
      console.error('多模态发送失败:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (imageFile) {
      await sendMultiModal();
    } else {
      await sendTextMessage();
      setMessage('');
    }
  };

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

  const [startBtnHover, setStartBtnHover] = useState(false);
  const [stopBtnHover, setStopBtnHover] = useState(false);
  const [zoomInHover, setZoomInHover] = useState(false);
  const [zoomOutHover, setZoomOutHover] = useState(false);
  const [interruptBtnHover, setInterruptBtnHover] = useState(false);
  const [pipToggleHover, setPipToggleHover] = useState(false);

  const handleInterruptClick = async () => {
    try {
      const resp = await fetch('http://192.168.168.77:6010/api/interrupt_speaking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!resp.ok) throw new Error('状态码: ' + resp.status);
    } catch (e) {
      console.error('打断接口异常:', e);
    }
  };

  return (
    <div ref={containerRef} style={{ maxWidth: 1280, position: 'relative', minHeight: '100vh' }}>
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
        >
          {isPiPMode ? '退出画中画' : '开启画中画'}
        </button>
      </div>

      {/* 新增：画中画状态显示 */}
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

      {/* 新增：抠图参数调节控件 */}
      <div style={{ color: 'white', margin: '8px 0', display: 'flex', gap: 8, alignItems: 'center' }}>
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
            // 添加以下样式来修改滑块颜色
            accentColor: '#00e5ff', // 标准属性（现代浏览器支持）
            WebkitAppearance: 'none', // 清除默认样式
            height: '6px',
            borderRadius: '3px',
            backgroundColor: '#00e5ff', // 轨道背景色
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
            // 添加以下样式来修改滑块颜色
            accentColor: '#00e5ff', // 标准属性（现代浏览器支持）
            WebkitAppearance: 'none', // 清除默认样式
            height: '6px',
            borderRadius: '3px',
            backgroundColor: '#00e5ff', // 轨道背景色
          }}
        />
        <span>{greenThreshold.toFixed(1)}</span>

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
                // 添加自定义样式
                accentColor: '#00e5ff', // 主要颜色（现代浏览器支持）
                width: '16px',
                height: '16px'
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
                // 添加自定义样式
                accentColor: '#00e5ff', // 主要颜色（现代浏览器支持）
                width: '16px',
                height: '16px'
              }}
            />
            自定义颜色
          </label>
        </div>
      </div>

      {/* 预设颜色选择器 */}
      {!useCustomColor && (
        <div style={{ color: 'white', margin: '10px 0', display: 'flex', gap: 10, alignItems: 'center' }}>
          <label>预设色块:</label>
          <select
            value={chromaKeyColor}
            onChange={(e) => setChromaKeyColor(e.target.value)}
            style={{
              backgroundColor: 'transparent',
              color: 'white',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: 4,
              padding: '4px 8px',
              outline: 'none',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            <option value="green">绿色</option>
            <option value="blue">蓝色</option>
            <option value="red">红色</option>
          </select>
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
      >
        停止
      </button>

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
              width: '2px',  // 极小的宽度
              height: '2px', // 极小的高度
              opacity: 0.01, // 几乎透明但不完全透明
              pointerEvents: 'none', // 防止遮挡其他元素
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
              // 当启用标准画中画时，不隐藏主 canvas
              // display: isPiPMode ? 'none' : '',
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
          backdropFilter: 'blur(10px)',
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          border: '1px solid rgba(255,255,255,0.3)',
          boxShadow: '0 4px 10px rgba(255, 255, 255, 0.15)',
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
              width: '100%',
              resize: 'vertical',
              padding: 8,
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.3)',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              color: 'white',
              outline: 'none',
              fontWeight: 'bold',
              fontSize: 14,
            }}
            placeholder="请输入文本..."
            onClick={(e) => e.stopPropagation()}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              type="button"
              onClick={handleInterruptClick}
              style={{
                ...frostedGlassBtnStyle,
                padding: '6px 16px',
                fontSize: 14,
                color: 'white',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255,255,255,0.3)',
                boxShadow: '0 4px 10px rgba(255, 255, 255, 0.15)',
              }}
              onMouseEnter={() => setInterruptBtnHover(true)}
              onMouseLeave={() => setInterruptBtnHover(false)}
            >
              打断说话
            </button>
            <label
              htmlFor="image-upload"
              style={{
                ...frostedGlassBtnStyle,
                padding: '6px 12px',
                cursor: 'pointer',
                color: 'white',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255,255,255,0.3)',
                boxShadow: '0 4px 10px rgba(255, 255, 255, 0.15)',
              }}
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
                color: 'white',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255,255,255,0.3)',
                boxShadow: '0 4px 10px rgba(255, 255, 255, 0.15)',
              }}
            >
              发送
            </button>
          </div>
          {imageFile && (
            <div
              style={{
                margin: '10px 0',
                padding: 8,
                border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: 4,
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                color: 'white',
              }}
            >
              <p style={{ margin: '0 0 8px 0', fontWeight: '600' }}>
                已选择图片: {imageFile.name}
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setImageFile(null)}
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
