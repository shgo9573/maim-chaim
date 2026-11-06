export type Amud = "a" | "b";

export type BubbleRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type LayerKind = "gemara" | "rashi" | "tosafot";

export const LAYER_LABELS: Record<LayerKind, string> = {
  gemara: "גמרא",
  rashi: "רש״י",
  tosafot: "תוספות",
};

export type Bubble = {
  id: string;
  layer: LayerKind;
  /** Otzaria book that holds this bubble's text (Gemara, Rashi or Tosafot of the tractate). */
  bookId?: number | null;
  lineIndex: number | null;
  segmentIndex: number;
  text: string;
  preview: string;
  score: number;
  /** Where the bubble came from: a line of the book, never a row of the scan. */
  kind: "segment";
  rects: BubbleRect[];
};
