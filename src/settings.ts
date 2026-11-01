import type { Settings } from './types';

import { pushSoon } from './sync.js';

export const KEY = 'toric-iol-settings';
/** Name of this app's record on the settings sync server. */
export const SYNC_APP = 'sseh-orders';

const DEFAULTS: Settings = { recipients: '', clinicianName: '', contactNumber: '', vmo: '', lensPlatform: 'ZCU', emailBody: '', tutoplastEmailBody: '', istentEmailBody: '', orderKind: 'tutoplast', implantChoice: {} };

export function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    pushSoon(SYNC_APP, KEY);
  } catch {
    // Private mode / storage blocked: settings just won't persist.
  }
}
