import { SWIPE_THRESHOLD, createInput } from '../core/input';
import type { Intent } from '../core/input';

const pad = document.getElementById('pad');
const report = document.getElementById('report');
if (!pad || !report) throw new Error('selftest 页面缺少 #pad / #report');

const intents: Intent[] = [];
const restarts: string[] = [];
let gestures = 0;
const input = createInput(pad, {
  onIntent: (intent) => intents.push(intent),
  onRestart: () => restarts.push('restart'),
  onFirstGesture: () => {
    gestures += 1;
  },
});

const lines: string[] = [];
let failed = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed += 1;
  lines.push(`${ok ? 'PASS' : 'FAIL'} ${name} | expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
}

function touch(x: number, y: number): Touch {
  return new Touch({ identifier: 1, target: pad as HTMLElement, clientX: x, clientY: y, pageX: x, pageY: y });
}

function fire(type: 'touchstart' | 'touchmove' | 'touchend', x: number, y: number): void {
  const point = touch(x, y);
  const list = type === 'touchend' ? [] : [point];
  pad!.dispatchEvent(
    new TouchEvent(type, {
      bubbles: true,
      cancelable: true,
      touches: list,
      targetTouches: list,
      changedTouches: [point],
    }),
  );
}

function swipe(dx: number, dy: number, extraMoves: Array<[number, number]> = []): Intent[] {
  intents.length = 0;
  fire('touchstart', 200, 400);
  fire('touchmove', 200 + dx, 400 + dy);
  for (const [mx, my] of extraMoves) fire('touchmove', 200 + mx, 400 + my);
  fire('touchend', 200 + dx, 400 + dy);
  return [...intents];
}

function key(code: string, repeat = false): Intent[] {
  intents.length = 0;
  window.dispatchEvent(new KeyboardEvent('keydown', { code, repeat, bubbles: true, cancelable: true }));
  return [...intents];
}

function keyUp(code: string): Intent[] {
  intents.length = 0;
  window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true, cancelable: true }));
  return [...intents];
}

// —— 触屏 ——
check('swipe left 60px -> left', swipe(-60, 0), ['left']);
check('swipe right 60px -> right', swipe(60, 0), ['right']);
check('swipe up 60px -> jump', swipe(0, -60), ['jump']);
check('swipe down 60px -> slideStart + slideEnd', swipe(0, 60), ['slideStart', 'slideEnd']);
check('diagonal prefers dominant axis', swipe(70, 40), ['right']);
check(`below threshold (${SWIPE_THRESHOLD}px) -> nothing`, swipe(-20, 15), []);
check('one gesture fires once', swipe(-60, 0, [[-140, 0], [-200, 10]]), ['left']);
fire('touchend', 0, 0);

// —— 键盘 ——
check('ArrowLeft -> left', key('ArrowLeft'), ['left']);
check('ArrowRight -> right', key('ArrowRight'), ['right']);
check('KeyA -> left', key('KeyA'), ['left']);
check('KeyD -> right', key('KeyD'), ['right']);
check('ArrowUp -> jump', key('ArrowUp'), ['jump']);
check('KeyW -> jump', key('KeyW'), ['jump']);
check('Space -> jump', key('Space'), ['jump']);
check('ArrowDown -> slideStart', key('ArrowDown'), ['slideStart']);
check('ArrowDown keyup -> slideEnd（长按判定）', keyUp('ArrowDown'), ['slideEnd']);
check('KeyS -> slideStart', key('KeyS'), ['slideStart']);
check('KeyS keyup -> slideEnd', keyUp('KeyS'), ['slideEnd']);
check('key repeat ignored', key('ArrowLeft', true), []);
check('unmapped key ignored', key('KeyQ'), []);

restarts.length = 0;
window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', bubbles: true, cancelable: true }));
check('KeyR -> restart', restarts, ['restart']);
check('first gesture 只报一次', gestures, 1);

input.dispose();
intents.length = 0;
swipe(-60, 0);
check('dispose() removes listeners', [...intents], []);

report.textContent = lines.join('\n');
for (const line of lines) console.log(line);
console.log(`INPUT SELFTEST ${failed === 0 ? 'ALL PASS' : `FAILED ${failed}`} (${lines.length} checks)`);
