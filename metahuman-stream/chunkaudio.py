from pydub import AudioSegment
import sys
 
# 加载音频文件
audio_file = "1.wav"
chunk_length_ms = 1000  # 以毫秒为单位的chunk长度
 
# 使用pydub打开音频文件
audio = AudioSegment.from_file(audio_file)
 
# 计算chunk的长度（以毫秒为单位）
chunk_length = chunk_length_ms - 50  # 减去50ms以确保chunk处理后不会超过指定长度
 
# 计算chunk数量
chunks_count = len(audio) // chunk_length + 1
 
# 创建chunks列表
chunks = []
 
# 分割音频
for i in range(chunks_count):
    start = i * chunk_length
    end = (i + 1) * chunk_length
    chunk = audio[start:end]
    chunks.append(chunk)
 
# 保存chunks到文件
for i, chunk in enumerate(chunks):
    chunk_file = f"chunkaudio/chunk_{i+1}.wav"
    chunk.export(chunk_file, format="wav")