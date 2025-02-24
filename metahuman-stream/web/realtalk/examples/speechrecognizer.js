!function(t,e){"object"==typeof exports&&"undefined"!=typeof module?module.exports=e():"function"==typeof define&&define.amd?define(e):(t=t||self).WebAudioSpeechRecognizer=e()}(this,function(){"use strict";

// 定义 k
const k = "WebRecorder";

const S=()=>"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,function(t){var e=16*Math.random()|0;return("x"===t?e:3&e|8).toString(16)});
const C="SpeechRecognizer";

class w{
    constructor(t,e,i){
        this.socket=null,this.isSignSuccess=!1,this.isSentenceBegin=!1,this.query={...t},this.isRecognizeComplete=!1,this.requestId=e,this.isLog=i,this.sendCount=0,this.getMessageList=[];
    }
    stop(){
        this.socket&&1===this.socket.readyState?(this.socket.send(JSON.stringify({type:"end"})),this.isRecognizeComplete=!0):this.socket&&1===this.socket.readyState&&this.socket.close();
    }
    async start(){
        this.socket=null,this.getMessageList=[];
        const t="ws://192.168.168.7:10096/"; // 替换为本地 FunASR 地址
        if(this.isLog&&console.log(this.requestId,"get ws url",t,C),"WebSocket"in window)this.socket=new WebSocket(t);
        else{
            if(!("MozWebSocket"in window))return this.isLog&&console.log(this.requestId,"浏览器不支持WebSocket",C),void this.OnError("浏览器不支持WebSocket");
            this.socket=new MozWebSocket(t);
        }
        this.socket.onopen=t=>{this.isLog&&console.log(this.requestId,"连接建立",t,C)},
        this.socket.onmessage=async t=>{
            try{
                this.getMessageList.push(JSON.stringify(t));
                var e=JSON.parse(t.data);
                0!==e.code?(1===this.socket.readyState&&this.socket.close(),this.isLog&&console.log(this.requestId,JSON.stringify(e),C),this.OnError(e)):(this.isSignSuccess||(this.OnRecognitionStart(e),this.isSignSuccess=!0),1===e.final?this.OnRecognitionComplete(e):(e.result&&(0===e.result.slice_type?(this.OnSentenceBegin(e),this.isSentenceBegin=!0):2===e.result.slice_type?(this.isSentenceBegin||this.OnSentenceBegin(e),this.OnSentenceEnd(e)):this.OnRecognitionResultChange(e)),this.isLog&&console.log(this.requestId,e,C)));
            }catch(t){
                this.isLog&&console.log(this.requestId,"socket.onmessage catch error",JSON.stringify(t),C);
            }
        },
        this.socket.onerror=t=>{this.isLog&&console.log(this.requestId,"socket error callback",t,C),this.socket.close(),this.OnError(t)},
        this.socket.onclose=t=>{
            try{
                this.isRecognizeComplete||(this.isLog&&console.log(this.requestId,"socket is close and error",JSON.stringify(t),C),this.OnError(t));
            }catch(t){
                this.isLog&&console.log(this.requestId,"socket is onclose catch"+this.sendCount,JSON.stringify(t),C);
            }
        };
    }
    close(){
        this.socket&&this.socket.close(1e3);
    }
    write(t){
        try{
            this.socket&&"1"===String(this.socket.readyState)||setTimeout(()=>{this.socket&&1===this.socket.readyState||this.socket.send(t)},40),this.sendCount+=1,this.socket.send(t);
        }catch(t){
            this.isLog&&console.log(this.requestId,"发送数据 error catch",t,C);
        }
    }
    OnRecognitionStart(t){}
    OnSentenceBegin(t){}
    OnRecognitionResultChange(){}
    OnSentenceEnd(){}
    OnRecognitionComplete(){}
    OnError(){}
}

function x(e){
    var t=2*e.length,t=new ArrayBuffer(t),i=new DataView(t);
    let s=0;
    for(let t=0;t<e.length;t++,s+=2){
        var o=Math.max(-1,Math.min(1,e[t]));
        i.setInt16(s,o<0?32768*o:32767*o,!0);
    }
    return i;
}

function O(t,e=44100){
    var i=new Float32Array(t),s=Math.round(i.length*(16e3/e)),o=new Float32Array(s),n=(i.length-1)/(s-1);
    o[0]=i[0];
    for(let t=1;t<s-1;t++){
        var r=t*n,a=Math.floor(r).toFixed(),c=Math.ceil(r).toFixed();
        o[t]=i[a]+(i[c]-i[a])*(r-a);
    }
    return o[s-1]=i[i.length-1],o;
}

"undefined"!=typeof window&&(window.SpeechRecognizer=w);

const v=window.URL.createObjectURL(new Blob([`
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
        if (inputs[0][0]) {
            const output = ${O}(inputs[0][0], sampleRate);
            this.sampleCount += 1;
            const audioData = ${x}(output);
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
`],{type:"text/javascript"}));

navigator.getUserMedia=navigator.getUserMedia||navigator.webkitGetUserMedia||navigator.mozGetUserMedia||navigator.msGetUserMedia;

class R{
    constructor(t,e){
        this.audioData=[],this.allAudioData=[],this.stream=null,this.audioContext=null,this.requestId=t,this.frameTime=[],this.frameCount=0,this.sampleCount=0,this.bitCount=0,this.mediaStreamSource=null,this.isLog=e;
    }
    static isSupportMediaDevicesMedia(){
        return!!(navigator.getUserMedia||navigator.mediaDevices&&navigator.mediaDevices.getUserMedia);
    }
    static isSupportUserMediaMedia(){
        return!!navigator.getUserMedia;
    }
    static isSupportAudioContext(){
        return"undefined"!=typeof AudioContext||"undefined"!=typeof webkitAudioContext;
    }
    static isSupportMediaStreamSource(t,e){
        return"function"==typeof e.createMediaStreamSource;
    }
    static isSupportAudioWorklet(t){
        return t.audioWorklet&&"function"==typeof t.audioWorklet.addModule&&"undefined"!=typeof AudioWorkletNode;
    }
    static isSupportCreateScriptProcessor(t,e){
        return"function"==typeof e.createScriptProcessor;
    }
    start(){
        this.frameTime=[],this.frameCount=0,this.allAudioData=[],this.audioData=[],this.sampleCount=0,this.bitCount=0,this.getDataCount=0,this.audioContext=null,this.mediaStreamSource=null,this.stream=null;
        try{
            R.isSupportAudioContext()?this.audioContext=new(window.AudioContext||window.webkitAudioContext):(this.isLog&&console.log(this.requestId,"浏览器不支持AudioContext",k),this.OnError("浏览器不支持AudioContext"));
        }catch(t){
            this.isLog&&console.log(this.requestId,"浏览器不支持webAudioApi相关接口",t,k),this.OnError("浏览器不支持webAudioApi相关接口");
        }
        this.getUserMedia(this.requestId,this.getAudioSuccess,this.getAudioFail);
    }
    stop(){
        /Safari/.test(navigator.userAgent)&&!/Chrome/.test(navigator.userAgent)||this.audioContext&&this.audioContext.suspend(),this.audioContext&&this.audioContext.suspend(),this.isLog&&console.log(this.requestId,`webRecorder stop ${this.sampleCount}/${this.bitCount}/`+this.getDataCount,JSON.stringify(this.frameTime),k),this.OnStop(this.allAudioData);
    }
    destroyStream(){
        this.stream&&(this.stream.getTracks().map(t=>{t.stop()}),this.stream=null);
    }
    async getUserMedia(e,i,s){
        var t={audio:!0,video:!1};
        R.isSupportMediaDevicesMedia()?navigator.mediaDevices.getUserMedia(t).then(t=>{this.stream=t,i.call(this,e,t)}).catch(t=>{s.call(this,e,t)}):R.isSupportUserMediaMedia()?navigator.getUserMedia(t,t=>{this.stream=t,i.call(this,e,t)},function(t){s.call(this,e,t)}):(navigator.userAgent.toLowerCase().match(/chrome/)&&location.origin.indexOf("https://")<0?(this.isLog&&console.log(this.requestId,"chrome下获取浏览器录音功能，因为安全性问题，需要在localhost或127.0.0.1或https下才能获取权限",k),this.OnError("chrome下获取浏览器录音功能，因为安全性问题，需要在localhost或127.0.0.1或https下才能获取权限")):(this.isLog&&console.log(this.requestId,"无法获取浏览器录音功能，请升级浏览器或使用chrome",k),this.OnError("无法获取浏览器录音功能，请升级浏览器或使用chrome")),this.audioContext&&this.audioContext.close());
    }
    async getAudioSuccess(t,e){
        if(!this.audioContext)return!1;
        this.mediaStreamSource&&(this.mediaStreamSource.disconnect(),this.mediaStreamSource=null),this.audioTrack=e.getAudioTracks()[0];
        e=new MediaStream;
        e.addTrack(this.audioTrack),this.mediaStreamSource=this.audioContext.createMediaStreamSource(e),R.isSupportMediaStreamSource(t,this.audioContext)?R.isSupportAudioWorklet(this.audioContext)?this.audioWorkletNodeDealAudioData(this.mediaStreamSource,t):this.scriptNodeDealAudioData(this.mediaStreamSource,t):(this.isLog&&console.log(this.requestId,"不支持MediaStreamSource",k),this.OnError("不支持MediaStreamSource"));
    }
    getAudioFail(t,e){
        e&&e.err&&"NotAllowedError"===e.err.name&&this.isLog&&console.log(t,"授权失败",JSON.stringify(e.err),k),this.isLog&&console.log(this.requestId,"getAudioFail",JSON.stringify(e),k),this.OnError(e),this.stop();
    }
    scriptNodeDealAudioData(t,e){
        R.isSupportCreateScriptProcessor(e,this.audioContext)?(e=this.audioContext.createScriptProcessor(1024,1,1),this.mediaStreamSource&&this.mediaStreamSource.connect(e),e&&e.connect(this.audioContext.destination),e.onaudioprocess=t=>{this.getDataCount+=1;var t=x(O(t.inputBuffer.getChannelData(0),this.audioContext.sampleRate));this.audioData.push(...new Int8Array(t.buffer)),this.allAudioData.push(...new Int8Array(t.buffer)),1280<this.audioData.length&&(this.frameTime.push(Date.now()+"-"+this.frameCount),this.frameCount+=1,t=new Int8Array(this.audioData),this.OnReceivedData(t),this.audioData=[],this.sampleCount+=1,this.bitCount+=1)}):this.isLog&&console.log(this.requestId,"不支持createScriptProcessor",k);
    }
    async audioWorkletNodeDealAudioData(e,i){
        try{
            await this.audioContext.audioWorklet.addModule(v);
            var t=new AudioWorkletNode(this.audioContext,"my-processor",{numberOfInputs:1,numberOfOutputs:1,channelCount:1});
            t.onprocessorerror=t=>(this.scriptNodeDealAudioData(e,this.requestId),!1),t.port.onmessage=t=>{this.frameTime.push(Date.now()+"-"+this.frameCount),this.OnReceivedData(t.data.audioData),this.frameCount+=1,this.allAudioData.push(...t.data.audioData),this.sampleCount=t.data.sampleCount,this.bitCount=t.data.bitCount},t.port.onmessageerror=t=>(this.scriptNodeDealAudioData(e,i),!1),e&&e.connect(t).connect(this.audioContext.destination);
        }catch(t){
            this.isLog&&console.log(this.requestId,"audioWorkletNodeDealAudioData catch error",JSON.stringify(t),k),this.OnError(t);
        }
    }
    OnReceivedData(t){}
    OnError(t){}
    OnStop(t){}
}

"undefined"!=typeof window&&(window.WebRecorder=R);

// 暴露 WebAudioSpeechRecognizer 到全局作用域
if (typeof window !== 'undefined') {
    window.WebAudioSpeechRecognizer = class {
        constructor(t, e) {
            this.params = t;
            this.recorder = null;
            this.speechRecognizer = null;
            this.isCanSendData = false;
            this.isNormalEndStop = false;
            this.audioData = [];
            this.isLog = e;
            this.requestId = null;
        }
        start() {
            try {
                this.isLog && console.log("start function is click");
                this.requestId = S();
                this.recorder = new R(this.requestId, this.isLog);
                this.recorder.OnReceivedData = (t) => {
                    this.isCanSendData && this.speechRecognizer && this.speechRecognizer.write(t);
                };
                this.recorder.OnError = (t) => {
                    this.speechRecognizer && this.speechRecognizer.close();
                    this.stop();
                    this.OnError(t);
                };
                this.recorder.OnStop = (t) => {
                    this.speechRecognizer && this.speechRecognizer.stop();
                    this.OnRecorderStop(t);
                };
                this.recorder.start();
                this.speechRecognizer || (this.speechRecognizer = new w(this.params, this.requestId, this.isLog));
                this.speechRecognizer.OnRecognitionStart = (t) => {
                    this.recorder ? (this.OnRecognitionStart(t), this.isCanSendData = true) : this.speechRecognizer && this.speechRecognizer.close();
                };
                this.speechRecognizer.OnSentenceBegin = (t) => {
                    this.OnSentenceBegin(t);
                };
                this.speechRecognizer.OnRecognitionResultChange = (t) => {
                    this.OnRecognitionResultChange(t);
                };
                this.speechRecognizer.OnSentenceEnd = (t) => {
                    this.OnSentenceEnd(t);
                };
                this.speechRecognizer.OnRecognitionComplete = (t) => {
                    this.OnRecognitionComplete(t);
                    this.isCanSendData = false;
                    this.isNormalEndStop = true;
                };
                this.speechRecognizer.OnError = (t) => {
                    this.speechRecognizer && !this.isNormalEndStop && this.OnError(t);
                    this.speechRecognizer = null;
                    this.recorder && this.recorder.stop();
                    this.isCanSendData = false;
                };
                this.speechRecognizer.start();
            } catch (t) {
                console.log(t);
            }
        }
        stop() {
            this.isLog && console.log("stop function is click");
            this.recorder && this.recorder.stop();
        }
        destroyStream() {
            this.isLog && console.log("destroyStream function is click", this.recorder);
            this.recorder && this.recorder.destroyStream();
        }
        OnRecognitionStart(t) {}
        OnSentenceBegin(t) {}
        OnRecognitionResultChange() {}
        OnSentenceEnd() {}
        OnRecognitionComplete() {}
        OnError() {}
        OnRecorderStop() {}
    };
    console.log("WebAudioSpeechRecognizer 已暴露到全局");
} else {
    console.error("window 对象不存在，无法暴露 WebAudioSpeechRecognizer");
}
});
