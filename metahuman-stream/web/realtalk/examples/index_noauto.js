let webAudioSpeechRecognizer;
let isListening = false; // 用于跟踪当前是否正在聆听
let recognitionTimeout; // 用于语音识别超时
let silenceTimeout; // 用于检测长时间无语音输入的超时

// 地图功能相关变量
let isLocationRequestPending = false; // 标记是否有位置请求正在进行

/// 页面加载完成后绑定事件监听器
window.addEventListener("DOMContentLoaded", () => {
    console.log("页面加载完成，绑定事件监听器");

    // 监听 trigger-event 事件
    window.addEventListener("trigger-event", (event) => {
        console.log("收到 trigger-event 事件:", event);
        console.log("事件详细信息:", event.detail); // 输出详细信息
        if (event.detail === "get_location") {
            console.log("触发获取位置逻辑");
            getLocation(); // 调用获取位置的函数
        }
    });

    // 手动触发事件（测试用，实际应用中根据需要触发）
    // triggerLocationEvent(); // 你可以在合适的地方调用这个函数
});

// 从后端触发事件
function triggerLocationEvent() {
    console.log("准备触发 trigger-event 事件");
    window.dispatchEvent(new CustomEvent("trigger-event", {
        detail: "get_location"
    }));
}

// 获取位置并发送到后端
function getLocation() {
    console.log("getLocation 函数被调用"); // 添加调试日志
    if (isLocationRequestPending) {
        console.log("已有位置请求正在进行，跳过本次调用");
        return;
    }

    if (navigator.geolocation) {
        console.log("浏览器支持地理位置功能，正在获取位置...");
        isLocationRequestPending = true; // 标记请求开始

        navigator.geolocation.getCurrentPosition(
            (position) => {
                console.log("成功获取位置信息"); // 调试日志
                const latitude = position.coords.latitude;  // 纬度
                const longitude = position.coords.longitude; // 经度

                console.log(`获取到地理位置 - 纬度: ${latitude}, 经度: ${longitude}`);

                // 将位置发送到后端
                sendLocationToBackend(latitude, longitude);
            },
            (error) => {
                console.error("获取地理位置失败: " + error.message);
                isLocationRequestPending = false; // 标记请求结束
            },
            {
                enableHighAccuracy: true,  // 高精度模式
                timeout: 30000,            // 超时时间 30 秒
                maximumAge: 0              // 不使用缓存位置
            }
        );
    } else {
        console.error("您的浏览器不支持地理位置功能。");
    }
}

// 发送位置到后端
function sendLocationToBackend(latitude, longitude) {
    const payload = { latitude, longitude };  // 构造请求体
    console.log("发送的请求体:", payload); // 调试日志

    // 根据网络环境选择后端地址
    const apiUrl = checkInternalNetwork()
        ? 'https://192.168.1.70:5000/api/location'  // 内网地址
        : 'https://101.60.112.62:5000/api/location'; // 公网地址

    console.log("发送请求到:", apiUrl); // 调试日志

    fetch(apiUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",  // 确保设置请求头
        },
        body: JSON.stringify(payload),  // 确保请求体是 JSON 字符串
    })
    .then((response) => {
        console.log("响应状态码:", response.status);
        if (!response.ok) {
            throw new Error(`HTTP 错误: ${response.status}`);
        }
        return response.json();
    })
    .then((data) => {
        console.log("后端返回结果: " + JSON.stringify(data));
    })
    .catch((error) => {
        console.error("发送位置到后端失败: " + error.message);
    })
    .finally(() => {
        isLocationRequestPending = false; // 标记请求结束
    });
}

// 检查当前网络环境
function checkInternalNetwork() {
    const internalIPRanges = [
        /^192\.168\.\d{1,3}\.\d{1,3}$/, // 192.168.x.x
        /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // 10.x.x.x
        /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/ // 172.16.x.x - 172.31.x.x
    ];
    const currentHostname = window.location.hostname; // 获取当前主机名或 IP
    return internalIPRanges.some(range => range.test(currentHostname));
}




// 新增：摄像头相关变量
// 定义内外网 SSE 地址
const internalSseUrl = "https://192.168.1.70:5000/capture_events";
const externalSseUrl = "https://101.50.118.42:5000/capture_events";

// 摄像头相关变量
let currentStream = null;
let currentCameraDeviceId = null; // 当前摄像头的 deviceId
let isCameraVisible = true; // 摄像头是否可见
let clickCount = 0; // 记录点击次数
let clickTimer = null; // 双击计时器

// 获取摄像头设备列表
function getCameraDevices() {
    return navigator.mediaDevices.enumerateDevices()
        .then(devices => {
            const videoDevices = devices.filter(device => device.kind === 'videoinput');
            return videoDevices;
        })
        .catch(error => {
            console.error('无法获取摄像头设备列表:', error);
            throw error;
        });
}

// 初始化摄像头
function initializeCamera(deviceId) {
    stopCamera(); // 停止当前摄像头流

    return navigator.mediaDevices.getUserMedia({
        video: {
            deviceId: deviceId ? { exact: deviceId } : undefined // 使用指定的 deviceId
        }
    })
    .then(function (stream) {
        const videoElement = document.getElementById('video');
        if (!videoElement) {
            throw new Error('未找到 <video> 元素');
        }
        videoElement.srcObject = stream;
        videoElement.play();
        currentStream = stream;
        return videoElement;
    })
    .catch(function (error) {
        console.error('摄像头初始化失败:', error);
        throw error;
    });
}

// 停止摄像头
function stopCamera() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop()); // 停止所有轨道
        currentStream = null;
    }
}

// 切换摄像头
async function switchCamera() {
    const devices = await getCameraDevices();
    if (devices.length < 2) {
        console.log('设备仅支持一个摄像头，无法切换');
        return;
    }

    // 找到下一个摄像头
    let nextDeviceId = null;
    for (const device of devices) {
        if (device.deviceId !== currentCameraDeviceId) {
            nextDeviceId = device.deviceId;
            break;
        }
    }

    if (!nextDeviceId) {
        console.log('未找到可用的摄像头');
        return;
    }

    initializeCamera(nextDeviceId)
        .then(() => {
            currentCameraDeviceId = nextDeviceId; // 更新当前摄像头 deviceId
            console.log('摄像头已切换:', currentCameraDeviceId);
        })
        .catch(error => {
            console.error('切换摄像头失败:', error);
        });
}

// 显示/隐藏摄像头
function toggleCameraVisibility() {
    const videoElement = document.getElementById('video');
    const toggleButton = document.getElementById('toggle-switch-camera');

    if (isCameraVisible) {
        videoElement.style.display = 'none'; // 隐藏摄像头
    } else {
        videoElement.style.display = 'block'; // 显示摄像头
    }

    isCameraVisible = !isCameraVisible; // 切换状态
}

// 处理按钮点击事件
function handleButtonClick() {
    clickCount++; // 点击次数加 1

    if (clickCount === 1) {
        // 第一次点击，启动计时器
        clickTimer = setTimeout(() => {
            // 单击逻辑：切换摄像头
            switchCamera();
            clickCount = 0; // 重置点击次数
        }, 300); // 300ms 内没有第二次点击则视为单击
    } else if (clickCount === 2) {
        // 双击逻辑：显示/隐藏摄像头
        clearTimeout(clickTimer); // 清除单击计时器
        toggleCameraVisibility();
        clickCount = 0; // 重置点击次数
    }
}

// 初始化页面
async function initializePage() {
    const devices = await getCameraDevices();
    if (devices.length === 0) {
        console.log('未找到摄像头设备');
        return;
    }

    // 默认使用第一个摄像头
    currentCameraDeviceId = devices[0].deviceId;
    initializeCamera(currentCameraDeviceId)
        .then(() => {
            console.log('摄像头已初始化:', currentCameraDeviceId);
        })
        .catch(error => {
            console.error('无法访问摄像头:', error);
        });
}

// 绑定按钮点击事件
document.getElementById('toggle-switch-camera').addEventListener('click', handleButtonClick);

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', initializePage);

// 悬浮拖动功能
const floatingContainer = document.getElementById('floating-container');
let isDragging = false;
let offsetX, offsetY;

// 鼠标按下事件
floatingContainer.addEventListener('mousedown', (e) => {
    isDragging = true;
    offsetX = e.clientX - floatingContainer.offsetLeft;
    offsetY = e.clientY - floatingContainer.offsetTop;
    floatingContainer.style.cursor = 'grabbing';
});

// 鼠标移动事件
document.addEventListener('mousemove', (e) => {
    if (isDragging) {
        floatingContainer.style.left = `${e.clientX - offsetX}px`;
        floatingContainer.style.top = `${e.clientY - offsetY}px`;
    }
});

// 鼠标松开事件
document.addEventListener('mouseup', () => {
    isDragging = false;
    floatingContainer.style.cursor = 'grab';
});

// 触摸按下事件
floatingContainer.addEventListener('touchstart', (e) => {
    isDragging = true;
    const touch = e.touches[0];
    offsetX = touch.clientX - floatingContainer.offsetLeft;
    offsetY = touch.clientY - floatingContainer.offsetTop;
    floatingContainer.style.cursor = 'grabbing';
});

// 触摸移动事件
document.addEventListener('touchmove', (e) => {
    if (isDragging) {
        const touch = e.touches[0];
        floatingContainer.style.left = `${touch.clientX - offsetX}px`;
        floatingContainer.style.top = `${touch.clientY - offsetY}px`;
    }
});

// 触摸松开事件
document.addEventListener('touchend', () => {
    isDragging = false;
    floatingContainer.style.cursor = 'grab';
});




// 检查当前网络环境
function checkInternalNetwork() {
    const internalIPRanges = [
        /^192\.168\.\d{1,3}\.\d{1,3}$/, // 192.168.x.x
        /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // 10.x.x.x
        /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/ // 172.16.x.x - 172.31.x.x
    ];
    const currentHostname = window.location.hostname; // 获取当前主机名或 IP
    return internalIPRanges.some(range => range.test(currentHostname));
}

// 定义 captureAndSendImage 函数
const captureAndSendImage = () => {
    if (!videoElement || !videoElement.srcObject) {
        console.error('视频流未初始化');
        return;
    }

    // 创建 canvas 元素
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;

    // 绘制视频帧到 canvas
    const context = canvas.getContext('2d');
    context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

    // 将图像转换为 Base64 格式
    const imageData = canvas.toDataURL('image/jpeg', 0.9); // 转换为 JPEG 格式，质量为 90%
    const base64Data = imageData.split(',')[1]; // 提取 Base64 数据部分
    const format = imageData.split(',')[0].split('/')[1].split(';')[0]; // 获取图片格式（如 jpeg）

    // 判断当前网络环境
    const isInternalNetwork = checkInternalNetwork();

    // 根据网络环境选择后端地址
    const apiUrl = isInternalNetwork
        ? 'https://192.168.1.70:5000/process_image'  // 内网地址
        : 'https://101.50.118.42:5000/process_image'; // 公网地址

    // 发送图像数据到后端
    fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image: base64Data, format: format }),
    })
    .then(response => response.json())
    .then(data => {
        console.log('Response:', data);
        // 处理返回的数据
    })
    .catch(error => {
        console.error('Error:', error);
        // 处理错误
    });
};

// 初始化 SSE 连接
let eventSource = null;

function initializeSSE() {
    if (eventSource) {
        console.log('SSE 连接已存在，无需重新初始化');
        return;
    }

    const isInternalNetwork = checkInternalNetwork();
    const primarySseUrl = isInternalNetwork ? internalSseUrl : externalSseUrl; // 主地址
    const backupSseUrl = isInternalNetwork ? externalSseUrl : internalSseUrl; // 备用地址

    console.log(`当前网络环境: ${isInternalNetwork ? '内网' : '外网'}`);
    console.log(`尝试连接 SSE 地址: ${primarySseUrl}`); // 调试日志

    eventSource = new EventSource(primarySseUrl);

    eventSource.onopen = () => {
        console.log("SSE 连接已建立"); // 调试日志
    };

    eventSource.onmessage = (event) => {
        console.log("收到服务器事件:", event.data); // 调试日志
        if (event.data === "capture_image") {
            captureAndSendImage();
        }
    };

    
    eventSource.onmessage = (event) => {
        console.log("收到服务器事件:", event.data); // 调试日志
        if (event.data === "get_location") {
            console.log("触发获取位置逻辑");
            triggerLocationEvent(); // 触发 trigger-event 事件
        }
    };

    eventSource.onerror = (error) => {
        console.error("SSE 连接错误:", error);
        eventSource.close(); // 关闭当前连接

        // 尝试备用地址
        console.log(`尝试备用 SSE 地址: ${backupSseUrl}`);
        const backupEventSource = new EventSource(backupSseUrl); // 使用新的变量

        backupEventSource.onopen = () => {
            console.log("备用 SSE 连接已建立");
        };

        backupEventSource.onmessage = (event) => {
            console.log("收到备用服务器事件:", event.data); // 调试日志
            if (event.data === "capture_image") {
                captureAndSendImage();
            }
        };

        backupEventSource.onmessage = (event) => {
            console.log("收到备用服务器事件:", event.data); // 调试日志
            if (event.data === "get_location") {
                console.log("触发获取位置逻辑");
                triggerLocationEvent(); // 触发 trigger-event 事件
            }
        };


        backupEventSource.onerror = (error) => {
            console.error("备用 SSE 连接错误:", error);
            backupEventSource.close();
        };

        // 更新 eventSource 变量
        eventSource = backupEventSource;
    };
}

// 页面加载完成后初始化摄像头和 SSE 连接
document.addEventListener('DOMContentLoaded', async function () {
    console.log("DOMContentLoaded 事件触发"); // 调试日志

    try {
        // 初始化摄像头
        await initializeCamera();
        console.log("摄像头初始化完成");

        // 初始化 SSE 连接
        initializeSSE();
    } catch (error) {
        console.error("初始化失败:", error);
    }
});


document.addEventListener('DOMContentLoaded', function () {
    const params = {
        signCallback: signCallback, // 鉴权函数，若直接使用默认鉴权函数。可不传此参数
        secretid: config.secretId,
        secretkey: config.secretKey,
        appid: config.appId,
        engine_model_type: '16k_zh', // 因为内置WebRecorder采样16k的数据，所以参数 engineModelType 需要选择16k的引擎，为 '16k_zh'
    };

    
    navigator.mediaDevices.getUserMedia({ video: true })
  .then(function(stream) {
    var video = document.getElementById('video');
    video.srcObject = stream;
  })
  .catch(function(error) {
    console.error('获取视频流失败:', error);
  });

    // 检查浏览器是否支持 mediaDevices API
    function checkMediaDevices() {
        if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
            console.error('当前浏览器不支持 mediaDevices API');
            alert('您的浏览器不支持所需的特性，请升级或更换浏览器');
            return false;
        }
        return true;
    }

    

    // 初始化语音识别器
    async function initializeRecognizer() {
        if (!checkMediaDevices()) return;

        // 如果已有语音识别器，先停止并重新初始化
        if (webAudioSpeechRecognizer) {
            try {
                await webAudioSpeechRecognizer.stop();
            } catch (error) {
                console.warn('停止旧的语音识别器时出错:', error);
            }
            webAudioSpeechRecognizer = null; // 确保重新初始化
        }

        try {
            webAudioSpeechRecognizer = new WebAudioSpeechRecognizer(params);
            let resultText = ''; // 用于存储识别结果

            // 语音识别开始
            webAudioSpeechRecognizer.OnRecognitionStart = (res) => {
                console.log('开始识别', res);
                document.getElementById('recordingIndicator').style.display = 'block'; // 显示录音指示器
                isListening = true; // 更新聆听状态

                // 设置语音识别超时（60秒）
                recognitionTimeout = setTimeout(() => {
                    webAudioSpeechRecognizer.stop();
                    console.log('语音识别超时自动停止');
                }, 60000);

                // 启动无语音输入的超时检测（5秒）
                silenceTimeout = setTimeout(() => {
                    if (isListening) {
                        webAudioSpeechRecognizer.stop();
                        console.log('长时间无语音输入，自动停止语音识别');
                    }
                }, 5000);
            };

            // 一句话开始
            webAudioSpeechRecognizer.OnSentenceBegin = (res) => {
                console.log('一句话开始', res);
                clearTimeout(silenceTimeout); // 检测到语音输入，清除无语音输入的超时
            };

            // 识别结果变化
            webAudioSpeechRecognizer.OnRecognitionResultChange = (res) => {
                console.log('识别变化时', res);
                const currentText = `${resultText}${res.result.voice_text_str}`;
                updateChatBubble(currentText, 'user-input'); // 动态更新对话框内容
            };

            // 一句话结束
            webAudioSpeechRecognizer.OnSentenceEnd = (res) => {
                console.log('一句话结束', res);
                resultText += res.result.voice_text_str;

                // 动态更新对话框内容
                updateChatBubble(resultText, 'user-input');

                // 发送文本给服务器
                sendRecognizedText(resultText);
            };

            // 识别结束
            webAudioSpeechRecognizer.OnRecognitionComplete = (res) => {
                console.log('识别结束', res);
                document.getElementById('recordingIndicator').style.display = 'none'; // 隐藏录音指示器
                clearTimeout(recognitionTimeout); // 清除语音识别超时
                clearTimeout(silenceTimeout); // 清除无语音输入的超时
                isListening = false; // 重置聆听状态
            };

            // 识别失败
            webAudioSpeechRecognizer.OnError = (res) => {
                console.error('识别失败', res);
                showErrorModal('语音识别失败，请稍后再试。');
                isListening = false; // 重置聆听状态
            };

            // 音量变化（可选功能）
            webAudioSpeechRecognizer.OnVolumeChange = (volume) => {
                document.getElementById('volumeIndicator').textContent = `当前音量: ${volume}`;
            };
        } catch (error) {
            console.error('初始化语音识别器失败:', error);
            showErrorModal('初始化语音识别器失败，请检查设置或稍后再试。');
        }
    }

    // 发送识别的文本给服务器
    function sendRecognizedText(text) {
        const serverUrl = getServerUrl(); // 动态获取服务器地址
        let xhr = new XMLHttpRequest();
        xhr.open("POST", serverUrl, true);
        xhr.setRequestHeader("Content-Type", "application/json");
        var data = JSON.stringify({
            text: text,
            type: 'echo',
            interrupt: true,
            sessionid: 0
        });
        xhr.send(data);

        xhr.onreadystatechange = function () {
            if (xhr.readyState == 4) {
                if (xhr.status == 200) {
                    console.log(xhr.responseText);
                    // showSuccessModal('文本发送成功');
                } else {
                    console.error(`发送失败，状态码: ${xhr.status}`);
                    showErrorModal(`文本发送失败，状态码: ${xhr.status}`);
                }
            }
        };
    }

    // 初始化摄像头
    function initializeCamera() {
        if (!checkMediaDevices()) return;

        try {
            videoElement = document.getElementById("video");
            if (!videoElement) {
                videoElement = document.createElement("video");
                videoElement.id = "video";
                videoElement.style.display = "none"; // 隐藏视频元素
                document.body.appendChild(videoElement);
            }

            navigator.mediaDevices.getUserMedia({ video: true })
                .then(function (stream) {
                    videoElement.srcObject = stream;
                    videoElement.play();
                    console.log("摄像头已成功初始化");
                })
                .catch(function (error) {
                    console.error("无法访问摄像头:", error);
                    alert("无法访问摄像头，请检查设备权限或是否被占用。");
                });
        } catch (error) {
            console.error("初始化摄像头时发生错误:", error);
            alert("摄像头初始化失败，请刷新页面或检查您的设备。");
        }
    }

    
    initializeSSE(); // 显式调用 initializeSSE

   



        
       
    // **新增触摸功能：长按拖动**
    const handArea = document.querySelector('.hand-area'); // 匹配触摸区域
    const feedback = document.querySelector('.touch-feedback'); // 触摸反馈区域

    let isDragging = false; // 标记是否正在拖动
    let dragStartTimeout; // 用于检测长按
    let offsetX, offsetY; // 记录鼠标相对于圆圈的偏移量

    // 点击手臂触摸区域触发反馈
    handArea.addEventListener('click', (event) => {
        const touchText = "我摸了摸你胸肌，你该怎么说，我希望你每次回答我不一样的话！";

        // 动态发送触摸反馈文字到服务器
        sendRecognizedText(touchText);

        // 显示触摸反馈到 UI
        feedback.style.left = `${event.clientX}px`;
        feedback.style.top = `${event.clientY}px`;
        feedback.classList.add('active');
        setTimeout(() => feedback.classList.remove('active'), 500);

        console.log("触摸反馈文字已发送到服务器: ", touchText);
    });

    // 长按拖动功能
    handArea.addEventListener('mousedown', (event) => {
        event.preventDefault();

        // 设置长按计时器
        dragStartTimeout = setTimeout(() => {
            isDragging = true; // 标记为拖动状态
            handArea.style.cursor = 'grabbing';

            // 计算鼠标与触摸区域左上角的偏移
            const rect = handArea.getBoundingClientRect();
            offsetX = event.clientX - rect.left;
            offsetY = event.clientY - rect.top;
        }, 500); // 长按时间为 500 毫秒
    });

    document.addEventListener('mousemove', (event) => {
        if (isDragging) {
            // 更新手臂触摸区域的位置
            handArea.style.left = `${event.clientX - offsetX}px`;
            handArea.style.top = `${event.clientY - offsetY}px`;
        }
    });

    document.addEventListener('mouseup', () => {
        clearTimeout(dragStartTimeout);
        if (isDragging) {
            isDragging = false; // 停止拖动
            handArea.style.cursor = 'grab';
        }
    });

    // 请求麦克风权限
    async function requestMicrophonePermission() {
        if (!checkMediaDevices()) return false;

        try {
            const permissionStatus = await navigator.permissions.query({ name: 'microphone' });

            if (permissionStatus.state === 'granted') {
                console.log('麦克风权限已授予');
                return true;
            } else if (permissionStatus.state === 'prompt') {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(track => track.stop()); // Stop the tracks after getting permission
                console.log('麦克风权限已授予');
                return true;
            } else {
                console.error('麦克风权限被拒绝');
                showErrorModal('麦克风权限被拒绝，请手动授予权限或检查设置。');
                return false;
            }
        } catch (err) {
            console.error('麦克风权限请求失败:', err);
            showErrorModal('无法获取麦克风权限，请手动授予权限或检查设置。');
            return false;
        }
    }

    // 显示错误模态框
    function showErrorModal(message) {
        const modal = document.getElementById('errorModal');
        const modalBody = modal.querySelector('.modal-body');
        modalBody.textContent = message;
        modal.style.display = 'block';
    }

    // 显示成功模态框
    function showSuccessModal(message) {
        const modal = document.getElementById('successModal');
        const modalBody = modal.querySelector('.modal-body');
        modalBody.textContent = message;
        modal.style.display = 'block';
    }

    // 动态更新对话框内容
    function updateChatBubble(text, className) {
        const chatArea = document.querySelector('.chat-area');

        // 清空之前的对话框内容
        chatArea.innerHTML = '';

        // 创建新的对话框元素
        const chatBubble = document.createElement('div');
        chatBubble.className = `chat-bubble ${className}`;
        chatBubble.textContent = text;
        chatArea.appendChild(chatBubble);

        // 设置定时器，使对话框在 5 秒后自动消失
        setTimeout(() => {
            chatBubble.remove();
        }, 5000); // 5 秒后自动消失
    }

    // 获取麦克风按钮和聆听中提示文本
    const micButton = document.getElementById('start');
    const listeningText = document.querySelector('.listening-text');

    // 麦克风按钮的点击事件
    micButton.addEventListener('click', async function () {
        if (isListening) {
            // 如果正在聆听，停止语音识别
            try {
                await webAudioSpeechRecognizer.stop();
                console.log('语音识别已停止');
                listeningText.style.display = 'none'; // 隐藏聆听中提示文本
            } catch (error) {
                console.error('停止语音识别失败:', error);
            }
        } else {
            // 如果未在聆听，开始语音识别
            if (!await requestMicrophonePermission()) {
                return;
            }

            await initializeRecognizer();
            try {
                await webAudioSpeechRecognizer.start();
                console.log('语音识别已开始');
                listeningText.style.display = 'block'; // 显示聆听中提示文本
                isListening = true; // 更新聆听状态
            } catch (error) {
                console.error('启动语音识别失败:', error);
                alert('启动语音识别失败，请检查设置或稍后再试');
                listeningText.style.display = 'none'; // 隐藏聆听中提示文本
            }
        }
    });

    // 动态选择服务器地址
    function getServerUrl() {
        const internalUrl = "https://192.168.1.70:9010/qwener";
        const externalUrl = "https://101.60.116.42:9010/qwener";

        // 检测当前是否在内网环境
        const isInternalNetwork = checkInternalNetwork();

        if (isInternalNetwork) {
            console.log('当前在内网环境，使用内网地址');
            return internalUrl;
        } else {
            console.log('当前在外网环境，使用外网地址');
            return externalUrl;
        }
    }

    // 检测是否在内网环境
    function checkInternalNetwork() {
        const internalIPRanges = [
            /^192\.168\.\d{1,3}\.\d{1,3}$/,
            /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
            /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/
        ];

        const currentUrl = window.location.hostname;

        for (const range of internalIPRanges) {
            if (range.test(currentUrl)) {
                return true;
            }
        }

        return false;
    }



    
    // 初始化摄像头和 SSE
    initializeCamera();
    // 暴露到全局作用域
    window.initializeSSE = initializeSSE;

    


   
});

