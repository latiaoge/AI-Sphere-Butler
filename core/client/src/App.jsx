// App.jsx
import './index.css';
import React, { useState, useRef, useEffect } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import ButlerShowcase from './components/ButlerShowcase';
import { useButler, ButlerProvider } from './components/ButlersContext';

import { ResizableBox } from 'react-resizable';
import 'react-resizable/css/styles.css';

import AudioTranscriber from './components/AudioTranscriber';
import CameraControl from './components/CameraControl'; // 保留摄像头
import WebRTCPlayer from './components/OldWebRTC';

import FloatingContainer from './components/FloatingContainer';
// import SpeechRecognizer from './components/SpeechRecognizer'; // 注释掉SpeechRecognizer相关功能
import SseListener from './components/SseListener';

import Clock from './components/Clock'; // 导入你新建的Clock组件

// 新增：导入录音管理Provider和Hook
import { RecorderProvider } from './contexts/RecorderProvider';

// 新增：导入TTSPanel组件
import TTSPanel from './components/TTSPanel';

// 新增：导入壁纸管理器
import WallpaperManager from './components/WallpaperManager';

// 新增：导入设置面板
import Settings from './components/Settings';

const ItemTypes = {
  PANEL: 'panel',
};

// 映射模块id到中文名称和英文ID
const panelTitles = {
  audio: { cn: '', en: '' }, //cn: '语音识别', en: 'ASR' 
  t2audio: { cn: '语音合成', en: 'TTS' }, // 新增TTS模块标题
  // speech: { cn: '语音识别', en: 'SPEECH' },
  // camera: { cn: '摄像头控制', en: 'CAMERA' }, // 不用面板管理摄像头了
  webrtc: { cn: '当前管家', en: 'AI Butler' },
  // floating: { cn: '浮动容器', en: 'FLOATING' },
};

// 新增：动态获取 Home Assistant URL 函数
const getHomeAssistantUrl = () => {
  try {
    const savedUrls = localStorage.getItem('serverUrls');
    if (savedUrls) {
      const serverUrls = JSON.parse(savedUrls);
      if (serverUrls.homeAssistantUrl) {
        return serverUrls.homeAssistantUrl;
      }
    }
  } catch (e) {
    console.error('Failed to parse serverUrls from localStorage', e);
  }
  return 'http://192.168.168.10:8123';
};

// 修改 HomeAssistantPanel 组件
function HomeAssistantPanel() {
  const [loading, setLoading] = useState(true);
  const [showOverlay, setShowOverlay] = useState(true);
  const iframeRef = useRef(null);
  
  // 动态获取 URL
  const homeAssistantUrl = getHomeAssistantUrl();

  // 计算毛玻璃效果的背景
  const glassStyle = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(10px)',
    pointerEvents: 'none', // 允许点击穿透到iframe
    zIndex: 1,
  };

  // 主容器样式
  const containerStyle = {
    width: '100%',
    height: 'calc(100vh - 180px)',
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  };
  
  // iframe样式 - 调整透明度
  const iframeStyle = {
    width: '100%',
    height: '100%',
    border: 'none',
    opacity: 0.85, // 调整iframe整体透明度
    backgroundColor: 'transparent',
    transition: 'opacity 0.5s ease',
  };

  // 处理iframe加载完成
  const handleIframeLoad = () => {
    setLoading(false);
    
    // 延迟隐藏覆盖层，让用户有时间感知加载完成
    setTimeout(() => {
      setShowOverlay(false);
    }, 1000);
  };

  return (
    <div style={containerStyle}>
      {/* 加载指示器 */}
      {loading && (
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10 }}>
          <div className="spinner" style={{ width: 50, height: 50, border: '3px solid rgba(0,229,255,0.3)', borderRadius: '50%', borderTopColor: '#00e5ff', animation: 'spin 1s linear infinite' }} />
          <p style={{ marginLeft: 15, color: 'white' }}>加载 Home Assistant...</p>
        </div>
      )}
      
      {/* 毛玻璃效果覆盖层 */}
      {showOverlay && <div style={glassStyle} />}
      
      {/* Home Assistant iframe */}
      <iframe
        ref={iframeRef}
        src={homeAssistantUrl}
        title="Home Assistant"
        style={iframeStyle}
        onLoad={handleIframeLoad}
        sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
      />
    </div>
  );
}

function DraggableResizablePanel({
  id,
  left,
  top,
  width = 320,
  height = 200,
  zIndex,
  movePanel,
  bringToFront,
  resizePanel,
  children,
}) {
  const dragDropRef = React.useRef(null);

  const [{ isDragging }, drag] = useDrag(() => ({
    type: ItemTypes.PANEL,
    item: { id, left, top, width, height },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }), [id, left, top, width, height]);

  const [, drop] = useDrop(() => ({
    accept: ItemTypes.PANEL,
    hover(item, monitor) {
      if (!dragDropRef.current) return;
      const delta = monitor.getDifferenceFromInitialOffset();
      if (!delta) return;

      const newLeft = Math.round(item.left + delta.x);
      const newTop = Math.round(item.top + delta.y);

      if (newLeft !== left || newTop !== top) {
        movePanel(item.id, newLeft, newTop, width, height);
        item.left = newLeft;
        item.top = newTop;
      }
    },
  }), [left, top, width, height]);

  drag(drop(dragDropRef));

  const onResize = (event, { size }) => {
    resizePanel(id, size.width, size.height);
  };

  const title = panelTitles[id] || { cn: id.toUpperCase(), en: id.toUpperCase() };

  return (
    <div
      className="panel"
      ref={dragDropRef}
      onMouseDown={() => bringToFront(id)}
      style={{
        position: 'absolute',
        left,
        top,
        zIndex,
        userSelect: 'none',
        width,
        height,
        opacity: isDragging ? 0.7 : 1,
        boxSizing: 'border-box',
      }}
    >
      <ResizableBox
        width={width}
        height={height}
        // 根据 id 来决定是否限制大小
        minConstraints={id === 'webrtc' ? [0, 0] : [150, 100]}
        maxConstraints={id === 'webrtc' ? [Infinity, Infinity] : [800, 600]}
        onResize={onResize}
        resizeHandles={['se']}
        handle={
          <span
            className="custom-handle custom-handle-se"
            style={{
              position: 'absolute',
              width: 20,
              height: 20,
              right: 0,
              bottom: 0,
              cursor: 'se-resize',
              backgroundColor: 'rgba(0,0,0,0.2)',
              borderRadius: '0 0 4px 0',
              zIndex: 10,
            }}
          />
        }
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(255, 255, 255, 0)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            userSelect: 'none',
          }}
        >
          {/* 拖动杆 */}
          <div
            style={{
              height: 30,
              backgroundColor: 'transparent', // 完全透明
              color: 'white',
              cursor: 'grab',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              userSelect: 'none',
              borderTopLeftRadius: 4,
              borderTopRightRadius: 4,
              fontWeight: 'bold',
              flexShrink: 0,
              lineHeight: 1,
              paddingTop: 2,
              paddingBottom: 2,
            }}
          >
            <div style={{ fontSize: (id === 'webrtc' || id === 'audio' || id === 't2audio') ? 21 : 12, fontWeight: 'bold', userSelect: 'none' }}>
              {title.cn}
            </div>

            <div style={{ fontSize: 13, fontWeight: 'normal', userSelect: 'none', opacity: 0.7 }}>
              {title.en}
            </div>
          </div>
          <div
            style={{
              flex: 1,
              padding: 12,
              overflow: 'auto',
              userSelect: 'auto',
              position: 'relative',
            }}
          >
            {children}
          </div>
        </div>
      </ResizableBox>
    </div>
  );
}

function loadPanels() {
  try {
    const saved = localStorage.getItem('panels');
    if (saved) {
      const panels = JSON.parse(saved);
      // 过滤掉'camera'和'floating'，避免摄像头和浮动容器面板被加载和渲染
      return panels.filter(p => p.id !== 'camera' && p.id !== 'floating');
    }
  } catch (e) {
    console.warn('读取面板位置失败', e);
  }
  return [
    { id: 'audio', left: 20, top: 20, width: 320, height: 200, zIndex: 1 },
    { id: 't2audio', left: 360, top: 20, width: 320, height: 200, zIndex: 1 }, // 新增默认TTS面板
    { id: 'webrtc', left: 600, top: 900, width: 560, height: 880, zIndex: 1 },
  ];
}

export default function App() {
  // 先定义全局菜单状态，确保初始化顺序正确
  const [isGlobalMenuOpen, setIsGlobalMenuOpen] = useState(false);
  const toggleGlobalMenu = () => {
    setIsGlobalMenuOpen(!isGlobalMenuOpen);
  };

  const [sseMessages, setSseMessages] = useState([]);

  const [panels, setPanels] = useState(loadPanels);
  const maxZIndex = useRef(1);

  const [selectedMenu, setSelectedMenu] = useState('home');

  // 新增：用透明毛玻璃动画替代视频动画
  const [showGlassTransition, setShowGlassTransition] = useState(false);
  const pendingMenuRef = useRef(null);
  const transitionTimeoutRef = useRef(null);

  // 新增：控制WebRTC连接状态
  const [webrtcConnected, setWebrtcConnected] = useState(false);

  // 新增：全局显示状态管理
  const [showAudioPanel, setShowAudioPanel] = useState(true);
  const [showWebrtcPanel, setShowWebrtcPanel] = useState(true);

  // 新增：壁纸设置状态存储
  const [wallpaperSettings, setWallpaperSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('wallpaperSettings');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {}
    // 默认配置
    return {
      // 菜单名称: { type: 'image' | 'video' | 'camera' | 'static', value: string or null }
      home: { type: 'camera', value: null }, // 默认主页用摄像头背景
      butler: { type: 'image', value: '/core/client/ai-butler/image/bg-butler.jpeg' },
      car: { type: 'image', value: '/core/client/ai-butler/image/bg-car.jpeg' },
      homeassistant: { type: 'image', value: '/core/client/ai-butler/image/bg-homeassistant.jpeg' },
      ops: { type: 'image', value: '/core/client/ai-butler/image/bg-ops.jpeg' },
      settings: { type: 'image', value: '/core/client/ai-butler/image/bg-settings.jpeg' },
    };
  });

  // 储存壁纸设置到localStorage
  useEffect(() => {
    localStorage.setItem('wallpaperSettings', JSON.stringify(wallpaperSettings));
  }, [wallpaperSettings]);

  function handleSendText(text) {
    console.log('识别到的文本:', text);
  }

  function handleSseMessage(data) {
    console.log('收到 SSE 消息:', data);
    setSseMessages((prev) => [...prev, data]);
  }

  function movePanel(id, left, top, width, height) {
    const maxLeft = window.innerWidth - width;
    const maxTop = window.innerHeight - height;

    const boundedLeft = Math.min(Math.max(0, left), maxLeft);
    const boundedTop = Math.min(Math.max(0, top), maxTop);

    setPanels((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, left: boundedLeft, top: boundedTop } : p
      )
    );
  }

  function resizePanel(id, width, height) {
    setPanels((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              width,
              height,
            }
          : p
      )
    );
  }

  function bringToFront(id) {
    maxZIndex.current += 1;
    setPanels((prev) =>
      prev.map((p) => (p.id === id ? { ...p, zIndex: maxZIndex.current } : p))
    );
  }

  function DebugActiveButler() {
    const { activeButlerId } = useButler();
    return (
      <div style={{ color: 'white', marginBottom: 12, fontWeight: 'bold' }}>
        当前激活管家ID: {activeButlerId}
      </div>
    );
  }

  useEffect(() => {
    localStorage.setItem('panels', JSON.stringify(panels));
  }, [panels]);

  // 点击菜单，显示毛玻璃过渡动画，延时后切换菜单
  const handleMenuClick = (menuKey) => {
    if (showGlassTransition) return; // 防止重复点击
    pendingMenuRef.current = menuKey;
    setShowGlassTransition(true);

    // 设定动画时间，动画结束后切换菜单并关闭过渡
    if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current);
    transitionTimeoutRef.current = setTimeout(() => {
      setSelectedMenu(pendingMenuRef.current);
      pendingMenuRef.current = null;
      setShowGlassTransition(false);
    }, 400); // 400ms动画时长，与你CSS动画时长对应，可自行调整
  };

  // 监听WebRTC连接状态变化
  const handleWebrtcConnect = () => {
    setWebrtcConnected(true);
  };

  const handleWebrtcDisconnect = () => {
    setWebrtcConnected(false);
  };

  // 全局显示/隐藏控制函数
  const toggleAudioPanel = () => {
    setShowAudioPanel(!showAudioPanel);
  };

  const toggleWebrtcPanel = () => {
    setShowWebrtcPanel(!showWebrtcPanel);
  };

  const defaultPanels = [
    { id: 'audio', left: 20, top: 20, width: 320, height: 200, zIndex: 1 },
    { id: 't2audio', left: 360, top: 20, width: 320, height: 200, zIndex: 1 }, // 新增默认TTS面板
    { id: 'webrtc', left: 370, top: 320, width: 320, height: 200, zIndex: 1 },
  ];

  const resetAllPanels = () => {
    localStorage.removeItem('panels');
    setPanels(defaultPanels);
  };

  const resetSinglePanel = (id) => {
    setPanels((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          const defaultPanel = defaultPanels.find((dp) => dp.id === id);
          return defaultPanel || p;
        }
        return p;
      })
    );
  };

  // 渲染全局显示的三个模块
  const renderGlobalModules = () => (
    <>
      {/* 全局显示的AudioTranscriber面板 */}
      {showAudioPanel && panels
        .filter(panel => panel.id === 'audio')
        .map(({ id, left, top, width, height, zIndex }) => (
          <DraggableResizablePanel
            key={id}
            id={id}
            left={left}
            top={top}
            width={width}
            height={height}
            zIndex={zIndex}
            movePanel={movePanel}
            bringToFront={bringToFront}
            resizePanel={resizePanel}
          >
            <AudioTranscriber />
          </DraggableResizablePanel>
        ))}

      {/* 全局显示的WebRTC面板 */}
      {showWebrtcPanel && panels
        .filter(panel => panel.id === 'webrtc')
        .map(({ id, left, top, width, height, zIndex }) => (
          <DraggableResizablePanel
            key={id}
            id={id}
            left={left}
            top={top}
            width={width}
            height={height}
            zIndex={zIndex}
            movePanel={movePanel}
            bringToFront={bringToFront}
            resizePanel={resizePanel}
          >
            <WebRTCPlayer
              renderVideo={true}
              keepConnection={true}
              onStart={handleWebrtcConnect}
              onStop={handleWebrtcDisconnect}
            />
          </DraggableResizablePanel>
        ))}

      {/* 全局显示摄像头悬浮控件 */}
      <CameraControl />
    </>
  );

  const renderContent = () => {
    switch (selectedMenu) {
      case 'home':
        return (
          <>
            {panels.map(({ id, left, top, width, height, zIndex }) => {
              // 只在主页显示TTS面板
              if (id === 't2audio') {
                return (
                  <DraggableResizablePanel
                    key={id}
                    id={id}
                    left={left}
                    top={top}
                    width={width}
                    height={height}
                    zIndex={zIndex}
                    movePanel={movePanel}
                    bringToFront={bringToFront}
                    resizePanel={resizePanel}
                  >
                    <TTSPanel />
                  </DraggableResizablePanel>
                );
              }
              return null;
            })}
          </>
        );

      case 'butler':
        return (
          <div style={{ padding: 20 }}>
            <h2>管家页面</h2>
            <DebugActiveButler />
            <ButlerShowcase /> {/* 管家页面内容 */}
          </div>
        );

      case 'car':
        return (
          <div style={{ padding: 20 }}>
            <h2>车机控制</h2>
            <p>这里是车机控制页面</p>
            {/* 车机控制组件 */}
          </div>
        );

      case 'homeassistant':
        return (
          <div style={{ padding: 20, height: 'calc(100vh - 120px)' }}>
            <h2>Home Assistant 控制面板</h2>
            <HomeAssistantPanel />
          </div>
        );

      case 'ops':
        return (
          <div style={{ padding: 20 }}>
            <h2>运维页面</h2>
            <p>这里是运维页面的内容，请根据需求替换。</p>

            {/* SSE 日志模块 */}
            <div
              style={{
                marginTop: 20,
                padding: 10,
                border: '1px solid rgba(136, 136, 136, 0.3)',
                borderRadius: 4,
                height: 300,
                overflowY: 'auto',
                backgroundColor: 'rgba(255,255,255,0.05)',
                position: 'relative',
                zIndex: 0,
                whiteSpace: 'pre-wrap',
                fontFamily: 'monospace',
                fontSize: 14,
                color: '#333',
              }}
              aria-live="polite"
              role="log"
            >
              <h4>日志模块 (SSE 消息)</h4>
              {sseMessages.length === 0 ? (
                <p>等待接收消息...</p>
              ) : (
                <ul style={{ paddingLeft: 20, margin: 0 }}>
                  {sseMessages.map((msg, idx) => (
                    <li key={idx} style={{ wordBreak: 'break-word' }}>
                      {msg}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        );

        case 'settings':
          return (
            <div style={{ padding: 20 }}>
              <Settings
                wallpaperSettings={wallpaperSettings}
                setWallpaperSettings={setWallpaperSettings}
                panels={panels}  // 这里一定要传入这个props
                resetAllPanels={resetAllPanels}
                resetSinglePanel={resetSinglePanel}
              />
            </div>
          );        

      default:
        return null;
    }
  };

  // 磨砂玻璃按钮样式，用于菜单按钮背景
  const frostedGlassBtnStyle = {
    width: 60,
    height: 60,
    borderRadius: '50%',
    border: '2px solid #00e5ff',
    backgroundColor: 'rgba(0, 229, 255, 0.15)', // 半透明带一点色彩的磨砂玻璃蓝色调
    color: '#00e5ff',
    fontSize: 16,
    fontWeight: 'bold',
    cursor: showGlassTransition ? 'wait' : 'pointer',
    outline: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    userSelect: 'none',
    transition: 'background-color 0.3s, color 0.3s, box-shadow 0.3s',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    boxShadow: '0 4px 30px rgba(0, 229, 255, 0.4)',
    pointerEvents: showGlassTransition ? 'none' : 'auto',
  };

  const frostedGlassBtnSelectedStyle = {
    ...frostedGlassBtnStyle,
    backgroundColor: 'rgba(0, 229, 255, 0.35)',
    color: 'white',
    boxShadow: '0 6px 40px rgba(0, 229, 255, 0.7)',
  };

  // 全局菜单样式定义（放在状态和函数之后，避免引用提前）
  const globalMenuBtnStyle = {
    position: 'fixed',
    top: 20,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: '50%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    zIndex: 1000,
    transition: 'all 0.3s ease',
  };

  const globalMenuContentStyle = {
    position: 'fixed',
    top: 70,
    right: 20,
    width: 200,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    borderRadius: 8,
    padding: 10,
    zIndex: 1000,
    opacity: isGlobalMenuOpen ? 1 : 0,
    transform: isGlobalMenuOpen ? 'translateY(0)' : 'translateY(10px)',
    transition: 'all 0.3s ease',
    pointerEvents: isGlobalMenuOpen ? 'auto' : 'none',
  };

  return (
    <ButlerProvider>
      <RecorderProvider>
        {/* 壁纸管理器 */}
        <WallpaperManager 
          selectedMenu={selectedMenu}
          showGlassTransition={showGlassTransition}
          wallpaperSettings={wallpaperSettings} // 传递设置
        />
        
        <div style={{ padding: 20, position: 'relative', minHeight: '100vh' }}>
          <Clock /> {/* 新增右上角时间显示 */}

          <h1 style={{ color: 'white' }}>AI-Sphere-Butler 全能管家</h1>

          {/* 统一放置 SSE 监听，保证所有页面都有 */}
          <SseListener onMessage={handleSseMessage} />

          <div
            style={{
              display: 'flex',
              gap: 20,
              marginTop: 20,
              marginBottom: 20,
            }}
            role="menu"
          >
            {[
              { key: 'home', label: '主页' },
              { key: 'butler', label: '管家' },
              { key: 'car', label: '车' },
              { key: 'homeassistant', label: 'HA' },
              { key: 'ops', label: '运维' },
              { key: 'settings', label: '设置' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => handleMenuClick(key)}
                style={
                  selectedMenu === key
                    ? frostedGlassBtnSelectedStyle
                    : frostedGlassBtnStyle
                }
                aria-label={label}
                aria-haspopup="true"
                type="button"
              >
                {label}
              </button>
            ))}
          </div>

          {/* 透明毛玻璃过渡动画遮罩 */}
          {showGlassTransition && (
            <div
              className="glass-transition-overlay"
              aria-hidden="true"
              role="presentation"
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                backdropFilter: 'blur(15px)',
                WebkitBackdropFilter: 'blur(15px)',
                zIndex: 50, // 确保覆盖内容但不遮挡顶部菜单
                transition: 'opacity 0.4s ease',
              }}
            />
          )}

          {/* 渲染页面内容 */}
          {renderContent()}

          {/* 渲染全局显示的三个模块（在所有菜单下都显示） */}
          {renderGlobalModules()}

          {/* 全局菜单按钮 */}
          <div 
            style={globalMenuBtnStyle} 
            onClick={toggleGlobalMenu}
            aria-label="全局菜单"
          >
            {isGlobalMenuOpen ? '×' : '≡'}
          </div>

          {/* 全局菜单内容 */}
          <div style={globalMenuContentStyle}>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              <li
                style={{
                  padding: '10px 15px',
                  color: 'white',
                  cursor: 'pointer',
                  borderRadius: 4,
                  marginBottom: 5,
                  transition: 'background-color 0.2s',
                }}
                onClick={() => {
                  toggleAudioPanel();
                  setIsGlobalMenuOpen(false);
                }}
              >
                {showAudioPanel ? '隐藏语音识别' : '显示语音识别'}
              </li>
              <li
                style={{
                  padding: '10px 15px',
                  color: 'white',
                  cursor: 'pointer',
                  borderRadius: 4,
                  marginBottom: 5,
                }}
                onClick={() => {
                  toggleWebrtcPanel();
                  setIsGlobalMenuOpen(false);
                }}
              >
                {showWebrtcPanel ? '隐藏管家视频' : '显示管家视频'}
              </li>
              <li
                style={{
                  padding: '10px 15px',
                  color: 'white',
                  cursor: 'pointer',
                  borderRadius: 4,
                }}
                onClick={() => {
                  handleMenuClick('settings');
                  setIsGlobalMenuOpen(false);
                }}
              >
                系统设置
              </li>
            </ul>
          </div>
        </div>
      </RecorderProvider>
    </ButlerProvider>
  );
}
