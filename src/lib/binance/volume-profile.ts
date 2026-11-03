import type { BinanceProfileInterval } from './types';

const PROFILE_INTERVALS: Array<{ interval: BinanceProfileInterval; seconds: number }> = [
    { interval: '1m', seconds: 60 },
    { interval: '5m', seconds: 300 },
    { interval: '15m', seconds: 900 },
    { interval: '30m', seconds: 1_800 },
    { interval: '1h', seconds: 3_600 },
    { interval: '4h', seconds: 14_400 },
    { interval: '1d', seconds: 86_400 },
];

export function selectVolumeProfileInterval(spanSeconds: number): BinanceProfileInterval {
    const safeSpan = Math.max(1, spanSeconds);
    if (safeSpan <= 300) return '1s';
    return PROFILE_INTERVALS.find(({ seconds }) => Math.ceil(safeSpan / seconds) <= 5_000)?.interval ?? '1d';
}
