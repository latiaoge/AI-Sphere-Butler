import React, { createContext, useState, useContext, useEffect } from 'react';

// 创建Context
const ButlerContext = createContext({
  activeButlerId: null,
  setActiveButlerId: () => {},
  butlers: [],
  addButler: () => {},
});

// Provider组件
export function ButlerProvider({ children }) {
  const [butlers, setButlers] = useState([]);
  const [activeButlerId, setActiveButlerId] = useState(null);

  // 动态添加管家方法，支持替换
  function addButler(newButler, replaceButlerId = null) {
    setButlers(prevButlers => {
      let newButlers;
      if (replaceButlerId) {
        newButlers = prevButlers.filter(b => b.id !== replaceButlerId);
        newButlers.push(newButler);
      } else {
        const existsIndex = prevButlers.findIndex(b => b.id === newButler.id);
        if (existsIndex !== -1) {
          newButlers = [...prevButlers];
          newButlers[existsIndex] = newButler;
        } else {
          newButlers = [...prevButlers, newButler];
        }
      }
      return newButlers;
    });

    if (replaceButlerId) {
      setActiveButlerId(newButler.id);
    }
  }

  // 从后端加载管家数据
  useEffect(() => {
    const fetchButlers = async () => {
      try {
        const response = await fetch('/api/butlers');
        if (!response.ok) throw new Error(`HTTP错误: ${response.status}`);
        
        const data = await response.json();
        if (data.success) {
          console.log('[ButlerProvider] 从后端加载管家数据成功:', data);
          setButlers(data.butlers || []);
          setActiveButlerId(data.activeButlerId);
        } else {
          console.error('[ButlerProvider] 加载管家数据失败:', data.error);
        }
      } catch (err) {
        console.error('[ButlerProvider] 加载管家数据异常:', err);
      }
    };

    fetchButlers();
  }, []);

  return (
    <ButlerContext.Provider value={{ activeButlerId, setActiveButlerId, butlers, addButler }}>
      {children}
    </ButlerContext.Provider>
  );
}

// 自定义hook
export function useButler() {
  return useContext(ButlerContext);
}