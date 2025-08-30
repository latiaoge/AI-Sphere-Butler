import React, { useState, useEffect, useRef } from 'react';

export const menuWallpapers = {
  home: '/core/client/ai-butler/image/bg-home.jpeg', // 备用图片
  butler: '/core/client/ai-butler/image/bg-butler.jpeg',
  car: '/core/client/ai-butler/image/bg-car.jpeg',
  homeassistant: '/core/client/ai-butler/image/bg-homeassistant.jpeg',
  ops: '/core/client/ai-butler/image/bg-ops.jpeg',
  settings: '/core/client/ai-butler/image/bg-settings.jpeg',
};

// 默认视频路径
const defaultHomeVideoSrc = '/core/client/ai-butler/video/bg-home.mp4';

const WallpaperManager = ({ selectedMenu, wallpaperSettings }) => {
  // 读取当前菜单对应的设置，fallback到默认配置
  const cfg = wallpaperSettings?.[selectedMenu] || { type: 'image', value: '' };

  const [currentWallpaper, setCurrentWallpaper] = useState(menuWallpapers.home);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isVideoError, setIsVideoError] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(true);
  const [imageLoadError, setImageLoadError] = useState(false);

  const [cameraStream, setCameraStream] = useState(null);
  const videoRef = useRef(null);

  // 释放摄像头流
  const releaseCameraStream = () => {
    if (cameraStream) {
      try {
        cameraStream.getTracks().forEach(track => track.stop());
      } catch {}
      setCameraStream(null);
    }
  };

  useEffect(() => {
    releaseCameraStream();
    setIsVideoLoaded(false);
    setIsVideoError(false);
    setImageLoadError(false);
    setIsImageLoading(true);

    if (cfg.type === 'camera') {
      // 启用摄像头流
      if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
        navigator.mediaDevices.getUserMedia({ video: { deviceId: cfg.value || undefined }, audio: false })
          .then(stream => {
            setCameraStream(stream);
            setIsVideoLoaded(true);
            setIsVideoError(false);
            setIsImageLoading(false);
          })
          .catch(err => {
            console.warn('获取摄像头失败，回退图片背景', err);
            setCameraStream(null);
            setIsVideoError(true);
            setIsVideoLoaded(false);
            setIsImageLoading(false);
            setCurrentWallpaper(menuWallpapers.home);
          });
      } else {
        // 不支持摄像头时，回退图片背景
        setCameraStream(null);
        setIsVideoError(true);
        setIsVideoLoaded(false);
        setIsImageLoading(false);
        setCurrentWallpaper(menuWallpapers.home);
      }
      return;
    } else if (cfg.type === 'video' && cfg.value) {
      // 视频背景
      setCameraStream(null);
      setCurrentWallpaper(menuWallpapers.home);
      setIsImageLoading(false);
      setIsVideoError(false);
      setIsVideoLoaded(false);
      // 视频加载状态将在 video onCanPlay/onError 中控制
      return;
    } else {
      // 图片背景
      setCameraStream(null);
      const imgSrc = cfg.value || menuWallpapers[selectedMenu] || menuWallpapers.home;
      const img = new Image();
      img.onload = () => {
        setCurrentWallpaper(imgSrc);
        setIsImageLoading(false);
        setImageLoadError(false);
      };
      img.onerror = () => {
        console.error('壁纸加载失败:', imgSrc);
        // 失败时回退默认图片
        const defaultImg = menuWallpapers.home;
        const defaultImgLoader = new Image();
        defaultImgLoader.onload = () => {
          setCurrentWallpaper(defaultImg);
          setIsImageLoading(false);
          setImageLoadError(false);
        };
        defaultImgLoader.onerror = () => {
          setImageLoadError(true);
          setIsImageLoading(false);
        };
        defaultImgLoader.src = defaultImg;
      };
      img.src = imgSrc;
      setIsVideoError(false);
      setIsVideoLoaded(false);
      setIsImageLoading(true);
    }
  }, [selectedMenu, cfg.type, cfg.value]);

  useEffect(() => {
    if (cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraStream]);

  const baseStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    zIndex: -1,
    pointerEvents: 'none',
    transition: 'opacity 0.5s ease-in-out',
    backgroundColor: '#000',
  };

  const cameraVideoStyle = {
    ...baseStyle,
    objectFit: 'cover',
    opacity: cameraStream && isVideoLoaded && !isVideoError ? 1 : 0,
  };

  const videoStyle = {
    ...baseStyle,
    objectFit: 'cover',
    opacity: cfg.type === 'video' && !cameraStream && isVideoLoaded && !isVideoError ? 1 : 0,
  };

  const imageStyle = {
    ...baseStyle,
    backgroundImage: `url(${currentWallpaper})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    opacity:
      (cfg.type !== 'camera' && (cfg.type !== 'video' || isVideoError) && !isImageLoading && !imageLoadError) ? 1 : 0,
  };

  const handleVideoCanPlay = () => {
    setIsVideoLoaded(true);
    setIsVideoError(false);
    setIsImageLoading(false);
  };

  const handleVideoError = () => {
    console.error('视频加载失败，回退图片背景');
    setIsVideoError(true);
    setIsVideoLoaded(false);
  };

  return (
    <>
      {cfg.type === 'camera' && cameraStream ? (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={cameraVideoStyle}
          aria-hidden="true"
        />
      ) : (
        <>
          {cfg.type === 'video' && cfg.value && (
            <video
              key={cfg.value}
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              style={videoStyle}
              src={cfg.value}
              aria-hidden="true"
              onCanPlay={handleVideoCanPlay}
              onError={handleVideoError}
            />
          )}
          {(cfg.type === 'image' || isVideoError || (!isVideoLoaded && cfg.type === 'video')) && !isImageLoading && !imageLoadError && (
            <div
              className="app-wallpaper"
              style={imageStyle}
              aria-hidden="true"
            />
          )}
        </>
      )}
      {imageLoadError && (
        <div
          className="app-wallpaper"
          style={{
            ...baseStyle,
            backgroundColor: '#222',
            opacity: 1,
          }}
          aria-hidden="true"
        />
      )}
    </>
  );
};

export default WallpaperManager;
