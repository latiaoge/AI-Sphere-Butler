let recorder;
let speechRecognizer;
let isCanSendData = false;
let isCanStop;

$(function () {
    const params = {
        signCallback: signCallback, // 鉴权函数 用户提供鉴权函数，不传则为null
        // 用户参数
        secretid:  config.secretId,
        appid: config.appId,
        // 实时识别接口参数
        engine_model_type : '16k_zh', // 引擎
        voice_format : 1,
        // 以下为非必填参数，可跟据业务自行修改
        hotword_id : '08003a00000000000000000000000000',
        needvad: 1,
        filter_dirty: 1,
        filter_modal: 1,
        filter_punc: 1,
        convert_num_mode : 1,
        word_info: 2
    }
    $('#start').on('click', function () {
        const areaDom = $('#recognizeText');
        let resultText = '';
        $(this).hide();
        $('#connecting').show();
        speechRecognizer = null;
        isCanSendData = false;
        // 获取录音数据
        recorder = new WebRecorder();
        recorder.OnReceivedData = (res) => {
          // console.log(res) // res 为采集到浏览器数据
          if (isCanSendData) {
            // 发送数据
            speechRecognizer.write(res);
          }
        };
        // 录音失败时
        recorder.OnError = (err) => {
          console.log(err);
          recorder.stop();
        };
        recorder.start();

      if (!speechRecognizer) {
        speechRecognizer = new SpeechRecognizer(params);
      }

      // 开始识别
      speechRecognizer.OnRecognitionStart = (res) => {
        console.log('开始识别', res);
        isCanSendData = true;
        isCanStop = true;
        $('#connecting').hide();
        $('#end').show();
        $('#recognizing').show();
      };
      // 一句话开始
      speechRecognizer.OnSentenceBegin = (res) => {
        console.log('一句话开始', res);
      };
      // 识别变化时
      speechRecognizer.OnRecognitionResultChange = (res) => {
        console.log('识别变化时', res);
        const currentText = `${resultText}${res.result.voice_text_str}`;
        areaDom.text(currentText);
      };
      // 一句话结束
      speechRecognizer.OnSentenceEnd = (res) => {
        console.log('一句话结束', res);
        resultText += res.result.voice_text_str;
        areaDom.text(resultText);
      };
      // 识别结束
      speechRecognizer.OnRecognitionComplete = (res) => {
        console.log('识别结束', res);
        isCanSendData = false;
      };
      // 识别错误
      speechRecognizer.OnError = (res) => {
        console.log('识别失败', res);
        isCanSendData = false;

        $('#end').hide();
        $('#recognizing').hide();
        $('#connecting').hide();
        $('#start').show();
      };

      // 建立连接
      speechRecognizer.start();

    });
    $('#end').on('click', function () {
        $(this).hide();
        $('#start').show();
        $('#recognizing').hide();
        recorder.stop();
        if (isCanStop) {
          speechRecognizer.stop();
        }
    });
});
