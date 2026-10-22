import { useState, useEffect, useLayoutEffect, useRef, useCallback, memo } from 'react'
import { WorkoutSettings, DEFAULT_SETTINGS, PhaseType } from './types'
import { useWorkoutTimer } from './timer/useWorkoutTimer'
import './styles.css'

const STORAGE_KEY = 'wt-settings-v1'

function loadSettings(): WorkoutSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {}
  return { ...DEFAULT_SETTINGS }
}

function saveSettings(s: WorkoutSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
}

function fmt(s: number): string {
  if (s < 0) s = 0
  const m = Math.floor(s / 60)
  const sec = s % 60
  if (m > 0) return `${m}:${sec.toString().padStart(2, '0')}`
  return `${sec}`
}

function phaseLabel(t: PhaseType | undefined): string {
  switch (t) {
    case 'prepare':    return 'Bereit machen'
    case 'work':       return 'Arbeit'
    case 'set-rest':   return 'Satzpause'
    case 'round-rest': return 'Rundenpause'
    default:           return ''
  }
}

function ringColor(t: PhaseType | undefined): string {
  switch (t) {
    case 'work':                     return '#4ade80'
    case 'set-rest': case 'round-rest': return '#60a5fa'
    case 'prepare':                  return '#c084fc'
    default:                         return '#475569'
  }
}

// ── SVG-Fortschrittsring ───────────────────────────────────────────────────
const R = 118, CIRC = 2 * Math.PI * R, CX = 140

interface RingProps {
  remainingMs: number; totalMs: number
  phaseType: PhaseType | undefined; isPaused: boolean
}

function ProgressRing({ remainingMs, totalMs, phaseType, isPaused }: RingProps) {
  const progress = totalMs > 0 ? remainingMs / totalMs : 0
  const offset   = CIRC * (1 - Math.max(0, Math.min(1, progress)))
  return (
    <svg viewBox={`0 0 ${CX * 2} ${CX * 2}`} className="ring-svg"
      style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={CX} cy={CX} r={R} fill="none"
        stroke="rgba(255,255,255,0.06)" strokeWidth="3.5" />
      <circle cx={CX} cy={CX} r={R} fill="none"
        stroke={ringColor(phaseType)} strokeWidth="3.5"
        strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={offset}
        style={{ transition: isPaused ? 'none' : 'stroke 0.4s ease',
                 opacity: isPaused ? 0.45 : 1 }} />
    </svg>
  )
}

// ── Stepper (für Anzahl-Werte) ─────────────────────────────────────────────
interface StepperProps {
  label: string; value: number; min: number; max: number
  onChange: (v: number) => void
}
function Stepper({ label, value, min, max, onChange }: StepperProps) {
  return (
    <div className="row">
      <span className="row-label">{label}</span>
      <div className="stepper">
        <button className="step-btn" onClick={() => onChange(Math.max(min, value - 1))}>−</button>
        <span className="step-val">{value}</span>
        <button className="step-btn" onClick={() => onChange(Math.min(max, value + 1))}>+</button>
      </div>
    </div>
  )
}

// ── Drum-Picker (für Zeitwerte) ────────────────────────────────────────────
const ITEM_H  = 44   // Höhe eines einzelnen Elements in px
const VISIBLE = 3    // Anzahl sichtbarer Elemente

function genRange(from: number, to: number, step: number): number[] {
  const arr: number[] = []
  for (let v = from; v <= to; v += step) arr.push(v)
  return arr
}

interface DrumPickerProps {
  label: string; values: number[]; selected: number
  unit?: string; onChange: (v: number) => void
}

const DrumPicker = memo(function DrumPicker({
  label, values, selected, unit, onChange
}: DrumPickerProps) {
  const ref = useRef<HTMLDivElement>(null)

  // Scroll-Position synchron vor dem ersten Paint setzen
  useLayoutEffect(() => {
    const idx = values.indexOf(selected)
    if (idx !== -1 && ref.current) {
      ref.current.scrollTop = idx * ITEM_H
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const onScroll = useCallback(() => {
    if (!ref.current) return
    const idx = Math.round(ref.current.scrollTop / ITEM_H)
    const v   = values[Math.max(0, Math.min(idx, values.length - 1))]
    if (v !== selected) {
      // Kurzes haptisches Feedback auf Android
      if ('vibrate' in navigator) navigator.vibrate(6)
      onChange(v)
    }
  }, [values, selected, onChange])

  const pad = Math.floor(VISIBLE / 2)  // 2 Elemente Abstand oben & unten

  return (
    <div className="drum-field">
      <span className="drum-label">{label}</span>
      <div className="drum-picker">
        {/* Verblassungseffekte oben und unten */}
        <div className="drum-fade-top" />
        <div className="drum-fade-bot" />
        {/* Markierungslinien für das mittlere (aktive) Element */}
        <div className="drum-line" />
        {/* Scrollbarer Bereich */}
        <div ref={ref} className="drum-scroll" onScroll={onScroll}
          style={{ height: ITEM_H * VISIBLE }}>
          {/* Füll-Elemente damit das erste/letzte Item zentriert werden kann */}
          {Array(pad).fill(0).map((_, i) => <div key={`a${i}`} className="drum-item drum-pad" />)}

          {values.map(v => (
            <div key={v} className={`drum-item${v === selected ? ' is-sel' : ''}`}>
              <span className="drum-num">{String(v).padStart(2, '0')}</span>
              {unit && <span className="drum-unit">{unit}</span>}
            </div>
          ))}

          {Array(pad).fill(0).map((_, i) => <div key={`b${i}`} className="drum-item drum-pad" />)}
        </div>
      </div>
    </div>
  )
})

// ── Hauptkomponente ────────────────────────────────────────────────────────
export default function App() {
  const [settings, setSettings] = useState<WorkoutSettings>(loadSettings)
  useEffect(() => { saveSettings(settings) }, [settings])

  const timer = useWorkoutTimer(settings)

  function update<K extends keyof WorkoutSettings>(key: K, value: WorkoutSettings[K]) {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  // 10-Sekunden-Warnung
  const alertedRef = useRef(-1)
  const [showTenSec, setShowTenSec] = useState(false)

  useEffect(() => {
    if (
      timer.remainingSeconds === 10 &&
      timer.status === 'running' &&
      timer.currentPhase?.type !== 'prepare' &&
      timer.currentPhaseIndex !== alertedRef.current
    ) {
      alertedRef.current = timer.currentPhaseIndex
      setShowTenSec(true)
      const t = setTimeout(() => setShowTenSec(false), 2200)
      return () => clearTimeout(t)
    }
  }, [timer.remainingSeconds, timer.status, timer.currentPhase?.type, timer.currentPhaseIndex])

  const overallProgress = timer.totalPhases > 1
    ? timer.currentPhaseIndex / (timer.totalPhases - 1) : 0
  const phase   = timer.currentPhase
  const totalMs = (phase?.duration ?? 0) * 1000

  // Wertebereiche (je 5-Sekunden-Schritte)
  const durValues  = genRange(5,   300, 5)
  const restValues = genRange(0,   120, 5)
  const rrstValues = genRange(0,   300, 5)

  // ── Einstellungsseite ─────────────────────────────────────────────────
  if (timer.status === 'idle') {
    return (
      <div className="app">
        <div className="settings-page">

          <header className="s-header">
            <h1>Workout Timer</h1>
          </header>

          {/* Name */}
          <div className="s-section">
            <input className="name-input" type="text"
              placeholder="Name des Workouts (optional)"
              value={settings.name}
              onChange={e => update('name', e.target.value)} />
          </div>

          {/* Anzahl */}
          <div className="s-section">
            <Stepper label="Runden" value={settings.rounds} min={1} max={20}
              onChange={v => update('rounds', v)} />
            <Stepper label="Sätze pro Runde" value={settings.sets} min={1} max={30}
              onChange={v => update('sets', v)} />
          </div>

          {/* Zeiten */}
          <div className="s-section">
            <div className="drum-row">
              <DrumPicker label="Satzdauer" unit="s"
                values={durValues} selected={settings.setDuration}
                onChange={v => update('setDuration', v)} />
              <DrumPicker label="Satzpause" unit="s"
                values={restValues} selected={settings.setRest}
                onChange={v => update('setRest', v)} />
              <DrumPicker label="Rundenpause" unit="s"
                values={rrstValues} selected={settings.roundRest}
                onChange={v => update('roundRest', v)} />
            </div>
          </div>

          {/* Zusammenfassung */}
          <div className="s-summary">
            {settings.rounds} × {settings.sets} Sätze &middot;&nbsp;
            {settings.setDuration}s Arbeit &middot;&nbsp;
            {settings.setRest}s Pause
          </div>

          <button className="btn-start" onClick={timer.start}>Starten</button>

        </div>
      </div>
    )
  }

  // ── Fertig-Seite ──────────────────────────────────────────────────────
  if (timer.status === 'done') {
    return (
      <div className="app">
        <div className="done-page">
          <div className="done-icon">
            <svg viewBox="0 0 64 64" fill="none">
              <circle cx="32" cy="32" r="30" stroke="#4ade80" strokeWidth="3" />
              <polyline points="18,33 27,43 46,22" stroke="#4ade80" strokeWidth="3.5"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 className="done-title">Gut gemacht.</h2>
          {settings.name && <p className="done-name">{settings.name}</p>}
          <p className="done-stats">{settings.rounds} Runden &middot; {settings.sets} Sätze</p>
          <button className="btn-start" onClick={timer.reset}>Neues Workout</button>
        </div>
      </div>
    )
  }

  // ── Timer-Seite ───────────────────────────────────────────────────────
  return (
    <div className="app">
      <div className="timer-page">

        <div className="overall-bar">
          <div className="overall-fill" style={{ width: `${overallProgress * 100}%` }} />
        </div>

        <div className="phase-header">
          <div className="phase-name">{phaseLabel(phase?.type)}</div>
          {phase && phase.type !== 'prepare' && (
            <div className="phase-context">
              Runde {phase.round}/{settings.rounds}
              {phase.type === 'work' && <> &middot; Satz {phase.set}/{settings.sets}</>}
            </div>
          )}
        </div>

        <div className="ring-wrap">
          <ProgressRing remainingMs={timer.remainingMs} totalMs={totalMs}
            phaseType={phase?.type} isPaused={timer.status === 'paused'} />
          <div className="ring-center">
            <div className="clock">{fmt(timer.remainingSeconds)}</div>
          </div>
        </div>

        {showTenSec && <div className="ten-sec-alert">10 Sekunden</div>}

        {phase?.type === 'work' && settings.sets <= 24 && (
          <div className="dots">
            {Array.from({ length: settings.sets }, (_, i) => (
              <div key={i} className={`dot${
                i + 1 < phase.set  ? ' dot-done'   :
                i + 1 === phase.set ? ' dot-active' : ''}`} />
            ))}
          </div>
        )}

        <div className="controls">
          <button className="ctrl-icon" onClick={timer.reset} aria-label="Reset">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>

          {timer.status === 'running' ? (
            <button className="ctrl-main" onClick={timer.pause}>
              <svg viewBox="0 0 24 24" fill="currentColor">
                <rect x="6"  y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            </button>
          ) : (
            <button className="ctrl-main" onClick={timer.resume}>
              <svg viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            </button>
          )}

          <button className="ctrl-icon" onClick={timer.skip} aria-label="Skip">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5,4 15,12 5,20" fill="currentColor" stroke="none" />
              <line x1="19" y1="4" x2="19" y2="20" />
            </svg>
          </button>
        </div>

      </div>
    </div>
  )
}
