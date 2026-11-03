import { ref } from 'vue'

export type ToastTone = 'success' | 'info' | 'error'
export interface Toast {
  id: number
  text: string
  tone: ToastTone
  emoji?: string
}

// One shared queue for the whole app; ToastHost renders it.
const toasts = ref<Toast[]>([])
let nextId = 1

export interface ToastOptions {
  tone?: ToastTone
  emoji?: string
  durationMs?: number
}

export function useToast() {
  function show(text: string, { tone = 'success', emoji, durationMs = 2600 }: ToastOptions = {}) {
    const id = nextId++
    toasts.value = [...toasts.value.slice(-2), { id, text, tone, emoji }]
    setTimeout(() => dismiss(id), durationMs)
    return id
  }
  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }
  return { toasts, show, dismiss }
}

const HAPTICS_KEY = 'dklothes.haptics'
const hapticsEnabled = ref(readHaptics())
function readHaptics(): boolean {
  try {
    return localStorage.getItem(HAPTICS_KEY) !== 'off'
  } catch {
    return true
  }
}
/** Haptic feedback preference (per device, stored in the browser). */
export function useHaptics() {
  function set(enabled: boolean) {
    hapticsEnabled.value = enabled
    try {
      localStorage.setItem(HAPTICS_KEY, enabled ? 'on' : 'off')
    } catch {
      // Storage unavailable: the choice lasts for this session only.
    }
  }
  const supported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
  return { enabled: hapticsEnabled, supported, set }
}

/** Short vibration on devices that support it, when enabled; silent elsewhere. */
export function haptic(pattern: number | number[] = 12) {
  if (!hapticsEnabled.value) return
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // Not supported or blocked: no feedback, no error.
  }
}
