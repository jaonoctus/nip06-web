<script setup>
import {
  generateSeedWords,
  validateWords,
  privateKeyFromSeedWords,
  getPublicKey,
  getBech32PrivateKey,
  getBech32PublicKey
} from 'nip06'

const passphrase = ref('')
const seedWords = ref([])
const isHexFormat = ref(true)

const mnemonic = computed(() => seedWords.value.map(({ word }) => word).join(' ').trim())

const isValid = computed(() => {
  const { isMnemonicValid } = validateWords({ mnemonic: mnemonic.value })
  return isMnemonicValid
})

const isFilled = computed(() => mnemonic.value.length > 0)

const privateKeyHex = computed(() => {
  const { privateKey } = privateKeyFromSeedWords({ mnemonic: mnemonic.value, passphrase: passphrase.value })
  return privateKey
})

const publicKeyHex = computed(() => {
  const { publicKey } = getPublicKey({ privateKey: privateKeyHex.value })
  return publicKey
})

const privateKeyInput = computed(() => {
  if (!isValid) {
    return ''
  }
  if (isHexFormat.value) {
    return privateKeyHex.value
  }
  const { bech32PrivateKey } = getBech32PrivateKey({ privateKey: publicKeyHex.value })
  return bech32PrivateKey
})

const publicKeyInput = computed(() => {
  if (!isValid) {
    return ''
  }
  if (isHexFormat.value) {
    return publicKeyHex.value
  }
  const { bech32PublicKey } = getBech32PublicKey({ publicKey: publicKeyHex.value })
  return bech32PublicKey
})

function resetForm() {
  seedWords.value = []
  for(let i = 0; i<12; i++) {
    seedWords.value.push({ word: ''})
  }
  passphrase.value = ''
}

function generateRandomMnemonic() {
  const { mnemonic: randomMnemonic } = generateSeedWords()

  randomMnemonic.split(' ').forEach((word, index) => {
    seedWords.value[index].word = word
  })
}

function toggleFormat() {
  isHexFormat.value = !isHexFormat.value
}

onBeforeMount(() => {
  resetForm()
})
</script>

<template>
  <div>
    <main>
      <div class="overflow-hidden pt-8 sm:pt-12 lg:relative lg:py-36">
        <div class="mx-auto max-w-md px-6 sm:max-w-3xl lg:grid lg:max-w-7xl lg:grid-cols-2 lg:gap-24 lg:px-8">
          <div>
            <the-title />
            <div>
              <p class="text-sm">
                You can enter an existing <a href="https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki" target="_blank" class="font-medium text-indigo-600">BIP39 mnemonic</a>, or generate a new random one.
              </p>
              <form @submit.prevent="">
                <div class="mt-12">
                  <button
                    @click.prevent="generateRandomMnemonic"
                    type="button"
                    class="text-gray-700 relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-100"
                  >
                    generate random mnemonic
                  </button>
                  <button
                    v-if="isFilled"
                    @click.prevent="resetForm"
                    type="button"
                    class="text-gray-700 ml-1 relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-100"
                  >
                    reset
                  </button>
                </div>
                <div class="mt-10">
                  <div
                    v-for="(word, n) in seedWords"
                    :key="`word-${n}`"
                    class="mt-1 sm:col-span-2"
                  >
                    <div class="flex max-w-lg rounded-md shadow-sm">
                      <span class="inline-flex w-10 items-center justify-center rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 sm:text-sm">
                        {{ n+1 }}
                      </span>
                      <input
                        v-model="word.word"
                        :name="`word-${n+1}`"
                        :id="`word-${n+1}`"
                        type="text"
                        autocomplete="false"
                        class="block w-full min-w-0 flex-1 rounded-none rounded-r-md border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      />
                    </div>
                  </div>
                  <div class="mt-1 sm:col-span-2">
                    <div class="flex max-w-lg rounded-md shadow-sm">
                      <span class="inline-flex px-4 items-center justify-center rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 sm:text-sm">
                        passphrase
                      </span>
                      <input
                        v-model="passphrase"
                        type="text"
                        autocomplete="false"
                        class="block w-full min-w-0 flex-1 rounded-none rounded-r-md border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      />
                    </div>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>

        <div v-if="isValid" class="sm:mx-auto sm:max-w-3xl sm:px-6">
          <div class="py-12 sm:mt-12 sm:py-16 lg:absolute lg:inset-y-0 lg:right-0 lg:w-1/2 mr-12">
            <div class="relative -mr-40 pl-6 sm:mx-auto sm:max-w-3xl sm:px-0 lg:h-full lg:max-w-none lg:pl-12">
              <div>
                <span class="isolate inline-flex rounded-md shadow-sm">
                  <button @click.prevent="toggleFormat" :class="{ 'text-rose-700': isHexFormat, 'text-gray-700': !isHexFormat }" type="button" class="relative inline-flex items-center rounded-l-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50 focus:z-10 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                    hex format
                  </button>
                  <button @click.prevent="toggleFormat" :class="{ 'text-rose-700': !isHexFormat, 'text-gray-700': isHexFormat }" type="button" class="relative -ml-px inline-flex items-center rounded-r-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50 focus:z-10 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                    bech32 format
                  </button>
                </span>
              </div>

              <div class="mt-1 sm:col-span-2">
                <div class="flex max-w-3xl rounded-md shadow-sm">
                  <span class="w-36 inline-flex px-4 items-center justify-center rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 sm:text-sm">
                    private key
                  </span>
                  <input
                    v-model="privateKeyInput"
                    readonly
                    type="text"
                    autocomplete="false"
                    class="block w-full min-w-0 flex-1 rounded-none rounded-r-md border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  />
                </div>
              </div>
              <div class="mt-1 sm:col-span-2">
                <div class="flex max-w-3xl rounded-md shadow-sm">
                  <span class="w-36 inline-flex px-4 items-center justify-center rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 sm:text-sm">
                    public key
                  </span>
                  <input
                    v-model="publicKeyInput"
                    readonly
                    type="text"
                    autocomplete="false"
                    class="block w-full min-w-0 flex-1 rounded-none rounded-r-md border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
    <the-footer />
  </div>
</template>
