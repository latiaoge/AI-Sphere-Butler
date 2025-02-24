import requests
from bs4 import BeautifulSoup
import traceback
import logging
from utils.config import Config
from utils.common import Common
from utils.logger import Configure_logger


def google(query, id=1):
    if id == 1:
        return google_1(query)
    elif id == 2:
        return google_2(query)

def google_1(query):
    query = query # 在此处替换您要搜索的关键词
    url = f"https://www.google.com/search?q={query}"
    response = requests.get(url, headers=headers, proxies=proxies)
    soup = BeautifulSoup(response.content, 'html.parser')
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
            item = {'title': title, 'link': link}
            results.append(item)
    for r in results:
        logging.debug(r['link'])
    return results


def google_2(query):
    results = []
    url = "https://lite.duckduckgo.com/lite/"

    data={
        "q":query

    }
    response = requests.post(url, data=data, headers=headers, proxies=proxies)
    response.encoding = "utf-8"
    soup = BeautifulSoup(response.text, 'html.parser')
    # soup=soup.find("tbody")
    for g in soup.find_all("a"):
        item = {'title': g, 'link': g['href']}
        logging.debug(g['href'])
        results.append(item)
    return results

# 暂不可用
def bing_1(query):
    query = query  # 替换为您的搜索关键词
    url = f"https://www.bing.com/search?q={query}"
    response = requests.get(url, headers=headers, proxies=proxies)
    soup = BeautifulSoup(response.content, 'html.parser')
    results = []
    for b in soup.find_all('li', class_='b_algo'):
        anchors = b.find_all('a')
        if anchors:
            index = -1
            for anchor in anchors:
                if 'href' not in anchor:
                    index += 1
                else:
                    if index == -1:
                        index = 0
                    break

            link = anchors[index]['href']
            title = b.find('h2').text
            item = {'title': title, 'link': link}
            results.append(item)
    for r in results:
        logging.debug(r['link'])
    return results

def baidu_1(query):
    query = query  # 替换为您的搜索关键词
    url = f"https://www.baidu.com/s?wd={query}"
    response = requests.get(url, headers=headers, proxies=proxies)
    soup = BeautifulSoup(response.content, 'html.parser')
    results = []
    for b in soup.find_all('div', class_='result'):
        anchors = b.find_all('a')
        if anchors:
            link = anchors[0]['href']
            title = b.find('h3').text
            # 处理百度的链接跳转问题，提取真实链接
            if link.startswith('/link?url='):
                link = "https://www.baidu.com" + link
            item = {'title': title, 'link': link}
            results.append(item)
    for r in results:
        logging.debug(r['link'])
    return results

def search(query, engine='google', id=1):
    if engine == 'google':
        return google(query, id)
    elif engine == 'bing':
        return bing_1(query)
    elif engine == 'baidu':
        return baidu_1(query)


def get_url2(url) -> str:
    """Scrape text from a webpage

    Args:
        url (str): The URL to scrape text from

    Returns:
        str: The scraped text
    """

    try:
        response = requests.get(url, headers=headers, proxies=proxies, timeout=30)
        if response.encoding == "ISO-8859-1": response.encoding = response.apparent_encoding
    except Exception as e:
        logging.debug(traceback.format_exc())
        return "无法连接到该网页"
    soup = BeautifulSoup(response.text, "html.parser")
    for script in soup(["script", "style"]):
        script.extract()
    text = soup.get_text()
    lines = (line.strip() for line in text.splitlines())
    chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
    text = "\n".join(chunk for chunk in chunks if chunk)
    return text


def get_url(url):
    try:
        response = requests.get(url, headers=headers, proxies=proxies, timeout=30)
        response.raise_for_status()
        html = response.text
        soup = BeautifulSoup(html, 'html.parser')
        paragraphs = soup.find_all(['p', 'span'])
        paragraphs_text = [p.get_text() for p in paragraphs]
        return paragraphs_text
    except requests.exceptions.RequestException as e:
        logging.warning("无法访问该URL: %s, error: %s", url, str(e))
        return None
    except Exception as e:
        logging.error(traceback.format_exc())
        return None


def get_summary(item):
    logging.debug("正在获取链接内容：%s", item["link"])
    link_content = get_url(item["link"])
    if not link_content:
        logging.warning("无法获取链接内容：%s", item["link"])
        return None
    logging.debug("link_content: %s", link_content)
    # 获取链接内容字符数量
    link_content_str = ' '.join(link_content)
    content_length = len(link_content_str)
    logging.debug("content_length: %s", content_length)

    # 如果内容少于50个字符，则pass
    if content_length < 50:
        logging.warning("链接内容低于50个字符：%s", item["link"])
        return None
    # 如果内容大于15000个字符，则截取中间部分
    elif content_length > 8000:
        logging.warning("链接内容高于15000个字符，进行裁断：%s", item["link"])
        start = (content_length - 8000) // 2
        end = start + 8000
        link_content = link_content[start:end]

    resp_content = ""
    for content in link_content:
        resp_content += content.rstrip()

    logging.debug("正在提取摘要：%s", resp_content)
    return resp_content


def get_summary_list(data_list, count=3):
    num = 0
    summary_list = []

    logging.info(f"data_list={data_list}")

    for data in data_list:
        summary = get_summary(data)
        if summary:
            summary_list.append(summary)
            num += 1

        if num >= count:
            break

    logging.info(f"summary_list={summary_list}")
    return summary_list


if __name__ == '__main__':
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0',
        'Content-Type': 'text/plain',
    }

    proxies = {
      "http": "http://127.0.0.1:10809",
      "https": "http://127.0.0.1:10809",
      "socks5": "socks://127.0.0.1:10808"
    }

    proxies = None

    common = Common()

    # 日志文件路径
    file_path = "./log/log-" + common.get_bj_time(1) + ".txt"
    Configure_logger(file_path)

    #data_list = search("伊卡洛斯", 'baidu', 1)
    #get_summary_list(data_list, 1)

    data_list = search("伊卡洛斯", 'bing', 1)
    get_summary_list(data_list, 1)