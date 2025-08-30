import redis
from loguru import logger

REDIS_HOST = 'localhost'
REDIS_PORT = 6379
REDIS_DB = 0
QUESTION_KEY = "question_log"

redis_client = redis.StrictRedis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB, decode_responses=True)

def read_question() -> str:
    """
    从 Redis 队列 QUESTION_KEY 左侧弹出一条消息，如果没有返回空字符串。
    """
    try:
        content = redis_client.lpop(QUESTION_KEY)
        if content:
            logger.info(f"从 Redis 键 {QUESTION_KEY} 读取到内容，长度：{len(content)}")
            return content
        else:
            logger.info(f"Redis 键 {QUESTION_KEY} 为空或无数据")
            return ""
    except Exception as e:
        logger.error(f"读取 Redis 错误: {e}")
        return ""

def write_log(key: str, text: str):
    """
    向 Redis 指定键写入日志内容，如果内容为空则写入默认提示。
    """
    if not text:
        text = "[无内容]"
        logger.warning(f"写入日志内容为空，自动替换为默认文本")
    try:
        redis_client.set(key, text)
        logger.info(f"成功写入 Redis 键 {key}，内容长度：{len(text)}")
    except Exception as e:
        logger.error(f"写入 Redis 错误: {e}")
