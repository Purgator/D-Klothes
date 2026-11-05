<script setup lang="ts">
// Decorative, inline SVG illustrations: no image requests, and they follow the brand palette.
withDefaults(defineProps<{ name: 'wardrobe' | 'done' | 'hero' | 'inbox' | 'lost' | 'mail'; class?: string }>(), { class: '' })
</script>

<template>
  <!-- Empty group / no groups: a hanger with a shirt waiting for its first photo -->
  <svg v-if="name === 'wardrobe'" viewBox="0 0 240 200" :class="$props.class" aria-hidden="true">
    <circle cx="120" cy="108" r="86" fill="#d2f7ee" />
    <circle cx="48" cy="52" r="6" fill="#a8eedd" />
    <circle cx="198" cy="40" r="4" fill="#a8eedd" />
    <circle cx="206" cy="150" r="7" fill="#a8eedd" />
    <path d="M120 44c0-8 6-12 12-12s10 4 10 9-6 7-10 10v8" fill="none" stroke="#126e62" stroke-width="4" stroke-linecap="round" />
    <path d="M120 60 54 98h132z" fill="none" stroke="#126e62" stroke-width="4" stroke-linejoin="round" />
    <path d="M96 106c-14 4-30 10-36 20l12 16 14-6v44h68v-44l14 6 12-16c-6-10-22-16-36-20-4 10-14 14-24 14s-20-4-24-14z" fill="#ffffff" stroke="#126e62" stroke-width="4" stroke-linejoin="round" />
    <path d="M96 106c4 10 14 14 24 14s20-4 24-14" fill="none" stroke="#126e62" stroke-width="4" />
    <circle cx="120" cy="150" r="4" fill="#3cc8ae" />
    <circle cx="120" cy="166" r="4" fill="#3cc8ae" />
  </svg>

  <!-- Everything reviewed: shirt with a check badge and confetti -->
  <svg v-else-if="name === 'done'" viewBox="0 0 240 200" :class="$props.class" aria-hidden="true">
    <circle cx="120" cy="104" r="84" fill="#d2f7ee" />
    <path d="M40 60l8 4-4 8" fill="none" stroke="#f59e0b" stroke-width="4" stroke-linecap="round" />
    <path d="M198 54l-9 2 2 9" fill="none" stroke="#f43f5e" stroke-width="4" stroke-linecap="round" />
    <circle cx="56" cy="138" r="5" fill="#f43f5e" />
    <circle cx="190" cy="140" r="5" fill="#10b981" />
    <rect x="178" y="92" width="10" height="10" rx="2" fill="#f59e0b" transform="rotate(20 183 97)" />
    <rect x="48" y="94" width="8" height="8" rx="2" fill="#3cc8ae" transform="rotate(-25 52 98)" />
    <path d="M96 56c-14 4-30 10-36 20l12 16 14-6v56h68V86l14 6 12-16c-6-10-22-16-36-20-4 10-14 14-24 14s-20-4-24-14z" fill="#ffffff" stroke="#126e62" stroke-width="4" stroke-linejoin="round" />
    <circle cx="160" cy="136" r="24" fill="#10b981" stroke="#ffffff" stroke-width="5" />
    <path d="m149 137 8 8 15-16" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
  </svg>

  <!-- Welcome / sign-in hero: a phone showing a photo card and the three advice buttons -->
  <svg v-else-if="name === 'hero'" viewBox="0 0 240 240" :class="$props.class" aria-hidden="true">
    <circle cx="120" cy="120" r="110" fill="#ffffff" fill-opacity="0.08" />
    <circle cx="120" cy="120" r="80" fill="#ffffff" fill-opacity="0.08" />
    <rect x="70" y="26" width="100" height="188" rx="20" fill="#0b3f39" stroke="#a8eedd" stroke-width="3" />
    <rect x="78" y="42" width="84" height="110" rx="14" fill="#1fab94" />
    <path d="M100 74c-8 2-16 6-20 12l8 10 8-4v34h36V92l8 4 8-10c-4-6-12-10-20-12-2 6-8 8-14 8s-12-2-14-8z" fill="#ffffff" />
    <rect x="86" y="128" width="46" height="6" rx="3" fill="#ffffff" fill-opacity="0.8" />
    <rect x="86" y="140" width="28" height="5" rx="2.5" fill="#ffffff" fill-opacity="0.5" />
    <rect x="80" y="48" width="78" height="100" rx="12" fill="#ffffff" fill-opacity="0.12" transform="rotate(-6 119 98)" />
    <circle cx="92" cy="176" r="12" fill="#f59e0b" />
    <path d="m87 176 5 5 5-5" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" transform="rotate(90 92 176)" />
    <circle cx="120" cy="176" r="12" fill="#f43f5e" />
    <path d="M120 182c-4-3-7-5.5-7-8.5a3.5 3.5 0 0 1 7-1 3.5 3.5 0 0 1 7 1c0 3-3 5.5-7 8.5z" fill="#ffffff" />
    <circle cx="148" cy="176" r="12" fill="#10b981" />
    <path d="m142 176 4 4 8-8" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
    <rect x="106" y="200" width="28" height="4" rx="2" fill="#a8eedd" />
    <circle cx="36" cy="60" r="6" fill="#a8eedd" fill-opacity="0.7" />
    <circle cx="206" cy="84" r="4" fill="#a8eedd" fill-opacity="0.7" />
    <circle cx="200" cy="190" r="7" fill="#a8eedd" fill-opacity="0.5" />
  </svg>

  <!-- No notifications: a resting bell -->
  <svg v-else-if="name === 'inbox'" viewBox="0 0 240 200" :class="$props.class" aria-hidden="true">
    <circle cx="120" cy="104" r="80" fill="#d2f7ee" />
    <path d="M120 44c-20 0-34 14-34 36 0 34-14 44-14 44h96s-14-10-14-44c0-22-14-36-34-36z" fill="#ffffff" stroke="#126e62" stroke-width="4" stroke-linejoin="round" />
    <path d="M108 136a12 12 0 0 0 24 0" fill="none" stroke="#126e62" stroke-width="4" stroke-linecap="round" />
    <circle cx="120" cy="40" r="5" fill="#126e62" />
    <text x="164" y="60" font-size="16" font-weight="700" fill="#3cc8ae" font-family="system-ui">z</text>
    <text x="176" y="44" font-size="20" font-weight="700" fill="#3cc8ae" font-family="system-ui">z</text>
  </svg>

  <!-- Sign-in link sent: an envelope -->
  <svg v-else-if="name === 'mail'" viewBox="0 0 240 200" :class="$props.class" aria-hidden="true">
    <circle cx="120" cy="104" r="80" fill="#ffffff" fill-opacity="0.12" />
    <rect x="56" y="64" width="128" height="88" rx="14" fill="#ffffff" />
    <path d="m56 78 64 46 64-46" fill="none" stroke="#126e62" stroke-width="4" stroke-linejoin="round" />
    <circle cx="176" cy="68" r="16" fill="#f43f5e" stroke="#ffffff" stroke-width="4" />
    <path d="m169 68 5 5 9-9" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
  </svg>

  <!-- Not found: a lone sock -->
  <svg v-else viewBox="0 0 240 200" :class="$props.class" aria-hidden="true">
    <circle cx="120" cy="104" r="80" fill="#d2f7ee" />
    <path d="M96 40h40v64l22 20a22 22 0 0 1-30 32l-36-32c-4-4-4-10 0-14l4-4z" fill="#ffffff" stroke="#126e62" stroke-width="4" stroke-linejoin="round" />
    <path d="M96 56h40" stroke="#126e62" stroke-width="4" />
    <path d="M96 100h40" stroke="#3cc8ae" stroke-width="4" />
    <text x="166" y="72" font-size="36" font-weight="800" fill="#126e62" font-family="system-ui">?</text>
  </svg>
</template>
