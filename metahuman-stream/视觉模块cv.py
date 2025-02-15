from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import cv2
import numpy as np
import base64
import logging
import requests
import queue
import os
import time
from logging.handlers import RotatingFileHandler
import imghdr
import easyocr
from typing import Optional

# -----------------
# 初始化 Flask
# -----------------

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})  # 全局 CORS 配置
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'default_fallback_key')  # 环境变量加载密钥
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 请求体大小限制（16MB）

# -----------------
# 配置日志
# -----------------

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 日志记录到文件，设置最大文件大小和备份文件数量
file_handler = RotatingFileHandler('app.log', maxBytes=10*1024*1024, backupCount=5, encoding='utf-8')
file_handler.setLevel(logging.INFO)
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
file_handler.setFormatter(formatter)
logger.addHandler(file_handler)

# -----------------
# 全局变量
# -----------------

event_queue = queue.Queue()  # 使用线程安全队列
MULTIMODAL_API_URL = os.getenv('MULTIMODAL_API_URL', 'http://192.168.1.9:11434/api/generate')
FINAL_SAY_LOG_FILE = "q.log"
OCR_LOG_FILE = "question.log"  # 新增 OCR 日志文件

# 高德地图API配置
AMAP_API_KEY = os.getenv("AMAP_API_KEY", "e37c60005555511fc")  # 从环境变量中读取API密钥
GEOCODE_URL = "https://restapi.amap.com/v3/geocode/geo"
DIRECTION_URL = "https://restapi.amap.com/v3/direction/driving"
REVERSE_GEOCODE_URL = "https://restapi.amap.com/v3/geocode/regeo"  # 逆地理编码API

# 默认起点
DEFAULT_ORIGIN = "北京市朝阳区望京"

# 初始化 EasyOCR 阅读器（只加载中文和英文模型，使用 CPU）
ocr_reader = easyocr.Reader(['ch_sim', 'en'], gpu=False)  # 新增 EasyOCR 初始化

# 全局变量，用于存储用户位置
user_location = None

# -----------------
# 工具函数
# -----------------

def write_to_finalsay_log(content):
    """
    将内容写入 finalsay.log 文件（每次写入前清空文件内容）
    :param content: 要写入的内容
    """
    try:
        # 检查文件路径是否为空
        if not FINAL_SAY_LOG_FILE:
            logger.error("日志文件路径为空")
            return

        # 检查文件路径的目录是否存在，如果不存在则创建
        log_dir = os.path.dirname(FINAL_SAY_LOG_FILE)
        if log_dir:  # 如果路径包含目录
            os.makedirs(log_dir, exist_ok=True)  # 创建目录（如果不存在）

        # 使用 "w" 模式打开文件，清空文件内容并写入新内容
        with open(FINAL_SAY_LOG_FILE, "w", encoding="utf-8") as log_file:
            log_file.write(content + "\n")
        logger.info(f"内容已成功写入 {FINAL_SAY_LOG_FILE}")
    except Exception as e:
        logger.error(f"写入日志文件失败: {e}")

def write_to_ocr_log(content):
    """
    将内容写入 OCR 日志文件（每次写入前清空文件内容）
    :param content: 要写入的内容
    """
    try:
        with open(OCR_LOG_FILE, "w", encoding="utf-8") as log_file:
            log_file.write(content + "\n")
        logger.info(f"内容已成功写入 {OCR_LOG_FILE}")
    except Exception as e:
        logger.error(f"写入 OCR 日志文件失败: {e}")

def is_valid_base64(data):
    try:
        base64.b64decode(data, validate=True)
        return True
    except:
        return False

def call_model_with_retry(payload, retries=3, delay=1):
    """带重试机制的模型调用"""
    for attempt in range(retries):
        try:
            response = requests.post(MULTIMODAL_API_URL, json=payload, timeout=10)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.warning(f"模型调用失败，重试 {attempt + 1}/{retries}: {e}")
            time.sleep(delay)
    raise Exception("模型调用失败，重试次数用尽")

# -----------------
# 图像处理类
# -----------------

class ImageProcessor:
    def __init__(self):
        self.logger = logging.getLogger(__name__)

    def process_image(self, img_base64):
        """处理图像并返回结果"""
        try:
            # 准备请求数据
            payload = {
                "model": "moondream",
                "prompt": "请用中文描述这张图片。详细说明你看到的内容，包括主要对象、场景、颜色和整体氛围。",
                "images": [img_base64],
                "stream": False
            }

            self.logger.info(f"发送到模型服务的 payload: {payload}")
            result = call_model_with_retry(payload)
            recognition_text = result.get('response', '无法识别图像内容')
            return {"processed_result": recognition_text}

        except Exception as e:
            self.logger.error(f"图像处理失败: {e}")
            return {"error": str(e)}

# -----------------
# OCR 处理函数
# -----------------

def process_image_with_ocr(image_base64):
    try:
        logger.info("开始 OCR 处理")
        
        # 解码 Base64 数据为图像
        image_bytes = base64.b64decode(image_base64)
        logger.info(f"Base64 解码成功，字节流长度: {len(image_bytes)}")

        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)

        if img is None:
            logger.error("图像解码失败")
            return "图像解码失败"
        logger.info("图像解码成功")

        # 使用 EasyOCR 进行 OCR 识别
        logger.info("开始调用 EasyOCR 进行识别")
        results = ocr_reader.readtext(img)
        logger.info(f"OCR 识别完成，结果数量: {len(results)}")

        text = " ".join([result[1] for result in results])  # 提取识别结果中的文本
        logger.info(f"OCR 识别结果: {text}")
        return text.strip()
    except Exception as e:
        logger.error(f"OCR 处理失败: {e}")
        return f"OCR 处理失败: {e}"

# -----------------
# 地图模块
# -----------------

def geocode(address: str) -> Optional[str]:
    """
    地理编码：将地址转换为经纬度。
    :param address: 地址字符串
    :return: 经纬度字符串（格式：经度,纬度）
    """
    params = {
        "key": AMAP_API_KEY,
        "address": address
    }
    response = requests.get(GEOCODE_URL, params=params)
    data = response.json()
    if data["status"] == "1" and data["count"] != "0":
        location = data["geocodes"][0]["location"]
        return location
    else:
        logger.error(f"地理编码失败: {data.get('info', '未知错误')}")
        return None

def reverse_geocode(location: str) -> Optional[str]:
    """
    逆地理编码：将经纬度转换为文字地址。
    :param location: 经纬度字符串（格式：经度,纬度）
    :return: 文字地址
    """
    params = {
        "key": AMAP_API_KEY,
        "location": location
    }
    response = requests.get(REVERSE_GEOCODE_URL, params=params)
    data = response.json()
    if data["status"] == "1" and data["regeocode"]:
        address = data["regeocode"]["formatted_address"]
        return address
    else:
        logger.error(f"逆地理编码失败: {data.get('info', '未知错误')}")
        return None

def get_driving_route(origin: str, destination: str) -> Optional[dict]:
    """
    获取驾车路线规划。
    :param origin: 起点经纬度（格式：经度,纬度）
    :param destination: 终点经纬度（格式：经度,纬度）
    :return: 路线信息字典
    """
    params = {
        "key": AMAP_API_KEY,
        "origin": origin,
        "destination": destination
    }
    response = requests.get(DIRECTION_URL, params=params)
    data = response.json()
    if data["status"] == "1":
        route = data["route"]["paths"][0]
        return {
            "distance": route["distance"],  # 距离（米）
            "duration": route["duration"],  # 时间（秒）
            "steps": [step["instruction"] for step in route["steps"]]  # 导航步骤
        }
    else:
        logger.error(f"路径规划失败: {data.get('info', '未知错误')}")
        return None

def format_route_response(route: dict) -> str:
    """
    格式化路线规划结果，并用霸总式语气返回。
    :param route: 路线信息字典
    :return: 格式化后的字符串
    """
    # 计算距离（公里）并四舍五入到整数
    distance_km = round(int(route["distance"]) / 1000)
    # 计算耗时（分钟）并四舍五入到整数
    duration_min = round(int(route["duration"]) / 60)
    # 将分钟转换为小时和分钟
    duration_hours = duration_min // 60
    duration_minutes = duration_min % 60
    # steps = "\n".join(route["steps"])
    return (
        f"现在你收到了一条导航程序发来的重要信息，你应该用自信、强势且关怀的语气，强调主人的独特性和重要性，生成一段不同但始终保持霸总风格的一句话，必须包含导航的总距离和预计耗时的具体数值内容。：\n"
        f"导航路线总距离：{distance_km}公里，预计耗时：{duration_hours}小时{duration_minutes}分钟。\n"
        # f"详细路线如下：\n{steps}"
    )

# -----------------
# 路由定义
# -----------------

@app.route("/")
def index():
    """根路径，检查服务是否正常运行"""
    logger.info("根路径被访问")
    return jsonify({"message": "服务运行正常", "status": "OK"}), 200

@app.route("/routes")
def list_routes():
    """列出所有注册的路由"""
    routes = []
    for rule in app.url_map.iter_rules():
        routes.append({
            "endpoint": rule.endpoint,
            "methods": list(rule.methods),
            "url": str(rule)
        })
    logger.info("返回所有路由列表")
    return jsonify({"routes": routes}), 200

@app.route("/capture_events")
def capture_events():
    """SSE 路由，用于前端订阅捕获事件"""
    def capture_event_stream():
        while True:
            try:
                message = event_queue.get(timeout=1)
                logger.info(f"推送事件给前端: {message}")
                yield f"data: {message}\n\n"
            except queue.Empty:
                # 发送心跳消息
                yield ": ping\n\n"

    response = Response(capture_event_stream(), content_type='text/event-stream')
    response.headers["Cache-Control"] = "no-cache"
    response.headers["Connection"] = "keep-alive"
    response.headers["X-Accel-Buffering"] = "no"
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Credentials"] = "true"
    return response

@app.route("/trigger_capture", methods=["GET"])
def trigger_capture():
    """触发前端捕获图像"""
    event_queue.put("capture_image")
    logger.info("捕获事件触发")
    return jsonify({"message": "Capture triggered"}), 200

@app.route("/trigger_event", methods=["GET"])
def trigger_event():
    """触发捕获事件的别名路由"""
    logger.info("触发事件通过 /trigger_event 路由被调用")
    return trigger_capture()

@app.route('/process_image', methods=['POST'])
def process_image():
    try:
        # 获取 JSON 数据
        if request.content_type != 'application/json':
            logger.error("请求 Content-Type 必须为 application/json")
            return jsonify({"error": "请求 Content-Type 必须为 application/json"}), 400

        data = request.get_json()
        if not data or 'image' not in data or 'format' not in data:
            logger.error("未接收到图像数据或格式信息")
            return jsonify({"error": "未接收到图像数据或格式信息"}), 400

        raw_image_data = data['image']
        image_format = data['format']

        if not is_valid_base64(raw_image_data):
            logger.error("Base64 数据格式无效")
            return jsonify({"error": "Base64 数据格式无效"}), 400

        # 解码 Base64 数据为图像
        image_bytes = base64.b64decode(raw_image_data)
        logger.info(f"解码后的字节流长度: {len(image_bytes)}")

        # 将字节流转换为 NumPy 数组
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)

        if img is None:
            logger.error("图像解码失败")
            return jsonify({"error": "图像解码失败"}), 400

        # 保存图像到本地
        if image_format.lower() == 'jpeg' or image_format.lower() == 'jpg':
            file_extension = '.jpg'
        elif image_format.lower() == 'png':
            file_extension = '.png'
        else:
            return jsonify({"error": "Unsupported image format"}), 400

        save_path = f'/tmp/captured_image{file_extension}'
        cv2.imwrite(save_path, img)
        logger.info(f"图像已保存到 {save_path}")

        # 多模态识图处理逻辑
        processor = ImageProcessor()
        result = processor.process_image(raw_image_data)

        if result.get("error"):
            logger.error(f"模型处理失败: {result.get('error')}")
            return jsonify({"error": result.get("error")}), 500

        processed_result = result.get("processed_result", "无结果")

        # 定义通用的中文提示
        prompt = """
        我现在通过摄像头展示了一样东西，请仔细观察并告诉我你的第一印象和感觉。请像朋友一样分享你的直觉和感受,请结合我之前的描述或问题，用中文给出一个自然、友好的反馈。
        """.strip()

        # 将多模态识图结果写入 q.log
        log_content = f"{prompt}\n\n{processed_result}\n\n"
        write_to_finalsay_log(log_content)

        # OCR 处理逻辑
        ocr_result = process_image_with_ocr(raw_image_data)
        if isinstance(ocr_result, str) and ocr_result.startswith("OCR 处理失败"):
            logger.error(ocr_result)
            return jsonify({"error": ocr_result}), 500

        # 将 OCR 结果直接追加到 q.log
        with open(FINAL_SAY_LOG_FILE, "a", encoding="utf-8") as log_file:
            log_file.write(f"{ocr_result}\n\n")

        # 返回成功处理结果
        logger.info("图像处理成功")
        return jsonify({
            "message": "图像处理成功",
            "multimodal_result": processed_result,
            "ocr_result": ocr_result
        }), 200

    except Exception as e:
        logger.exception(f"处理图像时发生未知错误: {e}")
        return jsonify({"error": "处理图像失败", "details": str(e)}), 500
    

@app.route('/trigger-location', methods=['POST'])
def trigger_location():
    """触发前端获取地理位置信息"""
    event_queue.put("get_location")  # 将事件放入队列
    logger.info("触发获取地理位置信息事件")
    return jsonify({"message": "Location trigger sent"}), 200



@app.route("/api/location", methods=["POST"])
def handle_location():
    """
    接收前端发送的地理位置，并存储到全局变量中。
    """
    global user_location

    # 检查请求头是否为 application/json
    if not request.is_json:
        logger.error("请求头 Content-Type 不是 application/json")
        return jsonify({"error": "请求必须为 JSON 格式"}), 415

    data = request.get_json()
    logger.info(f"接收到的请求数据: {data}")  # 记录请求数据

    # 检查请求体是否为空
    if not data:
        logger.error("请求体为空")
        return jsonify({"error": "请求体为空"}), 400

    latitude = data.get("latitude")
    longitude = data.get("longitude")

    # 检查经纬度是否存在且为有效数字
    if latitude is None or longitude is None:
        logger.error("未接收到有效的经纬度")
        return jsonify({"error": "未接收到有效的经纬度"}), 400

    try:
        latitude = float(latitude)
        longitude = float(longitude)
    except (TypeError, ValueError):
        logger.error("经纬度必须为数字")
        return jsonify({"error": "经纬度必须为数字"}), 400

    # 存储用户位置
    user_location = f"{longitude},{latitude}"
    logger.info(f"接收到用户位置: {user_location}")

    # 调用高德地图 API 获取地址信息
    try:
        address = reverse_geocode(user_location)
        if address:
            result = (
                "现在你接收到的信息是用户通过导航服务获取内容。你的任务是以一种“霸道总裁”的语气告诉用户他们的当前位置，并确保信息准确无误。每次可以适当添加一些个人化的表达，确保每次的回答都不一样，但不要偏离主题,必须包含用户当前位置信息。\n"
                f"用户当前位置是：{address}。"
            )
            write_to_ocr_log(result)  # 将结果写入 question.log
        else:
            logger.error("无法获取当前位置地址")
    except Exception as e:
        logger.error(f"调用高德地图 API 时出错: {e}")
        return jsonify({"error": "获取地址信息时出错"}), 500

    # 返回成功响应
    return jsonify({"message": "位置已接收", "location": user_location}), 200

@app.route("/api/map", methods=["POST"])
def handle_map_request():
    """
    处理地图相关请求。
    """
    global user_location

    # 检查请求头是否为 application/json
    if not request.is_json:
        logger.error("请求头 Content-Type 不是 application/json")
        return jsonify({"error": "请求必须为 JSON 格式"}), 415

    data = request.get_json()
    logger.info(f"接收到的请求数据: {data}")  # 记录请求数据

    content = data.get("content")

    if not content:
        logger.error("未接收到有效的内容")
        return jsonify({"error": "未接收到有效的内容"}), 400

    # 调用地图模块处理请求
    map_response = handle_map_request(content, user_location)
    if map_response:
        return jsonify({"message": "地图请求处理成功", "response": map_response})
    else:
        logger.error("未检测到有效的地图相关关键词")
        return jsonify({"error": "未检测到有效的地图相关关键词"}), 400

def handle_map_request(content: str, user_location: Optional[str] = None) -> Optional[str]:
    """
    处理地图相关请求。
    :param content: 用户输入内容
    :param user_location: 用户当前位置（经纬度，格式：经度,纬度）
    :return: 处理结果字符串
    """
    if "现在位置在哪" in content:
        if user_location:
            # 将经纬度转换为文字地址
            address = reverse_geocode(user_location)
            if address:
                response = f"""
                任务描述：
                现在你接收到的信息是用户通过导航服务获取内容。你的任务是以一种“霸道总裁”的语气告诉用户他们的当前位置，并确保信息准确无误。

                具体要求：
                1. 使用自信、强势且关怀的语气。
                2. 强调用户的独特性和重要性。
                3. 确保提供的位置信息清晰明了。
                4. 每次可以适当添加一些个人化的表达，确保每次的回答都不一样，但不要偏离主题。

                位置信息：
                用户的当前位置是：{address}。

                输出示例：
                丫头，你现在的坐标已经锁定在 {address}。无论你身处何方，在我的世界里，你永远是最独一无二的存在。
                我不仅能找到你的确切位置，更会守护你每一个前行的脚步。记住，这里的一切都尽在我的掌握之中。
                """

                return response
            else:
                return "无法获取你的当前位置地址，请检查网络或配置。"
        else:
            return "无法获取你的当前位置，请确保已授权地理位置权限。"

    elif "导航到" in content:
        # 获取目的地
        destination_address = content.replace("导航到", "").strip()
        if not destination_address:
            return "请输入目的地。"

        # 获取起点（优先使用用户当前位置，否则使用默认起点）
        origin_location = user_location if user_location else geocode(DEFAULT_ORIGIN)
        if not origin_location:
            return "无法获取起点位置，请检查配置。"

        # 获取终点
        destination_location = geocode(destination_address)
        if not destination_location:
            return f"无法获取目的地{destination_address}的经纬度，请检查地址是否正确。"

        # 获取路线
        route = get_driving_route(origin_location, destination_location)
        if route:
            return format_route_response(route)
        else:
            return "无法规划路线，请检查起点和终点是否正确。"

    return None

# -----------------
# 主程序入口
# -----------------

if __name__ == "__main__":
    # 获取当前 app.py 文件所在目录的绝对路径
    current_dir = os.path.dirname(os.path.abspath(__file__))

    # 拼接出证书和私钥的绝对路径
    cert_path = os.getenv('CERT_PATH', os.path.join(current_dir, 'cert.pem'))
    key_path = os.getenv('KEY_PATH', os.path.join(current_dir, 'key.pem'))

    # 检查证书和私钥文件是否存在
    if not os.path.exists(cert_path):
        logger.error(f"证书文件未找到: {cert_path}")
        exit(1)

    if not os.path.exists(key_path):
        logger.error(f"私钥文件未找到: {key_path}")
        exit(1)

    # 启动 Flask 服务，使用 HTTPS
    app.run(host='0.0.0.0', port=5000, ssl_context=(cert_path, key_path), debug=True)