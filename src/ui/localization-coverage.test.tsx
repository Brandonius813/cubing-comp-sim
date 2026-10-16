import { afterEach, describe, expect, it } from 'vitest';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import { LOCALES } from '../locales';
import { setLocale, t } from './i18n';
import { HelpDialog } from './HelpDialog';
import { StatisticsDialog } from './StatisticsDialog';

afterEach(() => setLocale('en'));
describe('visible and accessible interface copy', () => {
  it('does not introduce untranslated JSX text or accessible labels', () => {
    const sources = import.meta.glob<string>(['../App.tsx', './*.tsx', '!./*.test.tsx'], { query: '?raw', import: 'default', eager: true });
    const allowed = new Set(['Cubing Comp Sim', 'Brandon True', 's', 'MM:SS']);
    const violations: string[] = [];
    for (const [path, source] of Object.entries(sources)) {
      const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function visit(node: ts.Node) {
        if (ts.isJsxText(node)) {
          const text = node.text.trim();
          if (/[A-Za-z]/.test(text) && !allowed.has(text)) violations.push(`${path}: ${text}`);
        }
        if (ts.isJsxAttribute(node) && ['title', 'aria-label', 'placeholder', 'alt'].includes(node.name.getText(file)) && node.initializer && ts.isStringLiteral(node.initializer)) {
          const text = node.initializer.text.trim();
          if (/[A-Za-z]/.test(text) && !allowed.has(text)) violations.push(`${path}: ${text}`);
        }
        ts.forEachChild(node, visit);
      }
      visit(file);
    }
    expect(violations).toEqual([]);
  });
  for (const { id } of LOCALES) it(`renders Help and Statistics in ${id}`, () => {
    setLocale(id);
    const help = renderToStaticMarkup(<HelpDialog onClose={() => {}} />);
    const stats = renderToStaticMarkup(<StatisticsDialog rounds={[]} onEdit={() => {}} onExport={() => {}} onClose={() => {}} />);
    const escaped = (text: string) => renderToStaticMarkup(<span>{text}</span>).slice(6, -7);
    expect(help).toContain(escaped(t('helpDescription')));
    expect(help).toContain(escaped(t('helpBio')));
    expect(stats).toContain(escaped(t('statisticsTitle')));
  });
});
