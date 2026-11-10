import { bench, describe } from 'vitest';
import { AggregateTradeTape } from './aggregate-trade-tape';
import { buildFootprintWorkspace } from './footprint-workspace';
import { deriveTrueFlowSnapshotV1 } from './true-flow';

const firstTime = Date.UTC(2026, 9, 1);
const count = 30_000;
const lastTime = firstTime + count * 30_000;
const tape = new AggregateTradeTape();
for (let index = 0; index < count; index++) {
    const time = firstTime + index * 30_000;
    tape.ingest({
        e: 'aggTrade', E: time, T: time, s: 'BTCUSDT', a: index, f: index, l: index,
        p: String(76_000 + index % 751 * 5), q: '0.001', m: index % 3 === 0,
    }, time);
}
const capture = tape.snapshot(lastTime);

for (const interval of ['1h', '4h'] as const) {
    describe(`UX21 ${interval} · 30,000 fixture aggregate trades`, () => {
        const options = { interval, priceBucket: 10 } as const;
        const snapshot = deriveTrueFlowSnapshotV1(capture, options);
        bench('raw capture to true-flow snapshot', () => { deriveTrueFlowSnapshotV1(capture, options); });
        let step = 50;
        bench('regroup all candles after a display step change', () => {
            step = step === 50 ? 60 : 50;
            buildFootprintWorkspace(snapshot, step, lastTime);
        });
        bench('project unchanged grouped candles', () => { buildFootprintWorkspace(snapshot, 50, lastTime); });
    });
}
