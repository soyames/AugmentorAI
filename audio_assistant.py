#!/usr/bin/env python3
"""Ambient Audio Assistant — captures mic + system audio and streams to AugmentorAI.

This script runs on your HOST machine (not in container) because it needs
access to audio hardware via PyAudio.

Usage:
    pip install pyaudio websocket-client
    python3 audio_assistant.py [--server http://localhost:8010] [--session <id>]

Controls:
    Ctrl+C  — stop and exit
    'q'     — toggle quiet mode (don't send audio, just listen)
    'm'     — toggle mic only vs mic + system audio
"""
import argparse
import json
import os
import signal
import sys
import threading
import time
import uuid
from datetime import datetime

try:
    import pyaudio
    import websocket
except ImportError:
    print("Missing dependencies. Install: pip install pyaudio websocket-client")
    sys.exit(1)

# Audio constants
FORMAT = pyaudio.paInt16
CHANNELS = 1
RATE = 16000
CHUNK_DURATION_MS = 2000  # Send audio every 2 seconds
CHUNK_SIZE = int(RATE * CHUNK_DURATION_MS / 1000)
SILENCE_THRESHOLD = 300  # RMS threshold below which we consider it silence

# State
running = True
quiet_mode = False
capture_system = True  # True = mic + system, False = mic only
session_id = None
ws = None


def get_audio_devices():
    """List all available audio devices."""
    p = pyaudio.PyAudio()
    devices = []
    for i in range(p.get_device_count()):
        info = p.get_device_info_by_index(i)
        devices.append({
            "index": i,
            "name": info["name"],
            "max_inputs": info["maxInputChannels"],
            "max_outputs": info["maxOutputChannels"],
            "default_sample_rate": info["defaultSampleRate"],
        })
    p.terminate()
    return devices


def find_loopback_device(devices):
    """Find a system audio loopback device (for capturing speaker output)."""
    keywords = ["loopback", "monitor", "stereo mix", "what u hear", "wasapi"]
    for d in devices:
        name_lower = d["name"].lower()
        if any(kw in name_lower for kw in keywords) and d["max_inputs"] > 0:
            return d
    return None


def rms(data):
    """Compute RMS of audio data to detect silence."""
    import struct
    if len(data) < 2:
        return 0
    samples = struct.unpack(f"<{len(data)//2}h", data[:len(data) - len(data) % 2])
    if not samples:
        return 0
    sum_squares = sum(s * s for s in samples)
    return int((sum_squares / len(samples)) ** 0.5)


def audio_capture_thread(server_url, session_id):
    """Main audio capture loop - captures from mic + optionally system audio."""
    global running, quiet_mode, capture_system, ws

    p = pyaudio.PyAudio()
    devices = get_audio_devices()

    # Find input devices
    mic_device = None
    loopback_device = find_loopback_device(devices)

    # Use default input if no specific device chosen
    default_info = p.get_default_input_device_info()
    mic_device = default_info

    if loopback_device:
        print(f"  🎧 System audio: {loopback_device['name']} (index {loopback_device['index']})")
    else:
        print("  ⚠ No loopback device found — system audio capture unavailable")
        print("    On Windows: enable 'Stereo Mix' in Sound settings")
        print("    On Linux: install pulseaudio-utils, load module-loopback")
        print("    On Mac: install BlackHole or Loopback")
        capture_system = False

    print(f"  🎤 Mic: {mic_device['name']} (index {mic_device['index']})")

    # Open mic stream
    mic_stream = p.open(
        format=FORMAT, channels=CHANNELS, rate=RATE,
        input=True, input_device_index=mic_device["index"],
        frames_per_buffer=CHUNK_SIZE,
        stream_callback=None,
    )

    # Open loopback stream if available
    loopback_stream = None
    if capture_system and loopback_device:
        try:
            loopback_stream = p.open(
                format=FORMAT, channels=CHANNELS, rate=RATE,
                input=True, input_device_index=loopback_device["index"],
                frames_per_buffer=CHUNK_SIZE,
            )
        except Exception as e:
            print(f"  ⚠ Could not open loopback: {e}")
            capture_system = False

    print("\n✅ Audio capture started. Speak naturally — AI responds in real-time.")
    print("   Controls: Ctrl+C=stop, 'q'=toggle quiet, 'm'=toggle system audio\n")

    # Create WebSocket connection to server
    ws_url = server_url.replace("http://", "ws://").replace("https://", "wss://")
    ws_url = f"{ws_url}/ws/sessions/{session_id}/stream"

    try:
        ws = websocket.create_connection(ws_url, timeout=10)
        # Send config
        ws.send(json.dumps({"type": "config", "auto_generate": True, "language": "en"}))
        print(f"  🔗 Connected to {ws_url}")
    except Exception as e:
        print(f"  ❌ WebSocket connection failed: {e}")
        running = False
        p.terminate()
        return

    # Start listener thread for server responses
    def listen_thread():
        global ws
        while running:
            try:
                if ws:
                    msg = ws.recv()
                    if msg:
                        data = json.loads(msg)
                        if data.get("type") == "answer":
                            print(f"\n🤖 AI: {data['answer']['answer_text']}\n")
                        elif data.get("type") == "answer_chunk":
                            # Real-time token display
                            token = data.get("token", "")
                            print(token, end="", flush=True)
                        elif data.get("type") == "answer_error":
                            print(f"\n⚠️ Error: {data.get('error', 'Unknown')}\n")
            except websocket.WebSocketConnectionClosedException:
                break
            except Exception as e:
                if running:
                    print(f"\n⚠️ WS error: {e}\n")
                break

    listener = threading.Thread(target=listen_thread, daemon=True)
    listener.start()

    # Main capture loop
    silence_frames = 0
    VAD_SILENCE_FRAMES = 5  # Number of silent chunks before considering pause

    while running:
        try:
            # Read from mic
            mic_data = mic_stream.read(CHUNK_SIZE, exception_on_overflow=False)

            # Mix with loopback if enabled
            if capture_system and loopback_stream:
                try:
                    sys_data = loopback_stream.read(CHUNK_SIZE, exception_on_overflow=False)
                    # Mix by averaging samples
                    import struct
                    mic_samples = struct.unpack(f"<{len(mic_data)//2}h", mic_data)
                    sys_samples = struct.unpack(f"<{len(sys_data)//2}h", sys_data)
                    mixed = [(m + s) // 2 for m, s in zip(mic_samples, sys_samples)]
                    mic_data = struct.pack(f"<{len(mixed)}h", *mixed)
                except Exception:
                    pass

            # Voice activity detection
            level = rms(mic_data)
            is_silence = level < SILENCE_THRESHOLD

            if not quiet_mode:
                if is_silence:
                    silence_frames += 1
                else:
                    silence_frames = 0
                    # Send audio chunk to server
                    if ws and ws.connected:
                        try:
                            ws.send(mic_data, opcode=websocket.ABNF.OPCODE_BINARY)
                        except Exception:
                            pass

            time.sleep(0.01)  # Small yield to prevent CPU spike

        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"\n⚠️ Capture error: {e}")
            time.sleep(1)

    # Cleanup
    if ws:
        ws.close()
    mic_stream.close()
    if loopback_stream:
        loopback_stream.close()
    p.terminate()


def main():
    global session_id, running, quiet_mode, capture_system

    parser = argparse.ArgumentParser(description="Ambient Audio Assistant - AugmentorAI")
    parser.add_argument("--server", default="http://localhost:8010", help="AugmentorAI server URL")
    parser.add_argument("--session", help="Session ID (creates new if not provided)")
    parser.add_argument("--list-devices", action="store_true", help="List audio devices and exit")
    args = parser.parse_args()

    if args.list_devices:
        devices = get_audio_devices()
        print("\nAvailable audio devices:")
        for d in devices:
            io = []
            if d["max_inputs"] > 0:
                io.append("IN")
            if d["max_outputs"] > 0:
                io.append("OUT")
            print(f"  [{d['index']}] {d['name']} ({'/'.join(io)}) @ {d['default_sample_rate']:.0f}Hz")
        return

    server_url = args.server.rstrip("/")

    # Create or use session
    import urllib.request
    if args.session:
        session_id = args.session
    else:
        try:
            req = urllib.request.Request(
                f"{server_url}/api/sessions",
                data=json.dumps({"title": f"Conversation {datetime.now().strftime('%Y-%m-%d %H:%M')}",
                                  "mode": "conversation", "language": "en"}).encode(),
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read())
                session_id = data["id"]
                print(f"📝 Created session: {session_id}")
        except Exception as e:
            print(f"❌ Could not create session: {e}")
            print(f"   Make sure AugmentorAI server is running at {server_url}")
            sys.exit(1)

    print(f"\n🎙️  Ambient Audio Assistant")
    print(f"   Server: {server_url}")
    print(f"   Session: {session_id}")
    print(f"   Capture: Mic + System Audio")
    print(f"   Language: English")
    print()

    audio_capture_thread(server_url, session_id)


if __name__ == "__main__":
    main()
