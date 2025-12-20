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

# Original text part: "（轻笑一下）哈，其实这个评价..."
# Variations to test laughter generation
texts = [
    {
        "filename": "tim_test_laugh_bracket.mp3",
        "text": "[laugh]哈，其实这个评价我们内部复盘会的时候，大家也讨论过。坦率地说，我完全不难过，反而觉得这是一种肯定。"
    },
    {
        "filename": "tim_test_laugh_text.mp3",
        "text": "哈哈，其实这个评价我们内部复盘会的时候，大家也讨论过。坦率地说，我完全不难过，反而觉得这是一种肯定。"
    },
    {
        "filename": "tim_test_laugh_en.mp3",
        "text": "[laughter]哈，其实这个评价我们内部复盘会的时候，大家也讨论过。坦率地说，我完全不难过，反而觉得这是一种肯定。"
    },
     {
        "filename": "tim_test_laugh_cn.mp3",
        "text": "[笑声]哈，其实这个评价我们内部复盘会的时候，大家也讨论过。坦率地说，我完全不难过，反而觉得这是一种肯定。"
    }
]

def generate_audio(text, output_filename):
    print(f"Generating audio for: {output_filename}")
    
    payload = {
        "model": "speech-2.6-hd",
        "text": text,
        "stream": False,
        "voice_setting": {
            "voice_id": "tim_clone_v1",
            "speed": 1,
            "vol": 1,
            "pitch": 0
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
        
        # Check for error
        if data.get("base_resp", {}).get("status_code") != 0:
            print(f"API Error: {data.get('base_resp')}")
            return

        if "data" in data and "audio" in data["data"]:
             hex_audio = data["data"]["audio"]
             audio_bytes = bytes.fromhex(hex_audio)
             with open(output_filename, "wb") as f:
                 f.write(audio_bytes)
             print(f"Saved to {output_filename}")
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
            print(f"Found URL: {url}")
            r = requests.get(url)
            with open(output_filename, "wb") as f:
                f.write(r.content)
            print(f"Downloaded to {output_filename}")
        else:
            print("Unknown response format.")

    except Exception as e:
        print(f"Failed: {e}")

for item in texts:
    generate_audio(item["text"], item["filename"])
