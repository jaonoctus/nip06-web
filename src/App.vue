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

const showPrivateKey = ref(false)
const copiedField = ref<'private' | 'public' | null>(null)
let copiedTimeout: ReturnType<typeof setTimeout> | null = null

const displayedPrivateKey = computed(() => (isHexFormat.value ? privateKeyHex.value : privateKeyBech32.value))
const displayedPublicKey = computed(() => (isHexFormat.value ? publicKeyHex.value : publicKeyBech32.value))

function togglePrivateKeyVisibility() {
  showPrivateKey.value = !showPrivateKey.value
}

async function copyToClipboard(value: string, field: 'private' | 'public') {
  if (!value) return
  try {
    await navigator.clipboard.writeText(value)
  } catch {
    const helper = document.createElement('textarea')
    helper.value = value
    helper.setAttribute('readonly', '')
    helper.style.position = 'fixed'
    helper.style.opacity = '0'
    document.body.appendChild(helper)
    helper.select()
    document.execCommand('copy')
    document.body.removeChild(helper)
  }
  copiedField.value = field
  if (copiedTimeout) clearTimeout(copiedTimeout)
  copiedTimeout = setTimeout(() => {
    copiedField.value = null
  }, 1500)
}

const wordSet = new Set(wordlist)

function isWordInvalid(word: string) {
  const normalized = word.trim().toLowerCase()
  return normalized.length > 0 && !wordSet.has(normalized)
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
  showPrivateKey.value = false
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
  if (copiedTimeout) {
    clearTimeout(copiedTimeout)
    copiedTimeout = null
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
    <div class="modal-card caution">
      <header class="modal-card-head">
        <p class="modal-card-title">Use with caution</p>
      </header>
      <section class="modal-card-body">
        <p class="block">
          This tool derives Nostr keys from a seed phrase. Anything you type here is as safe as
          the machine and browser you are using.
        </p>
        <div class="content">
          <ul>
            <li>
              <strong>This page runs online.</strong> Your machine, browser, or the page itself
              could be tampered with. Use it only if you fully trust all of them.
            </li>
            <li>
              <strong>Don't trust, verify.</strong> Review the source code at
              <a href="https://github.com/jaonoctus/nip06-web" target="_blank">github.com/jaonoctus/nip06-web</a>
              and confirm what is served to you matches it before entering any seed phrase.
            </li>
            <li>
              <strong>Prefer offline.</strong> Download the
              <a href="https://github.com/jaonoctus/nip06-web/releases" target="_blank">standalone HTML</a>
              from the latest release and open it on an air-gapped machine.
            </li>
          </ul>
        </div>

        <div class="field">
          <label class="label" for="acknowledge">Type <code>I UNDERSTAND</code> to continue</label>
          <div class="control">
            <input
              id="acknowledge"
              v-model="acknowledgeInput"
              @keyup.enter="canContinue && (warningDismissed = true)"
              class="input"
              :class="canContinue ? 'is-success' : 'is-warning'"
              type="text"
              autocomplete="off"
              spellcheck="false"
              placeholder="I UNDERSTAND"
              autofocus
            />
          </div>
        </div>
      </section>
      <footer class="modal-card-foot is-justify-content-flex-end">
        <button :disabled="!canContinue" @click="warningDismissed = true" type="button" class="button is-warning">
          Continue
        </button>
      </footer>
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

  <section class="section main-section">
    <div class="container">
      <div class="columns is-variable is-5">
        <div class="column is-half">
          <div class="box">
            <h2 class="title is-5 mb-1">Seed phrase</h2>
            <p class="subtitle is-6 has-text-grey mb-4">
              Enter an existing <a href="https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki" target="_blank" class="has-text-link">BIP39 mnemonic</a>, paste it into any field, or generate a new random one.
            </p>
            <form action="" autocomplete="off">
              <div class="buttons mb-4">
                <button
                  :disabled="!warningDismissed"
                  @click.prevent="generateRandomMnemonic"
                  type="button"
                  class="button is-link"
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

              <div class="columns is-multiline is-mobile is-variable is-2 word-grid">
                <div
                  v-for="(mnemonic, index) in mnemonicWords"
                  :key="`word-${index + 1}`"
                  class="column is-half-mobile is-one-third-tablet"
                >
                  <div
                    class="dropdown"
                    :class="{ 'is-active': activeIndex === index && suggestions.length > 0 }"
                    style="width: 100%"
                  >
                    <div class="dropdown-trigger" style="width: 100%">
                      <div class="control has-icons-left">
                        <input
                          :ref="(el) => setWordInputRef(el, index)"
                          v-model="mnemonic.word"
                          @paste="onPaste"
                          @focus="onFocus(index)"
                          @blur="onBlur"
                          @keydown="onKeydown($event, index)"
                          class="input"
                          :class="{ 'is-danger': isWordInvalid(mnemonic.word) }"
                          type="text"
                          autocomplete="off"
                          autocapitalize="off"
                          spellcheck="false"
                          role="combobox"
                          aria-autocomplete="list"
                          :aria-label="`word ${index + 1}`"
                          :aria-expanded="activeIndex === index && suggestions.length > 0"
                          :aria-activedescendant="highlightedSuggestion >= 0 ? `suggestion-${index}-${highlightedSuggestion}` : undefined"
                        />
                        <span class="icon is-left word-index">{{ index + 1 }}</span>
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
              </div>

              <div class="field mt-4">
                <label class="label" for="passphrase">Passphrase <span class="has-text-weight-normal has-text-grey">(optional)</span></label>
                <div class="control">
                  <input id="passphrase" v-model="passphrase" class="input" type="text" placeholder="Leave empty if you don't use one" autocomplete="off" />
                </div>
              </div>
            </form>
          </div>
        </div>

        <div class="column is-half">
          <div class="box">
            <h2 class="title is-5 mb-4">Derived keys</h2>

            <div v-if="isFilled && isMnemonicValid">
              <div class="buttons has-addons mb-4">
                <button
                  @click.prevent="toggleFormat"
                  :class="{ 'is-link is-selected': isHexFormat }"
                  class="button is-small"
                  type="button"
                >
                  hex
                </button>
                <button
                  @click.prevent="toggleFormat"
                  :class="{ 'is-link is-selected': !isHexFormat }"
                  class="button is-small"
                  type="button"
                >
                  bech32
                </button>
              </div>
              <div class="field">
                <label class="label">{{ isHexFormat ? 'private key (hex)' : 'private key (nsec)' }}</label>
                <div class="control has-icons-right has-key-actions">
                  <input
                    :value="displayedPrivateKey"
                    :type="showPrivateKey ? 'text' : 'password'"
                    readonly
                    class="input is-family-monospace is-size-7"
                    aria-label="private key"
                  />
                  <span class="icon is-right key-actions">
                    <button
                      @click.prevent="togglePrivateKeyVisibility"
                      type="button"
                      class="key-action"
                      :title="showPrivateKey ? 'Hide private key' : 'Show private key'"
                      :aria-label="showPrivateKey ? 'Hide private key' : 'Show private key'"
                    >
                      <svg v-if="showPrivateKey" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                      <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>
                    <button
                      @click.prevent="copyToClipboard(displayedPrivateKey, 'private')"
                      type="button"
                      class="key-action"
                      :class="{ 'is-copied': copiedField === 'private' }"
                      :title="copiedField === 'private' ? 'Copied' : 'Copy private key'"
                      aria-label="Copy private key"
                    >
                      <svg v-if="copiedField === 'private'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    </button>
                  </span>
                </div>
              </div>
              <div class="field">
                <label class="label">{{ isHexFormat ? 'public key (hex)' : 'public key (npub)' }}</label>
                <div class="control has-icons-right has-key-actions is-single">
                  <input
                    :value="displayedPublicKey"
                    readonly
                    class="input is-family-monospace is-size-7"
                    type="text"
                    aria-label="public key"
                  />
                  <span class="icon is-right key-actions">
                    <button
                      @click.prevent="copyToClipboard(displayedPublicKey, 'public')"
                      type="button"
                      class="key-action"
                      :class="{ 'is-copied': copiedField === 'public' }"
                      :title="copiedField === 'public' ? 'Copied' : 'Copy public key'"
                      aria-label="Copy public key"
                    >
                      <svg v-if="copiedField === 'public'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    </button>
                  </span>
                </div>
              </div>
            </div>

            <div v-else-if="isFilled" class="notification status-note is-invalid mb-0">
              The seed phrase is not a valid BIP39 mnemonic yet. Check the highlighted words and the checksum.
            </div>

            <div v-else class="notification status-note mb-0 has-text-grey">
              Keys will appear here once a valid seed phrase is entered or generated.
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

.word-grid .column {
  padding-top: 0.375rem;
  padding-bottom: 0.375rem;
}

.control.has-icons-left .word-index {
  height: 2.5rem;
  width: 2.5rem;
  font-size: 0.7rem;
  font-variant-numeric: tabular-nums;
  color: var(--bulma-grey-light);
}

.control.has-key-actions .input {
  padding-right: 4rem;
}

.control.has-key-actions.is-single .input {
  padding-right: 2.5rem;
}

.control.has-icons-right .key-actions {
  top: 0;
  bottom: 0;
  height: auto;
  width: auto;
  padding: 0 0.375rem;
  gap: 0.125rem;
  pointer-events: auto;
}

.key-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--bulma-input-icon-color);
  cursor: pointer;
}

.key-action:hover,
.key-action:focus-visible {
  color: var(--bulma-text-strong);
  background: var(--bulma-background-hover, rgba(255, 255, 255, 0.06));
  outline: none;
}

.key-action.is-copied {
  color: var(--bulma-success);
}

.key-action svg {
  width: 1rem;
  height: 1rem;
}

.status-note {
  border-left: 3px solid var(--bulma-border);
}

.status-note.is-invalid {
  border-left-color: var(--bulma-danger);
  color: var(--bulma-danger-light);
}

.caution .modal-card-head {
  background-color: var(--bulma-warning);
}

.caution .modal-card-title {
  color: var(--bulma-warning-invert);
}
</style>
