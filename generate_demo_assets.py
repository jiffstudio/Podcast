import os
import requests
import json
import time
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Use the key from environment variable
api_key = os.getenv("MINIMAX_API_KEY")

if not api_key:
    print("Error: MINIMAX_API_KEY not found in environment variables.")
    exit(1)

UPLOAD_URL = "https://api.minimaxi.com/v1/files/upload"
CLONE_URL = "https://api.minimaxi.com/v1/voice_clone"

HEADERS = {
    "Authorization": f"Bearer {api_key}",
}

def upload_file(file_path, purpose="voice_clone"):
    print(f"Uploading {file_path} for {purpose}...")
    if not os.path.exists(file_path):
        print(f"File not found: {file_path}")
        return None

    with open(file_path, "rb") as f:
        files = {"file": (os.path.basename(file_path), f)}
        data = {"purpose": purpose}
        try:
            response = requests.post(UPLOAD_URL, headers=HEADERS, data=data, files=files)
            response.raise_for_status()
            result = response.json()
            file_id = result.get("file", {}).get("file_id")
            print(f"Upload successful. File ID: {file_id}")
            return file_id
        except Exception as e:
            print(f"Error uploading file: {e}")
            if 'response' in locals():
                print(f"Response: {response.text}")
            return None

def clone_voice(file_id, voice_id, text):
    print(f"Cloning voice {voice_id} and generating speech...")
    
    payload = {
        "file_id": file_id,
        "voice_id": voice_id,
        "text": text,
        "model": "speech-2.6-hd"
    }
    
    headers = HEADERS.copy()
    headers["Content-Type"] = "application/json"
    
    try:
        response = requests.post(CLONE_URL, headers=headers, json=payload)
        response.raise_for_status()
        
        try:
            data = response.json()
            return data
        except json.JSONDecodeError:
            return response.content
            
    except Exception as e:
        print(f"Error cloning voice: {e}")
        if 'response' in locals():
            print(f"Response: {response.text}")
        return None

def save_audio_from_response(response_data, output_filename):
    # Check if response_data is a dictionary (JSON) or bytes
    if isinstance(response_data, bytes):
        with open(output_filename, "wb") as f:
            f.write(response_data)
        print(f"Saved raw audio to {output_filename}")
        return True

    # Attempt to find a URL in the response
    url = None
    
    def find_url(obj):
        if isinstance(obj, str):
            if obj.startswith("http") and (".mp3" in obj or ".wav" in obj):
                return obj
        elif isinstance(obj, dict):
            for k, v in obj.items():
                if k in ["url", "audio_file", "file_url", "audio_url", "demo_audio"]: 
                     if isinstance(v, str) and v.startswith("http"):
                         return v
                res = find_url(v)
                if res: return res
        elif isinstance(obj, list):
            for item in obj:
                res = find_url(item)
                if res: return res
        return None

    url = find_url(response_data)
    
    if url:
        print(f"Found audio URL: {url}")
        try:
            r = requests.get(url)
            r.raise_for_status()
            with open(output_filename, "wb") as f:
                f.write(r.content)
            print(f"Downloaded audio to {output_filename}")
            return True
        except Exception as e:
            print(f"Error downloading audio: {e}")
            return False
    else:
        print("No audio URL found in response.")
        return False

def main():
    # Files
    luo_file = "static/luo_pure_2min.mp3"
    tim_file = "static/tim_pure_2min.mp3"
    
    # Text content (Demo scenario: "Tim 怎么看 AI 视频？")
    luo_text = "说到这里，听众有个很有意思的问题：Tim 怎么看 AI 视频？不知道Tim你怎么看？"
    tim_text = "这是一个非常好的角度。其实我们在做的时候也考虑过，AI 不仅仅是工具，更是创意的放大器。我们现在的很多选题，如果没有AI的辅助，可能根本无法在有限的时间内完成。所以与其担心被替代，不如思考如何与它共存。"

    # 1. Generate Luo Audio
    print("\n--- Generating Luo Host Audio ---")
    luo_file_id = upload_file(luo_file)
    if luo_file_id:
        luo_result = clone_voice(luo_file_id, "luo_host", luo_text)
        if luo_result:
             save_audio_from_response(luo_result, "static/ai_host_demo.mp3")

    # 2. Generate Tim Audio
    print("\n--- Generating Tim Response Audio ---")
    tim_file_id = upload_file(tim_file)
    if tim_file_id:
        tim_result = clone_voice(tim_file_id, "tim_response", tim_text)
        if tim_result:
             save_audio_from_response(tim_result, "static/ai_tim_demo.mp3")
             
    # Combine them roughly for the mock file (if both exist)
    if os.path.exists("static/ai_host_demo.mp3") and os.path.exists("static/ai_tim_demo.mp3"):
        print("\n--- Combining Audio Files ---")
        try:
            with open("static/mock_ai_response.mp3", "wb") as outfile:
                with open("static/ai_host_demo.mp3", "rb") as f1:
                    outfile.write(f1.read())
                with open("static/ai_tim_demo.mp3", "rb") as f2:
                    outfile.write(f2.read())
            print("Successfully created static/mock_ai_response.mp3")
        except Exception as e:
            print(f"Error combining files: {e}")

if __name__ == "__main__":
    main()

