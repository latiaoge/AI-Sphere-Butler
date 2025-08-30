import requests
from bs4 import BeautifulSoup
from loguru import logger
from typing import List, Dict, Optional
from functools import lru_cache


class SearchEngine:
    """
    搜索引擎类，用于执行网络搜索并获取结果摘要。
    支持Google、Bing和Baidu搜索引擎。
    """

    def __init__(self, headers: Dict[str, str], proxies: Optional[Dict[str, str]] = None):
        """
        初始化搜索引擎实例。

        :param headers: 请求头，用于模拟浏览器行为
        :param proxies: 代理设置（可选）
        """
        self.headers = headers
        self.proxies = proxies

    @lru_cache(maxsize=100)
    def search(self, query: str, engine: str = 'baidu', engine_id: int = 1) -> List[Dict[str, str]]:
        """
        执行搜索并返回结果。

        :param query: 搜索查询
        :param engine: 搜索引擎名称（google、bing或baidu）
        :param engine_id: 搜索引擎ID（仅用于Google）
        :return: 搜索结果列表，每个结果包含标题、链接和摘要
        """
        search_functions = {
            'google': self._google_search,
            'bing': self._bing_search,
            'baidu': self._baidu_search
        }

        search_function = search_functions.get(engine.lower())
        if not search_function:
            raise ValueError(f"不支持的搜索引擎：{engine}")

        results = search_function(query, engine_id)
        return self._deduplicate_results(results)

    def _deduplicate_results(self, results: List[Dict[str, str]]) -> List[Dict[str, str]]:
        """
        对搜索结果进行去重。

        :param results: 原始搜索结果
        :return: 去重后的搜索结果
        """
        seen_titles = set()
        seen_snippets = set()
        unique_results = []

        for result in results:
            title = result.get('title', '').strip()
            snippet = result.get('snippet', '').strip()

            # 如果标题或摘要已经被看到过，则跳过该结果
            if title in seen_titles or snippet in seen_snippets:
                continue
            
            seen_titles.add(title)
            seen_snippets.add(snippet)
            unique_results.append(result)

        return unique_results

    def _google_search(self, query: str, engine_id: int) -> List[Dict[str, str]]:
        """执行Google搜索"""
        if engine_id == 1:
            url = f"https://www.google.com/search?q={query}"
            soup = self._get_soup(url)
            return self._parse_google_results(soup)[:10]  # 只返回前10条结果
        elif engine_id == 2:
            url = "https://lite.duckduckgo.com/lite/"
            data = {"q": query}
            soup = self._get_soup(url, method='post', data=data)
            return self._parse_duckduckgo_results(soup)[:10]  # 只返回前10条结果
        else:
            raise ValueError(f"不支持的Google搜索引擎ID：{engine_id}")

    def _bing_search(self, query: str, _: int) -> List[Dict[str, str]]:
        """执行Bing搜索"""
        url = f"https://www.bing.com/search?q={query}"
        soup = self._get_soup(url)
        return self._parse_bing_results(soup)[:20]  # 只返回前20条结果

    def _baidu_search(self, query: str, _: int) -> List[Dict[str, str]]:
        """执行百度搜索"""
        url = f"https://www.baidu.com/s?wd={query}"
        soup = self._get_soup(url)
        return self._parse_baidu_results(soup)[:30]  # 只返回前30条结果

    def _get_soup(self, url: str, method: str = 'get', **kwargs) -> BeautifulSoup:
        """
        获取网页内容并解析为BeautifulSoup对象。

        :param url: 目标URL
        :param method: HTTP方法（get或post）
        :param kwargs: 其他请求参数
        :return: BeautifulSoup对象
        """
        try:
            if method == 'get':
                response = requests.get(url, headers=self.headers, proxies=self.proxies, timeout=30, **kwargs)
            elif method == 'post':
                response = requests.post(url, headers=self.headers, proxies=self.proxies, timeout=30, **kwargs)
            else:
                raise ValueError(f"不支持的HTTP方法：{method}")
            
            response.raise_for_status()
            return BeautifulSoup(response.content, 'html.parser')
        except requests.RequestException as e:
            logger.error(f"获取URL {url} 时发生错误：{str(e)}")
            raise

    def _parse_google_results(self, soup: BeautifulSoup) -> List[Dict[str, str]]:
        """解析Google搜索结果"""
        results = []
        for g in soup.find_all('div', class_='g'):
            anchors = g.find_all('a')
            if anchors:
                link = anchors[0]['href']
                if link.startswith('/url?q='):
                    link = link[7:]
                if not link.startswith('http'):
                    continue
                title = g.find('h3').text
                snippet = g.find('span', class_='aCOpRe').text if g.find('span', class_='aCOpRe') else ''
                results.append({'title': title, 'link': link, 'snippet': snippet})
        return results

    def _parse_duckduckgo_results(self, soup: BeautifulSoup) -> List[Dict[str, str]]:
        """解析DuckDuckGo搜索结果"""
        results = []
        for g in soup.find_all("a"):
            title = g.text
            link = g['href']
            snippet = g.find_next_sibling('p').text if g.find_next_sibling('p') else ''
            results.append({'title': title, 'link': link, 'snippet': snippet})
        return results

    def _parse_bing_results(self, soup: BeautifulSoup) -> List[Dict[str, str]]:
        """解析Bing搜索结果"""
        results = []
        for b in soup.find_all('li', class_='b_algo'):
            anchors = b.find_all('a')
            if anchors:
                link = next((a['href'] for a in anchors if 'href' in a.attrs), None)
                if link:
                    title = b.find('h2').text
                    snippet = b.find('p').text if b.find('p') else ''
                    results.append({'title': title, 'link': link, 'snippet': snippet})
        return results

    def _parse_baidu_results(self, soup: BeautifulSoup) -> List[Dict[str, str]]:
        """解析百度搜索结果"""
        results = []
        for b in soup.find_all('div', class_='result'):
            anchors = b.find_all('a')
            if anchors:
                link = anchors[0]['href']
                title = b.find('h3').text.strip() if b.find('h3') else ''
                snippet = b.find('div', class_='c-abstract').text.strip() if b.find('div', class_='c-abstract') else ''
                
                # 尝试从其他字段提取内容，以确保snippet不为空
                if not snippet:
                    snippet = b.find('div', class_='c-span-last').text.strip() if b.find('div', class_='c-span-last') else ''
                if not snippet:
                    snippet = b.find('div', class_='c-gap-top-small').text.strip() if b.find('div', class_='c-gap-top-small') else ''

                results.append({'title': title, 'link': link, 'snippet': snippet})
        return results


def perform_search_and_summarize(query: str, engine: str = 'baidu', top_n: int = 80) -> List[Dict[str, str]]:
    """
    执行搜索并返回指定数量的结果。

    :param query: 搜索关键字
    :param engine: 搜索引擎类型，默认为'baidu'
    :param top_n: 返回的搜索结果数量，默认为80
    :return: 结果列表，每个结果包含标题、链接和摘要
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0"
    }

    try:
        # 确保正确传递 headers 参数给 SearchEngine 构造函数
        search_engine = SearchEngine(headers=headers)
        results = search_engine.search(query, engine=engine, engine_id=1)
        # 对结果进行去重
        unique_results = search_engine._deduplicate_results(results)
        return unique_results[:top_n]  # 返回前top_n条结果
    except Exception as e:
        logger.error(f"搜索或总结过程中发生错误: {e}")
        return []