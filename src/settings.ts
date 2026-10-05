import type { Settings } from './types';

const KEY = 'toric-iol-settings';

const DEFAULTS: Settings = { recipients: '', clinicianName: '', contactNumber: '', vmo: '', lensPlatform: 'ZCU' };

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
  } catch {
    // Private mode / storage blocked: settings just won't persist.
  }
}
