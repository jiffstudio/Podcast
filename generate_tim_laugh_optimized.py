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

# Full text from user query
full_text_raw = "（轻笑一下）哈，其实这个评价我们内部复盘会的时候，大家也讨论过。坦率地说，我完全不难过，反而觉得这是一种肯定。其实我们要看这背后的逻辑： 所谓的‘灵气’往往意味着不可控和低效率。当你只有几万粉丝的时候，你可以靠灵光一现。但当我们要支撑一个几十人的团队，要稳定输出最高标准的内容时，我们必须依赖‘工业化’。很多人觉得‘工业’这个词很冷冰冰，但我个人觉得，能把美感和创意流程化，这才是更高级的审美。 就像保时捷的生产线，它也是工业，但它依然很酷，对吧？我当然怀念早期那种随性，但既然选择了往我们所期待的那个维度去冲，就必须舍弃一些低效率的东西。无限进步的代价，往往就是我们要从‘艺术家’变成‘系统构建者’。 我们还在寻找那个平衡点，希望能做得更好。"

# Remove the stage direction
text_body = full_text_raw.replace("（轻笑一下）", "")

# Scenarios to test
scenarios = [
    {
        "filename": "tim_full_happy_ha.mp3",
        "text": "哈，" + text_body, # Add "Ha" at start
        "emotion": "happy"
    },
    {
        "filename": "tim_full_happy_hehe.mp3",
        "text": "呵呵，" + text_body, # Add "Hehe" at start
        "emotion": "happy"
    }
]

def generate_audio(text, emotion, output_filename):
    print(f"Generating audio for: {output_filename} with emotion '{emotion}'")
    
    payload = {
        "model": "speech-2.6-hd",
        "text": text,
        "stream": False,
        "voice_setting": {
            "voice_id": "tim_clone_v1",
            "speed": 1,
            "vol": 1,
            "pitch": 0,
            "emotion": emotion # Setting emotion explicitly
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
            print(f"API Error: {data.get('base_resp')}")
            return

        # Try to find URL first (preferred for T2A V2?) or hex
        # Logic: check URL, then check hex
        
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
            print(f"Saved to {output_filename}")
            return

        # Fallback to hex
        if "data" in data and "audio" in data["data"]:
             hex_audio = data["data"]["audio"]
             audio_bytes = bytes.fromhex(hex_audio)
             with open(output_filename, "wb") as f:
                 f.write(audio_bytes)
             print(f"Saved to {output_filename} (from hex)")
             return
            
        print("Unknown response format.")

    except Exception as e:
        print(f"Failed: {e}")

for item in scenarios:
    generate_audio(item["text"], item["emotion"], item["filename"])
