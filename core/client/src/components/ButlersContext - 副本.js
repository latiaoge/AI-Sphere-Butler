// ButlersContext.js
import React, { createContext, useState, useContext } from 'react';

// 你的管家数据
const butlers = [
  {
    id: 'cs',
    name: '管家禅师',
    type: 'video',
    src: '/core/client/ai-butler/video/豆包禅师.mp4',
  },
  {
    id: 'xl',
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

// 创建Context，默认值为管家列表和第一个管家激活ID
const ButlerContext = createContext({
  activeButlerId: butlers[0].id,
  setActiveButlerId: () => {},
  butlers,
});

// Provider组件，包裹App根组件
export function ButlerProvider({ children }) {
  const [activeButlerId, setActiveButlerId] = useState(butlers[0].id);

  return (
    <ButlerContext.Provider value={{ activeButlerId, setActiveButlerId, butlers }}>
      {children}
    </ButlerContext.Provider>
  );
}

// 自定义hook方便使用
export function useButler() {
  return useContext(ButlerContext);
}
