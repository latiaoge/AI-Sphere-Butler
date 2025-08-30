import re

def clean_text(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r"[^\w\s\u4e00-\u9fff]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text