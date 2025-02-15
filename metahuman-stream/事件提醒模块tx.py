import time
import threading
from datetime import datetime

def parse_reminder(text):
    """
    解析输入文本，提取提醒时间和内容。
    示例输入：提醒我1分钟之后充电
    返回：{"delay": 60, "message": "充电"}
    """
    if "提醒我" in text or "定时" in text:
        try:
            # 提取时间部分
            time_part = text.split("提醒我")[1] if "提醒我" in text else text.split("定时")[1]
            time_part = time_part.strip()

            # 解析时间
            if "分钟之后" in time_part:
                delay = int(time_part.split("分钟之后")[0].strip()) * 60
                message = time_part.split("分钟之后")[1].strip()
            elif "小时之后" in time_part:
                delay = int(time_part.split("小时之后")[0].strip()) * 3600
                message = time_part.split("小时之后")[1].strip()
            elif "分钟后" in time_part:
                delay = int(time_part.split("分钟后")[0].strip()) * 60
                message = time_part.split("分钟后")[1].strip()
            elif "小时后" in time_part:
                delay = int(time_part.split("小时后")[0].strip()) * 3600
                message = time_part.split("小时后")[1].strip()
            else:
                return None

            return {"delay": delay, "message": message}
        except Exception as e:
            print(f"解析提醒内容失败: {e}")
            return None
    return None

def remind_me(delay, message):
    """
    定时提醒函数。
    :param delay: 延迟时间（秒）
    :param message: 提醒内容
    """
    time.sleep(delay)
    
    # 固定提示词
    fixed_prompt = (
        "你现在接受到用户设定的提示事件，根据接受到的内容你用专业霸总式温馨告诉她,一定要告诉用户提醒的具体内容：\n"
        "你接受到的提醒事件内容如下：\n"
    )
    # 生成提醒内容
    reminder_content = f"时间到了，{message}\n"
    # 完整日志信息
    log_message = f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n{fixed_prompt}【{reminder_content.strip()}】\n"
    
   # 使用 "w" 模式写入 question.log（覆盖写入），并指定 UTF-8 编码
    with open("question.log", "w", encoding="utf-8") as f:
        f.write(log_message)
    print(reminder_content.strip())

def start_reminder(text):
    """
    启动提醒任务。
    :param text: 输入文本
    """
    reminder = parse_reminder(text)
    if reminder:
        delay = reminder["delay"]
        message = reminder["message"]
        print(f"已设置提醒: {delay}秒后提醒 - {message}")
        # 启动一个新线程处理提醒
        threading.Thread(target=remind_me, args=(delay, message)).start()
    else:
        print("未检测到有效的提醒内容。")

if __name__ == "__main__":
    # 从标准输入读取内容
    import sys
    if len(sys.argv) > 1:
        text = sys.argv[1]
        start_reminder(text)
    else:
        print("请提供提醒内容。")