import React, { useRef, useState, useEffect } from 'react';
import styles from './WebRTCPlayer.module.css';

export default function WebRTCPlayer() {
  const videoRef = useRef(null);
  const [pc, setPc] = useState(null);
  const [started, setStarted] = useState(false);

  // 这里的ws信令url，根据你后端实际修改
  const SIGNALING_URL = '/offer';

  useEffect(() => {
    return () => {
      if (pc) {
        pc.close();
        setPc(null);
      }
    };
  }, [pc]);

  async function negotiate() {
    if (!pc) return;

    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await new Promise((resolve) => {
        if (pc.iceGatheringState === 'complete') {
          resolve();
        } else {
          const handler = () => {
            if (pc.iceGatheringState === 'complete') {
              pc.removeEventListener('icegatheringstatechange', handler);
              resolve();
            }
          };
          pc.addEventListener('icegatheringstatechange', handler);
        }
      });

      const resp = await fetch(SIGNALING_URL, {
        method: 'POST',
        body: JSON.stringify(pc.localDescription),
        headers: { 'Content-Type': 'application/json' },
      });
      const answer = await resp.json();

      await pc.setRemoteDescription(answer);
    } catch (err) {
      alert('协商失败: ' + err.message);
    }
  }

  function start() {
    if (started) return;

    const newPc = new RTCPeerConnection({ iceServers: [] });

    newPc.addEventListener('track', (e) => {
      if (e.track.kind === 'video') {
        if (videoRef.current) {
          videoRef.current.srcObject = e.streams[0];
        }
      }
    });

    setPc(newPc);
    setStarted(true);

    negotiate.call(null, newPc).catch(console.error);
  }

  function stop() {
    if (!started) return;

    if (pc) {
      pc.close();
      setPc(null);
    }
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setStarted(false);
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <h3>WebRTC Video Player</h3>
      <button onClick={start} disabled={started} style={{ marginRight: 10 }}>
        Start
      </button>
      <button onClick={stop} disabled={!started}>
        Stop
      </button>
      <div>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          style={{ width: 600, height: 450, backgroundColor: '#000' }}
        />
      </div>
    </div>
  );
}
