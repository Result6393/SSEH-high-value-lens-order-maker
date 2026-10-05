import type { Platform } from './lenses';
import type { Eye } from './types';

/** What the user picked or typed for one lens family. */
export interface LensChoice {
  model: string;
  power: string;
  /** Only used by "Other". */
  company: string;
}

/**
 * Remembers the user's lens choices per eye and lens family, so switching to
 * another family (Tecnis / Clareon / Other) or eye and back doesn't lose them.
 * Only explicit choices are stored; anything not remembered falls back to what
 * the printout suggests. In memory only, like all patient data.
 */
export class LensMemory {
  private choices = new Map<string, LensChoice>();

  private static key(eye: Eye | undefined, platform: Platform): string {
    return `${eye ?? ''}|${platform}`;
  }

  remember(eye: Eye | undefined, platform: Platform, choice: LensChoice): void {
    this.choices.set(LensMemory.key(eye, platform), { ...choice });
  }

  /**
   * The remembered choice for this eye and family. A choice made before any eye
   * was selected moves to the first eye selected, so it isn't later applied to the other eye.
   */
  recall(eye: Eye | undefined, platform: Platform): LensChoice | undefined {
    const specific = this.choices.get(LensMemory.key(eye, platform));
    if (specific || !eye) return specific && { ...specific };
    const general = this.choices.get(LensMemory.key(undefined, platform));
    if (!general) return undefined;
    this.choices.delete(LensMemory.key(undefined, platform));
    this.choices.set(LensMemory.key(eye, platform), general);
    return { ...general };
  }

  clear(): void {
    this.choices.clear();
  }
}
