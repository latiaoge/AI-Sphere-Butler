import asyncio
import uuid
import websockets
import multiprocessing
import queue

MAX_QUEUE_SIZE = 10

def enqueue_audio_data(audio_queue, data):
    try:
        
        audio_queue.put_nowait(data)
    except queue.Full:
        try:
            
            discarded = audio_queue.get_nowait()
            
        except queue.Empty:
            pass
        try:
           
            audio_queue.put_nowait(data)
        except queue.Full:
            
            pass

async def audio_handler(websocket, audio_queue: multiprocessing.Queue):
    session_id = str(uuid.uuid4())


    try:
        async for raw in websocket:
            if isinstance(raw, (bytes, bytearray)):
                enqueue_audio_data(audio_queue, (session_id, raw))

            else:

                pass
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:

        pass

async def run_server(audio_queue: multiprocessing.Queue, host='0.0.0.0', port=8020):
    async def handler(websocket):
        await audio_handler(websocket, audio_queue)

    server = await websockets.serve(handler, host, port)


    await asyncio.Future()

if __name__ == "__main__":

    q = multiprocessing.Queue(maxsize=MAX_QUEUE_SIZE)
    asyncio.run(run_server(q))
