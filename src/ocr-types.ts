/** Minimal OCR output the extractor needs; one entry per OCR pass. */
export interface OcrWord {
  text: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface OcrLine {
  words: OcrWord[];
}

export interface OcrPass {
  lines: OcrLine[];
}
