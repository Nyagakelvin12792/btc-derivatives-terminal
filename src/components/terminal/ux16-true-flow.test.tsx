import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
    ClassifiedTradeV1Schema,
    ORDERFLOW_SCHEMA_VERSION,
    TradeCaptureBoundaryV1Schema,
    type ClassifiedTradeV1,
} from '../../lib/orderflow/contracts';
import { createCaptureCoverageV1 } from '../../lib/orderflow/provenance';
import { deriveTrueFlowSnapshotV1 } from '../../lib/orderflow/true-flow';
import TrueFlowProvenanceBanner, { qualityColor, sequenceStateColor } from './TrueFlowProvenanceBanner';
import TrueCvdPane from './TrueCvdPane';
import FootprintChartOverlay from './FootprintChartOverlay';
import CapturedVolumeProfileOverlay from './CapturedVolumeProfileOverlay';
import CandleFootprintCanvasOverlay, {
    projectFootprintBarsToChart,
    projectTradeVolumeProfileToChart,
} from './CandleFootprintCanvasOverlay';
import LeftFootprintExecutionPane from './LeftFootprintExecutionPane';
import { buildFootprintWorkspace } from '../../lib/orderflow/footprint-workspace';
import { calculateTradingSessions } from '../../lib/orderflow/trading-sessions';
import TradingSessionsOverlay from './TradingSessionsOverlay';
import TerminalChartLoader from './TerminalChartLoader';
import { createDemoMarketBars } from '../../lib/ui/market-fixtures';
import FlowMode from './FlowMode';
import { useTerminalStore } from '../../lib/dashboard/store';

const BASE_TIME = Date.UTC(2026, 9, 30, 12, 0, 0);

function trade(
    aggregateTradeId: number,
    seconds: number,
    price: number,
    quantityBtc: number,
    aggressor: 'BUY' | 'SELL',
): ClassifiedTradeV1 {
    return ClassifiedTradeV1Schema.parse({
        schemaVersion: ORDERFLOW_SCHEMA_VERSION,
        venue: 'BINANCE_SPOT',
        symbol: 'BTCUSDT',
        aggregateTradeId,
        firstTradeId: aggregateTradeId,
        lastTradeId: aggregateTradeId,
        eventTime: BASE_TIME + seconds * 1_000,
        tradeTime: BASE_TIME + seconds * 1_000,
        price,
        quantityBtc,
        notionalUsd: price * quantityBtc,
        aggressor,
        buyerIsMaker: aggressor === 'SELL',
    });
}

function createTestSnapshot(gapped = false) {
    const trades = gapped
        ? [
            trade(101, 5, 100, 1, 'BUY'),
            trade(102, 15, 101, 1, 'SELL'),
            trade(103, 30, 100, 1, 'BUY'),
            trade(105, 70, 102, 2, 'SELL'),
        ]
        : [
            trade(101, 5, 100, 1, 'BUY'),
            trade(102, 15, 101, 2, 'SELL'),
            trade(103, 65, 100, 3, 'BUY'),
        ];

    const first = trades[0];
    const last = trades.at(-1)!;
    const boundaries = [
        TradeCaptureBoundaryV1Schema.parse({
            schemaVersion: ORDERFLOW_SCHEMA_VERSION,
            boundaryId: 'capture-start',
            reason: 'CAPTURE_START',
            occurredAt: BASE_TIME,
            previousAggregateTradeId: null,
            nextAggregateTradeId: first.aggregateTradeId,
            missingAggregateTradeCount: null,
        }),
    ];

    if (gapped) {
        boundaries.push(
            TradeCaptureBoundaryV1Schema.parse({
                schemaVersion: ORDERFLOW_SCHEMA_VERSION,
                boundaryId: 'gap-103-105',
                reason: 'AGGREGATE_ID_GAP',
                occurredAt: BASE_TIME + 68_000,
                previousAggregateTradeId: 103,
                nextAggregateTradeId: 105,
                missingAggregateTradeCount: 1,
            }),
        );
    }

    const capturedAt = last.eventTime + 50;
    const capture = {
        schemaVersion: ORDERFLOW_SCHEMA_VERSION,
        trades,
        boundaries,
        coverage: createCaptureCoverageV1({
            dataMode: 'REPLAY',
            source: 'UX16_FIXTURE',
            venue: 'BINANCE_SPOT',
            symbol: 'BTCUSDT',
            capturedAt,
            eventTime: last.eventTime,
            coverageStart: first.tradeTime,
            coverageEnd: last.tradeTime,
            sequenceState: gapped ? 'GAP' : 'LIVE',
            gapCount: gapped ? 1 : 0,
            precision: 'TRADE',
            approximation: 'NONE',
        }),
        stats: {
            acceptedCount: trades.length,
            duplicateCount: 0,
            outOfOrderCount: 0,
            invalidCount: 0,
            reconnectCount: 0,
        },
        lastAggregateTradeId: last.aggregateTradeId,
    };

    return deriveTrueFlowSnapshotV1(capture, { interval: '1m', priceBucket: 1 });
}

describe('UX16.2 Child A: True-Flow Presentation Components', () => {
    describe('TrueFlowProvenanceBanner', () => {
        it('renders full provenance details accurately', () => {
            const snapshot = createTestSnapshot(false);
            const html = renderToStaticMarkup(<TrueFlowProvenanceBanner coverage={snapshot.coverage} />);

            expect(html).toContain('data-testid="true-flow-provenance-banner"');
            expect(html).toContain('BINANCE_SPOT');
            expect(html).toContain('HIGH QUALITY');
            expect(html).toContain('NONE'); // Approximation
            expect(html).toContain('GAPS DETECTED:');
        });

        it('renders compact provenance banner with gap counts when gapped', () => {
            const snapshot = createTestSnapshot(true);
            const html = renderToStaticMarkup(<TrueFlowProvenanceBanner coverage={snapshot.coverage} compact />);

            expect(html).toContain('data-testid="true-flow-provenance-compact"');
            expect(html).toContain('1 GAP');
            expect(html).toContain('LOW');
        });

        it('returns appropriate theme tokens for quality and sequence states', () => {
            expect(qualityColor('HIGH')).toContain('text-[#2CC7A0]');
            expect(qualityColor('MEDIUM')).toContain('text-[#E5A83B]');
            expect(qualityColor('LOW')).toContain('text-[#F06152]');
            expect(qualityColor('UNAVAILABLE')).toContain('text-[#8E98A6]');

            expect(sequenceStateColor('LIVE')).toBe('text-[#2CC7A0]');
            expect(sequenceStateColor('GAP')).toBe('text-[#F06152]');
            expect(sequenceStateColor('STALE')).toBe('text-[#E5A83B]');
            expect(sequenceStateColor('OFFLINE')).toBe('text-[#8E98A6]');
        });
    });

    describe('TrueCvdPane', () => {
        it('renders empty state when snapshot is null', () => {
            const html = renderToStaticMarkup(<TrueCvdPane snapshot={null} />);
            expect(html).toContain('data-testid="true-cvd-pane-empty"');
            expect(html).toContain('NO CAPTURED SEGMENTS');
        });

        it('renders uninterrupted CVD segment and step plot without cross-segment continuity', () => {
            const snapshot = createTestSnapshot(false);
            const html = renderToStaticMarkup(<TrueCvdPane snapshot={snapshot} />);

            expect(html).toContain('data-testid="true-cvd-pane"');
            expect(html).toContain('+$198');
            expect(html).toContain('data-testid="cvd-segment-tab-segment-1"');
            expect(html).toContain('CAPTURE START');
            expect(html).toContain('data-testid="segment-step-plot-segment-1"');
        });

        it('renders gapped segments with explicit GAP boundary tag and unjoined segments', () => {
            const snapshot = createTestSnapshot(true);
            const html = renderToStaticMarkup(<TrueCvdPane snapshot={snapshot} />);

            expect(html).toContain('data-testid="cvd-segment-tab-segment-1"');
            expect(html).toContain('data-testid="cvd-segment-tab-segment-2"');
            expect(html).toContain('GAP');
            // Verify segments in snapshot remain partitioned
            expect(snapshot.cvdSegments).toHaveLength(2);
            expect(snapshot.cvdSegments[0].segmentId).toBe('segment-1');
            expect(snapshot.cvdSegments[1].segmentId).toBe('segment-2');
            expect(snapshot.cvdSegments[1].startReasons).toContain('AGGREGATE_ID_GAP');
        });
    });

    describe('FootprintChartOverlay', () => {
        it('renders empty state when no footprint bars exist', () => {
            const html = renderToStaticMarkup(<FootprintChartOverlay bars={[]} />);
            expect(html).toContain('data-testid="footprint-overlay-empty"');
            expect(html).toContain('NO CAPTURED TRADE CELLS');
        });

        it('renders footprint bars with canonical POC and absent imbalance styling', () => {
            const snapshot = createTestSnapshot(false);
            const html = renderToStaticMarkup(<FootprintChartOverlay bars={snapshot.footprintBars} zoomLevel="DETAILED" />);

            expect(html).toContain('data-testid="footprint-chart-overlay"');
            expect(html).toContain('POC');

            // Imbalance styling is absent: No element should declare imbalance flags
            for (const bar of snapshot.footprintBars) {
                for (const cell of bar.footprint.cells) {
                    expect(cell.buyImbalance).toBe(false);
                    expect(cell.sellImbalance).toBe(false);
                    expect(cell.imbalanceRatio).toBeNull();
                }
            }
        });

        it('semantic zoom hides numeric volume labels before geometry in COMPACT mode', () => {
            const snapshot = createTestSnapshot(false);
            const detailedHtml = renderToStaticMarkup(
                <FootprintChartOverlay bars={snapshot.footprintBars} zoomLevel="DETAILED" />,
            );
            const compactHtml = renderToStaticMarkup(
                <FootprintChartOverlay bars={snapshot.footprintBars} zoomLevel="COMPACT" />,
            );

            // In DETAILED mode, numeric labels exist (e.g. 1.00, 2.00)
            expect(detailedHtml).toContain('GEOMETRY + NUMBERS');
            expect(detailedHtml).toContain('1.00');

            // In COMPACT mode, volume numbers are hidden while cell geometry and price remain visible
            expect(compactHtml).toContain('GEOMETRY ONLY (LABELS HIDDEN)');
            expect(compactHtml).not.toContain('1.00');
            expect(compactHtml).toContain('data-testid="footprint-cell-101"');
        });
    });

    describe('CapturedVolumeProfileOverlay', () => {
        it('renders empty state when profile rows are empty', () => {
            const html = renderToStaticMarkup(<CapturedVolumeProfileOverlay profile={null} />);
            expect(html).toContain('data-testid="captured-profile-empty"');
        });

        it('renders CAPTURED_EXACT badge and canonical POC/VA levels', () => {
            const snapshot = createTestSnapshot(false);
            const html = renderToStaticMarkup(<CapturedVolumeProfileOverlay profile={snapshot.tradeVolumeProfile} />);

            expect(html).toContain('data-testid="captured-volume-profile-overlay"');
            expect(html).toContain('CAPTURED EXACT');
            expect(html).toContain('data-testid="profile-poc-tag"');
            expect(html).toContain('data-testid="profile-vah-tag"');
            expect(html).toContain('data-testid="profile-val-tag"');
        });

        it('renders CAPTURED_WITH_GAPS badge when gaps exist', () => {
            const snapshot = createTestSnapshot(true);
            const html = renderToStaticMarkup(<CapturedVolumeProfileOverlay profile={snapshot.tradeVolumeProfile} />);

            expect(html).toContain('CAPTURED WITH GAPS (1 missing-range break)');
        });
    });

    describe('FlowMode Wiring with True Flow Snapshot', () => {
        it('displays TRADE_BASED status when snapshot is provided', () => {
            const snapshot = createTestSnapshot(false);
            const html = renderToStaticMarkup(
                <FlowMode
                    liquidityStatus="LIVE"
                    retainedFrames={100}
                    footprintStatus="NOT_CONNECTED"
                    cvdStatus="UNAVAILABLE"
                    currentCvdUsd={null}
                    events={[]}
                    dataMode="LIVE"
                    trueFlowSnapshot={snapshot}
                    tradeTape={{ trades: [trade(101, 5, 100, 1, 'BUY')], coverage: snapshot.coverage }}
                />,
            );

            expect(html).toContain('data-testid="flow-cvd-status"');
            expect(html).toContain('TRADE_BASED');
            expect(html).not.toContain('data-testid="flow-footprint-status"');
            expect(html).toContain('data-testid="flow-trade-tape"');
            expect(html).toContain('BUY');
            expect(html).toContain('data-testid="flow-trade-vp-container"');
        });
    });

    describe('CandleFootprintCanvasOverlay (ATAS/NinjaTrader On-Candle Projection)', () => {
        it('projects footprint bars and trade volume profile onto chart coordinates and renders HUD controls', () => {
            const snapshot = createTestSnapshot(false);
            const firstOpenTimeSeconds = Math.floor(snapshot.footprintBars[0].footprint.openTime / 1_000);
            const projectedBars = projectFootprintBarsToChart(snapshot.footprintBars, {
                width: 1200,
                height: 600,
                timeframeSeconds: 60,
                timeToX: (t) => 300 + (t - firstOpenTimeSeconds) * 2,
                priceToY: (p) => 500 - (p - 98) * 30,
            });
            const projectedVp = projectTradeVolumeProfileToChart(
                snapshot.tradeVolumeProfile,
                (p) => 500 - (p - 98) * 30,
                600,
            );

            expect(projectedBars.length).toBeGreaterThan(0);
            expect(projectedBars[0].cells.length).toBeGreaterThan(0);
            expect(projectedVp).not.toBeNull();
            expect(projectedVp!.rows.length).toBeGreaterThan(0);

            const html = renderToStaticMarkup(
                <CandleFootprintCanvasOverlay
                    projectedBars={projectedBars}
                    projectedTradeVp={projectedVp}
                    showFootprint
                    showTradeVp
                    width={1200}
                    height={600}
                    zoomMode="DETAILED"
                    onCycleZoomMode={() => undefined}
                    tradeVpPlacement="LEFT"
                    onToggleTradeVpPlacement={() => undefined}
                    overlayOpacity={80}
                    onOverlayOpacityChange={() => undefined}
                />,
            );

            expect(html).toContain('data-testid="candle-footprint-canvas-overlay"');
            expect(html).toContain('data-footprint-bars=');
            expect(html).toContain('data-trade-vp-rows=');
            expect(html).toContain('data-trade-vp-placement="LEFT"');
            expect(html).toContain('data-overlay-opacity="80"');
            expect(html).toContain('data-testid="cycle-onchart-footprint-zoom"');
            expect(html).toContain('data-testid="toggle-trade-vp-placement"');
            expect(html).toContain('data-testid="onchart-footprint-opacity-slider"');
        });
    });

    describe('Independent Footprint workspace', () => {
        it('exposes the compact controls and leaves demo OHLC unclassified', () => {
            const html = renderToStaticMarkup(<LeftFootprintExecutionPane
                bars={createDemoMarketBars(77900, 24, 60)}
                timeframeSeconds={60}
                dataMode="DEMO"
                trueFlowSnapshot={createTestSnapshot()}
            />);
            expect(html).toContain('data-testid="left-footprint-execution-pane"');
            expect(html).toContain('data-testid="exec-mode"');
            expect(html).toContain('data-testid="exec-timeframe"');
            expect(html).toContain('data-testid="exec-zoom-in"');
            expect(html).toContain('data-testid="exec-zoom-out"');
            expect(html).toContain('aria-pressed="false"');
            expect(html).toContain('data-trade-candles="0"');
            expect(html).toContain('data-stats-rows="10"');
            expect(html).toContain('No captured trades');
        });

        it('conserves actual aggressor volumes and never generates rows from OHLC', () => {
            const snapshot = createTestSnapshot();
            const candles = buildFootprintWorkspace(snapshot, 10, BASE_TIME + 70_000);
            expect(candles).toHaveLength(2);
            expect(candles[0].askVolumeBtc).toBe(1);
            expect(candles[0].bidVolumeBtc).toBe(2);
            expect(candles[0].deltaBtc).toBe(-1);
            expect(candles[1].developing).toBe(true);
            expect(buildFootprintWorkspace(null, 10, BASE_TIME + 70_000)).toEqual([]);
        });

        it('hides statistics in the chart-only split', () => {
            const html = renderToStaticMarkup(<LeftFootprintExecutionPane
                bars={createDemoMarketBars(77900, 20, 60)}
                timeframeSeconds={60}
                showStudies={false}
            />);
            expect(html).toContain('data-stats-rows="0"');
        });
    });

    describe('TradingSessionsOverlay & Trading Sessions Calculation', () => {
        it('calculates AS, LON, and NY session boxes cleanly bounded to session end', () => {
            const demoBars = createDemoMarketBars(77900, 288, 300); // 24 hours of 5m bars
            const sessions = calculateTradingSessions(demoBars);

            expect(sessions.length).toBeGreaterThan(0);
            expect(sessions.some((s) => s.session === 'ASIA')).toBe(true);
            expect(sessions.some((s) => s.session === 'LONDON')).toBe(true);
            expect(sessions.some((s) => s.session === 'NEW_YORK')).toBe(true);

            const asia = sessions.find((s) => s.session === 'ASIA')!;
            expect(asia.label).toBe('AS');
            expect(asia.high).toBeGreaterThanOrEqual(asia.low);
            expect(asia.range).toBe(asia.high - asia.low);

            const london = sessions.find((s) => s.session === 'LONDON')!;
            expect(london.label).toBe('LON');

            const ny = sessions.find((s) => s.session === 'NEW_YORK')!;
            expect(ny.label).toBe('NY');

            const html = renderToStaticMarkup(
                <TradingSessionsOverlay
                    sessions={sessions}
                    timeToX={() => 100}
                    priceToY={() => 200}
                    width={800}
                    height={460}
                />
            );

            expect(html).toContain('data-testid="trading-sessions-overlay"');
        });
    });

    describe('TerminalChartLoader (Creative Sleek Loading Animation)', () => {
        it('renders sleek cyberpunk radar reticle, BTC monogram, and telemetry ticker', () => {
            const html = renderToStaticMarkup(
                <TerminalChartLoader
                    feedState="LIVE"
                    isOffline={false}
                />
            );

            expect(html).toContain('data-testid="terminal-chart-loader"');
            expect(html).toContain('₿');
            expect(html).toContain('CALIBRATING BTC TERMINAL WORKSPACE');
            expect(html).toContain('LIVE');
        });
    });

    describe('Multi-Approach Volume Profile (Daily, Weekly, Prev Session, Free Hold)', () => {
        it('persists and updates vpApproachMode across modes', () => {
            const store = useTerminalStore.getState();
            expect(store.vpApproachMode).toBeDefined();

            store.setVpApproachMode('DAILY');
            expect(useTerminalStore.getState().vpApproachMode).toBe('DAILY');

            store.setVpApproachMode('WEEKLY');
            expect(useTerminalStore.getState().vpApproachMode).toBe('WEEKLY');

            store.setVpApproachMode('PREV_SESSION');
            expect(useTerminalStore.getState().vpApproachMode).toBe('PREV_SESSION');

            store.setVpApproachMode('FREE_HOLD');
            expect(useTerminalStore.getState().vpApproachMode).toBe('FREE_HOLD');
        });

        it('computes daily and weekly bar boundaries accurately from unix timestamps', () => {
            const demoBars = createDemoMarketBars(78000, 400, 900); // 15m bars
            expect(demoBars.length).toBe(400);

            const lastBarSec = Number(demoBars[demoBars.length - 1].time);
            const startOfDaySec = Math.floor(lastBarSec / 86400) * 86400;

            const d = new Date(lastBarSec * 1000);
            const dayOfWeek = (d.getUTCDay() + 6) % 7;
            const startOfWeekSec = Math.floor((lastBarSec - dayOfWeek * 86400) / 86400) * 86400;

            expect(startOfDaySec).toBeGreaterThan(0);
            expect(startOfWeekSec).toBeLessThanOrEqual(startOfDaySec);

            // Daily bar slice should never span 1,000 bars
            const dailyBars = demoBars.filter((b) => Number(b.time) >= startOfDaySec);
            expect(dailyBars.length).toBeLessThanOrEqual(96);
        });
    });
});
