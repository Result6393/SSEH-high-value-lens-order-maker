import type { Eye } from './types';

/** The details both tabs have, carried across when the user switches tab. Memory only, like all patient data. */
export interface PatientDetails {
  mrn: string;
  name: string;
  eye?: Eye;
  vmo: string;
  /** yyyy-mm-dd, or empty. */
  surgeryDate: string;
}

/** Fired on `document` by either tab's "Next patient"; every tab clears itself, so no patient lingers on the other tab. */
export const NEXT_PATIENT = 'next-patient';
