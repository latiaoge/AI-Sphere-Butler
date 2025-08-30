// onespeechRecognizer.js

export let webAudioSpeechRecognizer;
export let isListening = false;
export let recognitionTimeout;
export let silenceTimeout;

export async function initializeRecognizer(params, { updateChatBubble, sendRecognizedText, showErrorModal }) {
    // params: sdk等初始化参数
    // updateChatBubble(text, className): 动态更新对话框内容
    // sendRecognizedText(text): 发送文本到服务器
    // showErrorModal(msg): 显示错误消息（UI）

    if (webAudioSpeechRecognizer) {
        try {
            await webAudioSpeechRecognizer.stop();
        } catch (error) {
            console.warn('停止旧的语音识别器时出错:', error);
        }
        webAudioSpeechRecognizer = null;
    }

    try {
        webAudioSpeechRecognizer = new WebAudioSpeechRecognizer(params);
        let resultText = '';

        webAudioSpeechRecognizer.OnRecognitionStart = (res) => {
            console.log('开始识别', res);
            document.getElementById('recordingIndicator').style.display = 'block';
            isListening = true;

            recognitionTimeout = setTimeout(() => {
                webAudioSpeechRecognizer.stop();
                console.log('语音识别超时自动停止');
            }, 60000);

            silenceTimeout = setTimeout(() => {
                if (isListening) {
                    webAudioSpeechRecognizer.stop();
                    console.log('长时间无语音输入，自动停止语音识别');
                }
            }, 5000);
        };

        webAudioSpeechRecognizer.OnSentenceBegin = (res) => {
            console.log('一句话开始', res);
            clearTimeout(silenceTimeout);
        };

        webAudioSpeechRecognizer.OnRecognitionResultChange = (res) => {
            console.log('识别变化时', res);
            const currentText = `${resultText}${res.result.voice_text_str}`;
            updateChatBubble(currentText, 'user-input');
        };

        webAudioSpeechRecognizer.OnSentenceEnd = (res) => {
            console.log('一句话结束', res);
            resultText += res.result.voice_text_str;
            updateChatBubble(resultText, 'user-input');
            sendRecognizedText(resultText);
        };

        webAudioSpeechRecognizer.OnRecognitionComplete = (res) => {
            console.log('识别结束', res);
            document.getElementById('recordingIndicator').style.display = 'none';
            clearTimeout(recognitionTimeout);
            clearTimeout(silenceTimeout);
            isListening = false;
        };

        webAudioSpeechRecognizer.OnError = (res) => {
            console.error('识别失败', res);
            showErrorModal('语音识别失败，请稍后再试。');
            isListening = false;
        };

        webAudioSpeechRecognizer.OnVolumeChange = (volume) => {
            document.getElementById('volumeIndicator').textContent = `当前音量: ${volume}`;
        };
    } catch (error) {
        console.error('初始化语音识别器失败:', error);
        showErrorModal('初始化语音识别器失败，请检查设置或稍后再试。');
    }
}
