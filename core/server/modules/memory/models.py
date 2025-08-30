# E:\work\metahuman-stream\langchain\jiyi\models.py
from pydantic import BaseModel
from typing import List, Optional

# ---------- 定义消息模型 ----------
class ChatMessage(BaseModel):
    """
    聊天消息模型，用于表示单条消息记录
    """
    role: str  # 消息的角色，例如 "user" 或 "assistant"
    content: str  # 消息内容

class ChatRequest(BaseModel):
    """
    聊天请求模型，包含用户与 AI 的消息历史
    """
    messages: List[ChatMessage]  # 消息历史记录（用户和 AI 的消息）

class ChatResponseChoice(BaseModel):
    """
    单条 AI 回复选项的模型
    """
    message: ChatMessage  # AI 回复的具体内容

class ChatResponse(BaseModel):
    """
    聊天回复模型，用于表示 AI 回复的多个选项
    """
    choices: List[ChatResponseChoice]  # AI 的多个回复选项（通常为 1 个）
