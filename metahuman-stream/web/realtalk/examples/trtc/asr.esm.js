import { SpeechRecognizer } from '../../app/speechrecognizer';

export const guid = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0,
        v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};
const audioWorkletCode = `
class MyProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    this.audioData = [];
    this.nextUpdateFrame = 40;
  }

  get intervalInFrames() {
    return 40 / 1000 * sampleRate;
  }

  process(inputs) {
    // 去处理音频数据
    // eslint-disable-next-line no-undef
    const output = ${to16kHz}(inputs[0][0], sampleRate);
    const audioData = ${to16BitPCM}(output);
    const data = [...new Int8Array(audioData.buffer)];
    this.audioData = this.audioData.concat(data);
    this.nextUpdateFrame -= inputs[0][0].length;
    if (this.nextUpdateFrame < 0) {
      this.nextUpdateFrame += this.intervalInFrames;
      this.port.postMessage({
        audioData: new Int8Array(this.audioData)
      });
      this.audioData = [];
    }
    return true;
  }
}

registerProcessor('my-processor', MyProcessor);
`;
const audioWorkletBlobURL = window.URL.createObjectURL(new Blob([audioWorkletCode], { type: 'text/javascript' }));
const needFiltrationParams = ['appId', 'secretKey', 'secretId', 'audioTrack'];
class ASR {
  constructor(options, isLog) {
    this.audioTrack = options.audioTrack;
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.speechRecognizer = null;
    this.isCanSendData = false;
    this.audioData = [];
    this.secretkey = options.secretKey;
    this.params = {
      ...options,
      secretid: options.secretId,
      appid: options.appId,
    };
    this.isLog = isLog;
    this.OnRecognitionStart = function () {};
    this.OnSentenceBegin = function () {};
    this.OnRecognitionResultChange = function () {};
    this.OnSentenceEnd = function () {};
    this.OnRecognitionComplete = function () {};
    this.OnError = function () {};
    this.OnChange = function () {};
  }
  signCallback(signStr) {
    const secretKey = this.secretkey;
    const hash = window.CryptoJSTest.HmacSHA1(signStr, secretKey);
    const bytes = Uint8ArrayToString(toUint8Array(hash));
    return window.btoa(bytes);
  }
  start() {
    if (!this.speechRecognizer) {
      const tempQuery = { ...this.params };
      for (let i = 0, len = needFiltrationParams.length; i < len; i++) {
        if (tempQuery.hasOwnProperty(needFiltrationParams[i])) {
          delete tempQuery[needFiltrationParams[i]];
        }
      }
      const params = {
        // 用户参数
        signCallback: this.signCallback.bind(this),
        ...tempQuery,
      };
      this.speechRecognizer = new SpeechRecognizer(params, guid(), this.isLog);
    }

    // 开始识别
    this.speechRecognizer.OnRecognitionStart = (res) => {
      this.isCanSendData = true;
      this.OnRecognitionStart(res);
    };
    // 一句话开始
    this.speechRecognizer.OnSentenceBegin = (res) => {
      this.OnSentenceBegin(res);
      this.OnChange(res);
    };
    // 识别变化时
    this.speechRecognizer.OnRecognitionResultChange = (res) => {
      this.OnRecognitionResultChange(res);
      this.OnChange(res);
    };
    // 一句话结束
    this.speechRecognizer.OnSentenceEnd = (res) => {
      this.OnSentenceEnd(res);
      this.OnChange(res);
    };
    // 识别结束
    this.speechRecognizer.OnRecognitionComplete = (res) => {
      this.OnRecognitionComplete(res);
    };
    // 识别错误
    this.speechRecognizer.OnError = (res) => {
      this.isCanSendData = false;
      this.OnError(res);
    };

    // 建立连接
    this.speechRecognizer.start();
    this.getAudioData();
  }
  getAudioData() {
    const mediaStream = new MediaStream();
    mediaStream.addTrack(this.audioTrack);
    const mediaStreamSource = this.audioContext.createMediaStreamSource(mediaStream); // 将声音对象输入这个对象
    if (this.audioContext.audioWorklet) {
      this.audioContext.audioWorklet.addModule(audioWorkletBlobURL).then(() => {
        const myNode = new AudioWorkletNode(this.audioContext, 'my-processor', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
        myNode.port.onmessage = (event) => {
          if (this.isCanSendData) {
            this.speechRecognizer.write(event.data.audioData);
          }
        };
        mediaStreamSource.connect(myNode).connect(this.audioContext.destination);
      })
        .catch(console.error);
    } else {
      // 创建一个音频分析对象，采样的缓冲区大小为0（自动适配），输入和输出都是单声道
      const scriptProcessor = this.audioContext.createScriptProcessor(0, 1, 1);
      scriptProcessor.onaudioprocess = (e) => {
        // 去处理音频数据
        const inputData = e.inputBuffer.getChannelData(0);
        const output = to16kHz(inputData, this.audioContext.sampleRate);
        const audioData = to16BitPCM(output);
        this.audioData.push(...new Int8Array(audioData.buffer));
        if (this.audioData.length > 1280) {
          if (this.isCanSendData) {
            const audioDataArray = new Int8Array(this.audioData);
            this.speechRecognizer.write(audioDataArray);
            this.audioData = [];
          }
        }
      };
      // 连接
      mediaStreamSource.connect(scriptProcessor);
      scriptProcessor.connect(this.audioContext.destination);
    }
  }
  stop() {
    this.speechRecognizer.stop();
    this.audioContext && this.audioContext.suspend();
  }
}
window && (window.ASR = ASR);

function toUint8Array(wordArray) {
  // Shortcuts

  const { words } = wordArray;
  const { sigBytes } = wordArray;

  // Convert
  const u8 = new Uint8Array(sigBytes);
  for (let i = 0; i < sigBytes; i++) {
    u8[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
  }
  return u8;
}

function Uint8ArrayToString(fileData) {
  let dataString = '';
  for (let i = 0; i < fileData.length; i++) {
    dataString += String.fromCharCode(fileData[i]);
  }
  return dataString;
}
function to16BitPCM(input) {
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
function to16kHz(audioData, sampleRate = 44100) {
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
