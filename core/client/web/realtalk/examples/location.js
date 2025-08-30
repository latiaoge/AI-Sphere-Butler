// location.js

let isLocationRequestPending = false;

export function triggerLocationEvent() {
    console.log("准备触发 trigger-event 事件");
    window.dispatchEvent(new CustomEvent("trigger-event", {
        detail: "get_location"
    }));
}

export function getLocation() {
    console.log("getLocation 函数被调用");
    if (isLocationRequestPending) {
        console.log("已有位置请求正在进行，跳过本次调用");
        return;
    }

    if (navigator.geolocation) {
        console.log("浏览器支持地理位置功能，正在获取位置...");
        isLocationRequestPending = true;

        navigator.geolocation.getCurrentPosition(
            (position) => {
                console.log("成功获取位置信息");
                const latitude = position.coords.latitude;
                const longitude = position.coords.longitude;
                console.log(`获取到地理位置 - 纬度: ${latitude}, 经度: ${longitude}`);
                sendLocationToBackend(latitude, longitude);
            },
            (error) => {
                console.error("获取地理位置失败: " + error.message);
                isLocationRequestPending = false;
            },
            {
                enableHighAccuracy: true,
                timeout: 30000,
                maximumAge: 0
            }
        );
    } else {
        console.error("您的浏览器不支持地理位置功能。");
    }
}

export function sendLocationToBackend(latitude, longitude) {
    const payload = { latitude, longitude };
    console.log("发送的请求体:", payload);

    const apiUrl = checkInternalNetwork()
        ? 'https://192.168.1.70:5000/api/location'
        : 'https://101.60.112.62:5000/api/location';

    console.log("发送请求到:", apiUrl);

    fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    })
    .then(response => {
        console.log("响应状态码:", response.status);
        if (!response.ok) throw new Error(`HTTP 错误: ${response.status}`);
        return response.json();
    })
    .then(data => {
        console.log("后端返回结果: " + JSON.stringify(data));
    })
    .catch(error => {
        console.error("发送位置到后端失败: " + error.message);
    })
    .finally(() => {
        isLocationRequestPending = false;
    });
}

export function checkInternalNetwork() {
    const internalIPRanges = [
        /^192\.168\.\d{1,3}\.\d{1,3}$/,
        /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
        /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/
    ];
    const currentHostname = window.location.hostname;
    return internalIPRanges.some(range => range.test(currentHostname));
}

// 绑定 trigger-event 监听，放到此模块初始化函数调用
export function bindLocationEventListener() {
    window.addEventListener("trigger-event", (event) => {
        console.log("收到 trigger-event 事件:", event);
        if (event.detail === "get_location") {
            console.log("触发获取位置逻辑");
            getLocation();
        }
    });
}
