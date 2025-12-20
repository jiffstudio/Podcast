// src/lib/types.ts

export interface PodcastSegment {
    id: string;
    type: 'original' | 'generated';
    start: number; // Start time in the *segment's* own audio file
    duration: number;
    globalStart: number; // Start time in the global timeline
    color: string; // visualization color
    audioUrl?: string; // For generated segments
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
    segments: {
        audioUrl: string;
        duration: number;
        transcript: {
            speaker: string;
            content: string;
            timestamp: string;
            type: string;
        };
    }[];
    debugLogs: string[];
}

