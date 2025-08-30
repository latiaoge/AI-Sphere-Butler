import argparse
import threading
import time
import requests
from collections import defaultdict
import random

class TTSStressTester:
    def __init__(self, urls, data, concurrency, requests_per_thread):
        self.urls = urls
        self.data = data
        self.concurrency = concurrency
        self.requests_per_thread = requests_per_thread
        self.stats = {
            'total': 0,
            'success': 0,
            'fail': 0,
            'durations': [],
            'status_codes': defaultdict(int),
            'errors': defaultdict(int)
        }
        self.lock = threading.Lock()
        self.current_url_index = 0
        self.url_lock = threading.Lock()  # 用于轮询URL的锁

    def _get_next_url(self):
        with self.url_lock:
            url = self.urls[self.current_url_index]
            self.current_url_index = (self.current_url_index + 1) % len(self.urls)
        return url

    def _send_request(self):
        start_time = time.time()
        try:
            # 生成随机数字符串，确保不触发 vllm 的 cache
            self.data["text"] = ",".join(["".join([str(random.randint(0, 9)) for _ in range(5)]) for _ in range(1)])
            target_url = self._get_next_url()  # 获取轮询后的URL
            response = requests.post(target_url, json=self.data, timeout=10)
            elapsed = time.time() - start_time
            
            with self.lock:
                self.stats['durations'].append(elapsed)
                self.stats['status_codes'][response.status_code] += 1
                self.stats['total'] += 1
                if response.status_code == 200:
                    content_type = response.headers.get('Content-Type', '')
                    if 'audio' in content_type:
                        self.stats['success'] += 1
                    else:
                        self.stats['fail'] += 1
                        self.stats['errors']['invalid_content_type'] += 1
                else:
                    self.stats['fail'] += 1
                    
        except Exception as e:
            with self.lock:
                self.stats['fail'] += 1
                self.stats['errors'][str(type(e).__name__)] += 1
                self.stats['durations'].append(time.time() - start_time)

    def _worker(self):
        for _ in range(self.requests_per_thread):
            self._send_request()

    def run(self):
        threads = []
        start_time = time.time()
        
        for _ in range(self.concurrency):
            thread = threading.Thread(target=self._worker)
            thread.start()
            threads.append(thread)
        
        for thread in threads:
            thread.join()

        total_time = time.time() - start_time
        self._generate_report(total_time)

    def _generate_report(self, total_time):
        durations = self.stats['durations']
        total_requests = self.stats['total']
        
        print(f"\n{' 测试报告 ':=^40}")
        print(f"总请求时间: {total_time:.2f}秒")
        print(f"总请求量: {total_requests}")
        print(f"成功请求: {self.stats['success']}")
        print(f"失败请求: {self.stats['fail']}")
        
        if durations:
            avg_duration = sum(durations) / len(durations)
            max_duration = max(durations)
            min_duration = min(durations)
            print(f"\n响应时间统计:")
            print(f"平均: {avg_duration:.3f}秒")
            print(f"最大: {max_duration:.3f}秒")
            print(f"最小: {min_duration:.3f}秒")
            
            sorted_durations = sorted(durations)
            for p in [50, 90, 95, 99]:
                index = int(p / 100 * len(sorted_durations))
                print(f"P{p}: {sorted_durations[index]:.3f}秒")

        print("\n状态码分布:")
        for code, count in self.stats['status_codes'].items():
            print(f"HTTP {code}: {count}次")

        if self.stats['errors']:
            print("\n错误统计:")
            for error, count in self.stats['errors'].items():
                print(f"{error}: {count}次")

        print(f"\n吞吐量: {total_requests / total_time:.2f} 请求/秒")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='TTS服务压力测试脚本')
    parser.add_argument('--urls', nargs='+', 
                        default=['http://localhost:11996/tts'],  # , 'http://localhost:11997/tts'
                        help='TTS服务地址列表（多个用空格分隔）')
    parser.add_argument('--text', type=str, default='测试文本', help='需要合成的文本内容')
    parser.add_argument('--character', type=str, default='lancy', help='合成角色名称')
    parser.add_argument('--concurrency', type=int, default=16, help='并发线程数')
    parser.add_argument('--requests', type=int, default=5, help='每个线程的请求数')
    
    args = parser.parse_args()
    
    test_data = {
        "text": args.text,
        "character": args.character
    }
    
    tester = TTSStressTester(
        urls=args.urls,
        data=test_data,
        concurrency=args.concurrency,
        requests_per_thread=args.requests
    )
    
    print(f"开始压力测试，配置参数：")
    print(f"目标服务: {', '.join(args.urls)}")
    print(f"并发线程: {args.concurrency}")
    print(f"单线程请求数: {args.requests}")
    print(f"总预计请求量: {args.concurrency * args.requests}")
    print(f"{' 测试启动 ':=^40}")
    
    try:
        tester.run()
    except KeyboardInterrupt:
        print("\n测试被用户中断")