<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import {
  generateSeedWords,
  validateWords,
  privateKeyFromSeedWords,
  getPublicKey,
  getBech32PrivateKey,
  getBech32PublicKey
} from 'nip06'
import { wordlist } from '@scure/bip39/wordlists/english.js'

type Mnemonic = { word: string }

const mnemonicSize = ref(12)
const mnemonicWords = ref<Mnemonic[]>([])
const passphrase = ref('')
const isHexFormat = ref(true)
const activeIndex = ref<number | null>(null)
const highlightedSuggestion = ref(-1)
const wordInputRefs = ref<(HTMLInputElement | null)[]>([])
let blurTimeout: ReturnType<typeof setTimeout> | null = null

const combinedMnemonic = computed(() => mnemonicWords.value.map(({ word }) => word.trim().toLowerCase()).join(' ').trim())
const isFilled = computed(() => combinedMnemonic.value.length > 0)
const isMnemonicValid = computed(() => {
  const { isMnemonicValid } = validateWords({ mnemonic: combinedMnemonic.value })
  return isMnemonicValid
})
const privateKeyHex = computed(() => {
  if (!isMnemonicValid.value) return ''
  const { privateKey } = privateKeyFromSeedWords({
    mnemonic: combinedMnemonic.value,
    passphrase: passphrase.value
  })
  return privateKey
})
const publicKeyHex = computed(() => {
  if (!isMnemonicValid.value) return ''
  const { publicKey } = getPublicKey({
    privateKey: privateKeyHex.value
  })
  return publicKey
})
const privateKeyBech32 = computed(() => {
  if (!isMnemonicValid.value) return ''
  const { bech32PrivateKey } = getBech32PrivateKey({
    privateKey: privateKeyHex.value
  })
  return bech32PrivateKey
})
const publicKeyBech32 = computed(() => {
  if (!isMnemonicValid.value) return ''
  const { bech32PublicKey } = getBech32PublicKey({
    publicKey: publicKeyHex.value
  })
  return bech32PublicKey
})

function generateRandomMnemonic() {
  const { mnemonic } = generateSeedWords()
  fillMnemonic(mnemonic)
}

function fillMnemonic(mnemonic: string) {
  mnemonic.split(' ').forEach((word, index) => {
    mnemonicWords.value[index] = { word }
  })
}

function onPaste(event: ClipboardEvent) {
  const text = event.clipboardData?.getData('text') ?? ''
  const mnemonic = text.trim().split(/\s+/).join(' ')
  const { isMnemonicValid } = validateWords({ mnemonic })
  if (isMnemonicValid) {
    event.preventDefault()
    fillMnemonic(mnemonic)
  }
}

function toggleFormat() {
  isHexFormat.value = !isHexFormat.value
}

function resetForm() {
  mnemonicWords.value = []
  for (let i = 0; i < mnemonicSize.value; i++) {
    mnemonicWords.value.push({ word: '' })
  }
  passphrase.value = ''
}

const suggestions = computed(() => {
  if (activeIndex.value === null) return []
  const input = mnemonicWords.value[activeIndex.value]?.word.trim().toLowerCase()
  if (!input || input.length < 1) return []
  return wordlist.filter(w => w.startsWith(input)).slice(0, 8)
})

function onFocus(index: number) {
  if (blurTimeout) {
    clearTimeout(blurTimeout)
    blurTimeout = null
  }
  activeIndex.value = index
  highlightedSuggestion.value = -1
}

function onBlur() {
  blurTimeout = setTimeout(() => {
    activeIndex.value = null
    highlightedSuggestion.value = -1
  }, 150)
}

function onKeydown(event: KeyboardEvent, index: number) {
  if (!suggestions.value.length) return

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    highlightedSuggestion.value = Math.min(highlightedSuggestion.value + 1, suggestions.value.length - 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    highlightedSuggestion.value = Math.max(highlightedSuggestion.value - 1, -1)
  } else if (event.key === 'Enter') {
    if (highlightedSuggestion.value >= 0) {
      event.preventDefault()
      selectSuggestion(index, suggestions.value[highlightedSuggestion.value])
    } else if (suggestions.value.length === 1) {
      event.preventDefault()
      selectSuggestion(index, suggestions.value[0])
    }
  } else if (event.key === 'Escape') {
    activeIndex.value = null
    highlightedSuggestion.value = -1
  }
}

function selectSuggestion(index: number, word: string) {
  mnemonicWords.value[index] = { word }
  activeIndex.value = null
  highlightedSuggestion.value = -1
  if (index < mnemonicSize.value - 1) {
    nextTick(() => {
      wordInputRefs.value[index + 1]?.focus()
    })
  }
}

function setWordInputRef(el: Element | ComponentPublicInstance | null, index: number) {
  wordInputRefs.value[index] = el as HTMLInputElement | null
}

onMounted(() => {
  resetForm()
})

onUnmounted(() => {
  if (blurTimeout) {
    clearTimeout(blurTimeout)
    blurTimeout = null
  }
})

const appVersion = __APP_VERSION__
</script>

<template>
  <nav class="navbar" role="navigation" aria-label="main navigation">
    <div class="navbar-brand">
      <span class="navbar-item">
        NIP-06
      </span>
    </div>

    <div class="navbar-menu">
      <div class="navbar-start">
        <span class="navbar-item">
          Basic key derivation from mnemonic seed phrase
        </span>
      </div>
    </div>
  </nav>

  <section class="hero is-fullheight-with-navbar">
    <div class="hero-body">
      <div class="container">
        <div class="columns">
          <div class="column">
            <p class="block has-text-centered">
              You can enter an existing <a href="https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki" target="_blank" class="has-text-link">BIP39 mnemonic</a>, or generate a new random one.
            </p>
            <form action="">
              <div class="buttons has-addons is-centered">
                <button
                  @click.prevent="generateRandomMnemonic"
                  type="button"
                  class="button"
                >
                  generate random mnemonic
                </button>

                <button
                  v-if="isFilled"
                  @click.prevent="resetForm"
                  type="button"
                  class="button"
                >
                  reset
                </button>
              </div>

              <div
                v-for="(mnemonic, index) in mnemonicWords"
                :key="`word-${index + 1}`"
                class="field"
              >
                <div
                  class="dropdown"
                  :class="{ 'is-active': activeIndex === index && suggestions.length > 0 }"
                  style="width: 100%"
                >
                  <div class="dropdown-trigger" style="width: 100%">
                    <div class="control has-icons-left has-icons-right">
                      <input
                        :ref="(el) => setWordInputRef(el, index)"
                        v-model="mnemonic.word"
                        @paste="onPaste"
                        @focus="onFocus(index)"
                        @blur="onBlur"
                        @keydown="onKeydown($event, index)"
                        class="input"
                        type="text"
                        autocomplete="off"
                        role="combobox"
                        aria-autocomplete="list"
                        :aria-expanded="activeIndex === index && suggestions.length > 0"
                        :aria-activedescendant="highlightedSuggestion >= 0 ? `suggestion-${index}-${highlightedSuggestion}` : undefined"
                      />
                      <span class="icon is-small is-left"> {{ index + 1 }} </span>
                    </div>
                  </div>
                  <div class="dropdown-menu" style="width: 100%" role="listbox">
                    <div class="dropdown-content">
                      <a
                        v-for="(suggestion, sIndex) in suggestions"
                        :id="`suggestion-${index}-${sIndex}`"
                        :key="suggestion"
                        class="dropdown-item"
                        :class="{ 'is-active': highlightedSuggestion === sIndex }"
                        role="option"
                        :aria-selected="highlightedSuggestion === sIndex"
                        @mousedown.prevent="selectSuggestion(index, suggestion)"
                      >
                        {{ suggestion }}
                      </a>
                    </div>
                  </div>
                </div>
              </div>
              <div class="field">
                <div class="control has-icons-left has-icons-right">
                  <input v-model="passphrase" class="input" type="text" placeholder="Passphrase" />
                </div>
              </div>
            </form>
          </div>
          <div class="column">
            <div v-if="isFilled && isMnemonicValid">
              <div class="buttons has-addons is-centered">
                <button
                  @click.prevent="toggleFormat"
                  :class="{ 'is-info': isHexFormat }"
                  class="button"
                >
                  hex format
                </button>
                <button
                  @click.prevent="toggleFormat"
                  :class="{ 'is-info': !isHexFormat }"
                  class="button"
                >
                  bech32 format
                </button>
              </div>
              <div v-if="isHexFormat" class="field">
                <label class="label">hex private key</label>
                <div class="control">
                  <input v-model="privateKeyHex" readonly class="input" type="text" />
                </div>
              </div>
              <div v-if="isHexFormat" class="field">
                <label class="label">hex public key</label>
                <div class="control">
                  <input v-model="publicKeyHex" readonly class="input" type="text" />
                </div>
              </div>
              <div v-if="!isHexFormat" class="field">
                <label class="label">bech32 private key</label>
                <div class="control">
                  <input v-model="privateKeyBech32" readonly class="input" type="text" />
                </div>
              </div>
              <div v-if="!isHexFormat" class="field">
                <label class="label">bech32 public key</label>
                <div class="control">
                  <input v-model="publicKeyBech32" readonly class="input" type="text" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <footer class="footer">
    <div class="content has-text-centered">
      <p>
        <strong>v{{ appVersion }}</strong> | made by <a href="https://github.com/jaonoctus/nip06-web" target="_blank" class="has-text-weight-semibold">jaonoctus</a> with <a href="https://vuejs.org" target="_blank">Vue.js</a>, <a href="https://bulma.io" target="_blank">Bulma</a>, <a href="https://github.com/jaonoctus/nip06" target="_blank">nip06</a> and <span class="has-text-danger has-text-weight-semibold">love</span>
      </p>
      <p>You can <a href="https://github.com/jaonoctus/nip06-web/releases" target="_blank">download the nip06-standalone.html</a> offline version from the latest GitHub release</p>
    </div>
  </footer>
</template>
