<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  generateSeedWords,
  validateWords,
  privateKeyFromSeedWords,
  getPublicKey,
  getBech32PrivateKey,
  getBech32PublicKey
} from 'nip06'

type Mnemonic = { word: string }

const mnemonicSize = ref(12)
const mnemonicWords = ref<Mnemonic[]>([])
const passphrase = ref('')
const isHexFormat = ref(true)

const combinedMnemonic = computed(() => mnemonicWords.value.map(({ word }) => word.trim().toLowerCase()).join(' ').trim())
const isFilled = computed(() => combinedMnemonic.value.length > 0)
const isMnemonicValid = computed(() => validateWords({ mnemonic: combinedMnemonic.value }))
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

onMounted(() => {
  resetForm()
})
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
                <div class="control has-icons-left has-icons-right">
                  <input v-model="mnemonic.word" class="input" type="text" />
                  <span class="icon is-small is-left"> {{ index + 1 }} </span>
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
        <strong>v3.0.0</strong> | made by <a href="https://github.com/jaonoctus/nip06-web" target="_blank" class="has-text-weight-semibold">jaonoctus</a> with <a href="https://vuejs.org" target="_blank">Vue.js</a>, <a href="https://bulma.io" target="_blank">Bulma</a>, <a href="https://github.com/jaonoctus/nip06" target="_blank">nip06</a> and <span class="has-text-danger has-text-weight-semibold">love</span>
      </p>
      <p>You can <a href="https://github.com/jaonoctus/nip06-web/releases" target="_blank">download the nip06-standalone.html</a> offline version from the latest GitHub release</p>
    </div>
  </footer>
</template>
