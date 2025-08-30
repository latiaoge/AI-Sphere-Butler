//index_noauto.js


import { bindLocationEventListener } from './location.js';
import { initializePage, handleButtonClick, switchCamera, toggleCameraVisibility } from './camera.js';
import { makeElementDraggable } from './draggable.js';
import { initializeSSE } from './sse.js';
import { initializeRecognizer, webAudioSpeechRecognizer, isListening } from './onespeechRecognizer.js';
import { requestMicrophonePermission } from './permissions.js';
import { showErrorModal, updateChatBubble } from './uiUtils.js';

// 绑定location事件监听
bindLocationEventListener();

// 初始化摄像头和SSE事件
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initializePage();
        initializeSSE();

        // 绑定摄像头切换按钮
        const toggleBtn = document.getElementById('toggle-switch-camera');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', handleButtonClick);
        }

        // 初始化漂浮容器拖拽
        const floatingContainer = document.getElementById('floating-container');
        if (floatingContainer) {
            makeElementDraggable(floatingContainer);
        }

        // 初始化语音识别相关
        // 这里根据你的项目需求，准备识别参数配置 params
        const params = {
            signCallback: signCallback, // 如果有，自行定义
            secretid: config.secretId,
            secretkey: config.secretKey,
            appid: config.appId,
            engine_model_type: '16k_zh',
        };

        // 获取麦克风按钮、聆听提示文本
        const micButton = document.getElementById('start');
        const listeningText = document.querySelector('.listening-text');

        micButton.addEventListener('click', async () => {
            if (isListening) {
                try {
                    await webAudioSpeechRecognizer.stop();
                    console.log('语音识别已停止');
                    if (listeningText) listeningText.style.display = 'none';
                } catch (error) {
                    console.error('停止语音识别失败:', error);
                }
            } else {
                if (!await requestMicrophonePermission()) return;

                await initializeRecognizer(params, { updateChatBubble, sendRecognizedText, showErrorModal });

                try {
                    await webAudioSpeechRecognizer.start();
                    console.log('语音识别已开始');
                    if (listeningText) listeningText.style.display = 'block';
                } catch (error) {
                    console.error('启动语音识别失败:', error);
                    alert('启动语音识别失败，请检查设置或稍后再试');
                    if (listeningText) listeningText.style.display = 'none';
                }
            }
        });

        // 其他初始化逻辑，比如触摸反馈、长按拖动等，按需拆分到其他模块

    } catch (error) {
        console.error("初始化失败:", error);
    }
});
