<script lang="ts">
  import { Sparkles, Loader2 } from 'lucide-svelte';
  import { transcript, virtualTime, activeLineIndex, isThinking } from '$lib/stores/player';

  export let onSeek: (time: number) => void;
  export let pendingInsertIndex: number | null = null; // New prop for insertion animation

  let transcriptContainer: HTMLElement;
  let pendingElement: HTMLElement;

  function formatTime(s: number) {
    if (!s) return "00:00";
    const min = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
  }

  // Scroll active line into view
  $: if ($activeLineIndex !== -1 && transcriptContainer) {
      setTimeout(() => {
          document.getElementById(`line-${$activeLineIndex}`)?.scrollIntoView({ 
              behavior: 'smooth', 
              block: 'center' 
          });
      }, 50);
  }

  // Scroll pending animation into view when it appears
  $: if (pendingInsertIndex !== null && pendingElement) {
      setTimeout(() => {
          pendingElement.scrollIntoView({ 
              behavior: 'smooth', 
              block: 'center' 
          });
      }, 100);
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

      <!-- Pending Insertion Animation -->
      {#if pendingInsertIndex === i}
        <div bind:this={pendingElement} class="relative my-12 py-8 group">
           <!-- Glowing gradient background -->
           <div class="absolute inset-0 bg-gradient-to-r from-transparent via-indigo-500/10 to-transparent blur-xl group-hover:via-indigo-500/20 transition-all duration-1000"></div>
           
           <div class="relative flex flex-col items-center justify-center gap-4">
              <!-- Animated connection line -->
              <div class="h-8 w-[1px] bg-gradient-to-b from-transparent to-indigo-500/50"></div>
              
              <!-- Central pulsing core -->
              <div class="relative">
                <div class="absolute inset-0 bg-indigo-500 blur-lg animate-pulse"></div>
                <div class="relative bg-black rounded-full p-3 border border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.5)]">
                  <Sparkles class="w-6 h-6 text-indigo-400 animate-spin-slow" />
                </div>
              </div>

              <!-- Animated waves -->
              <div class="flex items-center gap-1 h-4">
                {#each Array(5) as _, j}
                  <div 
                    class="w-1 bg-indigo-500/50 rounded-full animate-wave" 
                    style="animation-delay: {j * 0.1}s; height: 100%"
                  ></div>
                {/each}
              </div>
              
              <div class="h-8 w-[1px] bg-gradient-to-b from-indigo-500/50 to-transparent"></div>
           </div>
        </div>
      {/if}

    {/each}
    
    {#if $isThinking && pendingInsertIndex === null}
      <div class="flex items-center gap-3 text-indigo-300 animate-pulse mt-8 justify-center">
        <Sparkles class="w-6 h-6" />
        <span class="text-xl">AI 正在思考...</span>
      </div>
    {/if}
  </div>
</div>

<style>
  @keyframes wave {
    0%, 100% { height: 4px; opacity: 0.3; }
    50% { height: 16px; opacity: 1; }
  }
  .animate-wave {
    animation: wave 1s ease-in-out infinite;
  }
  .animate-spin-slow {
    animation: spin 3s linear infinite;
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>

