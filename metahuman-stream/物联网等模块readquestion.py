import re
import time
import os
import requests
import json
import paho.mqtt.client as mqtt
from bs4 import BeautifulSoup
from loguru import logger
from typing import List, Dict, Optional
from datetime import datetime, timedelta
import pytz
import jwt  # 导入 PyJWT 库
from cryptography.hazmat.primitives import serialization
from datetime import datetime, timedelta
from lunarcalendar import Converter, Solar, Lunar
import asyncio
import zhdate
from functools import lru_cache
from search.search import perform_search_and_summarize # 导入 search/search.py 中的 perform_search_and_summarize 函数
import logging
import subprocess
import base64
from tx import start_reminder
from ditu import handle_map_request, MAP_KEYWORDS
from time import sleep

# ======================= 配置区 =======================
# MQTT 配置
MQTT_BROKER = '192.168.1.99'
MQTT_PORT = 1883
MQTT_USER = '123'
MQTT_PASSWORD = '1234'
MQTT_TOPIC = 'fg'  # 发布的主题

# 本地文件路径
QUESTION_LOG_FILE = "question.log"
FINAL_SAY_LOG_FILE = "finalsay.log"
# 加载自签名证书
cert_path = 'cert.pem'

# 本地大模型 API 配置
LOCAL_MODEL_API = "http://192.168.1.9:11434/v1/chat/completions"  # 替换为新的 API 地址

# 天气 API 配置
WEATHER_API_URL = "https://devapi.qweather.com/v7/weather/now"  # 替换为你的天气 API 地址
GEO_API_URL = "https://geoapi.qweather.com/v2/city/lookup"  # 城市搜索接口
WEATHER_API_KEY = "741bc5xxxd046d45d9"  # 替换为你的和风天气 API 密钥

# JWT 配置
JWT_PRIVATE_KEY = """-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2Vw88888881xIOH8EjqA0
-----END PRIVATE KEY-----
"""  # 替换为你的私钥
JWT_KEY_ID = "KK888ggG7"  # 替换为你的密钥 ID
JWT_PROJECT_ID = "4CK898800jkkkkkkgDNJ"  # 替换为你的项目 ID



# 初始化 MQTT 客户端
mqtt_client = mqtt.Client()

# 关键词配置
KEYWORDS = {
    "打开空气净化器": "打开空气净化器",
    "关闭空气净化器": "关闭空气净化器",
    "打开客厅灯": "打开客厅灯",
    "关闭客厅灯": "关闭客厅灯",
    "打开书房灯": "打开书房灯",
    "关闭书房灯": "关闭书房灯",
    "地上脏了": "地上脏了",
    "不用扫了": "不用扫了",
    "打开百度": "cmd.exe /c start https://www.baidu.com",
    "打开此电脑": "cmd.exe /c  explorer.exe",
    "关闭当前窗口": "cmd.exe /c nircmd.exe sendkeypress alt+f4",
    "写个文本": "cmd.exe /c \"echo 大家好,我是贾维斯 > 123.txt && start notepad 123.txt\"",
    "关闭文本": "cmd.exe /c \"taskkill /IM notepad.exe /F\"",
    "增大电脑音量": "cmd.exe /c nircmd.exe changesysvolume 10000",
    "减小电脑音量": "cmd.exe /c nircmd.exe changesysvolume -10000",
    "电脑屏幕调亮": "cmd.exe /c nircmd.exe changebrightness 20",
    "电脑屏幕调暗": "cmd.exe /c nircmd.exe changebrightness -20",
    "打开电脑日历": "cmd.exe /c start outlookcal:",
    "打开系统信息": "cmd.exe /c msinfo32",
    "五毛头视频": "cmd.exe /c start wx.au3",
    "扫描电脑系统": "cmd.exe /c start sm.bat"
}

# 时间相关关键词
TIME_KEYWORDS = [
    "当前时间",
    "现在几点",
    "几点了",
    "现在时间",
    "当前时刻",
    "现在时刻"
]

# 天气相关关键词
WEATHER_KEYWORDS = [
    "当前天气",
    "现在天气",
    "天气如何",
    "天气怎么样",
    "今天的天气"
]

# 日历相关关键词
CALENDAR_KEYWORDS = [
    "今天日历",
    "日历",
    "昨天日历",
    "明天日历",
    "后天日历",
    "大后天日历",
    "今天农历是几号",
    "今天农历",
    "今天是什么日子？",
    "农历"
]

# 图像识别相关关键词
IMAGE_RECOGNITION_KEYWORDS = ["你看", "看看这个", "看一下"]

# 定义特定的中文提示
specific_prompt = """我现在通过摄像头展示了一样东西，请仔细观察并告诉我你的第一印象和感觉。请像朋友一样分享你的直觉和感受,请结合我之前的描述或问题，用中文给出一个自然、友好的反馈。""".strip()

# 假设 cleaned_content 是从某个地方获取的包含多个段落的文本
cleaned_content = """
其他内容...

现在通过摄像头展示了一样东西，请仔细观察并告诉我你的第一印象和感觉。请像朋友一样分享你的直觉和感受,请结合我之前的描述或问题，用中文给出一个自然、友好的反馈。。: The image shows a man wearing glasses and standing in front of a white wall. The man is looking up at the camera, giving an impression that he's peeking out from behind the frame.

其他内容...
"""


# 新闻相关关键词
news_keywords = ["今天有什么新闻", "今天热点", "今天热搜", "今天头条", "今天新闻", "播新闻"]

# 预定义的城市列表（可以根据需要扩展）
CITIES = {"北京", "上海", "广州", "深圳", "杭州", "成都", "重庆", "南京", "武汉", "西安"}

# 提醒相关关键词
REMINDER_KEYWORDS = [
    "提醒我",
    "定时"
]



# 全局变量：记录上次文件修改时间
last_file_mtime = None


# ======================= MQTT 相关功能 =======================
def mqtt_connect():
    """连接到 MQTT 代理"""
    try:
        mqtt_client.username_pw_set(MQTT_USER, MQTT_PASSWORD)
        mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
        mqtt_client.loop_start()
        logger.info("成功连接到 MQTT 代理")

        # 订阅主题
        result, mid = mqtt_client.subscribe(MQTT_TOPIC, qos=1)
        if result == mqtt.MQTT_ERR_SUCCESS:
            logger.info(f"订阅成功: mid={mid}")
        else:
            logger.error(f"订阅失败: result={result}")

        # mqtt_client.loop_start()  # 这句重复可去掉
        return True
    except Exception as e:
        logger.error(f"无法连接到 MQTT 代理: {e}")
        # 不退出程序，返回 False 表示失败
        return False



def publish_to_mqtt(message: str):
    """发布 MQTT 消息"""
    if mqtt_client.is_connected():
        logger.debug(f"发布 MQTT 消息到主题 {MQTT_TOPIC}: {message}")
        result = mqtt_client.publish(MQTT_TOPIC, message, qos=1)
        if result[0] != 0:
            logger.error(f"MQTT 消息发布失败: {result[0]}")
    else:
        logger.error("MQTT 客户端未连接。")

def on_message(client, userdata, msg):
    """MQTT 消息接收回调函数"""
    # 只打印消息内容
    message = msg.payload.decode()
    logger.info(message)  # 例如：欢迎回房间

    # 调用 process_received_message 处理消息
    process_received_message(message)

def process_received_message(message):
    """处理接收到的 MQTT 消息"""
    logger.info(f"处理接收到的消息: {message}")
    # 这里可以调用本地大模型生成响应
    summary = summarize_with_local_model(message)
    logger.info(f"总结结果: {summary}")
    # 将总结结果写入 FINAL_SAY_LOG_FILE
    write_to_log(FINAL_SAY_LOG_FILE, summary)

def on_subscribe(client, userdata, mid, granted_qos):
    """订阅成功回调函数"""
    logger.info(f"订阅成功: mid={mid}, granted_qos={granted_qos}")

# 注册回调函数
mqtt_client.on_message = on_message
mqtt_client.on_subscribe = on_subscribe


# ======================= 文件处理 =======================
def clean_text(content: str) -> str:
    """
    清洗文本内容，去除多余字符。
    :param content: 原始文本内容
    :return: 清洗后的文本内容
    """
    if not content:  # 如果内容为空
        return ""

    # 去除标点符号（包括中文标点）
    content = re.sub(r"[^\w\s\u4e00-\u9fff]", "", content)
    # 去除多余空格和换行符
    content = re.sub(r"\s+", " ", content).strip()
    return content



def clear_question_log():
    """
    清空日志文件。
    """
    try:
        with open(QUESTION_LOG_FILE, "w", encoding="utf-8") as file:
            file.write("")
    except Exception as e:
        logger.error(f"清空日志文件时发生错误: {e}")


def read_question_log() -> str:
    """
    读取日志文件内容并返回清洗后的文本。
    :return: 清洗后的文本内容
    """
    try:
        # 检查文件是否存在
        if not os.path.exists(QUESTION_LOG_FILE):
            logger.debug(f"日志文件不存在: {QUESTION_LOG_FILE}")
            return ""

        with open(QUESTION_LOG_FILE, "r", encoding="utf-8") as file:
            content = file.read().strip()  # 读取文件内容并去除首尾空白字符
            if not content:  # 如果内容为空
                logger.debug("日志文件为空，未读取到内容。")
                return ""
            cleaned_content = clean_text(content)  # 清洗文本
            clear_question_log()  # 清空日志文件
            return cleaned_content
    except Exception as e:
        logger.error(f"读取日志文件时发生错误: {e}")
        return ""





def write_to_log(file_path: str, content: str, mode: str = "w"):
    """
    将结果写入日志文件。
    :param file_path: 日志文件路径
    :param content: 写入内容
    :param mode: 写入模式，默认为 "w"（覆盖写入），可选 "a"（追加写入）
    """
    try:
        with open(file_path, mode, encoding="utf-8") as file:
            file.write(content + "\n")  # 写入内容并换行
    except Exception as e:
        logger.error(f"写入日志文件时发生错误: {e}")






# ======================= 获取实时时间和天气 =======================
# 缓存时区对象
BEIJING_TIMEZONE = pytz.timezone("Asia/Shanghai")

def get_current_time(fmt: str = "%Y年%m月%d日，%H点%M分") -> str:
    """获取当前北京时间并格式化
    
    Args:
        fmt (str): 时间格式，默认为 "%Y年%m月%d日，%H点%M分"
    
    Returns:
        str: 格式化后的时间字符串
    """
    try:
        # 获取当前北京时间
        beijing_time = datetime.now(BEIJING_TIMEZONE)
        return beijing_time.strftime(fmt)
    except Exception as e:
        # 如果时区转换失败，返回本地时间作为备选
        logger.error(f"获取北京时间失败: {e}")
        return datetime.now().strftime(fmt)

def load_private_key():
    """加载 PEM 格式的私钥"""
    try:
        private_key = serialization.load_pem_private_key(
            JWT_PRIVATE_KEY.encode(),  # 转换为字节
            password=None  # 如果密钥有密码，需要提供
        )
        return private_key
    except Exception as e:
        logger.error(f"加载私钥失败: {e}")
        return None


def generate_jwt() -> str:
    """生成 JWT"""
    private_key = load_private_key()
    if not private_key:
        raise ValueError("无法加载私钥，请检查私钥格式是否正确。")

    payload = {
        'iat': int(time.time()) - 30,  # 签发时间（当前时间减去 30 秒，避免时钟偏差）
        'exp': int(time.time()) + 900,  # 过期时间（当前时间加上 900 秒，即 15 分钟）
        'sub': JWT_PROJECT_ID  # 主题（替换为你的项目 ID）
    }

    headers = {
        'kid': JWT_KEY_ID  # 密钥 ID（替换为你的密钥 ID）
    }

    # 生成 JWT
    try:
        encoded_jwt = jwt.encode(payload, private_key, algorithm='EdDSA', headers=headers)
        return encoded_jwt
    except Exception as e:
        logger.error(f"生成 JWT 失败: {e}")
        return None

# 定义天气关键词
WEATHER_KEYWORDS = ["天气", "气温", "温度", "天气预报"]

def is_weather_query(text: str) -> bool:
    """
    判断输入是否为天气查询请求。
    :param text: 输入文本
    :return: 如果是天气查询请求，返回 True；否则返回 False
    """
    # 提取城市名称
    city = extract_city_name(text)
    if not city:
        return False  # 未提取到城市名称，不是天气查询请求

    # 检查是否包含天气关键词
    for keyword in WEATHER_KEYWORDS:
        if keyword in text:
            return True  # 包含天气关键词，是天气查询请求

    return False  # 不包含天气关键词，不是天气查询请求# 定义天气关键词
WEATHER_KEYWORDS = ["天气", "气温", "温度", "天气预报"]

def is_weather_query(text: str) -> bool:
    """
    判断输入是否为天气查询请求。
    :param text: 输入文本
    :return: 如果是天气查询请求，返回 True；否则返回 False
    """
    # 检查是否包含天气关键词
    for keyword in WEATHER_KEYWORDS:
        if keyword in text:
            return True  # 包含天气关键词，是天气查询请求
    return False  # 不包含天气关键词，不是天气查询请求


def extract_city_name(text: str) -> str:
    """
    从文本中提取城市名称。
    :param text: 输入文本
    :return: 提取的城市名称
    """
    # 定义常见城市名称的正则表达式
    city_pattern = r"(北京|天津|上海|重庆|广州|深圳|成都|杭州|武汉|南京|西安|长沙|苏州|郑州|青岛|大连|厦门|哈尔滨|沈阳|昆明|济南|福州|长春|石家庄|太原|合肥|南昌|南宁|海口|贵阳|兰州|银川|西宁|乌鲁木齐|呼和浩特|拉萨|香港|澳门|台北)"
    
    # 在文本中搜索匹配的城市名称
    match = re.search(city_pattern, text)
    if match:
        return match.group(1)  # 返回匹配的城市名称
    else:
        # 未匹配到城市名称，使用默认城市
        logger.debug("未匹配到有效城市名称，使用默认城市: 杭州")
        return "杭州"

def get_city_id(city_name: str) -> Optional[str]:
    """
    通过城市名称获取城市 ID。
    :param city_name: 城市名称
    :return: 城市 ID
    """
    url = f"{GEO_API_URL}?location={city_name}&key={WEATHER_API_KEY}"
    logger.info(f"正在调用城市搜索接口: {url}")
    try:
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()
        logger.debug(f"城市搜索接口响应: {data}")
        if data.get("code") == "200" and data.get("location"):
            city_id = data["location"][0]["id"]
            logger.info(f"成功获取城市 ID: {city_id}")
            return city_id
        else:
            logger.error(f"获取城市 ID 失败: {data.get('message', '未知错误')}")
            return None
    except Exception as e:
        logger.error(f"调用城市搜索接口失败: {e}")
        return None


def get_weather(city_id: str) -> Optional[Dict[str, str]]:
    """获取指定城市的实时天气"""
    url = f"{WEATHER_API_URL}?location={city_id}&key={WEATHER_API_KEY}"
    logger.info(f"正在调用天气 API: {url}")
    try:
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()
        logger.debug(f"天气 API 响应: {data}")
        if data.get("code") == "200":
            main = data['now']['text']  # 天气描述
            temperature = data['now']['temp']  # 温度
            humidity = data['now']['humidity']  # 湿度
            wind_speed = data['now']['windSpeed']  # 风速
            weather_info = {
                "main": main,
                "temperature": f"{temperature}°C",
                "humidity": f"{humidity}%",
                "wind_speed": f"{wind_speed} km/h"
            }
            logger.info(f"成功获取天气数据: {weather_info}")
            return weather_info
        else:
            logger.error(f"无法获取天气数据: {data.get('message', '未知错误')}")
            return None
    except Exception as e:
        logger.error(f"获取天气数据失败: {e}")
        return None


# ======================= 日历模块 =======================

def extract_day_keyword(keyword: str) -> str:
    """
    从输入文本中提取日期关键词（如“今天”、“昨天”、“明天”等）。
    :param keyword: 输入文本
    :return: 提取的日期关键词
    """
    day_keywords = ["今天", "昨天", "明天", "后天", "大后天"]
    for kw in day_keywords:
        if kw in keyword:
            return kw
    return None
   


def get_lunar_date(date: datetime) -> str:
    """
    获取指定日期的农历信息。
    :param date: 日期对象
    :return: 农历日期字符串
    """
    solar = Solar(date.year, date.month, date.day)  # 创建阳历日期对象
    lunar = Converter.Solar2Lunar(solar)  # 转换为农历日期对象
    return f"{lunar.year}年{lunar.month}月{lunar.day}日"

def get_calendar(keyword: str) -> str:
    """
    获取指定日期的阳历和农历信息。
    :param keyword: 日历关键词（如“今天日历”、“今天农历是几号”等）
    :return: 包含阳历和农历信息的字符串
    """
    # 提取日期关键词
    day = extract_day_keyword(keyword)
    if not day:
        return "请输入有效的日期（今天、昨天、明天、后天、大后天）。"

    # 计算目标日期
    today = datetime.now()
    if day == "今天":
        target_date = today
    elif day == "昨天":
        target_date = today - timedelta(days=1)
    elif day == "明天":
        target_date = today + timedelta(days=1)
    elif day == "后天":
        target_date = today + timedelta(days=2)
    elif day == "大后天":
        target_date = today + timedelta(days=3)

    # 获取农历日期
    lunar_date = zhdate.ZhDate.from_datetime(target_date).chinese()

    # 根据关键词返回不同格式的结果
    if "农历是几号" in keyword or "农历" in keyword:
        return f"{day}的农历日期是：{lunar_date}。"
    else:
        # 默认返回阳历和农历信息
        formatted_date = target_date.strftime("%Y年%m月%d日")
        return f"{day}的阳历日期是：{formatted_date}，农历日期是：{lunar_date}。"

# ======================= 新闻模块 =======================
def fetch_news():
    """从指定API获取新闻数据"""
    url = 'http://192.168.1.9:1888/baidu'
    params = {'limit': 20}
    response = requests.get(url, params=params)
    
    if response.status_code == 200:
        return response.json()['data']
    else:
        logger.error(f"获取新闻数据失败: {response.status_code}")
        return []

def clean_text(text):
    """清洗文本，去除多余的空格和特殊符号"""
    text = text.strip()
    text = ' '.join(text.split())
    return text

def prepare_news_for_broadcast(news_data):
    """将新闻数据整理成适合播报的文本"""
    cleaned_titles = []
    for item in news_data:
        title = item.get('title', '')
        cleaned_title = clean_text(title)
        if cleaned_title:
            cleaned_titles.append(cleaned_title)
    
    broadcast_text = ". ".join(cleaned_titles)
    return broadcast_text


def write_to_log(file_path, text):
    """将文本写入文件"""
    try:
        with open(file_path, "w", encoding="utf-8") as file:
            file.write(text)
        logger.info(f"文本已成功写入文件: {file_path}")
    except Exception as e:
        logger.error(f"写入文件时发生错误: {e}")

# ======================= 识图功能 =======================

def remove_keywords(content, keywords):
    """
    剔除内容中的关键词
    :param content: 原始内容
    :param keywords: 关键词列表
    :return: 剔除关键词后的内容
    """
    for keyword in keywords:
        content = content.replace(keyword, "")
    return content.strip()

# 等待文件生成并写入完成
def wait_for_file(file_path, timeout=15, check_content=False, extra_delay=2):
    """
    等待文件生成并写入完成
    :param file_path: 文件路径
    :param timeout: 超时时间（秒）
    :param check_content: 是否检查文件内容（确保包含 OCR 结果）
    :param extra_delay: 额外延迟时间（秒），确保文件完全写入
    """
    start_time = time.time()
    last_size = -1
    last_content = ""

    while True:
        if os.path.exists(file_path):
            current_size = os.path.getsize(file_path)
            if current_size == last_size and current_size > 0:
                if check_content:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        current_content = f.read()
                    if current_content != last_content:  # 文件内容发生变化
                        last_content = current_content
                    else:
                        # 文件内容和大小都稳定，额外等待一段时间
                        time.sleep(extra_delay)
                        break  # 文件写入完成
                else:
                    # 文件大小稳定，额外等待一段时间
                    time.sleep(extra_delay)
                    break  # 文件写入完成
            last_size = current_size

        if time.time() - start_time > timeout:
            raise TimeoutError(f"等待文件 {file_path} 生成超时")

        time.sleep(0.5)  # 避免忙等待

# 带重试的文件读取函数
def read_file_with_retry(file_path, retries=3, delay=0.5):
    """
    带重试的文件读取
    :param file_path: 文件路径
    :param retries: 重试次数
    :param delay: 每次重试的延迟（秒）
    """
    for attempt in range(retries):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                if content:  # 确保文件内容非空
                    return content
        except FileNotFoundError:
            pass

        if attempt == retries - 1:
            raise FileNotFoundError(f"文件 {file_path} 读取失败")
        time.sleep(delay)

# ======================= 地图功能 =======================
def trigger_location() -> bool:
    """
    触发后端获取位置信息。
    :return: 是否成功触发
    """
    try:
        response = requests.post(  # 将请求方法改为 POST
            "https://192.168.1.9:5000/trigger-location",  # 后端地址
            timeout=5,
            verify=False  # 禁用 SSL 证书验证
        )
        if response.status_code == 200:
            logger.info("成功触发获取位置事件")
            return True
        else:
            logger.error(f"触发获取位置失败: {response.status_code}")
            return False
    except Exception as e:
        logger.error(f"触发获取位置异常: {e}")
        return False
    


# ======================= 本地大模型功能 =======================
def summarize_with_local_model(text: str) -> Optional[str]:
    """调用本地大模型 API 进行总结"""
    headers = {"Content-Type": "application/json"}
       
    payload = {
        "model": "qwen2.5-3bnsfwny",
        "messages": [{"role": "user", "content": text}],
        "max_tokens": 512,
        "temperature": 0.25,
         "stream": False  # 确保stream参数存
    }

    try:
        logger.info("正在调用本地大模型进行回答...")
        response = requests.post(LOCAL_MODEL_API, headers=headers, json=payload)
        response.raise_for_status()
        
        # 获取并返回回复内容
        reply_content = response.json().get("choices")[0].get("message").get("content")
        if reply_content:
            return reply_content
        else:
            logger.warning("API 返回的内容为空或格式不正确。")
            return None
    except Exception as e:
        logger.error(f"本地大模型 API 调用失败: {e}")
        return None

# ======================= 主逻辑 =======================

# 定义缓存字典
processed_cache = {}

# 定义天气关键词
WEATHER_KEYWORDS = ["天气", "气温", "温度", "天气预报"]

def is_weather_query(text: str) -> bool:
    """
    判断输入是否为天气查询请求。
    :param text: 输入文本
    :return: 如果是天气查询请求，返回 True；否则返回 False
    """
    # 检查是否包含天气关键词
    for keyword in WEATHER_KEYWORDS:
        if keyword in text:
            return True  # 包含天气关键词，是天气查询请求
    return False  # 不包含天气关键词，不是天气查询请求

def ensure_mqtt_connected():
    """
    确保 MQTT 连接正常，如果断开则尝试重新连接。
    """
    if not mqtt_client.is_connected():
        logger.info("MQTT 连接已断开，尝试重新连接...")
        mqtt_connect()
        if mqtt_client.is_connected():
            logger.info("MQTT 重新连接成功。")
        else:
            logger.error("MQTT 重新连接失败。")

def process_content(content):
    """处理输入内容，识别关键字并联动 cv.py"""
    cleaned_content = content.strip().lower()  # 清理并转换为小写
    logger.info(f"处理内容: {cleaned_content}")


async def delayed_mqtt_publish(mqtt_message, delay=4):
    """延迟发送 MQTT 消息"""
    await asyncio.sleep(delay)  # 延迟 4 秒
    ensure_mqtt_connected()  # 确保 MQTT 连接正常
    publish_to_mqtt(mqtt_message)  # 发布 MQTT 消息
    logger.info(f"延迟 {delay} 秒后发送 MQTT 消息: {mqtt_message}")

async def main():
    mqtt_connect()

    try:
        while True:
            content = read_question_log()
            if not content:  # 如果日志文件为空
                logger.debug("日志文件为空，未读取到内容。")
                await asyncio.sleep(1)  # 使用异步 sleep
                continue

            # 清洗输入内容
            cleaned_content = clean_text(content)
            logger.info(f"读取到内容: {content}，清洗后: {cleaned_content}")

           # 检查是否为日历问答
            if any(keyword in cleaned_content for keyword in CALENDAR_KEYWORDS):
                logger.info("检测到日历问答请求。")
                calendar_response = get_calendar(cleaned_content)
                logger.info(f"日历问答结果: {calendar_response}")
                write_to_log(FINAL_SAY_LOG_FILE, calendar_response)
                continue
            
             # 检查是否为时间问答
            time_keywords = ["现在几点钟", "现在几点了", "现在时间", "当前时间", "现在几点了", "现在几点"]
            if any(keyword in cleaned_content for keyword in time_keywords):
                logger.info("检测到时间问答请求。")
                time_response = get_current_time()
                logger.info(f"时间问答结果: {time_response}")
                write_to_log(FINAL_SAY_LOG_FILE, time_response)
                continue


            # 检查是否为 MQTT 控制命令
            keyword_found = False
            for keyword, mqtt_message in KEYWORDS.items():
                if keyword in cleaned_content:
                    logger.info(f"匹配到关键字: {keyword}")
                    # 启动延迟任务
                    asyncio.create_task(delayed_mqtt_publish(mqtt_message))
                    # 将 MQTT 执行结果传递给大模型生成响应
                    mqtt_result = f"已执行 MQTT 操作：{mqtt_message}"
                    summary = summarize_with_local_model(mqtt_result)
                    logger.info(f"总结结果: {summary}")
                    write_to_log(FINAL_SAY_LOG_FILE, summary)
                    # 将结果存入缓存
                    processed_cache[cleaned_content] = summary
                    keyword_found = True
                    break

            # 如果是 MQTT 控制命令，跳过缓存检查
            if keyword_found:
                await asyncio.sleep(1)  # 使用异步 sleep
                continue

            # 检查缓存中是否已处理过该问题
            if cleaned_content in processed_cache:
                logger.info(f"问题已处理过，直接返回缓存结果: {processed_cache[cleaned_content]}")
                write_to_log(FINAL_SAY_LOG_FILE, processed_cache[cleaned_content])
                await asyncio.sleep(1)  # 使用异步 sleep
                continue

            # 检查是否为天气查询请求
            if is_weather_query(cleaned_content):
                # 提取城市名称
                city = extract_city_name(cleaned_content)
                if city:
                    logger.info(f"提取的城市名称: {city}")

                    # 获取城市 ID
                    city_id = get_city_id(city)
                    if city_id:
                        weather_data = get_weather(city_id)
                        if weather_data:
                            weather_text = f"{city}的当前天气：{weather_data['main']}，温度：{weather_data['temperature']}"
                            summary = summarize_with_local_model(weather_text)
                            logger.info(f"总结结果: {summary}")
                            write_to_log(FINAL_SAY_LOG_FILE, summary)
                            # 将结果存入缓存
                            processed_cache[cleaned_content] = summary
                            continue  # 跳过后续逻辑
                        else:
                            logger.info("无法获取天气数据，将问题发送到大模型进行回答。")
                            summary = summarize_with_local_model(content)
                            logger.info(f"总结结果: {summary}")
                            write_to_log(FINAL_SAY_LOG_FILE, summary)
                            # 将结果存入缓存
                            processed_cache[cleaned_content] = summary
                            continue  # 跳过后续逻辑
                    else:
                        logger.info("无法获取城市 ID，将问题发送到大模型进行回答。")
                        summary = summarize_with_local_model(content)
                        logger.info(f"总结结果: {summary}")
                        write_to_log(FINAL_SAY_LOG_FILE, summary)
                        # 将结果存入缓存
                        processed_cache[cleaned_content] = summary
                        continue  # 跳过后续逻辑
                else:
                    logger.info("未提取到城市名称，将问题发送到大模型进行回答。")
                    summary = summarize_with_local_model(content)
                    logger.info(f"总结结果: {summary}")
                    write_to_log(FINAL_SAY_LOG_FILE, summary)
                    # 将结果存入缓存
                    processed_cache[cleaned_content] = summary
                    continue  # 跳过后续逻辑
            else:
                # 非天气查询请求，继续其他逻辑处理
                
                for calendar_keyword in CALENDAR_KEYWORDS:
                    if calendar_keyword in content:
                        # 提取日期关键词（今天、明天、后天）
                        day = "今天" if "今天" in content else "明天" if "明天" in content else "后天"
                        if day:
                            calendar_text = get_calendar(day)  # 获取阳历和农历信息
                            summary = summarize_with_local_model(calendar_text)
                            logger.info(f"总结结果: {summary}")
                            write_to_log(FINAL_SAY_LOG_FILE, summary)
                        else:
                            logger.info("未找到有效的日期关键词，将问题发送到大模型进行回答。")
                            summary = summarize_with_local_model(content)  # 将问题发送到大模型
                            logger.info(f"总结结果: {summary}")
                            write_to_log(FINAL_SAY_LOG_FILE, summary)
                        keyword_found = True
                        break

                        # 检查是否为“联网搜索”关键字
            if cleaned_content.startswith("联网搜索"):
                # 提取搜索关键字
                query = cleaned_content.replace("联网搜索", "").strip()
                logger.info(f"提取的关键字: {query}")

                try:
                    # 调用 search.py 中的 perform_search_and_summarize 函数执行搜索
                    results = perform_search_and_summarize(query, engine='baidu')

                    if results:
                        # 将前50条搜索结果简化为一段文本
                        search_text = []
                        for item in results[:50]:  # 确保只取前50个结果
                            # 如果 snippet 为空，使用标题作为替代内容
                            snippet = item.get('snippet', '').strip() or item.get('title', '').strip()
                            if snippet:  # 确保内容不为空
                                search_text.append(f"{item['title']}: {snippet}")
                        
                        if search_text:  # 确保有有效内容
                            search_text = "\n".join(search_text)
                            logger.debug(f"搜索结果文本：{search_text}")

                            # 调用本地模型进行总结
                            summary = summarize_with_local_model(search_text)
                            logger.info(f"总结结果: {summary}")

                            # 将总结结果写入日志
                            write_to_log(FINAL_SAY_LOG_FILE, summary)
                            continue  # 跳过后续逻辑
                        else:
                            logger.warning("搜索结果无有效内容。")
                            write_to_log(FINAL_SAY_LOG_FILE, "搜索结果无有效内容，请尝试其他关键字。")
                            continue  # 跳过后续逻辑
                    else:
                        # 未找到搜索结果的处理
                        logger.warning("未找到搜索结果。")
                        write_to_log(FINAL_SAY_LOG_FILE, "未找到相关搜索结果，请尝试其他关键字。")
                        continue  # 跳过后续逻辑

                except Exception as e:
                    # 处理其他异常
                    logger.error(f"搜索或总结过程中发生错误: {e}")
                    write_to_log(FINAL_SAY_LOG_FILE, "搜索或总结过程中发生错误，请稍后重试.")
                    continue  # 跳过后续逻辑
            else:
                # 如果不是“联网搜索”关键字，跳过处理
                logger.info("跳过非‘联网搜索’关键字处理。")

              # 检查是否为新闻关键字
            if any(keyword in cleaned_content for keyword in news_keywords):
                logger.info(f"检测到新闻关键字: {cleaned_content}")
                
                try:
                    # 获取新闻数据
                    news_data = fetch_news()
                    
                    if news_data:
                        # 清洗并准备播报文本
                        broadcast_text = prepare_news_for_broadcast(news_data)
                        logger.debug(f"清洗后的新闻文本：{broadcast_text}")
                        
                        # 调用本地模型进行总结
                        summary = summarize_with_local_model(broadcast_text)
                        logger.info(f"新闻总结结果: {summary}")
                        
                        # 将总结结果写入 FINAL_SAY_LOG_FILE
                        write_to_log(FINAL_SAY_LOG_FILE, summary)
                        continue  # 跳过后续逻辑
                    else:
                        logger.warning("未获取到新闻数据。")
                        write_to_log(FINAL_SAY_LOG_FILE, "未获取到新闻数据，请稍后重试。")
                        continue  # 跳过后续逻辑
                
                except Exception as e:
                    logger.error(f"处理新闻请求时发生错误: {e}")
                    write_to_log(FINAL_SAY_LOG_FILE, "处理新闻请求时发生错误，请稍后重试。")
                    continue  # 跳过后续逻辑
            else:
                # 如果不是新闻关键字，跳过处理
                logger.info("跳过非新闻关键字处理。")

             # 初始化关键字检测标志
            keyword_found = False

            # 检查是否为图像识别关键字
            if any(keyword in content for keyword in IMAGE_RECOGNITION_KEYWORDS):
                keyword_found = True
                logger.info("检测到图像识别请求。")
                try:
                    # 清空 q.log 文件
                    with open('q.log', 'w', encoding='utf-8') as f:
                        f.write('')

                    # 触发前端捕捉图片
                    response = requests.get('https://192.168.1.9:5000/trigger_capture', verify=False)
                    if response.status_code == 200:
                        logger.info("成功触发捕获事件")

                        # 等待 q.log 文件生成并写入完成
                        wait_for_file('q.log', timeout=15, check_content=True, extra_delay=2)

                        # 读取 q.log 中的识别结果
                        recognition_result = read_file_with_retry('q.log')

                        # 剔除关键词
                        cleaned_content = remove_keywords(content, IMAGE_RECOGNITION_KEYWORDS)

                        # 将剔除关键词后的内容和识别结果写入 question.log
                        with open(QUESTION_LOG_FILE, 'w', encoding='utf-8') as log_file:
                            log_file.write(f"关键词：{cleaned_content}\n识别结果：{recognition_result}\n\n")

                        logger.info(f"已将关键词和识别结果写入 {QUESTION_LOG_FILE}")

                        # 调用大模型总结
                        summary_content = f"关键词：{cleaned_content}\n识别结果：{recognition_result}"
                        summary = summarize_with_local_model(summary_content)
                        logger.info(f"大模型总结结果：{summary}")

                        # 将总结结果写入 finalsay.log
                        write_to_log(FINAL_SAY_LOG_FILE, summary)

                        # 清空 question.log 文件，避免重复处理
                        with open(QUESTION_LOG_FILE, 'w', encoding='utf-8') as f:
                            f.write('')
                        continue
                    else:
                        logger.error("触发捕获事件失败")
                except Exception as e:
                    logger.error(f"触发捕获事件时发生错误: {e}")

                    continue

               # 检查是否为提醒请求
            if any(keyword in cleaned_content for keyword in REMINDER_KEYWORDS):
                logger.info("检测到提醒请求。")
                
                # 调用提醒模块
                start_reminder(cleaned_content)
                
                # 调用本地大模型生成总结
                try:
                    # 追加固定提示词
                    fixed_prompt = (
                        "你现在接受到用户设定的提示事件，你要这样回复用户，说收到，已设定好，等到时间了，我会和你说的，并询问还有什么事情需要我办的，用霸总式口气说\n"
                    )
                    full_content = f"{fixed_prompt}{cleaned_content}"
                    
                    # 调用本地大模型生成总结
                    summary = summarize_with_local_model(full_content)
                    logger.info(f"总结结果: {summary}")
                    
                    # 将总结结果写入日志文件
                    write_to_log(FINAL_SAY_LOG_FILE, summary)
                except Exception as e:
                    logger.error(f"生成总结时发生错误: {e}")
                
                continue

             # 检查是否为地图相关请求
            if any(keyword in cleaned_content for keyword in MAP_KEYWORDS):
                logger.info("检测到地图相关请求。")

                # 触发前端获取位置信息
                if not trigger_location():
                    logger.error("触发获取位置失败，使用默认位置。")
                    user_location = "116.397428,39.90923"  # 默认位置
                # else:
                #     # 等待并获取用户位置
                #     user_location = get_user_location_from_backend()
                #     if not user_location:
                #         logger.error("无法获取用户位置，使用默认位置。")
                #         user_location = "116.397428,39.90923"  # 默认位置

                # 调用地图模块处理请求
                map_response = handle_map_request(cleaned_content)
                if map_response:
                    logger.info(f"地图模块返回结果: {map_response}")
                    write_to_log(QUESTION_LOG_FILE, map_response)
                    continue
                else:
                    logger.info("未检测到有效的地图相关关键词。")

                    continue

          
            # 默认调用本地大模型回答'/
            if not keyword_found:
                logger.info(f"未找到关键字，将原始问题发送到大模型进行回答: {content}")
                summary = summarize_with_local_model(content)
                logger.info(f"总结结果: {summary}")
                write_to_log(FINAL_SAY_LOG_FILE, summary)

                time.sleep(1)

    except KeyboardInterrupt:
        logger.info("检测到手动中断（Ctrl+C），正在安全退出...")
    finally:
        if mqtt_client.is_connected():
            mqtt_client.loop_stop()  # 停止 MQTT 网络线程
            mqtt_client.disconnect()  # 断开 MQTT 连接
        logger.info("程序已安全退出.")


if __name__ == "__main__":
    asyncio.run(main())  # 启动异步事件循环
