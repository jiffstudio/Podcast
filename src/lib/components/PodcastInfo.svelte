<script lang="ts">
  import { Heart, Share2 } from 'lucide-svelte';
</script>

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
