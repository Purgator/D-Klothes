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

/** Short vibration on devices that support it; silent elsewhere. */
export function haptic(pattern: number | number[] = 12) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // Not supported or blocked: no feedback, no error.
  }
}
