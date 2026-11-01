// Entry point: fetches newer settings from the sync server (if signed in) before the app
// reads them. Waits at most 2.5 s; offline or signed out, the app starts straight away.
import { KEY, SYNC_APP } from './settings';
import { pullBeforeStart } from './sync.js';

pullBeforeStart(SYNC_APP, KEY)
  .catch(() => 'offline')
  .finally(() => import('./main'));
