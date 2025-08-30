from datetime import datetime, timedelta
import zhdate

CALENDAR_KEYWORDS = [
    "今天日历", "昨天日历", "明天日历", "后天日历", "大后天日历",
    "今天农历是几号", "农历", "今天是什么日子"
]

def extract_day_keyword(text: str) -> str:
    for kw in ["今天", "昨天", "明天", "后天", "大后天"]:
        if kw in text:
            return kw
    return ""

def get_calendar(text: str) -> str:
    day = extract_day_keyword(text)
    if not day:
        return "请输入有效日期关键词"

    today = datetime.now()
    offset_map = {"昨天": -1,"今天": 0,"明天": 1,"后天": 2,"大后天":3}
    target_date = today + timedelta(days=offset_map.get(day, 0))
    lunar_str = zhdate.ZhDate.from_datetime(target_date).chinese()
    solar_str = target_date.strftime("%Y年%m月%d日")

    if "农历" in text or "农历是几号" in text:
        return f"{day}的农历日期是：{lunar_str}。"
    return f"{day}的阳历日期是：{solar_str}，农历日期是：{lunar_str}。"
