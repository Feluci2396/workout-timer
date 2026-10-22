import { WorkoutSettings, WorkoutPhase } from '../types'

/**
 * Baut aus den Einstellungen eine geordnete Liste aller Phasen auf.
 * Beispiel für 2 Runden, 3 Sätze:
 *   prepare → work(R1,S1) → set-rest → work(R1,S2) → set-rest → work(R1,S3)
 *   → round-rest → work(R2,S1) → set-rest → work(R2,S2) → set-rest → work(R2,S3)
 *   → done
 */
export function buildWorkoutPlan(settings: WorkoutSettings): WorkoutPhase[] {
  const phases: WorkoutPhase[] = []

  const { rounds, sets, setDuration, setRest, roundRest } = settings

  // 3-Sekunden Vorbereitung am Anfang
  phases.push({
    type: 'prepare',
    duration: 3,
    round: 1,
    set: 1,
    totalRounds: rounds,
    totalSets: sets,
  })

  for (let r = 1; r <= rounds; r++) {
    for (let s = 1; s <= sets; s++) {
      // Arbeitsphase
      phases.push({
        type: 'work',
        duration: setDuration,
        round: r,
        set: s,
        totalRounds: rounds,
        totalSets: sets,
      })

      const isLastSet = s === sets
      const isLastRound = r === rounds

      if (isLastSet && isLastRound) {
        // Nach dem letzten Satz der letzten Runde: fertig
        break
      } else if (isLastSet) {
        // Nach dem letzten Satz einer Runde (aber nicht der letzten): Rundenpause
        if (roundRest > 0) {
          phases.push({
            type: 'round-rest',
            duration: roundRest,
            round: r,
            set: s,
            totalRounds: rounds,
            totalSets: sets,
          })
        }
      } else {
        // Zwischen zwei Sätzen innerhalb einer Runde: Satzpause
        if (setRest > 0) {
          phases.push({
            type: 'set-rest',
            duration: setRest,
            round: r,
            set: s,
            totalRounds: rounds,
            totalSets: sets,
          })
        }
      }
    }
  }

  // Abschlussphase (Dauer 0, nur um "Fertig" anzuzeigen)
  phases.push({
    type: 'done',
    duration: 0,
    round: rounds,
    set: sets,
    totalRounds: rounds,
    totalSets: sets,
  })

  return phases
}
