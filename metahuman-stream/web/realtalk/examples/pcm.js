async function convertToPCM(arrayBuffer) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const pcmData = audioBuffer.getChannelData(0); // 获取单声道数据
    return new Float32Array(pcmData);
}
