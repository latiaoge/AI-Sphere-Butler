from multiprocessing import cpu_count

# 根据 CPU 核心数决定 worker 数量（调试阶段建议为 1）
workers = 1

# 使用 Uvicorn 的 worker，适配 ASGI（FastAPI）应用
worker_class = "uvicorn.workers.UvicornWorker"

# 设置绑定的地址和端口
bind = '0.0.0.0:11435'

# 设置超时时间，避免加载大型模型时进程被杀死
timeout = 300

# 日志设置（修改为绝对路径，防止相对路径问题）
loglevel = 'debug'
accesslog = './logs/gunicorn_access.log'  # 替换为实际路径
errorlog = './logs/gunicorn_error.log'   # 替换为实际路径

# 开启应用预加载，减少 worker 进程重复加载模型的开销
preload_app = True

# 允许的最大请求数量，避免内存泄漏
max_requests = 1000
max_requests_jitter = 50
