import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { Dialog } from './primitives';
import { t } from './i18n';
import '../styles/help.css';

export type HelpTopic = 'app' | 'competitions' | 'brandon';
export interface HelpVideo { embedUrl: string; title: string }
const topics: { id: HelpTopic; label: string; videoTitle: string }[] = [
  { id: 'app', label: 'About This App', videoTitle: 'Using Cubing Comp Sim' },
  { id: 'competitions', label: 'How WCA Competitions Work', videoTitle: 'Your first cubing competition' },
  { id: 'brandon', label: 'About Brandon True', videoTitle: 'Meet Brandon True' },
];

/** Pass reviewed embed URLs here when the introductory videos are ready. */
export function HelpDialog({ onClose, videos = {} }: { onClose: () => void; videos?: Partial<Record<HelpTopic, HelpVideo>> }) {
  const [topic, setTopic] = useState<HelpTopic>('app');
  const id = useId();
  const tabs = useRef<Partial<Record<HelpTopic, HTMLButtonElement | null>>>({});
  const active = topics.find(value => value.id === topic)!;
  const navigateTabs = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = topics.findIndex(value => value.id === topic);
    let next: number;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (index + 1) % topics.length;
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (index + topics.length - 1) % topics.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = topics.length - 1;
    else return;
    event.preventDefault();
    setTopic(topics[next].id);
    tabs.current[topics[next].id]?.focus();
  };

  return <Dialog title={t('help')} onClose={onClose} className="help-dialog">
    <div className="help-layout">
      <div className="help-navigation" role="tablist" aria-label="Help topics" aria-orientation="vertical">
        {topics.map(value => <button type="button" role="tab" id={`${id}-${value.id}`} aria-controls={`${id}-panel`} aria-selected={topic === value.id} tabIndex={topic === value.id ? 0 : -1} key={value.id} ref={element => { tabs.current[value.id] = element; }} onClick={() => setTopic(value.id)} onKeyDown={navigateTabs}>{value.label}</button>)}
      </div>
      <section className="help-panel" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${topic}`} tabIndex={0}>
        <h2>{active.label}</h2>
        <HelpVideoPanel key={topic} video={videos[topic]} title={active.videoTitle} />
        {topic === 'app' && <div className="help-guide">
          <p>Cubing Comp Sim helps you practice the rhythm of a competition round, from the first scramble to the final scorecard.</p>
          <ol><li>Choose your event, start a simulation, and apply the scramble. Use the drawing to check your puzzle.</li><li>Follow the on-screen controls to inspect, time, and confirm each solve. Choose Manual Entry in Settings if you use a separate timer.</li><li>Your scorecard fills in as you go. Hover over a result for penalty controls, or select it to edit the time.</li></ol>
          <p>Your results are saved on this device. Open Statistics to review your rounds, check your mean of three rounds, or export a backup.</p>
          <p className="help-guide-note">Clearing your browser's site data can remove local results. Signing in does not automatically transfer them.</p>
        </div>}
        {topic === 'competitions' && <div className="help-guide">
          <p>Competitions split events into rounds and smaller groups. Check your group assignment and be ready when it is called.</p>
          <ol><li>Submit your puzzle at the designated table, then wait to be called to a solving station.</li><li>For events with inspection, tell the judge when you are ready. Inspect without making moves; the judge gives callouts at 8 and 12 seconds.</li><li>After solving, let the judge check the puzzle. Review the recorded result and the judge's signature before signing your score sheet.</li></ol>
          <p>Procedures differ for some events. Read the official guidance and ask a WCA Delegate if you are unsure.</p>
          <div className="help-resource-links"><a href="https://documents.worldcubeassociation.org/edudoc/competitor-tutorial/tutorial.pdf" target="_blank" rel="noreferrer">Official competitor tutorial</a><a href="https://www.worldcubeassociation.org/regulations/" target="_blank" rel="noreferrer">WCA Regulations</a></div>
        </div>}
        {topic === 'brandon' && <div className="help-guide">
          <p>Cubing Comp Sim is a project by Brandon True, built around a simple goal: make competition practice easy to start and repeat.</p>
          <p>The app focuses on the complete round, including inspection, waiting between attempts, and reviewing your scorecard.</p>
          <p>The source code is public. You can follow the project, report a problem, or suggest an improvement on GitHub.</p>
        </div>}
        <footer className="help-footer"><a href="https://github.com/Brandonius813/cubing-comp-sim" target="_blank" rel="noreferrer">{t('sourceLicenses')}</a></footer>
      </section>
    </div>
  </Dialog>;
}

function HelpVideoPanel({ video, title }: { video?: HelpVideo; title: string }) {
  const [loaded, setLoaded] = useState(false);
  return <div className="help-video">
    {video && loaded ? <iframe src={video.embedUrl} title={video.title} allow="fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /> : <div className="help-video-placeholder">
      <span className="help-video-symbol" aria-hidden="true">▶</span><span className="help-video-eyebrow">Video walkthrough</span><strong>{title}</strong>
      {video ? <><p>Load the video to watch online.</p><button type="button" className="secondary-button" onClick={() => setLoaded(true)}>Load video</button></> : <p>Video coming soon. Read the guide below to get started.</p>}
    </div>}
  </div>;
}
