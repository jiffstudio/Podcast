<script lang="ts">
  import { Play, Pause, RotateCw, RotateCcw, Sparkles, Send, X, ListMusic, MessageSquare } from 'lucide-svelte';
  import { tick } from 'svelte';
  import { 
    currentTime, duration, isPlaying, blocks, playbackSpeed, 
    userQuery, showInput, togglePlay, setTime
  } from '$lib/stores/player';

  export let onAskQuestion: () => void;

  let inputEl: HTMLInputElement;

  function formatTime(s: number) {
    if (!s) return "00:00";
    const min = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
  }

  function changeSpeed() {
    const speeds = [1.0, 1.25, 1.5, 2.0, 0.5];
    const idx = speeds.indexOf($playbackSpeed);
    $playbackSpeed = speeds[(idx + 1) % speeds.length];
  }

  function handleSeek(e: MouseEvent) {
     const r = e.currentTarget.getBoundingClientRect();
     setTime((e.clientX - r.left) / r.width * $duration);
  }

  function toggleInput() {
      $showInput = !$showInput;
      if ($showInput) tick().then(() => inputEl?.focus());
  }

  // Derived check for active AI block
  $: isAiActive = $blocks.find(b => $currentTime >= b.globalStart && $currentTime < b.globalStart + b.duration)?.type === 'generated';
</script>

<div class="bg-[#1a2e1a]/95 backdrop-blur-xl border-t border-white/5 px-6 py-4 z-50">
    
    <!-- Progress Bar -->
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div class="flex items-center gap-4 mb-4 group cursor-pointer" on:click={handleSeek} role="slider" aria-valuenow={$currentTime} tabindex="0">
      <span class="text-xs font-mono w-10 text-right opacity-60">{formatTime($currentTime)}</span>
      
      <div class="flex-1 h-2 bg-white/10 rounded-full relative overflow-hidden">
        <!-- Blocks Visualization -->
        {#each $blocks as b}
            <div class="absolute top-0 bottom-0 {b.color} opacity-30 border-r border-black/10" 
                 style="left: {b.globalStart/$duration*100}%; width: {b.duration/$duration*100}%"></div>
        {/each}
        <!-- Playhead -->
        <div class="absolute top-0 bottom-0 bg-emerald-500 w-1 transition-all"
             style="left: {$currentTime/$duration*100}%">
             {#if isAiActive}
                <div class="absolute -top-1 -bottom-1 -left-1 -right-1 bg-indigo-500 blur-sm"></div>
             {/if}
        </div>
      </div>
      
      <span class="text-xs font-mono w-10 opacity-60">{formatTime($duration)}</span>
    </div>

    <!-- Mobile Title (Simplified) -->
    <div class="md:hidden flex items-center gap-3 mb-6">
       <div class="overflow-hidden">
         <h2 class="text-sm font-bold text-white truncate">罗永浩 x 影视飓风Tim</h2>
       </div>
    </div>

    <!-- Controls -->
    <div class="flex justify-between items-center relative">
        <!-- Speed & AI -->
        <div class="flex gap-4 items-center flex-1">
            <button class="text-xs font-bold px-2 py-1 border border-white/20 rounded hover:bg-white/10 text-emerald-400" on:click={changeSpeed}>{$playbackSpeed}x</button>
            <button class="flex items-center gap-2 text-xs font-bold text-white/60 hover:text-indigo-400 transition" on:click={toggleInput}>
                <Sparkles class="w-4 h-4" />
                <span class="hidden md:inline">插话</span>
            </button>
        </div>

        <!-- Playback -->
        <div class="flex gap-8 items-center justify-center flex-1">
            <button on:click={() => setTime($currentTime - 15)}><RotateCcw class="w-6 h-6 opacity-80 hover:scale-110 transition" /></button>
            <button on:click={togglePlay} class="bg-white text-black p-3 rounded-full hover:scale-105 transition shadow-lg shadow-emerald-900/40 relative">
                {#if $isPlaying}<Pause class="w-6 h-6 fill-current" />{:else}<Play class="w-6 h-6 fill-current ml-1" />{/if}
            </button>
            <button on:click={() => setTime($currentTime + 30)}><RotateCw class="w-6 h-6 opacity-80 hover:scale-110 transition" /></button>
        </div>
        
        <!-- Right Icons -->
        <div class="flex items-center gap-6 flex-1 justify-end">
            <button class="hover:text-emerald-400 transition"><ListMusic class="w-5 h-5" /></button>
            <button class="hover:text-emerald-400 transition"><MessageSquare class="w-5 h-5" /></button>
        </div>
        
        <!-- Input Overlay -->
        {#if $showInput}
            <div class="absolute bottom-full left-0 right-0 mb-4 bg-[#142414] border border-white/10 rounded-xl p-4 shadow-2xl flex gap-3 animate-in slide-in-from-bottom-2 z-[60]">
                <input bind:this={inputEl} bind:value={$userQuery} placeholder="输入你想问的问题..." class="flex-1 bg-black/30 border border-white/10 rounded px-3 text-white focus:outline-none focus:border-indigo-500" on:keydown={e => e.key === 'Enter' && onAskQuestion()} />
                <button on:click={onAskQuestion} class="bg-indigo-600 px-4 rounded text-white hover:bg-indigo-500"><Send class="w-4 h-4" /></button>
                <button on:click={() => $showInput = false} class="text-white/40 hover:text-white"><X class="w-5 h-5" /></button>
            </div>
        {/if}
    </div>
</div>
