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
            print("Response JSON received.")
            return data
        except json.JSONDecodeError:
            print("Response is not JSON. It might be raw audio or error text.")
            print(response.text[:200]) # Print first 200 chars
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
        return

    print(f"Full response for {output_filename}: {json.dumps(response_data, indent=2, ensure_ascii=False)}")
    
    # Attempt to find a URL in the response
    url = None
    
    # Recursive search for a URL
    def find_url(obj):
        if isinstance(obj, str):
            # Check for audio extensions or minimax file cdn
            # URL might contain query params, so endswith check is insufficient
            if obj.startswith("http") and (".mp3" in obj or ".wav" in obj):
                return obj
        elif isinstance(obj, dict):
            for k, v in obj.items():
                if k in ["url", "audio_file", "file_url", "audio_url", "demo_audio"]: # frequent keys
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
        except Exception as e:
            print(f"Error downloading audio: {e}")
    else:
        print("No audio URL found in response.")

def main():
    # Files
    luo_file = "static/luo_pure_2min.mp3"
    tim_file = "static/tim_pure_2min.mp3"
    
    # 1. Process Luo Yonghao
    print("\n--- Processing Luo Yonghao ---")
    luo_file_id = upload_file(luo_file)
    if luo_file_id:
        luo_voice_id = "luo_yonghao_clone_v1"
        luo_text = "大家好，我是罗永浩。这是通过MiniMax复刻的声音，正在为您演示音色克隆的效果。"
        luo_result = clone_voice(luo_file_id, luo_voice_id, luo_text)
        if luo_result:
             save_audio_from_response(luo_result, "luo_clone_result.mp3")

    # 2. Process Tim
    print("\n--- Processing Tim ---")
    tim_file_id = upload_file(tim_file)
    if tim_file_id:
        tim_voice_id = "tim_clone_v1"
        tim_text = "大家好，我是影视飓风的Tim。这是通过MiniMax复刻的声音，正在为您演示音色克隆的效果。"
        tim_result = clone_voice(tim_file_id, tim_voice_id, tim_text)
        if tim_result:
             save_audio_from_response(tim_result, "tim_clone_result.mp3")

if __name__ == "__main__":
    main()

