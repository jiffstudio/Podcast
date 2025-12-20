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

# Define specific text for each emotion to demonstrate it better
emotion_scenarios = [
    {
        "emotion": "neutral",
        "text": "哈，其实这个评价我们内部复盘会的时候，大家也讨论过。"
    },
    {
        "emotion": "happy",
        "text": "哈哈，太好了！这正如我们所期待的那样，大家都非常开心。"
    },
    {
        "emotion": "sad",
        "text": "唉，其实看到那个评价的时候，心里还是挺难受的，毕竟付出了那么多。"
    },
    {
        "emotion": "angry",
        "text": "哼，这种毫无根据的指责，我完全无法接受！他们根本没看过我们的内容。"
    },
    {
        "emotion": "fearful",
        "text": "说实话，当时看到数据掉得那么厉害，我真的有点慌了，不知道该怎么办。"
    },
    {
        "emotion": "disgusted",
        "text": "啧，这种抄袭的手段也太低劣了，真是让人看不下去。"
    },
    {
        "emotion": "surprised",
        "text": "哇！真的吗？完全没想到会有这么好的反馈，太意外了！"
    },
    {
        "emotion": "calm",
        "text": "不管外界怎么评价，我们只需要专注于自己的节奏，把内容做好就行。"
    },
    {
        "emotion": "fluent",
        "text": "我们持续优化流程，确保每一期视频都能高效、稳定地输出高质量内容。"
    },
    {
        "emotion": "whisper",
        "text": "嘘，这是一个秘密，我们正在研发一个全新的项目，先别告诉别人。"
    }
]

def generate_audio(emotion, text, output_filename):
    print(f"Generating {output_filename} [{emotion}]: {text}")
    
    payload = {
        "model": "speech-2.6-hd",
        "text": text,
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
            return

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

for item in emotion_scenarios:
    filename = f"tim_emotion_{item['emotion']}_context.mp3"
    generate_audio(item['emotion'], item['text'], filename)
