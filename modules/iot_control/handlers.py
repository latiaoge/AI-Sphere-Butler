from fastapi import FastAPI, HTTPException, Request
import paho.mqtt.client as mqtt

app = FastAPI()

# MQTT 配置
MQTT_BROKER = "localhost"
MQTT_PORT = 1883
MQTT_TOPIC_PREFIX = "home/devices/"

# 模拟的设备状态存储
device_states = {
    "light": {"status": "off"},
    "thermostat": {"status": "off", "temperature": 22}
}

# MQTT 客户端
mqtt_client = mqtt.Client()

def on_connect(client, userdata, flags, rc):
    print("Connected to MQTT Broker!" if rc == 0 else f"Failed to connect, return code {rc}")

mqtt_client.on_connect = on_connect
mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
mqtt_client.loop_start()

@app.get("/devices/{device_name}")
async def get_device_status(device_name: str):
    """获取设备状态"""
    if device_name not in device_states:
        raise HTTPException(status_code=404, detail=f"设备 {device_name} 未找到")
    return {"device_name": device_name, "state": device_states[device_name]}

@app.post("/devices/{device_name}")
async def control_device(device_name: str, request: Request):
    """控制设备"""
    if device_name not in device_states:
        raise HTTPException(status_code=404, detail=f"设备 {device_name} 未找到")
    
    payload = await request.json()
    device_state = device_states[device_name]

    # 根据设备类型处理逻辑
    if device_name == "light":
        if "status" in payload:
            device_state["status"] = payload["status"]
            mqtt_client.publish(f"{MQTT_TOPIC_PREFIX}light", payload["status"])
        else:
            raise HTTPException(status_code=400, detail="缺少 'status' 参数")
    
    elif device_name == "thermostat":
        if "status" in payload:
            device_state["status"] = payload["status"]
        if "temperature" in payload:
            device_state["temperature"] = payload["temperature"]
        mqtt_client.publish(f"{MQTT_TOPIC_PREFIX}thermostat", str(payload))
    
    return {"device_name": device_name, "new_state": device_state}

@app.on_event("shutdown")
def shutdown():
    mqtt_client.loop_stop()
    mqtt_client.disconnect()

@app.get("/")
async def root():
    return {"message": "智能家居控制模块"}
