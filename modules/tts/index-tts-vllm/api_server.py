import os
# os.environ["CUDA_VISIBLE_DEVICES"] = "7"

import asyncio
import io
import traceback
from fastapi import FastAPI, Request, Response, UploadFile, File
from fastapi.responses import JSONResponse, StreamingResponse
from contextlib import asynccontextmanager
import uvicorn
import argparse
import json
import asyncio
import time
import numpy as np
import soundfile as sf

from indextts.infer_vllm import IndexTTS

from scipy.io import wavfile
import wave
import librosa
import traceback

tts = None
latest_speaker_audio_path = None  


def get_latest_audio_file(dir_path):
    """
    获取目录下最新的wav文件的完整路径，没有返回None
    """
    if not os.path.exists(dir_path):
        os.makedirs(dir_path, exist_ok=True)
        return None
    files = [os.path.join(dir_path, f) for f in os.listdir(dir_path) if f.endswith(".wav")]
    if not files:
        return None
    files.sort(key=os.path.getmtime, reverse=True)
    return files[0]


@asynccontextmanager
async def lifespan(app: FastAPI):
    global tts, latest_speaker_audio_path

    try:
        
        class CustomIndexTTS(IndexTTS):
            def __init__(self, *args, **kwargs):
                
                self.engine_iteration_timeout = kwargs.pop('engine_iteration_timeout', 30.0)
                super().__init__(*args, **kwargs)
            
            def _create_vllm_engine(self):
                """覆盖父类方法，增加超时参数"""
                from vllm import AsyncLLMEngine
                from vllm.engine.arg_utils import AsyncEngineArgs
                
                
                engine_args = AsyncEngineArgs.from_cli_args(self.args)
                
                
                engine_args.engine_iteration_timeout = self.engine_iteration_timeout
                
                
                return AsyncLLMEngine.from_engine_args(engine_args)
        
        
        cfg_path = os.path.join(args.model_dir, "config.yaml")
        tts = CustomIndexTTS(
            model_dir=args.model_dir, 
            cfg_path=cfg_path, 
            gpu_memory_utilization=args.gpu_memory_utilization,
            engine_iteration_timeout=30.0  
        )

        current_file_path = os.path.abspath(__file__)
        cur_dir = os.path.dirname(current_file_path)
        speaker_json_path = os.path.join(cur_dir, "assets/speaker.json")
        speaker_dir = os.path.join(cur_dir, "assets/speaker1")

        
        if os.path.exists(speaker_json_path):
            speaker_dict = json.load(open(speaker_json_path, 'r'))
            for speaker, audio_paths in speaker_dict.items():
                tts.registry_speaker(speaker, audio_paths)

        
        latest_file = get_latest_audio_file(speaker_dir)
        if latest_file:
            latest_speaker_audio_path = latest_file
            
            tts.registry_speaker("speaker1", [latest_speaker_audio_path])
            print(f"[INFO] 加载最新参考音频文件: {latest_speaker_audio_path}")
        else:
            latest_speaker_audio_path = None
            print(f"[WARN] assets/speaker1目录无参考音频文件")

        yield
        
    except Exception as e:
        tb_str = ''.join(traceback.format_exception(type(e), e, e.__traceback__))
        print(f"[ERROR] TTS初始化失败: {tb_str}")
        raise
    finally:
        # clean up if needed
        pass


app = FastAPI(lifespan=lifespan)


@app.post("/api/uploadSpeaker")
async def upload_speaker(file: UploadFile = File(...)):
    """
    上传克隆音频文件接口，保存到 assets/speaker1 目录，
    并更新最新参考音频路径，注册给tts使用。
    """
    global latest_speaker_audio_path, tts

    current_file_path = os.path.abspath(__file__)
    cur_dir = os.path.dirname(current_file_path)
    speaker_dir = os.path.join(cur_dir, "assets/speaker1")
    os.makedirs(speaker_dir, exist_ok=True)

    try:
        content = await file.read()
        
        timestamp = int(time.time() * 1000)
        filename = f"speaker_{timestamp}.wav"
        file_path = os.path.join(speaker_dir, filename)

        
        with open(file_path, "wb") as f:
            f.write(content)

        
        latest_speaker_audio_path = file_path
        
        tts.registry_speaker("speaker1", [latest_speaker_audio_path])

        print(f"[INFO] 上传并保存最新克隆音频: {file_path}")

        return {"code": 0, "info": "上传成功", "data": filename}
    except Exception as e:
        tb_str = ''.join(traceback.format_exception(type(e), e, e.__traceback__))
        print(f"[ERROR] 上传克隆音频失败: {tb_str}")
        return JSONResponse(status_code=500, content={"code": 500, "info": f"上传失败: {str(e)}", "data": ""})


@app.post("/tts_url", responses={
    200: {"content": {"application/octet-stream": {}}},
    500: {"content": {"application/json": {}}}
})
async def tts_api_url(request: Request):
    try:
        data = await request.json()
        text = data["text"]
        audio_paths = data["audio_paths"]

        global tts
        
        
        max_retries = 3
        for attempt in range(max_retries):
            try:
                sr, wav = await tts.infer(audio_paths, text)
                break  
            except Exception as e:
                if attempt < max_retries - 1:
                    print(f"[WARNING] TTS推理尝试 {attempt+1}/{max_retries} 失败: {str(e)}，正在重试...")
                    
                    await asyncio.sleep(1)
                else:
                    raise  

        print(f"[DEBUG] Sample rate before int cast: {sr}, type: {type(sr)}")
        try:
            sr = int(sr)
        except Exception as e:
            print(f"[ERROR] Sample rate conversion error: {e}")
            sr = 22050

        if sr < 8000 or sr > 65535:
            print(f"[WARNING] Sample rate {sr} out of bounds, reset to 22050.")
            sr = 22050

        print(f"[DEBUG] Sample rate after range check: {sr}")

        if hasattr(wav, "cpu"):
            wav_np = wav.detach().cpu().numpy()
        else:
            wav_np = wav

        peak = np.max(np.abs(wav_np))
        if peak > 0:
            wav_norm = wav_np / peak
        else:
            wav_norm = wav_np.astype(np.float32)

        wav_int16 = (wav_norm * 32767).astype(np.int16)

        if wav_int16.ndim == 2 and wav_int16.shape[0] == 1:
            wav_int16 = wav_int16[0]

        with io.BytesIO() as wav_buffer:
            wavfile.write(wav_buffer, sr, wav_int16)
            wav_bytes = wav_buffer.getvalue()

        return Response(content=wav_bytes, media_type="audio/wav")

    except Exception as ex:
        tb_str = ''.join(traceback.format_exception(type(ex), ex, ex.__traceback__))
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "error": tb_str
            }
        )


@app.post("/tts")
async def tts_api(request: Request):
    try:
        data = await request.json()
        text = data.get("text", "").strip()
        if not text:
            return JSONResponse(status_code=400, content={"error": "Missing or empty 'text' field"})

        character = "speaker1"

        global tts
        
        
        max_retries = 3
        for attempt in range(max_retries):
            try:
                sr, wav = await tts.infer_with_ref_audio_embed(character, text)
                break  
            except Exception as e:
                if attempt < max_retries - 1:
                    print(f"[WARNING] TTS推理尝试 {attempt+1}/{max_retries} 失败: {str(e)}，正在重试...")
                    
                    await asyncio.sleep(1)
                else:
                    raise  

        print(f"[DEBUG] sr: {sr}, type(sr): {type(sr)}")
        print(f"[DEBUG] wav type: {type(wav)}")

        if hasattr(wav, "cpu"):
            wav_np = wav.detach().cpu().numpy()
        else:
            wav_np = wav

        print(f"[DEBUG] wav_np original shape: {wav_np.shape}")
        print(f"[DEBUG] wav_np dtype: {wav_np.dtype}")

        if wav_np.ndim == 2 and wav_np.shape[1] == 1:
            wav_np = wav_np.squeeze()
            print(f"[DEBUG] wav_np squeezed shape: {wav_np.shape}")

        while wav_np.ndim > 1:
            wav_np = wav_np[0]
            print(f"[DEBUG] reduced wav_np shape by selecting first element: {wav_np.shape}")

        if wav_np.size < 1000:
            print(f"[WARNING] waveform size too small: {wav_np.size}")

        peak = np.max(np.abs(wav_np)) if wav_np.size > 0 else 0
        print(f"[DEBUG] waveform peak abs value: {peak}")

        if peak > 0:
            wav_norm = wav_np / peak
        else:
            wav_norm = wav_np.astype(np.float32)

        target_sr = 16000
        if sr != target_sr:
            wav_resampled = librosa.resample(wav_norm.astype(np.float32), orig_sr=sr, target_sr=target_sr)
            out_sr = target_sr
        else:
            wav_resampled = wav_norm.astype(np.float32)
            out_sr = sr

        wav_int16 = (wav_resampled * 32767).astype(np.int16)

        if wav_int16.ndim == 2 and wav_int16.shape[1] == 1:
            wav_int16 = wav_int16.squeeze()

        print(f"[DEBUG] final wav_int16 shape: {wav_int16.shape}, dtype: {wav_int16.dtype}")

        wav_buffer = io.BytesIO()
        wavfile.write(wav_buffer, out_sr, wav_int16)
        wav_buffer.seek(0)

        return Response(content=wav_buffer.read(), media_type="audio/wav")

    except Exception as ex:
        tb_str = ''.join(traceback.format_exception(type(ex), ex, ex.__traceback__))
        print(tb_str)
        return JSONResponse(status_code=500, content={"status": "error", "error": tb_str})


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", type=str, default="0.0.0.0")
    parser.add_argument("--port", type=int, default=6008)
    parser.add_argument("--model_dir", type=str, default="checkpoints")
    parser.add_argument("--gpu_memory_utilization", type=float, default=0.35)
    args = parser.parse_args()

    uvicorn.run(app=app, host=args.host, port=args.port)