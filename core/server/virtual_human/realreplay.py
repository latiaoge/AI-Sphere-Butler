import re
import time
import requests
import redis

# Redis配置，默认本地
r = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)

lastTime = time.time()
lastContent = ''


r.set('autosay.log', '')
r.set('autosayalready.log', '')

def string_intersection(str1, str2):
    str1_len = len(str1)
    newstr = ''
    for k in range(str1_len):
        if k < len(str2) and str1[k] == str2[k]:
            newstr += str1[k]
        else:
            break
    return newstr

while True:
    
    content1 = r.get('autosay.log') or ''
    content6 = r.get('autosayalready.log') or ''

    if content1 != '' and content6 != '':
        
        position_find = content1.find(content6)
        if position_find != -1:
            print("found okokokokokokokokokokokokok")
        else:
            print("not found")
            
            content6 = string_intersection(content6, content1)
            print('000000000----00000000000')
            print(content6)
            r.set('autosayalready.log', content6)
            print('00000000-----000000000000')

    
    filtered_content = content1.replace(content6, '')
    print('===' + filtered_content)

    if lastContent == '':
        lastContent = filtered_content

    if filtered_content == '':
        lastTime = time.time()

    currentTime = time.time()
    if filtered_content == lastContent and (currentTime - lastTime) > 5 and filtered_content != '':
       

      
        old_already = r.get('autosayalready.log') or ''
        r.set('autosayalready.log', old_already + filtered_content)

        lastTime = time.time()
        print('---------发送给数字人-----------' + filtered_content)

        # 发送给llm提问接口
        headers = {'Content-Type': 'application/json'}
        data = {
            "text": filtered_content,
            "sessionid": 0,
            "type": 'echo',
            "interrupt": True,
        }
        try:
            response = requests.post('http://127.0.0.1:8010/qwener', headers=headers, json=data, timeout=5)
            print('接口返回:', response.text)
        except Exception as e:
            print('请求失败:', e)

    elif filtered_content != lastContent:
        lastContent = filtered_content
        lastTime = time.time()

    time.sleep(1)
