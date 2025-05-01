import re
import os
import time
import json
import sys
import requests

lastTime = time.time()
lastContent = ''

# 打开文件并清空内容
with open("./autosay.log", "w") as file9:
    file9.write('')
with open("./autosayalready.log", "w") as file8:
    file8.write('')

# 获取交集
def string_intersection(str1, str2):
    return ''.join([str1[k] for k in range(min(len(str1), len(str2))) if str1[k] == str2[k]])

# 打开文件并保持打开状态
file1 = open("./autosay.log", "r")
file6 = open("./autosayalready.log", "r")
file3 = open("./autosayalready.log", "a+")

try:
    while True:
        # 读取文件内容
        file1.seek(0)
        content1 = file1.read()
        file6.seek(0)
        content6 = file6.read()

        if content1 != '' and content6 != '':
            # 前端传来的到的原字符串突然改了内容处理
            content1_str = str(content1)
            content6_str = str(content6)
            position_find = content1_str.find(content6_str)
            if position_find != -1:
                print("found okokokokokokokokokokokokok")
            else:
                print("not found")
                content6 = string_intersection(content6_str, content1_str)
                print('000000000----00000000000')
                print(content6)
                file3.seek(0)
                file3.truncate()
                file3.write(content6)
                print('00000000-----000000000000')

        # 已经发过的要过滤掉
        content1 = content1.replace(content6, '')
        print('===' + content1)

        if lastContent == '':
            lastContent = content1

        if content1 == '':
            lastTime = time.time()

        currentTime = time.time()
        if content1 == lastContent and (currentTime - lastTime) > 5 and content1 != '':
            # 一句话识别结束

            # 已经发过的要存储
            file3.seek(0, 2)  # 移动到文件末尾
            file3.write(content1)

            lastTime = time.time()  # 上一次时间改为当前
            print('---------发送给数字人-----------' + content1)

            # 发送给chatglm提问  开始
            headers = {
                'Content-Type': 'application/json',
            }
            data = {
                "text": content1,
                "sessionid": 0,
                "type": 'echo',
                "interrupt": True,
            }
            try:
                # 添加超时参数，这里设置为 10 秒，可以根据实际情况调整
                response = requests.post('http://127.0.0.1:8010/qwener', headers=headers, json=data, timeout=10)
                response.raise_for_status()
            except requests.Timeout:
                print("请求超时，请检查网络或 API 服务。")
            except Exception as e:
                print(f"请求失败: {e}")
            # 发送给chatglm提问  结束

        elif content1 != lastContent:
            lastContent = content1
            lastTime = time.time()  # 上一次时间改为当前

        time.sleep(1)

except KeyboardInterrupt:
    print("程序终止，关闭文件...")
finally:
    # 关闭文件
    file1.close()
    file6.close()
    file3.close()

# 以下代码复制黏贴到app.py   开始

# 跨域处理加如下代码
'''
from flask_cors import CORS
app = Flask(__name__)
CORS(app)
'''


@app.route('/say5')
def say5():
    text = request.args.get('text')
    text = urllib.parse.unquote(text)

    file9 = open("/home/ubuntu/er/chatgml/ChatGLM-6B/autosay.log", "w")
    file9.write(text)
    file9.close()
    return('000000000000000000000')


@app.route('/say2')
def say2():
    text = request.args.get('text')
    text = urllib.parse.unquote(text)
    with open('/home/ubuntu/er/chatgml/ChatGLM-6B/filename2222222.txt', 'a') as file:
        # 写入新行或其他需要添加的内容
        file.write(text + '--22-789-22--')
    return('000000000000000000000')

# 以下代码复制黏贴到app.py   结束
