// components/WallpaperManager.jsx
import React, { useState, useEffect } from 'react';

export const menuWallpapers = {
  home: '/core/client/ai-butler/image/bg-home.jpeg', // 这里仍留图片作为备用
  butler: '/core/client/ai-butler/image/bg-butler.jpeg',
  car: '/core/client/ai-butler/image/bg-car.jpeg',
  homeassistant: '/core/client/ai-butler/image/bg-homeassistant.jpeg',
  ops: '/core/client/ai-butler/image/bg-ops.jpeg',
  settings: '/core/client/ai-butler/image/bg-settings.jpeg',
};

// 视频文件路径（请替换成实际mp4路径）
const homeVideoSrc = '/core/client/ai-butler/video/bg-home.mp4';

const WallpaperManager = ({ selectedMenu, showGlassTransition }) => {
  const [currentWallpaper, setCurrentWallpaper] = useState(menuWallpapers.home); // 默认使用home壁纸
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isVideoError, setIsVideoError] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(true);
  const [imageLoadError, setImageLoadError] = useState(false);

  useEffect(() => {
    // 重置所有状态
    setIsVideoLoaded(false);
    setIsVideoError(false);
    setImageLoadError(false);
    setIsImageLoading(true);

    if (selectedMenu === 'home') {
      // 主页，重置壁纸为home图作为备用
      setCurrentWallpaper(menuWallpapers.home);
      setIsImageLoading(false); // 主页不主动加载图片，立即置false
      return;
    }

    // 其他菜单，加载对应图片
    const targetWallpaper = menuWallpapers[selectedMenu] || menuWallpapers.home;
    
    const img = new Image();
    img.onload = () => {
      setCurrentWallpaper(targetWallpaper);
      setIsImageLoading(false);
    };
    img.onerror = () => {
      console.error('壁纸加载失败:', targetWallpaper);
      // 尝试加载默认home壁纸
      const homeImg = new Image();
      homeImg.onload = () => {
        setCurrentWallpaper(menuWallpapers.home);
        setIsImageLoading(false);
      };
      homeImg.onerror = () => {
        setImageLoadError(true);
        setIsImageLoading(false);
      };
      homeImg.src = menuWallpapers.home;
    };
    img.src = targetWallpaper;
  }, [selectedMenu]);

  // 公共样式
  const baseStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    zIndex: -1,
    pointerEvents: 'none',
    transition: 'opacity 0.5s ease-in-out',
  };

  // 视频专用样式，带objectFit
  const videoStyle = {
    ...baseStyle,
    objectFit: 'cover',
    opacity: isVideoLoaded && !isVideoError ? 1 : 0,
  };

  // 图片专用样式
  const imageStyle = {
    ...baseStyle,
    backgroundImage: `url(${currentWallpaper})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    opacity: (selectedMenu !== 'home' || isVideoError) && !isImageLoading && !imageLoadError ? 1 : 0,
  };

  // 视频加载成功回调
  const handleVideoCanPlay = () => {
    setIsVideoLoaded(true);
    setIsVideoError(false);
  };

  // 视频加载失败回调
  const handleVideoError = () => {
    console.error('视频加载失败，切换为壁纸');
    setIsVideoError(true);
    setIsVideoLoaded(false);
  };

  // 如果是home菜单，优先显示视频，视频加载失败或没加载时显示壁纸
  if (selectedMenu === 'home') {
    return (
      <>
        <video
          key={homeVideoSrc} // 关键：切换时强制重新挂载视频节点，触发加载
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          style={videoStyle}
          src={homeVideoSrc}
          aria-hidden="true"
          onCanPlay={handleVideoCanPlay}
          onError={handleVideoError}
        />
        {/* 视频加载失败或尚未加载时，显示壁纸作为后备 */}
        {(isVideoError || !isVideoLoaded) && !isImageLoading && !imageLoadError && (
          <div
            className="app-wallpaper"
            style={imageStyle}
            aria-hidden="true"
          />
        )}
      </>
    );
  }

  // 其他菜单只显示图片背景
  return (
    <>
      {(!isImageLoading && !imageLoadError) && (
        <div
          className="app-wallpaper"
          style={imageStyle}
          aria-hidden="true"
        />
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
