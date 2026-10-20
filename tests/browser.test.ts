import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, preview } from 'vite';
import { chromium } from 'playwright';
for (const production of [false, true]) test(`browser counter (${production ? 'production' : 'development'})`, async () => {
  const server = production ? await preview({preview:{host:'127.0.0.1',port:0}}) : await createServer({server:{host:'127.0.0.1',port:0}});
  if (!production) await (server as Awaited<ReturnType<typeof createServer>>).listen();
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage(); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(server.resolvedUrls!.local[0]);
    const button = page.getByRole('button'); await button.waitFor();
    assert.equal(await button.textContent(), 'Count: 0');
    await button.click(); await button.click(); assert.equal(await button.textContent(), 'Count: 2');
    if (!production) {
      const disposed = await page.evaluate(async () => {
        const { mountCounter } = await import(/* @vite-ignore */ '/runtime/index.ts');
        const host = document.createElement('div'); document.body.append(host);
        const dispose = mountCounter(host, {initial:0, prefix:'<img src=x>', step:1});
        const element = host.querySelector('button')!;
        const safe = element.textContent === '<img src=x>0' && !host.querySelector('img');
        dispose(); element.click();
        const result = safe && host.childNodes.length === 0 && element.textContent === '<img src=x>0'; host.remove();
        return result;
      });
      assert.equal(disposed, true);
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await new Promise<void>((resolve, reject) => { if ('close' in server) Promise.resolve(server.close()).then(() => resolve(), reject); else server.httpServer.close(e => e ? reject(e) : resolve()); }); }
});
