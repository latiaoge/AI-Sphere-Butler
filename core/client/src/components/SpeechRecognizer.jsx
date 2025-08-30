// src/components/SpeechRecognizer.jsx
import React, { useEffect, useRef, useState } from 'react';

export default function SpeechRecognizer({ onSendText }) {
  const [listening, setListening] = useState(false);
  const [text, setText] = useState('');
  const recognitionRef = useRef(null);

  useEffect(() => {
    if (!('webkitSpeechRecognition' in window)) {
      alert('请使用支持语音识别的 Chrome 浏览器');
      return;
    }
    const recognition = new window.webkitSpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => setListening(true);
    recognition.onerror = e => {
      console.error('语音识别错误', e);
      setListening(false);
    };
    recognition.onend = () => {
      setListening(false);
      if (text.trim()) {
        onSendText(text.trim());
        setText('');
      }
    };
    recognition.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          setText(prev => prev + transcript);
        } else {
          interim += transcript;
        }
      }
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
    };
  }, [onSendText, text]);

  function toggleListening() {
    if (listening) recognitionRef.current.stop();
    else {
      setText('');
      recognitionRef.current.start();
    }
  }

  return (
    <div style={{ marginTop: 20 }}>
      <button onClick={toggleListening}>{listening ? '停止识别' : '开始识别'}</button>
      <div
        style={{
          marginTop: 8,
          padding: 8,
          backgroundColor: '#fff',
          borderRadius: 6,
          border: '1px solid #ccc',
          minHeight: 40,
          fontSize: 14,
          color: '#333',
        }}
      >
        {text || <i>识别结果显示于此</i>}
      </div>
    </div>
  );
}
