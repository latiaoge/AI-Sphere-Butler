// components/Settings.jsx
import React, { useState, useEffect, useRef } from 'react';
const menuItems = [
  { key: 'home', label: '主页' },
  { key: 'butler', label: '管家' },
  { key: 'car', label: '车' },
  { key: 'homeassistant', label: 'HA' },
  { key: 'ops', label: '运维' },
  { key: 'settings', label: '设置' },
];
const wallpaperTypes = [
  { value: 'image', label: '静态图片' },
  { value: 'video', label: '视频背景' },
  { value: 'camera', label: '摄像头实时画面' },
];
// ... isValidUrl 和 CameraPreview 保持不变 ...
export default function Settings({ wallpaperSettings, setWallpaperSettings, panels = [], resetAllPanels, resetSinglePanel }) {
  const [selectedMenu, setSelectedMenu] = useState('home');
  const [selectedType, setSelectedType] = useState('image');
  const [mediaSrc, setMediaSrc] = useState('');
  const [availableCameras, setAvailableCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [wallpaperFolded, setWallpaperFolded] = useState(false);
  const [panelResetFolded, setPanelResetFolded] = useState(true);
  // 菜单展开状态
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  // 摄像头设备菜单展开状态
  const [cameraMenuOpen, setCameraMenuOpen] = useState(false);
  const cameraMenuRef = useRef(null);

  // 新增：文件上传状态
  const [uploadStatus, setUploadStatus] = useState('');

  useEffect(() => {
    const cfg = wallpaperSettings[selectedMenu] || { type: 'image', value: '' };
    setSelectedType(cfg.type);
    if (cfg.type === 'camera') {
      setSelectedCameraId(cfg.value || null);
      setMediaSrc('');
    } else {
      setMediaSrc(cfg.value || '');
      setSelectedCameraId(null);
    }
    setCameraError(null);
  }, [selectedMenu, wallpaperSettings]);
  useEffect(() => {
    async function fetchCameras() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        setAvailableCameras(videoDevices);
        if (selectedCameraId && !videoDevices.some(d => d.deviceId === selectedCameraId)) {
          setSelectedCameraId(null);
        }
      } catch {
        setAvailableCameras([]);
        setCameraError('无法获取摄像头设备列表，可能未授予权限或浏览器不支持。');
      }
    }
    fetchCameras();
  }, [selectedCameraId]);
  // 点击页面空白关闭所有菜单
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
      if (cameraMenuRef.current && !cameraMenuRef.current.contains(event.target)) {
        setCameraMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  // 选择菜单项
  const handleMenuSelect = (key) => {
    setSelectedMenu(key);
    setMenuOpen(false);
    setCameraError(null);
  };
  // 选择摄像头设备
  const handleCameraSelect = (deviceId) => {
    setSelectedCameraId(deviceId);
    setCameraMenuOpen(false);
    setCameraError(null);
  };
  const handleTypeChange = (e) => {
    const newType = e.target.value;
    setSelectedType(newType);
    setCameraError(null);
    if (newType === 'camera') {
      setMediaSrc('');
      if (availableCameras.length > 0) {
        setSelectedCameraId(availableCameras[0].deviceId);
      } else {
        setSelectedCameraId(null);
      }
    } else {
      setMediaSrc('');
      setSelectedCameraId(null);
    }
  };
  const handleMediaSrcChange = (e) => setMediaSrc(e.target.value);

  // 新增：处理文件选择
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setUploadStatus(`已选择: ${file.name}`);
    } else {
      setUploadStatus('');
    }
  };

  // 新增：上传背景文件函数
  const UPLOAD_BG_FILE_URL = 'http://192.168.168.77:6010/api/upload_print_file';
  const uploadBackgroundFile = async (fileToUpload) => {
    if (!fileToUpload) return;

    const validExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'mp4', 'avi', 'mov', 'wmv', 'flv', 'webm'];
    const fileExtension = fileToUpload.name.split('.').pop().toLowerCase();
    if (!validExtensions.includes(fileExtension)) {
        setUploadStatus('上传失败: 不支持的文件类型');
        console.error('不支持的文件类型:', fileExtension);
        return;
    }

    const validPrefixes = ['bg-', 'background-'];
    const hasValidPrefix = validPrefixes.some(prefix => fileToUpload.name.toLowerCase().startsWith(prefix));
    let newFileName = fileToUpload.name;
    if (!hasValidPrefix) {
        newFileName = `bg-${fileToUpload.name}`;
    }

    try {
      setUploadStatus('正在上传背景文件...');
      const formData = new FormData();
      // 创建一个新的 File 对象，使用修改后的文件名
      const renamedFile = new File([fileToUpload], newFileName, { type: fileToUpload.type });
      formData.append('file', renamedFile);

      console.log('准备上传背景文件:', {
        originalName: fileToUpload.name,
        newName: newFileName,
        size: fileToUpload.size,
        type: fileToUpload.type,
        url: UPLOAD_BG_FILE_URL
      });

      const response = await fetch(UPLOAD_BG_FILE_URL, {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json'
        },
      });

      const responseText = await response.text();
      console.log(`背景文件上传响应 (状态码: ${response.status}):`, responseText);

      let result;
      try {
        result = JSON.parse(responseText);
      } catch (e) {
        console.error('解析背景文件上传响应JSON失败:', e, '响应文本:', responseText);
        throw new Error(`服务器返回无效JSON: ${responseText.substring(0, 100)}`);
      }

      if (!response.ok) {
        throw new Error(result.error || `上传失败: ${response.status}`);
      }

      // 上传成功后，将返回的文件路径设置到 mediaSrc
      if (result.filePath) {
        setMediaSrc(result.filePath);
      }

      setUploadStatus(result.message || '背景文件上传成功');
      console.log('背景文件上传成功:', result);
    } catch (error) {
      console.error('背景文件上传失败:', error);
      setUploadStatus(`上传失败: ${error.message}`);
    }
  };

  // 新增：处理文件上传
  const handleFileUpload = async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('bg-file-upload');
    const file = fileInput?.files[0];
    if (file) {
      await uploadBackgroundFile(file);
      // 清空文件输入
      if (fileInput) fileInput.value = '';
    }
  };

  const handleSave = () => {
    let valueToSave = null;
    if (selectedType === 'camera') {
      valueToSave = selectedCameraId || null;
    } else if (selectedType === 'image' || selectedType === 'video') {
      valueToSave = mediaSrc.trim() || null;
    }
    if ((selectedType === 'image' || selectedType === 'video') && valueToSave) {
      if (!isValidUrl(valueToSave) && !valueToSave.startsWith('/')) {
        alert('请输入有效的 URL 地址或以 / 开头的本地路径');
        return;
      }
    }
    setWallpaperSettings(prev => ({
      ...prev,
      [selectedMenu]: {
        type: selectedType,
        value: valueToSave,
      },
    }));
    alert('保存成功');
  };
  const renderPreview = () => {
    if (selectedType === 'image' && mediaSrc) {
      return (
        <img
          src={mediaSrc}
          alt="背景图片预览"
          style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 8, objectFit: 'contain', backgroundColor: '#111' }}
          onError={(e) => { e.currentTarget.src = ''; }}
        />
      );
    }
    if (selectedType === 'video' && mediaSrc) {
      return (
        <video
          src={mediaSrc}
          style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 8, backgroundColor: '#111' }}
          controls
          muted
          loop
          autoPlay
        />
      );
    }
    if (selectedType === 'camera') {
      if (availableCameras.length === 0) {
        return <div style={{ color: 'orange' }}>无可用摄像头设备或未授权访问摄像头。</div>;
      }
      return (
        <CameraPreview cameraId={selectedCameraId} />
      );
    }
    return <div style={{ color: '#666' }}>请选择壁纸类型并输入或选择资源。</div>;
  };
  // 样式定义
  const foldHeaderStyle = {
    cursor: 'pointer',
    userSelect: 'none',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 15px',
    borderRadius: '6px',
    backgroundColor: 'rgba(0, 229, 255, 0.1)', // 磨砂浅蓝半透明
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    color: 'white',
    border: 'none', // 无边框
  };
  const panelContainerStyle = {
    padding: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.15)', // 白色半透明磨砂背景
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    color: '#222',
    marginBottom: 20,
  };
  const inputSelectStyle = {
    width: '100%',
    padding: 8,
    borderRadius: 4,
    border: 'none',
    fontSize: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    color: '#222',
    outline: 'none',
    boxSizing: 'border-box',
  };
  const buttonStyle = {
    padding: '10px 20px',
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    color: '#222',
    fontWeight: 'bold',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    userSelect: 'none',
  };
  const resetSingleBtnStyle = {
    padding: '4px 10px',
    borderRadius: 4,
    border: 'none',
    backgroundColor: 'rgba(0, 123, 255, 0.6)',
    color: 'white',
    cursor: 'pointer',
    userSelect: 'none',
  };
  // 自定义选择菜单样式（菜单项、摄像头）
  const dropdownWrapperStyle = {
    position: 'relative',
    userSelect: 'none',
  };
  const dropdownHeaderStyle = {
    padding: '10px 14px',
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    border: '1px solid rgba(255,255,255,0.4)',
    color: '#222',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  };
  const dropdownListStyle = {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    left: 0,
    right: 0,
    maxHeight: 180,
    overflowY: 'auto',
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    zIndex: 1000,
  };
  const dropdownItemStyle = (isSelected) => ({
    padding: '10px 14px',
    cursor: 'pointer',
    backgroundColor: isSelected ? '#00e5ff' : 'transparent',
    color: isSelected ? '#fff' : '#222',
    fontWeight: isSelected ? '700' : '500',
    transition: 'background-color 0.2s, color 0.2s',
  });
  const dropdownItemHoverStyle = {
    backgroundColor: 'rgba(0, 229, 255, 0.15)',
    color: '#00e5ff',
  };

  // 新增：磨砂玻璃按钮样式（与 OldWebRTC 中的样式保持一致）
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

  return (
    <div style={{ color: 'white', maxWidth: 700, margin: 'auto', fontFamily: 'sans-serif' }}>
      {/* 壁纸设置折叠头 */}
      <div
        onClick={() => setWallpaperFolded(!wallpaperFolded)}
        style={foldHeaderStyle}
        aria-expanded={!wallpaperFolded}
        aria-controls="wallpaperSettingsPanel"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setWallpaperFolded(!wallpaperFolded); }}
      >
        <span>壁纸设置 (点击{wallpaperFolded ? '展开' : '收起'})</span>
        <span style={{ fontSize: 18 }}>{wallpaperFolded ? '+' : '−'}</span>
      </div>
      {!wallpaperFolded && (
        <div id="wallpaperSettingsPanel" style={panelContainerStyle}>
          {/* 自定义菜单项选择 */}
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="menuSelect" style={{ display: 'block', marginBottom: 6, color: 'white' }}>选择菜单项</label>
            <div style={dropdownWrapperStyle} ref={menuRef}>
              <div
                id="menuSelect"
                role="button"
                tabIndex={0}
                onClick={() => setMenuOpen(!menuOpen)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setMenuOpen(!menuOpen);
                  }
                }}
                style={{
                  ...dropdownHeaderStyle,
                  color: 'white',
                  borderColor: 'rgba(255,255,255,0.6)', // 让边框颜色更亮
                }}
                aria-haspopup="listbox"
                aria-expanded={menuOpen}
                aria-labelledby="menuSelect"
              >
                {menuItems.find(item => item.key === selectedMenu)?.label || '请选择'}
                <svg
                  style={{ width: 18, height: 18, transform: menuOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.3s' }}
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
              {menuOpen && (
                <ul
                  role="listbox"
                  tabIndex={-1}
                  aria-activedescendant={selectedMenu}
                  style={dropdownListStyle}
                >
                  {menuItems.map(({ key, label }) => {
                    const isSelected = key === selectedMenu;
                    return (
                      <li
                        id={key}
                        key={key}
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => handleMenuSelect(key)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleMenuSelect(key);
                          }
                        }}
                        style={{
                          padding: '10px 14px',
                          cursor: 'pointer',
                          backgroundColor: isSelected ? '#00e5ff' : 'transparent',
                          color: isSelected ? '#fff' : 'white',
                          fontWeight: isSelected ? '700' : '500',
                          transition: 'background-color 0.2s, color 0.2s',
                        }}
                        onMouseEnter={e => {
                          if (!isSelected) {
                            e.currentTarget.style.backgroundColor = 'rgba(0, 229, 255, 0.15)';
                            e.currentTarget.style.color = '#00e5ff';
                          }
                        }}
                        onMouseLeave={e => {
                          if (!isSelected) {
                            e.currentTarget.style.backgroundColor = 'transparent';
                            e.currentTarget.style.color = 'white';
                          }
                        }}
                        tabIndex={0}
                      >
                        {label}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
          {/* 壁纸类型 */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 6, color: 'white' }}>壁纸类型</label>
            {wallpaperTypes.map(({ value, label }) => (
              <label key={value} style={{ marginRight: 20, cursor: 'pointer', color: 'white' }}>
                <input
                  type="radio"
                  name="wallpaperType"
                  value={value}
                  checked={selectedType === value}
                  onChange={handleTypeChange}
                  style={{ marginRight: 6 }}
                />
                {label}
              </label>
            ))}
          </div>
          {/* 图片或视频地址输入 */}
          {(selectedType === 'image' || selectedType === 'video') && (
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="mediaSrc" style={{ display: 'block', marginBottom: 6, color: 'white' }}>
                {selectedType === 'image' ? '图片地址(URL或上传到服务器 )' : '视频地址(URL或上传到服务器)'}
              </label>
              <input
                id="mediaSrc"
                type="text"
                value={mediaSrc}
                onChange={handleMediaSrcChange}
                placeholder={selectedType === 'image' ? '例如 https://example.com/bg.jpg' : '例如 https://example.com/bg.mp4 或 /local/path/bg.mp4'}
                style={{ width: '100%', padding: 8, borderRadius: 4, border: 'none', fontSize: 16, backgroundColor: 'rgba(255,255,255,0.1)', color: 'white' }}
              />

              {/* 新增：文件上传区域 */}
              <div style={{ marginTop: 12 }}>
                <label
                  htmlFor="bg-file-upload"
                  style={frostedGlassBtnStyle}
                >
                  选择文件上传
                </label>
                <input
                  id="bg-file-upload"
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
                <button
                  onClick={handleFileUpload}
                  style={{ ...frostedGlassBtnStyle, marginLeft: 8 }}
                >
                  上传背景文件
                </button>
                {uploadStatus && (
                  <div style={{ 
                    marginTop: '8px', 
                    color: uploadStatus.includes('失败') ? 'red' : 'white',
                    fontSize: 13
                  }}>
                    {uploadStatus}
                  </div>
                )}
              </div>
            </div>
          )}
          {/* 摄像头设备选择改成自定义菜单 */}
          {selectedType === 'camera' && (
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="cameraSelect" style={{ display: 'block', marginBottom: 6, color: 'white' }}>选择摄像头设备</label>
              <div style={dropdownWrapperStyle} ref={cameraMenuRef}>
                <div
                  id="cameraSelect"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    // 如果无设备，禁止展开菜单
                    if (availableCameras.length > 0) setCameraMenuOpen(!cameraMenuOpen);
                  }}
                  onKeyDown={e => {
                    if ((e.key === 'Enter' || e.key === ' ') && availableCameras.length > 0) {
                      e.preventDefault();
                      setCameraMenuOpen(!cameraMenuOpen);
                    }
                  }}
                  style={{
                    ...dropdownHeaderStyle,
                    color: availableCameras.length > 0 ? 'white' : 'rgba(255,255,255,0.4)', // 设备可用时白色，不可用时透明白
                    backgroundColor: availableCameras.length > 0 ? dropdownHeaderStyle.backgroundColor : 'rgba(255,255,255,0.1)',
                    cursor: availableCameras.length > 0 ? 'pointer' : 'not-allowed',
                    borderColor: availableCameras.length > 0 ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.2)',
                  }}
                  aria-haspopup="listbox"
                  aria-expanded={cameraMenuOpen}
                  aria-labelledby="cameraSelect"
                >
                  {availableCameras.length === 0
                    ? '无可用摄像头设备'
                    : (availableCameras.find(d => d.deviceId === selectedCameraId)?.label || `摄像头 ${selectedCameraId || ''}`) || '请选择'}
                  <svg
                    style={{ width: 18, height: 18, transform: cameraMenuOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.3s' }}
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
                {cameraMenuOpen && (
                  <ul
                    role="listbox"
                    tabIndex={-1}
                    aria-activedescendant={selectedCameraId}
                    style={dropdownListStyle}
                  >
                    {availableCameras.map((device) => {
                      const isSelected = device.deviceId === selectedCameraId;
                      return (
                        <li
                          id={device.deviceId}
                          key={device.deviceId}
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => handleCameraSelect(device.deviceId)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleCameraSelect(device.deviceId);
                            }
                          }}
                          style={{
                            padding: '10px 14px',
                            cursor: 'pointer',
                            backgroundColor: isSelected ? '#00e5ff' : 'transparent',
                            color: isSelected ? '#fff' : 'white',
                            fontWeight: isSelected ? '700' : '500',
                            transition: 'background-color 0.2s, color 0.2s',
                          }}
                          onMouseEnter={e => {
                            if (!isSelected) {
                              e.currentTarget.style.backgroundColor = 'rgba(0, 229, 255, 0.15)';
                              e.currentTarget.style.color = '#00e5ff';
                            }
                          }}
                          onMouseLeave={e => {
                            if (!isSelected) {
                              e.currentTarget.style.backgroundColor = 'transparent';
                              e.currentTarget.style.color = 'white';
                            }
                          }}
                          tabIndex={0}
                        >
                          {device.label || `摄像头 ${device.deviceId}`}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              {cameraError && <p style={{ color: 'orange', marginTop: 6 }}>{cameraError}</p>}
            </div>
          )}  
          <button onClick={handleSave} style={buttonStyle}>
            保存设置
          </button>
          <div>
            <h4>预览</h4>
            <div style={{ borderRadius: 8, padding: 10, backgroundColor: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}>
              {renderPreview()}
            </div>
          </div>
        </div>
      )}
      {/* 面板重置折叠头 */}
      <div
        onClick={() => setPanelResetFolded(!panelResetFolded)}
        style={foldHeaderStyle}
        aria-expanded={!panelResetFolded}
        aria-controls="panelResetPanel"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setPanelResetFolded(!panelResetFolded); }}
      >
        <span>面板位置重置 (点击{panelResetFolded ? '展开' : '收起'})</span>
        <span style={{ fontSize: 18 }}>{panelResetFolded ? '+' : '−'}</span>
      </div>
      {!panelResetFolded && (
        <div id="panelResetPanel" style={panelContainerStyle}>
          <button onClick={resetAllPanels} style={buttonStyle}>
            重置所有面板到默认
          </button>
          <div>
            <h4 style={{ color: 'white' }}>重置单个面板位置</h4>
            {panels.map(({ id, left, top, width, height }) => (
              <div
                key={id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 10,
                  borderRadius: 4,
                  padding: 10,
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  color: 'white',
                  userSelect: 'none',
                }}
              >
                <div>
                  <strong>{id}</strong>
                  <div style={{ fontSize: 12, color: '#bbb' }}>
                    当前：{left},{top}，大小：{width}x{height}
                  </div>
                </div>
                <button onClick={() => resetSinglePanel(id)} style={resetSingleBtnStyle}>
                  重置
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
// CameraPreview 组件保持不变
function CameraPreview({ cameraId }) {
  const videoRef = React.useRef(null);
  const [error, setError] = React.useState(null);
  React.useEffect(() => {
    if (!cameraId) {
      setError('未选择摄像头');
      return;
    }
    setError(null);
    let stream;
    const constraints = {
      video: { deviceId: { exact: cameraId } },
      audio: false,
    };
    async function startStream() {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setError('无法访问摄像头，可能未授权或设备异常');
      }
    }
    startStream();
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [cameraId]);
  if (error) {
    return <div style={{ color: 'red' }}>{error}</div>;
  }
  return (
    <video
      ref={videoRef}
      style={{ width: '100%', maxHeight: 300, borderRadius: 8, backgroundColor: '#000' }}
      muted
      playsInline
      autoPlay
    />
  );
}
// isValidUrl 保持不变
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch {
    return false;
  }
}
