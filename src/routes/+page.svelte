<script lang="ts">
  import { onMount } from 'svelte';
  import PodcastInfo from '$lib/components/PodcastInfo.svelte';
  import TranscriptView from '$lib/components/TranscriptView.svelte';
  import PlayerBar from '$lib/components/PlayerBar.svelte';
  import transcriptData from '$lib/transcript.json';
  import { handleUserQuery } from '$lib/api';
  import { 
    blocks, transcript, currentTime, duration, isPlaying, 
    playbackSpeed, userQuery, isThinking, showInput,
    recalcGlobals, type TimelineBlock 
  } from '$lib/stores/player';

  // --- Audio State ---
  let mainAudio: HTMLAudioElement;
  // Map of generated block ID -> Audio Element
  let aiAudioElements: Record<string, HTMLAudioElement> = {};

  // --- Initialization ---
  onMount(() => {
    // Initialize Stores
    const lines = transcriptData.map(t => ({ ...t, type: 'original' as const }));
    transcript.set(lines);
    
    // Main Audio Setup
    if (mainAudio) {
        mainAudio.onloadedmetadata = () => {
            if ($blocks.length === 0) {
                const d = mainAudio.duration;
                if (isFinite(d)) {
                    // Create blocks based on transcript lines
                    const initialBlocks: TimelineBlock[] = lines.map((line, i) => {
                        const nextLine = lines[i + 1];
                        const blockDuration = nextLine ? nextLine.seconds - line.seconds : d - line.seconds;
                        return {
                            id: `line-${i}`,
                            type: 'original' as const,
                            globalStart: line.seconds, // Initially same as source
                            duration: blockDuration,
                            sourceStart: line.seconds,
                            audioUrl: 'main',
                            color: 'bg-emerald-500'
                        };
                    });
                    blocks.set(initialBlocks);
                    duration.set(d); // Set duration directly, don't recalc
                }
            }
        };
        mainAudio.ontimeupdate = () => syncVirtualTime(mainAudio, 'original');
        mainAudio.onended = checkTransition;
    }
    
    // Subscribe to store changes to drive audio
    const unsubTime = currentTime.subscribe(() => {
        // We sync real player when *seeking* (large jumps) or playback starts
        // But we don't want to cause loops during normal playback
        // For now, let's rely on the store update being the "Virtual Player" tick
        // And we just check sync occasionally or on specific actions
    });
    
    // Driver: Store -> Audio
    // We react to block changes or seek events
    return () => {
        unsubTime();
    };
  });
  
  // Reactive Sync: When currentTime changes significantly (seek) or Active Block changes, sync audio
  let lastSyncTime = -1;
  let lastActiveBlockId = "";

  $: {
      const time = $currentTime;
      const blks = $blocks;
      const playing = $isPlaying;
      const speed = $playbackSpeed;

      // Find active block
      const activeBlock = blks.find(b => time >= b.globalStart && time < b.globalStart + b.duration);
      
      // Check if we need to switch source or seek
      const needsSeek = Math.abs(time - lastSyncTime) > 0.5; // Threshold for "seek" vs "tick"

      if (activeBlock) {
          // Sync Playback Rate
          if (mainAudio) mainAudio.playbackRate = speed;
          Object.values(aiAudioElements).forEach(el => el.playbackRate = speed);

          const blockChanged = activeBlock.id !== lastActiveBlockId;
          
          if (needsSeek || blockChanged) {
              syncRealPlayer(activeBlock, time);
          }
          
          // Sync Play/Pause State
          if (playing) {
              if (activeBlock.type === 'original') {
                  if (mainAudio && mainAudio.paused) mainAudio.play();
                  pauseAllAi();
              } else {
                  const el = aiAudioElements[activeBlock.id];
                  if (el && el.paused) el.play();
                  if (mainAudio) mainAudio.pause();
                  // Pause other AIs
                  Object.entries(aiAudioElements).forEach(([id, audio]) => {
                      if (id !== activeBlock.id) audio.pause();
                  });
              }
          } else {
              if (mainAudio) mainAudio.pause();
              pauseAllAi();
          }

          lastActiveBlockId = activeBlock.id;
      } else {
           // No active block found, but still handle play/pause
           if (playing && mainAudio && mainAudio.paused) {
               mainAudio.play();
           } else if (!playing && mainAudio && !mainAudio.paused) {
               mainAudio.pause();
           }
           
           if (time >= $duration && $duration > 0) {
               isPlaying.set(false);
           }
      }
       
       // Update tracker (careful not to loop)
       if (!needsSeek) lastSyncTime = time; 
  }

  function pauseAllAi() {
      Object.values(aiAudioElements).forEach(el => el.pause());
  }

  // Driven by Audio Elements -> Update Store
  function syncVirtualTime(el: HTMLAudioElement, type: 'original' | 'generated', blockId?: string) {
      if (!$isPlaying) return; // Ignore updates if we think we are paused

      const time = $currentTime;
      const blks = $blocks;
      
      // Find the block that *should* be playing
      const currentBlock = blks.find(b => time >= b.globalStart && time < b.globalStart + b.duration);

      if (currentBlock && currentBlock.type === type) {
           // Extra check for AI: ensure it's the specific block
           if (type === 'generated' && blockId && currentBlock.id !== blockId) return;

           const localTime = el.currentTime;
           const newGlobal = currentBlock.globalStart + (localTime - currentBlock.sourceStart);
           
           if (Math.abs(newGlobal - time) > 0.05) {
               currentTime.set(newGlobal);
               lastSyncTime = newGlobal; // Update tracker so we don't trigger seek
           }
           
           if (localTime >= currentBlock.sourceStart + currentBlock.duration - 0.1) {
               checkTransition();
           }
       }
  }

  function syncRealPlayer(block: TimelineBlock, globalTime: number) {
      const localOffset = globalTime - block.globalStart;
      const targetSourceTime = block.sourceStart + localOffset;
      
      console.log(`[Sync] ${block.type} (${block.id}) -> ${targetSourceTime.toFixed(2)}s`);

      if (block.type === 'original') {
          if (Math.abs(mainAudio.currentTime - targetSourceTime) > 0.2) {
              mainAudio.currentTime = targetSourceTime;
          }
          // If we're supposed to be playing, ensure mainAudio is playing
          if ($isPlaying && mainAudio.paused) {
              mainAudio.play();
          }
      } else {
          const el = aiAudioElements[block.id];
          if (el) {
              if (Math.abs(el.currentTime - targetSourceTime) > 0.2) {
                  el.currentTime = targetSourceTime;
              }
              // If we're supposed to be playing, ensure this AI audio is playing
              if ($isPlaying && el.paused) {
                  el.play();
              }
          }
      }
  }

  function checkTransition() {
      const time = $currentTime;
      const blks = $blocks;
      const idx = blks.findIndex(b => time >= b.globalStart && time < b.globalStart + b.duration);
      
      if (idx !== -1 && idx < blks.length - 1) {
          console.log("[Transition] Next Block");
          // Just jump to next block start
          currentTime.set(blks[idx + 1].globalStart);
          // Reactivity will handle syncRealPlayer
      } else {
          console.log("[Transition] End");
          isPlaying.set(false);
      }
  }

  // --- Logic: Ask Question (Pure Logic) ---
  async function handleAskQuestion() {
      const q = $userQuery;
      if (!q.trim()) return;
      isThinking.set(true);
      showInput.set(false);
      
      try {
           const time = $currentTime;
           const lines = $transcript;
           const blks = $blocks;
           
           // Find the current line
           const activeLine = lines.find((l, i) => {
               const nextLine = lines[i + 1];
               return time >= l.seconds && (!nextLine || time < nextLine.seconds);
           });
           
           // Insert after current line finishes
           let insertAt = time;
           if (activeLine) {
               const activeIndex = lines.indexOf(activeLine);
               const nextLine = lines[activeIndex + 1];
               if (nextLine) {
                   insertAt = nextLine.seconds; // Insert at start of next line
               } else {
                   insertAt = $duration; // End of podcast
               }
           }

           console.log(`[Insert] User asked at ${time.toFixed(2)}, inserting at ${insertAt.toFixed(2)}`);

           const response = await handleUserQuery({
               currentTimestamp: insertAt,
               userQuery: q
           });
           
           // Create AI block
           const aiBlock: TimelineBlock = {
               id: `ai-${Date.now()}`,
               type: 'generated',
               globalStart: insertAt, // Will be recalculated
               duration: response.generatedDuration,
               sourceStart: 0,
               audioUrl: response.generatedAudioUrl,
               color: 'bg-indigo-500'
           };

           // Find insertion index (insert after the block that ends at insertAt)
           blocks.update(currentBlocks => {
               const insertIdx = currentBlocks.findIndex(b => insertAt >= b.globalStart && insertAt < b.globalStart + b.duration);
               
               if (insertIdx === -1) {
                   // Insert at end
                   return [...currentBlocks, aiBlock];
               }
               
               // Insert after the current block
               const res = [...currentBlocks];
               res.splice(insertIdx + 1, 0, aiBlock);
               return res;
           });
           
           recalcGlobals();
           
           // Update Transcript
           const newLines = response.transcript.map((l: any) => ({
               ...l,
               seconds: insertAt + (l.relativeStart || 0),
               type: 'generated' as const
           }));
           
           transcript.update(ts => {
               const shifted = ts.map(l => {
                   if (l.seconds >= insertAt) {
                       return { ...l, seconds: l.seconds + response.generatedDuration };
                   }
                   return l;
               });
               const idx = shifted.findIndex(t => t.seconds >= insertAt);
               if (idx === -1) return [...shifted, ...newLines];
               
               const final = [...shifted];
               final.splice(idx, 0, ...newLines);
               return final;
           });
           
           userQuery.set("");

      } catch (e: any) {
          alert(e.message);
      } finally {
          isThinking.set(false);
      }
  }

  // --- Metadata Handler for Dynamic AI Audio ---
  function onAiLoaded(id: string) {
      const el = aiAudioElements[id];
      if (!el) return;
      const realDur = el.duration;
      if (!isFinite(realDur)) return;

      blocks.update(blks => {
          const b = blks.find(x => x.id === id);
          if (b && Math.abs(b.duration - realDur) > 0.1) {
              console.log(`[Metadata] Correcting ${id}: ${b.duration} -> ${realDur}`);
              b.duration = realDur;
              return [...blks]; // Trigger update
          }
          return blks;
      });
      recalcGlobals();
  }

  // --- Interactions ---
  const togglePlay = () => isPlaying.update(v => !v);
  const seek = (time: number) => currentTime.set(Math.max(0, Math.min($duration, time)));
  const changeSpeed = () => {
    const speeds = [1.0, 1.25, 1.5, 2.0, 0.5];
    playbackSpeed.update(s => speeds[(speeds.indexOf(s) + 1) % speeds.length]);
  };
</script>

<div class="flex flex-col h-screen bg-[#1a2e1a] text-[#e0f0e0] font-sans overflow-hidden select-none">
  
  <audio bind:this={mainAudio} src="/podcast.mp3" preload="metadata"></audio>
  
  <!-- Dynamic AI Audio Pool -->
  {#each $blocks.filter(b => b.type === 'generated') as block (block.id)}
      <audio 
          src={block.audioUrl} 
          bind:this={aiAudioElements[block.id]}
          preload="auto"
          on:loadedmetadata={() => onAiLoaded(block.id)}
          on:timeupdate={(e) => syncVirtualTime(e.currentTarget, 'generated', block.id)}
          on:ended={checkTransition}
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
