import { describe, expect, it } from 'vitest';
import { selectVolumeProfileInterval } from './volume-profile';

describe('TradingView-style volume-profile interval selection', () => {
    it.each([
        [300, '1s'],
        [120 * 60, '1m'],
        [120 * 3_600, '5m'],
        [240 * 3_600, '5m'],
        [120 * 14_400, '15m'],
        [120 * 86_400, '1h'],
    ] as const)('selects the finest interval below the 5000-bar ceiling for %s seconds', (span, expected) => {
        expect(selectVolumeProfileInterval(span)).toBe(expected);
    });
});
