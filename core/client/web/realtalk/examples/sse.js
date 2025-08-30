// sse.js
import { checkInternalNetwork } from './location.js';
import { triggerLocationEvent } from './location.js';
import { captureAndSendImage } from './imageCapture.js'; // 下面会写

export let eventSource = null;
const internalSseUrl = "https://192.168.1.70:5000/capture_events";
const externalSseUrl = "https://101.50.118.42:5000/capture_events";

export function initializeSSE() {
    if (eventSource) {
        console.log('SSE 连接已存在，无需重新初始化');
        return;
    }

    const isInternalNetwork = checkInternalNetwork();
    const primarySseUrl = isInternalNetwork ? internalSseUrl : externalSseUrl;
    const backupSseUrl = isInternalNetwork ? externalSseUrl : internalSseUrl;

    console.log(`当前网络环境: ${isInternalNetwork ? '内网' : '外网'}`);
    console.log(`尝试连接 SSE 地址: ${primarySseUrl}`);

    eventSource = new EventSource(primarySseUrl);

    eventSource.onopen = () => {
        console.log("SSE 连接已建立");
    };

    eventSource.onmessage = (event) => {
        console.log("收到服务器事件:", event.data);
        if (event.data === "capture_image") {
            captureAndSendImage();
        }
        if (event.data === "get_location") {
            console.log("触发获取位置逻辑");
            triggerLocationEvent();
        }
    };

    eventSource.onerror = (error) => {
        console.error("SSE 连接错误:", error);
        eventSource.close();

        console.log(`尝试备用 SSE 地址: ${backupSseUrl}`);
        const backupEventSource = new EventSource(backupSseUrl);

        backupEventSource.onopen = () => {
            console.log("备用 SSE 连接已建立");
        };

        backupEventSource.onmessage = (event) => {
            console.log("收到备用服务器事件:", event.data);
            if (event.data === "capture_image") {
                captureAndSendImage();
            }
            if (event.data === "get_location") {
                console.log("触发获取位置逻辑");
                triggerLocationEvent();
            }
        };

        backupEventSource.onerror = (error) => {
            console.error("备用 SSE 连接错误:", error);
            backupEventSource.close();
        };

        eventSource = backupEventSource;
    };
}
