import os
import sys
import threading
import time

import warnings
warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)

current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)
sys.path.append(os.path.join(current_dir, "indextts"))

import gradio as gr

from indextts.infer_vllm import IndexTTS
from tools.i18n.i18n import I18nAuto

i18n = I18nAuto(language="zh_CN")

model_dir = "checkpoints"
gpu_memory_utilization = 0.25

cfg_path = os.path.join(model_dir, "config.yaml")
tts = IndexTTS(model_dir=model_dir, cfg_path=cfg_path, gpu_memory_utilization=gpu_memory_utilization)


async def gen_single(prompts, text, progress=gr.Progress()):
    output_path = None
    tts.gr_progress = progress
    
    if isinstance(prompts, list):
        prompt_paths = [prompt.name for prompt in prompts if prompt is not None]
    else:
        prompt_paths = [prompts.name] if prompts is not None else []
    
    output = await tts.infer(prompt_paths, text, output_path, verbose=True)
    return gr.update(value=output, visible=True)

def update_prompt_audio():
    return gr.update(interactive=True)

with gr.Blocks() as demo:
    mutex = threading.Lock()
    gr.HTML('''
    <h2><center>IndexTTS: An Industrial-Level Controllable and Efficient Zero-Shot Text-To-Speech System</h2>
    <h2><center>(一款工业级可控且高效的零样本文本转语音系统)</h2>

<p align="center">
<a href='https://arxiv.org/abs/2502.05512'><img src='https://img.shields.io/badge/ArXiv-2502.05512-red'></a>
    ''')
    with gr.Tab("音频生成"):
        with gr.Row():
            # 使用 gr.File 替代 gr.Audio 来支持多文件上传
            prompt_audio = gr.File(
                label="请上传参考音频（可上传多个）",
                file_count="multiple",
                file_types=["audio"]
            )
            with gr.Column():
                input_text_single = gr.TextArea(label="请输入目标文本", key="input_text_single")
                gen_button = gr.Button("生成语音", key="gen_button", interactive=True)
            output_audio = gr.Audio(label="生成结果", visible=True, key="output_audio")

    prompt_audio.upload(
        update_prompt_audio,
        inputs=[],
        outputs=[gen_button]
    )

    gen_button.click(
        gen_single,
        inputs=[prompt_audio, input_text_single],
        outputs=[output_audio]
    )

if __name__ == "__main__":
    demo.queue(20)
    demo.launch(server_name="0.0.0.0")