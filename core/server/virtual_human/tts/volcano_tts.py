import sounddevice as sd
import requests
import numpy as np
import time
import signal
import sys

# ========== 配置 ========== 
INPUT_RATE   = 16000  # 直接采样16kHz
CHANNELS     = 1      # 单声道
FRAME_SIZE   = 640    # 20ms @ 16kHz
TARGET_RATE  = 16000  # 目标采样率为16kHz
URL          = "http://192.168.1.2:8010/audio_stream_in?sessionid=0"
SESSION      = requests.Session()
SESSION.headers.update({"Content-Type":"application/octet-stream"})
stop_event   = threading.Event()

# 捕获 Ctrl+C 退出
def on_sigint(sig, frame):
    stop_event.set()
    sys.exit(0)

signal.signal(signal.SIGINT, on_sigint)

# ========== 采集线程 ========== 
def capture():
    idx = next((i for i,d in enumerate(sd.query_devices())
                if "CABLE" in d["name"] and d["max_input_channels"] >= CHANNELS), None)
    if idx is None:
        print("未找到 VB‑Cable 设备")
        sys.exit(1)

    def cb(indata, frames, t, status):
        if status:
            print("[CAP] 警告:", status)
        try:
            # 单声道 float32
            mono = indata.mean(axis=1).astype(np.float32) / 32768.0
            # 每次采集的数据（单声道 float32）转为 16-bit PCM 数据
            data = (np.round(mono * 32767)
                      .astype(np.int16)
                      .tobytes())

            # 直接推送音频帧
            try:
                r = SESSION.post(URL, data=data, timeout=0.5)
                if r.status_code != 200:
                    print("[ERR] 状态码:", r.status_code)
            except Exception as e:
                print("[ERR] 推送异常:", e)
        except Exception as e:
            print("[ERR] 数据处理异常:", e)

    with sd.InputStream(
            samplerate=INPUT_RATE, device=idx,
            channels=CHANNELS, dtype='int16',
            blocksize=1024,  # 适当调整采集的块大小，避免阻塞
            callback=cb):
        print("[CAP] 采集启动")
        while not stop_event.is_set():
            time.sleep(0.01)

# ========== 主 ========== 
if __name__ == "__main__":
    import threading
    threading.Thread(target=capture, daemon=True).start()
    print("客户端运行中，Ctrl+C 退出.")
    while not stop_event.is_set():
        time.sleep(1)
