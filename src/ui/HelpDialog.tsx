import { useId } from 'react';
import { Dialog } from './primitives';
import { t } from './i18n';
import '../styles/help.css';

export function HelpDialog({ onClose }: { onClose: () => void }) {
  const id = useId();

  return <Dialog title={t('help')} onClose={onClose} className="help-dialog">
    <div className="help-sections">
      <section className="help-section" aria-labelledby={`${id}-about`}>
        <h2 id={`${id}-about`}>About</h2>
        <div className="help-guide">
          <p>This app is meant to simulate the flow of a WCA competition! You can choose an event and adjust how long you have to wait between scrambles. If you create an account, you can save your times to the cloud, and re-download them on another device!</p>
          <p>This app is open-source: <a href="https://github.com/Brandonius813/cubing-comp-sim" target="_blank" rel="noreferrer">{t('sourceLicenses')}</a></p>
          <p>I'm making versions of this app for iOS and Android right now, and they will hopefully be published soon!</p>
        </div>
      </section>
      <section className="help-section" aria-labelledby={`${id}-brandon`}>
        <h2 id={`${id}-brandon`}>Brandon True</h2>
        <div className="help-guide">
          <p>I've been a cuber since I was 10 years old. I started my <a href="https://www.youtube.com/@BrandonTrueCubing" target="_blank" rel="noreferrer">YouTube Channel</a> to share my cubing journey with other cubers, and have now branched out into interviewing other top cubers.</p>
          <p>I built this app because it's the kind of timer I've wanted to use as warm-up for cubing competitions, but nobody had made one quite like it. This app will always be free :)</p>
        </div>
      </section>
    </div>
  </Dialog>;
}
