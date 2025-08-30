

import subprocess
import logging
import threading
import time
import os

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)


console_handler = logging.StreamHandler()
console_handler.setLevel(logging.DEBUG)
formatter = logging.Formatter('[%(asctime)s][%(levelname)s] %(message)s')
console_handler.setFormatter(formatter)
logger.addHandler(console_handler)


class PrintJob:
    """
    管理单个打印任务
    """
    def __init__(self, filepath: str, printer_name: str = None, job_name: str = None):
        self.filepath = filepath
        self.printer_name = printer_name
        self.job_name = job_name or f"PrintJob-{os.path.basename(filepath)}"
        self.job_id = None
        self.completed = False
        self.failed = False
        self.error_message = None

    def submit(self):
        """
        提交打印任务，调用 lp 命令
        """
        cmd = ['lp']
        if self.printer_name:
            cmd += ['-d', self.printer_name]
        cmd += ['-t', self.job_name]  
        cmd.append(self.filepath)
        try:
            logger.info(f"提交打印任务: 文件 [{self.filepath}] 到打印机 [{self.printer_name or '默认'}], 任务名称 [{self.job_name}]")
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            
            output = result.stdout.strip()
            logger.info(f"打印任务提交结果: {output}")
            
            self.job_id = self._extract_job_id(output)
            return True
        except subprocess.CalledProcessError as e:
            self.failed = True
            self.error_message = e.stderr.strip() if e.stderr else str(e)
            logger.error(f"打印任务提交失败: {self.error_message}")
            return False

    @staticmethod
    def _extract_job_id(lp_output: str):
        """
        从 lp 输出中提取任务ID
        """
        
        parts = lp_output.split()
        if len(parts) >= 4:
            return parts[3]
        return None

    def check_status(self):
        """
        查询当前打印任务状态，调用 lpstat 命令
        返回：
          - 'completed' / 'processing' / 'pending' / 'cancelled' / 'unknown'
        """
        if not self.job_id:
            logger.warning("没有有效的打印任务ID，无法查询状态")
            return 'unknown'
        try:
            cmd = ['lpstat', '-W', 'completed', '-o']
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            completed_jobs = result.stdout

            if self.job_id in completed_jobs:
                logger.info(f"打印任务 {self.job_id} 已完成")
                self.completed = True
                return 'completed'

            
            cmd2 = ['lpstat', '-o']
            result2 = subprocess.run(cmd2, capture_output=True, text=True, check=True)
            all_jobs = result2.stdout

            if self.job_id in all_jobs:
                logger.info(f"打印任务 {self.job_id} 正在处理中")
                return 'processing'

            logger.warning(f"打印任务 {self.job_id} 状态未知，可能已被取消或不存在")
            return 'unknown'
        except subprocess.CalledProcessError as e:
            logger.error(f"查询打印任务状态失败: {e.stderr.strip() if e.stderr else str(e)}")
            return 'unknown'


class PrintManager:
    """
    打印任务管理器，支持任务提交和状态轮询回调
    """

    def __init__(self, printer_name: str = None, check_interval: int = 5):
        self.printer_name = printer_name
        self.check_interval = check_interval  
        self.jobs = {}  
        self._lock = threading.Lock()
        self._polling_thread = threading.Thread(target=self._poll_jobs_status, daemon=True)
        self._stop_flag = threading.Event()
        self._polling_thread.start()

    def submit_print(self, filepath: str, job_name: str = None, callback=None):
        """
        提交新的打印任务
        :param filepath: 文件路径
        :param job_name: 任务名
        :param callback: 任务状态改变时回调函数，签名：callback(job: PrintJob)
        :return: PrintJob实例或None（提交失败）
        """
        job = PrintJob(filepath, self.printer_name, job_name)
        success = job.submit()
        if not success:
            return None

        with self._lock:
            self.jobs[job.job_id] = job
        if callback:
            
            job._callback = callback
        else:
            job._callback = None

        logger.info(f"打印任务 [{job.job_id}] 已提交并添加到监控队列")
        return job

    def _poll_jobs_status(self):
        """
        轮询所有打印任务状态，任务完成或失败调用回调
        """
        while not self._stop_flag.is_set():
            with self._lock:
                if not self.jobs:
                    
                    time.sleep(self.check_interval)
                    continue

                job_ids = list(self.jobs.keys())
                for job_id in job_ids:
                    job = self.jobs.get(job_id)
                    if not job:
                        continue
                    status = job.check_status()
                    if status in ['completed', 'unknown']:
                        
                        if job._callback:
                            try:
                                job._callback(job)
                            except Exception as ex:
                                logger.error(f"打印任务回调异常: {ex}")
                        
                        del self.jobs[job_id]
            time.sleep(self.check_interval)

    def stop(self):
        """
        停止轮询线程，释放资源
        """
        self._stop_flag.set()
        self._polling_thread.join()



print_manager = PrintManager(printer_name=None)  




def submit_print_job(filepath: str, job_name: str = None, callback=None):
    """
    外部调用接口，用于提交打印任务
    """
    return print_manager.submit_print(filepath, job_name, callback)


def stop_print_manager():
    print_manager.stop()



def example_callback(job: PrintJob):
    if job.completed:
        logger.info(f"回调：打印任务[{job.job_id}]完成，文件：{job.filepath}")
    elif job.failed:
        logger.error(f"回调：打印任务[{job.job_id}]失败，错误：{job.error_message}")
    else:
        logger.warning(f"回调：打印任务[{job.job_id}]状态未知")


if __name__ == "__main__":
    
    test_file = "/tmp/test_print.pdf"
    job = submit_print_job(test_file, job_name="Test_Print_Job", callback=example_callback)
    if job:
        logger.info(f"打印任务已提交，任务ID: {job.job_id}")
    else:
        logger.error("打印任务提交失败")

    
    try:
        while print_manager.jobs:
            time.sleep(1)
    except KeyboardInterrupt:
        pass

    stop_print_manager()
