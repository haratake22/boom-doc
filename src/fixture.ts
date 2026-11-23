import { test as base, expect } from '@playwright/test';

type Step = (title: string, action: () => Promise<unknown>) => Promise<void>;

export const test = base.extend<{ manualStep: Step }>({
  manualStep: async ({ page }, use, info) => {
    await use(async (title, action) => {
      await base.step(title, async () => {
        await action();
        await info.attach('boom-doc:' + title, {
          body: await page.screenshot({ animations: 'disabled' }),
          contentType: 'image/png',
        });
      });
    });
  },
});
export { expect };
