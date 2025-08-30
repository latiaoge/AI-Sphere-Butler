import os
import time
import requests
from loguru import logger

IMAGE_RECOGNITION_KEYWORDS = ["你看", "看看这个", "看一下"]

def remove_keywords(content: str, keywords: list) -> str:
    for kw in keywords:
        content = content.replace(kw, "")
    return content.strip()

def wait_for_file(file_path: str, timeout=15, check_content=False, extra_delay=2):
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
                    if current_content == last_content:
                        time.sleep(extra_delay)
                        break
                    else:
                        last_content = current_content
                else:
                    time.sleep(extra_delay)
                    break
            last_size = current_size
        if time.time() - start_time > timeout:
            raise TimeoutError(f"等待文件 {file_path} 超时")
        time.sleep(0.5)

def read_file_with_retry(file_path: str, retries=3, delay=0.5) -> str:
    for _ in range(retries):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                if content:
                    return content
        except FileNotFoundError:
            pass
        time.sleep(delay)
    raise FileNotFoundError(f"读取文件 {file_path} 失败")
