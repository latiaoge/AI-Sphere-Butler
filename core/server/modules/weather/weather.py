import requests
from loguru import logger
from typing import Optional, Dict

WEATHER_API_KEY = "741bc046d45d9"
WEATHER_API_URL = "https://devapi.qweather.com/v7/weather/now"
GEO_API_URL = "https://geoapi.qweather.com/v2/city/lookup"

WEATHER_KEYWORDS = ["天气", "气温", "温度", "天气预报"]

def is_weather_query(text: str) -> bool:
    return any(kw in text for kw in WEATHER_KEYWORDS)

def extract_city_name(text: str) -> str:
    import re
    pattern = r"(北京|天津|上海|重庆|广州|深圳|成都|杭州|武汉|南京|西安|长沙|苏州|郑州|青岛|大连|厦门|哈尔滨|沈阳|昆明|济南|福州|长春|石家庄|太原|合肥|南昌|南宁|海口|贵阳|兰州|银川|西宁|乌鲁木齐|呼和浩特|拉萨|香港|澳门|台北)"
    match = re.search(pattern, text)
    if match:
        return match.group(1)
    logger.debug("未匹配到城市，默认杭州")
    return "杭州"

def get_city_id(city_name: str) -> Optional[str]:
    url = f"{GEO_API_URL}?location={city_name}&key={WEATHER_API_KEY}"
    try:
        r = requests.get(url)
        r.raise_for_status()
        data = r.json()
        if data.get("code") == "200" and data.get("location"):
            return data["location"][0]["id"]
        logger.error(f"获取城市ID失败: {data.get('message')}")
        return None
    except Exception as e:
        logger.error(f"获取城市ID异常: {e}")
        return None

def get_weather(city_id: str) -> Optional[Dict[str, str]]:
    url = f"{WEATHER_API_URL}?location={city_id}&key={WEATHER_API_KEY}"
    try:
        r = requests.get(url)
        r.raise_for_status()
        data = r.json()
        if data.get("code") == "200":
            now = data.get("now", {})
            return {
                "main": now.get("text", ""),
                "temperature": f"{now.get('temp', '')}°C",
                "humidity": f"{now.get('humidity', '')}%",
                "wind_speed": f"{now.get('windSpeed', '')} km/h"
            }
        logger.error(f"获取天气失败: {data.get('message')}")
        return None
    except Exception as e:
        logger.error(f"获取天气异常: {e}")
        return None
