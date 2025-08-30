import '../examples/lib/cryptojs.js';

// 识别需要过滤的参数
const needFiltrationParams = ['appid', 'secretkey', 'signCallback'];

function formatSignString(query, params){
    let strParam = "";
    let signStr = "asr.cloud.tencent.com/asr/v2/";
    if(query['appid']){
        signStr += query['appid'];
    }
    const keys = Object.keys(params);
    keys.sort();
    for (let i = 0, len = keys.length; i < len; i++) {
        strParam += `&${keys[i]}=${params[keys[i]]}`;
    }
    return `${signStr}?${strParam.slice(1)}`;
}
async function createQuery(query){
    let params = {};
    const time = new Date().getTime();

    async function getServerTime(){
        return new Promise((resolve, reject)=>{
            try {
                const xhr = new XMLHttpRequest();
                xhr.open("GET", 'https://asr.cloud.tencent.com/server_time', true);
                xhr.send();
                xhr.onreadystatechange = function () {
                    if (xhr.readyState === 4 && xhr.status === 200) {
                        resolve(xhr.responseText);
                    }
                }
            } catch (error) {
                reject(error);
            }
        })
    }
    const serverTime = await getServerTime();
    params['secretid'] = query.secretid || '';
    params['engine_model_type'] = query.engine_model_type || '16k_zh';
    params['timestamp'] = parseInt(serverTime) || Math.round(time / 1000);
    params['expired'] = Math.round(time / 1000) + 24 * 60 * 60;
    params['nonce'] = Math.round(time / 100000);
    params['voice_id'] = guid();
    params['voice_format'] = query.voice_format || 1;

    const tempQuery = { ...query };
    for (let i = 0, len = needFiltrationParams.length; i < len; i++) {
        if (tempQuery.hasOwnProperty(needFiltrationParams[i])) {
            delete tempQuery[needFiltrationParams[i]];
        }
    }

    params = {
        ...tempQuery,
        ...params,
    };
    return params;
}

export const guid = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0,
            v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};
// 获取签名原文
async function getUrl(self, params) {
    if (!params.appid || !params.secretid) {
        self.isLog && console.log(self.requestId, '请确认是否填入账号信息', TAG);
        self.OnError('请确认是否填入账号信息');
        return false;
    }
    const urlQuery = await createQuery(params);
    const queryStr = formatSignString(params, urlQuery);
    let signature = '';
    if (params.signCallback) {
        signature = params.signCallback(queryStr);
    } else {
        signature = signCallback(params.secretkey, queryStr);
    }
    return `wss://${queryStr}&signature=${encodeURIComponent(signature)}`;
}
/** 获取签名 start */

function toUint8Array(wordArray) {
    // Shortcuts
    const words = wordArray.words;
    const sigBytes = wordArray.sigBytes;

    // Convert
    const u8 = new Uint8Array(sigBytes);
    for (let i = 0; i < sigBytes; i++) {
        u8[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
    }
    return u8;
}

function Uint8ArrayToString(fileData){
    let dataString = '';
    for (let i = 0; i < fileData.length; i++) {
        dataString += String.fromCharCode(fileData[i]);
    }
    return dataString;
}
// 签名函数示例
function signCallback(secretKey, signStr) {
    const hash = window.CryptoJSTest.HmacSHA1(signStr, secretKey);
    const bytes = Uint8ArrayToString(toUint8Array(hash));
    return window.btoa(bytes);
}

/** 获取签名 end */

const TAG = 'SpeechRecognizer';
export class SpeechRecognizer {
    constructor(params, requestId, isLog) {
        this.socket = null;
        this.isSignSuccess = false; // 是否鉴权成功
        this.isSentenceBegin = false; // 是否一句话开始
        this.query = {
            ...params
        };
        this.isRecognizeComplete = false; // 当前是否识别结束
        this.requestId = requestId;
        this.isLog = isLog;
        this.sendCount = 0;
        this.getMessageList = [];
    }
    // 暂停识别，关闭连接
    stop() {
        if (this.socket && this.socket.readyState === 1) {
            this.socket.send(JSON.stringify({type: 'end'}));
            this.isRecognizeComplete = true;
        } else {
            // this.OnError({ code : 6003, message: '连接未建立或连接已关闭' });
            if (this.socket && this.socket.readyState === 1) {
                this.socket.close();
            }
        }
    }
    // 建立websocket链接 data 为用户收集的音频数据
    async start(){
        this.socket = null;
        this.getMessageList = [];
        const url = await getUrl(this, this.query);
        if (!url) {
            this.isLog && console.log(this.requestId, '鉴权失败', TAG);
            this.OnError('鉴权失败');
            return
        }
        this.isLog && console.log(this.requestId, 'get ws url', url, TAG);
        if ('WebSocket' in window) {
            this.socket = new WebSocket(url);
        } else if ('MozWebSocket' in window) {
            this.socket = new MozWebSocket(url);
        } else {
            this.isLog && console.log(this.requestId, '浏览器不支持WebSocket', TAG);
            this.OnError('浏览器不支持WebSocket');
            return
        }
        this.socket.onopen = (e) => { // 连接建立时触发
            this.isLog && console.log(this.requestId, '连接建立', e, TAG);
        };
        this.socket.onmessage = async (e) => { // 连接建立时触发
            try {
                this.getMessageList.push(JSON.stringify(e));
                const response = JSON.parse(e.data);
                if (response.code !== 0) {
                    if (this.socket.readyState === 1) {
                        this.socket.close();
                    }
                    this.isLog && console.log(this.requestId, JSON.stringify(response), TAG);
                    this.OnError(response);
                } else {
                    if (!this.isSignSuccess) {
                        this.OnRecognitionStart(response);
                        this.isSignSuccess = true;
                    }
                    if (response.final === 1) {
                        this.OnRecognitionComplete(response);
                        return;
                    }
                    if (response.result) {
                        if (response.result.slice_type === 0) {
                            this.OnSentenceBegin(response);
                            this.isSentenceBegin = true;
                        } else  if (response.result.slice_type === 2) {
                            if (!this.isSentenceBegin) {
                                this.OnSentenceBegin(response);
                            }
                            this.OnSentenceEnd(response);
                        } else {
                            this.OnRecognitionResultChange(response);
                        }
                    }
                    this.isLog && console.log(this.requestId, response, TAG);
                }
            } catch (e) {
                this.isLog && console.log(this.requestId, 'socket.onmessage catch error', JSON.stringify(e), TAG);
            }

        };
        this.socket.onerror = (e) => { // 通信发生错误时触发
            this.isLog && console.log(this.requestId, 'socket error callback', e, TAG);
            this.socket.close();
            this.OnError(e);
        }
        this.socket.onclose = (event) => {
            try {
                if (!this.isRecognizeComplete) {
                    this.isLog && console.log(this.requestId, 'socket is close and error', JSON.stringify(event), TAG);
                    this.OnError(event);
                }
            } catch (e) {
                this.isLog && console.log(this.requestId, 'socket is onclose catch' + this.sendCount, JSON.stringify(e), TAG);
            }
        }
    }
    close() {
        this.socket && this.socket.close(1000);
    }
    // 发送数据
    write(data) {
        try {
            if (!this.socket || String(this.socket.readyState) !== '1') {
                setTimeout(() => {
                    if (!this.socket || this.socket.readyState !== 1) {
                        this.socket.send(data);
                    }
                }, 40);
                // this.OnError({ code : 6001, message: '连接未建立，请稍后发送数据！' });
            }
            this.sendCount += 1;
            this.socket.send(data);
        } catch (e) {
            this.isLog && console.log(this.requestId , '发送数据 error catch', e,  TAG);
        }
    };
    // 开始识别的时候
    OnRecognitionStart(res) {

    }
    // 一句话开始的时候
    OnSentenceBegin(res) {

    }
    // 识别结果发生变化的时候
    OnRecognitionResultChange() {

    }
    // 一句话结束的时候
    OnSentenceEnd() {

    }
    // 识别结束的时候
    OnRecognitionComplete() {

    }
    // 识别失败
    OnError() {

    }
}
typeof window !== 'undefined' && (window.SpeechRecognizer = SpeechRecognizer);
