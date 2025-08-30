from openai import OpenAI
from loguru import logger
from typing import Optional

from core.server.config.config import config  # 根据你的实际包结构调整导入路径

client = OpenAI(
    api_key=config.api_key,
    base_url=config.base_url,
)

def summarize_with_model(text: str) -> Optional[str]:
    try:
        logger.info("调用线上DeepSeek模型接口，准备发送请求")
        messages = [
            {"role": "system", "content": ""},
            {"role": "user", "content": text},
        ]
        completion = client.chat.completions.create(
            model=config.model_name,
            messages=messages,
            stream=False
        )
        content = completion.choices[0].message.content
        logger.info(f"线上模型返回内容长度：{len(content) if content else 0}")
        logger.info(f"线上模型返回内容：{content}")
        return content
    except Exception as e:
        logger.error(f"调用线上模型失败: {e}")
        return None


if __name__ == "__main__":
    test_text = "请帮我总结一下这段文字的内容。"
    logger.info("=== 测试线上模型 ===")
    result = summarize_with_model(test_text)
    logger.info(f"线上模型返回结果：{result}")
