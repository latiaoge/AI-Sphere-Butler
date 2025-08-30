# analyze_logs.py
import re
from collections import defaultdict

def analyze_logs(log_file):
    response_times = []
    accuracy_scores = []
    api_calls = defaultdict(int)

    with open(log_file, 'r') as f:
        for line in f:
            # 分析响应时间
            if 'API call to chat took' in line:
                time = float(re.search(r'took (\d+\.\d+) seconds', line).group(1))
                response_times.append(time)

            # 分析记忆准确率
            if 'Memory accuracy for user' in line:
                accuracy = float(re.search(r'accuracy for user .+: (\d+\.\d+)', line).group(1))
                accuracy_scores.append(accuracy)

            # 统计API调用次数
            if 'API call to' in line:
                api_name = re.search(r'API call to (\w+)', line).group(1)
                api_calls[api_name] += 1

    # 计算统计数据
    avg_response_time = sum(response_times) / len(response_times) if response_times else 0
    avg_accuracy = sum(accuracy_scores) / len(accuracy_scores) if accuracy_scores else 0

    print(f"Average response time: {avg_response_time:.2f} seconds")
    print(f"Average memory accuracy: {avg_accuracy:.2f}")
    print("API call statistics:")
    for api, count in api_calls.items():
        print(f"  {api}: {count} calls")

if __name__ == "__main__":
    analyze_logs('logs/chat_api.log')
