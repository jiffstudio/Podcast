import { writable, derived, get } from 'svelte/store';
import type { PodcastSegment, TranscriptLine } from '$lib/types';

// Re-defining TimelineBlock here or importing it if we move it to types
export interface TimelineBlock {
    id: string;
    type: 'original' | 'generated';
    globalStart: number;
    duration: number;
    sourceStart: number; 
    audioUrl: string; // 'main' or URL
    color: string;
}

export const currentTime = writable(0);
export const duration = writable(0);
export const isPlaying = writable(false);
export const playbackSpeed = writable(1.0);

// Data Stores
export const blocks = writable<TimelineBlock[]>([]);
export const transcript = writable<TranscriptLine[]>([]);

// Derived: Current Active Block Index
export const activeBlockIndex = derived(
    [currentTime, blocks],
    ([$time, $blocks]) => {
        return $blocks.findIndex(b => $time >= b.globalStart && $time < b.globalStart + b.duration);
    }
);

// UI State
export const isThinking = writable(false);
export const userQuery = writable("");
export const showInput = writable(false);

// Actions
export function togglePlay() {
    isPlaying.update(p => !p);
}

export function setTime(t: number) {
    const d = get(duration);
    currentTime.set(Math.max(0, Math.min(d, t)));
}

