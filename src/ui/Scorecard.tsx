import { attemptStatus, totalPenaltyMs, formatAttempt, formatTime, getEvent, possibleResults, scoreRound, type Penalty, type Round, type Score } from '../core';
import { Icon } from './primitives';
import { t, localizedEventName } from './i18n';
import './scorecard.css';

export const scoreText = (score: Score) => score.status === 'DNF' ? 'DNF' : score.status === 'incomplete' ? '—' : formatTime(score.valueMs);
export const formatLabel = (format: Round['format']) => ({ ao5: 'Ao5', mo3: 'Mo3', bo5: t('bestOf5'), bo3: t('bestOf3') })[format];
export const eventName = localizedEventName;
export function Scorecard({ round, eventId, roundNumber, onHide, onEdit, onPenalty, onStats, disabled = false }: {
  round: Round | null; eventId: Parameters<typeof getEvent>[0]; roundNumber: number;
  onHide: () => void; onEdit: (attemptId: string) => void; onStats: () => void;
  onPenalty?: (attemptId: string, penalty: Penalty) => void; disabled?: boolean;
}) {
  const definition = getEvent(round?.eventId ?? eventId);
  const score = round ? scoreRound(round) : null;
  // Completed scorecards retain the bounds that preceded the final attempt.
  const boundsRound = round && round.attempts.length === definition.attemptCount
    ? { format: round.format, attempts: round.attempts.slice(0, -1) }
    : round;
  const possible = boundsRound && boundsRound.attempts.length > 0 ? possibleResults(boundsRound) : null;
  return <aside className="scorecard-wrap" aria-label={t('scorecard')}>
    <div className={`scorecard ${definition.attemptCount === 3 ? 'three-solves' : ''}`}>
      <button className="minimize-scorecard" type="button" onClick={onHide} disabled={disabled} title={t('hideScorecard')} aria-label={t('hideScorecard')}><Icon name="minus" /></button>
      <div className="scorecard-fields"><div><span>{t('event')}</span><div>{eventName(definition.id)}</div></div><div><span>{t('round')}</span><div>{String(roundNumber).padStart(2, '0')}</div></div></div>
      <p className="result-heading">{t('result')}</p>
      <ol className="scorecard-results">{Array.from({ length: definition.attemptCount }, (_, index) => {
        const attempt = round?.attempts[index];
        return <li key={index} className="scorecard-result"><span>{index + 1}</span><button type="button" className={`scorecard-time ${score?.discardedIndices.includes(index) ? 'discarded' : ''}`} disabled={!attempt || disabled} onClick={() => attempt && onEdit(attempt.id)} aria-label={attempt ? t('editSolveLabel', { number: index + 1, result: formatAttempt(attempt) }) : t('emptySolveLabel', { number: index + 1 })}>
          {attempt ? <><span>{formatAttempt(attempt)}</span>{attemptStatus(attempt) === 'ok' && totalPenaltyMs(attempt) > 0 && <small>({formatTime(attempt.rawMs)} + {totalPenaltyMs(attempt) / 1000})</small>}{attemptStatus(attempt) === 'DNF' && attempt.rawMs !== null && <small>({formatTime(attempt.rawMs)})</small>}</> : <span className="empty-result">—</span>}
        </button>{attempt && onPenalty && <div className="scorecard-penalties" role="group" aria-label={t('editSolveLabel', { number: index + 1, result: formatAttempt(attempt) })}>
          <div className="scorecard-penalty-controls">{(['+2', 'DNF'] as const).map(value => {
            const nextPenalty = attempt.penalty === value ? 'none' : value;
            // A DNF/DNS with no recorded time cannot become a timed result here.
            // The edit dialog remains available to supply a time first.
            const needsTime = attempt.rawMs === null && nextPenalty !== 'DNF' && attempt.inspectionPenalty !== 'DNF';
            return <button key={value} type="button" className="scorecard-penalty-button" aria-pressed={attempt.penalty === value} disabled={disabled || needsTime} onClick={() => onPenalty(attempt.id, nextPenalty)}>{value}</button>;
          })}</div>
        </div>}</li>;
      })}</ol>
      <div className="scorecard-average"><span>{formatLabel(definition.format)}</span><strong>{score ? scoreText(score) : '—'}</strong></div>
      <div className="possible-results"><div><span>{t('bestPossible')}</span><span>{possible ? scoreText(possible.best) : '—'}</span></div><div><span>{t('worstPossible')}</span><span>{possible ? scoreText(possible.worst) : '—'}</span></div></div>
    </div><button type="button" className="text-button stats-link" onClick={onStats} disabled={disabled}>{t('stats')}</button>
  </aside>;
}
