import { describe, expect, it } from 'vitest';
import { filterDeribitOptionsByDte, isDeribitDteFilter } from './dte-filter';
import type { NormalizedDeribitOption } from './types';

const options = [0.5, 2, 6.9, 8, 21, 45].map((dte) => ({ dte })) as NormalizedDeribitOption[];

describe('Deribit DTE filters', () => {
    it('accepts only supported filters', () => {
        expect(isDeribitDteFilter('0-2D')).toBe(true);
        expect(isDeribitDteFilter('ALL')).toBe(true);
        expect(isDeribitDteFilter('90D')).toBe(false);
    });

    it('uses inclusive cumulative horizons', () => {
        expect(filterDeribitOptionsByDte(options, '0-2D').map((option) => option.dte)).toEqual([0.5, 2]);
        expect(filterDeribitOptionsByDte(options, '7D').map((option) => option.dte)).toEqual([0.5, 2, 6.9]);
        expect(filterDeribitOptionsByDte(options, '30D').map((option) => option.dte)).toEqual([0.5, 2, 6.9, 8, 21]);
        expect(filterDeribitOptionsByDte(options, 'ALL')).toBe(options);
    });
});
