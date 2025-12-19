import csv
import json

input_file = 'podcast_transcript.csv'
output_file = 'src/lib/transcript.json'

def time_to_seconds(time_str):
    parts = list(map(int, time_str.split(':')))
    if len(parts) == 2:
        return parts[0] * 60 + parts[1]
    elif len(parts) == 3:
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    return 0

def convert_to_json():
    transcript_data = []
    
    with open(input_file, 'r', encoding='utf-8') as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            seconds = time_to_seconds(row['Timestamp'])
            transcript_data.append({
                'speaker': row['Speaker'],
                'timestamp': row['Timestamp'],
                'seconds': seconds,
                'content': row['Content']
            })

    # Ensure lib directory exists
    import os
    os.makedirs('src/lib', exist_ok=True)

    with open(output_file, 'w', encoding='utf-8') as jsonfile:
        json.dump(transcript_data, jsonfile, ensure_ascii=False, indent=2)

    print(f"Successfully converted to {output_file}")

if __name__ == "__main__":
    convert_to_json()

