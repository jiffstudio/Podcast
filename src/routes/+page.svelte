<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { 
    Play, Pause, Heart, Share2, ListMusic, MessageSquare, 
    RotateCw, RotateCcw, Send, Sparkles, X
  } from 'lucide-svelte';
  import transcriptData from '$lib/transcript.json';
  import { handleUserQuery } from '$lib/api';
  import type { TranscriptLine } from '$lib/types';

  // --- 1. The Universal Data Structure ---
  interface TimelineBlock {
      id: string;
      type: 'original' | 'generated';
      
      // Global Timeline Coordinates (The Virtual Player)
      globalStart: number;
      duration: number;
      // Derived helper
      get globalEnd() { return this.globalStart + this.duration; }

      // Source Media Coordinates (The Real Player)
      sourceStart: number; 
      audioUrl: string; // URL for generated, or 'main' for original
      
      color: string;
  }

  // --- State ---
  let blocks: TimelineBlock[] = [];
  let transcript: TranscriptLine[] = transcriptData.map(t => ({ ...t, type: 'original' }));
  
  // Virtual Player State
  let currentTime = 0;
  let duration = 0;
  let isPlaying = false;
  let playbackSpeed = 1.0;

  // Real Audio Elements
  let mainAudio: HTMLAudioElement;
  let aiAudio: HTMLAudioElement;

  // UI State
  let userQuery = "";
  let isThinking = false;
  let showInput = false;
  let transcriptContainer: HTMLElement;
  let inputElement: HTMLInputElement;
  
  // Helpers for robust sync
  let activeBlockIndex = -1; // Derived from currentTime, cached for performance

  // --- Initialization ---
  onMount(() => {
      // Initialize with one big block representing the original podcast
      if (mainAudio) {
          mainAudio.onloadedmetadata = () => {
              if (blocks.length === 0) {
                  const d = mainAudio.duration;
                  if (isFinite(d)) {
                      blocks = [{
                          id: 'main-start',
                          type: 'original',
                          globalStart: 0,
                          duration: d,
                          sourceStart: 0,
                          audioUrl: 'main',
                          color: 'bg-emerald-500'
                      }];
                      recalcGlobals();
                  }
              }
          };
          
          // The Driver: Main Audio updates the Virtual Time
          mainAudio.ontimeupdate = () => syncVirtualTime(mainAudio, 'original');
          mainAudio.onended = checkTransition; // Handle natural finish
      }

      if (aiAudio) {
          // The Driver: AI Audio updates the Virtual Time
          aiAudio.ontimeupdate = () => syncVirtualTime(aiAudio, 'generated');
          aiAudio.onended = checkTransition; // Handle natural finish
          
          // Dynamic Duration Fixer
          aiAudio.onloadedmetadata = () => {
              const src = aiAudio.src;
              const realDuration = aiAudio.duration;
              if (!isFinite(realDuration)) return;

              // Find blocks using this URL and correct their duration
              let changed = false;
              blocks.forEach(b => {
                  if (b.type === 'generated' && b.audioUrl === src) {
                      if (Math.abs(b.duration - realDuration) > 0.1) {
                          console.log(`[System] Correcting duration for ${b.id}: ${b.duration} -> ${realDuration}`);
                          b.duration = realDuration;
                          changed = true;
                      }
                  }
              });
              
              if (changed) {
                  recalcGlobals();
                  // Recalculate transcript map if needed (simplified for now)
              }
          };
      }
  });

  // --- Core Logic 1: The "Virtual -> Real" Mapper ---

  // Called when the real audio plays. It updates the virtual slider.
  function syncVirtualTime(sourceAudio: HTMLAudioElement, sourceType: 'original' | 'generated') {
      const currentBlock = blocks.find(b => 
          currentTime >= b.globalStart && currentTime < b.globalStart + b.duration
      );

      // Only allow the "correct" audio source to update time
      if (currentBlock && currentBlock.type === sourceType) {
          const localTime = sourceAudio.currentTime;
          // Virtual Time = Block Start + (Real Time - Block Source Offset)
          const newGlobal = currentBlock.globalStart + (localTime - currentBlock.sourceStart);
          
          // Anti-jitter: only update if significant difference or normal playback
          if (Math.abs(newGlobal - currentTime) > 0.05) {
               currentTime = newGlobal;
          }
          
          // Check for block end
          if (localTime >= currentBlock.sourceStart + currentBlock.duration - 0.1) {
              checkTransition();
          }
      }
  }

  // Called when User seeks or Block changes. It forces the real audio to match virtual time.
  function syncRealPlayer() {
      const blockIdx = blocks.findIndex(b => currentTime >= b.globalStart && currentTime < b.globalStart + b.duration);
      
      if (blockIdx === -1) {
          // End of stream
          isPlaying = false;
          mainAudio.pause();
          aiAudio.pause();
          return;
      }

      const block = blocks[blockIdx];
      activeBlockIndex = blockIdx;
      
      // Calculate where we should be in the source file
      const localOffset = currentTime - block.globalStart;
      const targetSourceTime = block.sourceStart + localOffset;

      console.log(`[Sync] Global: ${currentTime.toFixed(2)}s -> Block: ${block.type} -> Local: ${targetSourceTime.toFixed(2)}s`);

      if (block.type === 'original') {
          aiAudio.pause(); // Mute the other
          
          // Only seek if necessary (prevent skipping)
          if (Math.abs(mainAudio.currentTime - targetSourceTime) > 0.2) {
              mainAudio.currentTime = targetSourceTime;
          }
          if (isPlaying) mainAudio.play();

      } else {
          mainAudio.pause(); // Mute the other
          
          if (aiAudio.src !== block.audioUrl) {
              aiAudio.src = block.audioUrl;
              aiAudio.load(); 
              // Wait for load? Usually handled by browser, we set time after
          }
          
          // For AI, sourceStart is usually 0, but good to be consistent
          if (Math.abs(aiAudio.currentTime - targetSourceTime) > 0.2) {
              aiAudio.currentTime = targetSourceTime;
          }
          if (isPlaying) aiAudio.play();
      }
  }

  function checkTransition() {
      // Find current block
      const blockIdx = blocks.findIndex(b => currentTime >= b.globalStart && currentTime < b.globalStart + b.duration);
      if (blockIdx === -1) return; // End
      
      const block = blocks[blockIdx];
      // Are we at the end of this block?
      if (currentTime >= block.globalStart + block.duration - 0.2) {
          // Move to next block start
          if (blockIdx + 1 < blocks.length) {
              const nextBlock = blocks[blockIdx + 1];
              console.log("[Transition] Moving to next block");
              currentTime = nextBlock.globalStart;
              syncRealPlayer();
          } else {
              console.log("[Transition] End of content");
              isPlaying = false;
              currentTime = duration;
          }
      }
  }

  // --- Core Logic 2: The "Cut & Paste" Manager ---

  function recalcGlobals() {
      let t = 0;
      for (let b of blocks) {
          b.globalStart = t;
          t += b.duration;
      }
      duration = t;
      blocks = [...blocks]; // Reactivity
  }

  async function handleAskQuestion() {
      if (!userQuery.trim()) return;
      isThinking = true;
      showInput = false;

      try {
           // 1. Determine "Virtual" Insertion Point
           // Using the sentence boundary logic just to find the TIME.
           let insertAtGlobalTime = currentTime;
           
           // Find nearest sentence end
           const activeLine = transcript.find(l => currentTime >= l.seconds && (!transcript[transcript.indexOf(l)+1] || currentTime < transcript[transcript.indexOf(l)+1].seconds));
           if (activeLine) {
               const nextLine = transcript[transcript.indexOf(activeLine) + 1];
               if (nextLine) insertAtGlobalTime = nextLine.seconds;
               else insertAtGlobalTime = duration; // End
           }

           console.log(`[Insert] User asked at ${currentTime.toFixed(2)}, inserting at ${insertAtGlobalTime.toFixed(2)}`);

           const response = await handleUserQuery({
               currentTimestamp: insertAtGlobalTime, // Context is at insertion point
               userQuery
           });
           
           // 2. Modify the Blocks Array (Pure Logic)
           
           // Find which block we are cutting
           const targetBlockIndex = blocks.findIndex(b => insertAtGlobalTime >= b.globalStart && insertAtGlobalTime < b.globalStart + b.duration);
           
           // If we are appending to the very end
           if (targetBlockIndex === -1 && insertAtGlobalTime >= duration - 0.1) {
               const newBlock: TimelineBlock = {
                   id: `ai-${Date.now()}`,
                   type: 'generated',
                   globalStart: 0, // calc later
                   duration: response.generatedDuration,
                   sourceStart: 0,
                   audioUrl: response.generatedAudioUrl,
                   color: 'bg-indigo-500'
               };
               blocks.push(newBlock);
           } 
           else {
               const targetBlock = blocks[targetBlockIndex];
               
               // Calculate local split point
               const splitLocalOffset = insertAtGlobalTime - targetBlock.globalStart;
               
               // Construct new blocks
               const preBlock: TimelineBlock = {
                   ...targetBlock,
                   id: targetBlock.id + '-pre',
                   duration: splitLocalOffset
               };
               
               const aiBlock: TimelineBlock = {
                   id: `ai-${Date.now()}`,
                   type: 'generated',
                   globalStart: 0, // calc later
                   duration: response.generatedDuration,
                   sourceStart: 0,
                   audioUrl: response.generatedAudioUrl,
                   color: 'bg-indigo-500'
               };
               
               const postBlock: TimelineBlock = {
                   ...targetBlock,
                   id: targetBlock.id + '-post',
                   sourceStart: targetBlock.sourceStart + splitLocalOffset,
                   duration: targetBlock.duration - splitLocalOffset
               };

               // Robustness: If split point is basically start or end, don't create empty blocks
               const newSubBlocks = [];
               if (preBlock.duration > 0.1) newSubBlocks.push(preBlock);
               newSubBlocks.push(aiBlock);
               if (postBlock.duration > 0.1) newSubBlocks.push(postBlock);
               
               // Splice them in
               blocks.splice(targetBlockIndex, 1, ...newSubBlocks);
           }

           // 3. Rebuild the world
           recalcGlobals();
           
           // 4. Update Transcript (Shift times)
           const aiDuration = response.generatedDuration;
           transcript = transcript.map(line => {
               if (line.seconds >= insertAtGlobalTime - 0.05) {
                   return { ...line, seconds: line.seconds + aiDuration };
               }
               return line;
           });
           
           const newLines = response.transcript.map(l => ({
               ...l,
               seconds: insertAtGlobalTime + (l.relativeStart || 0),
               type: 'generated'
           }));
           
           // Insert transcript lines
           const insertIdx = transcript.findIndex(t => t.seconds > insertAtGlobalTime);
           if (insertIdx === -1) transcript.push(...newLines);
           else transcript.splice(insertIdx, 0, ...newLines);
           transcript = transcript; // Reactivity

           // 5. Preload Audio
           aiAudio.src = response.generatedAudioUrl;
           aiAudio.load();

           // 6. Resume Playback (Virtual Player handles the rest)
           // We don't need to change currentTime, just let it flow. 
           // When currentTime hits the new block boundary, syncRealPlayer will handle it.
           
           userQuery = "";

      } catch (e: any) {
          alert(e.message);
      } finally {
          isThinking = false;
      }
  }


  // --- Interactions ---

  const togglePlay = () => {
    if (isPlaying) {
        isPlaying = false;
        mainAudio.pause();
        aiAudio.pause();
    } else {
        isPlaying = true;
        syncRealPlayer(); // Ensure we start at right place
    }
  };

  const seek = (newTime: number) => {
    currentTime = Math.max(0, Math.min(duration, newTime));
    syncRealPlayer();
  };
  
  const changeSpeed = () => {
    const speeds = [1.0, 1.25, 1.5, 2.0, 0.5];
    playbackSpeed = speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length];
    if (mainAudio) mainAudio.playbackRate = playbackSpeed;
    if (aiAudio) aiAudio.playbackRate = playbackSpeed;
  };

  // --- UI Helpers ---
  const formatTime = (s: number) => {
    if (!s) return "00:00";
    const min = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  $: activeLineIndex = transcript.findIndex((line, i) => {
    const nextLine = transcript[i + 1];
    return currentTime >= line.seconds && (!nextLine || currentTime < nextLine.seconds);
  });
  
  $: if (activeLineIndex !== -1 && transcriptContainer) {
      document.getElementById(`line-${activeLineIndex}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
</script>

<div class="flex flex-col h-screen bg-[#1a2e1a] text-[#e0f0e0] font-sans overflow-hidden select-none">
  
  <!-- Hidden Real Players -->
  <audio bind:this={mainAudio} preload="metadata"></audio>
  <audio bind:this={aiAudio} preload="auto"></audio>

  <!-- Main Content -->
  <div class="flex-1 flex overflow-hidden relative">
    <!-- Left: Info -->
    <div class="hidden md:flex w-1/3 flex-col items-center justify-center p-8 border-r border-white/5 bg-[#142414]">
      <div class="w-64 h-64 rounded-2xl bg-gradient-to-br from-green-400 to-emerald-800 shadow-2xl flex items-center justify-center mb-8 relative">
        <span class="text-4xl font-bold text-white/90 text-center">罗永浩<br>x<br>影视飓风</span>
      </div>
      <h1 class="text-2xl font-bold text-white text-center mb-2">罗永浩 x 影视飓风Tim</h1>
      <p class="text-emerald-400 text-lg">罗永浩的十字路口</p>
    </div>

    <!-- Right: Transcript -->
    <div bind:this={transcriptContainer} class="flex-1 overflow-y-auto p-8 md:p-16 scroll-smooth pb-40">
      <div class="max-w-3xl mx-auto space-y-8">
        {#each transcript as line, i}
          <div id="line-{i}" 
               class="cursor-pointer transition-all duration-300 {activeLineIndex === i ? 'opacity-100 scale-105' : 'opacity-40 hover:opacity-60'}"
               on:click={() => seek(line.seconds)}>
            <div class="flex items-center gap-2 mb-2 text-sm font-bold uppercase tracking-wide">
                {#if line.type === 'generated'} <Sparkles class="w-3 h-3 text-indigo-400" /> {/if}
                <span class={line.type === 'generated' ? 'text-indigo-400' : 'text-emerald-500'}>{line.speaker}</span>
                <span class="text-xs text-white/20 font-mono font-normal">{formatTime(line.seconds)}</span>
            </div>
            <p class="text-2xl md:text-3xl font-medium leading-relaxed {line.type === 'generated' ? 'text-indigo-100 italic' : 'text-white'}">
                {line.content}
            </p>
          </div>
        {/each}
        {#if isThinking}
            <div class="flex items-center gap-3 text-indigo-300 animate-pulse mt-8">
                <Sparkles class="w-6 h-6" />
                <span class="text-xl">AI 正在生成平行对话...</span>
            </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- Bottom Player -->
  <div class="bg-[#1a2e1a]/95 backdrop-blur-xl border-t border-white/5 px-6 py-4 z-50">
    
    <!-- Progress Bar -->
    <div class="flex items-center gap-4 mb-4 group cursor-pointer"
         on:click={(e) => {
             const r = e.currentTarget.getBoundingClientRect();
             seek((e.clientX - r.left) / r.width * duration);
         }}>
      <span class="text-xs font-mono w-10 text-right opacity-60">{formatTime(currentTime)}</span>
      
      <div class="flex-1 h-2 bg-white/10 rounded-full relative overflow-hidden">
        <!-- Blocks Visualization -->
        {#each blocks as b}
            <div class="absolute top-0 bottom-0 {b.color} opacity-30 border-r border-black/10" 
                 style="left: {b.globalStart/duration*100}%; width: {b.duration/duration*100}%"></div>
        {/each}
        <!-- Playhead -->
        <div class="absolute top-0 bottom-0 bg-emerald-500 w-1 transition-all"
             style="left: {currentTime/duration*100}%">
             {#if blocks.find(b => currentTime >= b.globalStart && currentTime < b.globalEnd)?.type === 'generated'}
                <div class="absolute -top-1 -bottom-1 -left-1 -right-1 bg-indigo-500 blur-sm"></div>
             {/if}
        </div>
      </div>
      
      <span class="text-xs font-mono w-10 opacity-60">{formatTime(duration)}</span>
    </div>

    <!-- Controls -->
    <div class="flex justify-between items-center relative">
        <!-- Speed & AI -->
        <div class="flex gap-4 items-center flex-1">
            <button class="text-xs font-bold px-2 py-1 border border-white/20 rounded hover:bg-white/10 text-emerald-400" on:click={changeSpeed}>{playbackSpeed}x</button>
            <button class="flex items-center gap-2 text-xs font-bold text-white/60 hover:text-indigo-400 transition" on:click={() => { showInput = !showInput; tick().then(() => inputElement?.focus()); }}>
                <Sparkles class="w-4 h-4" />
                <span class="hidden md:inline">插话</span>
            </button>
        </div>

        <!-- Playback -->
        <div class="flex gap-8 items-center justify-center flex-1">
            <button on:click={() => seek(currentTime - 15)}><RotateCcw class="w-6 h-6 opacity-80 hover:scale-110 transition" /></button>
            <button on:click={togglePlay} class="bg-white text-black p-3 rounded-full hover:scale-105 transition shadow-lg shadow-emerald-900/40">
                {#if isPlaying}<Pause class="w-6 h-6 fill-current" />{:else}<Play class="w-6 h-6 fill-current ml-1" />{/if}
            </button>
            <button on:click={() => seek(currentTime + 30)}><RotateCw class="w-6 h-6 opacity-80 hover:scale-110 transition" /></button>
        </div>
        
        <div class="flex-1"></div>
        
        <!-- Input Overlay -->
        {#if showInput}
            <div class="absolute bottom-full left-0 right-0 mb-4 bg-[#142414] border border-white/10 rounded-xl p-4 shadow-2xl flex gap-3 animate-in slide-in-from-bottom-2">
                <input bind:this={inputElement} bind:value={userQuery} placeholder="输入你想问的问题..." class="flex-1 bg-black/30 border border-white/10 rounded px-3 text-white focus:outline-none focus:border-indigo-500" on:keydown={e => e.key === 'Enter' && handleAskQuestion()} />
                <button on:click={handleAskQuestion} class="bg-indigo-600 px-4 rounded text-white hover:bg-indigo-500"><Send class="w-4 h-4" /></button>
                <button on:click={() => showInput = false} class="text-white/40 hover:text-white"><X class="w-5 h-5" /></button>
            </div>
        {/if}
    </div>
  </div>
</div>