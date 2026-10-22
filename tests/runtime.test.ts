import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { firefox } from 'playwright';
import { compile } from '../language/index.js';

test('nested dynamic ranges update after fragment mounting and retain keyed identity', async () => {
  const code = compile(`class Item:
    id = 0
    name = ""
    enabled = true
component Nested:
    visible = true
    detailed = true
    items = [Item(1, "<img src=x>", true), Item(2, "Coffee", true)]
    button text="Hide":
        on click:
            visible = false
    button text="Show":
        on click:
            visible = true
    button text="Compact":
        on click:
            detailed = false
    if visible:
        if detailed:
            h2 text="Details"
        else:
            h2 text="Compact"
        for item in items key=item.id:
            if item.enabled:
                span text=item.name
            input:
                type="checkbox"
                checked=item.enabled
                on change:
                    item.enabled = event.checked
            button text="Move " + item.name:
                on click:
                    items.move(item, 0)
            button text="Remove " + item.name:
                on click:
                    items.remove(item)
        button text="Add":
            on click:
                items.append(Item(3, "Cocoa", true))
`).code;
  const runtime = await readFile('dist/lib/runtime/index.js', 'utf8');
  const browser = await firefox.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const result = await page.evaluate(async ({ code, runtime }) => {
      const urls = [runtime, code].map(source => URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
      try {
        const api = await import(/* @vite-ignore */ urls[0]);
        const { default: mount } = await import(/* @vite-ignore */ urls[1]);
        const host = document.createElement('main'); document.body.append(host);
        const dispose = mount(host, api);
        const actions = { click(text: string) {
          const button = [...host.querySelectorAll('button')].find(node => node.textContent === text);
          if (!button) throw new Error(`Missing button ${text}`);
          button.click();
        } };
        actions.click('Compact');
        const nestedCondition = host.querySelector('h2')?.textContent;
        const coffee = host.querySelectorAll('span')[1];
        const input = host.querySelectorAll('input')[1];
        actions.click('Move Coffee');
        const retained = host.querySelector('span') === coffee && host.querySelector('input') === input;
        input.click(); input.click();
        const nestedAfterMove = host.querySelector('span')?.textContent;
        actions.click('Remove <img src=x>'); actions.click('Add');
        const names = [...host.querySelectorAll('span')].map(node => node.textContent);
        const safe = !host.querySelector('img');
        const removedButton = [...host.querySelectorAll('button')].find(node => node.textContent === 'Remove Coffee')!;
        actions.click('Hide'); removedButton.click(); actions.click('Show');
        const remounted = [...host.querySelectorAll('span')].map(node => node.textContent);
        dispose(); dispose(); input.click(); removedButton.click();
        const empty = host.childNodes.length === 0;
        host.remove();
        return { nestedCondition, retained, nestedAfterMove, names, safe, remounted, empty };
      } finally { urls.forEach(url => URL.revokeObjectURL(url)); }
    }, { code, runtime });
    assert.deepEqual(result, { nestedCondition: 'Compact', retained: true, nestedAfterMove: 'Coffee', names: ['Coffee', 'Cocoa'], safe: true, remounted: ['Coffee', 'Cocoa'], empty: true });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('unchanged text values produce no character data mutations', async () => {
  const code = compile(`component Text:
    items = [1, 1]
    button text="Move":
        on click:
            items.move(1, 1)
    button text="Add":
        on click:
            items.append(3)
    p text=str(items)
`).code;
  const runtime = await readFile('dist/lib/runtime/index.js', 'utf8');
  const browser = await firefox.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const result = await page.evaluate(async ({ code, runtime }) => {
      const urls = [runtime, code].map(source => URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
      try {
        const api = await import(/* @vite-ignore */ urls[0]);
        const { default: mount } = await import(/* @vite-ignore */ urls[1]);
        const host = document.createElement('main'); document.body.append(host);
        const dispose = mount(host, api);
        const text = host.querySelector('p')!.firstChild!;
        const observer = new MutationObserver(() => {});
        observer.observe(text, { characterData: true });
        const buttons = host.querySelectorAll('button');
        buttons[0].click();
        const unchanged = observer.takeRecords().length;
        buttons[1].click();
        const changed = observer.takeRecords().length;
        observer.disconnect(); dispose(); host.remove();
        return { unchanged, changed, text: text.textContent };
      } finally { urls.forEach(url => URL.revokeObjectURL(url)); }
    }, { code, runtime });
    assert.deepEqual(result, { unchanged: 0, changed: 1, text: '1,1,3' });
  } finally { await browser.close(); }
});
