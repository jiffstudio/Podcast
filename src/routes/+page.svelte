<script lang="ts">
  import { onDestroy } from 'svelte';
  import { 
    Play, Pause, SkipBack, SkipForward, Clock, Heart, 
    Share2, ListMusic, MessageSquare, Info,
    RotateCw, RotateCcw, Settings2 
  } from 'lucide-svelte';
  
  let isPlaying = false;
  let currentTime = 3; // seconds
  let duration = 985; // 16:25 total (approx based on -16:22)
  let playbackSpeed = 1.0;
  let interval: ReturnType<typeof setInterval>;

  const togglePlay = () => {
    isPlaying = !isPlaying;
    updateInterval();
  };

  const updateInterval = () => {
    if (interval) clearInterval(interval);
    if (isPlaying) {
      interval = setInterval(() => {
        if (currentTime < duration) {
          currentTime += 1;
        } else {
          isPlaying = false;
          clearInterval(interval);
        }
      }, 1000 / playbackSpeed);
    }
  };

  const changeSpeed = () => {
    const speeds = [1.0, 1.25, 1.5, 2.0, 0.5];
    const currentIndex = speeds.indexOf(playbackSpeed);
    playbackSpeed = speeds[(currentIndex + 1) % speeds.length];
    if (isPlaying) updateInterval();
  };
  
  onDestroy(() => {
    if (interval) clearInterval(interval);
  });
  
  const formatTime = (seconds: number) => {
    const m = Math.floor(Math.abs(seconds) / 60);
    const s = Math.floor(Math.abs(seconds) % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const transcript = [
    "节目一开始用十秒钟为自己拉拉票。",
    "二零二五小宇宙播客大赏正在预热评选。",
    "如果您喜欢摸鱼，早报，请为他投出宝贵一票。",
    "今天的节目您将听到海南自贸港风光跨年火车票",
    "开售蜜雪冰城的美国手店进入开业倒计时，外国",
    "人一年就吃掉了一亿元的螺蛳粉，最大规模的哈",
    "尔滨冰雪大世界开源药妆连锁店，万宁关闭了内",
    "地所有门店节目。",
    " ",
    "最后的消费热新闻，我们来说一说 AI 健康应用",
    "来势汹汹，有何神通？"
  ];

  // Mock progress percentage
  $: progress = (currentTime / duration) * 100;
  $: remainingTime = currentTime - duration;
</script>

<div class="flex flex-col h-screen bg-[#1a2e1a] text-[#e0f0e0] font-sans overflow-hidden selection:bg-[#4ade80] selection:text-[#1a2e1a]">
  
  <!-- Main Content Area -->
  <div class="flex-1 flex overflow-hidden relative">
    
    <!-- Left Panel: Podcast Info & Cover -->
    <div class="hidden md:flex w-1/3 flex-col items-center justify-center p-8 border-r border-white/5 bg-[#142414]">
      <div class="w-64 h-64 rounded-2xl bg-gradient-to-br from-green-400 to-emerald-800 shadow-2xl flex items-center justify-center mb-8 relative group overflow-hidden">
        <!-- Mock Cover Art -->
        <span class="text-4xl font-bold text-white/90">摸鱼<br>早报</span>
        <div class="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors"></div>
      </div>
      
      <div class="text-center space-y-2 max-w-md">
        <h1 class="text-2xl font-bold text-white leading-tight">084-海南自贸港封关带来新机遇/跨年火...</h1>
        <p class="text-emerald-400 text-lg font-medium hover:underline cursor-pointer">摸鱼早报</p>
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
    <div class="flex-1 overflow-y-auto p-8 md:p-16 scroll-smooth relative">
      <div class="max-w-3xl mx-auto space-y-8 py-10">
        {#each transcript as line, i}
          <p class="text-2xl md:text-3xl lg:text-4xl leading-relaxed font-medium transition-all duration-300
            {i === 2 || i === 3 ? 'text-white scale-100' : 'text-white/40 scale-95 blur-[0.5px] hover:text-white/60 hover:blur-0 cursor-pointer'}">
            {line}
          </p>
        {/each}
        
        <!-- Fading overlay for bottom of transcript -->
        <div class="fixed bottom-[120px] left-1/3 right-0 h-32 bg-gradient-to-t from-[#1a2e1a] to-transparent pointer-events-none hidden md:block"></div>
      </div>
    </div>

  </div>

  <!-- Bottom Player Bar -->
  <div class="h-auto md:h-32 bg-[#1a2e1a]/95 backdrop-blur-xl border-t border-white/5 flex flex-col justify-center px-6 py-4 md:px-12 relative z-50">
    
    <!-- Progress Bar -->
    <div class="w-full flex items-center gap-4 mb-4 group cursor-pointer">
      <span class="text-xs font-mono opacity-60 w-10 text-right">{formatTime(currentTime)}</span>
      <div class="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden relative">
        <div class="absolute top-0 left-0 h-full bg-emerald-500 rounded-full" style="width: {progress}%"></div>
        <!-- Hover handle -->
        <div class="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity" style="left: {progress}%"></div>
      </div>
      <span class="text-xs font-mono opacity-60 w-12 text-right">{remainingTime < 0 ? '-' : ''}{formatTime(remainingTime)}</span>
    </div>

    <!-- Mobile-only Title Display -->
    <div class="md:hidden flex items-center gap-3 mb-6">
      <div class="w-10 h-10 rounded bg-gradient-to-br from-green-400 to-emerald-800 flex items-center justify-center shrink-0">
        <span class="text-[10px] font-bold text-white/90 leading-tight">摸鱼<br>早报</span>
      </div>
      <div class="overflow-hidden">
         <h2 class="text-sm font-bold text-white truncate">084-海南自贸港封关带来新机遇/跨年火...</h2>
         <p class="text-xs text-emerald-400">摸鱼早报</p>
      </div>
    </div>

    <!-- Controls Row -->
    <div class="flex items-center justify-between">
      
      <!-- Left Controls (Speed, etc) -->
      <div class="flex items-center gap-6 flex-1">
        <button class="text-xs font-bold border border-white/20 rounded px-2 py-1 hover:bg-white/10 transition text-emerald-400" on:click={changeSpeed}>
          {playbackSpeed.toFixed(1)}x
        </button>
        <button class="hover:text-emerald-400 transition" title="Sleep Timer">
           <Clock class="w-5 h-5" />
        </button>
      </div>

      <!-- Center Controls (Play/Skip) -->
      <div class="flex items-center gap-8 justify-center flex-1">
        <button class="hover:text-white transition hover:scale-110 active:scale-95" on:click={() => currentTime = Math.max(0, currentTime - 15)}>
          <div class="relative">
            <RotateCcw class="w-7 h-7" />
            <span class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[8px] font-bold mt-0.5">15</span>
          </div>
        </button>

        <button class="bg-white text-black rounded-full p-4 hover:scale-105 active:scale-95 transition shadow-lg shadow-emerald-900/20" on:click={togglePlay}>
          {#if isPlaying}
            <Pause class="w-8 h-8 fill-current" />
          {:else}
            <Play class="w-8 h-8 fill-current ml-1" />
          {/if}
        </button>

        <button class="hover:text-white transition hover:scale-110 active:scale-95" on:click={() => currentTime = Math.min(duration, currentTime + 30)}>
          <div class="relative">
             <RotateCw class="w-7 h-7" />
             <span class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[8px] font-bold mt-0.5">30</span>
          </div>
        </button>
      </div>

      <!-- Right Controls (Playlist, etc) -->
      <div class="flex items-center gap-6 flex-1 justify-end">
        <button class="hover:text-emerald-400 transition">
          <Info class="w-5 h-5" />
        </button>
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

