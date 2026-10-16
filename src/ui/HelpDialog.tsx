import { useId } from 'react';
import { Dialog } from './primitives';
import { t } from './i18n';
import '../styles/help.css';

export function HelpDialog({ onClose }: { onClose: () => void }) {
  const id = useId();

  return <Dialog title={t('help')} onClose={onClose} className="help-dialog">
    <div className="help-sections">
      <section className="help-section" aria-labelledby={`${id}-about`}>
        <h2 id={`${id}-about`}>{t('about')}</h2>
        <div className="help-guide">
          <p>{t('helpDescription')}</p>
          <p>{t('helpOpenSource')} <a href="https://github.com/Brandonius813/cubing-comp-sim" target="_blank" rel="noreferrer">{t('sourceLicenses')}</a></p>
          <p>{t('helpMobile')}</p>
        </div>
      </section>
      <section className="help-section" aria-labelledby={`${id}-brandon`}>
        <h2 id={`${id}-brandon`}>Brandon True</h2>
        <div className="help-guide">
          <p>{t('helpBio')} <a href="https://www.youtube.com/@BrandonTrueCubing" target="_blank" rel="noreferrer">{t('youtubeChannel')}</a></p>
          <p>{t('helpReason')}</p>
        </div>
      </section>
    </div>
  </Dialog>;
}
