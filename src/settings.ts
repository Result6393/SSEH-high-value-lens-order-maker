import type { Settings } from './types';

const KEY = 'toric-iol-settings';

export const DEFAULT_RECIPIENTS = [
  'recipient@example.org',
  'recipient@example.org',
  'recipient@example.org',
  'recipient@example.org',
].join(', ');

const DEFAULTS: Settings = { recipients: DEFAULT_RECIPIENTS, clinicianName: '', contactNumber: '', vmo: '' };

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
