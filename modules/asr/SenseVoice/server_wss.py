from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, HTTPException, UploadFile, File
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.status import HTTP_422_UNPROCESSABLE_ENTITY
from pydantic_settings import BaseSettings
from pydantic import BaseModel, Field
from funasr import AutoModel
import numpy as np
import soundfile as sf
import argparse
import uvicorn
from urllib.parse import parse_qs
import os
import re
import glob
from modelscope.pipelines import pipeline
from modelscope.utils.constant import Tasks
from loguru import logger
import sys
import json
import traceback
import time
from pydub import AudioSegment
import io
import pypinyin
from pypinyin import Style
import webrtcvad
import asyncio

logger.remove()
log_format = "{time:YYYY-MM-DD HH:mm:ss} [{level}] {file}:{line} - {message}"
logger.add(sys.stdout, format=log_format, level="DEBUG", filter=lambda record: record["level"].no < 40)
logger.add(sys.stderr, format=log_format, level="ERROR", filter=lambda record: record["level"].no >= 40)


REGISTERED_SPEAKERS_FILE = "registered_speakers.pkl"

def load_registered_speakers():
    """从文件加载已注册用户"""
    if os.path.exists(REGISTERED_SPEAKERS_FILE):
        try:
            with open(REGISTERED_SPEAKERS_FILE, 'rb') as f:
                return pickle.load(f)
        except Exception as e:
            logger.error(f"加载注册用户失败: {e}")
    return {}

def save_registered_speakers(speakers):
    """保存已注册用户到文件"""
    try:
        with open(REGISTERED_SPEAKERS_FILE, 'wb') as f:
            pickle.dump(speakers, f)
        logger.info(f"已保存 {len(speakers)} 个注册用户")
    except Exception as e:
        logger.error(f"保存注册用户失败: {e}")

def reg_spk_init(files):
    reg_spk = {}
    for f in files:
        try:
            data, sr = sf.read(f, dtype="float32")
            k, _ = os.path.splitext(os.path.basename(f))
            reg_spk[k] = {"data": data, "sr": sr}
            logger.info(f"成功加载声纹文件: {k} from {f}")
        except Exception as e:
            logger.error(f"加载声纹注册文件{f}失败: {e}")
    return reg_spk


def get_latest_speaker_files(speaker_dir="speaker", max_files=1):
    if not os.path.exists(speaker_dir):
        os.makedirs(speaker_dir, exist_ok=True)
        return []
    files = glob.glob(os.path.join(speaker_dir, "*.wav"))
    files.sort(key=os.path.getmtime, reverse=True)
    return files[:max_files]


reg_spks_files = get_latest_speaker_files("speaker", max_files=1)
if not reg_spks_files:
    
    reg_spks_files = [
        "speaker/speaker1_a_cn_16k.wav"
    ]
reg_spks = reg_spk_init(reg_spks_files)


try:
    import pickle
    registered_speakers = load_registered_speakers()
    logger.info(f"已加载 {len(registered_speakers)} 个注册用户")
    for spk in registered_speakers:
        logger.info(f"注册用户: {spk}")
except Exception as e:
    logger.error(f"加载注册用户数据失败: {e}")
    registered_speakers = {}


class Config(BaseSettings):
    sv_thr: float = Field(0.40, description="Speaker verification threshold")  
    chunk_size_ms: int = Field(300, description="Chunk size in milliseconds")
    sample_rate: int = Field(16000, description="Sample rate in Hz")
    bit_depth: int = Field(16, description="Bit depth")
    channels: int = Field(1, description="Number of audio channels")
    avg_logprob_thr: float = Field(-0.25, description="average logprob threshold")
    min_speaker_verify_len: int = Field(12000, description="Minimum length for speaker verification (1.2 seconds)")
    
    sv_stability_threshold: float = Field(0.45, description="Speaker verification stability threshold")
    sv_failure_threshold: int = Field(3, description="Number of consecutive failures before resetting speaker identity")


config = Config()

emo_dict = {
    "<|HAPPY|>": "😊",
    "<|SAD|>": "😔",
    "<|ANGRY|>": "😡",
    "<|NEUTRAL|>": "",
    "<|FEARFUL|>": "😰",
    "<|DISGUSTED|>": "🤢",
    "<|SURPRISED|>": "😮",
    "<|Cry|>": "😭",
}

event_dict = {
    "<|BGM|>": "🎼",
    "<|Speech|>": "",
    "<|Applause|>": "👏",
    "<|Laughter|>": "😀",
    "<|Cry|>": "😭",
    "<|Sneeze|>": "🤧",
    "<|Breath|>": "",
    "<|Cough|>": "🤧",
}

emoji_dict = {
    "<|nospeech|><|Event_UNK|>": "❓",
    "<|zh|>": "",
    "<|en|>": "",
    "<|yue|>": "",
    "<|ja|>": "",
    "<|ko|>": "",
    "<|nospeech|>": "",
    "<|HAPPY|>": "😊",
    "<|SAD|>": "😔",
    "<|ANGRY|>": "😡",
    "<|NEUTRAL|>": "",
    "<|BGM|>": "🎼",
    "<|Speech|>": "",
    "<|Applause|>": "👏",
    "<|Laughter|>": "😀",
    "<|FEARFUL|>": "😰",
    "<|DISGUSTED|>": "🤢",
    "<|SURPRISED|>": "😮",
    "<|Cry|>": "😭",
    "<|EMO_UNKNOWN|>": "",
    "<|Sneeze|>": "🤧",
    "<|Breath|>": "",
    "<|Cough|>": "😷",
    "<|Sing|>": "",
    "<|Speech_Noise|>": "",
    "<|withitn|>": "",
    "<|woitn|>": "",
    "<|GBG|>": "",
    "<|Event_UNK|>": "",
}

lang_dict = {
    "<|zh|>": "<|lang|>",
    "<|en|>": "<|lang|>",
    "<|yue|>": "<|lang|>",
    "<|ja|>": "<|lang|>",
    "<|ko|>": "<|lang|>",
    "<|nospeech|>": "<|lang|>",
}

emo_set = {"😊", "😔", "😡", "😰", "🤢", "😮"}
event_set = {"🎼", "👏", "😀", "😭", "🤧", "😷",}


def format_str(s):
    for sptk in emoji_dict:
        s = s.replace(sptk, emoji_dict[sptk])
    return s


def format_str_v2(s):
    sptk_dict = {}
    for sptk in emoji_dict:
        sptk_dict[sptk] = s.count(sptk)
        s = s.replace(sptk, "")
    emo = "<|NEUTRAL|>"
    for e in emo_dict:
        if sptk_dict[e] > sptk_dict[emo]:
            emo = e
    for e in event_dict:
        if sptk_dict[e] > 0:
            s = event_dict[e] + s
    s = s + emo_dict[emo]

    for emoji in emo_set.union(event_set):
        s = s.replace(" " + emoji, emoji)
        s = s.replace(emoji + " ", emoji)
    return s.strip()


def format_str_v3(s):
    def get_emo(s):
        return s[-1] if s[-1] in emo_set else None

    def get_event(s):
        return s[0] if s[0] in event_set else None

    s = s.replace("<|nospeech|><|Event_UNK|>", "❓")
    for lang in lang_dict:
        s = s.replace(lang, "<|lang|>")
    s_list = [format_str_v2(s_i).strip(" ") for s_i in s.split("<|lang|>")]
    new_s = " " + s_list[0]
    cur_ent_event = get_event(new_s)
    for i in range(1, len(s_list)):
        if len(s_list[i]) == 0:
            continue
        if get_event(s_list[i]) == cur_ent_event and get_event(s_list[i]) is not None:
            s_list[i] = s_list[i][1:]
        cur_ent_event = get_event(s_list[i])
        if get_emo(s_list[i]) is not None and get_emo(s_list[i]) == get_emo(new_s):
            new_s = new_s[:-1]
        new_s += s_list[i].strip().lstrip()
    new_s = new_s.replace("The.", " ")
    return new_s.strip()


def contains_chinese_english_number(s: str) -> bool:
    return bool(re.search(r'[\u4e00-\u9fffA-Za-z0-9]', s))


sv_pipeline = pipeline(
    task='speaker-verification',
    model='iic/speech_eres2net_large_sv_zh-cn_3dspeaker_16k',
    model_revision='v1.0.0'
)

asr_pipeline = pipeline(
    task=Tasks.auto_speech_recognition,
    model='iic/SenseVoiceSmall',
    model_revision="master",
    device="cuda:0",
    disable_update=True
)

model_asr = AutoModel(
    model="iic/SenseVoiceSmall",
    trust_remote_code=True,
    remote_code="./model.py",
    device="cuda:0",
    disable_update=True
)

model_vad = AutoModel(
    model="iic/speech_fsmn_vad_zh-cn-16k-common-pytorch",
    model_revision="v2.0.4",
    disable_pbar=True,
    max_end_silence_time=500,
    disable_update=True
)


def reg_spk_init(files):
    reg_spk = {}
    for f in files:
        try:
            data, sr = sf.read(f, dtype="float32")
            k, _ = os.path.splitext(os.path.basename(f))
            reg_spk[k] = {
                "data": data,
                "sr": sr,
            }
        except Exception as e:
            logger.error(f"加载声纹注册文件{f}失败: {e}")
    return reg_spk



def speaker_verify(audio, sv_thr):
    """
    返回格式: (hit: bool, speaker_id: str, score: float, registered: bool)
    """
    hit = False
    best_score = 0.0
    best_speaker = None
    registered = False
    
    for speaker_id, speaker_data in reg_spks.items():
        res_sv = sv_pipeline([audio, speaker_data["data"]], sv_thr)
        current_score = res_sv["score"]
        
        logger.debug(
            f"与说话人 {speaker_id} 比对分数: {current_score:.4f} (阈值: {sv_thr})"
        )
        
        if current_score >= sv_thr and current_score > best_score:
            hit = True
            best_score = current_score
            best_speaker = speaker_id
            registered = True  
    
    logger.info(
        f"最终验证结果: hit={hit} speaker={best_speaker} "
        f"score={best_score:.4f} registered={registered}"
    )
    
    return hit, best_speaker, best_score, registered

def asr(audio, lang, cache, use_itn=False):
    start_time = time.time()
    result = model_asr.generate(
        input=audio,
        cache=cache,
        language=lang.strip(),
        use_itn=use_itn,
        batch_size_s=60,
    )
    end_time = time.time()
    elapsed_time = end_time - start_time
    logger.debug(f"asr elapsed: {elapsed_time * 1000:.2f} milliseconds")
    return result


def detect_wakeword(audio_chunk, cache_asr, wake_words):
    
    result = asr(audio_chunk, "zh", cache_asr, True)
    if result and len(result) > 0 and "text" in result[0]:
        text = result[0]["text"].lower()
        for wake_word in wake_words:
            if wake_word.lower() in text:
                logger.info(f"检测到唤醒词'{wake_word}'，识别文本：{text}")
                return True, text
    return False, ""


WAKE_WORDS = ["xiao li", "ni hao xiao li"]


class TranscriptionResponse(BaseModel):
    code: int
    info: str
    data: str


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.websocket("/ws/transcribe")
async def websocket_endpoint(websocket: WebSocket):
    try:
        
        query_params = parse_qs(websocket.scope['query_string'].decode())
        sv = query_params.get('sv', ['false'])[0].lower() in ['true', '1', 't', 'y', 'yes']
        lang = query_params.get('lang', ['auto'])[0].lower()
        wakeword_enabled = query_params.get('wakeword', ['0'])[0].lower() in ['1', 'true', 'yes', 'on']
        wake_words = [w.strip().lower() for w in query_params.get('wakewords', [''])[0].split(',') if w.strip()] or WAKE_WORDS
        
        
        exit_commands = ["退下吧", "休息吧", "再见", "退出", "结束"]
        
        await websocket.accept()
        chunk_size = int(config.chunk_size_ms * config.sample_rate / 1000)
        
        
        audio_buffer_raw = b""  
        audio_buffer_processed = np.array([], dtype=np.float32)  
        audio_vad = np.array([], dtype=np.float32)  

        
        wakeword_buffer = np.array([], dtype=np.float32)  
        min_wake_samples = max(2400, int(config.sample_rate * 0.5))  
        sliding_window_samples = int(config.sample_rate * 0.2)  
        
        
        cache = {}  
        cache_asr = {}  
        cache_wake = {}  

        
        last_vad_beg = last_vad_end = -1  
        offset = 0  
        hit = False  
        flag_wakeword = not wakeword_enabled  
        current_speaker = None  
        
        
        min_asr_samples = 1600   # 100ms @16kHz
        max_asr_samples = int(config.sample_rate * 5)  
        wake_timeout = 300  
        
        
        consecutive_sv_failures = 0  
        sv_reset_threshold = config.sv_failure_threshold  
        
        
        wakeword_detected_time = 0  
        post_wake_audio = np.array([], dtype=np.float32)  
        
        
        asr_processing = False  
        
        
        last_activity_time = time.time()
        
        
        sv_buffer = np.array([], dtype=np.float32)
        
        
        last_asr_time = 0
        min_asr_interval = 0.5  
        
        
        is_speaking = False
        silent_frames = 0
        min_silent_frames = int(config.sample_rate * 0.5 / chunk_size)  
        
        logger.info(f"连接已建立 | 参数: sv={sv}, lang={lang}, wakeword={wakeword_enabled}, wake_words={wake_words}")

        while True:
            
            if flag_wakeword and (time.time() - last_activity_time > wake_timeout):
                logger.info(f"唤醒状态超时({wake_timeout}秒)，自动退出唤醒状态")
                flag_wakeword = False
                post_wake_audio = np.array([], dtype=np.float32)
                sv_buffer = np.array([], dtype=np.float32)
                await websocket.send_json({
                    "code": 4,
                    "info": "唤醒状态超时，已退出",
                    "data": {}
                })
            
            
            try:
                data = await asyncio.wait_for(websocket.receive_bytes(), timeout=1.0)
                audio_buffer_raw += data
            except asyncio.TimeoutError:
                
                continue
            
            
            if len(audio_buffer_raw) >= 2:
                new_audio = np.frombuffer(
                    audio_buffer_raw[:len(audio_buffer_raw) - (len(audio_buffer_raw) % 2)], 
                    dtype=np.int16
                ).astype(np.float32) / 32767.0
                
                audio_buffer_processed = np.append(audio_buffer_processed, new_audio)
                audio_buffer_raw = audio_buffer_raw[len(audio_buffer_raw) - (len(audio_buffer_raw) % 2):]
                
                
                if flag_wakeword:
                    post_wake_audio = np.append(post_wake_audio, new_audio)
                    logger.debug(f"唤醒词已激活，正在收集音频: {len(post_wake_audio)} samples")
                    
                    
                    if sv:
                        sv_buffer = np.append(sv_buffer, new_audio)
                        
                        
                        if len(sv_buffer) >= config.min_speaker_verify_len:
                            try:
                                hit, speaker, score, registered = speaker_verify(sv_buffer, config.sv_thr)
                                
                                if hit:
                                    current_speaker = speaker
                                    consecutive_sv_failures = 0  
                                    logger.info(f"声纹验证通过: {speaker} (分数: {score:.4f})")
                                    await websocket.send_json({
                                        "code": 2,
                                        "info": "声纹验证通过",
                                        "data": {
                                            "speaker": speaker,
                                            "score": float(score),
                                            "registered": registered
                                        }
                                    })
                                else:
                                    consecutive_sv_failures += 1
                                    logger.warning(f"声纹验证失败: {consecutive_sv_failures}/{sv_reset_threshold}")
                                    
                                    
                                    if consecutive_sv_failures >= sv_reset_threshold:
                                        current_speaker = None
                                        consecutive_sv_failures = 0
                                        logger.info("已重置声纹验证状态")
                                        await websocket.send_json({
                                            "code": 3,
                                            "info": "声纹验证已重置",
                                            "data": {}
                                        })
                                
                                
                                sv_buffer = np.array([], dtype=np.float32)
                            
                            except Exception as e:
                                logger.error(f"声纹验证异常: {str(e)}\n{traceback.format_exc()}")
                                hit = False
                    
                    
                    if len(post_wake_audio) >= min_asr_samples:
                        
                        current_activity = check_vad_activity(post_wake_audio[-chunk_size:])
                        
                        if current_activity:
                            is_speaking = True
                            silent_frames = 0
                        else:
                            if is_speaking:
                                silent_frames += 1
                        
                        
                        if not asr_processing and len(post_wake_audio) >= min_asr_samples:
                            
                            if sv and not hit:
                                logger.debug("ASR暂停：声纹验证未通过")
                                continue
                            
                            
                            
                            
                            
                            execute_asr = False
                            
                            if len(post_wake_audio) >= max_asr_samples:
                                logger.info(f"唤醒词后音频达到最大长度({max_asr_samples} samples)，执行ASR")
                                execute_asr = True
                            elif is_speaking and silent_frames >= min_silent_frames:
                                logger.info(f"唤醒词后检测到语音结束，执行ASR，音频长度: {len(post_wake_audio)} samples")
                                execute_asr = True
                            elif len(post_wake_audio) > int(config.sample_rate * 5):
                                logger.info(f"唤醒词后持续有语音输入超过5秒，执行ASR，音频长度: {len(post_wake_audio)} samples")
                                execute_asr = True
                            
                            
                            if execute_asr and (time.time() - last_asr_time < min_asr_interval):
                                logger.debug(f"ASR间隔过短({time.time() - last_asr_time:.2f}秒 < {min_asr_interval}秒)，跳过")
                                execute_asr = False
                            
                            
                            if execute_asr:
                                asr_processing = True
                                last_asr_time = time.time()
                                
                                
                                #debug_asr_audio_path = f"debug_asr_audio_{int(time.time())}.wav"
                                #sf.write(debug_asr_audio_path, post_wake_audio, config.sample_rate)
                                
                                logger.debug(f"跳过写入ASR处理调试音频，音频长度={len(post_wake_audio)} samples")

                                
                                try:
                                    logger.info(f"开始唤醒词后ASR处理，音频长度: {len(post_wake_audio)} samples")
                                    result = asr(
                                        post_wake_audio,
                                        lang.strip(),
                                        cache_asr,
                                        True
                                    )
                                    if result is not None:
                                        asr_text = result[0].get("text", "")
                                        await websocket.send_json({
                                            "code": 0,
                                            "info": json.dumps(result[0], ensure_ascii=False),
                                            "data": format_str_v3(asr_text)
                                        })
                                        logger.info(f"ASR处理成功，结果: {asr_text}")
                                        
                                        
                                        for command in exit_commands:
                                            if command in asr_text:
                                                logger.info(f"检测到退出指令: {command}，退出唤醒状态")
                                                flag_wakeword = False
                                                post_wake_audio = np.array([], dtype=np.float32)
                                                sv_buffer = np.array([], dtype=np.float32)
                                                is_speaking = False
                                                silent_frames = 0
                                                await websocket.send_json({
                                                    "code": 4,
                                                    "info": "已退出唤醒状态",
                                                    "data": {}
                                                })
                                                break
                                        
                                        
                                        last_activity_time = time.time()
                                    else:
                                        logger.warning("ASR处理返回None")
                                except Exception as e:
                                    logger.error(f"唤醒词后ASR处理异常: {str(e)}")
                                finally:
                                    
                                    post_wake_audio = np.array([], dtype=np.float32)
                                    asr_processing = False
                                    is_speaking = False
                                    silent_frames = 0
                    else:
                        
                        is_speaking = True
                        silent_frames = 0
                else:
                    
                    wakeword_buffer = np.append(wakeword_buffer, new_audio)
                    
                    
                    if wakeword_enabled and len(wakeword_buffer) >= min_wake_samples:
                        
                        logger.debug(f"执行唤醒词检测，缓冲区长度: {len(wakeword_buffer)} samples")
                        
                        
                        if len(wakeword_buffer) > 0:
                            #debug_wake_audio_path = f"debug_wake_audio_{int(time.time())}.wav"
                            #sf.write(debug_wake_audio_path, wakeword_buffer, config.sample_rate)
                            
                            logger.debug(f"跳过写入唤醒词检测音频文件，音频长度={len(wakeword_buffer)} samples")
                        
                        
                        detected, detected_wakeword, asr_text = await process_wakeword_detection(
                            websocket, 
                            wakeword_buffer, 
                            cache_wake, 
                            wake_words
                        )
                        
                        logger.debug(f"唤醒词检测结果: detected={detected}, wakeword={detected_wakeword}, asr_text={asr_text}")
                        
                        if detected:
                            
                            flag_wakeword = True
                            wakeword_detected_time = time.time()
                            last_activity_time = time.time()  
                            logger.success(f"唤醒词检测成功: {detected_wakeword}")
                            await websocket.send_json({
                                "code": 1,
                                "info": "唤醒成功",
                                "data": detected_wakeword
                            })
                            
                            
                            wakeword_buffer = np.array([], dtype=np.float32)
                            
                            
                            audio_vad = np.array([], dtype=np.float32)
                            last_vad_beg = last_vad_end = -1
                            
                            
                            post_wake_audio = np.array([], dtype=np.float32)
                            sv_buffer = np.array([], dtype=np.float32)
                            asr_processing = False
                            is_speaking = False
                            silent_frames = 0
                        
                        
                        if len(wakeword_buffer) > sliding_window_samples:
                            wakeword_buffer = wakeword_buffer[-sliding_window_samples:]

            
            while len(audio_buffer_processed) >= chunk_size:
                chunk = audio_buffer_processed[:chunk_size]
                audio_buffer_processed = audio_buffer_processed[chunk_size:]
                audio_vad = np.append(audio_vad, chunk)
                
                
                if not flag_wakeword:
                    res = model_vad.generate(
                        input=chunk, 
                        cache=cache, 
                        is_final=False, 
                        chunk_size=config.chunk_size_ms
                    )
                    
                    
                    if len(res[0]["value"]):
                        for segment in res[0]["value"]:
                            
                            if segment[0] > -1:
                                last_vad_beg = segment[0]                           
                            if segment[1] > -1:
                                last_vad_end = segment[1]
                                
                                
                                if last_vad_beg > -1 and last_vad_end > -1:
                                    beg = int((last_vad_beg - offset) * config.sample_rate / 1000)
                                    end = int((last_vad_end - offset) * config.sample_rate / 1000)
                                    
                                    
                                    if beg < 0 or end > len(audio_vad) or beg >= end:
                                        logger.warning(f"无效音频段: beg={beg}, end={end}")
                                        audio_vad = np.array([], dtype=np.float32)
                                        offset = last_vad_end
                                        last_vad_beg = last_vad_end = -1
                                        continue
                                    
                                    
                                    if (end - beg) < min_asr_samples:
                                        logger.debug(f"语音段过短({end-beg} samples < {min_asr_samples})，跳过ASR处理")
                                        audio_vad = audio_vad[end:]
                                        offset = last_vad_end
                                        last_vad_beg = last_vad_end = -1
                                        continue
                                    
                                    
                                    execute_asr = not wakeword_enabled
                                    
                                    
                                    if sv and not hit and flag_wakeword:
                                        execute_asr = False
                                        logger.debug("ASR跳过：声纹验证未通过")
                                    
                                    
                                    if execute_asr:
                                        try:
                                            logger.info(f"开始ASR处理，音频长度: {end-beg} samples")
                                            result = asr(
                                                audio_vad[beg:end],
                                                lang.strip(),
                                                cache_asr,
                                                True
                                            )
                                            if result is not None:
                                                await websocket.send_json({
                                                    "code": 0,
                                                    "info": json.dumps(result[0], ensure_ascii=False),
                                                    "data": format_str_v3(result[0]['text'])
                                                })
                                        except Exception as e:
                                            logger.error(f"ASR处理异常: {str(e)}")
                                    else:
                                        logger.debug(f"ASR未执行，execute_asr={execute_asr}")
                                    
                                    
                                    audio_vad = audio_vad[end:]
                                    offset = last_vad_end
                                    last_vad_beg = last_vad_end = -1
                                    hit = False

    except WebSocketDisconnect:
        logger.info("客户端主动断开连接")
    except Exception as e:
        logger.critical(f"WebSocket严重错误: {str(e)}\n{traceback.format_exc()}")
        try:
            await websocket.close(code=1011, reason="Server Error")
        except:
            pass
    finally:
        
        audio_buffer_raw = b""
        audio_buffer_processed = np.array([], dtype=np.float32)
        audio_vad = np.array([], dtype=np.float32)
        wakeword_buffer = np.array([], dtype=np.float32)
        post_wake_audio = np.array([], dtype=np.float32)
        sv_buffer = np.array([], dtype=np.float32)
        cache.clear()
        cache_asr.clear()
        cache_wake.clear()
        logger.info("连接资源已释放")

def check_vad_activity(audio_data):
    """使用VAD检测音频中是否有语音活动"""
    if len(audio_data) < 3200:  
        return False
        
    
    audio_int16 = (audio_data * 32767).astype(np.int16).tobytes()
    
    
    vad = webrtcvad.Vad(3)  
    chunk_size = 320  # 20ms @16kHz
    active_chunks = 0
    
    for i in range(0, len(audio_int16), chunk_size):
        chunk = audio_int16[i:i+chunk_size]
        if len(chunk) == chunk_size:
            if vad.is_speech(chunk, 16000):
                active_chunks += 1
    
    
    return active_chunks > (len(audio_int16) // chunk_size) * 0.5



async def process_wakeword_detection(websocket, audio_buffer, cache, wake_words):
    """独立的唤醒词检测函数，使用滑动窗口机制和拼音匹配"""
    try:
        
        if len(audio_buffer) == 0:
            logger.warning("唤醒词检测：音频缓冲区为空")
            return False, "", ""
            
        
        logger.debug(f"唤醒词检测输入音频长度: {len(audio_buffer)} samples ({len(audio_buffer)/config.sample_rate:.2f} seconds)")
        
        result = model_asr.generate(
            input=audio_buffer,
            cache=cache,
            language="zh",
            use_itn=True,
            batch_size_s=1
        )
        
        
        detected = False
        detected_wakeword = ""
        asr_text = ""
        
        if result and len(result) > 0:
            asr_text = result[0].get("text", "").lower()
            logger.debug(f"唤醒词ASR识别结果: {asr_text}")
            
            
            clean_text = re.sub(r'<[^>]+>', '', asr_text)
            
            clean_text = re.sub(r'[^\w\s]', '', clean_text)
            logger.debug(f"处理后的文本用于匹配: '{clean_text}'")
            
            
            asr_pinyin = text_to_pinyin(clean_text)
            logger.debug(f"ASR文本的拼音: '{asr_pinyin}'")
            
            
            for wake_word in wake_words:
                
                clean_wakeword = re.sub(r'[^\w\s]', '', wake_word)
                
                
                wake_pinyin = text_to_pinyin(clean_wakeword)
                logger.debug(f"唤醒词 '{wake_word}' 的拼音: '{wake_pinyin}'")
                
                
                if wake_pinyin in asr_pinyin:
                    detected = True
                    detected_wakeword = wake_word
                    logger.debug(f"拼音匹配成功: '{wake_pinyin}' in '{asr_pinyin}'")
                    break
        
        return detected, detected_wakeword, asr_text
    except Exception as e:
        logger.error(f"唤醒词检测异常: {str(e)}")
        return False, "", ""

def text_to_pinyin(text):
    """将中文文本转换为拼音，使用空格分隔每个字的拼音"""
    if not text:
        return ""
        
    
    pinyin_list = pypinyin.pinyin(text, style=pypinyin.NORMAL)
    
    
    return ' '.join([item[0] for item in pinyin_list])

@app.post("/api/uploadSpeaker")
async def upload_speaker(file: UploadFile = File(...)):
    try:
        upload_dir = os.path.join(os.getcwd(), "speaker")
        os.makedirs(upload_dir, exist_ok=True)

        timestamp = int(time.time() * 1000)
        filename = f"speaker_{timestamp}.wav"
        file_path = os.path.join(upload_dir, filename)

        content = await file.read()

        audio = AudioSegment.from_file(io.BytesIO(content))
        audio = audio.set_frame_rate(config.sample_rate).set_channels(1).set_sample_width(2)
        audio.export(file_path, format="wav")

        data, sr = sf.read(file_path, dtype="float32")

        global reg_spks_files, reg_spks
        reg_spks_files = [file_path]  
        reg_spks = reg_spk_init(reg_spks_files)
        
        
        speaker_id = os.path.splitext(filename)[0]
        registered_speakers[speaker_id] = True
        save_registered_speakers(registered_speakers)

        logger.info(f"Uploaded speaker wav saved as {file_path}")
        logger.info(f"当前注册用户列表: {list(registered_speakers.keys())}")
        return {"code": 0, "info": "上传成功", "data": filename}
    except Exception as e:
        logger.error(f"上传声纹音频失败: {e}")
        return JSONResponse(status_code=500, content={"code": 500, "info": f"上传失败: {e}", "data": ""})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the FastAPI app with a specified port.")
    parser.add_argument('--port', type=int, default=6007, help='Port number to run the FastAPI app on.')
    args = parser.parse_args()
    uvicorn.run(app, host="0.0.0.0", port=args.port)