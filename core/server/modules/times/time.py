import pytz
from datetime import datetime
from loguru import logger

# 时间相关关键词
TIME_KEYWORDS = [
    "当前时间",
    "现在几点",
    "几点了",
    "现在时间",
    "当前时刻",
    "现在时刻"
]

# 缓存时区对象（避免频繁创建）
BEIJING_TIMEZONE = pytz.timezone("Asia/Shanghai")

def get_current_time(fmt: str = "%Y年%m月%d日，%H点%M分") -> str:
    """
    获取当前北京时间并格式化

    Args:
        fmt (str): 时间格式，默认为 "%Y年%m月%d日，%H点%M分"

    Returns:
        str: 格式化后的时间字符串
    """
    try:
        beijing_time = datetime.now(BEIJING_TIMEZONE)
        return beijing_time.strftime(fmt)
    except Exception as e:
        logger.error(f"获取北京时间失败: {e}")
        # 备用方案返回本地时间
        return datetime.now().strftime(fmt)
