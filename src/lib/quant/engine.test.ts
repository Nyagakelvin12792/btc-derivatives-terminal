import { describe, it, expect } from 'vitest';
import { calculateGreeks, calculateNetGEX, normalCDF, normalPDF } from './engine';

describe('Black-Scholes & Second-Order Greek Engine', () => {
    const spot = 68000;
    const strike = 70000;
    const tte = 30 / 365; // 30 days to expiry
    const iv = 0.55;      // 55% IV
    const rate = 0.04;    // 4% risk-free rate

    it('calculates accurate first-order greeks (Delta, Gamma)', () => {
        const greeks = calculateGreeks(spot, strike, tte, iv, rate, 'call');
        expect(greeks.delta).toBeGreaterThan(0.3);
        expect(greeks.delta).toBeLessThan(0.7);
        expect(greeks.gamma).toBeGreaterThan(0);
    });

    it('calculates second-order greeks (Vanna, Charm)', () => {
        const greeks = calculateGreeks(spot, strike, tte, iv, rate, 'call');
        expect(greeks.vanna).toBeDefined();
        expect(greeks.charm).toBeDefined();
    });

    it('computes Net GEX dollar exposure correctly', () => {
        const greeks = calculateGreeks(spot, strike, tte, iv, rate, 'call');
        const openInterest = 1500; // 1,500 BTC contracts
        const gex = calculateNetGEX(greeks.gamma, openInterest, spot, 'call');
        expect(gex).toBeGreaterThan(0);
    });

    it('keeps put GEX signed negative under the dealer exposure convention', () => {
        const greeks = calculateGreeks(spot, strike, tte, iv, rate, 'put');
        const gex = calculateNetGEX(greeks.gamma, 1500, spot, 'put');
        expect(gex).toBeLessThan(0);
    });

    it('returns zeroed greeks and exposure for invalid numeric inputs', () => {
        expect(calculateGreeks(Number.NaN, strike, tte, iv, rate, 'call')).toEqual({
            delta: 0,
            gamma: 0,
            vanna: 0,
            charm: 0,
        });
        expect(calculateNetGEX(Number.NaN, 1500, spot, 'call')).toBe(0);
        expect(calculateNetGEX(0.001, -1, spot, 'call')).toBe(0);
    });

    it('normal distribution helpers produce stable canonical values', () => {
        expect(normalPDF(0)).toBeCloseTo(0.398942, 5);
        expect(normalCDF(0)).toBeCloseTo(0.5, 5);
        expect(normalCDF(1)).toBeCloseTo(0.841345, 5);
    });
});
