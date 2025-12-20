<script lang="ts">
  import { onMount } from 'svelte';
  import PodcastInfo from '$lib/components/PodcastInfo.svelte';
  import TranscriptView from '$lib/components/TranscriptView.svelte';
  import PlayerBar from '$lib/components/PlayerBar.svelte';
  import transcriptData from '$lib/transcript.json';
  import { handleUserQuery } from '$lib/api';
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
      if (!seg || seg.audioId !== audioId) return;
      
      const offset = audioTime - seg.sourceStart;
      const newVirtualTime = seg.virtualStart + offset;
      
      if (newVirtualTime >= seg.virtualEnd - 0.1) {
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
          
          // Find insertion point (end of current sentence)
          const activeLine = lines.find((l, i) => {
              const nextLine = lines[i + 1];
              return vTime >= l.seconds && (!nextLine || vTime < nextLine.seconds);
          });
          
          let insertAt = vTime;
          if (activeLine) {
              const activeIndex = lines.indexOf(activeLine);
              const nextLine = lines[activeIndex + 1];
              insertAt = nextLine ? nextLine.seconds : $totalDuration;
          }
          
          console.log(`[AI Insert] At virtual time ${insertAt.toFixed(2)}s`);
          
          const response = await handleUserQuery({
              currentTimestamp: insertAt,
              userQuery: q
          });
          
          console.log('[AI Response]', response.segments.length, 'segments');
          
          // Insert each segment sequentially
          let currentInsertTime = insertAt;
          const allTranscriptLines: any[] = [];
          
          for (const segment of response.segments) {
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
      aiAudios[id] = node;
      
      node.onloadedmetadata = () => {
          const realDuration = node.duration;
          const seg = $segments.find(s => s.id === id);
          if (!seg) return;
          
          const expectedDuration = seg.virtualEnd - seg.virtualStart;
          if (isFinite(realDuration) && Math.abs(realDuration - expectedDuration) > 0.1) {
              console.log(`[AI Audio] Correcting ${id}: ${expectedDuration.toFixed(2)} -> ${realDuration.toFixed(2)}`);
              
              const diff = realDuration - expectedDuration;
              const segStart = seg.virtualStart;
              const oldSegEnd = seg.virtualEnd;
              const newSegEnd = segStart + realDuration;
              
              segments.update(segs => {
                  const idx = segs.findIndex(s => s.id === id);
                  if (idx === -1) return segs;
                  
                  segs[idx].virtualEnd = newSegEnd;
                  segs[idx].sourceEnd = realDuration;
                  
                  // Shift subsequent segments
                  for (let i = idx + 1; i < segs.length; i++) {
                      segs[i].virtualStart += diff;
                      segs[i].virtualEnd += diff;
                  }
                  
                  return [...segs];
              });

              totalDuration.update(d => d + diff);
              
              // No need to correct transcript for individual segments
              // Each segment has its own audio and exact duration
              // Transcript was already inserted with correct times
          }
      };
      
      node.ontimeupdate = () => {
          if (!$isPlaying || activeAudioId !== id) return;
          updateVirtualTimeFromAudio(id, node.currentTime);
      };
      
      node.onended = () => transitionToNext();
      
      return {
          destroy() {
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
