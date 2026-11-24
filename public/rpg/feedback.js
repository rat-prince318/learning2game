export const CONFIRMATION_MS = 3000;
export const GUIDANCE_MS = 5000;

// Each visible message owns its time on screen. Calling without a delay
// cancels the old deadline when a message is replaced or its owner closes.
export function createFeedbackTimer(onExpire) {
  let timer;
  return (durationMs = 0) => {
    clearTimeout(timer);
    if (durationMs > 0) timer = setTimeout(onExpire, durationMs);
  };
}
