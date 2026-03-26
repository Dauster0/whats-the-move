import type { ConciergeSuggestion } from "./concierge-types";

export type PeekDetailHandlers = {
  onNah: () => void;
  onCommit: () => void;
  /** Don’t count as a left swipe — permanent hide + pop deck when peeking. */
  onNeverShow?: () => void;
};

let peekHandlers: PeekDetailHandlers | null = null;

export function setPeekDetailHandlers(h: PeekDetailHandlers | null) {
  peekHandlers = h;
}

export function getPeekDetailHandlers(): PeekDetailHandlers | null {
  return peekHandlers;
}

export type PeekCommitPayload = {
  suggestion: ConciergeSuggestion;
  others: ConciergeSuggestion[];
};
