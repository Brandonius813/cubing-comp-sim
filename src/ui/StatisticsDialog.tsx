import { useMemo, useState } from 'react';
import { EVENTS, attemptTimeMs, formatAttempt, formatTime, scoreRound, type EventId, type Round } from '../core';
import { getEventRoundStatistics, getRoundStatisticsByEvent, type RoundMean } from '../core/statistics';
import { Dialog, Select } from './primitives';
import { eventName, formatLabel, scoreText } from './Scorecard';
import { localizedDate, t, useLocale } from './i18n';
import '../styles/statistics.css';

const PAGE_SIZE = 50;
const meanText = (mean: RoundMean) => mean.status === 'DNF' ? 'DNF' : mean.status === 'incomplete' ? '—' : formatTime(mean.valueMs);

export function StatisticsDialog({ rounds, onEdit, onExport, onClose }: {
  rounds: readonly Round[];
  onEdit: (attemptId: string) => void;
  onExport: () => void | Promise<void>;
  onClose: () => void;
}) {
  useLocale();
  const [eventFilter, setEventFilter] = useState<EventId | 'all'>('all');
  const [page, setPage] = useState(0);
  const filteredRounds = useMemo(() => rounds
    .filter(round => eventFilter === 'all' || round.eventId === eventFilter)
    .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id)), [rounds, eventFilter]);
  const summary = useMemo(() => {
    let solves = 0;
    let best: number | null = null;
    for (const round of filteredRounds) {
      solves += round.attempts.length;
      for (const attempt of round.attempts) {
        const time = attemptTimeMs(attempt);
        if (time !== null && (best === null || time < best)) best = time;
      }
    }
    return { solves, best, completed: filteredRounds.filter(round => round.completedAt !== undefined).length };
  }, [filteredRounds]);
  const roundStatistics = useMemo(() => eventFilter === 'all'
    ? getRoundStatisticsByEvent(rounds)
    : [getEventRoundStatistics(rounds, eventFilter)], [rounds, eventFilter]);
  const pageCount = Math.max(1, Math.ceil(filteredRounds.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleRounds = filteredRounds.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  return <Dialog title="Statistics" onClose={onClose} className="statistics-dialog">
    <div className="statistics-toolbar">
      <Select label={t('event')} value={eventFilter} options={[{ value: 'all', label: t('allEvents') }, ...EVENTS.map(event => ({ value: event.id, label: eventName(event.id) }))]} onChange={value => { setEventFilter(value as EventId | 'all'); setPage(0); }} />
      <button type="button" className="secondary-button" onClick={() => void onExport()}>{t('export')}</button>
    </div>
    <div className="statistics-layout">
      <div className="statistics-history">
        <dl className="statistics-summary">
          <div><dt>{t('solves')}</dt><dd>{summary.solves}</dd></div>
          <div><dt>{t('completedRounds')}</dt><dd>{summary.completed}</dd></div>
          <div><dt>{t('bestSingle')}</dt><dd>{formatTime(summary.best)}</dd></div>
        </dl>
        {visibleRounds.length === 0 ? <p className="statistics-empty">{t('noHistory')}</p> : <div className="statistics-rounds">{visibleRounds.map(round => <StatisticsRound key={round.id} round={round} onEdit={onEdit} />)}</div>}
        {pageCount > 1 && <nav className="statistics-pagination" aria-label="Statistics pages">
          <button type="button" className="secondary-button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>{t('previous')}</button>
          <span className="statistics-page-number">{currentPage + 1} / {pageCount}</span>
          <button type="button" className="secondary-button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>{t('nextPage')}</button>
        </nav>}
      </div>
      <aside className="round-means-panel" aria-label="Mean of 3 rounds">
        <h2>Mean of 3 rounds</h2>
        <p className="round-means-description">The mean of three consecutive completed round results for the same event.</p>
        {roundStatistics.length === 0 ? <p className="round-means-empty">Complete three rounds in an event to see your first mean.</p> : roundStatistics.map(statistics => <section className="round-mean-event" key={statistics.eventId} aria-label={`${eventName(statistics.eventId)} mean of 3 rounds`}>
          <h3>{eventName(statistics.eventId)}</h3>
          <dl className="round-mean-values"><div><dt>Current</dt><dd className={statistics.current.status === 'DNF' ? 'error-text' : undefined}>{meanText(statistics.current)}</dd></div><div><dt>Best</dt><dd className={statistics.best.status === 'ok' ? 'positive-text' : statistics.best.status === 'DNF' ? 'error-text' : undefined}>{meanText(statistics.best)}</dd></div></dl>
          {statistics.completedRounds < 3 && <p className="round-mean-progress">{statistics.completedRounds} / 3 completed rounds</p>}
        </section>)}
        <p className="round-means-footnote">Current uses the last three completed rounds. Best uses the fastest consecutive set of three. A DNF round makes that mean DNF. This is a practice statistic.</p>
      </aside>
    </div>
  </Dialog>;
}

function StatisticsRound({ round, onEdit }: { round: Round; onEdit: (attemptId: string) => void }) {
  return <section className="statistics-round">
    <div className="statistics-round-heading"><div><h2>{eventName(round.eventId)}</h2><time dateTime={new Date(round.createdAt).toISOString()}>{localizedDate(round.createdAt)}</time></div><div className="statistics-round-result"><span>{formatLabel(round.format)}</span><strong>{scoreText(scoreRound(round))}</strong></div></div>
    <div className="statistics-attempts">{round.attempts.map(attempt => <button type="button" className="secondary-button" key={attempt.id} onClick={() => onEdit(attempt.id)} aria-label={t('editSolveLabel', { number: attempt.index + 1, result: formatAttempt(attempt) })}><span>{attempt.index + 1}</span>{formatAttempt(attempt)}</button>)}</div>
  </section>;
}
