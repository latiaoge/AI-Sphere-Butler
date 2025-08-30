import './index.css';
import React, { useState, useRef, useEffect } from 'react';
import { useDrag, useDrop } from 'react-dnd';

import { ResizableBox } from 'react-resizable';
import 'react-resizable/css/styles.css';

import AudioTranscriber from './components/AudioTranscriber';
import CameraControl from './components/CameraControl'; // 保留摄像头
import WebRTCPlayer from './components/OldWebRTC';

import FloatingContainer from './components/FloatingContainer';
import SpeechRecognizer from './components/SpeechRecognizer';
import SseListener from './components/SseListener';

import ButlerShowcase from './components/ButlerShowcase'; // 新增，导入管家模块
import Clock from './components/Clock'; // 导入你新建的Clock组件

const ItemTypes = {
  PANEL: 'panel',
};

// 映射模块id到中文名称和英文ID
const panelTitles = {
  audio: { cn: '音频识别', en: 'AUDIO' },
  speech: { cn: '语音识别', en: 'SPEECH' },
  // camera: { cn: '摄像头控制', en: 'CAMERA' }, // 不用面板管理摄像头了
  webrtc: { cn: '当前管家', en: 'Butler' },
  // floating: { cn: '浮动容器', en: 'FLOATING' },
};

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
        minConstraints={[150, 100]}
        maxConstraints={[800, 600]}
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
            <div style={{ fontSize: 14, fontWeight: 'bold', userSelect: 'none' }}>
              {title.cn}
            </div>
            <div style={{ fontSize: 10, fontWeight: 'normal', userSelect: 'none', opacity: 0.7 }}>
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
    { id: 'speech', left: 370, top: 20, width: 320, height: 200, zIndex: 1 },
    // { id: 'camera', left: 20, top: 320, width: 320, height: 200, zIndex: 1 }, // 不再作为面板
    { id: 'webrtc', left: 370, top: 320, width: 320, height: 200, zIndex: 1 },
    // { id: 'floating', left: 20, top: 580, width: 320, height: 200, zIndex: 1 }, // 注释掉默认floating
  ];
}

export default function App() {
  const [sseMessages, setSseMessages] = useState([]);

  const [panels, setPanels] = useState(loadPanels);
  const maxZIndex = useRef(1);

  const [selectedMenu, setSelectedMenu] = useState('home');

  // 新增：用透明毛玻璃动画替代视频动画
  const [showGlassTransition, setShowGlassTransition] = useState(false);
  const pendingMenuRef = useRef(null);
  const transitionTimeoutRef = useRef(null);

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
    }, 400); // 800ms动画时长，与你CSS动画时长对应，可自行调整
  };

  const defaultPanels = [
    { id: 'audio', left: 20, top: 20, width: 320, height: 200, zIndex: 1 },
    { id: 'speech', left: 370, top: 20, width: 320, height: 200, zIndex: 1 },
    // 不作为面板管理摄像头
    // { id: 'camera', left: 20, top: 320, width: 320, height: 200, zIndex: 1 },
    { id: 'webrtc', left: 370, top: 320, width: 320, height: 200, zIndex: 1 },
    // { id: 'floating', left: 20, top: 580, width: 320, height: 200, zIndex: 1 },
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

  const renderContent = () => {
    switch (selectedMenu) {
      case 'home':
        return (
          <>
            {panels.map(({ id, left, top, width, height, zIndex }) => {
              // 直接过滤掉floating面板不渲染
              if (id === 'floating') return null;

              switch (id) {
                case 'audio':
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
                      <AudioTranscriber />
                    </DraggableResizablePanel>
                  );
                case 'speech':
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
                      <SpeechRecognizer onSendText={handleSendText} />
                    </DraggableResizablePanel>
                  );
                // 不渲染摄像头面板在loadPanels里已过滤
                case 'webrtc':
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
                      <WebRTCPlayer />
                    </DraggableResizablePanel>
                  );
                default:
                  return null;
              }
            })}
          </>
        );

      case 'butler':
        return (
          <div style={{ padding: 20 }}>
            <h2>管家页面</h2>
            <ButlerShowcase /> {/* 管家页面内容 */}
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
            <h2>设置页面</h2>

            <button
              onClick={resetAllPanels}
              style={{
                marginBottom: 20,
                padding: '8px 16px',
                backgroundColor: '#00e5ff',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              重置所有面板到默认
            </button>

            <div>
              <h3>重置单个面板位置</h3>
              {panels.map(({ id, left, top, width, height }) => {
                const defaultPanel = defaultPanels.find((dp) => dp.id === id);
                return (
                  <div
                    key={id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 10,
                      border: '1px solid rgba(136, 136, 136, 0.3)',
                      borderRadius: 4,
                      padding: 10,
                      maxWidth: 400,
                      backgroundColor: 'rgba(0,123,255,0.05)',
                    }}
                  >
                    <div>
                      <strong>{id}</strong>
                      <div style={{ fontSize: 12, color: '#555' }}>
                        当前：{left},{top}，大小：{width}x{height}
                      </div>
                      <div style={{ fontSize: 12, color: '#555' }}>
                        默认：{defaultPanel?.left},{defaultPanel?.top}，大小：
                        {defaultPanel?.width}x{defaultPanel?.height}
                      </div>
                    </div>
                    <button
                      onClick={() => resetSinglePanel(id)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 4,
                        border: 'none',
                        backgroundColor: '#28a745',
                        color: 'white',
                        cursor: 'pointer',
                      }}
                    >
                      重置
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
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
          { key: 'ops', label: '运维' },
          { key: 'settings', label: '设置' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => handleMenuClick(key)}
            style={{
              width: 60,
              height: 60,
              borderRadius: '50%',
              border: '2px solid #00e5ff',
              backgroundColor: selectedMenu === key ? '#00e5ff' : '#000000',
              color: selectedMenu === key ? 'white' : '#00e5ff',
              fontSize: 16,
              fontWeight: 'bold',
              cursor: showGlassTransition ? 'wait' : 'pointer',
              outline: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              userSelect: 'none',
              transition: 'background-color 0.3s, color 0.3s',
              pointerEvents: showGlassTransition ? 'none' : 'auto',
            }}
            aria-label={label}
            aria-haspopup="true"
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
        />
      )}
  
      {/* 渲染面板 */}
      {renderContent()}
  
      {/* **只在主页显示摄像头悬浮控件** */}
      {selectedMenu === 'home' && <CameraControl />}
    </div>
  );  
}
