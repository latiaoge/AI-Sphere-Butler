import re
import time
import requests

'''
使用方式：python  queue.py
'''
while True:
    
    file= open("log\finalsay.log", "r", encoding='utf-8')
    content= file.read()
    file.close()
    
    content = re.sub(r'^[,|\.|:|\?|!|，|？|！|：|、|。]+', '', content)

    lst = re.split(r"[,|\.|:|\?|!|，|？|！|：|、|。]", content)
    
    
    sub_string = content[(len(lst[0])):] 
    sub_string= re.sub(r"^[,|\.|:|\?|!|，|？|！|：|、|。]", '', sub_string)
    if lst[0] != '':
      file= open("log\finalsay.log", "w", encoding='utf-8')
      file.write(sub_string)
      file.close()
      
      
      lst[0] = re.sub('[^\u4e00-\u9fa5^a-z^A-Z^0-9]', '', lst[0])

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
          requests.post('http://127.0.0.1:8010/say', headers=headers, json=data)
      
      lstLen = len(lst[0])/4
      time.sleep(lstLen)
    else:
      time.sleep(1)