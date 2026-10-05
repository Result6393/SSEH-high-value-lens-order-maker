export type Eye = 'Right' | 'Left';

/** Everything about one request. Lives in memory only and is discarded on reset. */
export interface RequestData {
  eye: Eye;
  surname: string;
  firstName: string;
  mrn: string;
  /** dd/mm/yyyy */
  dob: string;
  /** Corneal astigmatism (IOLMaster "Ast. K") of the operative eye, dioptres. */
  astK: string;
  astAxis: string;
  vmo: string;
  /** yyyy-mm-dd from <input type="date">, optional. */
  surgeryDate: string;
}

/** Non-patient preferences, the only thing the app persists. */
export interface Settings {
  recipients: string;
  clinicianName: string;
  contactNumber: string;
  /** Last VMO surgeon used, to prefill the next request. */
  vmo: string;
}
