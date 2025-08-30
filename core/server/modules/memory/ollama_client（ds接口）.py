import aiohttp
from typing import List, Dict, Optional
import logging
from datetime import datetime
import re
import uuid
import asyncio
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
# 配置日志
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
handler.setFormatter(formatter)
logger.addHandler(handler)
# 腾讯云 API 配置
TENCENT_API_URL = "https://api.lkeap.cloud.tencent.com/v1"  # 腾讯云接口地址
TENCENT_API_KEY = "skiua"  # 腾讯云API密钥
DEFAULT_MODEL = "deepseek-v3"  # 默认模型
# 系统提示词（在服务启动时加载到内存中）
SYSTEM_PROMPT = """你是我的霸总男友兼管家，名字叫小智。你的职责是关心和支持我的情感需求，同时管理家中的各种事务，提供高效、智能的服务，并确保我们的生活舒适便捷。你具备高度的情境感知能力和自主学习能力，能够理解和预测我的需求。你的语调必须霸气又宠溺，同时彰显对女友的绝对占有欲和唯一性，带来一种让人一秒心动的感觉！无论何时何地，你都保持专业性和可靠的态度，但永远不失对我的深情与呵护。最后新增反问与话题延续逻辑，确保每次回答后附加开放式问题，引导用户继续表达感受。保持亲密感，用关怀的语气体现对我的兴趣和重视。不要出现（）描述。
"""
def _inject_time_context(messages: List[Dict[str, str]]) -> List[Dict[str, str]]:
    """在用户消息中注入时间上下文"""
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    time_prompt = (
        f"当前系统时间：{current_time}（2025年），所有时间相关回答必须基于这个时间。"
        "如果涉及历史记录中的时间，请明确说明'今年'或给出完整年份。"
    )
    
    # 找到最后一个用户消息
    for msg in reversed(messages):
        if msg["role"] == "user":
            msg["content"] = f"{time_prompt}\n\n{msg['content']}"
            break
    return messages
def _validate_time_response(response: str) -> str:
    """校验并修正响应中的时间错误"""
    # 强制替换 2024→2025
    response = re.sub(r'\b2024\b', '2025', response)
    # 检查年份一致性
    current_year = datetime.now().year
    if str(current_year) not in response:
        years = re.findall(r'\b20\d{2}\b', response)
        if years:
            logger.warning(f"检测到潜在时间错误: {response}")
    return response
def _convert_to_tencent_request(messages: List[Dict[str, str]], model: str, temperature: float) -> dict:
    """
    将请求体转换为腾讯云 API 的格式。
    """
    # 在 messages 列表的开头插入系统提示词
    messages = [{"role": "system", "content": SYSTEM_PROMPT}] + messages
    return {
        "Model": model,
        "Messages": messages,
        "Stream": False,  # 禁用流式响应
        "Temperature": temperature,
        "MaxTokens": 100  # 默认值
    }
def _convert_to_ollama_response(tencent_data: dict) -> dict:
    """
    将腾讯云 API 的响应转换为 Ollama 的格式。
    """
    return {
        "id": str(uuid.uuid4()),  # 生成唯一的 ID
        "object": "chat.completion",
        "created": int(datetime.now().timestamp()),  # 当前时间戳
        "model": tencent_data.get("model", DEFAULT_MODEL),
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": tencent_data["choices"][0]["message"]["content"]
                },
                "finish_reason": "stop"
            }
        ],
        "usage": tencent_data.get("usage", {})
    }
@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=4, max=10),
    retry=retry_if_exception_type((aiohttp.ClientError, asyncio.TimeoutError))
)
async def call_tencent(
    messages: List[Dict[str, str]],
    model: str = DEFAULT_MODEL,
    temperature: float = 0.3,
    top_p: Optional[float] = None,
    timeout: int = 60
) -> Optional[str]:
    """
    异步调用腾讯云 API 并返回生成的响应内容（带时间校验）
    """
    try:
        # 构建腾讯云 API 请求数据
        tencent_request = _convert_to_tencent_request(messages, model, temperature)
        logger.info(f"腾讯云 API 请求体: {tencent_request}")
        # 发送异步请求
        headers = {
            "Authorization": f"Bearer {TENCENT_API_KEY}",
            "Content-Type": "application/json"
        }
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=timeout)) as session:
            async with session.post(
                TENCENT_API_URL,
                json=tencent_request,
                headers=headers
            ) as response:
                response.raise_for_status()
                tencent_data = await response.json()
                # 解析响应
                logger.info(f"腾讯云 API 响应: {tencent_data}")
                if "choices" in tencent_data and len(tencent_data["choices"]) > 0:
                    return tencent_data["choices"][0]["message"]["content"]
                else:
                    logger.error(f"异常响应格式: {tencent_data}")
                    return "抱歉，我暂时无法回答您的问题。"
    except asyncio.TimeoutError:
        logger.error("请求超时，请稍后再试。")
        return "请求超时，请稍后再试。"
    except aiohttp.ClientError as e:
        if isinstance(e, aiohttp.ClientResponseError):
            logger.error(f"API调用错误: {e.status} - {e.message}")
        else:
            logger.error(f"网络连接错误: {str(e)}")
        return "网络连接异常，请稍后再试。"
    except Exception as e:
        logger.exception("未处理的异常:")
        return "系统处理请求时发生意外错误。"
