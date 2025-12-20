<script lang="ts">
  import { Heart, Share2 } from 'lucide-svelte';
</script>

<div class="hidden md:flex w-1/3 flex-col items-center justify-center p-8 border-r border-white/5 bg-[#142414]">
  <div class="w-64 h-64 rounded-2xl bg-gradient-to-br from-green-400 to-emerald-800 shadow-2xl flex items-center justify-center mb-8 relative group">
    <span class="text-4xl font-bold text-white/90 text-center">罗永浩<br>x<br>影视飓风</span>
    <div class="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors rounded-2xl"></div>
  </div>
  
  <h1 class="text-2xl font-bold text-white text-center mb-2">罗永浩 x 影视飓风Tim</h1>
  <p class="text-emerald-400 text-lg">罗永浩的十字路口</p>
  
  <div class="mt-8 flex gap-4">
    <button class="p-2 rounded-full hover:bg-white/10 transition" title="分享">
      <Share2 class="w-5 h-5 opacity-70" />
    </button>
    <button class="p-2 rounded-full hover:bg-white/10 transition" title="喜欢">
      <Heart class="w-5 h-5 opacity-70" />
    </button>
  </div>
</div>

