import type { Reporter, TestCase, TestResult, FullResult } from '@playwright/test/reporter';
import { writeFileSync, readFileSync } from 'node:fs';

export default class ManualReporter implements Reporter {
  skipped = false;
  chapters = new Map<string, {title: string, start: number, steps: {title: string, image: string}[]}>();
  onTestEnd(test: TestCase, result: TestResult) {
    if (result.status === 'skipped') this.skipped = true;
    if (result.status !== 'passed') return;
    const steps = result.attachments.filter(a => a.name.startsWith('boom-doc:')).map(a => ({
      title: a.name.slice(9), image: (a.body ?? readFileSync(a.path!)).toString('base64'),
    }));
    if (steps.length) this.chapters.set(test.id, {title: test.title, start: +result.startTime, steps});
  }
  onEnd(result: FullResult) {
    if (result.status === 'passed' && !this.skipped && process.env.BOOM_RECORD)
      writeFileSync(process.env.BOOM_RECORD, JSON.stringify([...this.chapters.values()]));
  }
}
