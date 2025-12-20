<script lang="ts">
  import { tick } from 'svelte';
  import { Play, Pause, RotateCw, RotateCcw, Send, Sparkles, X } from 'lucide-svelte';
  import { 
    virtualTime, totalDuration, isPlaying, playbackSpeed, 
    segments, userQuery, showInput, progress
  } from '$lib/stores/player';

  export let onTogglePlay: () => void;
  export let onSeek: (time: number) => void;
  export let onChangeSpeed: () => void;
  export let onAskQuestion: () => void;

  let inputElement: HTMLInputElement;

  function formatTime(s: number) {
    if (!s) return "00:00";
    const min = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
  }

  function handleShowInput() {
    $showInput = !$showInput;
    tick().then(() => inputElement?.focus());
  }

  function handleProgressClick(e: MouseEvent) {
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    onSeek($totalDuration * percentage);
  }
</script>

<div class="bg-[#1a2e1a]/95 backdrop-blur-xl border-t border-white/5 px-6 py-4 z-50">
  
  <!-- Progress Bar -->
  <div 
    class="flex items-center gap-4 mb-4 group cursor-pointer"
    on:click={handleProgressClick}
    on:keydown={() => {}}
    role="slider"
    aria-valuenow={$progress}
    tabindex="0"
  >
    <span class="text-xs font-mono w-10 text-right opacity-60">
      {formatTime($virtualTime)}
    </span>
    
    <div class="flex-1 h-2 bg-white/10 rounded-full relative overflow-hidden">
      <!-- Segments Visualization -->
      {#each $segments as seg}
        <div 
          class="absolute top-0 bottom-0 {seg.color} opacity-30 border-r border-black/10" 
          style="left: {seg.virtualStart/$totalDuration*100}%; width: {(seg.virtualEnd - seg.virtualStart)/$totalDuration*100}%"
        ></div>
      {/each}
      
      <!-- Playhead -->
      <div 
        class="absolute top-0 bottom-0 bg-emerald-500 w-1 transition-all"
        style="left: {$progress}%"
      >
        {#if $segments.find(s => $virtualTime >= s.virtualStart && $virtualTime < s.virtualEnd)?.type === 'ai'}
          <div class="absolute -top-1 -bottom-1 -left-1 -right-1 bg-indigo-500 blur-sm"></div>
        {/if}
      </div>
    </div>
    
    <span class="text-xs font-mono w-10 opacity-60">
      {formatTime($totalDuration)}
    </span>
  </div>

  <!-- Controls -->
  <div class="flex justify-between items-center relative">
    <!-- Speed & AI -->
    <div class="flex gap-4 items-center flex-1">
      <button 
        class="text-xs font-bold px-2 py-1 border border-white/20 rounded hover:bg-white/10 text-emerald-400" 
        on:click={onChangeSpeed}
      >
        {$playbackSpeed}x
      </button>
      
      <button 
        class="flex items-center gap-2 text-xs font-bold text-white/60 hover:text-indigo-400 transition" 
        on:click={handleShowInput}
      >
        <Sparkles class="w-4 h-4" />
        <span class="hidden md:inline">插话</span>
      </button>
    </div>

    <!-- Playback -->
    <div class="flex gap-8 items-center justify-center flex-1">
      <button on:click={() => onSeek($virtualTime - 15)}>
        <RotateCcw class="w-6 h-6 opacity-80 hover:scale-110 transition" />
      </button>
      
      <button 
        on:click={onTogglePlay} 
        class="bg-white text-black p-3 rounded-full hover:scale-105 transition shadow-lg shadow-emerald-900/40"
      >
        {#if $isPlaying}
          <Pause class="w-6 h-6 fill-current" />
        {:else}
          <Play class="w-6 h-6 fill-current ml-1" />
        {/if}
      </button>
      
      <button on:click={() => onSeek($virtualTime + 30)}>
        <RotateCw class="w-6 h-6 opacity-80 hover:scale-110 transition" />
      </button>
    </div>
    
    <div class="flex-1"></div>
    
    <!-- Input Overlay -->
    {#if $showInput}
      <div class="absolute bottom-full left-0 right-0 mb-4 bg-[#142414] border border-white/10 rounded-xl p-4 shadow-2xl flex gap-3 animate-in slide-in-from-bottom-2">
        <input 
          bind:this={inputElement}
          bind:value={$userQuery}
          placeholder="输入你想问的问题..." 
          class="flex-1 bg-black/30 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-indigo-500" 
          on:keydown={e => e.key === 'Enter' && onAskQuestion()}
        />
        <button 
          on:click={onAskQuestion} 
          class="bg-indigo-600 px-4 rounded text-white hover:bg-indigo-500"
        >
          <Send class="w-4 h-4" />
        </button>
        <button 
          on:click={() => $showInput = false} 
          class="text-white/40 hover:text-white"
        >
          <X class="w-5 h-5" />
        </button>
      </div>
    {/if}
  </div>
</div>

