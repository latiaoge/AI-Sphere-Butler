from tx import start_reminder

REMINDER_KEYWORDS = ["提醒我", "定时"]

def handle_reminder(text: str):
    start_reminder(text)
