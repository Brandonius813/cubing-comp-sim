import { attemptStatus, totalPenaltyMs, formatAttempt, formatTime, getEvent, possibleResults, scoreRound, type Round, type Score } from '../core';
import { Icon } from './primitives';
import { t, localizedEventName } from './i18n';

export const scoreText = (score: Score) => score.status === 'DNF' ? 'DNF' : score.status === 'incomplete' ? '—' : formatTime(score.valueMs);
export const formatLabel = (format: Round['format']) => ({ ao5: 'Ao5', mo3: 'Mo3', bo5: t('bestOf5'), bo3: t('bestOf3') })[format];
export const eventName = localizedEventName;
export function Scorecard({ round, eventId, roundNumber, onHide, onEdit, onStats }: {
  round: Round | null; eventId: Parameters<typeof getEvent>[0]; roundNumber: number;
  onHide: () => void; onEdit: (attemptId: string) => void; onStats: () => void;
}) {
  const definition = getEvent(round?.eventId ?? eventId);
  const score = round ? scoreRound(round) : null;
  const possible = round && round.attempts.length > 0 && round.completedAt === undefined ? possibleResults(round) : null;
  return <aside className="scorecard-wrap" aria-label={t('scorecard')}>
    <div className={`scorecard ${definition.attemptCount === 3 ? 'three-solves' : ''}`}>
      <button className="minimize-scorecard" type="button" onClick={onHide} title={t('hideScorecard')} aria-label={t('hideScorecard')}><Icon name="minus" /></button>
      <div className="scorecard-fields"><div><span>{t('event')}</span><div>{eventName(definition.id)}</div></div><div><span>{t('round')}</span><div>{String(roundNumber).padStart(2, '0')}</div></div></div>
      <p className="result-heading">{t('result')}</p>
      <ol className="scorecard-results">{Array.from({ length: definition.attemptCount }, (_, index) => {
        const attempt = round?.attempts[index];
        return <li key={index}><span>{index + 1}</span><button type="button" className={score?.discardedIndices.includes(index) ? 'discarded' : ''} disabled={!attempt} onClick={() => attempt && onEdit(attempt.id)} aria-label={attempt ? t('editSolveLabel', { number: index + 1, result: formatAttempt(attempt) }) : t('emptySolveLabel', { number: index + 1 })}>
          {attempt ? <>{formatAttempt(attempt)}{attemptStatus(attempt) === 'ok' && totalPenaltyMs(attempt) > 0 && <small>({formatTime(attempt.rawMs)} + {totalPenaltyMs(attempt) / 1000})</small>}{attemptStatus(attempt) === 'DNF' && attempt.rawMs !== null && <small>({formatTime(attempt.rawMs)})</small>}</> : <span className="empty-result">—</span>}
        </button></li>;
      })}</ol>
      <div className="scorecard-average"><span>{formatLabel(definition.format)}</span><strong>{score ? scoreText(score) : '—'}</strong></div>
      <div className="possible-results"><div><span>{t('bestPossible')}</span><span>{possible ? scoreText(possible.best) : '—'}</span></div><div><span>{t('worstPossible')}</span><span>{possible ? scoreText(possible.worst) : '—'}</span></div></div>
    </div><button className="text-button stats-link" onClick={onStats}>{t('stats')}</button>
  </aside>;
}
