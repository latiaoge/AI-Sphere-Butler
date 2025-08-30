from loguru import logger
from typing import Optional
import re

import llm.local_qwen  # 本地模型
import llm.online_volces_ds  # 线上模型

def remove_think_content(text: str) -> str:
    if not text:
        return text
    # 先去除 <think>...</think> 标签内容
    cleaned = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL)
    # 再去除独立的 think 单词（忽略大小写）
    cleaned = re.sub(r'\bthink\b', '', cleaned, flags=re.IGNORECASE)
    return cleaned.strip()


def summarize_with_model(text: str) -> Optional[str]:
    # 优先调用本地模型
    logger.info("优先尝试调用本地模型")
    result = llm.local_qwen.summarize_with_model(text)
    if result:
        logger.info("本地模型调用成功，返回结果")
        result = remove_think_content(result)
        return result
    else:
        logger.warning("本地模型不可用，切换调用线上模型")
        result_online = llm.online_volces_ds.summarize_with_model(text)
        if result_online:
            logger.info("线上模型调用成功，返回结果")
            result_online = remove_think_content(result_online)
            return result_online
        else:
            logger.error("线上模型调用也失败，无法获取结果")
            return None


# 下面是使用示例
if __name__ == "__main__":
    test_text = "请告诉我今天北京的天气。"
    answer = summarize_with_model(test_text)
    if answer:
        print("模型回答：", answer)
    else:
        print("未能获取模型回答，请稍后重试。")
