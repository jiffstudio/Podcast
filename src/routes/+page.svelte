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
  function updateVirtualTimeFromAudio(audioId: string, audioTime: number) {
      const seg = currentSegment;
      if (!seg || seg.audioId !== audioId) return;
      
      const offset = audioTime - seg.sourceStart;
      const newVirtualTime = seg.virtualStart + offset;
      
      if (newVirtualTime >= seg.virtualEnd - 0.1) {
          transitionToNext();
      } else {
          virtualTime.set(newVirtualTime);
          console.log(`[VTime] ${newVirtualTime.toFixed(2)}s (from ${audioId})`);
      }
  }

  // --- Core Logic: Play Correct Audio at Virtual Time ---
  function syncAudioToVirtualTime(vTime: number, force = false) {
      const seg = findSegmentAt(vTime);
      if (!seg) return;
      
      const segmentChanged = !currentSegment || seg.id !== currentSegment.id;
      currentSegment = seg;
      
      if (segmentChanged || force) {
          console.log(`[Play] Segment ${seg.id} (${seg.type})`);
          activeAudioId = seg.audioId;
          
          // Pause all audio
          if (mainAudio) mainAudio.pause();
          Object.values(aiAudios).forEach(a => a.pause());
          
          // Calculate source position
          const offset = vTime - seg.virtualStart;
          const sourceTime = seg.sourceStart + offset;
          
          // Play the correct audio
          if (seg.audioId === 'main') {
              mainAudio.currentTime = sourceTime;
              if ($isPlaying) mainAudio.play();
          } else {
              const aiAudio = aiAudios[seg.audioId];
              if (aiAudio) {
                  aiAudio.currentTime = sourceTime;
                  if ($isPlaying) aiAudio.play();
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
      
      const jumped = Math.abs(vTime - lastVirtualTime) > 0.5;
      lastVirtualTime = vTime;
      
      if (jumped || !currentSegment) {
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
          
          const aiId = `ai-${Date.now()}`;
          const aiDuration = response.generatedDuration;
          
          // Store audio URL
          aiAudioUrls[aiId] = response.generatedAudioUrl;
          
          // Insert AI segment into timeline
          insertAISegment(insertAt, aiId, aiDuration);
          
          // Update transcript
          const newLines = response.transcript.map((l: any) => ({
              ...l,
              seconds: insertAt + (l.relativeStart || 0),
              type: 'generated' as const
          }));
          
          console.log('[Transcript Insert]', newLines.map(l => `${l.speaker} at ${l.seconds.toFixed(2)}s`));
          
          transcript.update(ts => {
              // Find insertion index BEFORE shifting
              const insertIdx = ts.findIndex(t => t.seconds >= insertAt);
              console.log(`[Transcript] Insert at index ${insertIdx}, original line: ${insertIdx !== -1 ? ts[insertIdx].speaker + ' at ' + ts[insertIdx].seconds.toFixed(2) : 'END'}`);
              
              // Shift lines after insertAt
              const shifted = ts.map(l => 
                  l.seconds >= insertAt 
                      ? { ...l, seconds: l.seconds + aiDuration }
                      : l
              );
              
              // Insert new lines at the correct position
              if (insertIdx === -1) {
                  return [...shifted, ...newLines];
              }
              
              const result = [...shifted];
              result.splice(insertIdx, 0, ...newLines);
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
              segments.update(segs => {
                  const idx = segs.findIndex(s => s.id === id);
                  if (idx === -1) return segs;
                  
                  segs[idx].virtualEnd += diff;
                  segs[idx].sourceEnd = realDuration;
                  
                  // Shift subsequent segments
                  for (let i = idx + 1; i < segs.length; i++) {
                      segs[i].virtualStart += diff;
                      segs[i].virtualEnd += diff;
                  }
                  
                  return [...segs];
              });
              
              totalDuration.update(d => d + diff);
              
              transcript.update(ts => ts.map(l => 
                  l.seconds > seg.virtualStart ? { ...l, seconds: l.seconds + diff } : l
              ));
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
  const togglePlay = () => isPlaying.update(v => !v);
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
