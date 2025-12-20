import { writable, derived } from 'svelte/store';
import type { TranscriptLine } from '$lib/types';

// --- Core Data Structure: Timeline Segment ---
// Each segment represents a piece of the virtual timeline
export interface Segment {
    id: string;
    type: 'original' | 'ai';
    
    // Position in VIRTUAL timeline (user-facing time)
    virtualStart: number;
    virtualEnd: number;
    
    // Mapping to SOURCE audio
    audioId: string;  // 'main' or AI audio element ID
    sourceStart: number;  // Where to start in source audio
    sourceEnd: number;  // Where to end in source audio
    
    color: string;
}

// --- Stores ---
export const segments = writable<Segment[]>([]);
export const transcript = writable<TranscriptLine[]>([]);

export const virtualTime = writable(0);  // Current position in virtual timeline
export const totalDuration = writable(0);  // Total virtual duration
export const isPlaying = writable(false);
export const playbackSpeed = writable(1.0);

// UI State
export const userQuery = writable("");
export const isThinking = writable(false);
export const showInput = writable(false);

// --- Derived Stores ---
export const progress = derived(
    [virtualTime, totalDuration],
    ([$virtualTime, $totalDuration]) => $totalDuration ? ($virtualTime / $totalDuration) * 100 : 0
);

export const activeLineIndex = derived(
    [virtualTime, transcript],
    ([$virtualTime, $transcript]) => {
        const idx = $transcript.findIndex((line, i) => {
            const nextLine = $transcript[i + 1];
            return $virtualTime >= line.seconds && (!nextLine || $virtualTime < nextLine.seconds);
        });
        
        // Debug logging
        if (idx !== -1 && $transcript[idx]) {
            const line = $transcript[idx];
            console.log(`[HIGHLIGHT] vTime=${$virtualTime.toFixed(2)}s -> Line ${idx}: "${line.speaker}: ${line.content.substring(0, 20)}..." @ ${line.seconds.toFixed(2)}s`);
        } else {
            console.log(`[HIGHLIGHT] vTime=${$virtualTime.toFixed(2)}s -> NO MATCH (idx=${idx})`);
        }
        
        return idx;
    }
);

// --- Helper Functions ---
export function findSegmentAt(time: number): Segment | undefined {
    const segs = segments as any;
    let currentSegs: Segment[] = [];
    segs.subscribe((s: Segment[]) => currentSegs = s)();
    return currentSegs.find(s => time >= s.virtualStart && time < s.virtualEnd);
}

export function insertAISegment(virtualInsertTime: number, aiAudioId: string, aiDuration: number) {
    segments.update(segs => {
        // Find the segment containing the insert point
        const targetIdx = segs.findIndex(s => virtualInsertTime >= s.virtualStart && virtualInsertTime < s.virtualEnd);
        
        if (targetIdx === -1) {
            // Insert at end
            const newSeg: Segment = {
                id: aiAudioId,
                type: 'ai',
                virtualStart: totalDuration as any,
                virtualEnd: (totalDuration as any) + aiDuration,
                audioId: aiAudioId,
                sourceStart: 0,
                sourceEnd: aiDuration,
                color: 'bg-indigo-500'
            };
            return [...segs, newSeg];
        }
        
        const target = segs[targetIdx];
        const offset = virtualInsertTime - target.virtualStart;
        const sourceOffset = target.sourceStart + offset;
        
        // Create three segments: before, AI, after
        const before: Segment = {
            ...target,
            id: `${target.id}-before-${Date.now()}`,
            virtualEnd: virtualInsertTime,
            sourceEnd: sourceOffset
        };
        
        const aiSeg: Segment = {
            id: aiAudioId,
            type: 'ai',
            virtualStart: virtualInsertTime,
            virtualEnd: virtualInsertTime + aiDuration,
            audioId: aiAudioId,
            sourceStart: 0,
            sourceEnd: aiDuration,
            color: 'bg-indigo-500'
        };
        
        const after: Segment = {
            ...target,
            id: `${target.id}-after-${Date.now()}`,
            virtualStart: virtualInsertTime + aiDuration,
            virtualEnd: target.virtualEnd + aiDuration,
            sourceStart: sourceOffset,
            audioId: target.audioId
        };
        
        // Replace target with the three new segments
        const result = [...segs];
        const replacement = [];
        if (before.virtualEnd > before.virtualStart) replacement.push(before);
        replacement.push(aiSeg);
        if (after.virtualEnd > after.virtualStart) replacement.push(after);
        
        result.splice(targetIdx, 1, ...replacement);
        
        // Shift all subsequent segments
        for (let i = targetIdx + replacement.length; i < result.length; i++) {
            result[i].virtualStart += aiDuration;
            result[i].virtualEnd += aiDuration;
        }
        
        return result;
    });
    
    // Update total duration
    totalDuration.update(d => d + aiDuration);
}

