export type Intent = 'left' | 'right' | 'jump' | 'slideStart' | 'slideEnd' | 'tap';

export interface InputHandlers {
  onIntent(intent: Intent): void;
  onRestart(): void;
  onFirstGesture?(): void;
}

export const SWIPE_THRESHOLD = 30;

const KEY_MAP: Readonly<Record<string, Intent>> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'jump',
  KeyW: 'jump',
  Space: 'jump',
  ArrowDown: 'slideStart',
  KeyS: 'slideStart',
};

/** 键抬起时算「松手」的键（长按肚皮滑铲靠它判断） */
const SLIDE_KEYS = new Set(['ArrowDown', 'KeyS']);

/**
 * 键盘 + 触屏统一成意图事件。
 * 滑铲拆成 slideStart / slideEnd：按住时长决定普通滑铲还是肚皮滑行。
 */
export function createInput(target: HTMLElement, handlers: InputHandlers): { dispose(): void } {
  let gestureSeen = false;
  const noteGesture = (): void => {
    if (gestureSeen) return;
    gestureSeen = true;
    handlers.onFirstGesture?.();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    noteGesture();
    if (event.code === 'KeyR') {
      event.preventDefault();
      if (!event.repeat) handlers.onRestart();
      return;
    }
    const intent = KEY_MAP[event.code];
    if (intent === undefined) {
      // 未映射的键也当成一次「轻点」：演出阶段靠它跳过（提示写的是「任意键」）
      if (!event.repeat) handlers.onIntent('tap');
      return;
    }
    event.preventDefault();
    if (event.repeat) return;
    handlers.onIntent(intent);
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    if (!SLIDE_KEYS.has(event.code)) return;
    event.preventDefault();
    handlers.onIntent('slideEnd');
  };

  const onBlur = (): void => {
    handlers.onIntent('slideEnd');
  };

  let touchId: number | null = null;
  let startX = 0;
  let startY = 0;
  let fired = false;
  let slideHeld = false;

  const onTouchStart = (event: TouchEvent): void => {
    noteGesture();
    if (touchId !== null) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    touchId = touch.identifier;
    startX = touch.clientX;
    startY = touch.clientY;
    fired = false;
  };

  const onTouchMove = (event: TouchEvent): void => {
    if (touchId === null) return;
    const touch = event.changedTouches[0];
    if (!touch || touch.identifier !== touchId) return;
    event.preventDefault();
    if (fired) return;
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    if (Math.hypot(dx, dy) < SWIPE_THRESHOLD) return;
    fired = true;
    if (Math.abs(dx) > Math.abs(dy)) {
      handlers.onIntent(dx > 0 ? 'right' : 'left');
    } else if (dy > 0) {
      slideHeld = true;
      handlers.onIntent('slideStart');
    } else {
      handlers.onIntent('jump');
    }
  };

  const onTouchEnd = (event: TouchEvent): void => {
    if (touchId === null) return;
    const touch = event.changedTouches[0];
    if (touch && touch.identifier !== touchId) return;
    touchId = null;
    const wasSwipe = fired;
    fired = false;
    if (slideHeld) {
      slideHeld = false;
      handlers.onIntent('slideEnd');
      return;
    }
    // 轻点（没触发滑动手势）：手机端跳过演出要用到
    if (!wasSwipe) handlers.onIntent('tap');
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  target.addEventListener('touchstart', onTouchStart, { passive: true });
  target.addEventListener('touchmove', onTouchMove, { passive: false });
  target.addEventListener('touchend', onTouchEnd);
  // 触摸被系统取消不算轻点（避免误跳过演出）
  target.addEventListener('touchcancel', () => {
    touchId = null;
    fired = false;
    slideHeld = false;
  });

  return {
    dispose(): void {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      target.removeEventListener('touchstart', onTouchStart);
      target.removeEventListener('touchmove', onTouchMove);
      target.removeEventListener('touchend', onTouchEnd);
      target.removeEventListener('touchcancel', onTouchEnd);
    },
  };
}


