<script setup>
const { public: { version } } = useRuntimeConfig()
</script>

<template>
  <footer class="mt-24 sm:mt-12">
    <div class="mx-auto max-w-md overflow-hidden py-12 px-6 sm:max-w-3xl lg:max-w-7xl lg:px-8">
      <p class="mt-8 text-center text-base text-gray-400">v{{ version }} | made by <a href="https://github.com/jaonoctus/nip06-web" target="_blank" class="font-medium text-indigo-600">jaonoctus</a></p>
    </div>
  </footer>
</template>
