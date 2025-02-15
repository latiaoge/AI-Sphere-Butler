import logging
from logging.handlers import RotatingFileHandler
import time

# 创建日志记录器
logger = logging.getLogger('chat_api')
logger.setLevel(logging.INFO)

# 创建一个按大小轮转的文件处理器
file_handler = RotatingFileHandler('logs/chat_api.log', maxBytes=10*1024*1024, backupCount=5)
file_handler.setLevel(logging.INFO)

# 创建格式化器
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
file_handler.setFormatter(formatter)

# 将处理器添加到记录器
logger.addHandler(file_handler)

