from sqlalchemy import create_engine, Column, Integer, String, DateTime, Text, and_, or_
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from datetime import datetime, timedelta
import re

# ---------- 初始化 SQLAlchemy ----------
# SQLAlchemy 基础类
Base = declarative_base()

# ---------- 定义数据模型 ----------
class ChatHistory(Base):
    """
    定义 'chat_history' 表的结构
    """
    __tablename__ = 'chat_history'

    id = Column(Integer, primary_key=True, autoincrement=True)  # 主键
    user_id = Column(String(50), index=True, nullable=False)    # 用户 ID
    message = Column(Text, nullable=False)                     # 用户消息
    response = Column(Text, nullable=False)                    # AI 回复
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)  # 时间戳

class Memory(Base):
    """
    定义 'memory' 表的结构
    """
    __tablename__ = 'memory'

    id = Column(Integer, primary_key=True, autoincrement=True)  # 主键
    user_id = Column(String(50), index=True, nullable=False)    # 用户 ID
    content = Column(Text, nullable=False)                     # 记忆内容
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)  # 时间戳

# ---------- 配置数据库引擎 ----------
DATABASE_URL = 'sqlite:///chat_history.db'
engine = create_engine(DATABASE_URL, echo=False)

# 创建所有表（如果表不存在的话）
Base.metadata.create_all(engine)

# 创建数据库会话类
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

# ---------- 数据库依赖 ----------
def get_db() -> Session:
    """
    获取数据库会话，确保请求结束后关闭连接
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ---------- 辅助工具函数 ----------
def get_current_year() -> int:
    """
    获取当前年份（支持动态调整）
    """
    return datetime.now().year

def validate_and_correct_timestamp(timestamp: datetime) -> datetime:
    """
    验证并修正时间戳，确保时间属于合理范围
    """
    current_year = get_current_year()
    if timestamp.year > current_year:
        timestamp = timestamp.replace(year=current_year)
    elif timestamp.year < current_year - 100:  # 防止极端过去时间
        timestamp = timestamp.replace(year=current_year)
    return timestamp

def clean_text_input(text: str, max_length: int = 500) -> str:
    """
    清洗文本输入，去除非法字符并截断过长文本
    """
    if len(text) > max_length:
        text = text[:max_length]
    # 替换敏感字符或修正异常年份
    text = re.sub(r'\b(202[0-4])\b', str(get_current_year()), text)
    return text.strip()

# ---------- 数据库操作方法 ----------
def add_chat_history(db: Session, user_id: str, message: str, response: str, timestamp: datetime = None):
    """
    添加一条聊天记录到数据库，并进行输入校验
    """
    try:
        # 校验和修正时间戳
        if timestamp:
            timestamp = validate_and_correct_timestamp(timestamp)
        else:
            timestamp = datetime.utcnow()

        # 清洗输入文本
        message = clean_text_input(message)
        response = clean_text_input(response)

        # 创建记录对象
        chat = ChatHistory(
            user_id=user_id,
            message=message,
            response=response,
            timestamp=timestamp
        )
        db.add(chat)  # 添加记录到会话
        db.commit()   # 提交会话到数据库
        db.refresh(chat)  # 刷新记录（获取插入后的 ID）
        return chat
    except Exception as e:
        db.rollback()  # 出现错误时回滚
        raise e

def get_chat_history(db: Session, user_id: str, limit: int = 100, days_range: int = 30):
    """
    获取某用户的聊天记录，支持时间范围过滤
    :param days_range: 只查询最近 N 天的记录（默认 30 天）
    """
    time_filter = datetime.utcnow() - timedelta(days=days_range)
    return db.query(ChatHistory) \
        .filter(ChatHistory.user_id == user_id, ChatHistory.timestamp >= time_filter) \
        .order_by(ChatHistory.timestamp.desc()) \
        .limit(limit) \
        .all()

def get_chat_history_by_keywords(db: Session, user_id: str, keywords: list, limit: int = 100):
    """
    根据关键词检索某用户的聊天记录，按时间倒序排列
    """
    query = db.query(ChatHistory).filter(ChatHistory.user_id == user_id)
    
    # 动态添加关键词过滤条件
    for keyword in keywords:
        query = query.filter(ChatHistory.message.contains(keyword))
    
    return query.order_by(ChatHistory.timestamp.desc()).limit(limit).all()

def add_memory(db: Session, user_id: str, content: str, timestamp: datetime = None):
    """
    添加一条记忆到数据库，并进行输入校验
    """
    try:
        # 校验和修正时间戳
        if timestamp:
            timestamp = validate_and_correct_timestamp(timestamp)
        else:
            timestamp = datetime.utcnow()

        # 清洗输入文本
        content = clean_text_input(content)

        # 创建记录对象
        memory = Memory(
            user_id=user_id,
            content=content,
            timestamp=timestamp
        )
        db.add(memory)
        db.commit()
        db.refresh(memory)
        return memory
    except Exception as e:
        db.rollback()
        raise e

def get_memories(db: Session, user_id: str, limit: int = 100, year_filter: int = None):
    """
    获取某用户的记忆，支持年份过滤
    """
    query = db.query(Memory).filter(Memory.user_id == user_id)
    
    # 按年份过滤
    if year_filter:
        start_date = datetime(year_filter, 1, 1)
        end_date = datetime(year_filter + 1, 1, 1)
        query = query.filter(Memory.timestamp.between(start_date, end_date))
    
    return query.order_by(Memory.timestamp.desc()).limit(limit).all()

def get_memories_by_keywords(db: Session, user_id: str, keywords: list, limit: int = 100):
    """
    根据关键词检索某用户的记忆，按时间倒序排列
    :param db: 数据库会话
    :param user_id: 用户 ID
    :param keywords: 关键词列表
    :param limit: 返回的记录条数（默认为 100）
    :return: 记忆列表
    """
    query = db.query(Memory).filter(Memory.user_id == user_id)
    
    # 动态添加关键词过滤条件
    for keyword in keywords:
        query = query.filter(Memory.content.contains(keyword))
    
    return query.order_by(Memory.timestamp.desc()).limit(limit).all()


def purge_old_data(db: Session, before_date: datetime):
    """
    删除指定日期之前的所有聊天记录和记忆
    """
    try:
        # 清理聊天记录
        chat_deletes = db.query(ChatHistory).filter(ChatHistory.timestamp < before_date).delete()
        # 清理记忆记录
        memory_deletes = db.query(Memory).filter(Memory.timestamp < before_date).delete()
        db.commit()
        print(f"已清理 {chat_deletes} 条聊天记录和 {memory_deletes} 条记忆记录")
    except Exception as e:
        db.rollback()
        raise e
