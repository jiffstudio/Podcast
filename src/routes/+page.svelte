<script lang="ts">
  import { onMount } from 'svelte';
  import PodcastInfo from '$lib/components/PodcastInfo.svelte';
  import TranscriptView from '$lib/components/TranscriptView.svelte';
  import PlayerBar from '$lib/components/PlayerBar.svelte';
  import transcriptData from '$lib/transcript.json';
  import { selectInsertPoint, generateAIContent } from '$lib/api';
  import { 
    segments, transcript, virtualTime, totalDuration, isPlaying, 
    playbackSpeed, userQuery, isThinking, showInput,
    findSegmentAt, insertAISegment, type Segment 
  } from '$lib/stores/player';

  // --- Audio Elements ---
  let mainAudio: HTMLAudioElement;
  let aiAudios: Record<string, HTMLAudioElement> = {};
  let aiAudioUrls: Record<string, string> = {}; // Store audio URLs

  // --- State ---
  let currentSegment: Segment | undefined;
  let activeAudioId: string = '';
  let lastVirtualTime = 0;

  // --- Initialization ---
  onMount(() => {
    transcript.set(transcriptData.map(t => ({ ...t, type: 'original' as const })));
    
    if (mainAudio) {
        mainAudio.onloadedmetadata = () => {
            const d = mainAudio.duration;
            if (isFinite(d) && $segments.length === 0) {
                // Initialize with single segment for entire audio
                segments.set([{
                    id: 'main',
                    type: 'original',
                    virtualStart: 0,
                    virtualEnd: d,
                    audioId: 'main',
                    sourceStart: 0,
                    sourceEnd: d,
                    color: 'bg-emerald-500'
                }]);
                totalDuration.set(d);
            }
        };
        
        mainAudio.ontimeupdate = () => {
            if (!$isPlaying || activeAudioId !== 'main') return;
            updateVirtualTimeFromAudio('main', mainAudio.currentTime);
        };
        
        mainAudio.onended = () => transitionToNext();
    }
  });

  // --- Core Logic: Sync Virtual Time from Audio Playback ---
  let lastLoggedVTime = -1;
  function updateVirtualTimeFromAudio(audioId: string, audioTime: number) {
      const seg = currentSegment;
      if (!seg || seg.audioId !== audioId) {
          console.log(`[updateVirtualTime] Mismatch: currentSegment=${currentSegment?.audioId}, audioId=${audioId}`);
          return;
      }
      
      const offset = audioTime - seg.sourceStart;
      const newVirtualTime = seg.virtualStart + offset;
      
      console.log(`[updateVirtualTime] ${audioId}: audioTime=${audioTime.toFixed(2)}, sourceStart=${seg.sourceStart.toFixed(2)}, offset=${offset.toFixed(2)}, newVTime=${newVirtualTime.toFixed(2)}, segEnd=${seg.virtualEnd.toFixed(2)}`);
      
      if (newVirtualTime >= seg.virtualEnd - 0.1) {
          console.log(`[updateVirtualTime] Triggering transition: ${newVirtualTime.toFixed(2)} >= ${(seg.virtualEnd - 0.1).toFixed(2)}`);
          transitionToNext();
      } else {
          virtualTime.set(newVirtualTime);
          // Only log every 1s
          if (Math.abs(newVirtualTime - lastLoggedVTime) > 1.0) {
              console.log(`[VTime] ${newVirtualTime.toFixed(2)}s (from ${audioId})`);
              lastLoggedVTime = newVirtualTime;
          }
      }
  }

  // --- Core Logic: Play Correct Audio at Virtual Time ---
  function syncAudioToVirtualTime(vTime: number, force = false) {
      const seg = findSegmentAt(vTime);
      if (!seg) {
          console.log('[syncAudioToVirtualTime] No segment found at', vTime.toFixed(2));
          return;
      }
      
      const segmentChanged = !currentSegment || seg.id !== currentSegment.id;
      currentSegment = seg;
      
      if (segmentChanged || force) {
          console.log(`[Play] Segment ${seg.id} (${seg.type}), virtualRange: ${seg.virtualStart.toFixed(2)}-${seg.virtualEnd.toFixed(2)}`);
          activeAudioId = seg.audioId;
          
          // Pause all audio
          if (mainAudio) mainAudio.pause();
          Object.values(aiAudios).forEach(a => a.pause());
          
          // Calculate source position
          const offset = vTime - seg.virtualStart;
          const sourceTime = seg.sourceStart + offset;
          
          console.log(`[Play] Source time: ${sourceTime.toFixed(2)}s, offset: ${offset.toFixed(2)}s`);
          
          // Play the correct audio
          if (seg.audioId === 'main') {
              mainAudio.currentTime = sourceTime;
              if ($isPlaying) mainAudio.play();
          } else {
              const aiAudio = aiAudios[seg.audioId];
              if (aiAudio) {
                  console.log(`[Play] AI audio element exists:`, aiAudio.src.substring(0, 50));
                  aiAudio.currentTime = sourceTime;
                  if ($isPlaying) {
                      aiAudio.play().then(() => {
                          console.log(`[Play] AI audio playing, duration: ${aiAudio.duration.toFixed(2)}s`);
                      }).catch(e => {
                          console.error('[Play] AI audio play failed:', e);
                      });
                  }
              } else {
                  console.error(`[Play] AI audio element not found for ${seg.audioId}`);
              }
          }
      }
  }

  // --- Transition to Next Segment ---
  function transitionToNext() {
      const segs = $segments;
      const idx = segs.findIndex(s => s.id === currentSegment?.id);
      
      if (idx !== -1 && idx < segs.length - 1) {
          virtualTime.set(segs[idx + 1].virtualStart);
      } else {
          isPlaying.set(false);
      }
  }

  // --- Reactive: Sync on Virtual Time or Play State Change ---
  $: {
      const vTime = $virtualTime;
      const playing = $isPlaying;
      const speed = $playbackSpeed;
      const segs = $segments; // Depend on segments too
      
      // Safety: If no segments, can't do anything
      if (segs.length === 0) {
          if (playing && mainAudio && mainAudio.paused) {
              mainAudio.play().catch(() => {});
          }
      } else {
          const jumped = Math.abs(vTime - lastVirtualTime) > 0.5;
          lastVirtualTime = vTime;
          
          // Check if we need to switch segment
          const shouldBe = findSegmentAt(vTime);
          const segmentChanged = !currentSegment || (shouldBe && shouldBe.id !== currentSegment.id);
          
          if (jumped || !currentSegment || segmentChanged) {
              syncAudioToVirtualTime(vTime, true);
          }
          
          // Sync play/pause
          if (playing) {
              if (activeAudioId === 'main' && mainAudio?.paused) {
                  mainAudio.play().catch(() => {});
              } else if (activeAudioId !== 'main') {
                  const aiAudio = aiAudios[activeAudioId];
                  if (aiAudio?.paused) aiAudio.play().catch(() => {});
              }
          } else {
              if (mainAudio) mainAudio.pause();
              Object.values(aiAudios).forEach(a => { if (a) a.pause(); });
          }
          
          // Sync speed
          if (mainAudio) mainAudio.playbackRate = speed;
          Object.values(aiAudios).forEach(a => { if (a) a.playbackRate = speed; });
      }
  }

  // --- Handle AI Insertion ---
  async function handleAskQuestion() {
      const q = $userQuery;
      if (!q.trim()) return;
      
      isThinking.set(true);
      showInput.set(false);
      
      try {
          const vTime = $virtualTime;
          const lines = $transcript;
          
          // Find current line index
          const currentLineIndex = lines.findIndex((l, i) => {
              const nextLine = lines[i + 1];
              return vTime >= l.seconds && (!nextLine || vTime < nextLine.seconds);
          });
          
          if (currentLineIndex === -1) {
              console.error('[AI Insert] Could not find current line');
              return;
          }
          
          // Build context: 10 lines before and 10 lines after current position
          const startIdx = Math.max(0, currentLineIndex - 9);
          const endIdx = Math.min(lines.length - 1, currentLineIndex + 10);
          const contextLines = [];
          
          for (let i = startIdx; i <= endIdx; i++) {
              contextLines.push({
                  index: i - startIdx, // 0-based index for context
                  speaker: lines[i].speaker,
                  content: lines[i].content,
                  seconds: lines[i].seconds
              });
          }
          
          console.log(`[AI Insert] Current line index: ${currentLineIndex}, context: ${startIdx}-${endIdx}`);
          
          // Step 1: Select insertion point (fast, returns immediately)
          const t1 = Date.now();
          const insertPointResult = await selectInsertPoint({
              currentTimestamp: vTime,
              userQuery: q,
              contextLines
          });
          const t2 = Date.now();
          console.log(`[Timing] Insert point selection: ${t2 - t1}ms`);
          console.log(`[AI Response] Insert at context index: ${insertPointResult.insertAtIndex}`);
          
          // Map context index back to global transcript index
          const globalInsertIndex = startIdx + insertPointResult.insertAtIndex;
          
          if (globalInsertIndex < 0 || globalInsertIndex >= lines.length) {
              console.error(`[AI Insert] Invalid insert index: ${globalInsertIndex}`);
              return;
          }
          
          // Insert after the specified line
          const insertLine = lines[globalInsertIndex];
          const nextLine = lines[globalInsertIndex + 1];
          const insertAt = nextLine ? nextLine.seconds : $totalDuration;
          
          console.log(`[AI Insert] Will insert at ${insertAt.toFixed(2)}s (after line ${globalInsertIndex}: "${insertLine.content.substring(0, 30)}...")`);
          
          // Step 2: Generate AI content (slow, returns when ready)
          const t3 = Date.now();
          const contentResult = await generateAIContent(q);
          const t4 = Date.now();
          console.log(`[Timing] AI content generation: ${t4 - t3}ms`);
          console.log(`[AI Response] Generated ${contentResult.segments.length} segments`);
          
          // Insert each segment sequentially
          let currentInsertTime = insertAt;
          const allTranscriptLines: any[] = [];
          
          for (const segment of contentResult.segments) {
              const aiId = `ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
              const aiDuration = segment.duration;
              
              console.log(`[Segment Create] ${segment.transcript.speaker}: id=${aiId}, duration=${aiDuration.toFixed(2)}s, insertTime=${currentInsertTime.toFixed(2)}s`);
              
              // Store audio URL
              aiAudioUrls[aiId] = segment.audioUrl;
              
              // Insert AI segment into timeline
              insertAISegment(currentInsertTime, aiId, aiDuration);
              
              // Prepare transcript line
              allTranscriptLines.push({
                  ...segment.transcript,
                  seconds: currentInsertTime,
                  type: 'generated' as const
              });
              
              currentInsertTime += aiDuration;
          }
          
          const totalAiDuration = currentInsertTime - insertAt;
          
          console.log('[AI Segments]', allTranscriptLines.map(l => `${l.speaker} at ${l.seconds.toFixed(2)}s`));
          
          transcript.update(ts => {
              // 1. Insert new AI lines at the correct position
              const insertIdx = ts.findIndex(t => t.seconds >= insertAt);
              console.log(`[Transcript] Insert ${allTranscriptLines.length} AI lines at index ${insertIdx}`);
              
              let result: typeof ts;
              if (insertIdx === -1) {
                  // Insert at end
                  result = [...ts, ...allTranscriptLines];
              } else {
                  // Insert before the line at insertIdx
                  result = [...ts];
                  result.splice(insertIdx, 0, ...allTranscriptLines);
              }
              
              // 2. Shift ORIGINAL lines that are >= insertAt
              result = result.map(l => {
                  // Don't shift the lines we just inserted
                  if (l.type === 'generated' && allTranscriptLines.some(nl => nl.speaker === l.speaker && Math.abs(nl.seconds - l.seconds) < 0.01)) {
                      return l;
                  }
                  // Shift original lines
                  if (l.type === 'original' && l.seconds >= insertAt) {
                      const newSeconds = l.seconds + totalAiDuration;
                      console.log(`[Transcript] Shifting: ${l.speaker} ${l.seconds.toFixed(2)} -> ${newSeconds.toFixed(2)}`);
                      return { ...l, seconds: newSeconds };
                  }
                  return l;
              });
              
              console.log(`[Transcript] After shift (before sort):`, result.slice(0, 10).map((l, i) => `${i}: ${l.speaker} @ ${l.seconds.toFixed(2)}s (${l.type})`));
              
              // 3. Sort by time to ensure correct order
              result = result.sort((a, b) => a.seconds - b.seconds);
              
              console.log(`[Transcript] Final result:`, result.slice(0, 10).map((l, i) => `${i}: ${l.speaker} @ ${l.seconds.toFixed(2)}s (${l.type})`));
              
              return result;
          });
          
          userQuery.set("");
      } catch (e: any) {
          alert(e.message);
      } finally {
          isThinking.set(false);
      }
  }

  // Bind AI audio elements after they're created
  function bindAiAudio(node: HTMLAudioElement, id: string) {
      console.log(`[bindAiAudio] Binding ${id}`);
      aiAudios[id] = node;
      
      node.onloadedmetadata = () => {
          console.log(`[bindAiAudio] ${id} metadata loaded, duration: ${node.duration.toFixed(2)}s`);
      };
      
      node.ontimeupdate = () => {
          if (!$isPlaying || activeAudioId !== id) return;
          updateVirtualTimeFromAudio(id, node.currentTime);
      };
      
      node.onended = () => {
          console.log(`[bindAiAudio] ${id} ended, activeAudioId=${activeAudioId}`);
          if (activeAudioId !== id) {
              console.log(`[bindAiAudio] Ignoring ended event for ${id} (not active)`);
              return;
          }
          transitionToNext();
      };
      
      return {
          destroy() {
              console.log(`[bindAiAudio] Destroying ${id}`);
              delete aiAudios[id];
          }
      };
  }

  // --- UI Interactions ---
  const togglePlay = () => {
      // Ensure segments are initialized before playing
      if ($segments.length === 0 && mainAudio && isFinite(mainAudio.duration)) {
          const d = mainAudio.duration;
          segments.set([{
              id: 'main',
              type: 'original',
              virtualStart: 0,
              virtualEnd: d,
              audioId: 'main',
              sourceStart: 0,
              sourceEnd: d,
              color: 'bg-emerald-500'
          }]);
          totalDuration.set(d);
          console.log('[Init] Segments initialized on play:', d);
      }
      isPlaying.update(v => !v);
  };
  
  const seek = (time: number) => virtualTime.set(Math.max(0, Math.min($totalDuration, time)));
  const changeSpeed = () => {
    const speeds = [1.0, 1.25, 1.5, 2.0, 0.5];
    playbackSpeed.update(s => speeds[(speeds.indexOf(s) + 1) % speeds.length]);
  };
</script>

<div class="flex flex-col h-screen bg-[#1a2e1a] text-[#e0f0e0] font-sans overflow-hidden select-none">
  
  <!-- Main Audio -->
  <audio bind:this={mainAudio} src="/podcast.mp3" preload="metadata"></audio>
  
  <!-- AI Audio Pool -->
  {#each Object.entries(aiAudioUrls) as [id, url] (id)}
      <audio 
          use:bindAiAudio={id}
          src={url}
          preload="auto"
      ></audio>
  {/each}

  <div class="flex-1 flex overflow-hidden relative">
     <PodcastInfo />
     <TranscriptView onSeek={seek} />
  </div>

  <PlayerBar 
    onTogglePlay={togglePlay}
    onSeek={seek}
    onChangeSpeed={changeSpeed}
    onAskQuestion={handleAskQuestion}
  />
</div>
