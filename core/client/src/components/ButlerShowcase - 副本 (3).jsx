import React, { useState, useRef, useEffect } from 'react';
import { useButler } from './ButlersContext';
import { useRecorderContext } from '../contexts/RecorderProvider';

const activateSoundSrc = '/core/client/ai-butler/sounds/activate.mp3';

// 将 BACKEND_URL 用于上传接口地址，避免未使用警告
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:6010';

export default function ButlerShowcase() {
  const { activeButlerId, butlers, addButler, setActiveButlerId } = useButler();
  const { activateButler } = useRecorderContext();
  const videoRefs = useRef({});
  const activateAudioRef = useRef(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // 管家创建相关状态
  const [butlerName, setButlerName] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // 替换管家的管家ID状态
  const [replaceButlerId, setReplaceButlerId] = useState('');

  // 页面初始化时从后端加载管家数据
  useEffect(() => {
    const fetchInitialButlers = async () => {
      try {
        console.log('[ButlerShowcase] 从后端加载初始管家数据...');
        const response = await fetch(`${BACKEND_URL}/api/butlers`);
        if (!response.ok) throw new Error(`HTTP错误: ${response.status}`);
        
        const data = await response.json();
        if (data.success) {
          // 关键日志：打印后端返回的管家数量
          console.log('[ButlerShowcase] 后端返回管家总数:', data.butlers?.length || 0);
          console.log('[ButlerShowcase] 后端返回的管家列表:', data.butlers);
          
          if (data.butlers && data.butlers.length > 0 && data.activeButlerId) {
            setActiveButlerId(data.activeButlerId);
          }
        }
      } catch (err) {
        console.error('[ButlerShowcase] 加载初始管家数据失败:', err);
      }
    };

    fetchInitialButlers();
  }, [setActiveButlerId]);

  // 全局状态更新时刷新视频
  useEffect(() => {
    console.log('[ButlerShowcase] 全局activeButlerId更新为:', activeButlerId);
    const activeVideo = videoRefs.current[activeButlerId];
    if (activeVideo) {
      activeVideo.load();
      activeVideo.play().catch(e => 
        console.warn(`播放视频 ${activeButlerId} 失败`, e)
      );
    }
  }, [activeButlerId]);

  // 初始化视频状态及激活亮灯动画控制
  useEffect(() => {
    butlers.forEach(({ id, src }) => {
      const video = videoRefs.current[id];
      if (!video) return;
      const isActive = id === activeButlerId;

      // 关键修复：生成完整的绝对路径（解决相对路径导致的404）
      let videoSrcAbsolute;
      try {
        // 处理绝对路径和相对路径两种情况
        if (src.startsWith('http://') || src.startsWith('https://')) {
          videoSrcAbsolute = src;
        } else {
          // 拼接后端基础URL，生成完整路径
          videoSrcAbsolute = new URL(src, BACKEND_URL).href;
        }
        console.log(`[视频路径修复] 管家ID: ${id}, 原始路径: ${src}, 修正后路径: ${videoSrcAbsolute}`);
      } catch (err) {
        console.error(`[视频路径错误] 解析失败: ${src}`, err);
        videoSrcAbsolute = src; // 失败时使用原始路径
      }

      // 仅在路径变化时更新，避免重复加载
      if (video.src !== videoSrcAbsolute) {
        video.src = videoSrcAbsolute;
      }

      // 原有状态逻辑
      if (isActive) {
        video.style.filter = 'none';
        video.muted = false;
      } else {
        video.pause();
        video.currentTime = 0;
        video.style.filter = 'grayscale(100%) brightness(65%)';
      }
    });
  }, [activeButlerId, butlers, BACKEND_URL]); // 添加BACKEND_URL依赖


  // 处理视频播放暂停并控制激活管家动画和亮灯，支持鼠标悬停亮灯动画
  useEffect(() => {
    butlers.forEach(({ id }) => {
      const isActive = id === activeButlerId;
      const isHovered = id === hoveredId;
      const video = videoRefs.current[id];
      if (!video) return;
      if (isActive || isHovered) {
        if (video.paused) {
          video.play().catch(() => {});
        }
        video.style.filter = 'none';
        video.style.transition = 'filter 0.3s ease';
      } else {
        if (!video.paused) {
          video.pause();
          video.currentTime = 0;
        }
        video.style.filter = 'grayscale(100%) brightness(65%)';
        video.style.transition = 'filter 0.3s ease';
      }
    });
  }, [hoveredId, activeButlerId, butlers]);

  // 双击切换管家处理（添加后端同步）
  async function handleDoubleClick(id) {
    if (id === activeButlerId) {
      console.log('[ButlerShowcase] 已激活该管家，无需切换');
      return;
    }
    if (loading) return;

    setLoading(true);
    setError(null);
    console.log('[ButlerShowcase] 尝试切换到管家:', id);

    try {
      // 1. 同步后端激活状态
      console.log('[ButlerShowcase] 同步后端激活状态:', id);
      const response = await fetch(`${BACKEND_URL}/api/butlers/active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeButlerId: id })
      });

      const result = await response.json();
      if (!result.success) {
        throw new Error(`更新激活状态失败: ${result.error || '未知错误'}`);
      }

      // 2. 调用原有激活逻辑
      if (typeof activateButler !== 'function') {
        throw new Error('activateButler未定义，请检查RecorderProvider');
      }
      await activateButler(id);

      // 3. 更新本地状态
      setActiveButlerId(id);
      
      const audio = activateAudioRef.current;
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }
    } catch (err) {
      console.error('[ButlerShowcase] 切换失败:', err);
      setError(err.message || '切换失败，请重试');
    } finally {
      setLoading(false);
    }
  }

  // 处理文件选择
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      console.log('选中文件:', file.name, '大小:', file.size);
      if (file.type !== 'video/mp4' || file.size === 0) {
        setStatusMessage('请选择有效的MP4格式视频文件');
        setSelectedFile(null);
        return;
      }
      setSelectedFile(file);
      setStatusMessage(`已选择文件: ${file.name}`);
    }
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
  
    if (!butlerName.trim()) {
      setStatusMessage('请输入管家名称');
      return;
    }
    if (!selectedFile) {
      setStatusMessage('请选择视频文件');
      return;
    }
  
    setIsProcessing(true);
    setStatusMessage('正在上传并制作管家形象...');
    setUploadProgress(0);
  
    try {
      const formData = new FormData();
      formData.append('name', butlerName.trim());
      formData.append('video', selectedFile);
  
      if (replaceButlerId) {
        formData.append('replace_butler_id', replaceButlerId);
      }
  
      const uploadUrl = `${BACKEND_URL.replace(/\/$/, '')}/api/make_human?make_now=true`;
  
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', uploadUrl, true);
  
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percentCompleted = Math.round((event.loaded * 100) / event.total);
            setUploadProgress(percentCompleted);
          }
        };
  
        xhr.onload = () => {
          console.log('上传完成，状态码:', xhr.status);
          console.log('响应:', xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const result = JSON.parse(xhr.responseText);
              if (result.success) {
                setStatusMessage(`制作成功！管家名称: ${butlerName}`);
                if (typeof addButler === 'function') {
                  const videoPreviewPathRaw = (result.video_preview_path || '').replace(/\\/g, '/').trim();

                  let videoSrc = videoPreviewPathRaw;
                  if (videoSrc && !videoSrc.startsWith('/')) {
                    videoSrc = '/' + videoSrc;
                  }
                  
                  // 修正路径，去掉开头的多余 "/web"
                  videoSrc = videoSrc.replace(/^\/core\/client\/web\//, '/core/client/');
                  
                  if (!videoSrc) {
                    videoSrc = `/core/server/virtual_human/wav2lip/${butlerName.trim()}.mp4`;
                  }
                  

                  const newButler = {
                    id: result.butler_id || Date.now().toString(),
                    name: butlerName.trim(),
                    type: 'video',
                    src: videoSrc,
                  };

                  console.log('[上传完成] 新管家数据:', newButler, '替换管家ID:', replaceButlerId);
                  addButler(newButler, replaceButlerId);
                  setActiveButlerId(newButler.id);

                  // 上传成功后从后端刷新最新数据
                  setTimeout(async () => {
                    try {
                      const response = await fetch(`${BACKEND_URL}/api/butlers`);
                      const data = await response.json();
                      if (data.success && data.activeButlerId) {
                        setActiveButlerId(data.activeButlerId);
                      }
                    } catch (err) {
                      console.error('[ButlerShowcase] 上传后刷新激活状态失败:', err);
                    }
                  }, 1000);
                }

                setTimeout(() => {
                  setButlerName('');
                  setSelectedFile(null);
                  setUploadProgress(0);
                  setReplaceButlerId('');
                }, 3000);
                resolve();
              } else {
                setStatusMessage(`制作失败: ${result.error || result.message || '未知错误'}`);
                reject(new Error(result.error || result.message || '未知错误'));
              }
            } catch (err) {
              setStatusMessage('返回数据解析失败');
              reject(err);
            }
          } else {
            setStatusMessage(`上传失败，状态码: ${xhr.status}`);
            reject(new Error(`上传失败，状态码: ${xhr.status}`));
          }
        };
  
        xhr.onerror = () => {
          console.error('上传请求失败');
          setStatusMessage('上传请求失败，请检查网络连接');
          reject(new Error('上传请求失败'));
        };
  
        xhr.send(formData);
      });
    } catch (error) {
      console.error('上传失败', error);
      if (!statusMessage.includes('失败')) {
        setStatusMessage(`请求失败: ${error.message}`);
      }
    } finally {
      setIsProcessing(false);
    }
  };


  return (
    <>
      <audio ref={activateAudioRef} src={activateSoundSrc} preload="auto" />
      
      {/* 错误提示 */}
      {error && (
        <div style={{
          color: 'red',
          textAlign: 'center',
          padding: 10,
          backgroundColor: 'rgba(255,0,0,0.1)',
          borderRadius: 4,
          marginBottom: 20,
          maxWidth: 600,
          marginLeft: 'auto',
          marginRight: 'auto',
        }}>
          {error}
        </div>
      )}

      <div
        className="steward-gallery"
        style={{
          fontFamily: 'Arial, sans-serif',
          backgroundColor: 'transparent',
          padding: 40,
          minHeight: '100vh',
          userSelect: 'none',
        }}
      >
        <div
          className="display-case"
          style={{
            position: 'relative',
            maxWidth: 1400, /* 扩大容器宽度，容纳更多管家 */
            margin: '0 auto',
            borderRadius: 8,
            overflow: 'visible',
            backgroundColor: 'transparent',
            boxShadow: 'none',
          }}
        >
          <div
            className="case-top"
            style={{ height: 20, backgroundColor: 'transparent', boxShadow: 'none' }}
          />
          <div
            className="case-bottom"
            style={{ height: 20, backgroundColor: 'transparent', boxShadow: 'none' }}
          />

          <div
            className="stewards-container"
            style={{
              display: 'flex',
              justifyContent: 'center',
              backgroundColor: 'transparent',
              padding: '30px 0',
              gap: 30, /* 关键修改：增加间距，避免重叠 */
              flexWrap: 'wrap', /* 关键修改：自动换行，支持多管家 */
            }}
          >
            {/* 关键修改：打印当前渲染的管家数量 */}
            {console.log('[渲染] 管家数量:', butlers.length) || butlers.map(({ id, name, type, src }, index) => {
              const isActive = id === activeButlerId;
              const isHovered = id === hoveredId;

              return (
                <div
                  key={id}
                  className={`steward ${isActive ? 'active' : ''} ${isHovered ? 'hovered' : ''}`}
                  onMouseEnter={() => {
                    console.log(`[悬停] 管家 ${name} (${id})`);
                    setHoveredId(id);
                  }}
                  onMouseLeave={() => {
                    setHoveredId(null);
                  }}
                  onDoubleClick={() => {
                    if (!loading) {
                      console.log(`[双击] 激活管家 ${name} (${id})`);
                      handleDoubleClick(id);
                    }
                  }}
                  style={{
                    position: 'relative',
                    width: 240,
                    height: 480,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    cursor: loading && id !== activeButlerId ? 'not-allowed' : 'pointer',
                    transition: 'transform 0.3s ease',
                    transform: isHovered ? 'translateY(-10px)' : 'translateY(0)',
                    userSelect: 'none',
                    marginRight: 0, /* 关键修改：移除右侧margin，用gap控制间距 */
                    zIndex: 1,
                    opacity: loading && id !== activeButlerId ? 0.7 : 1,
                    pointerEvents: 'auto',  // 保证事件总是能触发
                  }}
                  title={isActive ? `当前激活管家：${name}` : `双击切换到管家 ${name}`}
                >
                  <div
                    className="glass-panel"
                    style={{
                      width: 180,
                      height: 340,
                      borderRadius: 28,
                      position: 'relative',
                      padding: 2,
                      background:
                        'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.03) 100%)',
                      boxShadow: isActive 
                        ? '0 8px 50px rgba(0, 229, 255, 0.6), inset 0 0 80px rgba(255, 255, 255, 0.2)'
                        : '0 8px 50px rgba(0, 229, 255, 0.4), inset 0 0 80px rgba(255, 255, 255, 0.15)',
                      backdropFilter: 'blur(20px)',
                      WebkitBackdropFilter: 'blur(20px)',
                      border: '3px solid rgba(255, 255, 255, 0.45)',
                      overflow: 'hidden',
                      userSelect: 'none',
                      filter: isActive
                        ? 'drop-shadow(0 0 35px rgba(0,229,255,1))'
                        : 'grayscale(100%) brightness(70%)',
                      transition: 'all 0.3s ease',
                      zIndex: 1,
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        pointerEvents: 'none',
                        borderRadius: 28,
                        backgroundImage:
                          'radial-gradient(rgba(255,255,255,0.15) 1.5px, transparent 1.5px)',
                        backgroundSize: '7px 7px',
                        mixBlendMode: 'overlay',
                        zIndex: 5,
                        opacity: 0.22,
                      }}
                    />
                    <div
                      className="glossy-edge"
                      style={{
                        position: 'absolute',
                        top: -40,
                        left: -40,
                        width: 260,
                        height: 420,
                        borderRadius: 40,
                        pointerEvents: 'none',
                        background:
                          'radial-gradient(circle at 15% 30%, rgba(255,255,255,0.5), transparent 65%),' +
                          'radial-gradient(circle at 85% 70%, rgba(255,255,255,0.35), transparent 70%)',
                        filter: 'blur(18px)',
                        opacity: 0.7,
                        animation: 'glossyFlow 5.5s linear infinite',
                        zIndex: 6,
                      }}
                    />

                    {type === 'image' ? (
                      <img
                        src={src}
                        alt={name}
                        draggable={false}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          borderRadius: 20,
                          position: 'relative',
                          zIndex: 10,
                          boxShadow: isActive
                            ? '0 0 24px rgba(0, 229, 255, 1)'
                            : 'none',
                          transition: 'box-shadow 0.3s ease',
                          userSelect: 'none',
                        }}
                      />
                    ) : (
                      <video
                        key={id}
                        ref={(el) => {
                          if (el) {
                            videoRefs.current[id] = el;
                            // 打印视频元素状态
                            console.log(`[视频绑定] 管家 ${name} (${id}) 视频元素已绑定`, el);
                          }
                        }}
                        src={src}
                        autoPlay={false}
                        loop
                        muted
                        playsInline
                        preload="auto"
                        onError={() => {
                          console.error(`[视频错误] 管家 ${name} (${id}) 视频加载失败，src: ${src}`);
                          setStatusMessage(`管家【${name}】视频加载失败，请检查视频路径或网络。`);
                        }}
                        onPlay={() => {
                          console.log(`[视频播放] 管家 ${name} (${id}) 视频开始播放`);
                        }}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          borderRadius: 20,
                          position: 'relative',
                          zIndex: 10,
                          userSelect: 'none',
                          pointerEvents: 'none', // 让事件穿透父元素
                          filter: isActive || isHovered
                            ? 'none'
                            : 'grayscale(100%) brightness(70%)',
                          transition: 'filter 0.3s ease',
                          boxShadow: isActive || isHovered
                            ? '0 0 24px rgba(0, 229, 255, 1)'
                            : 'none',
                        }}
                      />
                    )}
                  </div>

                  <div
                    style={{
                      width: 120,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor:
                        isActive || isHovered ? '#00e5ff' : '#666',
                      boxShadow:
                        isActive || isHovered
                          ? '0 0 12px #00e5ff'
                          : 'none',
                      marginBottom: 6,
                      transition: 'background-color 0.3s, box-shadow 0.3s',
                      zIndex: 1,
                    }}
                  />

                  <div
                    className="indicator-light"
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      backgroundColor:
                        isActive || isHovered ? '#00e5ff' : '#555',
                      boxShadow:
                        isActive || isHovered
                          ? '0 0 20px #00e5ff'
                          : 'none',
                      marginTop: 6,
                      transition: 'background-color 0.3s, box-shadow 0.3s',
                      zIndex: 1,
                    }}
                  />

                  <div
                    style={{
                      color: isActive ? '#0ff' : '#ccc',
                      fontWeight: 'bold',
                      textAlign: 'center',
                      userSelect: 'none',
                      textShadow: isActive ? '0 0 8px #0ff' : 'none',
                      whiteSpace: 'nowrap',
                      fontSize: 18,
                      marginTop: 12,
                      zIndex: 1,
                    }}
                  >
                    {name}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 管家形象制作表单 */}
        <div style={{
          maxWidth: 800,
          margin: '50px auto 0',
          padding: 25,
          borderRadius: 12,
          background: 'transparent',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: '1px solid rgba(0, 229, 255, 0.3)',
          boxShadow: '0 4px 30px rgba(0, 229, 255, 0.1)',
        }}>
          <h3 style={{ 
            color: '#00e5ff', 
            marginBottom: 20, 
            fontSize: 22, 
            textAlign: 'center',
            textShadow: '0 0 10px rgba(0, 229, 255, 0.5)'
          }}>创建新管家形象</h3>
          
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label style={{ color: 'white', display: 'block', marginBottom: 8, fontSize: 16 }}>
                管家名称:
              </label>
              <input
                type="text"
                value={butlerName}
                onChange={(e) => setButlerName(e.target.value)}
                placeholder="请输入管家名称"
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 6,
                  border: '1px solid rgba(0, 229, 255, 0.5)',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  color: 'white',
                  fontSize: 16,
                  outline: 'none',
                  transition: 'border-color 0.3s',
                }}
                disabled={isProcessing}
                aria-required="true"
              />
            </div>

            <div>
              <label style={{ color: 'white', display: 'block', marginBottom: 8, fontSize: 16 }}>
                上传MP4视频:
              </label>
              <div style={{
                border: '2px dashed rgba(0, 229, 255, 0.5)',
                borderRadius: 6,
                padding: 20,
                textAlign: 'center',
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                transition: 'border-color 0.3s',
                position: 'relative',
              }}>
                <input
                  type="file"
                  accept="video/mp4"
                  onChange={handleFileChange}
                  style={{ 
                    position: 'absolute', 
                    top: 0, 
                    left: 0, 
                    width: '100%', 
                    height: '100%', 
                    opacity: 0, 
                    cursor: isProcessing ? 'not-allowed' : 'pointer' 
                  }}
                  disabled={isProcessing}
                  aria-required="true"
                />
                <div style={{ pointerEvents: 'none' }}>
                  <i className="fa fa-upload" style={{ fontSize: 24, color: '#00e5ff', marginBottom: 10 }} />
                  <p style={{ color: 'white', margin: 0 }}>
                    {selectedFile 
                      ? `已选择: ${selectedFile.name}` 
                      : '点击或拖拽MP4格式视频文件到此处'}
                  </p>
                  <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: 14, marginTop: 5 }}>
                    视频格式: MP4, 建议分辨率: 720x1280
                  </p>
                </div>
              </div>
            </div>

            {/* 替换已有管家选择 */}
            {butlers.length >= 4 && (
            <div>
              <label style={{ color: 'white', display: 'block', marginBottom: 8, fontSize: 16 }}>
                管家数量已满4个，您可以点击选择替换现有管家:
              </label>
              <div style={{
                display: 'flex',
                gap: 12,
                flexWrap: 'wrap',
              }}>
                {butlers.map(({ id, name }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => { if (!isProcessing) setReplaceButlerId(id); }}
                    disabled={isProcessing}
                    style={{
                      flex: '1 1 120px',
                      padding: '10px 14px',
                      borderRadius: 6,
                      border: id === replaceButlerId ? '2px solid #00e5ff' : '1px solid rgba(0, 229, 255, 0.5)',
                      backgroundColor: id === replaceButlerId ? 'rgba(0, 229, 255, 0.3)' : 'transparent',
                      color: 'white',
                      fontWeight: id === replaceButlerId ? 'bold' : 'normal',
                      cursor: isProcessing ? 'not-allowed' : 'pointer',
                      transition: 'all 0.3s',
                      userSelect: 'none',
                    }}
                    title={`点击替换管家 ${name}`}
                  >
                    {name} ({id})
                  </button>
                ))}
              </div>
              <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: 14, marginTop: 5 }}>
                选择后上传将替换此管家，未选择则新增管家（管家数未满时有效）
              </p>
            </div>
          )}

            {/* 上传进度条 */}
            {uploadProgress > 0 && (
              <div>
                <div style={{ color: 'white', marginBottom: 5, fontSize: 16 }}>
                  上传进度: {uploadProgress}%
                </div>
                <div style={{
                  height: 8,
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: 4,
                  overflow: 'hidden'
                }}>
                  <div
                    style={{
                      width: `${uploadProgress}%`,
                      height: '100%',
                      backgroundColor: '#00e5ff',
                      transition: 'width 0.3s ease',
                      borderRadius: 4,
                    }}
                  />
                </div>
              </div>
            )}

            {/* 状态消息 */}
            {statusMessage && (
              <div style={{
                padding: 12,
                borderRadius: 6,
                backgroundColor: isProcessing 
                  ? 'rgba(0, 229, 255, 0.15)' 
                  : statusMessage.includes('成功')
                    ? 'rgba(40, 167, 69, 0.15)'
                    : 'rgba(220, 53, 69, 0.15)',
                color: isProcessing ? '#00e5ff' : statusMessage.includes('成功') ? '#28a745' : '#dc3545',
                fontSize: 16,
                lineHeight: 1.5,
              }}>
                {statusMessage}
              </div>
            )}

            {/* 提交按钮 */}
            <button
              type="submit"
              style={{
                padding: '14px 20px',
                backgroundColor: 'transparent',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                fontSize: 18,
                fontWeight: 'bold',
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                transition: 'all 0.3s',
                boxShadow: '0 0 15px rgba(0, 229, 255, 0.5)',
                position: 'relative',
                overflow: 'hidden',
              }}
              disabled={isProcessing}
            >
              {isProcessing 
                ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="fa fa-spinner fa-spin" style={{ marginRight: 10 }} />
                    正在制作...
                  </div>
                : '开始制作管家形象'}
              
              <span style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: 300,
                height: 300,
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                borderRadius: '50%',
                transform: 'translate(-50%, -50%) scale(0)',
                transition: 'transform 0.5s ease',
                pointerEvents: 'none',
              }} 
              className={isProcessing ? '' : 'button-hover-effect'} />
            </button>
          </form>
        </div>
      </div>

      <style>{`
        @keyframes glossyFlow {
          0% {
            background-position: 0% 0%, 100% 100%;
          }
          100% {
            background-position: 100% 100%, 0% 0%;
          }
        }
        
        /* 按钮悬停效果动画 */
        .button-hover-effect:hover {
          transform: translate(-50%, -50%) scale(1);
          opacity: 0;
        }
      `}</style>
    </>
  );
}
