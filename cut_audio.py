import json
import subprocess
import os
import shutil

# Configuration
INPUT_AUDIO = os.path.abspath("static/podcast.mp3")
TRANSCRIPT_FILE = "src/lib/transcript.json"
OUTPUT_DIR = os.path.abspath("static")
TEMP_DIR = os.path.abspath("temp_audio_segments")
TARGET_DURATION = 120 # Target pure audio duration in seconds

def get_all_segments():
    with open(TRANSCRIPT_FILE, 'r', encoding='utf-8') as f:
        transcript = json.load(f)
    
    segments = []
    for i in range(len(transcript)):
        current = transcript[i]
        start_time = current['seconds']
        
        # Calculate duration based on next segment
        if i < len(transcript) - 1:
            end_time = transcript[i+1]['seconds']
        else:
            end_time = start_time + 5 # Estimate for last segment
            
        duration = end_time - start_time
        
        if duration <= 0:
            continue

        segments.append({
            "speaker": current['speaker'],
            "start": start_time,
            "duration": duration,
            "content": current['content']
        })
        
    return segments

def extract_and_merge(all_segments, target_speaker, output_filename):
    # Filter for target speaker
    speaker_segments = [s for s in all_segments if target_speaker in s['speaker']]
    
    if not speaker_segments:
        print(f"No segments found for {target_speaker}")
        return

    # Select segments until we reach TARGET_DURATION
    selected_segments = []
    current_duration = 0
    
    for seg in speaker_segments:
        if current_duration >= TARGET_DURATION:
            break
        selected_segments.append(seg)
        current_duration += seg['duration']
    
    print(f"Collecting segments for {target_speaker}: Found {len(selected_segments)} segments, Total duration: {current_duration:.2f}s")
    
    segment_files = []
    
    # Extract each segment
    for i, seg in enumerate(selected_segments):
        seg_filename = os.path.join(TEMP_DIR, f"{target_speaker}_{i}.mp3")
        
        # ffmpeg command to extract segment
        cmd = [
            "ffmpeg", "-y", "-i", INPUT_AUDIO,
            "-ss", str(seg['start']),
            "-t", str(seg['duration']),
            "-q:a", "2", # High quality VBR
            seg_filename
        ]
        
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        segment_files.append(seg_filename)
    
    # Create file list for concatenation
    list_filename = os.path.join(TEMP_DIR, f"{target_speaker}_list.txt")
    with open(list_filename, 'w') as f:
        for sf in segment_files:
            f.write(f"file '{sf}'\n")
            
    # Concatenate
    output_path = os.path.join(OUTPUT_DIR, output_filename)
    concat_cmd = [
        "ffmpeg", "-y", "-f", "concat", "-safe", "0",
        "-i", list_filename,
        "-c", "copy",
        output_path
    ]
    
    # Run concatenation
    subprocess.run(concat_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    
    if os.path.exists(output_path):
        print(f"Created {output_path}")
    else:
        print(f"Failed to create {output_path}")

def main():
    if os.path.exists(TEMP_DIR):
        shutil.rmtree(TEMP_DIR)
    os.makedirs(TEMP_DIR)
    
    try:
        # Get ALL segments first
        all_segments = get_all_segments()
        
        # Extract until 2 mins of pure audio is reached for each
        extract_and_merge(all_segments, "罗永浩", "luo_pure_2min.mp3")
        extract_and_merge(all_segments, "Tim", "tim_pure_2min.mp3")
        
    finally:
        # Cleanup
        if os.path.exists(TEMP_DIR):
           shutil.rmtree(TEMP_DIR)

if __name__ == "__main__":
    main()
