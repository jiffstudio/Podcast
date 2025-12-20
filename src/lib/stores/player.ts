import { writable, derived } from 'svelte/store';
import type { TranscriptLine } from '$lib/types';

// --- Data Structure ---
export interface TimelineBlock {
    id: string;
    type: 'original' | 'generated';
    
    // Global Timeline Coordinates
    globalStart: number;
    duration: number;
    
    // Source Media Coordinates
    sourceStart: number; 
    audioUrl: string; // URL for generated, or 'main' for original
    
    color: string;
}

// --- Stores ---
export const blocks = writable<TimelineBlock[]>([]);
export const transcript = writable<TranscriptLine[]>([]);

export const currentTime = writable(0);
export const duration = writable(0);
export const isPlaying = writable(false);
export const playbackSpeed = writable(1.0);

// UI State
export const userQuery = writable("");
export const isThinking = writable(false);
export const showInput = writable(false);

// --- Derived ---
export const progress = derived(
    [currentTime, duration],
    ([$currentTime, $duration]) => $duration ? ($currentTime / $duration) * 100 : 0
);

export const activeLineIndex = derived(
    [currentTime, transcript],
    ([$currentTime, $transcript]) => {
        return $transcript.findIndex((line, i) => {
            const nextLine = $transcript[i + 1];
            return $currentTime >= line.seconds && (!nextLine || $currentTime < nextLine.seconds);
        });
    }
);

// --- Actions ---
export function recalcGlobals() {
    blocks.update(blks => {
        let t = 0;
        for (let b of blks) {
            b.globalStart = t;
            t += b.duration;
        }
        duration.set(t);
        return [...blks];
    });
}

