import requests
from loguru import logger

NEWS_API_URL = 'http://192.168.1.9:1888/baidu'

NEWS_KEYWORDS = ["今天有什么新闻", "今天热点", "今天热搜", "今天头条", "今天新闻", "播新闻"]

def fetch_news():
    try:
        r = requests.get(NEWS_API_URL, params={'limit': 20})
        r.raise_for_status()
        return r.json().get('data', [])
    except Exception as e:
        logger.error(f"获取新闻失败: {e}")
        return []

def prepare_news_for_broadcast(news_list):
    titles = [item.get('title', '').strip() for item in news_list if item.get('title')]
    return ". ".join(titles)
