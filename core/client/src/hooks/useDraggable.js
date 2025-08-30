import { useEffect, useRef } from 'react';

// 简单拖拽 Hook，绑定 ref 的 DOM 元素可拖动
export function useDraggable() {
  const dragRef = useRef(null);

  useEffect(() => {
    const el = dragRef.current;
    if (!el) return;

    let pos = { left: 0, top: 0, x: 0, y: 0 };

    // 鼠标按下，开始拖拽
    function mouseDown(e) {
      e.preventDefault(); // 阻止文本选中等默认行为
      pos = {
        left: el.offsetLeft,
        top: el.offsetTop,
        x: e.clientX,
        y: e.clientY,
      };
      document.addEventListener('mousemove', mouseMove);
      document.addEventListener('mouseup', mouseUp);
    }

    // 鼠标移动，更新元素位置
    function mouseMove(e) {
      const dx = e.clientX - pos.x;
      const dy = e.clientY - pos.y;
      el.style.left = `${pos.left + dx}px`;
      el.style.top = `${pos.top + dy}px`;
    }

    // 鼠标松开，停止拖拽
    function mouseUp() {
      document.removeEventListener('mousemove', mouseMove);
      document.removeEventListener('mouseup', mouseUp);
    }

    // 初始化样式：绝对定位和移动光标
    el.style.position = el.style.position || 'absolute'; // 仅当没设置时赋值，避免覆盖
    el.style.cursor = 'move';

    // 绑定 mousedown 事件
    el.addEventListener('mousedown', mouseDown);

    // 清理函数，组件卸载或依赖变更时移除事件监听
    return () => {
      el.removeEventListener('mousedown', mouseDown);
      // 同时保证 document 上监听也被移除，防止异常
      document.removeEventListener('mousemove', mouseMove);
      document.removeEventListener('mouseup', mouseUp);
    };
  }, []);

  return dragRef;
}
