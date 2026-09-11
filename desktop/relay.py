"""Native messaging transport only. Inference runs in the full Electron app."""
import json
import socket
import struct
import subprocess
import sys
import time
import threading
from pathlib import Path
from opencc import OpenCC

SUPPORT = Path.home() / 'Library/Application Support/JapaneseLiveCaption'

def main():
    traditional = OpenCC('s2twp')
    connection = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    path = str(SUPPORT / 'desktop.sock')
    try:
        connection.connect(path)
    except OSError:
        config = json.loads((SUPPORT / 'app.json').read_text())
        with (SUPPORT / 'app.log').open('ab') as log:
            subprocess.Popen([config['executable'], '--jtl-companion'], stdin=subprocess.DEVNULL,
                             stdout=log, stderr=log, start_new_session=True)
        deadline = time.monotonic() + 30
        while True:
            try:
                connection.connect(path)
                break
            except OSError:
                if time.monotonic() >= deadline:
                    raise RuntimeError('Desktop app did not start; inspect app.log')
                time.sleep(.2)
    output = sys.stdout.buffer
    directions = {}
    def requests():
        try:
            while True:
                header = sys.stdin.buffer.read(4)
                if not header:
                    break
                if len(header) != 4:
                    raise ValueError('Truncated native header')
                size = struct.unpack('<I', header)[0]
                if size > 2_000_000:
                    raise ValueError('Native request too large')
                payload = sys.stdin.buffer.read(size)
                if len(payload) != size:
                    raise ValueError('Truncated native request')
                message = json.loads(payload)
                directions[message['id']] = message.get('direction', 'ja-zh')
                connection.sendall(json.dumps(message).encode() + b'\n')
        finally:
            connection.shutdown(socket.SHUT_RDWR)
    threading.Thread(target=requests, daemon=True).start()
    try:
        with connection.makefile('rb') as stream:
            while True:
                line = stream.readline(2_000_001)
                if not line:
                    break
                if len(line) > 2_000_000:
                    raise ValueError('Desktop response too large')
                reply = json.loads(line)
                result = reply.get('result')
                if isinstance(result, dict):
                    if isinstance(result.get('translated'), str):
                        result['translated'] = traditional.convert(result['translated'])
                    if not reply.get('event') and directions.get(reply.get('id')) == 'ja-zh' and isinstance(result.get('text'), str) and 'translated' not in result:
                        result['text'] = traditional.convert(result['text'])
                if not reply.get('event'):
                    directions.pop(reply.get('id'), None)
                data = json.dumps(reply, ensure_ascii=False).encode()
                output.write(struct.pack('<I', len(data)) + data)
                output.flush()
    finally:
        connection.close()

if __name__ == '__main__':
    main()
