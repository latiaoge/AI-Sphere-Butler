import re
import time
import requests

'''
使用方式：python  queue.py
'''
while True:
    
    file= open("finalsay.log", "r", encoding='utf-8')
    content= file.read()
    file.close()
    
    content = re.sub(r'^[,|\.|:|\?|!|，|？|！|：|、|。]+', '', content)

    lst = re.split(r"[,|\.|:|\?|!|，|？|！|：|、|。]", content)
    #print(lst[0])#要发给数字人的文字
    #print('00000000000-------------0000000000')
    
    sub_string = content[(len(lst[0])):] 
    sub_string= re.sub(r"^[,|\.|:|\?|!|，|？|！|：|、|。]", '', sub_string)#剔除已经说的话，保存起来
    
    if lst[0] != '':
      file= open("finalsay.log", "w", encoding='utf-8')#保存剩余没说的话
      file.write(sub_string)
      file.close()
      
      #非文字过滤
      lst[0] = re.sub('[^\u4e00-\u9fa5^a-z^A-Z^0-9]', '', lst[0])
      #post_data = {"text": lst[0]}
      
      #headers = {'Content-Type': 'application/json'}
      #post_data = {"query": text ,"history": [] }
      #requests.post('http://127.0.0.1:8050/say3', headers=headers, json=post_data)#发给数字人说话
      
      #查看是否最后一句，发送给数字人，用于实时语音转文字用   开始
      print('--------------------------------')
      print(lst[0])
      file= open("finalsay.log", "r", encoding='utf-8')
      content = file.read()
      file.close()
      '''
      if content =='':
          print('00000000000000000000')
          headers = {'Content-Type': 'application/json'}
          #requests.post('http://127.0.0.1:8010/sayfinish?text=1', headers=headers, json=[])#发给数字人，说是讲完话了
      else:
      '''
      if lst[0] != '':
          print('111111111say11111111'+lst[0])
          headers = {'Content-Type': 'application/json'}
          data = {
            "text": lst[0],
            "sessionid":0,
            "type":'echo',
            "interrupt":True,
          }
          requests.post('http://127.0.0.1:8010/say', headers=headers, json=data)#发给数字人，还没讲完话了
      #查看是否最后一句，发送给数字人，用于实时语音转文字用   结束
      
      lstLen = len(lst[0])/4
      time.sleep(lstLen)#休息时间和要发给数字人的文字成正比，防止速度太快
    else:
      time.sleep(1)#如果没有获取到文字，可以休息1秒