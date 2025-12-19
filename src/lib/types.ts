// src/lib/types.ts

export interface PodcastSegment {
    id: string;
    type: 'original' | 'generated';
    start: number; // Start time in the *segment's* own audio file
    duration: number;
    globalStart: number; // Start time in the global timeline
    color: string; // visualization color
}

export interface TranscriptLine {
    speaker: string;
    timestamp: string;
    seconds: number; // relative to the specific audio segment
    content: string;
    type: 'original' | 'generated';
}

export interface AiInteractionRequest {
    currentTimestamp: number;
    userQuery: string;
    // ... context, history, etc.
}

export interface AiInteractionResponse {
    insertionPoint: number; // Where in the original timeline to insert
    generatedAudioUrl: string;
    generatedDuration: number;
    transcript: TranscriptLine[];
}

