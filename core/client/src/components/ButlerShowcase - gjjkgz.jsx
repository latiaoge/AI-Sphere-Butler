import React, { useState, useRef, useEffect } from 'react';
import { useButler } from './ButlersContext';
import { useRecorderContext } from '../contexts/RecorderProvider';

const activateSoundSrc = '/core/client/ai-butler/sounds/activate.mp3';
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:6010';

export default function ButlerShowcase() {
  const { activeButlerId, butlers } = useButler();
  const { activateButler } = useRecorderContext();
  const videoRefs = useRef({});
  const activateAudioRef = useRef(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // 全局状态更新时刷新视频（修复then调用错误）
  useEffect(() => {
    console.log('[ButlerShowcase] 全局activeButlerId更新为:', activeButlerId);
    const activeVideo = videoRefs.current[activeButlerId];
    
    if (activeVideo) {
      // 修复：video.load()不返回Promise，移除then调用
      activeVideo.load(); // 同步加载视频
      // 直接调用播放，处理可能的错误
      activeVideo.play().catch(e => 
        console.warn(`播放视频 ${activeButlerId} 失败`, e)
      );
    }
  }, [activeButlerId]);

  // 初始化视频状态
  useEffect(() => {
    butlers.forEach(({ id, src }) => {
      const video = videoRefs.current[id];
      if (!video) return;
      const isActive = id === activeButlerId;
      
      if (isActive) {
        video.style.filter = 'none';
        video.muted = false;
        if (video.src !== `${window.location.origin}${src}`) {
          video.src = src;
        }
      } else {
        video.pause();
        video.currentTime = 0;
        video.style.filter = 'grayscale(100%) brightness(65%)';
      }
    });
  }, [activeButlerId, butlers]);

  // 双击切换管家处理
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
      // 检查activateButler是否为函数
      if (typeof activateButler !== 'function') {
        throw new Error('activateButler未定义，请检查RecorderProvider');
      }
      await activateButler(id);
      
      // 播放切换音效
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
            maxWidth: 1000,
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
              gap: 0,
            }}
          >
            {butlers.map(({ id, name, type, src }, index) => {
              const isActive = id === activeButlerId;
              const isHovered = id === hoveredId;

              return (
                <div
                  key={id}
                  className={`steward ${isActive ? 'active' : ''} ${isHovered ? 'hovered' : ''}`}
                  onMouseEnter={() => setHoveredId(id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onDoubleClick={() => handleDoubleClick(id)}
                  style={{
                    position: 'relative',
                    width: 240,
                    height: 480,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    cursor: 'pointer',
                    transition: 'transform 0.3s ease',
                    transform: isHovered ? 'translateY(-10px)' : 'translateY(0)',
                    userSelect: 'none',
                    marginRight: index !== butlers.length - 1 ? 0 : 0,
                    zIndex: 1,
                    opacity: loading && id !== activeButlerId ? 0.7 : 1,
                    pointerEvents: loading && id !== activeButlerId ? 'none' : 'auto',
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
                        ref={(el) => (videoRefs.current[id] = el)}
                        src={src}
                        autoPlay={false}
                        loop
                        muted
                        playsInline
                        preload="auto"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          borderRadius: 20,
                          position: 'relative',
                          zIndex: 10,
                          userSelect: 'none',
                          pointerEvents: 'none',
                          filter: isActive
                            ? 'none'
                            : 'grayscale(100%) brightness(70%)',
                          transition: 'filter 0.3s ease',
                          boxShadow: isActive
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
      `}</style>
    </>
  );
}