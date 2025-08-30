import WebRecorder from "./webrecorder.js";
import { SpeechRecognizer, guid } from "./speechrecognizer.js";

export default class WebAudioSpeechRecognizer {
  constructor(params, isLog) {
    this.params = params;
    this.recorder = null;
    this.speechRecognizer = null;
    this.isCanSendData = false;
    this.isNormalEndStop = false;
    this.audioData = [];
    this.isLog = isLog;
    this.requestId = null;
  }
  start() {
    try {
      this.isLog && console.log('start function is click');
      this.requestId = guid();
      this.recorder = new WebRecorder(this.requestId, this.isLog);
      this.recorder.OnReceivedData = (data) => {
        if (this.isCanSendData) {
          this.speechRecognizer && this.speechRecognizer.write(data);
        }
      };
      // 录音失败时
      this.recorder.OnError = (err) => {
        this.speechRecognizer && this.speechRecognizer.close();
        this.stop();
        this.OnError(err);
      }
      this.recorder.OnStop  = (res) => {
        if (this.speechRecognizer) {
          this.speechRecognizer.stop();
          // this.speechRecognizer = null;
        }
        this.OnRecorderStop(res);
      }
      this.recorder.start();
      if (!this.speechRecognizer) {
        this.speechRecognizer = new SpeechRecognizer(this.params, this.requestId, this.isLog);
      }
      // 开始识别
      this.speechRecognizer.OnRecognitionStart = (res) => {
        if (this.recorder) { // 录音正常
          this.OnRecognitionStart(res);
          this.isCanSendData = true;
        } else {
          this.speechRecognizer && this.speechRecognizer.close();
        }
      };
      // 一句话开始
      this.speechRecognizer.OnSentenceBegin = (res) => {
        this.OnSentenceBegin(res);
      };
      // 识别变化时
      this.speechRecognizer.OnRecognitionResultChange = (res) => {
        this.OnRecognitionResultChange(res);
      };
      // 一句话结束
      this.speechRecognizer.OnSentenceEnd = (res) => {
        this.OnSentenceEnd(res);
      };
      // 识别结束
      this.speechRecognizer.OnRecognitionComplete = (res) => {
        this.OnRecognitionComplete(res);
        this.isCanSendData = false;
        this.isNormalEndStop = true;
      };
      // 识别错误
      this.speechRecognizer.OnError = (res) => {
        if (this.speechRecognizer && !this.isNormalEndStop) {
          this.OnError(res);
        }
        this.speechRecognizer = null;
        this.recorder && this.recorder.stop();
        this.isCanSendData = false;
      };
      // 建立连接
      this.speechRecognizer.start();
    } catch (e) {
      console.log(e);
    }
  }
  stop() {
    this.isLog && console.log('stop function is click');
    if (this.recorder) {
      this.recorder.stop();
    }
    // if (this.speechRecognizer) {
    //   this.speechRecognizer.stop();
    // }
  }
  destroyStream() {
    this.isLog && console.log('destroyStream function is click', this.recorder);
    if (this.recorder) {
      this.recorder.destroyStream();
    }
  }
  // 开始识别的时候
  OnRecognitionStart(res) {}
  // 一句话开始的时候
  OnSentenceBegin(res) {}
  // 识别结果发生变化的时候
  OnRecognitionResultChange() {}
  // 一句话结束的时候
  OnSentenceEnd() {}
  // 识别结束的时候
  OnRecognitionComplete() {}
  // 识别失败
  OnError() {}
  OnRecorderStop() {}
};
