import type { Platform } from './lenses';

export type Eye = 'Right' | 'Left';

/** Everything about one request. Lives in memory only and is discarded on reset. */
export interface RequestData {
  eye: Eye;
  /** The patient's name as one line, e.g. "SMITH, John". The coordinators match it by hand. */
  name: string;
  mrn: string;
  /** dd/mm/yyyy */
  dob: string;
  /** Corneal astigmatism (IOLMaster "Ast. K") of the operative eye, dioptres. */
  astK: string;
  astAxis: string;
  vmo: string;
  /** e.g. "ZCU300" */
  lensModel: string;
  /** Spherical power in dioptres, e.g. "22" or "+22.0". */
  lensPower: string;
  company: string;
  /** Free text for the order form's Diagnosis box. */
  diagnosis: string;
  /** yyyy-mm-dd from <input type="date">, optional. */
  surgeryDate: string;
}

/** A tutoplast order: patient from a sticker, no biometry or lens. Memory only, like RequestData. */
export interface TutoplastRequest {
  eye: Eye;
  name: string;
  mrn: string;
  /** dd/mm/yyyy */
  dob: string;
  vmo: string;
  /** yyyy-mm-dd from <input type="date">, optional. */
  surgeryDate: string;
  /** Written in the order form's "Implant/Prosthesis Required" box. */
  implant: string;
  company: string;
  /** Free text for the order form's Diagnosis box. */
  diagnosis: string;
}

/** Non-patient preferences, the only thing the app persists. */
export interface Settings {
  recipients: string;
  clinicianName: string;
  contactNumber: string;
  /** Last VMO surgeon used, to prefill the next request. */
  vmo: string;
  /** Last lens family used (ZCU most of the time). */
  lensPlatform: Platform;
  /** Email text; `{name}` becomes the sender's first name. Empty means the default. */
  emailBody: string;
  /** Same, for tutoplast orders. */
  tutoplastEmailBody: string;
}
