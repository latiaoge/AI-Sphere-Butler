$(function () {
  let webAudioSpeechRecognizer;
  let isCanStop;
  let startTime = 0;
  let sendText = '';
  let write = 0;

  const params = {
      signCallback: signCallback,
      secretid: config.secretId,
      secretkey: config.secretKey,
      appid: config.appId,
      engine_model_type: '16k_zh'
  };

  $('#start').on("touchstart", function () {
      $('.edit-box').attr('placeholder', "松开发送");
      write = 1;
      startRecognition();
  });

  $('#start').on("touchend", function () {
      $('.edit-box').attr('placeholder', "按住说话");
      write = 0;
      if (isCanStop) {
          webAudioSpeechRecognizer.stop();
      }
  });

  function startRecognition() {
      webAudioSpeechRecognizer = new WebAudioSpeechRecognizer(params);
      const areaDom = $('#recognizeText');
      let resultText = '';

      webAudioSpeechRecognizer.OnRecognitionStart = (res) => {
          console.log('开始识别', res);
      };

      webAudioSpeechRecognizer.OnSentenceBegin = (res) => {
          console.log('一句话开始', res);
          isCanStop = true;
      };

      webAudioSpeechRecognizer.OnRecognitionResultChange = (res) => {
          console.log('识别变化时', res);
          const currentText = `${resultText}${res.result.voice_text_str}`;
          if (write == 1) {
              areaDom.text(currentText);
          }
      };

      webAudioSpeechRecognizer.OnSentenceEnd = (res) => {
          console.log('一句话结束', res);
          resultText += res.result.voice_text_str;
          areaDom.text(resultText);
          sendToServer(resultText);
          // Reset for the next sentence
          resultText = '';
      };

      webAudioSpeechRecognizer.OnRecognitionComplete = (res) => {
          console.log('识别结束', res);
      };

      webAudioSpeechRecognizer.OnError = (res) => {
          console.log('识别失败', res);
          $('#recognizing').hide();
          $('#start').show();
      };

      webAudioSpeechRecognizer.start();
  }

  function sendToServer(text) {
      let xhr = new XMLHttpRequest();
      xhr.open("POST", "http://127.0.0.1:6010/qwener", true);
      xhr.setRequestHeader("Content-Type", "application/json");
      var data = JSON.stringify({
          text: text,
          type: 'echo',
          interrupt: true,
          sessionid: 0
      });
      xhr.send(data);
      xhr.onreadystatechange = function () {
          if (xhr.readyState == 4 && xhr.status == 200) {
              console.log(xhr.responseText);
          } else if (xhr.status != 200) {
              console.log('请求失败', xhr.status);
          }
      };
  }

  // 自动启动识别
  startRecognition();
});
