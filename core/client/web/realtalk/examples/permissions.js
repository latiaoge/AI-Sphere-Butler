// permissions.js

import { showErrorModal } from './uiUtils.js';

export async function requestMicrophonePermission() {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        console.error('当前浏览器不支持 mediaDevices API');
        alert('您的浏览器不支持所需的特性，请升级或更换浏览器');
        return false;
    }

    try {
        const permissionStatus = await navigator.permissions.query({ name: 'microphone' });

        if (permissionStatus.state === 'granted') {
            console.log('麦克风权限已授予');
            return true;
        } else if (permissionStatus.state === 'prompt') {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
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
