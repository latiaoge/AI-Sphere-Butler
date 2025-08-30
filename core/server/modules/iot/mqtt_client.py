import paho.mqtt.client as mqtt
from loguru import logger

MQTT_BROKER = '192.168.1.99'
MQTT_PORT = 1883
MQTT_USER = '123'
MQTT_PASSWORD = '1234'
MQTT_TOPIC = 'fg'

mqtt_client = mqtt.Client()

def mqtt_connect():
    try:
        mqtt_client.username_pw_set(MQTT_USER, MQTT_PASSWORD)
        mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
        mqtt_client.loop_start()
        logger.info("连接到 MQTT 代理成功")
        result, mid = mqtt_client.subscribe(MQTT_TOPIC, qos=1)
        if result == mqtt.MQTT_ERR_SUCCESS:
            logger.info(f"订阅成功: mid={mid}")
        else:
            logger.error(f"订阅失败: result={result}")
    except Exception as e:
        logger.error(f"MQTT 连接失败: {e}")
        raise e

def publish(message: str):
    if mqtt_client.is_connected():
        logger.debug(f"发布消息到 {MQTT_TOPIC}: {message}")
        result = mqtt_client.publish(MQTT_TOPIC, message, qos=1)
        if result[0] != 0:
            logger.error(f"发布失败，错误码: {result[0]}")
    else:
        logger.error("MQTT 未连接")

def disconnect():
    if mqtt_client.is_connected():
        mqtt_client.loop_stop()
        mqtt_client.disconnect()
        logger.info("MQTT 已断开连接")
