// The import is maintained by scripts/sync.mjs.
import mount from './App.qb';
import * as runtime from '../../runtime';
const target = document.querySelector('#app');
if (!target) throw new Error('Missing application target');
mount(target, runtime);
