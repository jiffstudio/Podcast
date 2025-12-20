import os
import requests
import json
from dotenv import load_dotenv

load_dotenv()
api_key = os.getenv("MINIMAX_API_KEY")

if not api_key:
    print("Error: MINIMAX_API_KEY not found.")
    exit(1)

URL = "https://api.minimaxi.com/v1/t2a_v2"
HEADERS = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json"
}

# Short text for testing emotions
text_short = "哈，其实这个评价我们内部复盘会的时候，大家也讨论过。"

# List of emotions from documentation/search
emotions = [
    "neutral",
    "happy",
    "sad",
    "angry",
    "fearful",
    "disgusted",
    "surprised",
    "calm",
    "fluent",
    "whisper"
]

def generate_audio(emotion, output_filename):
    print(f"Generating {output_filename} with emotion '{emotion}'...")
    
    payload = {
        "model": "speech-2.6-hd",
        "text": text_short,
        "stream": False,
        "voice_setting": {
            "voice_id": "tim_clone_v1",
            "speed": 1,
            "vol": 1,
            "pitch": 0,
            "emotion": emotion
        },
        "audio_setting": {
            "sample_rate": 32000,
            "bitrate": 128000,
            "format": "mp3",
            "channel": 1
        }
    }
    
    try:
        response = requests.post(URL, headers=HEADERS, json=payload)
        response.raise_for_status()
        
        data = response.json()
        
        if data.get("base_resp", {}).get("status_code") != 0:
            print(f"API Error for {emotion}: {data.get('base_resp')}")
            # Continue to next emotion even if one fails
            return

        # Handle output (URL or hex)
        if "data" in data and "audio" in data["data"]:
             hex_audio = data["data"]["audio"]
             audio_bytes = bytes.fromhex(hex_audio)
             with open(output_filename, "wb") as f:
                 f.write(audio_bytes)
             print(f"Success: {output_filename}")
             return

        def find_url(obj):
            if isinstance(obj, str):
                if obj.startswith("http") and (".mp3" in obj or ".wav" in obj):
                    return obj
            elif isinstance(obj, dict):
                for k, v in obj.items():
                    if k in ["url", "audio_file", "file_url", "audio_url"]:
                         if isinstance(v, str) and v.startswith("http"):
                             return v
                    res = find_url(v)
                    if res: return res
            return None
            
        url = find_url(data)
        if url:
            r = requests.get(url)
            with open(output_filename, "wb") as f:
                f.write(r.content)
            print(f"Success: {output_filename}")
        else:
            print(f"Unknown format for {emotion}")

    except Exception as e:
        print(f"Failed {emotion}: {e}")

for em in emotions:
    filename = f"tim_test_emotion_{em}.mp3"
    generate_audio(em, filename)
