import { useState, useEffect, useRef, useCallback } from 'react'
import { WorkoutSettings, WorkoutPhase, TimerStatus } from '../types'
import { buildWorkoutPlan } from './buildWorkoutPlan'

// ── Audio (Web Audio API – kein Audio-File nötig) ──────────────────────────

function createAudioContext(): AudioContext | null {
  try {
    return new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
  } catch { return null }
}

// Basis-Beep mit DynamicsCompressor für maximale Lautstärke ohne Verzerrung
function beep(ctx: AudioContext, freq: number, dur: number, vol = 1.0) {
  const osc  = ctx.createOscillator()
  const gain = ctx.createGain()
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -3
  comp.knee.value       = 2
  comp.ratio.value      = 4
  comp.attack.value     = 0.001
  comp.release.value    = 0.1
  osc.connect(gain)
  gain.connect(comp)
  comp.connect(ctx.destination)
  osc.frequency.value = freq
  osc.type = 'sine'
  gain.gain.setValueAtTime(vol, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + dur)
}

// ── Glocke (Boxing Bell) – extrem laut, authentischer Klang ───────────────
// Eine echte Glocke besteht aus mehreren Obertönen mit langer Ausschwingzeit.
function playBell(ctx: AudioContext) {
  const now  = ctx.currentTime
  const base = 440  // A4 – klassischer Glockengrundton

  // Obertöne: [Frequenz, Lautstärke, Ausschwingzeit in Sekunden]
  const partials: [number, number, number][] = [
    [base * 1.00, 1.00, 4.5],   // Grundton
    [base * 2.00, 0.70, 4.0],   // Oktave
    [base * 2.51, 0.50, 3.5],   // Kleine None
    [base * 3.00, 0.40, 3.0],   // Duodezime
    [base * 4.00, 0.25, 2.5],   // Doppel-Oktave
    [base * 5.66, 0.15, 2.0],   // Übermäßige Undezime
    [base * 7.00, 0.10, 1.5],   // Weitere Obertöne
  ]

  // Kompressor hält die Lautstärke am Limit ohne Clipping
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -1
  comp.knee.value       = 2
  comp.ratio.value      = 6
  comp.attack.value     = 0.0001  // sofortiger Anschlag → "Ding"
  comp.release.value    = 0.5
  comp.connect(ctx.destination)

  for (const [freq, amp, decay] of partials) {
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(comp)
    osc.type            = 'sine'
    osc.frequency.value = freq
    // Sofortiger voller Anschlag, dann langer exponentieller Abfall
    gain.gain.setValueAtTime(amp, now)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + decay)
    osc.start(now)
    osc.stop(now + decay + 0.1)
  }
}

// ── Sprachansage (Web Speech API) ─────────────────────────────────────────
function speak(text: string) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()  // laufende Ansage abbrechen
  const u  = new SpeechSynthesisUtterance(text)
  u.lang   = 'en-US'
  u.rate   = 1.0
  u.pitch  = 1.1
  u.volume = 1.0
  window.speechSynthesis.speak(u)
}

// Doppelton am Phasenende – laut und klar
function playEndSignal(ctx: AudioContext) {
  beep(ctx, 880, 0.20, 1.0)
  setTimeout(() => beep(ctx, 660, 0.35, 0.9), 220)
}

// Countdown-Piepser letzte 3 Sekunden
function playCountdownBeep(ctx: AudioContext) {
  beep(ctx, 440, 0.18, 0.85)
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useWorkoutTimer(settings: WorkoutSettings) {
  const [status,             setStatus]             = useState<TimerStatus>('idle')
  const [phases,             setPhases]             = useState<WorkoutPhase[]>([])
  const [currentPhaseIndex,  setCurrentPhaseIndex]  = useState(0)
  const [remainingSeconds,   setRemainingSeconds]   = useState(0)
  // remainingMs für flüssige SVG-Animation (60 fps)
  const [remainingMs,        setRemainingMs]        = useState(0)

  // Refs: immer aktueller Wert, ohne Closure-Probleme
  const statusRef             = useRef<TimerStatus>('idle')
  const currentPhaseIndexRef  = useRef(0)
  const phasesRef             = useRef<WorkoutPhase[]>([])
  const remainingSecondsRef   = useRef(0)   // für resume()
  const phaseEndTimeRef       = useRef(0)   // performance.now() Phasenende
  const lastBeepSecRef        = useRef(0)   // verhindert Doppel-Beeps
  const animFrameRef          = useRef<number | null>(null)
  const audioCtxRef           = useRef<AudioContext | null>(null)

  // Refs synchron halten
  statusRef.current            = status
  currentPhaseIndexRef.current = currentPhaseIndex
  phasesRef.current            = phases
  remainingSecondsRef.current  = remainingSeconds

  const ensureAudio = useCallback(() => {
    if (!audioCtxRef.current) audioCtxRef.current = createAudioContext()
    if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume()
  }, [])

  // ── Nächste Phase ─────────────────────────────────────────────────────────
  const advancePhase = useCallback(() => {
    const prevPhase = phasesRef.current[currentPhaseIndexRef.current]
    const nextIdx   = currentPhaseIndexRef.current + 1
    const plan      = phasesRef.current
    if (nextIdx >= plan.length) return

    const next = plan[nextIdx]

    // Workout ENDE: Glocke + Phasenende-Signal
    if (next.type === 'done') {
      setCurrentPhaseIndex(nextIdx)
      setRemainingSeconds(0)
      setRemainingMs(0)
      setStatus('done')
      if (audioCtxRef.current) playBell(audioCtxRef.current)
      return
    }

    // Glocke beim Start jeder Runde:
    // – erste Runde: wenn prepare → work
    // – folgende Runden: wenn round-rest → work (erster Satz der Runde)
    if (
      next.type === 'work' &&
      next.set === 1 &&
      (prevPhase?.type === 'prepare' || prevPhase?.type === 'round-rest') &&
      audioCtxRef.current
    ) {
      playBell(audioCtxRef.current)
    }

    phaseEndTimeRef.current = performance.now() + next.duration * 1000
    lastBeepSecRef.current  = 0
    setCurrentPhaseIndex(nextIdx)
    setRemainingSeconds(next.duration)
    setRemainingMs(next.duration * 1000)
  }, [])

  // ── Tick (≈60 fps via requestAnimationFrame) ──────────────────────────────
  const tick = useCallback(() => {
    if (statusRef.current !== 'running') return

    const remaining    = phaseEndTimeRef.current - performance.now()
    const remainingSec = Math.ceil(remaining / 1000)

    if (remaining <= 0) {
      if (audioCtxRef.current) playEndSignal(audioCtxRef.current)
      advancePhase()
    } else {
      // Töne & Ansagen: einmal pro Sekunde auslösen
      if (remainingSec !== lastBeepSecRef.current) {
        const phase = phasesRef.current[currentPhaseIndexRef.current]
        if (phase && phase.type !== 'prepare') {
          if (remainingSec === 10) {
            // Sprachansage + kurzer Warnton
            speak('Last 10 seconds')
            if (audioCtxRef.current) beep(audioCtxRef.current, 659, 0.18, 0.7)
          } else if (remainingSec <= 3 && remainingSec > 0) {
            if (audioCtxRef.current) playCountdownBeep(audioCtxRef.current)
          }
        }
        lastBeepSecRef.current = remainingSec
      }

      setRemainingMs(Math.max(0, remaining))
      setRemainingSeconds(remainingSec)
    }

    animFrameRef.current = requestAnimationFrame(tick)
  }, [advancePhase])

  const startTick = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    animFrameRef.current = requestAnimationFrame(tick)
  }, [tick])

  const stopTick = useCallback(() => {
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null }
  }, [])

  // ── Öffentliche Aktionen ──────────────────────────────────────────────────
  const start = useCallback(() => {
    ensureAudio()
    const plan  = buildWorkoutPlan(settings)
    const first = plan[0]
    phasesRef.current            = plan
    currentPhaseIndexRef.current = 0
    phaseEndTimeRef.current      = performance.now() + first.duration * 1000
    lastBeepSecRef.current       = 0
    setPhases(plan)
    setCurrentPhaseIndex(0)
    setRemainingSeconds(first.duration)
    setRemainingMs(first.duration * 1000)
    setStatus('running')
  }, [settings, ensureAudio])

  const pause = useCallback(() => {
    if (statusRef.current !== 'running') return
    stopTick()
    setStatus('paused')
  }, [stopTick])

  const resume = useCallback(() => {
    if (statusRef.current !== 'paused') return
    ensureAudio()
    phaseEndTimeRef.current = performance.now() + remainingSecondsRef.current * 1000
    setStatus('running')
  }, [ensureAudio])

  const reset = useCallback(() => {
    stopTick()
    setStatus('idle')
    setPhases([])
    setCurrentPhaseIndex(0)
    setRemainingSeconds(0)
    setRemainingMs(0)
  }, [stopTick])

  const skip = useCallback(() => {
    if (statusRef.current === 'idle' || statusRef.current === 'done') return
    ensureAudio()
    if (audioCtxRef.current) playEndSignal(audioCtxRef.current)
    advancePhase()
  }, [advancePhase, ensureAudio])

  useEffect(() => {
    if (status === 'running') startTick()
    else stopTick()
    return () => stopTick()
  }, [status, startTick, stopTick])

  return {
    status,
    phases,
    currentPhaseIndex,
    remainingSeconds,
    remainingMs,
    currentPhase: phases[currentPhaseIndex] ?? null,
    totalPhases:  phases.length,
    start, pause, resume, reset, skip,
  }
}
