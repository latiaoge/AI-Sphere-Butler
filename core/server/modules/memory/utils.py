from datetime import datetime

def get_current_date():
    return datetime.now().strftime("%Y年%m月%d日")
