import { useSyncExternalStore } from 'react';
import { Dimensions, Keyboard, type KeyboardEvent } from 'react-native';

// One shared reading of the on-screen keyboard for the whole app, like useReducedMotion's. It follows
// the "will" events, so a move is known as the keyboard starts it rather than after.

/** Where the keyboard is heading: how far it reaches up from the bottom of the screen (0 when hidden), and how long it takes to get there. */
export type KeyboardFrame = { height: number; durationMs: number };

let frame: KeyboardFrame = { height: 0, durationMs: 0 };
const listeners = new Set<() => void>();
let started = false;

const heightFrom = (screenY: number) => Math.max(0, Dimensions.get('window').height - screenY);

function update(next: KeyboardFrame) {
  if (next.height === frame.height) return;
  frame = next;
  listeners.forEach((l) => l());
}

function start() {
  if (started) return;
  started = true;
  const showing = Keyboard.metrics();
  if (showing) frame = { height: heightFrom(showing.screenY), durationMs: 0 };
  Keyboard.addListener('keyboardWillChangeFrame', (e: KeyboardEvent) => update({ height: heightFrom(e.endCoordinates.screenY), durationMs: e.duration }));
  Keyboard.addListener('keyboardWillHide', (e: KeyboardEvent) => update({ height: 0, durationMs: e.duration }));
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** How far the keyboard reaches up from the bottom of the screen right now, for timers and handlers. */
export function keyboardHeightNow(): number {
  start();
  return frame.height;
}

/** The keyboard's frame, for layout: updates as the keyboard starts to show, change size, or hide. */
export function useKeyboardFrame(): KeyboardFrame {
  return useSyncExternalStore(subscribe, () => frame);
}
