var pc = null;

function negotiate() {
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });
    return pc.createOffer().then((offer) => {
        return pc.setLocalDescription(offer);
    }).then(() => {
        // wait for ICE gathering to complete
        return new Promise((resolve) => {
            if (pc.iceGatheringState === 'complete') {
                resolve();
            } else {
                const checkState = () => {
                    if (pc.iceGatheringState === 'complete') {
                        pc.removeEventListener('icegatheringstatechange', checkState);
                        resolve();
                    }
                };
                pc.addEventListener('icegatheringstatechange', checkState);
            }
        });
    }).then(() => {
        var offer = pc.localDescription;
        return fetch('/offer', {
            body: JSON.stringify({
                sdp: offer.sdp,
                type: offer.type,
            }),
            headers: {
                'Content-Type': 'application/json'
            },
            method: 'POST'
        });
    }).then((response) => {
        return response.json();
    }).then((answer) => {
        document.getElementById('sessionid').value = answer.sessionid;
        return pc.setRemoteDescription(answer);
    }).catch((e) => {
        alert(e);
    });
}

function start() {
    var config = {
        sdpSemantics: 'unified-plan'
    };

    if (document.getElementById('use-stun').checked) {
        config.iceServers = [{ urls: ['stun:stun.l.google.com:19302'] }];
    }

    pc = new RTCPeerConnection(config);

    // connect audio / video
    pc.addEventListener('track', (evt) => {
        if (evt.track.kind == 'video') {
            document.getElementById('video').srcObject = evt.streams[0];
        } else {
            document.getElementById('audio').srcObject = evt.streams[0];
        }
    });

    document.getElementById('start').style.display = 'none';
    negotiate();
    document.getElementById('stop').style.display = 'inline-block';

    // 初始化视频缩放
    initVideoZoom();
}

function stop() {
    document.getElementById('stop').style.display = 'none';

    // close peer connection
    setTimeout(() => {
        pc.close();
    }, 500);
}

// 视频缩放功能
function initVideoZoom() {
    const video = document.getElementById('video');
    const zoomInButton = document.getElementById('zoom-in');
    const zoomOutButton = document.getElementById('zoom-out');

    let initialWidth = 600; // 初始宽度
    let initialHeight = 450; // 初始高度（根据视频的宽高比计算）
    let zoomStep = 50; // 每次缩放的步长

    // 设置初始尺寸
    video.style.width = initialWidth + 'px';
    video.style.height = initialHeight + 'px';

    // 放大按钮点击事件
    zoomInButton.addEventListener('click', () => {
        let currentWidth = parseInt(video.style.width);
        let newWidth = currentWidth + zoomStep;
        video.style.width = newWidth + 'px';
        video.style.height = (newWidth * (initialHeight / initialWidth)) + 'px'; // 保持宽高比
    });

    // 缩小按钮点击事件
    zoomOutButton.addEventListener('click', () => {
        let currentWidth = parseInt(video.style.width);
        let newWidth = currentWidth - zoomStep;
        if (newWidth > 0) { // 确保宽度不会小于0
            video.style.width = newWidth + 'px';
            video.style.height = (newWidth * (initialHeight / initialWidth)) + 'px'; // 保持宽高比
        }
    });
}

// 监听表单提交事件
document.getElementById('echo-form').addEventListener('submit', function(event) {
    event.preventDefault(); // 阻止表单默认刷新

    const message = document.getElementById('message').value;

    fetch('https://192.168.1.70:6010/qwener', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: message }),
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('网络响应失败，状态码: ' + response.status);
        }
        return response.json();
    })
    .then(data => {
        // 不弹窗，改用控制台打印
        console.log('发送成功，服务器返回：', data);
    })
    .catch(error => {
        // 发送失败也不弹窗，只记录错误
        console.error('发送失败：', error);
    });
});
