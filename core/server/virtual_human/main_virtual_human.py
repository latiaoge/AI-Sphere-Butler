import sys
from pathlib import Path
import os
import queue
import threading
import numpy as np
import sounddevice as sd
import time
import subprocess  
from werkzeug.utils import secure_filename  
from aiohttp import web, MultipartReader  


import logging
logging.basicConfig(
    level=logging.WARNING,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)


curr_dir = Path(__file__).resolve().parent
logger.debug(f"Current dir: {curr_dir}")
project_root = curr_dir.parents[2]
logger.debug(f"Project root: {project_root}")
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))
logger.debug(f"sys.path updated: {sys.path[0]}")

from flask import Flask, request, jsonify
from flask_sockets import Sockets
import json
import gevent
from gevent import pywsgi
from geventwebsocket.handler import WebSocketHandler
import multiprocessing
from multiprocessing import Manager  
import argparse
import asyncio
from aiohttp import web
import aiohttp_cors
from aiortc import RTCPeerConnection, RTCSessionDescription
import redis
import uuid
import aiohttp
import yaml
from threading import Event, Thread, Lock  

from webrtc.webrtc import HumanPlayer

import lipreal
OriginalLipReal = lipreal.LipReal  

import websocket_service

from core.server.config.config import config 
import tempfile
import re
import shutil
import butler

multiprocessing.set_start_method('spawn', force=True)


# 配置文件上传路径 - 改为为你的服务本地相对路径
UPLOAD_FOLDER = Path(os.path.join(project_root, 'core', 'server', 'modules', 'print', 'file'))
PICTURE_FOLDER = Path(os.path.join(project_root, 'core', 'server', 'modules', 'print', 'picture'))
BACKGROUND_FOLDER = Path(os.path.join(project_root, 'core', 'server', 'modules', 'print', 'background'))
AVATARS_OUTPUT_FOLDER = Path("/mnt/e/work/AI-Sphere-Butler/core/server/virtual_human/data/avatars")
FRONTEND_VIDEO_FOLDER = Path("/mnt/e/work/AI-Sphere-Butler/core/client/web/ai-butler/video")


if not UPLOAD_FOLDER.exists():
    UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
    logger.debug(f"创建上传目录: {UPLOAD_FOLDER}")
if not PICTURE_FOLDER.exists():
    PICTURE_FOLDER.mkdir(parents=True, exist_ok=True)
    logger.debug(f"创建图片目录: {PICTURE_FOLDER}")
if not AVATARS_OUTPUT_FOLDER.exists():
    AVATARS_OUTPUT_FOLDER.mkdir(parents=True, exist_ok=True)
    logger.debug(f"创建输出目录: {AVATARS_OUTPUT_FOLDER}")
if not FRONTEND_VIDEO_FOLDER.exists():
    FRONTEND_VIDEO_FOLDER.mkdir(parents=True, exist_ok=True)
    logger.debug(f"创建前端视频目录: {FRONTEND_VIDEO_FOLDER}")


BUTLER_MAP_FILE = os.path.join(project_root, 'core', 'server', 'virtual_human', 'data', 'butler_map.json')
BUTLER_STORAGE_PATH = os.path.join(project_root, 'core', 'server', 'virtual_human', 'data', 'butlers.json') 





BUTLER_MAP_FILE = os.path.join(project_root, 'core', 'server', 'virtual_human', 'data', 'butler_map.json')
butler.init_butler_manager(BUTLER_STORAGE_PATH, BUTLER_MAP_FILE)



BUTLER_FOLDER_MAP = butler.load_butler_map(BUTLER_MAP_FILE)
logger.debug(f"初始管家映射: {BUTLER_FOLDER_MAP}")

def load_yaml_config(yaml_path=None):
    """从 config.yaml 读取配置"""
    if yaml_path is None:
        base_dir = Path(__file__).resolve().parent.parent.parent
        yaml_path = base_dir / 'server' / 'config' / 'config.yaml'
    if not yaml_path.exists():
        logger.error(f"配置文件不存在: {yaml_path}")
        return {}
    with open(yaml_path, "r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    logger.debug(f"加载配置文件: {yaml_path}")
    return cfg or {}


# ====================== 配置加载 ======================
def parse_args():
    parser = argparse.ArgumentParser(description="启动虚拟人程序")
    parser.add_argument('--tts',         type=str, default=None, help='TTS类型')
    parser.add_argument('--REF_FILE',    type=str, default=None, help='参考音频文件路径')
    parser.add_argument('--REF_TEXT',    type=str, default=None, help='参考文本')
    parser.add_argument('--TTS_SERVER',  type=str, default=None, help='TTS服务器地址')

    parser.add_argument('--pose',        type=str, default="data/data_kf.json", help="transforms.json, pose source")
    parser.add_argument('--au',          type=str, default="data/au.csv",       help="eye blink area")
    parser.add_argument('--torso_imgs',  type=str, default="",                  help="torso images path")
    parser.add_argument('-O',            action='store_true',                   help="equals --fp16 --cuda_ray --exp_eye")
    parser.add_argument('--data_range',  type=int, nargs='*', default=[0, -1], help="data range to use")
    parser.add_argument('--workspace',   type=str, default='data/video')
    parser.add_argument('--seed',        type=int, default=0)
    parser.add_argument('--ckpt',        type=str, default='data/pretrained/ngp_kf.pth')
    parser.add_argument('--num_rays',    type=int, default=4096*16)
    parser.add_argument('--cuda_ray',    action='store_true')
    parser.add_argument('--max_steps',   type=int, default=16)
    parser.add_argument('--num_steps',   type=int, default=16)
    parser.add_argument('--upsample_steps', type=int, default=0)
    parser.add_argument('--update_extra_interval', type=int, default=16)
    parser.add_argument('--max_ray_batch', type=int, default=4096)
    parser.add_argument('--warmup_step',    type=int, default=10000)
    parser.add_argument('--amb_aud_loss',   type=int, default=1)
    parser.add_argument('--amb_eye_loss',   type=int, default=1)
    parser.add_argument('--unc_loss',       type=int, default=1)
    parser.add_argument('--lambda_amb',     type=float, default=1e-4)
    parser.add_argument('--fp16',           action='store_true')
    parser.add_argument('--bg_img',         type=str, default='white')
    parser.add_argument('--fbg',            action='store_true')
    parser.add_argument('--exp_eye',        action='store_true')
    parser.add_argument('--fix_eye',        type=float, default=-1)
    parser.add_argument('--smooth_eye',     action='store_true')
    parser.add_argument('--torso_shrink',   type=float, default=0.8)
    parser.add_argument('--color_space',    type=str, default='srgb')
    parser.add_argument('--preload',        type=int, default=0)
    parser.add_argument('--bound',          type=float, default=1)
    parser.add_argument('--scale',          type=float, default=4)
    parser.add_argument('--offset',         type=float, nargs='*', default=[0,0,0])
    parser.add_argument('--dt_gamma',       type=float, default=1/256)
    parser.add_argument('--min_near',       type=float, default=0.05)
    parser.add_argument('--density_thresh', type=float, default=10)
    parser.add_argument('--density_thresh_torso', type=float, default=0.01)
    parser.add_argument('--patch_size',     type=int, default=1)
    parser.add_argument('--init_lips',      action='store_true')
    parser.add_argument('--finetune_lips',  action='store_true')
    parser.add_argument('--smooth_lips',    action='store_true')
    parser.add_argument('--torso',          action='store_true')
    parser.add_argument('--head_ckpt',      type=str, default='')
    parser.add_argument('--gui',            action='store_true')
    parser.add_argument('--W',              type=int, default=450)
    parser.add_argument('--H',              type=int, default=450)
    parser.add_argument('--radius',         type=float, default=3.35)
    parser.add_argument('--fovy',           type=float, default=21.24)
    parser.add_argument('--max_spp',        type=int, default=1)
    parser.add_argument('--att',            type=int, default=2)
    parser.add_argument('--aud',            type=str, default='')
    parser.add_argument('--emb',            action='store_true')
    parser.add_argument('--ind_dim',        type=int, default=4)
    parser.add_argument('--ind_num',        type=int, default=10000)
    parser.add_argument('--ind_dim_torso',  type=int, default=8)
    parser.add_argument('--amb_dim',        type=int, default=2)
    parser.add_argument('--part',           action='store_true')
    parser.add_argument('--part2',          action='store_true')
    parser.add_argument('--train_camera',   action='store_true')
    parser.add_argument('--smooth_path',    action='store_true')
    parser.add_argument('--smooth_path_window', type=int, default=7)
    parser.add_argument('--asr',            action='store_true')
    parser.add_argument('--asr_wav',        type=str, default='')
    parser.add_argument('--asr_play',       action='store_true')
    parser.add_argument('--asr_model',      type=str, default='cpierse/wav2lip-large-xlsr-53-esperanto')
    parser.add_argument('--asr_save_feats', action='store_true')
    parser.add_argument('--fps',            type=int, default=50)
    parser.add_argument('-l',               type=int, default=10)
    parser.add_argument('-m',               type=int, default=8)
    parser.add_argument('-r',               type=int, default=10)
    parser.add_argument('--fullbody',       action='store_true')
    parser.add_argument('--fullbody_img',   type=str, default='data/fullbody/img')
    parser.add_argument('--fullbody_width', type=int, default=580)
    parser.add_argument('--fullbody_height',type=int, default=1080)
    parser.add_argument('--fullbody_offset_x', type=int, default=0)
    parser.add_argument('--fullbody_offset_y', type=int, default=0)
    parser.add_argument('--avatar_id',      type=str, default='管家小粒')
    parser.add_argument('--bbox_shift',     type=int, default=5)
    parser.add_argument('--batch_size',     type=int, default=16)
    parser.add_argument('--customvideo',    action='store_true')
    parser.add_argument('--customvideo_img', type=str, default='data/customvideo/img')
    parser.add_argument('--customvideo_imgnum', type=int, default=1)
    parser.add_argument('--model',          type=str, default='wav2lip')
    parser.add_argument('--transport',      type=str, default='rtcpush')
    parser.add_argument('--push_url',       type=str, default='http://192.168.1.2:1985/rtc/v1/whip/?app=live&stream=livestream')
    parser.add_argument('--max_session',    type=int, default=1)
    parser.add_argument('--listenport',     type=int, default=8010)

    return parser.parse_args()


args = parse_args()

def merge_config_with_args(cfg, args):
    if args.tts is not None:
        cfg.setdefault('tts', {})['type']     = args.tts
    if args.REF_FILE is not None:
        cfg.setdefault('tts', {})['ref_file'] = args.REF_FILE
    if args.REF_TEXT is not None:
        cfg.setdefault('tts', {})['ref_text'] = args.REF_TEXT
    if args.TTS_SERVER is not None:
        cfg.setdefault('tts', {})['server']   = args.TTS_SERVER
    return cfg


yaml_config = load_yaml_config()
merged_config = merge_config_with_args(yaml_config, args)

if 'tts' not in merged_config:
    merged_config['tts'] = {'type': None, 'ref_file': None, 'ref_text': None, 'server': None}

for key, varname in [('type','tts'), ('ref_file','REF_FILE'), ('ref_text','REF_TEXT'), ('server','TTS_SERVER')]:
    setattr(args, varname, merged_config['tts'].get(key))

logger.debug(f"Final opt: tts={args.tts}, REF_FILE={args.REF_FILE}, REF_TEXT={args.REF_TEXT}, TTS_SERVER={args.TTS_SERVER}")
opt = args



active_avatar_id = opt.avatar_id  
if butler.butler_manager:
 
    butler_data = butler.butler_manager.get_butlers()
    if butler_data.get("activeButlerId"):
        active_avatar_id = butler_data["activeButlerId"]
        logger.info(f"[启动] 加载上次激活的管家ID: {active_avatar_id}")
    else:
        logger.info(f"[启动] 未找到保存的激活管家，使用默认: {active_avatar_id}")

opt.avatar_id = active_avatar_id
logger.info(f"[启动] 最终使用的管家ID: {opt.avatar_id}")



redis_cfg = merged_config.get('redis', {})
r = redis.Redis(
    host=redis_cfg.get('host', 'localhost'),
    port=int(redis_cfg.get('port', 6379)),
    db=int(redis_cfg.get('db', 0)),
    decode_responses=bool(redis_cfg.get('decode_responses', True))
)
logger.debug(f"初始化Redis连接: {redis_cfg.get('host', 'localhost')}:{redis_cfg.get('port', 6379)}")

nerfreals = {}
statreals = {}

def redis_publish(channel, message):    r.publish(channel, message)
def redis_lpush(queue_name, message):  r.lpush(queue_name, message)
def redis_brpop(queue_name, timeout=0): return r.brpop(queue_name, timeout=timeout)
def redis_set(key, value, ex=None):    r.set(key, value, ex=ex)
def redis_get(key):                    return r.get(key)



app = Flask(__name__)
sockets = Sockets(app)

@sockets.route('/humanecho')
def echo_socket(ws):
    session_id = str(uuid.uuid4())
    logger.debug(f"新的humanecho连接，session_id: {session_id}")
    
    def listener():
        pubsub = r.pubsub(); pubsub.subscribe(session_id)
        for msg in pubsub.listen():
            if msg['type']=='message':
                ws.send(msg['data'])
    
    gevent.spawn(listener)
    while True:
        m=ws.receive()
        if not m: 
            logger.debug(f"humanecho连接关闭，session_id: {session_id}")
            break
        redis_lpush('humanecho_queue', json.dumps({'session_id':session_id,'text':m}))


@sockets.route('/humanchat')
def chat_socket(ws):
    session_id = str(uuid.uuid4())
    logger.debug(f"新的humanchat连接，session_id: {session_id}")
    
    def listener():
        pubsub = r.pubsub(); pubsub.subscribe(session_id)
        for msg in pubsub.listen():
            if msg['type']=='message':
                ws.send(msg['data'])
    
    gevent.spawn(listener)
    while True:
        m=ws.receive()
        if not m: 
            logger.debug(f"humanchat连接关闭，session_id: {session_id}")
            break
        redis_lpush('llm_task_queue', json.dumps({'session_id':session_id,'text':m}))



async def offer(request):
    logger.debug("[API] 收到 /offer 请求")
    params = await request.json()
    logger.debug(f"[API] /offer 请求参数: {json.dumps(params)}")
    
    offer = RTCSessionDescription(sdp=params["sdp"], type=params["type"])

    sessionid = None
    for sid, state in statreals.items():
        if state == 0:
            sessionid = sid
            break

    if sessionid is None:
        if len(nerfreals) < opt.max_session:
            sessionid = str(len(nerfreals))
            logger.debug(f"[API] 创建新会话，sessionid: {sessionid}")
            
            nerfreals[sessionid] = LipReal(opt)

            quit_event = Event()
            t_render = Thread(target=nerfreals[sessionid].render, args=(quit_event,), daemon=True)
            t_render.start()

            t_redis = Thread(target=redis_msg_consumer, args=(sessionid,), daemon=True)
            t_redis.start()

            statreals[sessionid] = 0
        else:
            logger.warning('[API] 达到最大会话数')
            return web.Response(status=400, text='reach max session')

    statreals[sessionid] = 1

    pc = RTCPeerConnection()
    pcs.add(pc)

    @pc.on("connectionstatechange")
    async def on_connectionstatechange():
        logger.debug(f"[WebRTC] 连接状态变化: {pc.connectionState}")
        redis_set("autosay.log", "", ex=60)
        redis_set("autosayalready.log", "", ex=60)

        if pc.connectionState in ("failed", "closed"):
            await pc.close()
            pcs.discard(pc)
            statreals[sessionid] = 0
            logger.debug(f"[WebRTC] 连接关闭，sessionid: {sessionid}")

    player = HumanPlayer(nerfreals[sessionid])
    pc.addTrack(player.audio)
    pc.addTrack(player.video)

    await pc.setRemoteDescription(offer)
    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    response_data = {
        "sdp": pc.localDescription.sdp, 
        "type": pc.localDescription.type, 
        "sessionid": sessionid
    }
    logger.debug(f"[API] /offer 响应: {json.dumps(response_data)}")
    
    return web.Response(
        content_type="application/json",
        text=json.dumps(response_data)
    )


async def say5(request):
    params = await request.json()
    logger.debug(f"[API] 收到 /say5 请求: {json.dumps(params)}")
    
    redis_set("autosay.log", params['text'], ex=60)
    return web.Response(content_type="application/json", text=json.dumps({"code": 0, "data": "ok"}))


async def qwener(request):
    params = await request.json()
    logger.debug(f"[API] 收到 /qwener 请求: {json.dumps(params)}")
    
    r.rpush('question_log', params['text'])
    return web.Response(content_type="application/json", text=json.dumps({"code": 0, "data": "ok"}))


async def say(request):
    params = await request.json()
    logger.debug(f"[API] 收到 /say 请求: {json.dumps(params)}")
    
    session_id = '0'
    redis_lpush(f'nerfreal_msg_queue:{session_id}', params['text'])
    return web.Response(content_type="application/json", text=json.dumps({"code": 0, "data": "ok"}))


async def human(request):
    params = await request.json()
    logger.debug(f"[API] 收到 /human 请求: {json.dumps(params)}")
    
    sessionid = params.get('sessionid')
    if sessionid is None:
        logger.warning("[API] /human 缺少 sessionid 参数")
        return web.Response(status=400, text='缺少 sessionid 参数')
    if sessionid not in nerfreals:
        logger.warning(f"[API] /human 无效的 sessionid: {sessionid}")
        return web.Response(status=400, text='无效的 sessionid')

    if params.get('interrupt'):
        nerfreals[sessionid].pause_talk()
        logger.debug(f"[API] /human 打断会话: {sessionid}")
        
    redis_lpush(f'nerfreal_msg_queue:{sessionid}', params['text'])
    return web.Response(content_type="application/json", text=json.dumps({"code": 0, "data": "ok"}))


async def api_interrupt_speaking(request):
    logger.debug("[API] 收到 /api/interrupt_speaking 请求")
    try:
        data = await request.json()
        logger.debug(f"[API] /api/interrupt_speaking 请求数据: {json.dumps(data)}")
    except Exception as e:
        logger.error(f"[API] /api/interrupt_speaking 解析JSON失败: {str(e)}")
        data = {}

    sessionid = data.get('sessionid', '0')
    if sessionid not in nerfreals:
        logger.warning(f"[API] /api/interrupt_speaking 无效的 sessionid: {sessionid}")
        return web.json_response({'error': '无效的 sessionid'}, status=400)

    try:
        nerfreals[sessionid].pause_talk()
        logger.debug(f"[API] /api/interrupt_speaking 成功打断会话: {sessionid}")
        return web.json_response({'success': True})
    except Exception as e:
        logger.error(f"[API] /api/interrupt_speaking 打断失败: {str(e)}")
        return web.json_response({'error': f'打断失败: {e}'}, status=500)


# 音频流处理
SAMPLE_RATE = 16000
CHANNELS = 1
BITS_PER_SAMPLE = 16
FRAME_SAMPLES = 320
BYTES_PER_SAMPLE = BITS_PER_SAMPLE // 8
FRAME_BYTES = FRAME_SAMPLES * CHANNELS * BYTES_PER_SAMPLE

async def audio_stream_in(request: web.Request):
    logger.debug("[API] 收到 /audio_stream_in 请求")
    sessionid = request.query.get("sessionid")
    logger.debug(f"[API] /audio_stream_in sessionid: {sessionid}")
    
    if sessionid is None:
        logger.warning("[API] /audio_stream_in 缺少 sessionid 参数")
        return web.json_response({"code": 1, "msg": "缺少 sessionid 参数"}, status=400)
    if sessionid not in nerfreals:
        logger.warning(f"[API] /audio_stream_in 无效的 sessionid: {sessionid}")
        return web.json_response({"code": 2, "msg": "无效的 sessionid"}, status=400)
    
    try:
        body = await request.read()
        logger.debug(f"[API] /audio_stream_in 收到 {len(body)} 字节数据")
        if len(body) % FRAME_BYTES != 0:
            logger.warning(f"[API] /audio_stream_in 数据长度不是{FRAME_BYTES}的倍数")
            return web.json_response({"code": 3, "msg": f"长度需{FRAME_BYTES}字节整数倍"}, status=400)
        
        audio_int16 = np.frombuffer(body, dtype=np.int16).reshape(-1, FRAME_SAMPLES)
        frame_count = audio_int16.shape[0]
        logger.debug(f"[API] /audio_stream_in 解析到 {frame_count} 帧音频")
        
        for idx, frame_int16 in enumerate(audio_int16):
            af = frame_int16.astype(np.float32) / 32768.0
            nerfreals[sessionid].put_audio_frame(af)
        
        logger.debug(f"[API] /audio_stream_in 处理完成")
        return web.json_response({"code": 0, "msg": "接收成功"})
    except Exception as e:
        logger.error(f"[API] /audio_stream_in 异常: {str(e)}", exc_info=True)
        return web.json_response({"code": 4, "msg": f"异常:{e}"}, status=500)



def audio_data_processing(audio_queue):
    FRAME_SAMPLES = 320
    logger.debug("音频处理线程启动")
    
    while True:
        try:
            _ws_session, raw_bytes = audio_queue.get()
            audio_int16 = np.frombuffer(raw_bytes, dtype=np.int16)
            num_frames = len(audio_int16) // FRAME_SAMPLES
            audio_int16 = audio_int16[: num_frames * FRAME_SAMPLES]
            frames = audio_int16.reshape(num_frames, FRAME_SAMPLES)
            
            for frame in frames:
                audio_frame = frame.astype(np.float32) / 32768.0
                if '0' in nerfreals:
                    nerfreals['0'].put_audio_frame(audio_frame)
                else:
                    logger.warning("[AudioProc] 没有找到 session '0'")
                    
            audio_queue.task_done()
        except Exception as e:
            logger.error(f"[AudioProc] 数据处理异常: {str(e)}", exc_info=True)



def llm_response_sync(text):
    return f"Echo: {text}"


def llm_worker():
    logger.debug('LLM worker 启动，等待任务...')
    while True:
        try:
            
            _, task_json = r.brpop("llm_task_queue")
            task = json.loads(task_json)
            session_id = task['session_id']
            text = task['text']
            logger.debug(f"[LLM] 处理任务，session_id: {session_id}, text: {text}")
            
            response = llm_response_sync(text)
            r.publish(session_id, response)
            logger.debug(f"[LLM] 发送响应，session_id: {session_id}, response: {response}")
        except Exception as e:
            logger.error(f"[LLM] 处理任务异常: {str(e)}", exc_info=True)


def redis_msg_consumer(sessionid):
    logger.debug(f"Redis消息消费者启动，sessionid: {sessionid}")
    
    while True:
        try:
            _, msg = r.brpop(f'nerfreal_msg_queue:{sessionid}')
            if msg:
                logger.debug(f"[Redis] 收到消息，sessionid: {sessionid}, msg: {msg}")
                nerfreals[sessionid].pause_talk()
                time.sleep(0.3)
                nerfreals[sessionid].put_msg_txt(msg)
        except Exception as e:
            logger.error(f"[Redis] Session {sessionid} 处理消息异常: {str(e)}", exc_info=True)



def start_ws_server(audio_queue):
    try:
        logger.debug("启动WebSocket服务...")
        asyncio.run(websocket_service.run_server(audio_queue, '0.0.0.0', 8020))
    except Exception as e:
        logger.error(f"[start_ws_server] 异常: {str(e)}", exc_info=True)



BASE_AVATAR_PATH = os.path.join(project_root, 'core', 'server', 'virtual_human', 'data', 'avatars')
logger.debug(f"基础Avatar路径: {BASE_AVATAR_PATH}")

current_active_butler_id = None
lock_avatar_switch = Lock()  



class LipReal(OriginalLipReal):
    def __init__(self, opt):
        super().__init__(opt)
        self.avatar_dir = None
        logger.debug(f"[LipReal] 初始化实例，使用avatar_id: {opt.avatar_id}")

    def load_avatar(self, avatar_folder_path):
        self.avatar_dir = avatar_folder_path
        logger.debug(f"[LipReal] 加载avatar: {avatar_folder_path}")
        super().load_avatar(avatar_folder_path)

    def reload_avatar(self):
        if self.avatar_dir is None:
            logger.debug("[LipReal] 无avatar目录，跳过reload")
            return
            
        logger.debug(f"[LipReal] 重新加载avatar: {self.avatar_dir}")
        self.load_avatar(self.avatar_dir)

    def switch_avatar(self, new_avatar_folder_path):
        logger.debug(f"[LipReal] 切换到新avatar: {new_avatar_folder_path}")
        self.load_avatar(new_avatar_folder_path)


async def on_shutdown(app):
    logger.debug("应用开始关闭，清理资源")
    coros = [pc.close() for pc in pcs]
    await asyncio.gather(*coros)
    pcs.clear()
    logger.debug("应用关闭完成")



appasync = web.Application()
appasync.on_shutdown.append(on_shutdown)
appasync.router.add_post("/offer", offer)
appasync.router.add_post("/human", human)
appasync.router.add_post("/say", say)
appasync.router.add_post("/qwener", qwener)
appasync.router.add_post("/say5", say5)
appasync.router.add_static(
    '/core/client/', 
    path=os.path.join(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..')), 'core', 'client', 'web')
)
appasync.router.add_post("/audio_stream_in", audio_stream_in)
appasync.router.add_post("/api/switch_avatar", lambda request: butler.api_switch_avatar(request, r, BUTLER_FOLDER_MAP))
appasync.router.add_post("/api/interrupt_speaking", api_interrupt_speaking)

appasync.router.add_post(
    "/api/make_human", 
    lambda request: butler.handle_make_human(
        request, 
        UPLOAD_FOLDER, 
        AVATARS_OUTPUT_FOLDER, 
        FRONTEND_VIDEO_FOLDER, 
        BUTLER_MAP_FILE, 
        project_root,
        nerfreals
    )
)

appasync.router.add_get("/api/butlers", butler.get_butlers)  
appasync.router.add_post("/api/butlers/active", butler.set_active_butler)  


# ==================== 文件上传打印接口（开发中。。） ====================

async def upload_print_file(request):
    logger.info("收到文件上传请求")
    reader = await request.multipart()
    field = await reader.next()
    if not field or field.name != 'file':
        logger.warning("上传请求中没有file字段")
        return web.json_response({'error': '没有上传文件'}, status=400)

    filename = field.filename
    if not filename:
        logger.warning("上传文件名为空")
        return web.json_response({'error': '文件名为空'}, status=400)

    
    filename_secure = secure_filename(filename)
    
    
    file_ext = os.path.splitext(filename_secure)[1].lower()
    filename_base = os.path.splitext(filename_secure)[0].lower()
    
    
    IMAGE_EXTS = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'}
    
    
    is_background_image = (filename_base.startswith('bg-') and file_ext[1:] in IMAGE_EXTS)
    
   
    file_url = None
    frontend_path = None
    
    if is_background_image:
        #改为你本地地址
        save_dir = Path("/mnt/e/work/AI-Sphere-Butler/core/server/modules/print/background")
        url_prefix = '/backgrounds/'
        
       
        frontend_dir = Path("/mnt/e/work/AI-Sphere-Butler/core/client/web/ai-butler/image")
        
        
        frontend_path = f"/core/client/ai-butler/image/{filename_secure}"
    elif file_ext[1:] in IMAGE_EXTS:
        
        save_dir = PICTURE_FOLDER
    else:
       
        save_dir = UPLOAD_FOLDER
    
 
    os.makedirs(save_dir, exist_ok=True)
    
   
    unique_filename = f"{uuid.uuid4().hex}{file_ext}"
    save_path = save_dir / unique_filename
    
    
    try:
        with open(save_path, 'wb') as f:
            while True:
                chunk = await field.read_chunk()
                if not chunk:
                    break
                f.write(chunk)
        os.chmod(save_path, 0o644)
        logger.info(f"文件保存成功: {save_path}")
    except Exception as e:
        logger.error(f"保存文件异常: {e}")
        return web.json_response({'error': '保存文件失败'}, status=500)

    user_id = request.rel_url.query.get('user_id', 'anonymous')

   
    if is_background_image:
        file_url = f"{url_prefix}{unique_filename}"
        logger.debug(f"生成背景文件访问URL: {file_url}")
        
        
        try:
            os.makedirs(frontend_dir, exist_ok=True)
            frontend_file_path = frontend_dir / filename_secure
            await asyncio.to_thread(shutil.copy2, str(save_path), str(frontend_file_path))
            logger.info(f"文件已复制到前端目录: {frontend_file_path}")
        except Exception as e:
            logger.error(f"复制文件到前端目录失败: {e}")
    
   
    if not is_background_image:
        
        task = {
            'type': 'file_print',
            'user_id': user_id,
            'file_path': str(save_path),
            'filename': filename_secure,
            'intent': 'print',
            'timestamp': int(time.time()),
        }
        try:
            r.rpush('chat_message_queue', str(task))
            logger.info(f"打印任务写入Redis队列: {task}")
        except Exception as e:
            logger.error(f"写入Redis失败: {e}")
            return web.json_response({'error': '打印任务提交失败'}, status=500)

  
    response_data = {
        'status': 'success',
        'message': '文件上传成功',
        'filename': filename_secure
    }
    if is_background_image:
        response_data['file_url'] = file_url
        response_data['frontend_path'] = frontend_path  

    return web.json_response(response_data)


appasync.router.add_post('/api/upload_print_file', upload_print_file)



cors = aiohttp_cors.setup(appasync, defaults={
    "*": aiohttp_cors.ResourceOptions(
        allow_credentials=True,
        expose_headers="*",
        allow_headers="*",
    )
})
for route in list(appasync.router.routes()):
    cors.add(route)


logger.debug("===== 注册的路由 =====")
for route in appasync.router.routes():
    route_path = route.resource.canonical if hasattr(route, 'resource') and route.resource else 'unknown'
    logger.debug(f"{route.method} {route_path} -> {route.handler.__name__}")
logger.debug("====================")

runner = web.AppRunner(appasync)


def run_server_http(runner):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(runner.setup())
    site = web.TCPSite(runner, '0.0.0.0', opt.listenport)
    loop.run_until_complete(site.start())
    logger.info(f"[Server] 启动HTTP服务器，监听端口: {opt.listenport}")
    
    if opt.transport == 'rtcpush':
        loop.run_until_complete(run(opt.push_url))
        
    loop.run_forever()


async def post(url, json_data):
    try:
        logger.debug(f"发送POST请求到: {url}, 数据: {json.dumps(json_data)}")
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=json_data) as response:
                response_text = await response.text()
                logger.debug(f"POST响应状态: {response.status}, 内容: {response_text}")
                return response_text
    except aiohttp.ClientError as e:
        logger.error(f'POST请求错误 {url}: {e}')
        return None


async def run(push_url):
    pc = RTCPeerConnection()
    pcs.add(pc)
    logger.debug(f"[WebRTC] 初始化RTCPeerConnection，推流地址: {push_url}")

    @pc.on("connectionstatechange")
    async def on_connectionstatechange():
        logger.debug(f"[WebRTC] 连接状态: {pc.connectionState}")
        redis_set("autosay.log", "", ex=60)
        redis_set("autosayalready.log", "", ex=60)
        
        if pc.connectionState == "failed":
            await pc.close()
            pcs.discard(pc)
            logger.debug("[WebRTC] 连接失败，关闭连接")

    if not nerfreals:
        logger.warning("[WebRTC] 没有可用的nerfreals实例")
        return
        
    first_sessionid = next(iter(nerfreals))
    player = HumanPlayer(nerfreals[first_sessionid])
    pc.addTrack(player.audio)
    pc.addTrack(player.video)
    logger.debug(f"[WebRTC] 添加音视频轨道，会话: {first_sessionid}")

    offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    response_text = await post(push_url, {
        "sdp": pc.localDescription.sdp,
        "type": pc.localDescription.type
    })

    if not response_text:
        logger.warning("[WebRTC] 未收到信令服务器响应")
        return

    try:
        response_json = json.loads(response_text)
    except Exception as e:
        logger.error(f"[WebRTC] 解析信令响应失败: {e}, 响应内容: {response_text}")
        return

    sdp_answer = response_json.get("sdp")
    type_answer = response_json.get("type")

    if not sdp_answer or not type_answer:
        logger.warning(f"[WebRTC] 无效的SDP响应: {response_json}")
        return

    await pc.setRemoteDescription(RTCSessionDescription(sdp=sdp_answer, type=type_answer))
    logger.debug("[WebRTC] 已设置远程描述，推流开始")


if __name__ == '__main__':
    
    manager = Manager()
    audio_queue = manager.Queue()  
    pcs = set()

    
    ws_proc = multiprocessing.Process(
        target=start_ws_server,
        args=(audio_queue,),
        daemon=True  
    )
    ws_proc.start()
    logger.debug(f"启动WebSocket服务进程，PID: {ws_proc.pid}")

    if opt.model == 'wav2lip':
        logger.debug(f"初始化wav2lip模型，最大会话数: {opt.max_session}")
        for i in range(opt.max_session):
            sessionid = str(i)
            nerfreal = LipReal(opt)
            nerfreals[sessionid] = nerfreal

            quit_event = Event()
            t_render = Thread(target=nerfreals[sessionid].render, args=(quit_event,), daemon=True)
            t_render.start()
            logger.debug(f"启动渲染线程，sessionid: {sessionid}, 线程ID: {t_render.ident}")

            t_redis = Thread(target=redis_msg_consumer, args=(sessionid,), daemon=True)
            t_redis.start()
            logger.debug(f"启动Redis消费者线程，sessionid: {sessionid}, 线程ID: {t_redis.ident}")

            statreals[sessionid] = 0

   
    processing_thread = threading.Thread(
        target=audio_data_processing,
        args=(audio_queue,),
        daemon=True
    )
    processing_thread.start()
    logger.debug(f"启动音频处理线程，线程ID: {processing_thread.ident}")

    
    llm_thread = Thread(target=llm_worker, daemon=True)
    llm_thread.start()
    logger.debug(f"启动LLM线程，线程ID: {llm_thread.ident}")

    
    quit_events = {}
    render_threads = {}
    redis_consumer_threads = {}
    for sessionid in nerfreals.keys():
        quit_event = Event()
        quit_events[sessionid] = quit_event

        t_render = Thread(
            target=nerfreals[sessionid].render,
            args=(quit_event,),
            daemon=True
        )
        t_render.start()
        render_threads[sessionid] = t_render
        logger.debug(f"启动渲染线程，sessionid: {sessionid}, 线程ID: {t_render.ident}")

        t_redis = Thread(
            target=redis_msg_consumer,
            args=(sessionid,),
            daemon=True
        )
        t_redis.start()
        redis_consumer_threads[sessionid] = t_redis
        logger.debug(f"启动Redis消息线程，sessionid: {sessionid}, 线程ID: {t_redis.ident}")

   
    avatar_switch_thread = Thread(
        target=butler.avatar_switch_listener,
        args=(r, BUTLER_FOLDER_MAP, BASE_AVATAR_PATH, nerfreals, butler.butler_manager),  
        daemon=True
    )
    avatar_switch_thread.start()
    logger.debug(f"启动Avatar切换监听线程，线程ID: {avatar_switch_thread.ident}")

    logger.info("[Main] 所有服务启动完成")

    
    try:
        run_server_http(runner)
    except KeyboardInterrupt:
        logger.info("用户中断，正在退出...")
    finally:
        
        if ws_proc and ws_proc.is_alive():
            ws_proc.terminate()
            ws_proc.join(timeout=2.0)
            logger.debug("WebSocket服务进程已终止")
            
        for thread in render_threads.values():
            thread.join(1)
            
        for thread in redis_consumer_threads.values():
            thread.join(1)
            
        avatar_switch_thread.join(1)
        llm_thread.join(1)
        processing_thread.join(1)
        
        logger.info("所有资源已清理，程序退出")    