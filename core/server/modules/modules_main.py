import asyncio
import requests
from loguru import logger

from redis_utils.redis_client import read_question, write_log
from utils.text_utils import clean_text
from iot.mqtt_client import mqtt_connect, publish, disconnect as mqtt_disconnect
from llm.summarize_llm import summarize_with_model
from weather.weather import is_weather_query, extract_city_name, get_city_id, get_weather
from mycalendar.calendar_utils import get_calendar, CALENDAR_KEYWORDS
from news.news import fetch_news, NEWS_KEYWORDS, prepare_news_for_broadcast
from reminder.reminder import REMINDER_KEYWORDS, handle_reminder
from map.map_utils import MAP_KEYWORDS, trigger_location, handle_map
from search.search_utils import perform_search_and_summarize
from times.time import TIME_KEYWORDS, get_current_time
from image_recognition.image_recognition import (
    IMAGE_RECOGNITION_KEYWORDS,
    remove_keywords,
    wait_for_file,
    read_file_with_retry,
)

FINAL_SAY_LOG_KEY = "finalsay.log"
QUESTION_LOG_FILE = "question.log"

KEYWORDS = {
    "打开空气净化器": "打开空气净化器",
    "关闭空气净化器": "关闭空气净化器",
    "打开客厅灯": "打开客厅灯",
    "关闭客厅灯": "关闭客厅灯",
    "打开书房灯": "打开书房灯",
    "关闭书房灯": "关闭书房灯",
    "地上脏了": "地上脏了",
    "不用扫了": "不用扫了",
    "打开百度": "cmd.exe /c start https://www.baidu.com",
    "打开此电脑": "cmd.exe /c  explorer.exe",
    "关闭当前窗口": "cmd.exe /c nircmd.exe sendkeypress alt+f4",
    "写个文本": "cmd.exe /c \"echo 大家好,我是贾维斯 > 123.txt && start notepad 123.txt\"",
    "关闭文本": "cmd.exe /c \"taskkill /IM notepad.exe /F\"",
    "增大电脑音量": "cmd.exe /c nircmd.exe changesysvolume 10000",
    "减小电脑音量": "cmd.exe /c nircmd.exe changesysvolume -10000",
    "电脑屏幕调亮": "cmd.exe /c nircmd.exe changebrightness 20",
    "电脑屏幕调暗": "cmd.exe /c nircmd.exe changebrightness -20",
    "打开电脑日历": "cmd.exe /c start outlookcal:",
    "打开系统信息": "cmd.exe /c msinfo32",
    "五毛头视频": "cmd.exe /c start wx.au3",
    "扫描电脑系统": "cmd.exe /c start sm.bat"
}

processed_cache = {}

def write_to_log(file_path, content, mode="w"):
    # 保持原有的文件写入逻辑，暂时只用在 QUESTION_LOG_FILE
    try:
        with open(file_path, mode, encoding="utf-8") as f:
            f.write(content + "\n")
    except Exception as e:
        logger.error(f"写日志出错: {e}")

async def delayed_publish(message, delay=4):
    await asyncio.sleep(delay)
    try:
        publish(message)
        logger.info(f"延迟{delay}s后发布消息: {message}")
    except Exception as e:
        logger.error(f"发布消息异常: {e}")

async def main():
    try:
        mqtt_connect()
        logger.info("MQTT连接成功")
    except Exception as e:
        logger.error(f"MQTT连接失败，已捕获异常并继续执行: {e}")

    try:
        while True:
            content = read_question()
            if not content:
                await asyncio.sleep(1)
                continue
            cleaned_content = clean_text(content)
            logger.info(f"读取内容：{cleaned_content}")

            # 关键字控制示例
            keyword_hit = False
            for k, v in KEYWORDS.items():
                if k in cleaned_content:
                    try:
                        await delayed_publish(v)
                        summary = summarize_with_model(f"执行命令：{v}")
                        write_log(FINAL_SAY_LOG_KEY, summary)
                        processed_cache[cleaned_content] = summary
                        keyword_hit = True
                    except Exception as e:
                        logger.error(f"处理关键字命令异常: {e}")
                    break
            if keyword_hit:
                continue

            # 缓存命中检查
            if cleaned_content in processed_cache:
                try:
                    write_log(FINAL_SAY_LOG_KEY, processed_cache[cleaned_content])
                except Exception as e:
                    logger.error(f"写缓存日志异常: {e}")
                continue

            # 时间查询
            if any(k in cleaned_content for k in TIME_KEYWORDS):
                current_time_str = get_current_time()
                prompt = f"添加任何额外解释或情感内容都要包含当前时间。时间是：{current_time_str}"
                logger.info(f"【时间查询触发】发送给模型的内容：{prompt}")

                summary = summarize_with_model(prompt)
                logger.info(f"【时间查询触发】模型返回摘要：{summary}")

                write_log(FINAL_SAY_LOG_KEY, summary)
                processed_cache[cleaned_content] = summary
                continue


            # 天气查询
            try:
                if is_weather_query(cleaned_content):
                    city = extract_city_name(cleaned_content)
                    city_id = get_city_id(city)

                    if city_id:
                        weather = get_weather(city_id)
                        if weather:
                            # 天气正常，只让模型回答天气情况，不带额外提示
                            prompt = (
                                f"请用一句话简洁地告诉用户{city}当前的天气情况。"
                                f"天气情况是：{weather['main']}，温度是{weather['temperature']}度。"
                            )
                        else:
                            # 天气数据异常，让模型回答不可用，并加自检/换话题提示
                            prompt = (
                                "天气信息不可用，请检查一下，然后再试试，"
                                "需要我给你自检一下或者换个话题聊吗？"
                            )
                    else:
                        # 城市ID获取失败，异常提示，带自检/换话题提示
                        prompt = (
                            "天气信息不可用，请检查一下，然后再试试，"
                            "需要我给你自检一下或者换个话题聊吗？"
                        )

                    summary = summarize_with_model(prompt)
                    write_log(FINAL_SAY_LOG_KEY, summary)
                    processed_cache[cleaned_content] = summary
                    continue

            except Exception as e:
                logger.error(f"天气查询异常: {e}")
                # 异常时调用模型，回答异常提示和换话题提示
                prompt = (
                    "天气信息不可用，请检查一下，然后再试试，"
                    "需要我给你自检一下或者换个话题聊吗？"
                )
                summary = summarize_with_model(prompt)
                write_log(FINAL_SAY_LOG_KEY, summary)
                processed_cache[cleaned_content] = summary
                continue


            # 日历
            try:
                if any(k in cleaned_content for k in CALENDAR_KEYWORDS):
                    calendar_text = get_calendar(cleaned_content)
                    summary = summarize_with_model(calendar_text)
                    write_log(FINAL_SAY_LOG_KEY, summary)
                    processed_cache[cleaned_content] = summary
                    continue
            except Exception as e:
                logger.error(f"日历查询异常: {e}")

            # 新闻
            try:
                if any(k in cleaned_content for k in NEWS_KEYWORDS):
                    news_data = fetch_news()
                    if news_data:
                        broadcast_text = prepare_news_for_broadcast(news_data)
                        summary = summarize_with_model(broadcast_text)
                        write_log(FINAL_SAY_LOG_KEY, summary)
                        processed_cache[cleaned_content] = summary
                        continue
            except Exception as e:
                logger.error(f"新闻抓取异常: {e}")

            # 提醒
            try:
                if any(k in cleaned_content for k in REMINDER_KEYWORDS):
                    handle_reminder(cleaned_content)
                    fixed_prompt = ("你现在接受到用户设定的提示事件，你要这样回复用户，说收到，已设定好，等到时间了，我会和你说的，并询问还有什么事情需要我办的，用霸总式口气说\n")
                    full_content = fixed_prompt + cleaned_content
                    summary = summarize_with_model(full_content)
                    write_log(FINAL_SAY_LOG_KEY, summary)
                    processed_cache[cleaned_content] = summary
                    continue
            except Exception as e:
                logger.error(f"提醒处理异常: {e}")

            # 地图
            try:
                if any(k in cleaned_content for k in MAP_KEYWORDS):
                    if not trigger_location():
                        logger.error("定位失败，使用默认位置")
                    map_resp = handle_map(cleaned_content)
                    if map_resp:
                        write_to_log(QUESTION_LOG_FILE, map_resp)
                        continue
            except Exception as e:
                logger.error(f"地图处理异常: {e}")

            
            try:
                if any(k in cleaned_content for k in IMAGE_RECOGNITION_KEYWORDS):
                    with open('q.log', 'w', encoding='utf-8') as f:
                        f.write('')
                    r = requests.get('https://192.168.1.7:5000/trigger_capture', verify=False)
                    if r.status_code == 200:
                        wait_for_file('q.log', timeout=15, check_content=True, extra_delay=2)
                        recog_result = read_file_with_retry('q.log')
                        keyword_removed = remove_keywords(cleaned_content, IMAGE_RECOGNITION_KEYWORDS)
                        with open(QUESTION_LOG_FILE, 'w', encoding='utf-8') as f:
                            f.write(f"关键词：{keyword_removed}\n识别结果：{recog_result}\n\n")
                        summary = summarize_with_model(f"关键词：{keyword_removed}\n识别结果：{recog_result}")
                        write_log(FINAL_SAY_LOG_KEY, summary)
                        
                        with open(QUESTION_LOG_FILE, 'w', encoding='utf-8') as f:
                            f.write('')
                        continue
            except Exception as e:
                logger.error(f"图像识别处理异常: {e}")

            # 本地模型回答（最后兜底）
            try:
                summary = summarize_with_model(cleaned_content)
                write_log(FINAL_SAY_LOG_KEY, summary)
            except Exception as e:
                logger.error(f"本地模型摘要异常: {e}")

    except KeyboardInterrupt:
        logger.info("程序中断，正在退出")
    except Exception as e:
        logger.error(f"主循环未知异常: {e}")
    finally:
        try:
            mqtt_disconnect()
            logger.info("MQTT安全断开")
        except Exception as e:
            logger.error(f"MQTT断开异常: {e}")

if __name__ == "__main__":
    asyncio.run(main())