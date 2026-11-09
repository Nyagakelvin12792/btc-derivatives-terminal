import { describe, expect, it } from 'vitest';
import {
    evaluateJevDecision,
    evaluateJevDecisionFromPartial,
    type DeterministicMarketState,
} from './jev-framework';

describe('Jev Decision Framework (UX19.6)', () => {
    const baseMarket: DeterministicMarketState = {
        currentPrice: 78500,
        vwapPrice: 78200,
        vpPoc: 78100,
        vpVah: 78900,
        vpVal: 77500,
        netDelta: 1250,
        cvdSlope: 'RISING',
        gammaRegime: 'SHORT_GAMMA_EXPANSION',
        callWall: 82000,
        putWall: 76000,
        dataQualityOk: true,
        spreadBps: 1.2,
    };

    it('returns abstain when operational mode is DISABLED', () => {
        const res = evaluateJevDecision(baseMarket, 'DISABLED');
        expect(res.mode).toBe('DISABLED');
        expect(res.stance).toBe('ABSTAIN');
        expect(res.gatePassed).toBe(false);
    });

    it('trips data quality gate when spread is excessive or feed stale', () => {
        const degradedMarket: DeterministicMarketState = {
            ...baseMarket,
            spreadBps: 25.0, // spread gate > 15
        };
        const res = evaluateJevDecision(degradedMarket, 'ADVISORY');
        expect(res.stance).toBe('ABSTAIN');
        expect(res.gatePassed).toBe(false);
        expect(res.advisorySummary).toContain('Data quality gate tripped');
    });

    it('classifies bullish trending expansion setup with strong confluences', () => {
        const res = evaluateJevDecision(baseMarket, 'ADVISORY');
        expect(res.bias).toBe('BULLISH');
        expect(res.regime).toBe('TRENDING_UP');
        expect(res.confluenceCount).toBeGreaterThanOrEqual(3);
        expect(res.stance).toBe('AGREE');
        expect(res.invalidationPrice).toBeLessThan(baseMarket.currentPrice);
        expect(res.targetPrice).toBe(baseMarket.callWall);
        expect(res.tradeScenario.setupName).toContain('Long');
    });

    it('identifies cautionary signs when approaching overhead call wall', () => {
        const nearWallMarket: DeterministicMarketState = {
            ...baseMarket,
            currentPrice: 81800, // within 0.25% of 82,000 call wall
        };
        const res = evaluateJevDecision(nearWallMarket, 'ADVISORY');
        expect(res.tradeScenario.cautions.length).toBeGreaterThan(0);
        expect(res.tradeScenario.cautions[0]).toContain('Call Wall');
        expect(res.stance).toBe('CAUTION');
    });

    it('abstains when required market-state inputs are missing instead of inventing fallback values (UX20.2-JEV-01)', () => {
        const partial = {
            currentPrice: 78500,
            vwapPrice: undefined,
            vpPoc: undefined,
            vpVah: 78900,
            vpVal: 77500,
            netDelta: undefined,
            cvdSlope: 'RISING' as const,
            gammaRegime: 'SHORT_GAMMA_EXPANSION' as const,
            callWall: undefined,
            putWall: 76000,
            dataQualityOk: true,
            spreadBps: 1.2,
        };

        const res = evaluateJevDecisionFromPartial(partial, 'ADVISORY');
        expect(res.stance).toBe('ABSTAIN');
        expect(res.gatePassed).toBe(false);
        expect(res.advisorySummary).toContain('Abstaining: missing required market inputs');
    });
});
