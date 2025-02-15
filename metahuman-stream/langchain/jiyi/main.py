from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List
import json
import redis
import asyncio
import hashlib
from datetime import datetime, timedelta
from fuzzywuzzy import fuzz
from logger import logger
from database import get_db, add_chat_history, get_chat_history_by_keywords, get_memories_by_keywords
from memory_manager import memory_manager
from memory_manager import MemoryManager
from ollama_client import call_ollama
from vector_store import VectorStore
import tiktoken
from config import MEMORY_KEYWORDS  # 导入配置文件中的关键字列表
import time


# 应用实例
app = FastAPI()

# Redis 客户端设置
REDIS_HOST = "localhost"
REDIS_PORT = 6379
REDIS_DB = 0

try:
    redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB, decode_responses=True)
    redis_client.ping()  # 测试连接
    logger.info("Connected to Redis successfully.")
except redis.ConnectionError as e:
    logger.error(f"Failed to connect to Redis: {e}")
    redis_client = None  # 防止服务崩溃

# 实例化 VectorStore
vector_store = VectorStore(dimension=1024, save_path="./vector_store")

# 定义请求和响应模型
class Message(BaseModel):
    role: str  # 消息角色，例如 "user" 或 "assistant"
    content: str  # 消息内容

class ChatRequest(BaseModel):
    model: str  # 模型名称
    messages: List[Message]  # 消息历史记录
    temperature: float  # 温度值，控制生成的随机性
    stream: bool  # 是否开启流式传输

class ChatMessage(BaseModel):
    role: str  # 消息角色
    content: str  # 消息内容

class ChatResponseChoice(BaseModel):
    message: ChatMessage  # AI 的单条回复

class ChatResponse(BaseModel):
    choices: List[ChatResponseChoice]  # AI 回复的列表（通常为 1 条）

# 辅助函数
def validate_response(response_text: str, timestamp: datetime) -> str:
    """
    验证模型回复中的时间描述是否与时间戳一致。
    :param response_text: 模型生成的回复
    :param timestamp: 时间戳
    :return: 修正后的回复
    """
    current_year = datetime.now().year
    if "去年" in response_text and timestamp.year > current_year:
        response_text = response_text.replace("去年", f"未来的{timestamp.year}年")
    elif "昨天" in response_text:
        # 计算正确的“昨天”日期
        yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y年%m月%d日")
        response_text = response_text.replace("昨天", yesterday)
    return response_text

def build_prompt(question: str, records: list) -> str:
    """
    构建明确的提示词，结合用户问题和数据库记录。
    :param question: 用户的问题
    :param records: 从数据库中检索到的相关记录
    :return: 构建好的提示词
    """
    if not records:
        return "我没有找到相关的记录。"

    # 提取最近一条记录
    latest_record = records[0]
    time_description = validate_timestamp(latest_record.timestamp)

    # 解析用户问题中的时间关键词
    date_keyword = parse_time_keywords(question)
    if date_keyword:
        time_description = f"{date_keyword}（{time_description}）"

    # 构建提示词
    prompt = f"""
    用户的问题：{question}
    相关记录：{latest_record.message}（时间：{latest_record.timestamp}）
    请根据以上信息，准确回答用户的问题。如果涉及时间，请明确说明是{time_description}。
    """
    return prompt

async def generate_response(question: str, records: list, model: str, temperature: float = 0.1, top_p: float = 0.9) -> str:
    """
    调用 Ollama 模型生成回复（异步版）
    """
    try:
        # 构建明确的提示词
        prompt = build_prompt(question, records)

        # 调用大模型生成回复
        response_text = await call_ollama(
            messages=[{"role": "user", "content": prompt}],
            model=model,
            temperature=temperature,  # 降低随机性
            top_p=top_p  # 限制生成范围
        )

        if not isinstance(response_text, str):
            raise ValueError(f"Ollama API 返回值无效，期望是字符串，但得到：{type(response_text)}")

        # 验证并修正回复中的时间描述
        latest_record = records[0]
        response_text = validate_response(response_text, latest_record.timestamp)

        logger.info(f"Ollama 模型回复: {response_text}")
        return response_text

    except ValueError as ve:
        logger.error(f"参数校验错误: {ve}")
        return "抱歉，输入参数格式有误，请检查后重试。"

    except Exception as e:
        logger.exception(f"调用 Ollama 模型时发生错误: {e}. Question: {question}, Model: {model}")
        return "抱歉，我暂时无法处理您的请求。"

def get_cached_response(redis_client, cache_key: str) -> str:
    """
    从 Redis 获取缓存
    """
    try:
        if redis_client:
            cached_response = redis_client.get(cache_key)
            if cached_response:
                logger.info(f"Cache hit for key: {cache_key}")
                return cached_response
        else:
            logger.warning("Redis client not initialized")
    except Exception as e:
        logger.error(f"Redis error while fetching cache: {e}")
    return None

def cache_response(redis_client, cache_key: str, response_text: str, ttl: int = 3600):
    """
    保存响应到 Redis
    """
    try:
        if redis_client and response_text not in ["抱歉，Ollama API 请求超时，请稍后再试。"]:
            redis_client.setex(cache_key, ttl, response_text)
            logger.info(f"Response cached successfully for key: {cache_key}")
        else:
            logger.warning(f"Invalid response not cached for key: {cache_key}")
    except Exception as e:
        logger.error(f"Redis error while caching response: {e}")

def add_to_vector_store(user_id: str, role: str, content: str):
    """
    保存单条消息到 VectorStore
    """
    try:
        vector_store.add_to_conversation(user_id, role=role, content=content)
        logger.info(f"Added {role} message to VectorStore for user {user_id}.")
    except Exception as e:
        logger.error(f"Failed to add message to VectorStore: {e}")

# 关键字识别函数
def contains_memory_keywords(text: str) -> bool:
    """
    检查用户输入是否包含记忆关键词（模糊匹配）。
    :param text: 用户输入的文本
    :return: 是否包含记忆关键词
    """
    for keyword in MEMORY_KEYWORDS:
        if fuzz.partial_ratio(keyword, text) > 80:  # 匹配阈值设为 80
            return True
    return False

def parse_time_keywords(text: str) -> str:
    """
    解析用户输入中的时间关键词（如“昨天”），并转换为具体日期。
    :param text: 用户输入的文本
    :return: 具体日期（格式：YYYY-MM-DD）
    """
    now = datetime.now()
    if "昨天" in text:
        return (now - timedelta(days=1)).strftime("%Y-%m-%d")
    elif "今天" in text:
        return now.strftime("%Y-%m-%d")
    elif "前天" in text:
        return (now - timedelta(days=2)).strftime("%Y-%m-%d")
    else:
        return None
    
def validate_timestamp(timestamp: datetime) -> str:
    """
    验证时间戳的合理性，并返回时间描述。
    :param timestamp: 时间戳
    :return: 时间描述（如“今年”、“去年”、“未来的2025年”）
    """
    current_year = datetime.now().year
    if timestamp.year == current_year:
        return "今年"
    elif timestamp.year == current_year - 1:
        return "去年"
    elif timestamp.year > current_year:
        return f"未来的{timestamp.year}年"  # 明确提示未来时间
    else:
        return f"{timestamp.year}年"

# 生命周期事件
@app.on_event("startup")
async def startup_event():
    """
    在应用启动时执行初始化任务
    """
    logger.info("Starting up the application...")
    if redis_client:
        try:
            redis_client.ping()
            logger.info("Redis connection is healthy.")
        except redis.ConnectionError as e:
            logger.error(f"Redis connection failed during startup: {e}")

@app.on_event("shutdown")
async def shutdown_event():
    """
    在应用关闭时进行清理任务
    """
    logger.info("Shutting down the application...")
    if redis_client:
        try:
            redis_client.close()
            logger.info("Redis connection closed successfully.")
        except Exception as e:
            logger.error(f"Failed to close Redis connection: {e}")

# 健康检查
@app.get("/health")
async def health_check():
    """
    健康检查接口，用于确认服务是否正常运行
    """
    redis_status = "Connected" if redis_client and redis_client.ping() else "Disconnected"

    # 检查数据库连接
    db_status = "Connected"
    try:
        db = next(get_db())
        db.execute("SELECT 1")
    except Exception as e:
        db_status = f"Error: {e}"

    return {
        "status": "ok",
        "redis": redis_status,
        "database": db_status
    }

# 实例化 MemoryManager
memory_manager = MemoryManager()

# 核心聊天接口
MAX_HISTORY_LENGTH = 5
MODEL_MAX_TOKENS = 4096
CACHE_EXPIRE_TIME = 3600

# 清理字符串中的无效Unicode字符
def clean_string(input_string: str) -> str:
    """清理字符串中的无效Unicode字符."""
    return input_string.encode('utf-8', 'ignore').decode('utf-8')

# 示例：确保内容中没有无效字符
def sanitize_content(content: str) -> str:
    """确保内容中没有无效字符"""
    if content is None:
        return ""
    # 移除代理字符和无效字符
    return ''.join(char for char in content if ord(char) < 0xD800 or ord(char) > 0xDFFF)

@app.post("/v1/chat/completions", response_model=ChatResponse)
async def chat_completions(
    chat_request: ChatRequest,
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    """
    主业务逻辑：处理聊天请求
    """
    start_time = time.time()
    cleaned_request_json = ""  # 初始化变量以避免 UnboundLocalError

    try:
        # 清理输入内容
        cleaned_request_json = clean_string(chat_request.json())
        logger.info(f"Received chat request: {cleaned_request_json}")

        user_id = "user123"  # 从认证系统动态获取真实用户 ID
        user_input = next((msg.content for msg in chat_request.messages if msg.role == "user"), None)

        if not user_input:
            logger.error("No valid user message found in 'messages'")
            raise HTTPException(status_code=422, detail="No valid user message found in 'messages'")

        # 清理用户输入
        user_input = sanitize_content(user_input)

        # 检查用户输入是否包含记忆关键词
        if contains_memory_keywords(user_input):
            logger.info("Memory keywords detected, starting database matching...")
            date_keyword = parse_time_keywords(user_input)
            if date_keyword:
                matched_data = memory_manager.get_memory_by_time(user_id, date_keyword, date_keyword)
            else:
                matched_data = memory_manager.match_memory(user_id, user_input)
            if matched_data:
                logger.info(f"Matched data found: {matched_data}")
                return ChatResponse(choices=[ChatResponseChoice(
                    message=ChatMessage(role="assistant", content=f"我记得：{matched_data}")
                )])
            else:
                logger.info("No matching data found in database.")
        else:
            logger.info("No memory keywords detected, skipping database matching.")

        # 加载上下文历史
        conversation_history = vector_store.get_conversation_history(user_id)
        logger.info(f"Loaded conversation history for user {user_id}: {conversation_history}")

        # 动态调整历史记录长度
        truncated_history = _truncate_history(conversation_history, user_input, max_tokens=MODEL_MAX_TOKENS)
        logger.info(f"Truncated conversation history: {truncated_history}")

        # 将历史记录与当前用户输入合并
        full_messages = truncated_history + [{"role": "user", "content": user_input}]

        # 生成缓存键（基于截断后的历史记录）
        cache_key = f"chat:{user_id}:{hashlib.md5(json.dumps(full_messages, ensure_ascii=False).encode()).hexdigest()}"
        logger.info(f"Generated cache key: {cache_key}")

        # 检查缓存是否命中
        cached_response = get_cached_response(redis_client, cache_key)
        if cached_response:
            logger.info("Cache hit, returning cached response")
            return ChatResponse(choices=[ChatResponseChoice(
                message=ChatMessage(role="assistant", content=cached_response)
            )])

        # 调用 AI 模型生成回复
        response_text = await generate_response(
            question=user_input,
            records=get_chat_history_by_keywords(db, user_id=user_id, keywords=["小龙女"]),  # 根据关键词检索相关记录
            model=chat_request.model,
            temperature=chat_request.temperature
        )
        
        if not response_text:
            logger.error("Failed to generate response from model")
            raise HTTPException(status_code=500, detail="Failed to generate response")

        # 清理模型的回复内容
        response_text = sanitize_content(response_text)

        # 异步保存到 VectorStore（更新对话历史）
        background_tasks.add_task(
            _update_conversation_history,
            user_id=user_id,
            user_input=user_input,
            response_text=response_text
        )

        # 异步存储聊天历史到数据库
        background_tasks.add_task(
            _save_chat_history,
            db=db,
            user_id=user_id,
            user_input=user_input,
            response_text=response_text
        )

        # 缓存生成的响应
        cache_response(redis_client, cache_key, response_text, ttl=CACHE_EXPIRE_TIME)

        # 返回结果
        return ChatResponse(choices=[ChatResponseChoice(
            message=ChatMessage(role="assistant", content=response_text)
        )])

    except HTTPException as he:
        logger.warning(f"HTTP exception occurred: {he.detail}")
        raise he
    except Exception as e:
        logger.error(f"Unexpected error in chat_completions: {e}", exc_info=True)
        if cleaned_request_json:
            logger.debug(f"Received data that caused an error: {cleaned_request_json}")
        raise HTTPException(status_code=500, detail="Internal server error")
    finally:
        end_time = time.time()
        logger.info(f"chat_completions execution took {end_time - start_time:.2f} seconds")

def _truncate_history(history: List[dict], user_input: str, max_tokens: int) -> List[dict]:
    """
    动态调整历史记录长度，确保总输入不超过模型的上下文限制。
    """
    encoding = tiktoken.get_encoding("cl100k_base")  # GPT-3.5 和 GPT-4 使用的编码
    user_input_tokens = len(encoding.encode(user_input))
    total_tokens = user_input_tokens
    truncated_history = []
    for message in reversed(history):
        message_tokens = len(encoding.encode(message["content"]))
        if total_tokens + message_tokens > max_tokens:
            break
        truncated_history.insert(0, message)
        total_tokens += message_tokens

    logger.info(f"Truncated conversation history: {truncated_history}")
    return truncated_history

async def _update_conversation_history(user_id: str, user_input: str, response_text: str):
    """
    异步更新对话历史到 VectorStore。
    """
    try:
        vector_store.add_to_conversation(user_id, role="user", content=user_input)
        vector_store.add_to_conversation(user_id, role="assistant", content=response_text)
        logger.info(f"Updated conversation history in VectorStore for user {user_id}.")
    except Exception as e:
        logger.error(f"Failed to update conversation history: {e}")

async def _save_chat_history(db: Session, user_id: str, user_input: str, response_text: str):
    """
    异步存储聊天历史到数据库（带时间戳）。
    """
    try:
        timestamp = datetime.now()
        add_chat_history(db, user_id=user_id, message=user_input, response=response_text, timestamp=timestamp)
        logger.info("Chat history saved successfully with timestamp.")
    except Exception as e:
        logger.error(f"Failed to save chat history: {e}")