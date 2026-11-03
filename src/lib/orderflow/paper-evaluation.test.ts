import { describe, expect, it } from 'vitest';
import {
    evaluatePaperOutcome,
    runPaperEvaluationBatch,
    PaperEvaluationReportV1Schema,
    type PriceBar,
} from './paper-evaluation';
import { evaluateSetupAssessment } from './setup-engine';
import { createCaptureCoverageV1 } from './provenance';

describe('paper-evaluation suite (UX16.8)', () => {
    const baseTime = 1700000000000;

    const coverage = createCaptureCoverageV1({
        dataMode: 'LIVE',
        source: 'BINANCE_SPOT',
        venue: 'BINANCE_SPOT',
        symbol: 'BTCUSDT',
        capturedAt: baseTime + 100,
        eventTime: baseTime,
        coverageStart: baseTime - 300000,
        coverageEnd: baseTime,
        sequenceState: 'LIVE',
        gapCount: 0,
        precision: 'TRADE',
        approximation: 'NONE',
    });

    const zoneLong = {
        id: 'zone-val-01',
        schemaVersion: 1 as const,
        name: 'Daily VAL Support',
        priceLow: 64800,
        priceHigh: 65200,
        midPrice: 65000,
        toleranceUsd: 50,
        strengthScore: 85,
        contributors: ['Volume Profile Session'],
        kind: 'VALUE_AREA_LOW' as const,
        sources: ['VOLUME_PROFILE_COMPUTED'],
        significance: 0.85,
        touchCount: 2,
        isApproximate: false,
        asOf: baseTime,
    };

    const confirmingLongAssessment = evaluateSetupAssessment({
        asOf: baseTime,
        spotPrice: 65150,
        zones: [zoneLong],
        evidence: [
            {
                id: 'ev-abs-long-01',
                schemaVersion: 1 as const,
                kind: 'BULLISH_ABSORPTION',
                direction: 'BULLISH',
                startTime: baseTime - 15000,
                endTime: baseTime - 5000,
                priceLow: 64950,
                priceHigh: 65050,
                strengthPercentile: 88,
                confidence: 'HIGH',
                reasonCodes: ['PASSIVE_BID_ABSORPTION'],
                sourceRefs: ['tape-window-1'],
                quality: coverage,
                invalidatedAt: null,
            },
            {
                id: 'ev-imb-long-01',
                schemaVersion: 1 as const,
                kind: 'STACKED_BUY_IMBALANCE',
                direction: 'BULLISH',
                startTime: baseTime - 5000,
                endTime: baseTime,
                priceLow: 65000,
                priceHigh: 65120,
                strengthPercentile: 82,
                confidence: 'HIGH',
                reasonCodes: ['STACKED_BUY_IMBALANCE'],
                sourceRefs: ['tape-window-1'],
                quality: coverage,
                invalidatedAt: null,
            },
        ],
        coverage,
    });

    it('classifies TARGET_REACHED when price triggers and reaches 2R target before stop or horizon', () => {
        // Trigger price is zone High + 10 (65210)
        // Invalidation floor buffer is 60 -> Invalidation price is 64740
        // Risk distance = 470
        // Target = 65210 + (470 * 2) = 66150
        const futureBars: PriceBar[] = [
            { timestamp: baseTime + 60000, open: 65150, high: 65250, low: 65100, close: 65240 }, // triggers at 65210
            { timestamp: baseTime + 120000, open: 65240, high: 65600, low: 65180, close: 65550 },
            { timestamp: baseTime + 180000, open: 65550, high: 66200, low: 65500, close: 66180 }, // hits target
        ];

        const outcome = evaluatePaperOutcome(confirmingLongAssessment, futureBars, '15m');
        expect(outcome.triggered).toBe(true);
        expect(outcome.outcome).toBe('TARGET_REACHED');
        expect(outcome.mfeRMultiple).toBeGreaterThanOrEqual(2.0);
        expect(outcome.hindsightMutationVerified).toBe(true);
    });

    it('classifies STOPPED_OUT when price triggers but touches invalidation price before target', () => {
        const futureBars: PriceBar[] = [
            { timestamp: baseTime + 60000, open: 65150, high: 65250, low: 65100, close: 65220 }, // triggers at 65210
            { timestamp: baseTime + 120000, open: 65220, high: 65300, low: 64700, close: 64750 }, // dumps below stop
        ];

        const outcome = evaluatePaperOutcome(confirmingLongAssessment, futureBars, '15m');
        expect(outcome.triggered).toBe(true);
        expect(outcome.outcome).toBe('STOPPED_OUT');
        expect(outcome.maeRMultiple).toBeGreaterThanOrEqual(1.0);
    });

    it('classifies INVALIDATED_BEFORE_TRIGGER when price breaches invalidation without triggering entry', () => {
        const futureBars: PriceBar[] = [
            { timestamp: baseTime + 60000, open: 65150, high: 65180, low: 64700, close: 64720 }, // crashes below stop without triggering 65210
        ];

        const outcome = evaluatePaperOutcome(confirmingLongAssessment, futureBars, '15m');
        expect(outcome.triggered).toBe(false);
        expect(outcome.outcome).toBe('INVALIDATED_BEFORE_TRIGGER');
    });

    it('classifies ABSTAINED when setup is in non-actionable state (NO_SETUP / WATCH)', () => {
        const watchAssessment = evaluateSetupAssessment({
            asOf: baseTime,
            spotPrice: 65100,
            zones: [zoneLong],
            evidence: [],
            coverage,
        });

        const outcome = evaluatePaperOutcome(watchAssessment, [], '15m');
        expect(outcome.triggered).toBe(false);
        expect(outcome.outcome).toBe('ABSTAINED');
    });

    it('runs paper evaluation batch and computes accurate summary statistics and hindsight integrity', () => {
        const winningBars: PriceBar[] = [
            { timestamp: baseTime + 60000, open: 65150, high: 65250, low: 65100, close: 65240 },
            { timestamp: baseTime + 180000, open: 65550, high: 66200, low: 65500, close: 66180 },
        ];
        const losingBars: PriceBar[] = [
            { timestamp: baseTime + 60000, open: 65150, high: 65250, low: 65100, close: 65220 },
            { timestamp: baseTime + 120000, open: 65220, high: 65300, low: 64700, close: 64750 },
        ];

        const batch = runPaperEvaluationBatch([
            { assessment: confirmingLongAssessment, bars: winningBars },
            { assessment: confirmingLongAssessment, bars: losingBars },
        ]);

        const parsed = PaperEvaluationReportV1Schema.parse(batch);
        expect(parsed.totalSetupsEvaluated).toBe(2);
        expect(parsed.aggregateMetrics.winRatePct).toBe(50.0);
        expect(parsed.aggregateMetrics.targetReachedPct).toBe(50.0);
        expect(parsed.aggregateMetrics.stoppedOutPct).toBe(50.0);
        expect(parsed.aggregateMetrics.hindsightIntegrityPassed).toBe(true);
        expect(parsed.calibrationStatus).toBe('CALIBRATED');
    });
});
