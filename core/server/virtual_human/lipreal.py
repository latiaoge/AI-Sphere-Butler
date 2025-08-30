import math
import torch
import numpy as np

#from .utils import *
import subprocess
import os
import time
import cv2
import glob
import pickle
import copy

import queue
from queue import Queue
from threading import Thread, Event
from io import BytesIO
import multiprocessing as mp
from multiprocessing import Manager

from tts.ttsreal import EdgeTTS,VoitsTTS,XTTS,CosyVoiceTTS

from asr.lipasr import LipASR
import asyncio
from av import AudioFrame, VideoFrame

from wav2lip.models import Wav2Lip

from tqdm import tqdm

device = 'cuda' if torch.cuda.is_available() else 'cpu'
print('Using {} for inference.'.format(device))

def _load(checkpoint_path):
    if device == 'cuda':
        checkpoint = torch.load(checkpoint_path)
    else:
        checkpoint = torch.load(checkpoint_path,
                                map_location=lambda storage, loc: storage)
    return checkpoint

def load_model(path):
    model = Wav2Lip()
    print("Load checkpoint from: {}".format(path))
    checkpoint = _load(path)
    s = checkpoint["state_dict"]
    new_s = {}
    for k, v in s.items():
        new_s[k.replace('module.', '')] = v
    model.load_state_dict(new_s)

    model = model.to(device)
    return model.eval()

def read_imgs(img_list):
    frames = []
    print('reading images...')
    for img_path in tqdm(img_list):
        frame = cv2.imread(img_path)
        frames.append(frame)
    return frames

def __mirror_index(size, index):
    
    return index % size

def inference(render_event, model_reload_flag, batch_size, shared_data, audio_feat_queue, audio_out_queue, res_frame_queue):
    import traceback

    def load_current_model():
        model_path = shared_data.get('model_path', "./models/wav2lip.pth")
        print(f"[Inference] 加载模型权重: {model_path}")
        return load_model(model_path)

    model = load_current_model()

    current_face_imgs_path = None
    face_list_cycle = []
    length = 0
    index = 0
    count = 0
    counttime = 0

    def load_face_imgs():
        nonlocal current_face_imgs_path, face_list_cycle, length, index
        try:
            path = shared_data.get('face_imgs_path', None)
            if path is None:
                print("[Inference] 警告: shared_data 中未找到 face_imgs_path")
                return False
            if path != current_face_imgs_path:
                print(f"[Inference] face_imgs_path变更: {current_face_imgs_path} -> {path}")
                current_face_imgs_path = path
            else:
                print(f"[Inference] face_imgs_path 未变更: {current_face_imgs_path}")

            input_face_list = glob.glob(os.path.join(current_face_imgs_path, '*.[jpJP][pnPN]*[gG]'))
            input_face_list = sorted(input_face_list, key=lambda x: int(os.path.splitext(os.path.basename(x))[0]))
            print(f"[Inference] 读取face_imgs列表数量: {len(input_face_list)}，示例: {input_face_list[:3]}")
            if len(input_face_list) == 0:
                print("[Inference] 警告: 读取到的face_imgs为空，确认目录和文件是否正确")
                return False

            face_list_cycle = read_imgs(input_face_list)
            length = len(face_list_cycle)
            index = 0
            return True
        except Exception as e:
            print("[Inference] load_face_imgs异常:", e)
            traceback.print_exc()
            return False

    
    if not load_face_imgs():
        print("[Inference] 初始加载face_imgs失败，请检查资源路径和文件")

    print('start inference')
    while True:
        try:
            if model_reload_flag.value:
                print("[Inference] 收到模型热载入标记")
                try:
                    model = load_current_model()
                except Exception as e:
                    print(f"[Inference] 模型热载入失败: {e}")
                    traceback.print_exc()

                if not load_face_imgs():
                    print("[Inference] 热载入时加载face_imgs失败")

                model_reload_flag.value = False
                print("[Inference] 模型及资源热载入完成")

            if render_event.is_set():
                mel_batch = []
                try:
                    mel_batch = audio_feat_queue.get(block=True, timeout=1)
                except queue.Empty:
                    continue

                is_all_silence = True
                audio_frames = []
                for _ in range(batch_size * 2):
                    frame, type_ = audio_out_queue.get()
                    audio_frames.append((frame, type_))
                    if type_ == 0:
                        is_all_silence = False

                if is_all_silence:
                    for i in range(batch_size):
                        res_frame_queue.put((None, __mirror_index(length, index), audio_frames[i*2:i*2+2]))
                        index += 1
                else:
                    t = time.perf_counter()
                    img_batch = []
                    for i in range(batch_size):
                        idx = __mirror_index(length, index + i)
                        if idx >= length:
                            print(f"[Inference] 警告: idx={idx} 越界 length={length}，取模后使用")
                            idx = idx % length
                        face = face_list_cycle[idx]
                        img_batch.append(face)
                    img_batch, mel_batch = np.asarray(img_batch), np.asarray(mel_batch)

                    img_masked = img_batch.copy()
                    img_masked[:, face.shape[0]//2:] = 0

                    img_batch = np.concatenate((img_masked, img_batch), axis=3) / 255.
                    mel_batch = np.reshape(mel_batch, [len(mel_batch), mel_batch.shape[1], mel_batch.shape[2], 1])

                    img_batch = torch.FloatTensor(np.transpose(img_batch, (0, 3, 1, 2))).to(device)
                    mel_batch = torch.FloatTensor(np.transpose(mel_batch, (0, 3, 1, 2))).to(device)

                    with torch.no_grad():
                        pred = model(mel_batch, img_batch)
                    pred = pred.cpu().numpy().transpose(0, 2, 3, 1) * 255.

                    counttime += (time.perf_counter() - t)
                    count += batch_size
                    if count >= 100:
                        print(f"------actual avg infer fps: {count / counttime:.4f}")
                        count = 0
                        counttime = 0

                    for i, res_frame in enumerate(pred):
                        res_frame_queue.put((res_frame, __mirror_index(length, index), audio_frames[i*2:i*2+2]))
                        index += 1
            else:
                time.sleep(0.1)
        except Exception as e:
            import traceback
            print("[Inference] 主循环异常:", e)
            traceback.print_exc()
            time.sleep(1)
    print('musereal inference processor stop')

class LipReal:
    def __init__(self, opt):
        self.opt = opt 
        self.W = opt.W
        self.H = opt.H

        self.fps = opt.fps 


        base_avatar_path = os.path.join(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..')), 'core', 'server', 'virtual_human', 'data', 'avatars')

        self.avatar_id = opt.avatar_id
        self.avatar_path = os.path.join(base_avatar_path, self.avatar_id)
        self.full_imgs_path = os.path.join(self.avatar_path, "full_imgs")
        self.face_imgs_path = os.path.join(self.avatar_path, "face_imgs")
        self.coords_path = os.path.join(self.avatar_path, "coords.pkl")

        self.batch_size = opt.batch_size
        self.idx = 0
        self.res_frame_queue = mp.Queue(self.batch_size*2)
        #self.__loadmodels()
        self.__loadavatar()

        self.asr = LipASR(opt)
        self.asr.warm_up()
        if opt.tts == "edgetts":
            self.tts = EdgeTTS(opt,self)
        elif opt.tts == "gpt-sovits":
            self.tts = VoitsTTS(opt,self)
        elif opt.tts == "xtts":
            self.tts = XTTS(opt,self)
        elif opt.tts == "cosyvoice":
            self.tts = CosyVoiceTTS(opt,self)
        else:
            class DummyTTS:
                def put_msg_txt(self, msg): pass
                def pause_talk(self): pass
                def render(self, quit_event):
                    print("[Warning] DummyTTS used, no TTS backend initialized.")
                    while not quit_event.is_set():
                        time.sleep(0.1)
            self.tts = DummyTTS()

        self.manager = Manager()
        self.shared_data = self.manager.dict()
        self.shared_data['face_imgs_path'] = self.face_imgs_path
        self.shared_data['model_path'] = "./models/wav2lip.pth"

        self.render_event = self.manager.Event()
        self.model_reload_flag = self.manager.Value('b', False)

        self.inference_process = mp.Process(target=inference, args=(
            self.render_event,
            self.model_reload_flag,
            self.batch_size,
            self.shared_data,
            self.asr.feat_queue,
            self.asr.output_queue,
            self.res_frame_queue,
        ))
        self.inference_process.start()

    def __loadavatar(self):
        with open(self.coords_path, 'rb') as f:
            self.coord_list_cycle = pickle.load(f)
        input_img_list = glob.glob(os.path.join(self.full_imgs_path, '*.[jpJP][pnPN]*[gG]'))
        input_img_list = sorted(input_img_list, key=lambda x: int(os.path.splitext(os.path.basename(x))[0]))
        self.frame_list_cycle = read_imgs(input_img_list)

    def load_avatar(self, avatar_folder_path):
        print(f"[LipReal] 切换avatar资源到: {avatar_folder_path}")
        self.avatar_path = avatar_folder_path
        self.full_imgs_path = os.path.join(self.avatar_path, "full_imgs")
        self.face_imgs_path = os.path.join(self.avatar_path, "face_imgs")
        self.coords_path = os.path.join(self.avatar_path, "coords.pkl")

        try:
            self.__loadavatar()
            print(f"[LipReal] 加载资源目录: {self.avatar_path}")
        except Exception as e:
            print(f"[LipReal] 加载资源失败: {e}")

        self.shared_data['face_imgs_path'] = self.face_imgs_path
        print(f"[LipReal] 更新shared_data['face_imgs_path']为: {self.face_imgs_path}")

        self.model_reload_flag.value = True
        print("[LipReal] 设置模型热载入标记为True")

    def put_msg_txt(self,msg):
        self.tts.put_msg_txt(msg)

    def put_audio_frame(self,audio_chunk): #16khz 20ms pcm
        self.asr.put_audio_frame(audio_chunk)

    def pause_talk(self):
        self.tts.pause_talk()
        self.asr.pause_talk()

    def process_frames(self,quit_event,loop=None,audio_track=None,video_track=None):
        while not quit_event.is_set():
            try:
                res_frame,idx,audio_frames = self.res_frame_queue.get(block=True, timeout=1)
            except queue.Empty:
                continue
            if audio_frames[0][1]==1 and audio_frames[1][1]==1: 
                combine_frame = self.frame_list_cycle[idx]
            else:
                bbox = self.coord_list_cycle[idx]
                combine_frame = copy.deepcopy(self.frame_list_cycle[idx])
                y1, y2, x1, x2 = bbox
                try:
                    res_frame = cv2.resize(res_frame.astype(np.uint8),(x2-x1,y2-y1))
                except:
                    continue
                combine_frame[y1:y2, x1:x2] = res_frame

            image = combine_frame 
            new_frame = VideoFrame.from_ndarray(image, format="bgr24")

            if video_track is not None and hasattr(video_track, '_queue') and video_track._queue is not None and loop is not None:
                asyncio.run_coroutine_threadsafe(video_track._queue.put(new_frame), loop) 
            else:
                # print("[Warning] video_track 或其 _queue 未初始化，跳过视频帧发送")
                pass
            for audio_frame in audio_frames:
                frame,type = audio_frame
                frame = (frame * 32767).astype(np.int16)
                new_frame = AudioFrame(format='s16', layout='mono', samples=frame.shape[0])
                new_frame.planes[0].update(frame.tobytes())
                new_frame.sample_rate=16000

                if audio_track is not None and hasattr(audio_track, '_queue') and audio_track._queue is not None and loop is not None:
                    asyncio.run_coroutine_threadsafe(audio_track._queue.put(new_frame), loop)
                else:
                    # print("[Warning] audio_track 或其 _queue 未初始化，跳过音频帧发送")
                    pass
        print('musereal process_frames thread stop') 

    def render(self,quit_event,loop=None,audio_track=None,video_track=None):
            self.tts.render(quit_event)
            process_thread = Thread(target=self.process_frames, args=(quit_event,loop,audio_track,video_track))
            process_thread.start()

            self.render_event.set() #start infer process render
            count=0
            totaltime=0
            _starttime=time.perf_counter()
            while not quit_event.is_set(): 
                t = time.perf_counter()
                self.asr.run_step()
                if video_track is not None and hasattr(video_track, '_queue') and video_track._queue is not None:
                    if video_track._queue.qsize()>=5:
                        print('sleep qsize=',video_track._queue.qsize())
                        time.sleep(0.04*video_track._queue.qsize()*0.8)
                else:
                    # print("[Warning] video_track 或其 _queue 未初始化，跳过睡眠调节")
                    pass
            self.render_event.clear() #end infer process render
            print('musereal thread stop')

    def reload_avatar(self):
        """
        触发推理进程重新加载模型
        适合换avatar或者更新权重时调用
        """
        print("[LipReal] 触发模型热载入")
        self.model_reload_flag.value = True
        print("[LipReal] 设置模型热载入标记为True")
