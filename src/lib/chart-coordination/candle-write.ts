type Candle = { time: unknown; open: number; high: number; low: number; close: number };

export function classifyCandleWrite(previous: readonly Candle[], next: readonly Candle[], contextChanged: boolean): 'REPLACE' | 'LAST' | 'NONE' {
    if (contextChanged || !previous.length || next.length < previous.length || next.length > previous.length + 1) return 'REPLACE';
    const compared = next.length === previous.length ? previous.length - 1 : previous.length;
    const equal = (a: Candle, b: Candle) =>
        a === b || (a.time === b.time && a.open === b.open && a.high === b.high && a.low === b.low && a.close === b.close);
    for (let i = 0; i < compared; i++) {
        if (!equal(previous[i], next[i])) return 'REPLACE';
    }
    const last = next.at(-1)!;
    const oldLast = previous.at(-1)!;
    if (next.length > previous.length) return Number(last.time) > Number(oldLast.time) ? 'LAST' : 'REPLACE';
    if (last.time !== oldLast.time) return 'REPLACE';
    return equal(oldLast, last) ? 'NONE' : 'LAST';
}
