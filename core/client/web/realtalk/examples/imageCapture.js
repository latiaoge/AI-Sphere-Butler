// imageCapture.js

import { checkInternalNetwork } from './location.js';

const videoElement = document.getElementById('video');

export function captureAndSendImage() {
    if (!videoElement || !videoElement.srcObject) {
        console.error('视频流未初始化');
        return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;

    const context = canvas.getContext('2d');
    context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

    const imageData = canvas.toDataURL('image/jpeg', 0.9);
    const base64Data = imageData.split(',')[1];
    const format = imageData.split(',')[0].split('/')[1].split(';')[0];

    const apiUrl = checkInternalNetwork()
        ? 'https://192.168.1.70:5000/process_image'
        : 'https://101.50.118.42:5000/process_image';

    fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Data, format }),
    })
    .then(response => response.json())
    .then(data => {
        console.log('Response:', data);
    })
    .catch(error => {
        console.error('Error:', error);
    });
}
