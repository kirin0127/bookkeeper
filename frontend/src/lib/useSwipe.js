export function useSwipe(onSwipe) {
  let start = null, suppressClick = false;
  function pointermove(event) {
    if (!start || start.id !== event.pointerId) return;
    // Latch movement even if the finger later returns to its starting point.
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) suppressClick = true;
  }
  return {
    pointerdown(event) {
      if (!event.isPrimary) { start = null; suppressClick = true; return; }
      suppressClick = false;
      start = null;
      if (event.button !== 0 || event.target.closest('button:not([data-swipe-surface]),input,select,textarea')) return;
      start = { x: event.clientX, y: event.clientY, id: event.pointerId };
    },
    pointermove,
    pointerup(event) {
      if (!start || start.id !== event.pointerId) return;
      pointermove(event);
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      start = null;
      if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.6) {
        suppressClick = true;
        onSwipe(dx < 0 ? -1 : 1);
      }
    },
    pointercancel(event) {
      if (!start || start.id !== event.pointerId) return;
      start = null; suppressClick = true;
    },
    click(event) {
      // Keyboard and assistive-technology activation must remain available after scrolling.
      if (suppressClick && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); }
      suppressClick = false;
    },
  };
}
