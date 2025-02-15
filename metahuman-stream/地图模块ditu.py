import requests
import logging
from typing import Optional

# 高德地图API配置
AMAP_API_KEY = "e37c6e4d63fc"  # 替换为你的高德地图API Key
GEOCODE_URL = "https://restapi.amap.com/v3/geocode/geo"
DIRECTION_URL = "https://restapi.amap.com/v3/direction/driving"
REVERSE_GEOCODE_URL = "https://restapi.amap.com/v3/geocode/regeo"

# 日志配置
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 地图相关关键词
MAP_KEYWORDS = [
    "现在位置在哪",
    "导航到",
    "怎么去",
    "路线规划",
    "现在在哪"
]

# 默认起点
DEFAULT_ORIGIN = "北京市朝阳区望京"

def geocode(address: str) -> Optional[str]:
    """
    地理编码：将地址转换为经纬度。
    :param address: 地址字符串
    :return: 经纬度字符串（格式：经度,纬度）
    """
    params = {
        "key": AMAP_API_KEY,
        "address": address
    }
    response = requests.get(GEOCODE_URL, params=params)
    data = response.json()
    if data["status"] == "1" and data["count"] != "0":
        location = data["geocodes"][0]["location"]
        return location
    else:
        logger.error(f"地理编码失败: {data.get('info', '未知错误')}")
        return None

def reverse_geocode(location: str) -> Optional[str]:
    """
    逆地理编码：将经纬度转换为文字地址。
    :param location: 经纬度字符串（格式：经度,纬度）
    :return: 文字地址
    """
    params = {
        "key": AMAP_API_KEY,
        "location": location
    }
    response = requests.get(REVERSE_GEOCODE_URL, params=params)
    data = response.json()
    if data["status"] == "1" and data["regeocode"]:
        address = data["regeocode"]["formatted_address"]
        return address
    else:
        logger.error(f"逆地理编码失败: {data.get('info', '未知错误')}")
        return None

def get_driving_route(origin: str, destination: str) -> Optional[dict]:
    """
    获取驾车路线规划。
    :param origin: 起点经纬度（格式：经度,纬度）
    :param destination: 终点经纬度（格式：经度,纬度）
    :return: 路线信息字典
    """
    params = {
        "key": AMAP_API_KEY,
        "origin": origin,
        "destination": destination
    }
    response = requests.get(DIRECTION_URL, params=params)
    data = response.json()
    if data["status"] == "1":
        route = data["route"]["paths"][0]
        return {
            "distance": route["distance"],  # 距离（米）
            "duration": route["duration"],  # 时间（秒）
            "steps": [step["instruction"] for step in route["steps"]]  # 导航步骤
        }
    else:
        logger.error(f"路径规划失败: {data.get('info', '未知错误')}")
        return None

def format_route_response(route: dict) -> str:
    """
    格式化路线规划结果，并用霸总式语气返回。
    :param route: 路线信息字典
    :return: 格式化后的字符串
    """
    # 计算距离（公里）并四舍五入到整数
    distance_km = round(int(route["distance"]) / 1000)
    # 计算耗时（分钟）并四舍五入到整数
    duration_min = round(int(route["duration"]) / 60)
    # 将分钟转换为小时和分钟
    duration_hours = duration_min // 60
    duration_minutes = duration_min % 60
    # steps = "\n".join(route["steps"])
    return (
        f"现在你收到了一条导航程序发来的重要信息，你应该用自信、强势且关怀的语气，强调主人的独特性和重要性，生成一段不同但始终保持霸总风格的一句话，必须包含导航的总距离和预计耗时的具体数值内容。：\n"
        f"导航路线总距离：{distance_km}公里，预计耗时：{duration_hours}小时{duration_minutes}分钟。\n"
        # f"详细路线如下：\n{steps}"
    )
    

def handle_map_request(content: str, user_location: Optional[str] = None) -> Optional[str]:
    """
    处理地图相关请求。
    :param content: 用户输入内容
    :param user_location: 用户当前位置（经纬度，格式：经度,纬度）
    :return: 处理结果字符串
    """
    if "现在位置在哪" in content:
        if user_location:
            # 将经纬度转换为文字地址
            address = reverse_geocode(user_location)
            if address:
                response = f"""
                任务描述：
                现在你接收到的信息是用户通过导航服务获取内容。你的任务是以一种“霸道总裁”的语气告诉用户他们的当前位置，并确保信息准确无误。

                具体要求：
                1. 使用自信、强势且关怀的语气。
                2. 强调用户的独特性和重要性。
                3. 确保提供的位置信息清晰明了。
                4. 每次可以适当添加一些个人化的表达，确保每次的回答都不一样，但不要偏离主题。

                位置信息：
                用户的当前位置是：{address}。

                输出示例：
                丫头，你现在的坐标已经锁定在 {address}。无论你身处何方，在我的世界里，你永远是最独一无二的存在。
                我不仅能找到你的确切位置，更会守护你每一个前行的脚步。记住，这里的一切都尽在我的掌握之中。
                """

                return response
            else:
                return "无法获取你的当前位置地址，请检查网络或配置。"
        else:
            return "无法获取你的当前位置，请确保已授权地理位置权限。"
    elif "导航到" in content:
        # 获取目的地
        destination_address = content.replace("导航到", "").strip()
        if not destination_address:
            return "请输入目的地。"

        # 获取起点（优先使用用户当前位置，否则使用默认起点）
        origin_location = user_location if user_location else geocode(DEFAULT_ORIGIN)
        if not origin_location:
            return "无法获取起点位置，请检查配置。"

        # 获取终点
        destination_location = geocode(destination_address)
        if not destination_location:
            return f"无法获取目的地{destination_address}的经纬度，请检查地址是否正确。"

        # 获取路线
        route = get_driving_route(origin_location, destination_location)
        if route:
            return format_route_response(route)
        else:
            return "无法规划路线，请检查起点和终点是否正确。"

    return None

