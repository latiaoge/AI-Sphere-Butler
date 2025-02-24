import {SpeechRecognizer} from "./speechrecognizer";

export function to16BitPCM(input) {
  const dataLength = input.length * (16 / 8);
  const dataBuffer = new ArrayBuffer(dataLength);
  const dataView = new DataView(dataBuffer);
  let offset = 0;
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    dataView.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return dataView;
}
export function to16kHz(audioData, sampleRate= 44100) {
  const data = new Float32Array(audioData);
  const fitCount = Math.round(data.length * (16000 / sampleRate));
  const newData = new Float32Array(fitCount);
  const springFactor = (data.length - 1) / (fitCount - 1);
  newData[0] = data[0];
  for (let i = 1; i < fitCount - 1; i++) {
    const tmp = i * springFactor;
    const before = Math.floor(tmp).toFixed();
    const after = Math.ceil(tmp).toFixed();
    const atPoint = tmp - before;
    newData[i] = data[before] + (data[after] - data[before]) * atPoint;
  }
  newData[fitCount - 1] = data[data.length - 1];
  return newData;
}

const audioWorkletCode = `
class MyProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    this.audioData = [];
    this.nextUpdateFrame = 40;
    this.sampleCount = 0;
    this.bitCount = 0;
  }

  get intervalInFrames() {
    return 40 / 1000 * sampleRate;
  }

  process(inputs) {
    // 去处理音频数据
    // eslint-disable-next-line no-undef
    if (inputs[0][0]) {
      const output = ${to16kHz}(inputs[0][0], sampleRate);
      this.sampleCount += 1;
      const audioData = ${to16BitPCM}(output);
      this.bitCount += 1;
      const data = [...new Int8Array(audioData.buffer)];
      this.audioData = this.audioData.concat(data);
      this.nextUpdateFrame -= inputs[0][0].length;
      if (this.nextUpdateFrame < 0) {
        this.nextUpdateFrame += this.intervalInFrames;
        this.port.postMessage({
          audioData: new Int8Array(this.audioData),
          sampleCount: this.sampleCount,
          bitCount: this.bitCount
        });
        this.audioData = [];
      }
        return true;
      }
  }
}

registerProcessor('my-processor', MyProcessor);
`;
const audioWorkletBlobURL = window.URL.createObjectURL(new Blob([audioWorkletCode], { type: 'text/javascript' }));
const TAG = 'WebRecorder';
navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia
    || navigator.mozGetUserMedia || navigator.msGetUserMedia;


export default class WebRecorder {
  constructor(requestId, isLog) {
    this.audioData = [];
    this.allAudioData = [];
    this.stream = null;
    this.audioContext = null;
    this.requestId = requestId;
    this.frameTime = [];
    this.frameCount = 0;
    this.sampleCount = 0;
    this.bitCount = 0;
    this.mediaStreamSource = null;
    this.isLog = isLog;
  }
  static isSupportMediaDevicesMedia() {
    return !!(navigator.getUserMedia || (navigator.mediaDevices && navigator.mediaDevices.getUserMedia));
  }
  static isSupportUserMediaMedia() {
    return !!navigator.getUserMedia;
  }
  static isSupportAudioContext() {
    return typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined';
  }
  static isSupportMediaStreamSource(requestId, audioContext) {
    return typeof audioContext.createMediaStreamSource === 'function';
  }
  static isSupportAudioWorklet(audioContext) {
    return audioContext.audioWorklet && typeof audioContext.audioWorklet.addModule === 'function'
        && typeof AudioWorkletNode !== 'undefined';
  }
  static isSupportCreateScriptProcessor(requestId, audioContext) {
    return typeof audioContext.createScriptProcessor === 'function';
  }
  start() {
    this.frameTime = [];
    this.frameCount = 0;
    this.allAudioData = [];
    this.audioData = [];
    this.sampleCount = 0;
    this.bitCount = 0;
    this.getDataCount = 0;
    this.audioContext = null;
    this.mediaStreamSource = null;
    this.stream = null;
    try {
      if (WebRecorder.isSupportAudioContext()) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      } else {
        this.isLog && console.log(this.requestId, '浏览器不支持AudioContext', TAG);
        this.OnError('浏览器不支持AudioContext');
      }
    } catch (e) {
      this.isLog && console.log(this.requestId, '浏览器不支持webAudioApi相关接口', e, TAG);
      this.OnError('浏览器不支持webAudioApi相关接口');
    }
    this.getUserMedia(this.requestId, this.getAudioSuccess, this.getAudioFail);
  }
  stop() {
    if (!(/Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent))){
      this.audioContext && this.audioContext.suspend();
    }
    this.audioContext && this.audioContext.suspend();
    this.isLog && console.log(this.requestId, `webRecorder stop ${this.sampleCount}/${this.bitCount}/${this.getDataCount}` , JSON.stringify(this.frameTime), TAG);
    this.OnStop(this.allAudioData);
  }
  destroyStream() {
    // 关闭通道
    if (this.stream) {
      this.stream.getTracks().map((val) => {
        val.stop();
      });
      this.stream = null;
    }
  }
  async getUserMedia(requestId, getStreamAudioSuccess, getStreamAudioFail) {
    const mediaOption = {
      audio: true,
      video: false,
    };
    // 获取用户的麦克风
    if (WebRecorder.isSupportMediaDevicesMedia()) {
      navigator.mediaDevices
          .getUserMedia(mediaOption)
          .then(stream => {
            this.stream = stream;
            getStreamAudioSuccess.call(this, requestId, stream);
          })
          .catch(e => {
            getStreamAudioFail.call(this, requestId, e);
          });
    } else if (WebRecorder.isSupportUserMediaMedia()) {
      navigator.getUserMedia(mediaOption,
          stream => {
            this.stream = stream;
            getStreamAudioSuccess.call(this, requestId, stream);
          },
          function(err) {
            getStreamAudioFail.call(this, requestId, err);
          }
      );
    } else {
      if (navigator.userAgent.toLowerCase().match(/chrome/) && location.origin.indexOf('https://') < 0) {
        this.isLog && console.log(this.requestId, 'chrome下获取浏览器录音功能，因为安全性问题，需要在localhost或127.0.0.1或https下才能获取权限', TAG);
        this.OnError('chrome下获取浏览器录音功能，因为安全性问题，需要在localhost或127.0.0.1或https下才能获取权限');
      } else {
        this.isLog && console.log(this.requestId, '无法获取浏览器录音功能，请升级浏览器或使用chrome', TAG);
        this.OnError('无法获取浏览器录音功能，请升级浏览器或使用chrome');
      }
      this.audioContext && this.audioContext.close();
    }
  }
  async getAudioSuccess(requestId, stream) {
    if (!this.audioContext) {
      return false;
    }
    if (this.mediaStreamSource) {
      this.mediaStreamSource.disconnect();
      this.mediaStreamSource = null;
    }
    this.audioTrack = stream.getAudioTracks()[0];
    const mediaStream = new MediaStream();
    mediaStream.addTrack(this.audioTrack);
    this.mediaStreamSource = this.audioContext.createMediaStreamSource(mediaStream);
    if (WebRecorder.isSupportMediaStreamSource(requestId, this.audioContext)) {
      if (WebRecorder.isSupportAudioWorklet(this.audioContext)) { // 不支持 AudioWorklet 降级
        this.audioWorkletNodeDealAudioData(this.mediaStreamSource, requestId);
      } else {
        this.scriptNodeDealAudioData(this.mediaStreamSource, requestId);
      }
    } else { // 不支持 MediaStreamSource
      this.isLog && console.log(this.requestId, '不支持MediaStreamSource', TAG);
      this.OnError('不支持MediaStreamSource');
    }
  }
  getAudioFail(requestId, err) {
    if (err && err.err && err.err.name === 'NotAllowedError') {
      this.isLog && console.log(requestId,'授权失败', JSON.stringify(err.err), TAG);
    }
    this.isLog && console.log(this.requestId, 'getAudioFail', JSON.stringify(err), TAG);
    this.OnError(err);
    this.stop();
  }
  scriptNodeDealAudioData(mediaStreamSource, requestId) {
    if (WebRecorder.isSupportCreateScriptProcessor(requestId, this.audioContext)) {
      // 创建一个音频分析对象，采样的缓冲区大小为0（自动适配），输入和输出都是单声道
      const scriptProcessor = this.audioContext.createScriptProcessor(1024, 1, 1);
      // 连接
      this.mediaStreamSource && this.mediaStreamSource.connect(scriptProcessor);
      scriptProcessor && scriptProcessor.connect(this.audioContext.destination);
      scriptProcessor.onaudioprocess = (e) => {
        this.getDataCount += 1;
        // 去处理音频数据
        const inputData = e.inputBuffer.getChannelData(0);
        const output = to16kHz(inputData, this.audioContext.sampleRate);
        const audioData = to16BitPCM(output);
        this.audioData.push(...new Int8Array(audioData.buffer));
        this.allAudioData.push(...new Int8Array(audioData.buffer));
        if (this.audioData.length > 1280) {
          this.frameTime.push(`${Date.now()}-${this.frameCount}`);
          this.frameCount += 1;
          const audioDataArray = new Int8Array(this.audioData);
          this.OnReceivedData(audioDataArray);
          this.audioData = [];
          this.sampleCount += 1;
          this.bitCount += 1;
        }
      };
    } else { // 不支持
      this.isLog && console.log(this.requestId, '不支持createScriptProcessor', TAG);
    }
  }
  async audioWorkletNodeDealAudioData(mediaStreamSource, requestId) {
    try {
      await this.audioContext.audioWorklet.addModule(audioWorkletBlobURL);
      const myNode = new AudioWorkletNode(this.audioContext, 'my-processor', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
      myNode.onprocessorerror = (event) => {
        // 降级
        this.scriptNodeDealAudioData(mediaStreamSource, this.requestId);
        return false;
      }
      myNode.port.onmessage = (event) => {
        this.frameTime.push(`${Date.now()}-${this.frameCount}`);
        this.OnReceivedData(event.data.audioData);
        this.frameCount += 1;
        this.allAudioData.push(...event.data.audioData);
        this.sampleCount = event.data.sampleCount;
        this.bitCount = event.data.bitCount;
      };
      myNode.port.onmessageerror = (event) => {
        // 降级
        this.scriptNodeDealAudioData(mediaStreamSource, requestId);
        return false;
      }
      mediaStreamSource &&mediaStreamSource.connect(myNode).connect(this.audioContext.destination);
    } catch (e) {
      this.isLog && console.log(this.requestId, 'audioWorkletNodeDealAudioData catch error', JSON.stringify(e), TAG);
      this.OnError(e);
    }
  }
  // 获取音频数据
  OnReceivedData(data) {}
  OnError(res) {}
  OnStop(res) {}
}
typeof window !== 'undefined' && (window.WebRecorder = WebRecorder);
