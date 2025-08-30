from collections import deque
import time
from typing import List, Optional, Dict
from sqlalchemy.orm import Session
from datetime import datetime
from database import get_db, Memory  # 假设 Memory 模型已定义
from logger import logger  # 假设 logger 已定义


class MemoryManager:
    def __init__(self, max_memories=1000, ttl=3600):
        """
        初始化 MemoryManager。
        :param max_memories: 内存中最多存储的记忆条数
        :param ttl: 记忆的生存时间（秒）
        """
        self.memories = deque(maxlen=max_memories)  # 内存缓存
        self.ttl = ttl

    # ---------------- 用户身份管理 ----------------
    def set_identity(self, user_id: str, name: str, relation: str = None):
        """
        保存用户身份信息到内存缓存和数据库。
        :param user_id: 用户 ID
        :param name: 用户名字
        :param relation: 用户与系统的关系（如朋友、客户）
        """
        content = f"用户身份：{name}（{relation or '未知关系'}）"
        self.add_memory(content=content, importance=True)  # 将身份设置为重要记忆
        logger.info(f"User identity set for {user_id}: {content}")

    def get_identity(self, user_id: str) -> Optional[Dict[str, str]]:
        """
        从内存或数据库中获取用户身份信息。
        :param user_id: 用户 ID
        :return: 用户身份信息字典（包含名字和关系）
        """
        # 从内存中查找身份信息
        for memory in self.memories:
            if memory["importance"] and "用户身份：" in memory["content"]:
                identity_parts = memory["content"].replace("用户身份：", "").strip("）").split("（")
                return {"name": identity_parts[0], "relation": identity_parts[1] if len(identity_parts) > 1 else "未知关系"}
        
        # 从数据库中查找身份信息
        try:
            db = next(get_db())
            identity = db.query(Memory).filter(
                Memory.user_id == user_id,
                Memory.content.like("用户身份%")
            ).order_by(Memory.timestamp.desc()).first()
            if identity:
                identity_parts = identity.content.replace("用户身份：", "").strip("）").split("（")
                return {"name": identity_parts[0], "relation": identity_parts[1] if len(identity_parts) > 1 else "未知关系"}
        except Exception as e:
            logger.error(f"Failed to retrieve identity for {user_id}: {e}")
            return None

    # ---------------- 内存缓存管理 ----------------
    def add_memory(self, content: str, importance: bool = False):
        """
        添加一条记忆数据到内存缓存。
        :param content: 记忆内容
        :param importance: 是否重要（重要记忆不受 TTL 限制）
        """
        self.memories.append({
            'content': content,
            'timestamp': time.time(),
            'importance': importance
        })
        logger.info(f"Memory added to cache: {content}")

    def get_relevant_memories(self, query: str) -> List[str]:
        """
        从内存缓存中获取与查询相关的记忆数据。
        :param query: 查询内容
        :return: 相关的记忆内容列表
        """
        self.clear_expired_memories()  # 清理过期记忆
        current_time = time.time()
        relevant = []
        for memory in self.memories:
            if current_time - memory['timestamp'] > self.ttl and not memory['importance']:
                continue
            if query.lower() in memory['content'].lower():
                relevant.append(memory['content'])
        logger.debug(f"Relevant memories retrieved for query '{query}': {relevant}")
        return relevant

    def clear_expired_memories(self):
        """清除过期的记忆条目"""
        current_time = time.time()
        self.memories = deque(memory for memory in self.memories if current_time - memory['timestamp'] <= self.ttl)

    # ---------------- 数据库管理 ----------------
    def add_memory_to_db(self, user_id: str, content: str, timestamp: float = None):
        """
        添加一条记忆数据到数据库。
        :param user_id: 用户 ID
        :param content: 记忆内容
        :param timestamp: 时间戳（可选）
        """
        try:
            db = next(get_db())
            memory = Memory(
                user_id=user_id,
                content=content,
                timestamp=datetime.fromtimestamp(timestamp) if timestamp else datetime.now()
            )
            db.add(memory)
            db.commit()
            db.refresh(memory)
            logger.info(f"Memory added to database for user {user_id}.")
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to add memory to database: {e}")
            raise e

    def match_memory(self, user_id: str, query: str) -> Optional[str]:
        """
        根据用户输入匹配数据库中的记忆数据。
        :param user_id: 用户 ID
        :param query: 用户输入
        :return: 匹配的记忆内容（如果找到）
        """
        try:
            db = next(get_db())
            memories = db.query(Memory).filter(
                Memory.user_id == user_id
            ).order_by(Memory.timestamp.desc()).limit(5).all()
            
            for memory in memories:
                if memory.content in query:
                    logger.info(f"Matched memory for user {user_id}: {memory.content}")
                    return memory.content
            
            return None
        except Exception as e:
            logger.error(f"Failed to match memory for {user_id}: {e}")
            return None

    def get_memory_by_time(self, user_id: str, start_time: str, end_time: str) -> Optional[str]:
        """
        根据时间范围检索记忆数据。
        :param user_id: 用户 ID
        :param start_time: 开始时间（格式：YYYY-MM-DD）
        :param end_time: 结束时间（格式：YYYY-MM-DD）
        :return: 匹配的记忆内容（如果找到）
        """
        try:
            db = next(get_db())
            start_datetime = datetime.strptime(start_time, "%Y-%m-%d")
            end_datetime = datetime.strptime(end_time, "%Y-%m-%d")

            memories = db.query(Memory).filter(
                Memory.user_id == user_id,
                Memory.timestamp >= start_datetime,
                Memory.timestamp <= end_datetime
            ).order_by(Memory.timestamp.desc()).limit(5).all()
            
            if memories:
                logger.info(f"Memory retrieved for user {user_id} between {start_time} and {end_time}: {memories[0].content}")
                return memories[0].content
            
            return None
        except Exception as e:
            logger.error(f"Failed to retrieve memory by time for {user_id}: {e}")
            return None

    def debug_memories(self):
        """
        输出当前存储的所有记忆信息（调试用）
        """
        return list(self.memories)


# 实例化 MemoryManager
memory_manager = MemoryManager()
