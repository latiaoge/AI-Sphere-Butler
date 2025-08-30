import React, { useState, useRef, useEffect } from 'react';

// 示例管家数据，全部是视频，id唯一
const butlers = [
  {
    id: 'butler1',
    name: '管家禅师',
    type: 'video',
    src: '/core/client/ai-butler/video/豆包禅师.mp4', // 请确保视频文件放在 public/video/目录内
  },
  {
    id: 'butler2',
    name: '管家小粒',
    type: 'video',
    src: '/core/client/ai-butler/video/小粒.mp4',
  },
  {
    id: 'butler3',
    name: '管家小贾',
    type: 'video',
    src: '/core/client/ai-butler/video/小贾.mp4',
  },
  {
    id: 'butler4',
    name: '管家星期天',
    type: 'video',
    src: '/core/client/ai-butler/video/星期天.mp4',
  },
];

// 激活音效文件路径，请将音效文件放到 core/client/ai-butler/sounds/activate.mp3 或你自己的路径
const activateSoundSrc = '/core/client/ai-butler/sounds/activate.mp3';

export default function ButlerShowcase() {
  const [activeButlerId, setActiveButlerId] = useState(butlers[0].id);
  const [hoveredId, setHoveredId] = useState(null);
  const videoRefs = useRef({});
  const activateAudioRef = useRef(null);

  function handleMouseEnter(id) {
    setHoveredId(id);
  }

  function handleMouseLeave() {
    setHoveredId(null);
  }

  function handleDoubleClick(id) {
    if (id !== activeButlerId) {
      setActiveButlerId(id);
      playActivateSound();
    }
  }

  function playActivateSound() {
    if (!activateAudioRef.current) return;
    const audio = activateAudioRef.current;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  useEffect(() => {
    Object.entries(videoRefs.current).forEach(([id, video]) => {
      if (!video) return;
      if (id === activeButlerId) {
        if (video.paused) {
          video.play().catch(() => {});
        }
        video.style.filter = 'none';
      } else {
        if (!video.paused) {
          video.pause();
          video.currentTime = 0;
        }
        video.style.filter = 'grayscale(100%) brightness(65%)';
      }
    });
  }, [activeButlerId]);

  return (
    <>
      <audio ref={activateAudioRef} src={activateSoundSrc} preload="auto" />

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
                  className={`steward ${isActive ? 'active' : ''} ${
                    isHovered ? 'hovered' : ''
                  }`}
                  onMouseEnter={() => handleMouseEnter(id)}
                  onMouseLeave={handleMouseLeave}
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
                  }}
                  title={
                    isActive
                      ? `当前激活管家：${name}`
                      : `双击切换到管家 ${name}`
                  }
                >
                  {/* 磨砂玻璃质感容器 */}
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
                      boxShadow:
                        '0 8px 50px rgba(0, 229, 255, 0.4), inset 0 0 80px rgba(255, 255, 255, 0.15)',
                      backdropFilter: 'blur(20px)',
                      WebkitBackdropFilter: 'blur(20px)',
                      border: '3px solid rgba(255, 255, 255, 0.45)',
                      overflow: 'hidden',
                      userSelect: 'none',
                      filter: isActive
                        ? 'drop-shadow(0 0 35px rgba(0,229,255,1))'
                        : 'grayscale(100%) brightness(70%)',
                      transition: 'filter 0.3s ease',
                      zIndex: 1,
                    }}
                  >
                    {/* 磨砂噪点纹理叠加 */}
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
                    {/* 高光边缘流动动画 */}
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

                  {/* 底部横杠，默认灰色，激活或悬停时亮灯 */}
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

                  {/* 底座圆点，亮灯逻辑和横杠一致 */}
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

                  {/* 名字 */}
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

      {/* 动画样式 */}
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
