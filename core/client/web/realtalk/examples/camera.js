// camera.js

export const internalSseUrl = "https://192.168.1.70:5000/capture_events";
export const externalSseUrl = "https://101.50.118.42:5000/capture_events";

let currentStream = null;
let currentCameraDeviceId = null;
let isCameraVisible = true;
let clickCount = 0;
let clickTimer = null;

export async function getCameraDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter(device => device.kind === 'videoinput');
    } catch (error) {
        console.error('无法获取摄像头设备列表:', error);
        throw error;
    }
}

export async function initializeCamera(deviceId) {
    stopCamera();

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: deviceId ? { deviceId: { exact: deviceId } } : true
        });
        const videoElement = document.getElementById('video');
        if (!videoElement) throw new Error('未找到 <video> 元素');
        videoElement.srcObject = stream;
        await videoElement.play();
        currentStream = stream;
        return videoElement;
    } catch (error) {
        console.error('摄像头初始化失败:', error);
        throw error;
    }
}

export function stopCamera() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
    }
}

export async function switchCamera() {
    const devices = await getCameraDevices();
    if (devices.length < 2) {
        console.log('设备仅支持一个摄像头，无法切换');
        return;
    }

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

    try {
        await initializeCamera(nextDeviceId);
        currentCameraDeviceId = nextDeviceId;
        console.log('摄像头已切换:', currentCameraDeviceId);
    } catch (error) {
        console.error('切换摄像头失败:', error);
    }
}

export function toggleCameraVisibility() {
    const videoElement = document.getElementById('video');
    if (!videoElement) return;

    if (isCameraVisible) {
        videoElement.style.display = 'none';
    } else {
        videoElement.style.display = 'block';
    }
    isCameraVisible = !isCameraVisible;
}

export function handleButtonClick() {
    clickCount++;
    if (clickCount === 1) {
        clickTimer = setTimeout(() => {
            switchCamera();
            clickCount = 0;
        }, 300);
    } else if (clickCount === 2) {
        clearTimeout(clickTimer);
        toggleCameraVisibility();
        clickCount = 0;
    }
}

export async function initializePage() {
    const devices = await getCameraDevices();
    if (devices.length === 0) {
        console.log('未找到摄像头设备');
        return;
    }
    currentCameraDeviceId = devices[0].deviceId;
    try {
        await initializeCamera(currentCameraDeviceId);
        console.log('摄像头已初始化:', currentCameraDeviceId);
    } catch (error) {
        console.error('无法访问摄像头:', error);
    }
}
