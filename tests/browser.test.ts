import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, preview } from 'vite';
import { firefox } from 'playwright';
import { compile } from '../language/index.js';
for (const production of [false, true]) test(`browser counter (${production ? 'production' : 'development'})`, async () => {
  const server = production ? await preview({preview:{host:'127.0.0.1',port:0}}) : await createServer({server:{host:'127.0.0.1',port:0}});
  if (!production) await (server as Awaited<ReturnType<typeof createServer>>).listen();
  const browser = await firefox.launch({headless:true});
  try {
    const page = await browser.newPage(); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(server.resolvedUrls!.local[0]);
    const button = page.getByRole('button',{name:'First: 0',exact:true}); await button.waitFor();
    await button.click();
    await page.getByRole('button',{name:'First: 1',exact:true}).click();
    assert.equal(await page.getByRole('button').nth(0).textContent(), 'First: 2');
    assert.equal(await page.getByRole('button').nth(1).textContent(), 'Second: 0');
    assert.equal(await page.locator('.counter').nth(0).getAttribute('class'),'counter compact');
    assert.equal(await page.locator('.counter').nth(1).getAttribute('class'),'counter');
    assert.equal(await page.locator('.counter').nth(0).evaluate(e=>getComputedStyle(e).padding),'4px');
    assert.equal(await page.locator('.counter').nth(1).evaluate(e=>getComputedStyle(e).padding),'16px');
    assert.equal(await page.getByRole('button').nth(0).evaluate(e=>getComputedStyle(e).color),'rgb(20, 80, 160)');
    const input=page.getByRole('textbox');await input.focus();await input.pressSequentially('Ada');
    assert.equal(await input.inputValue(),'Ada');
    assert.equal(await page.getByText('Hello, Ada',{exact:true}).textContent(),'Hello, Ada');
    assert.deepEqual(await input.evaluate(element=>({focused:element.ownerDocument.activeElement===element,start:(element as HTMLInputElement).selectionStart,end:(element as HTMLInputElement).selectionEnd})),{focused:true,start:3,end:3});
    const checkbox=page.getByRole('checkbox');assert.equal(await checkbox.isChecked(),false);await page.getByText('Notifications disabled',{exact:true}).waitFor();
    await checkbox.click();assert.equal(await checkbox.isChecked(),true);assert.equal(await checkbox.evaluate(element=>element.ownerDocument.activeElement===element),true);await page.getByText('Notifications enabled',{exact:true}).waitFor();assert.equal(await page.getByText('Notifications disabled',{exact:true}).count(),0);
    await page.getByRole('button',{name:'Disable notifications',exact:true}).click();assert.equal(await checkbox.isChecked(),false);await page.getByText('Notifications disabled',{exact:true}).waitFor();assert.equal(await page.getByText('Notifications enabled',{exact:true}).count(),0);
    await checkbox.click();assert.equal(await checkbox.isChecked(),true);await page.getByText('Notifications enabled',{exact:true}).waitFor();
    // Exercise the generated generic mount, hostile text and special identifiers,
    // typed defaults, and teardown rather than only the legacy runtime helper.
    const code=compile('component C(__proto__ = "safe", amount = 2, enabled = true):\n    count = 0\n    div class="base":\n        span text=__proto__ + str(amount) + str(enabled)\n        button text=str(count):\n            on click:\n                count = count + 1').code;
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
      const genericDisposed=await page.evaluate(async(code)=>{
        const runtime=await import(/* @vite-ignore */ '/runtime/index.ts');
        const blob=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));
        try {
          const {default:mount}=await import(/* @vite-ignore */ blob);
          const host=document.createElement('div');document.body.append(host);
          const dispose=mount(host,runtime,JSON.parse('{"__proto__":"<img src=x>","amount":3,"enabled":false,"class":"extra base"}'));
          const button=host.querySelector('button')!;button.click();
          const safe=host.textContent==='<img src=x>3false1'&&!host.querySelector('img')&&host.firstElementChild!.className==='base extra';
          dispose();dispose();button.click();const clean=host.childNodes.length===0&&button.textContent==='1';
          const defaultsDispose=mount(host,runtime);const defaults=host.textContent==='safe2true0';defaultsDispose();host.remove();
          return safe&&clean&&defaults;
        } finally {URL.revokeObjectURL(blob);}
      },code);
      assert.equal(genericDisposed,true);
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await new Promise<void>((resolve, reject) => { if ('close' in server) Promise.resolve(server.close()).then(() => resolve(), reject); else server.httpServer.close(e => e ? reject(e) : resolve()); }); }
});
