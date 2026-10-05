export type Eye = 'Right' | 'Left';

/** Everything about one request. Lives in memory only and is discarded on reset. */
export interface RequestData {
  name: string;
  mrn: string;
  eye: Eye;
  /** Corneal cylinder in dioptres, as typed by the user (optional). */
  cyl: string;
}

/** Non-patient preferences, the only thing the app persists. */
export interface Settings {
  recipients: string;
  clinicianName: string;
}
