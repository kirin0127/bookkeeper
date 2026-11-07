export function useSwipe(onSwipe) {
  let start = null, suppressClick = false;
  return {
    pointerdown(event) {
      suppressClick = false;
      start = null;
      if (!event.isPrimary || event.button !== 0 || event.target.closest('button,input,select,textarea')) return;
      start = { x: event.clientX, y: event.clientY, id: event.pointerId };
    },
    pointerup(event) {
      if (!start || start.id !== event.pointerId) return;
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      start = null;
      if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.6) {
        suppressClick = true;
        onSwipe(dx < 0 ? -1 : 1);
      }
    },
    pointercancel() { start = null; },
    click(event) {
      if (suppressClick) { event.preventDefault(); event.stopPropagation(); suppressClick = false; }
    },
  };
}
