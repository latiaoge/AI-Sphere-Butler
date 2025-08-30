import requests
from loguru import logger
from typing import Optional
import time
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "..")))
from core.server.config.config import config  # 根据你的实际包结构调整导入路径


def summarize_with_model(text: str) -> Optional[str]:
    headers = {"Content-Type": "application/json"}
    payload = {
        "model": config.local_model_name,
        "messages": [{"role": "user", "content": text}],
        "max_tokens": int(config.local_model_max_tokens),
        "temperature": float(config.local_model_temperature),
        "stream": False
    }
    try:
        logger.info("调用本地大模型接口，准备发送请求")
        start_time = time.time()
        r = requests.post(config.local_model_api, headers=headers, json=payload, timeout=int(config.local_model_timeout))
        r.raise_for_status()
        logger.info(f"接口响应状态码：{r.status_code}，耗时：{time.time() - start_time:.2f}秒")
        resp_json = r.json()
        content = resp_json.get("choices", [{}])[0].get("message", {}).get("content")

        logger.info(f"模型返回内容长度：{len(content) if content else 0}")
        logger.info(f"模型返回具体内容：{content}")

        return content
    except requests.exceptions.Timeout:
        logger.error("调用本地大模型失败: 请求超时")
        return None
    except Exception as e:
        logger.error(f"调用本地大模型失败: {e}")
        return None


if __name__ == "__main__":
    test_text = "请帮我总结一下这段文字的内容。"
    logger.info("=== 测试本地模型 ===")
    result = summarize_with_model(test_text)
    logger.info(f"本地模型返回结果：{result}")
