// Alle Typen für die App an einem Ort

/** Einstellungen, die der Benutzer konfiguriert */
export interface WorkoutSettings {
  name: string;
  rounds: number;         // Anzahl Runden
  roundDuration: number;  // Dauer einer Runde in Sekunden (nicht genutzt wenn Sätze definiert)
  roundRest: number;      // Pause zwischen Runden in Sekunden
  sets: number;           // Anzahl Sätze pro Runde
  setDuration: number;    // Dauer eines Satzes in Sekunden
  setRest: number;        // Pause zwischen Sätzen in Sekunden
  volume: number;         // App-Lautstärke (0 – 1.5), unabhängig von anderer Musik
}

/** Standardwerte für ein neues Workout */
export const DEFAULT_SETTINGS: WorkoutSettings = {
  name: '',
  rounds: 2,
  roundDuration: 60,
  roundRest: 60,
  sets: 9,
  setDuration: 30,
  setRest: 10,
  volume: 1,
}

/** Jede Phase im Workout-Ablauf hat einen Typ */
export type PhaseType =
  | 'prepare'    // Vorbereitungs-Countdown am Anfang
  | 'work'       // Aktive Arbeitsphase
  | 'set-rest'   // Pause zwischen zwei Sätzen
  | 'round-rest' // Pause zwischen zwei Runden
  | 'done'       // Workout beendet

/** Ein einzelner Schritt im Workout-Plan */
export interface WorkoutPhase {
  type: PhaseType;
  duration: number;  // Dauer in Sekunden
  round: number;     // Aktuelle Runde (1-basiert)
  set: number;       // Aktueller Satz (1-basiert)
  totalRounds: number;
  totalSets: number;
}

/** Status des Timers */
export type TimerStatus = 'idle' | 'running' | 'paused' | 'done'
