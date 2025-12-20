<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { 
    Play, Pause, SkipBack, SkipForward, Clock, Heart, 
    Share2, ListMusic, MessageSquare, Info,
    RotateCw, RotateCcw, Settings2, Send, Sparkles, X
  } from 'lucide-svelte';
  import transcriptData from '$lib/transcript.json';
  import { handleUserQuery } from '$lib/api';
  import type { PodcastSegment, TranscriptLine } from '$lib/types';

  let isPlaying = false;
  let currentTime = 0; 
  let duration = 0; 
  let playbackSpeed = 1.0;
  
  // Audio Elements
  let mainAudio: HTMLAudioElement;
  let aiAudio: HTMLAudioElement;
  let currentAudioSource: 'main' | 'ai' = 'main';
  
  // UI Refs
  let transcriptContainer: HTMLElement;
  let inputElement: HTMLInputElement;

  // State for AI Interaction
  let userQuery = "";
  let isThinking = false;
  let showInput = false;
  
  // Data State
  let segments: PodcastSegment[] = [
      {
          id: 'main',
          type: 'original',
          start: 0,
          duration: 0, // Will be set on load
          globalStart: 0,
          color: 'bg-emerald-500'
      }
  ];
  
  let transcript: TranscriptLine[] = transcriptData.map(t => ({
      ...t,
      type: 'original'
  }));

  // Find current active line index
  $: activeLineIndex = transcript.findIndex((line, i) => {
    const nextLine = transcript[i + 1];
    return currentTime >= line.seconds && (!nextLine || currentTime < nextLine.seconds);
  });

  // Scroll to active line
  $: if (activeLineIndex !== -1 && transcriptContainer) {
    const activeElement = document.getElementById(`line-${activeLineIndex}`);
    if (activeElement) {
      activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  onMount(() => {
    if (mainAudio) {
      if (mainAudio.readyState >= 1) {
          // Metadata already loaded
          const d = mainAudio.duration;
          segments[0].duration = d;
          recalculateGlobalTimeline();
          segments = segments; // Trigger reactivity
      }

      mainAudio.addEventListener('loadedmetadata', () => {
        const d = mainAudio.duration;
        segments[0].duration = d;
        recalculateGlobalTimeline();
        segments = segments; // Trigger reactivity
      });
      
      mainAudio.addEventListener('timeupdate', () => {
        if (currentAudioSource === 'main') {
            updateGlobalTimeFromMain();
            checkSegmentTransition();
        }
      });
      
      mainAudio.addEventListener('ended', () => {
        if (currentAudioSource === 'main') {
             // Simplification: Check if we are at the very end of the global timeline
             if (Math.abs(currentTime - duration) < 1) {
                isPlaying = false;
             }
        }
      });
    }

    if (aiAudio) {
        aiAudio.addEventListener('timeupdate', () => {
            if (currentAudioSource === 'ai') {
                updateGlobalTimeFromAi();
                checkSegmentTransition();
            }
        });
        
        aiAudio.addEventListener('ended', () => {
             // Handled by checkSegmentTransition normally, but as backup:
             const currentSegIndex = segments.findIndex(s => currentTime >= s.globalStart && currentTime < s.globalStart + s.duration);
             if (currentSegIndex !== -1 && currentSegIndex < segments.length - 1) {
                 playSegment(currentSegIndex + 1);
             }
        });
    }
  });
  
  function recalculateGlobalTimeline() {
      let currentGlobal = 0;
      for (let i = 0; i < segments.length; i++) {
          segments[i].globalStart = currentGlobal;
          currentGlobal += segments[i].duration;
      }
      duration = currentGlobal;
  }

  function updateGlobalTimeFromMain() {
      // Find which segment corresponds to mainAudio.currentTime
      // Since 'main' segments are parts of the same file, we need to map file time to segment
      
      const currentFileTime = mainAudio.currentTime;
      // Find the first original segment where the file time falls within its range
      const activeSegment = segments.find(s => 
          s.type === 'original' && 
          currentFileTime >= s.start && 
          currentFileTime <= s.start + s.duration + 0.5 // Add some buffer for overshooting
      );

      if (activeSegment) {
          const offsetInSegment = Math.min(currentFileTime - activeSegment.start, activeSegment.duration);
          currentTime = activeSegment.globalStart + offsetInSegment;
      }
  }

  function updateGlobalTimeFromAi() {
       const activeSegment = segments.find(s => 
          s.type === 'generated' && 
          currentTime >= s.globalStart && 
          currentTime <= s.globalStart + s.duration + 0.5
      );
      
      if (activeSegment) {
          currentTime = activeSegment.globalStart + Math.min(aiAudio.currentTime, activeSegment.duration);
      }
  }

  function checkSegmentTransition() {
      // Check if we reached the end of the current segment based on global time
      const currentSegIndex = segments.findIndex(s => currentTime >= s.globalStart && currentTime < s.globalStart + s.duration);
      
      if (currentSegIndex !== -1) {
          const currentSeg = segments[currentSegIndex];
          const timeInSegment = currentTime - currentSeg.globalStart;
          
          // If we are very close to end (150ms)
          if (timeInSegment >= currentSeg.duration - 0.15) { 
               if (currentSegIndex < segments.length - 1) {
                   console.log(`Transitioning from segment ${currentSegIndex} to ${currentSegIndex + 1}`);
                   playSegment(currentSegIndex + 1);
               } else if (timeInSegment >= currentSeg.duration - 0.05) {
                   // End of everything
                   isPlaying = false;
                   mainAudio.pause();
                   aiAudio.pause();
               }
          }
      }
  }

  function playSegment(index: number, offset: number = 0) {
      const segment = segments[index];
      console.log("Playing segment", index, segment, "at offset", offset);
      
      if (segment.type === 'original') {
          currentAudioSource = 'main';
          aiAudio.pause();
          mainAudio.currentTime = segment.start + offset;
          if (isPlaying) {
              mainAudio.play().catch(e => console.error("Error playing mainAudio:", e));
          }
      } else {
          currentAudioSource = 'ai';
          mainAudio.pause();
          
          // Only update src if it changed to avoid unnecessary reloads
          if (segment.audioUrl && aiAudio.src !== segment.audioUrl) {
              aiAudio.src = segment.audioUrl;
          }
          
          aiAudio.currentTime = offset; 
          if (isPlaying) {
              aiAudio.play().catch(e => console.error("Error playing aiAudio:", e));
          }
      }
  }

  async function handleAskQuestion() {
      if (!userQuery.trim()) return;
      
      isThinking = true;
      showInput = false; 
      
      try {
          const response = await handleUserQuery({
              currentTimestamp: currentTime,
              userQuery: userQuery
          });

          const insertionPointGlobal = response.insertionPoint; // Global time where we want to insert
          
          // 1. Find which segment needs to be split
          const splitIndex = segments.findIndex(s => 
              insertionPointGlobal >= s.globalStart && 
              insertionPointGlobal < s.globalStart + s.duration
          );
          
          if (splitIndex === -1) {
              console.error("Insertion point out of bounds");
              return;
          }
          
          const segmentToSplit = segments[splitIndex];
          
          if (segmentToSplit.type !== 'original') {
              console.warn("Inserting into AI segment not fully supported logic-wise yet, appending after.");
              // Simplification: Don't split AI segments for now
              return;
          }
          
          // Calculate split point in LOCAL file time
          const splitOffset = insertionPointGlobal - segmentToSplit.globalStart;
          const fileSplitPoint = segmentToSplit.start + splitOffset;
          
          // Create 3 segments from 1
          const partA: PodcastSegment = {
              ...segmentToSplit,
              id: segmentToSplit.id + '-A',
              duration: splitOffset // New duration is just the offset
          };
          
          const aiSegment: PodcastSegment = {
              id: `ai-${Date.now()}`,
              type: 'generated',
              start: 0, 
              duration: response.generatedDuration,
              globalStart: 0, // Will recalc
              color: 'bg-indigo-500',
              audioUrl: response.generatedAudioUrl
          };
          
          const partB: PodcastSegment = {
              ...segmentToSplit,
              id: segmentToSplit.id + '-B',
              start: fileSplitPoint, // Start where A ended
              duration: segmentToSplit.duration - splitOffset
          };
          
          // Replace segment at splitIndex with [partA, aiSegment, partB]
          segments = [
              ...segments.slice(0, splitIndex),
              partA,
              aiSegment,
              partB,
              ...segments.slice(splitIndex + 1)
          ];
          
          recalculateGlobalTimeline();
          segments = segments; // Trigger reactivity update after mutation
          
          // 2. Insert and Shift Transcript
          // Shift all existing lines after insertion point
          const aiDuration = response.generatedDuration;
          
          // Transcript lines need to be shifted if they are after the insertion point
          transcript = transcript.map(line => {
              if (line.seconds > insertionPointGlobal) {
                  return { ...line, seconds: line.seconds + aiDuration };
              }
              return line;
          });
          
          // Insert new lines
          const newLines = response.transcript.map(l => ({
              ...l,
              seconds: insertionPointGlobal + l.seconds // Relative to start of AI segment
          }));
          
          // Find index to insert in transcript array
          // We need to find the first line that is AFTER our insertion point (which is now shifted)
          // The insertion point for lines is exactly at insertionPointGlobal
          const insertLineIndex = transcript.findIndex(t => t.seconds > insertionPointGlobal);
          
          if (insertLineIndex === -1) {
              transcript = [...transcript, ...newLines];
          } else {
              transcript = [
                  ...transcript.slice(0, insertLineIndex),
                  ...newLines,
                  ...transcript.slice(insertLineIndex)
              ];
          }

          userQuery = "";
          
      } catch (e: any) {
          console.error(e);
          // Try to get detailed logs from the error if available
          let detailedMsg = e.message;
          try {
              // The API returns { error, debugLogs }
              // If it's a fetch error, we might need to parse the response
          } catch(err) {}
          alert("Interaction failed: " + detailedMsg); 
      } finally {
          isThinking = false;
      }
  }

  const togglePlay = () => {
    if (currentAudioSource === 'main') {
        if (isPlaying) mainAudio.pause();
        else mainAudio.play();
    } else {
        if (isPlaying) aiAudio.pause();
        else aiAudio.play();
    }
    isPlaying = !isPlaying;
  };

  const changeSpeed = () => {
    const speeds = [1.0, 1.25, 1.5, 2.0, 0.5];
    const currentIndex = speeds.indexOf(playbackSpeed);
    playbackSpeed = speeds[(currentIndex + 1) % speeds.length];
    if (mainAudio) mainAudio.playbackRate = playbackSpeed;
    if (aiAudio) aiAudio.playbackRate = playbackSpeed;
  };
  
  const seek = (seconds: number) => {
      // Find which segment this global time belongs to
      const targetTime = Math.max(0, Math.min(duration, seconds));
      
      const segmentIndex = segments.findIndex(s => 
          targetTime >= s.globalStart && 
          targetTime < s.globalStart + s.duration
      );
      
      if (segmentIndex !== -1) {
          const segment = segments[segmentIndex];
          const offset = targetTime - segment.globalStart;
          playSegment(segmentIndex, offset);
          currentTime = targetTime;
      }
  };

  const seekRelative = (delta: number) => {
    seek(currentTime + delta);
  };

  const formatTime = (seconds: number) => {
    if (!seconds && seconds !== 0) return "00:00";
    const h = Math.floor(Math.abs(seconds) / 3600);
    const m = Math.floor((Math.abs(seconds) % 3600) / 60);
    const s = Math.floor(Math.abs(seconds) % 60);
    
    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Progress percentage
  $: progress = duration ? (currentTime / duration) * 100 : 0;
  $: remainingTime = duration ? currentTime - duration : 0;
</script>

<div class="flex flex-col h-screen bg-[#1a2e1a] text-[#e0f0e0] font-sans overflow-hidden selection:bg-[#4ade80] selection:text-[#1a2e1a]">
  
  <audio bind:this={mainAudio} src="/podcast.mp3" preload="metadata"></audio>
  <audio bind:this={aiAudio} src="/mock_ai_response.mp3" preload="auto"></audio>

  <!-- Main Content Area -->
  <div class="flex-1 flex overflow-hidden relative">
    
    <!-- Left Panel: Podcast Info & Cover -->
    <div class="hidden md:flex w-1/3 flex-col items-center justify-center p-8 border-r border-white/5 bg-[#142414]">
      <div class="w-64 h-64 rounded-2xl bg-gradient-to-br from-green-400 to-emerald-800 shadow-2xl flex items-center justify-center mb-8 relative group overflow-hidden">
        <!-- Mock Cover Art -->
        <span class="text-4xl font-bold text-white/90 text-center">罗永浩<br>x<br>影视飓风</span>
        <div class="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors"></div>
      </div>
      
      <div class="text-center space-y-2 max-w-md">
        <h1 class="text-2xl font-bold text-white leading-tight">罗永浩 x 影视飓风Tim：从"做个产品"到"做个梦"</h1>
        <p class="text-emerald-400 text-lg font-medium hover:underline cursor-pointer">罗永浩的十字路口</p>
      </div>

      <div class="mt-8 flex gap-4">
        <button class="p-2 rounded-full hover:bg-white/10 transition" title="Share">
          <Share2 class="w-5 h-5 opacity-70" />
        </button>
        <button class="p-2 rounded-full hover:bg-white/10 transition" title="Like">
          <Heart class="w-5 h-5 opacity-70" />
        </button>
      </div>
    </div>

    <!-- Right Panel: Transcript -->
    <div bind:this={transcriptContainer} class="flex-1 overflow-y-auto p-8 md:p-16 scroll-smooth relative">
      <div class="max-w-3xl mx-auto space-y-8 py-10 pb-40">
        {#each transcript as line, i}
          <div id="line-{i}" 
               class="transition-all duration-300 cursor-pointer group"
               on:click={() => seek(line.seconds)}
               on:keydown={(e) => e.key === 'Enter' && seek(line.seconds)}
               role="button"
               tabindex="0">
            <div class="flex items-baseline gap-4 mb-2">
                 <span class="text-sm font-bold {line.type === 'generated' ? 'text-indigo-400' : 'text-emerald-500/80'} uppercase tracking-wide flex items-center gap-2">
                    {#if line.type === 'generated'}
                        <Sparkles class="w-3 h-3" />
                    {/if}
                    {line.speaker}
                 </span>
                 <span class="text-xs font-mono text-white/20 group-hover:text-white/40">{line.timestamp}</span>
            </div>
            <p class="text-xl md:text-2xl lg:text-3xl leading-relaxed font-medium transition-all duration-300
              {activeLineIndex === i ? 'text-white scale-100' : 'text-white/40 scale-95 blur-[0.5px] hover:text-white/60 hover:blur-0'}
              {line.type === 'generated' ? 'italic text-indigo-100' : ''}">
              {line.content}
            </p>
          </div>
        {/each}
        
        {#if isThinking}
            <div class="flex items-center gap-3 text-indigo-300 animate-pulse">
                <Sparkles class="w-5 h-5" />
                <span>AI 正在思考合适切入点并生成对话...</span>
            </div>
        {/if}
      </div>
    </div>

  </div>

  <!-- Bottom Player Bar -->
  <div class="h-auto bg-[#1a2e1a]/95 backdrop-blur-xl border-t border-white/5 flex flex-col justify-center px-6 py-4 md:px-12 relative z-50 transition-all duration-300">
    
    <!-- Progress Bar -->
    <div class="w-full flex items-center gap-4 mb-4 group cursor-pointer" 
         on:click={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const percentage = clickX / rect.width;
            seek(duration * percentage);
         }}
         on:keydown={() => {}}
         role="slider"
         aria-valuenow={progress}
         tabindex="0">
      <span class="text-xs font-mono opacity-60 w-12 text-right">{formatTime(currentTime)}</span>
      <div class="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden relative flex">
        <!-- Original Segment Background -->
        <div class="absolute inset-0 bg-white/5 rounded-full"></div>
        
        <!-- Render Segments -->
        {#each segments as seg}
             {#if seg.type === 'generated'}
                <div class="absolute top-0 h-full {seg.color} opacity-50 z-10"
                     style="left: {(seg.globalStart / duration) * 100}%; width: {(seg.duration / duration) * 100}%">
                </div>
             {/if}
        {/each}

        <!-- Playhead -->
        <div class="absolute top-0 left-0 h-full bg-emerald-500 rounded-full z-20" style="width: {progress}%">
            <!-- Change color if in AI mode -->
            {#if currentAudioSource === 'ai'}
                <div class="absolute inset-0 bg-indigo-500 animate-pulse"></div>
            {/if}
        </div>
        
        <!-- Hover handle -->
        <div class="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity z-30" style="left: {progress}%"></div>
      </div>
      <span class="text-xs font-mono opacity-60 w-14 text-right">{remainingTime < 0 ? '-' : ''}{formatTime(remainingTime)}</span>
    </div>

    <!-- Mobile-only Title Display -->
    <div class="md:hidden flex items-center gap-3 mb-6">
      <div class="w-10 h-10 rounded bg-gradient-to-br from-green-400 to-emerald-800 flex items-center justify-center shrink-0">
        <span class="text-[10px] font-bold text-white/90 leading-tight text-center">罗永浩<br>Tim</span>
      </div>
      <div class="overflow-hidden">
         <h2 class="text-sm font-bold text-white truncate">罗永浩 x 影视飓风Tim</h2>
         <p class="text-xs text-emerald-400">罗永浩的十字路口</p>
      </div>
    </div>

    <!-- Interaction Input Overlay (When active) -->
    {#if showInput}
        <div class="absolute inset-x-0 bottom-0 top-auto bg-[#1a2e1a] p-4 border-t border-white/10 z-50 flex flex-col gap-3 shadow-2xl">
            <div class="flex justify-between items-center mb-1">
                <span class="text-sm font-bold text-indigo-400 flex items-center gap-2">
                    <Sparkles class="w-4 h-4" />
                    向嘉宾提问 / 插入话题
                </span>
                <button on:click={() => showInput = false} class="text-white/50 hover:text-white">
                    <X class="w-5 h-5" />
                </button>
            </div>
            <div class="flex gap-2">
                <input 
                    bind:this={inputElement}
                    bind:value={userQuery}
                    type="text" 
                    placeholder="例如：问问Tim怎么看待AI对视频创作的影响？"
                    class="flex-1 bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-indigo-500 transition-colors"
                    on:keydown={(e) => e.key === 'Enter' && handleAskQuestion()}
                />
                <button 
                    on:click={handleAskQuestion}
                    disabled={!userQuery.trim()}
                    class="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white rounded-lg px-4 flex items-center justify-center transition-colors">
                    <Send class="w-5 h-5" />
                </button>
            </div>
        </div>
    {/if}

    <!-- Controls Row -->
    <div class="flex items-center justify-between pb-2" class:opacity-0={showInput}> <!-- Hide controls when input is showing -->
      
      <!-- Left Controls -->
      <div class="flex items-center gap-6 flex-1">
        <button class="text-xs font-bold border border-white/20 rounded px-2 py-1 hover:bg-white/10 transition text-emerald-400" on:click={changeSpeed}>
          {playbackSpeed.toFixed(1)}x
        </button>
        <!-- AI Interjection Button -->
        <button class="hover:text-indigo-400 transition flex items-center gap-2 group relative" 
                on:click={() => {
                    showInput = true;
                    tick().then(() => inputElement?.focus());
                }}
                title="Ask AI">
           <div class="p-1.5 rounded-full border border-white/20 group-hover:border-indigo-400 group-hover:bg-indigo-500/20 transition-all">
                <Sparkles class="w-4 h-4" />
           </div>
           <span class="hidden md:inline text-xs font-bold opacity-60 group-hover:opacity-100 group-hover:text-indigo-400">插话</span>
        </button>
      </div>

      <!-- Center Controls (Play/Skip) -->
      <div class="flex items-center gap-8 justify-center flex-1">
        <button class="hover:text-white transition hover:scale-110 active:scale-95" on:click={() => seekRelative(-15)}>
          <div class="relative">
            <RotateCcw class="w-7 h-7" />
            <span class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[8px] font-bold mt-0.5">15</span>
          </div>
        </button>

        <button class="bg-white text-black rounded-full p-4 hover:scale-105 active:scale-95 transition shadow-lg shadow-emerald-900/20 relative" on:click={togglePlay}>
          {#if isPlaying}
            <Pause class="w-8 h-8 fill-current" />
          {:else}
            <Play class="w-8 h-8 fill-current ml-1" />
          {/if}
          
          {#if currentAudioSource === 'ai' && isPlaying}
             <div class="absolute inset-0 rounded-full border-2 border-indigo-500 animate-ping opacity-20"></div>
          {/if}
        </button>

        <button class="hover:text-white transition hover:scale-110 active:scale-95" on:click={() => seekRelative(30)}>
          <div class="relative">
             <RotateCw class="w-7 h-7" />
             <span class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[8px] font-bold mt-0.5">30</span>
          </div>
        </button>
      </div>

      <!-- Right Controls -->
      <div class="flex items-center gap-6 flex-1 justify-end">
        <button class="hover:text-emerald-400 transition">
          <ListMusic class="w-5 h-5" />
        </button>
         <button class="hover:text-emerald-400 transition relative">
          <MessageSquare class="w-5 h-5" />
          <span class="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 rounded-full"></span>
        </button>
      </div>
    </div>
  </div>

</div>

<style>
  /* Custom Scrollbar for Transcript */
  ::-webkit-scrollbar {
    width: 6px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
  ::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 10px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.2);
  }
</style>
