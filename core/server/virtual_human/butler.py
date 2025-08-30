import os
import re
import json
import time
import shutil
import uuid
import logging
import subprocess
from pathlib import Path
from aiohttp import web
from threading import Lock


logger = logging.getLogger(__name__)


def ensure_butler_map_path(butler_map_param):
    """确保返回有效的映射文件路径字符串，使用实际默认路径"""
    # 实际默认路径改为你本地路径
    DEFAULT_PATH = "/mnt/e/work/AI-Sphere-Butler/core/server/virtual_human/data/butler_map.json"
    
    if isinstance(butler_map_param, dict):
        
        path_from_dict = butler_map_param.get('path', '')
        if isinstance(path_from_dict, str) and path_from_dict:
            logger.warning(f"[路径修复] 从字典中提取映射文件路径: {path_from_dict}")
            return path_from_dict
        else:
            
            logger.error(f"[路径修复] 无法从字典提取有效路径，使用默认路径: {DEFAULT_PATH}")
            return DEFAULT_PATH
    elif isinstance(butler_map_param, (str, bytes, os.PathLike)):
        
        return str(butler_map_param)
    else:
        
        logger.error(f"[路径修复] 无效的路径类型 {type(butler_map_param)}，使用默认路径: {DEFAULT_PATH}")
        return DEFAULT_PATH



class ButlerManager:
    def __init__(self, storage_path, butler_map_file):
        
        self.butler_map_file = ensure_butler_map_path(butler_map_file)
        self.storage_path = Path(storage_path)
        self._init_storage()
        self.data = self._load_data()

    def _init_storage(self):
        if not self.storage_path.parent.exists():
            self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        
        if not self.storage_path.exists():
            default_butlers = [
                {
                    "id": "管家小贾",
                    "name": "管家小贾",
                    "type": "video",
                    "src": "core/client/ai-butler/video/小贾.mp4"
                },
                {
                    "id": "管家禅师",
                    "name": "管家禅师",
                    "type": "video",
                    "src": "core/client/ai-butler/video/豆包禅师.mp4"
                },
                {
                    "id": "管家小粒",
                    "name": "管家小粒",
                    "type": "video",
                    "src": "core/client/ai-butler/video/小粒.mp4"
                },
                {
                    "id": "管家星期天",
                    "name": "管家星期天",
                    "type": "video",
                    "src": "core/client/ai-butler/video/星期天.mp4"
                }
            ]
            
            init_data = {
                "butlers": default_butlers,
                "activeButlerId": default_butlers[0]["id"]
            }
            
            with open(self.storage_path, 'w', encoding='utf-8') as f:
                json.dump(init_data, f, ensure_ascii=False, indent=2)
            logger.info(f"[初始化] 创建默认4个管家数据到 {self.storage_path}")
            self._sync_butler_map(default_butlers)
        else:
            logger.debug(f"[初始化] 已存在管家数据文件: {self.storage_path}")
            existing_butlers = self._load_data()["butlers"]
            self._sync_butler_map(existing_butlers)

    def _sync_butler_map(self, butlers):
        if not self.butler_map_file:
            logger.warning("[映射同步] 未设置管家映射文件路径")
            return
            
        current_map = load_butler_map(self.butler_map_file)
        updated = False
        
        for butler in butlers:
            butler_id = butler["id"]
            if butler_id not in current_map:
                current_map[butler_id] = butler_id
                updated = True
                logger.debug(f"[映射同步] 添加管家ID到映射: {butler_id}")
        
        if updated:
            with open(self.butler_map_file, 'w', encoding='utf8') as f:
                json.dump(current_map, f, ensure_ascii=False, indent=2)
            logger.debug(f"[映射同步] 管家映射已更新: {self.butler_map_file}")

    def _load_data(self):
        with open(self.storage_path, 'r', encoding='utf-8') as f:
            return json.load(f)

    def _save_data(self):
        with open(self.storage_path, 'w', encoding='utf-8') as f:
            json.dump(self.data, f, ensure_ascii=False, indent=2)
        logger.debug(f"管家数据已保存到 {self.storage_path}")
        self._sync_butler_map(self.data["butlers"])

    def add_butler(self, name, video_preview_path, type="video", custom_id=None):
        butler_id = custom_id if custom_id else re.sub(r'[^a-zA-Z0-9]', '', name)[:8].lower()
        if not butler_id:
            butler_id = str(uuid.uuid4()).replace('-', '')[:8]
            
        new_butler = {
            "id": butler_id,
            "name": name,
            "type": type,
            "src": video_preview_path
        }
        self.data["butlers"].append(new_butler)
        
        if not self.data["activeButlerId"]:
            self.data["activeButlerId"] = butler_id
            
        self._save_data()
        return new_butler

    def get_butlers(self):
        return {
            "success": True,
            "butlers": self.data["butlers"],
            "activeButlerId": self.data["activeButlerId"]
        }

    def set_active_butler(self, butler_id):
        exists = any(b["id"] == butler_id for b in self.data["butlers"])
        if not exists:
            return {"success": False, "error": "管家ID不存在"}
        
        self.data["activeButlerId"] = butler_id
        self._save_data()
        return {"success": True}

    def delete_butler(self, butler_id):
        self.data["butlers"] = [b for b in self.data["butlers"] if b["id"] != butler_id]
        if self.data["activeButlerId"] == butler_id:
            self.data["activeButlerId"] = self.data["butlers"][0]["id"] if self.data["butlers"] else None
        self._save_data()
        return {"success": True}



def load_butler_map(butler_map_file):
    """加载管家映射，确保路径参数正确"""
    try:
        
        fixed_path = ensure_butler_map_path(butler_map_file)
        
        if os.path.exists(fixed_path):
            with open(fixed_path, 'r', encoding='utf8') as f:
                return json.load(f)
        else:
            logger.debug(f"[映射加载] 管家映射文件不存在，将创建: {fixed_path}")
            
            default_map = {
                "管家小贾": "管家小贾",
                "管家禅师": "管家禅师",
                "管家小粒": "管家小粒",
                "管家星期天": "管家星期天"
            }
            with open(fixed_path, 'w', encoding='utf8') as f:
                json.dump(default_map, f, ensure_ascii=False, indent=2)
            return default_map
    except Exception as e:
        logger.warning(f"读取管家映射失败，初始化为空字典: {e}")
        return {}

def save_butler_map(butler_map, butler_map_file):
    try:
        
        fixed_path = ensure_butler_map_path(butler_map_file)
        
        with open(fixed_path, 'w', encoding='utf8') as f:
            json.dump(butler_map, f, ensure_ascii=False, indent=2)
        logger.debug(f"管家映射保存成功: {fixed_path}")
    except Exception as e:
        logger.error(f"管家映射保存失败: {e}")

def safe_filename(filename: str) -> str:
    return re.sub(r'[^\w\-.一-龥]', '_', filename)



butler_manager = None

def init_butler_manager(storage_path, butler_map_file):
    """初始化管家管理器，确保传递正确的路径参数"""
    global butler_manager
    路径类型
    fixed_path = ensure_butler_map_path(butler_map_file)
    butler_manager = ButlerManager(storage_path, fixed_path)
    logger.debug(f"管家管理器初始化完成，存储路径: {storage_path}，映射文件: {fixed_path}")


async def handle_make_human(request, upload_folder, avatars_output_folder, frontend_video_folder, butler_map_file, project_root, nerfreals):

    fixed_map_path = ensure_butler_map_path(butler_map_file)
    logger.debug(f"[处理制作] 使用修复后的映射文件路径: {fixed_map_path}")

    logger.debug(f"[API] 收到 /api/make_human 请求，方法: {request.method}")

    if request.method != 'POST':
        logger.warning(f"[API] /api/make_human 不支持的方法: {request.method}")
        return web.json_response({'error': '方法不支持'}, status=405)
    
    content_type = request.content_type or ''
    if not content_type.startswith('multipart/form-data'):
        logger.warning(f"[API] /api/make_human 不支持的内容类型: {content_type}")
        return web.json_response({'error': '需要multipart/form-data格式'}, status=400)

    try:
        reader = await request.multipart()
        data = {}
        video_filename = None
        video_bytes = bytearray()
        replace_butler_id = None

        while True:
            part = await reader.next()
            if part is None:
                break

            if part.name == 'name':
                data['name'] = await part.text()
                logger.debug(f"[API] 解析到管家名称: {data['name']}")
            elif part.name == 'replace_butler_id':
                replace_butler_id = (await part.text()).strip()
                if replace_butler_id == '':
                    replace_butler_id = None
                logger.debug(f"[API] 解析到替换管家ID: {replace_butler_id}")
            elif part.name == 'video' and getattr(part, 'filename', None):
                video_filename = part.filename
                logger.debug(f"[API] 解析到视频文件: {video_filename}")

                while True:
                    chunk = await part.read_chunk()
                    if not chunk:
                        logger.debug("[API] 读取到空chunk，结束读取。")
                        break
                    video_bytes.extend(chunk)
                logger.debug(f"[API] 读取视频文件总大小: {len(video_bytes)} 字节")

        if not data.get('name'):
            logger.warning("[API] 缺少管家名称")
            return web.json_response({'error': '缺少管家名称'}, status=400)
        if not video_filename:
            logger.warning("[API] 缺少视频文件")
            return web.json_response({'error': '缺少视频文件'}, status=400)
        if len(video_bytes) == 0:
            logger.warning("[API] 视频文件为空")
            return web.json_response({'error': '视频文件为空或上传失败'}, status=400)
        if not replace_butler_id:
            logger.warning("[API] 替换管家ID为空，必须指定替换管家ID")
            return web.json_response({'error': '替换管家ID必须指定'}, status=400)

        name_parts = video_filename.rsplit('.', 1)
        if len(name_parts) == 2:
            base_name, file_ext = name_parts[0], name_parts[1].lower()
        else:
            base_name, file_ext = video_filename, ''

        if file_ext != 'mp4':
            logger.warning(f"[API] 不支持的视频格式: {file_ext}，仅支持MP4")
            return web.json_response({'error': '仅支持MP4格式'}, status=400)

        safe_base_name = safe_filename(base_name)
        if not safe_base_name:
            safe_base_name = f"video_{uuid.uuid4().hex[:8]}"
            logger.warning(f"[API] 文件名被过滤，使用默认名称: {safe_base_name}")

        filename = safe_base_name + '.mp4'
        video_path = upload_folder / filename
        upload_folder.mkdir(parents=True, exist_ok=True)

        with open(video_path, 'wb') as f:
            f.write(video_bytes)
        logger.debug(f"[API] 视频文件保存到: {video_path}，大小: {len(video_bytes)}字节")

        frontend_video_folder.mkdir(parents=True, exist_ok=True)
        copy_video_path = frontend_video_folder / filename
        shutil.copy2(video_path, copy_video_path)
        logger.debug(f"[API] 复制视频文件到前端目录: {copy_video_path}")

        make_now = request.query.get('make_now', 'false').lower() == 'true'
        logger.debug(f"[API] make_now 参数: {make_now}")

        butler_map = load_butler_map(fixed_map_path)
        if replace_butler_id not in butler_map:
            logger.warning(f"[API] 替换管家ID无效: {replace_butler_id}")
            return web.json_response({'error': '替换管家ID无效'}, status=400)

       
        if butler_manager:
            delete_result = butler_manager.delete_butler(replace_butler_id)
            if not delete_result["success"]:
                logger.warning(f"[API] 删除旧管家失败: {delete_result.get('error')}")
                return web.json_response({
                    'error': f'删除旧管家失败: {delete_result.get("error")}'
                }, status=400)
            logger.debug(f"[API] 已从持久化存储中删除旧管家: {replace_butler_id}")

        
        del butler_map[replace_butler_id]
        new_butler_id = data['name']
        butler_map[new_butler_id] = new_butler_id

        if make_now:
            old_output_dir = avatars_output_folder / replace_butler_id
            if old_output_dir.exists():
                shutil.rmtree(old_output_dir)
                logger.debug(f"[API] 删除旧管家目录: {old_output_dir}")
            else:
                logger.warning(f"[API] 旧管家目录不存在: {old_output_dir}")

            output_dir = avatars_output_folder / new_butler_id
            output_dir.mkdir(parents=True, exist_ok=True)
            logger.debug(f"[API] 新管家输出目录: {output_dir}")

            try:
                script_path = Path(__file__).resolve().parent / 'wav2lip' / 'genavatar.py'
                if not script_path.exists():
                    logger.error(f"[API] genavatar.py不存在: {script_path}")
                    return web.json_response({'error': 'genavatar.py不存在'}, status=500)

                cmd = [
                    'python', str(script_path),
                    '--video_path', str(video_path),
                    '--img_size', '256',
                    '--output', str(output_dir)
                ]
                result = subprocess.run(cmd, capture_output=True, text=True, check=True)
                logger.debug(f"[API] genavatar输出: {result.stdout}")

            except subprocess.CalledProcessError as e:
                logger.error(f"[API] 制作失败: {e.stderr}")
                return web.json_response({
                    'error': '制作失败',
                    'details': e.stderr
                }, status=500)

            save_butler_map(butler_map, fixed_map_path)
            logger.debug(f"[API] 更新管家映射: {butler_map}")

            video_preview_path = f"core/client/ai-butler/video/{filename}"
            new_butler = butler_manager.add_butler(
                name=data['name'],
                video_preview_path=video_preview_path,
                custom_id=new_butler_id
            )

            butler_manager.set_active_butler(new_butler_id)

            return web.json_response({
                'success': True,
                'message': '替换成功',
                'butler_id': new_butler["id"],
                'name': new_butler["name"],
                'output_dir': str(output_dir),
                'video_preview_path': new_butler["src"]
            })
        else:
            return web.json_response({
                'success': True,
                'message': '视频已上传',
                'video_path': str(video_path),
                'file_size': len(video_bytes),
                'video_preview_path': f"core/client/ai-butler/video/{filename}"
            })

    except Exception as e:
        import traceback
        logger.error(f"[API] 处理失败: {str(e)}\n{traceback.format_exc()}")
        return web.json_response({'error': f'处理失败: {str(e)}'}, status=500)



lock_avatar_switch = Lock()

def switch_avatar(new_butler_id, butler_folder_map, base_avatar_path, nerfreals, butler_manager):
    with lock_avatar_switch:
        if new_butler_id not in butler_folder_map:
            raise ValueError(f"无效的管家ID: {new_butler_id}")
            
        new_folder = butler_folder_map[new_butler_id]
        new_folder_path = os.path.join(base_avatar_path, new_folder)
        
        if not os.path.exists(new_folder_path):
            raise FileNotFoundError(f"新管家目录不存在: {new_folder_path}")
            
        logger.info(f"[Avatar Switch] 准备切换管家: {new_butler_id} -> {new_folder_path}")
        
        for sessionid, nerf in nerfreals.items():
            try:
                nerf.pause_talk()
                time.sleep(0.3)
                nerf.switch_avatar(new_folder_path)
                logger.debug(f"[Avatar Switch] Session {sessionid} 已切换资源")
            except Exception as e:
                logger.error(f"[Avatar Switch] Session {sessionid} 资源切换失败: {str(e)}", exc_info=True)
                
        if butler_manager:
            result = butler_manager.set_active_butler(new_butler_id)
            if result["success"]:
                logger.info(f"[Avatar Switch] 已更新激活管家ID: {new_butler_id}")
            else:
                logger.warning(f"[Avatar Switch] 更新激活状态失败: {result.get('error')}")
                
        current_active_butler_id = new_butler_id
        logger.info(f"[Avatar Switch] 切换完成，当前激活管家：{current_active_butler_id}")
    return current_active_butler_id

def avatar_switch_listener(redis_conn, butler_map_file, base_avatar_path, nerfreals, butler_manager):
   
    fixed_map_path = ensure_butler_map_path(butler_map_file)
    logger.debug(f"[监听线程] 使用修复后的映射文件路径: {fixed_map_path}")
        
    logger.debug("[Avatar Switch] 监听线程启动，等待切换命令...")
    while True:
        try:
            _, msg = redis_conn.brpop('avatar_switch_queue')
            if msg:
                butler_id = msg.decode('utf-8') if isinstance(msg, bytes) else str(msg)
                latest_butler_map = load_butler_map(fixed_map_path)
                switch_avatar(butler_id, latest_butler_map, base_avatar_path, nerfreals, butler_manager)
        except Exception as e:
            logger.error(f"[Avatar Switch] 监听异常: {str(e)}", exc_info=True)
            time.sleep(1)

async def api_switch_avatar(request, redis_conn, butler_map_file):
   
    fixed_map_path = ensure_butler_map_path(butler_map_file)
    logger.debug(f"[API切换] 使用修复后的映射文件路径: {fixed_map_path}")
        
    logger.debug("[API] 收到 /api/switch_avatar 请求")
    try:
        data = await request.json()
        logger.debug(f"[API] /api/switch_avatar 请求数据: {json.dumps(data)}")
    except Exception as e:
        logger.error(f"[API] /api/switch_avatar 解析JSON失败: {str(e)}")
        return web.json_response({'error': '请求体不是合法的JSON'}, status=400)

    butler_id = data.get('butler_id')
    if butler_id is None:
        logger.warning("[API] /api/switch_avatar 缺少butler_id参数")
        return web.json_response({'error': 'Missing butler_id'}, status=400)
        
    latest_butler_map = load_butler_map(fixed_map_path)
    if butler_id not in latest_butler_map:
        valid_ids = list(latest_butler_map.keys())
        logger.warning(f"[API] /api/switch_avatar 无效的butler_id: {butler_id}，有效ID: {valid_ids}")
        return web.json_response({
            'error': 'Invalid butler_id',
            'valid_ids': valid_ids
        }, status=400)

    try:
        redis_conn.lpush('avatar_switch_queue', butler_id)
        logger.debug(f"[API] /api/switch_avatar 发送切换命令: {butler_id}")
        return web.json_response({'success': True})
    except Exception as e:
        logger.error(f"[API] /api/switch_avatar 内部错误: {str(e)}", exc_info=True)
        return web.json_response({'error': f'内部错误: {e}'}, status=500)

async def get_butlers(request):
    logger.debug("[API] 收到 /api/butlers 请求")
    try:
        if not butler_manager:
            return web.json_response({
                "success": False,
                "error": "管家管理器未初始化"
            }, status=500)
        data = butler_manager.get_butlers()
        return web.json_response(data)
    except Exception as e:
        logger.error(f"[API] 获取管家列表失败: {str(e)}")
        return web.json_response({
            "success": False,
            "error": str(e)
        }, status=500)

async def set_active_butler(request):
    logger.debug("[API] 收到 /api/butlers/active 请求")
    try:
        if not butler_manager:
            return web.json_response({
                "success": False,
                "error": "管家管理器未初始化"
            }, status=500)
            
        data = await request.json()
        active_butler_id = data.get("activeButlerId")
        
        if not active_butler_id:
            return web.json_response({
                "success": False,
                "error": "缺少activeButlerId参数"
            }, status=400)
            
        result = butler_manager.set_active_butler(active_butler_id)
        return web.json_response(result)
    except Exception as e:
        logger.error(f"[API] 设置激活管家失败: {str(e)}")
        return web.json_response({
            "success": False,
            "error": str(e)
        }, status=500)
