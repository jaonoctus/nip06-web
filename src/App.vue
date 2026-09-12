<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import { computed, nextTick, onBeforeUnmount, onMounted, onUnmounted, ref } from 'vue'
import {
  generateSeedWords,
  validateWords,
  privateKeyFromSeedWords,
  getPublicKey,
  getBech32PrivateKey,
  getBech32PublicKey
} from 'nip06'
import { entropyToMnemonic, mnemonicToEntropy } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'

type Mnemonic = { word: string }

const warningDismissed = ref(false)
const acknowledgeInput = ref('')
const canContinue = computed(() => acknowledgeInput.value.trim().toUpperCase() === 'I UNDERSTAND')

const isCollecting = ref(false)
const entropySamples = ref(0)
const entropyTargetSamples = 512
const entropyMinDistance = 4
const entropyProgress = computed(() => Math.min(entropySamples.value / entropyTargetSamples, 1) * 100)
const entropyComplete = computed(() => entropySamples.value >= entropyTargetSamples)
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

// Each pointer sample stores x (uint16), y (uint16) and a float64 high-resolution timestamp.
const entropyBytesPerSample = 12
const entropyBuffer = new Uint8Array(entropyTargetSamples * entropyBytesPerSample)
const entropyView = new DataView(entropyBuffer.buffer)
let lastTracePoint = { x: -1, y: -1 }
let canvasRef: HTMLCanvasElement | null = null

function openEntropyModal() {
  entropyBuffer.fill(0)
  entropySamples.value = 0
  lastTracePoint = { x: -1, y: -1 }
  isCollecting.value = true
  nextTick(() => setupEntropyCanvas())
}

function closeEntropyModal() {
  isCollecting.value = false
  entropyBuffer.fill(0)
  entropySamples.value = 0
}

function generateRandomMnemonic() {
  if (!warningDismissed.value) return
  openEntropyModal()
}

async function completeEntropyCollection() {
  if (!entropyComplete.value) return

  // Source 1: pointer movement collected on the canvas.
  const pointerEntropy = entropyBuffer
  // Source 2: the CSPRNG used by the nip06 package (crypto.getRandomValues).
  const { mnemonic: packageMnemonic } = generateSeedWords()
  const packageEntropy = mnemonicToEntropy(packageMnemonic, wordlist)

  const combined = new Uint8Array(pointerEntropy.length + packageEntropy.length)
  combined.set(pointerEntropy, 0)
  combined.set(packageEntropy, pointerEntropy.length)

  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', combined))
  // 12 words need 128 bits of entropy (words * 4 / 3 bytes).
  const entropyBytes = (mnemonicSize.value * 4) / 3
  fillMnemonic(entropyToMnemonic(digest.slice(0, entropyBytes), wordlist))
  closeEntropyModal()
}

function setCanvasRef(el: Element | ComponentPublicInstance | null) {
  canvasRef = el as HTMLCanvasElement | null
}

function setupEntropyCanvas() {
  if (!canvasRef) return
  const rect = canvasRef.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  canvasRef.width = Math.round(rect.width * dpr)
  canvasRef.height = Math.round(rect.height * dpr)
  const ctx = canvasRef.getContext('2d')
  if (!ctx) return
  ctx.scale(dpr, dpr)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, rect.width, rect.height)
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.font = '16px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('draw here', rect.width / 2, rect.height / 2)
}

function collectEntropy(event: PointerEvent) {
  if (!isCollecting.value || entropyComplete.value || !canvasRef) return
  const rect = canvasRef.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  if (x < 0 || y < 0 || x > rect.width || y > rect.height) return

  const dx = x - lastTracePoint.x
  const dy = y - lastTracePoint.y
  const hasPrevious = lastTracePoint.x >= 0
  if (hasPrevious && Math.hypot(dx, dy) < entropyMinDistance) return

  const offset = entropySamples.value * entropyBytesPerSample
  entropyView.setUint16(offset, Math.round(x * 16) & 0xffff)
  entropyView.setUint16(offset + 2, Math.round(y * 16) & 0xffff)
  entropyView.setFloat64(offset + 4, performance.now())
  entropySamples.value += 1

  const ctx = canvasRef.getContext('2d')
  if (ctx) {
    if (entropySamples.value === 1) {
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, rect.width, rect.height)
    }
    const hue = 90 + (entropyProgress.value / 100) * 180
    ctx.strokeStyle = `hsl(${hue}, 100%, 55%)`
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    if (hasPrevious) {
      ctx.moveTo(lastTracePoint.x, lastTracePoint.y)
      ctx.lineTo(x, y)
    } else {
      ctx.arc(x, y, 1, 0, Math.PI * 2)
    }
    ctx.stroke()
  }
  lastTracePoint = { x, y }
}

function onEntropyPointerLeave() {
  lastTracePoint = { x: -1, y: -1 }
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

onBeforeUnmount(() => {
  canvasRef = null
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

  <div v-if="!warningDismissed" class="modal is-active">
    <div class="modal-background"></div>
    <div class="modal-content">
      <article class="message is-warning caution">
        <div class="message-header">
          <p>Use with caution</p>
        </div>
        <div class="message-body">
          <p>This site runs online in your browser. Your machine, browser, or this page could be tampered with. Use only if you fully trust them; otherwise download the offline version.</p>
          <p>Don't trust, verify: review the source code at <a href="https://github.com/jaonoctus/nip06-web" target="_blank">github.com/jaonoctus/nip06-web</a> and confirm what is served to you matches it before entering any seed phrase.</p>

          <div class="field mt-5">
            <label class="label">Type "I UNDERSTAND" to continue</label>
            <div class="field has-addons">
              <div class="control is-expanded">
                <input
                  v-model="acknowledgeInput"
                  @keyup.enter="canContinue && (warningDismissed = true)"
                  class="input is-warning"
                  type="text"
                  autocomplete="off"
                  autofocus
                />
              </div>
              <div class="control">
                <button :disabled="!canContinue" @click="warningDismissed = true" class="button is-warning">
                  Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      </article>
    </div>
  </div>

  <div v-if="isCollecting" class="modal is-active">
    <div class="modal-background" @click="closeEntropyModal"></div>
    <div class="modal-card">
      <header class="modal-card-head">
        <p class="modal-card-title">Generate random mnemonic</p>
        <button @click="closeEntropyModal" class="delete" aria-label="close" type="button"></button>
      </header>
      <section class="modal-card-body">
        <p class="block">
          Draw inside the black box with your mouse or finger until the bar fills up.
        </p>
        <p class="block">
          Two independent sources of entropy are used: your pointer movements, and the
          cryptographic random generator from the <code>nip06</code> package
          (<code>crypto.getRandomValues</code>). Both are concatenated and hashed with SHA-256
          to produce the final seed (remember the Coldcard incident? kekw).
        </p>

        <progress :value="entropyProgress" max="100" class="progress is-success mb-2">{{ entropyProgress.toFixed(0) }}%</progress>
        <p class="has-text-centered mb-4">
          <strong>{{ entropyProgress.toFixed(0) }}%</strong>
          <span class="has-text-grey"> ({{ entropySamples }} / {{ entropyTargetSamples }} samples)</span>
        </p>

        <canvas
          :ref="(el) => setCanvasRef(el)"
          @pointermove="collectEntropy"
          @pointerleave="onEntropyPointerLeave"
          class="entropy-canvas"
        ></canvas>
      </section>
      <footer class="modal-card-foot is-justify-content-flex-end">
        <button @click="closeEntropyModal" type="button" class="button">Cancel</button>
        <button
          :disabled="!entropyComplete"
          @click.prevent="completeEntropyCollection"
          type="button"
          class="button is-success"
        >
          Generate mnemonic
        </button>
      </footer>
    </div>
  </div>

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
                  :disabled="!warningDismissed"
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

<style scoped>
.entropy-canvas {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  background-color: #000;
  border-radius: 4px;
  cursor: crosshair;
  touch-action: none;
}

.caution .message-body .label {
  color: inherit;
}

.caution .message-body .input {
  background-color: transparent;
  color: inherit;
}

.caution .message-body .input:focus {
  box-shadow: none;
}
</style>
