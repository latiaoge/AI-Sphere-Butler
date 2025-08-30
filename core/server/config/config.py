import os
import yaml

# 配置文件路径
CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.yaml")

class Config:
    def __init__(self):
        # 读取yaml配置
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        # 遍历yaml配置项，优先使用环境变量覆盖，环境变量名为大写键名
        for key, value in data.items():
            env_value = os.getenv(key.upper())
            setattr(self, key, env_value if env_value is not None else value)

# 生成单例配置对象
config = Config()
