# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

- **Dev server:** `npm run dev`
- **Build:** `npm run build` (runs `vue-tsc` type checking then `vite build`)
- **Preview built output:** `npm run preview`

No test runner or linter is configured.

## Architecture

Single-page Vue 3 app (TypeScript, `<script setup>` SFC) that implements [NIP-06](https://github.com/nostr-protocol/nips/blob/master/06.md) — Nostr key derivation from BIP-39 mnemonic seed phrases.

**All app logic lives in `src/App.vue`** — there are no other components, stores, or routes. The app:

1. Presents 12 individual word inputs for entering/generating a BIP-39 mnemonic
2. Uses the `nip06` library to validate the mnemonic and derive Nostr keypairs (hex and bech32 formats)
3. Reactive computation chain: `mnemonicWords` → `combinedMnemonic` → `isMnemonicValid` → `privateKeyHex` → `publicKeyHex` / bech32 variants

**Build output is a single self-contained HTML file** via `vite-plugin-singlefile`, intended for offline use. CSS framework is Bulma.