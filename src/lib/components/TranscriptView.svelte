<script lang="ts">
  import { Sparkles } from 'lucide-svelte';
  import { transcript, virtualTime, activeLineIndex, isThinking } from '$lib/stores/player';

  export let onSeek: (time: number) => void;

  let transcriptContainer: HTMLElement;

  function formatTime(s: number) {
    if (!s) return "00:00";
    const min = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
  }

  $: if ($activeLineIndex !== -1 && transcriptContainer) {
      setTimeout(() => {
          document.getElementById(`line-${$activeLineIndex}`)?.scrollIntoView({ 
              behavior: 'smooth', 
              block: 'center' 
          });
      }, 50);
  }
</script>

<div bind:this={transcriptContainer} class="flex-1 overflow-y-auto p-8 md:p-16 scroll-smooth pb-40">
  <div class="max-w-3xl mx-auto space-y-8">
    {#each $transcript as line, i}
      <div 
        id="line-{i}" 
        class="cursor-pointer transition-all duration-300 {$activeLineIndex === i ? 'opacity-100 scale-105' : 'opacity-40 hover:opacity-60'}"
        on:click={() => onSeek(line.seconds)}
        on:keydown={(e) => e.key === 'Enter' && onSeek(line.seconds)}
        role="button"
        tabindex="0"
      >
        <div class="flex items-center gap-2 mb-2 text-sm font-bold uppercase tracking-wide">
          {#if line.type === 'generated'}
            <Sparkles class="w-3 h-3 text-indigo-400" />
          {/if}
          <span class={line.type === 'generated' ? 'text-indigo-400' : 'text-emerald-500'}>
            {line.speaker}
          </span>
          <span class="text-xs text-white/20 font-mono font-normal">
            {formatTime(line.seconds)}
          </span>
        </div>
        <p class="text-2xl md:text-3xl font-medium leading-relaxed {line.type === 'generated' ? 'text-indigo-100 italic' : 'text-white'}">
          {line.content}
        </p>
      </div>
    {/each}
    
    {#if $isThinking}
      <div class="flex items-center gap-3 text-indigo-300 animate-pulse mt-8">
        <Sparkles class="w-6 h-6" />
        <span class="text-xl">AI 正在生成平行对话...</span>
      </div>
    {/if}
  </div>
</div>

