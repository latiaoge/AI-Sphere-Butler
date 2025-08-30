import aiohttp
from typing import List, Dict, Optional
import logging
from datetime import datetime  # 新增导入
import re  # 新增导入

# 配置日志
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
handler.setFormatter(formatter)
logger.addHandler(handler)

DEFAULT_OLLAMA_API_URL = "http://192.168.1.92:11434/v1/chat/completions"

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

async def call_ollama(
    messages: List[Dict[str, str]],
    model: str = "qwen2.5-3bnsfwny",
    temperature: float = 0.3,  # 降低默认温度值
    top_p: Optional[float] = None,
    api_url: str = DEFAULT_OLLAMA_API_URL,
    timeout: int = 20
) -> Optional[str]:
    """
    异步调用 Ollama API 并返回生成的响应内容（带时间校验）
    """
    try:
        # 参数验证增强
        if not messages or not any(msg["role"] == "user" for msg in messages):
            logger.error("消息列表必须包含至少一条用户消息")
            return "请求参数格式错误。"
            
        # 注入时间上下文（关键修改）
        processed_messages = _inject_time_context(messages)
        
        # 构建请求数据
        request_data = {
            "model": model,
            "messages": processed_messages,
            "stream": False,
            "temperature": max(0.1, min(temperature, 1.0)),  # 温度值范围约束
            "top_p": top_p if top_p is None else max(0.1, min(top_p, 1.0))
        }
        
        logger.info(f"增强后的请求参数: {request_data}")

        # 发送异步请求
        async with aiohttp.ClientSession() as session:
            async with session.post(api_url, json=request_data, timeout=timeout) as response:
                response.raise_for_status()
                response_json = await response.json()

                # 解析响应
                logger.info(f"原始API响应: {response_json}")
                if "choices" in response_json and len(response_json["choices"]) > 0:
                    raw_content = response_json["choices"][0]["message"]["content"]
                    # 执行时间校验（关键修改）
                    validated_content = _validate_time_response(raw_content)
                    return validated_content
                else:
                    logger.error(f"异常响应格式: {response_json}")
                    return "抱歉，我暂时无法回答您的问题。"

    except aiohttp.ClientError as e:
        logger.error(f"API调用错误: {str(e)[:100]}")  # 截断长错误信息
        return "网络连接异常，请稍后再试。"
    except Exception as e:
        logger.exception("未处理的异常:")  # 记录完整堆栈跟踪
        return "系统处理请求时发生意外错误。"