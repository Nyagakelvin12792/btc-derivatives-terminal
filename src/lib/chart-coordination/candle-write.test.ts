import { expect, it } from 'vitest';
import { classifyCandleWrite } from './candle-write';

it('updates the last candle and true append while replacing corrections, sliding windows and context changes', () => {
    const a = { time: 1, open: 5, high: 6, low: 4, close: 5 };
    const b = { ...a, time: 2 };
    const c = { ...a, time: 3 };
    expect(classifyCandleWrite([a, b], [a, { ...b, close: 6 }], false)).toBe('LAST');
    expect(classifyCandleWrite([a, b], [a, b, c], false)).toBe('LAST');
    expect(classifyCandleWrite([a, b], [b, c], false)).toBe('REPLACE');
    expect(classifyCandleWrite([a, b], [{ ...a, close: 4 }, b], false)).toBe('REPLACE');
    expect(classifyCandleWrite([a, b], [a, b], true)).toBe('REPLACE');
    expect(classifyCandleWrite([a, b], [a, b], false)).toBe('NONE');
});
