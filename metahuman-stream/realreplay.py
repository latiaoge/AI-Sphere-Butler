import re
import os
import time
import json
import sys
import requests

lastTime=time.time()
lastContent = ''
file9 = open("./autosay.log", "w")
file9.write('')
file9.close()
file8 = open("./autosayalready.log", "w")
file8.write('')
file8.close()

#获取交集
def string_intersection(str1, str2):
    ###永辉超市介绍一下。沃尔玛超市和牛超市的对比。呃。你是谁啊？福州有哪些小吃？   autosay.log
    ###永辉超市介绍一下。沃尔玛超市和牛超市的对比。呃。你是谁啊？呵呵。             autosayalready.log
    str1_len = len(str1)
    newstr   = ''
    for k in range(0, str1_len):
        if str1[k] == str2[k]:
            newstr = newstr+str1[k]
    return newstr
    
while True:
  file1 = open("./autosay.log", "r")
  content1 = file1.read()
  file1.close()
  
  #已经发过的
  file6 = open("./autosayalready.log", "r")
  content6 = file6.read()
  file6.close()
  
  if content1!= '' and content6 != '':
    #前端传来的到的原字符串突然改了内容处理  
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
        file32 = open("./autosayalready.log", "w")
        file32.write(content6)
        file32.close()
        print('00000000-----000000000000')

    
  #已经发过的要过滤掉
  content1.replace(content6, '')
  content1 = content1.replace(content6, '')
  print('==='+content1)
  
  if lastContent=='':
    lastContent=content1
	
  if content1 == '':
    lastTime=time.time()
  
  currentTime = time.time()
  if content1 == lastContent and (currentTime-lastTime)>5 and content1 != '':
    #一句话识别结束
    
            
    #已经发过的要存储
    file2 = open("./autosayalready.log", "r")
    content2 = file2.read()
    file2.close()
	
    file3 = open("./autosayalready.log", "w")
    file3.write(content2+content1)
    file3.close()
    lastTime = time.time()#上一次时间改为当前
    print('---------发送给数字人-----------'+content1)
    
    #发送给chatglm提问  开始
    headers={
        'Content-Type': 'application/json',
    }
    data = {
        "text": content1,
        "sessionid":0,
        "type":'echo',
        "interrupt":True,
    }
    response = requests.post('http://127.0.0.1:8010/qwener',  headers=headers, json=data)
    
    #发送给chatglm提问  结束
    
    
  elif content1 != lastContent:
    lastContent=content1
    lastTime = time.time()#上一次时间改为当前
	
	
  time.sleep(1)
  

#以下代码复制黏贴到app.py   开始

#跨域处理加如下代码
'''
from flask_cors import CORS
app = Flask(__name__)
CORS(app)
'''


@app.route('/say5')
def say5():
    text = request.args.get('text')
    text= urllib.parse.unquote(text)


    file9 = open("/home/ubuntu/er/chatgml/ChatGLM-6B/autosay.log", "w")
    file9.write(text)
    file9.close()
    return('000000000000000000000')


@app.route('/say2')
def say2():
    text = request.args.get('text')
    text= urllib.parse.unquote(text)
    with open('/home/ubuntu/er/chatgml/ChatGLM-6B/filename2222222.txt', 'a') as file:
        # 写入新行或其他需要添加的内容
        file.write(text+'--22-789-22--')
    return('000000000000000000000')
    
#以下代码复制黏贴到app.py   结束