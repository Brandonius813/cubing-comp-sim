import { useMemo, useState } from 'react';
import { EVENTS, attemptTimeMs, formatAttempt, formatTime, scoreRound, type EventId, type Round } from '../core';
import { Dialog, Select } from './primitives';
import { eventName, formatLabel, scoreText } from './Scorecard';
import { localizedDate, t, useLocale } from './i18n';
import '../styles/statistics.css';

const PAGE_SIZE = 50;

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
  const pageCount = Math.max(1, Math.ceil(filteredRounds.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleRounds = filteredRounds.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  return <Dialog title={t('statisticsTitle')} onClose={onClose} className="statistics-dialog">
    <div className="statistics-toolbar">
      <Select label={t('event')} value={eventFilter} options={[{ value: 'all', label: t('allEvents') }, ...EVENTS.map(event => ({ value: event.id, label: eventName(event.id) }))]} onChange={value => { setEventFilter(value as EventId | 'all'); setPage(0); }} />
      <button type="button" className="secondary-button" onClick={() => void onExport()}>{t('export')}</button>
    </div>
    <div className="statistics-history">
      <dl className="statistics-summary">
        <div><dt>{t('solves')}</dt><dd>{summary.solves}</dd></div>
        <div><dt>{t('completedRounds')}</dt><dd>{summary.completed}</dd></div>
        <div><dt>{t('bestSingle')}</dt><dd>{formatTime(summary.best)}</dd></div>
      </dl>
      {visibleRounds.length === 0 ? <p className="statistics-empty">{t('noHistory')}</p> : <div className="statistics-rounds">{visibleRounds.map(round => <StatisticsRound key={round.id} round={round} onEdit={onEdit} />)}</div>}
      {pageCount > 1 && <nav className="statistics-pagination" aria-label={t('statisticsPages')}>
        <button type="button" className="secondary-button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>{t('previous')}</button>
        <span className="statistics-page-number">{currentPage + 1} / {pageCount}</span>
        <button type="button" className="secondary-button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>{t('nextPage')}</button>
      </nav>}
    </div>
  </Dialog>;
}

function StatisticsRound({ round, onEdit }: { round: Round; onEdit: (attemptId: string) => void }) {
  return <section className="statistics-round">
    <div className="statistics-round-heading"><div><h2>{eventName(round.eventId)}</h2><time dateTime={new Date(round.createdAt).toISOString()}>{localizedDate(round.createdAt)}</time></div><div className="statistics-round-result"><span>{formatLabel(round.format)}</span><strong>{scoreText(scoreRound(round))}</strong></div></div>
    <div className="statistics-attempts">{round.attempts.map(attempt => <button type="button" className="secondary-button" key={attempt.id} onClick={() => onEdit(attempt.id)} aria-label={t('editSolveLabel', { number: attempt.index + 1, result: formatAttempt(attempt) })}><span>{attempt.index + 1}</span>{formatAttempt(attempt)}</button>)}</div>
  </section>;
}
