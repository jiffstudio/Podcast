import csv
import re

input_file = '罗永浩 x 影视飓风Tim_原文.txt'
output_file = 'podcast_transcript.csv'

def parse_transcript():
    try:
        with open(input_file, 'r', encoding='gb18030') as f:
            lines = f.readlines()
    except UnicodeDecodeError:
        print("Failed with gb18030, trying utf-8")
        with open(input_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()

    dialogues = []
    current_speaker = None
    current_timestamp = None
    current_content = []

    # Regex to identify speaker lines: Name followed by Timestamp 
    # Examples: "Tim   00:11" (MM:SS) or "罗永浩   01:00:07" (HH:MM:SS)
    # Allowing for some flexibility in whitespace
    speaker_pattern = re.compile(r'^(.+?)\s+(\d{1,2}:\d{2}(?::\d{2})?)$')

    for line in lines:
        line = line.strip()
        if not line:
            continue

        match = speaker_pattern.match(line)
        if match:
            # If we have a previous speaker and content, save it
            if current_speaker and current_content:
                dialogues.append((current_speaker, current_timestamp, " ".join(current_content)))
                current_content = []
            
            current_speaker = match.group(1).strip()
            current_timestamp = match.group(2).strip()
        else:
            # If it's not a speaker line, it's content (unless it's the header)
            # Check if it looks like a header (first few lines might be title/date)
            # But the speaker pattern is quite specific, so non-matches are likely content if a speaker is set.
            if current_speaker:
                current_content.append(line)

    # Add the last entry
    if current_speaker and current_content:
        dialogues.append((current_speaker, current_timestamp, " ".join(current_content)))

    # Write to CSV
    with open(output_file, 'w', encoding='utf-8', newline='') as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(['Speaker', 'Timestamp', 'Content'])
        writer.writerows(dialogues)

    print(f"Successfully processed {len(dialogues)} dialogue entries.")

if __name__ == "__main__":
    parse_transcript()

