// src/hooks/useRecorder.js
import { useEffect, useRef, useCallback, useState } from 'react';

export function useRecorder() {
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const sourceRef = useRef(null);
  const streamRef = useRef(null);
  const audioDataRef = useRef({
    size: 0,
    buffer: [],
  });

  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState(null);

  // 目标输出参数
  const outputSampleRate = 16000;
  const sampleBits = 16;

  // 降采样函数
  const downsampleBuffer = useCallback((buffer, inputRate, outputRate) => {
    if (outputRate === inputRate) return buffer;
    const ratio = inputRate / outputRate;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;
    while (offsetResult < newLength) {
      let nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
      let accum = 0,
        count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }
      result[offsetResult] = accum / count;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
    return result;
  }, []);

  // PCM编码函数
  const encodePCM = useCallback(() => {
    const buffer = audioDataRef.current.buffer;
    const size = audioDataRef.current.size;
    let mergedBuffers = new Float32Array(size);
    let offset = 0;
    for (let i = 0; i < buffer.length; i++) {
      mergedBuffers.set(buffer[i], offset);
      offset += buffer[i].length;
    }
    const dataLength = mergedBuffers.length * (sampleBits / 8);
    const bufferArray = new ArrayBuffer(dataLength);
    const dataView = new DataView(bufferArray);
    let dataOffset = 0;
    for (let i = 0; i < mergedBuffers.length; i++, dataOffset += 2) {
      let s = Math.max(-1, Math.min(1, mergedBuffers[i]));
      dataView.setInt16(dataOffset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Blob([dataView], { type: 'audio/pcm' });
  }, [sampleBits]);

  // 清空缓存
  const clearBuffer = useCallback(() => {
    audioDataRef.current.buffer = [];
    audioDataRef.current.size = 0;
  }, []);

  // 开始录音
  const start = useCallback(async () => {
    if (isRecording) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioContextRef.current = new AudioContextClass();

      sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);

      // 获取真实采样率
      const inputSampleRate = audioContextRef.current.sampleRate;

      processorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);

      audioDataRef.current.buffer = [];
      audioDataRef.current.size = 0;

      processorRef.current.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const downsampled = downsampleBuffer(inputData, inputSampleRate, outputSampleRate);
        audioDataRef.current.buffer.push(downsampled);
        audioDataRef.current.size += downsampled.length;
      };

      sourceRef.current.connect(processorRef.current);
      processorRef.current.connect(audioContextRef.current.destination);

      setIsRecording(true);
      setError(null);
    } catch (err) {
      console.error('获取麦克风失败', err);
      setError(err);
      throw err;
    }
  }, [downsampleBuffer, isRecording]);

  // 停止录音
  const stop = useCallback(() => {
    if (!isRecording) return;

    try {
      if (processorRef.current) {
        processorRef.current.disconnect();
        processorRef.current.onaudioprocess = null;
        processorRef.current = null;
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    } catch (e) {
      console.warn('停止录音时出错', e);
    } finally {
      setIsRecording(false);
    }
  }, [isRecording]);

  // 组件卸载时自动释放资源的副作用
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    start,
    stop,
    getAudioBlob: encodePCM,
    clearBuffer,
    isRecording,
    error,
  };
}
