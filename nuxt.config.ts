// https://nuxt.com/docs/api/configuration/nuxt-config
import pkg from './package.json'

export default defineNuxtConfig({
  runtimeConfig: {
    public: {
      version: pkg.version
    }
  },
  modules: [
    '@nuxtjs/tailwindcss',
  ],
  app: {
    head: {
      title: 'NIP-06 | Nostr Basic key derivation from mnemonic seed phrase'
    }
  },
})
