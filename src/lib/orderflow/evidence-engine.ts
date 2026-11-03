import {
    CaptureCoverageV1,
    EvidenceKind,
    FootprintBarV1,
    MarketEvidenceV1,
    MarketEvidenceV1Schema,
    ORDERFLOW_SCHEMA_VERSION,
} from './contracts';
import {
    AbsorptionObservationV1,
    AbsorptionObservationV1Schema,
    AcceptanceObservationV1,
    AcceptanceObservationV1Schema,
    CvdDivergenceV1,
    CvdDivergenceV1Schema,
    DecisionZoneKind,
    DecisionZoneV1,
    DecisionZoneV1Schema,
    FlowEvidenceSnapshotV1,
    FlowEvidenceSnapshotV1Schema,
    PivotPointV1,
} from './evidence-contracts';
import {
    LiquidityPersistenceV1,
    StackedImbalanceZoneV1,
} from './microstructure-contracts';

// ============================================================================
// Types & Options
// ============================================================================

export interface RawLevelInput {
    name: string;
    kind: DecisionZoneKind;
    price: number;
    source: string;
    isApproximate?: boolean;
    weight?: number;
}

export interface BuildDecisionZonesOptions {
    spotPrice: number;
    toleranceBps?: number;
    minToleranceUsd?: number;
    asOf?: number;
    optionsLevels?: {
        callWall?: number;
        putWall?: number;
        gammaFlip?: number;
        maxPain?: number;
    };
    volumeProfile?: {
        poc?: number | null;
        vah?: number | null;
        val?: number | null;
        hvn?: number[];
        lvn?: number[];
        isApproximate?: boolean;
    };
    persistentWalls?: readonly LiquidityPersistenceV1[];
    swingLevels?: Array<{
        price: number;
        timeframe: '1h' | '4h';
        kind: 'SWING_HIGH' | 'SWING_LOW';
    }>;
    vwapLevels?: Array<{
        price: number;
        label: string;
    }>;
    userLevels?: Array<{
        price: number;
        label: string;
    }>;
    maxZones?: number;
}

export interface DetectAbsorptionOptions {
    bars: readonly FootprintBarV1[];
    decisionZones: readonly DecisionZoneV1[];
    persistentWalls?: readonly LiquidityPersistenceV1[];
    isProduction?: boolean;
    minAggressiveVolumeUsd?: number;
    minAbsorptionRatio?: number;
    maxDisplacementUsd?: number;
    asOf?: number;
}

export interface DetectAcceptanceOptions {
    bars: readonly FootprintBarV1[];
    decisionZones: readonly DecisionZoneV1[];
    absorptions?: readonly AbsorptionObservationV1[];
    minBreakoutVolumeUsd?: number;
    minDwellMs?: number;
    asOf?: number;
}

export interface DetectCvdDivergenceOptions {
    candles: readonly {
        openTime: number;
        closeTime: number;
        open: number;
        high: number;
        low: number;
        close: number;
    }[];
    cvdPoints: readonly {
        time: number;
        cvd: number;
    }[];
    decisionZones?: readonly DecisionZoneV1[];
    minDisplacementUsd?: number;
    lookbackBars?: number;
    asOf?: number;
}

export interface SynthesizeFlowEvidenceOptions {
    zones?: readonly DecisionZoneV1[];
    absorptions?: readonly AbsorptionObservationV1[];
    acceptances?: readonly AcceptanceObservationV1[];
    divergences?: readonly CvdDivergenceV1[];
    stackedImbalances?: readonly StackedImbalanceZoneV1[];
    persistentWalls?: readonly LiquidityPersistenceV1[];
    coverage: CaptureCoverageV1;
}

export interface CreateFlowEvidenceSnapshotOptions {
    asOf?: number;
    zones: readonly DecisionZoneV1[];
    absorptions: readonly AbsorptionObservationV1[];
    acceptances: readonly AcceptanceObservationV1[];
    divergences: readonly CvdDivergenceV1[];
    coverage: CaptureCoverageV1;
}

// ============================================================================
// Footprint Bar Metrics Helper
// ============================================================================

export function getFootprintBarMetrics(bar: FootprintBarV1): {
    barLow: number;
    barHigh: number;
    barClose: number;
    totalBuy: number;
    totalSell: number;
    delta: number;
    displacement: number;
} {
    let barLow = bar.pocPrice ?? 70000;
    let barHigh = bar.pocPrice ?? 70000;
    let barClose = bar.pocPrice ?? 70000;
    let totalBuy = 0;
    let totalSell = 0;

    if (bar.cells && bar.cells.length > 0) {
        barLow = bar.cells[0].priceLow;
        barHigh = bar.cells[0].priceHigh;
        for (const cell of bar.cells) {
            if (cell.priceLow < barLow) barLow = cell.priceLow;
            if (cell.priceHigh > barHigh) barHigh = cell.priceHigh;
            totalBuy += cell.buyNotionalUsd;
            totalSell += cell.sellNotionalUsd;
        }
        barClose = bar.cells[bar.cells.length - 1].priceMid;
    } else {
        totalBuy = Math.max(0, (bar.totalNotionalUsd + bar.deltaNotionalUsd) / 2);
        totalSell = Math.max(0, (bar.totalNotionalUsd - bar.deltaNotionalUsd) / 2);
    }

    const displacement = Math.max(1, barHigh - barLow);
    return {
        barLow,
        barHigh,
        barClose,
        totalBuy,
        totalSell,
        delta: bar.deltaNotionalUsd,
        displacement,
    };
}

// ============================================================================
// 1. Decision Zone Construction (Section 13)
// ============================================================================

const KIND_PRIORITY: Record<DecisionZoneKind, number> = {
    CALL_WALL: 100,
    PUT_WALL: 100,
    GAMMA_FLIP: 95,
    POINT_OF_CONTROL: 90,
    VALUE_AREA_HIGH: 80,
    VALUE_AREA_LOW: 80,
    HIGH_VOLUME_NODE: 70,
    LOW_VOLUME_NODE: 60,
    PERSISTENT_LIQUIDITY_WALL: 65,
    USER_DEFINED_LEVEL: 50,
};

/**
 * Builds evidence-ranked decision zones from structural levels.
 * Overlapping tolerance bands are deterministically merged, keeping contributors
 * and tracking approximation provenance.
 */
export function buildDecisionZones(options: BuildDecisionZonesOptions): DecisionZoneV1[] {
    const {
        spotPrice,
        toleranceBps = 0.0015, // 15 bps default (~$105 at $70,000)
        minToleranceUsd = 20,
        asOf = Date.now(),
        optionsLevels,
        volumeProfile,
        persistentWalls = [],
        swingLevels = [],
        vwapLevels = [],
        userLevels = [],
        maxZones = 12,
    } = options;

    if (spotPrice <= 0) return [];

    const toleranceUsd = Math.max(minToleranceUsd, spotPrice * toleranceBps);
    const rawLevels: RawLevelInput[] = [];

    // 1. Options levels
    if (optionsLevels) {
        if (optionsLevels.callWall && optionsLevels.callWall > 0) {
            rawLevels.push({
                name: `Call Wall ($${optionsLevels.callWall.toLocaleString()})`,
                kind: 'CALL_WALL',
                price: optionsLevels.callWall,
                source: 'OPTIONS',
                weight: 90,
            });
        }
        if (optionsLevels.putWall && optionsLevels.putWall > 0) {
            rawLevels.push({
                name: `Put Wall ($${optionsLevels.putWall.toLocaleString()})`,
                kind: 'PUT_WALL',
                price: optionsLevels.putWall,
                source: 'OPTIONS',
                weight: 90,
            });
        }
        if (optionsLevels.gammaFlip && optionsLevels.gammaFlip > 0) {
            rawLevels.push({
                name: `Gamma Flip ($${optionsLevels.gammaFlip.toLocaleString()})`,
                kind: 'GAMMA_FLIP',
                price: optionsLevels.gammaFlip,
                source: 'OPTIONS',
                weight: 85,
            });
        }
    }

    // 2. Volume profile levels
    if (volumeProfile) {
        const isVpApprox = Boolean(volumeProfile.isApproximate);
        if (volumeProfile.poc && volumeProfile.poc > 0) {
            rawLevels.push({
                name: `Volume POC ($${volumeProfile.poc.toLocaleString()})`,
                kind: 'POINT_OF_CONTROL',
                price: volumeProfile.poc,
                source: 'VOLUME_PROFILE',
                isApproximate: isVpApprox,
                weight: 85,
            });
        }
        if (volumeProfile.vah && volumeProfile.vah > 0) {
            rawLevels.push({
                name: `Value Area High ($${volumeProfile.vah.toLocaleString()})`,
                kind: 'VALUE_AREA_HIGH',
                price: volumeProfile.vah,
                source: 'VOLUME_PROFILE',
                isApproximate: isVpApprox,
                weight: 75,
            });
        }
        if (volumeProfile.val && volumeProfile.val > 0) {
            rawLevels.push({
                name: `Value Area Low ($${volumeProfile.val.toLocaleString()})`,
                kind: 'VALUE_AREA_LOW',
                price: volumeProfile.val,
                source: 'VOLUME_PROFILE',
                isApproximate: isVpApprox,
                weight: 75,
            });
        }
        (volumeProfile.hvn || []).forEach((hvnPrice) => {
            if (hvnPrice > 0) {
                rawLevels.push({
                    name: `HVN ($${hvnPrice.toLocaleString()})`,
                    kind: 'HIGH_VOLUME_NODE',
                    price: hvnPrice,
                    source: 'VOLUME_PROFILE',
                    isApproximate: isVpApprox,
                    weight: 65,
                });
            }
        });
        (volumeProfile.lvn || []).forEach((lvnPrice) => {
            if (lvnPrice > 0) {
                rawLevels.push({
                    name: `LVN ($${lvnPrice.toLocaleString()})`,
                    kind: 'LOW_VOLUME_NODE',
                    price: lvnPrice,
                    source: 'VOLUME_PROFILE',
                    isApproximate: isVpApprox,
                    weight: 60,
                });
            }
        });
    }

    // 3. Persistent liquidity walls
    persistentWalls.forEach((wall) => {
        if (wall.isPersistent && wall.priceBucket > 0) {
            rawLevels.push({
                name: `Persistent ${wall.side} ($${wall.priceBucket.toLocaleString()})`,
                kind: 'PERSISTENT_LIQUIDITY_WALL',
                price: wall.priceBucket,
                source: 'ORDERBOOK',
                weight: 65,
            });
        }
    });

    // 4. Swing levels
    swingLevels.forEach((swing) => {
        if (swing.price > 0) {
            rawLevels.push({
                name: `${swing.timeframe.toUpperCase()} ${swing.kind === 'SWING_HIGH' ? 'High' : 'Low'}`,
                kind: 'USER_DEFINED_LEVEL',
                price: swing.price,
                source: 'PRICE_ACTION',
                weight: swing.timeframe === '4h' ? 75 : 60,
            });
        }
    });

    // 5. VWAP levels
    vwapLevels.forEach((vwap) => {
        if (vwap.price > 0) {
            rawLevels.push({
                name: vwap.label,
                kind: 'USER_DEFINED_LEVEL',
                price: vwap.price,
                source: 'VWAP',
                weight: 65,
            });
        }
    });

    // 6. User levels
    userLevels.forEach((user) => {
        if (user.price > 0) {
            rawLevels.push({
                name: user.label || `Level $${user.price.toLocaleString()}`,
                kind: 'USER_DEFINED_LEVEL',
                price: user.price,
                source: 'USER',
                weight: 50,
            });
        }
    });

    if (rawLevels.length === 0) return [];

    // Convert raw levels into bands
    interface WorkingBand {
        priceLow: number;
        priceHigh: number;
        kind: DecisionZoneKind;
        contributors: string[];
        sources: Set<string>;
        isApproximate: boolean;
        baseWeight: number;
    }

    const initialBands: WorkingBand[] = rawLevels.map((lvl) => ({
        priceLow: Math.max(1, lvl.price - toleranceUsd),
        priceHigh: lvl.price + toleranceUsd,
        kind: lvl.kind,
        contributors: [lvl.name],
        sources: new Set([lvl.source]),
        isApproximate: Boolean(lvl.isApproximate),
        baseWeight: lvl.weight ?? 50,
    }));

    // Sort bands by priceLow ascending
    initialBands.sort((a, b) => a.priceLow - b.priceLow);

    // Merge overlapping or contiguous bands
    const mergedBands: WorkingBand[] = [];
    for (const band of initialBands) {
        if (mergedBands.length === 0) {
            mergedBands.push(band);
            continue;
        }

        const prev = mergedBands[mergedBands.length - 1];
        if (band.priceLow <= prev.priceHigh) {
            // Overlapping - merge
            prev.priceHigh = Math.max(prev.priceHigh, band.priceHigh);
            band.contributors.forEach((c) => {
                if (!prev.contributors.includes(c)) prev.contributors.push(c);
            });
            band.sources.forEach((s) => prev.sources.add(s));
            prev.isApproximate = prev.isApproximate || band.isApproximate;
            // Higher priority kind wins primary kind
            if (KIND_PRIORITY[band.kind] > KIND_PRIORITY[prev.kind]) {
                prev.kind = band.kind;
            }
            prev.baseWeight = Math.max(prev.baseWeight, band.baseWeight);
        } else {
            mergedBands.push(band);
        }
    }

    // Convert to DecisionZoneV1 schema objects
    const zones: DecisionZoneV1[] = mergedBands.map((band, idx) => {
        const midPrice = (band.priceLow + band.priceHigh) / 2;
        const sourceArray = Array.from(band.sources).slice(0, 16);
        const sourceBonus = Math.min(25, (sourceArray.length - 1) * 10);
        const contributorBonus = Math.min(15, (band.contributors.length - 1) * 5);
        const strengthScore = Math.min(100, Math.round(band.baseWeight + sourceBonus + contributorBonus));

        const primaryName = band.contributors[0] || `${band.kind} Zone`;
        const zoneId = `dz-${band.kind.toLowerCase().replace(/_/g, '-')}-${Math.round(midPrice)}-${idx}`;

        return DecisionZoneV1Schema.parse({
            id: zoneId,
            schemaVersion: ORDERFLOW_SCHEMA_VERSION,
            name: primaryName.slice(0, 128),
            kind: band.kind,
            priceLow: Number(band.priceLow.toFixed(2)),
            priceHigh: Number(band.priceHigh.toFixed(2)),
            midPrice: Number(midPrice.toFixed(2)),
            toleranceUsd: Number(toleranceUsd.toFixed(2)),
            strengthScore,
            contributors: band.contributors.slice(0, 16),
            sources: sourceArray,
            isApproximate: band.isApproximate,
            asOf,
        });
    });

    // Rank zones by proximity to spotPrice and strength score
    zones.sort((a, b) => {
        const distA = Math.abs(a.midPrice - spotPrice);
        const distB = Math.abs(b.midPrice - spotPrice);
        // Balance distance and strength
        const rankScoreA = a.strengthScore - (distA / spotPrice) * 50;
        const rankScoreB = b.strengthScore - (distB / spotPrice) * 50;
        return rankScoreB - rankScoreA;
    });

    return zones.slice(0, maxZones);
}

/**
 * Section 12.11 / Section 14:
 * Approximate volume profile cannot satisfy a mandatory setup gate.
 */
export function canSatisfyMandatoryGate(zone: DecisionZoneV1): { allowed: boolean; reasonCode?: string } {
    if (zone.isApproximate) {
        return {
            allowed: false,
            reasonCode: 'APPROXIMATE_VP_CANNOT_SATISFY_MANDATORY_GATE',
        };
    }
    return { allowed: true };
}

// ============================================================================
// 2. Absorption Detection (Section 12.11)
// ============================================================================

/**
 * Detects probable bullish or bearish absorption within validated decision zones.
 * In production mode (isProduction: true), absorption cannot fire outside a decision zone.
 * In all modes, absorption cannot fire without aggressive execution volume.
 */
export function detectAbsorption(options: DetectAbsorptionOptions): AbsorptionObservationV1[] {
    const {
        bars,
        decisionZones,
        persistentWalls = [],
        isProduction = true,
        minAggressiveVolumeUsd = 50_000,
        minAbsorptionRatio = 2.0,
        maxDisplacementUsd = 150,
    } = options;

    if (!bars || bars.length === 0) return [];

    const absorptions: AbsorptionObservationV1[] = [];

    for (const bar of bars) {
        const metrics = getFootprintBarMetrics(bar);
        const { barLow, barHigh, totalBuy, totalSell, delta, displacement } = metrics;

        // Find intersecting decision zone
        const matchingZone = decisionZones.find((zone) => {
            return Math.max(zone.priceLow, barLow) <= Math.min(zone.priceHigh, barHigh);
        });

        // 1. Production Gate: Absorption CANNOT fire outside a decision zone in production mode!
        if (isProduction && !matchingZone) {
            continue;
        }

        // --- Bullish Absorption (Aggressive sell volume absorbed by bids) ---
        // Mandatory: aggressive sell execution must be present
        if (totalSell >= minAggressiveVolumeUsd && delta < 0) {
            const absorptionRatio = totalSell / Math.max(1, displacement);

            if (displacement <= maxDisplacementUsd && absorptionRatio >= minAbsorptionRatio) {
                // Check bid persistence or replenishment support
                const hasBidWall = persistentWalls.some(
                    (w) => w.side === 'BID' && w.isPersistent && Math.abs(w.priceBucket - barLow) <= 100
                );

                const confirmations: string[] = [];
                if (hasBidWall) confirmations.push('PERSISTENT_BID_WALL');
                if (matchingZone) confirmations.push(`DECISION_ZONE_${matchingZone.kind}`);

                const zoneId = matchingZone ? matchingZone.id : 'UNZONED';
                const obsId = `abs-bullish-${bar.openTime}-${Math.round(barLow)}`;

                absorptions.push(
                    AbsorptionObservationV1Schema.parse({
                        id: obsId,
                        schemaVersion: ORDERFLOW_SCHEMA_VERSION,
                        side: 'BULLISH',
                        zoneId,
                        priceLow: Number(Math.min(barLow, matchingZone?.priceLow ?? barLow).toFixed(2)),
                        priceHigh: Number(Math.max(barHigh, matchingZone?.priceHigh ?? barHigh).toFixed(2)),
                        aggressiveVolumeUsd: Number(totalSell.toFixed(2)),
                        aggressiveDeltaUsd: Number(delta.toFixed(2)),
                        priceDisplacementUsd: Number(displacement.toFixed(2)),
                        absorptionRatio: Number(absorptionRatio.toFixed(2)),
                        startTime: bar.openTime,
                        endTime: bar.closeTime,
                        hasLiquiditySupport: hasBidWall,
                        confirmations,
                        reasonCodes: [
                            'ABSORPTION_IN_DECISION_ZONE',
                            'HIGH_AGGRESSIVE_SELL_VOLUME',
                            'PRICE_PROGRESS_CONTAINED',
                        ],
                        sourceRefs: [
                            'true-flow-footprint',
                            matchingZone ? `decision-zone:${matchingZone.id}` : 'market-tape',
                        ],
                    })
                );
            }
        }

        // --- Bearish Absorption (Aggressive buy volume absorbed by asks) ---
        // Mandatory: aggressive buy execution must be present
        if (totalBuy >= minAggressiveVolumeUsd && delta > 0) {
            const absorptionRatio = totalBuy / Math.max(1, displacement);

            if (displacement <= maxDisplacementUsd && absorptionRatio >= minAbsorptionRatio) {
                const hasAskWall = persistentWalls.some(
                    (w) => w.side === 'ASK' && w.isPersistent && Math.abs(w.priceBucket - barHigh) <= 100
                );

                const confirmations: string[] = [];
                if (hasAskWall) confirmations.push('PERSISTENT_ASK_WALL');
                if (matchingZone) confirmations.push(`DECISION_ZONE_${matchingZone.kind}`);

                const zoneId = matchingZone ? matchingZone.id : 'UNZONED';
                const obsId = `abs-bearish-${bar.openTime}-${Math.round(barHigh)}`;

                absorptions.push(
                    AbsorptionObservationV1Schema.parse({
                        id: obsId,
                        schemaVersion: ORDERFLOW_SCHEMA_VERSION,
                        side: 'BEARISH',
                        zoneId,
                        priceLow: Number(Math.min(barLow, matchingZone?.priceLow ?? barLow).toFixed(2)),
                        priceHigh: Number(Math.max(barHigh, matchingZone?.priceHigh ?? barHigh).toFixed(2)),
                        aggressiveVolumeUsd: Number(totalBuy.toFixed(2)),
                        aggressiveDeltaUsd: Number(delta.toFixed(2)),
                        priceDisplacementUsd: Number(displacement.toFixed(2)),
                        absorptionRatio: Number(absorptionRatio.toFixed(2)),
                        startTime: bar.openTime,
                        endTime: bar.closeTime,
                        hasLiquiditySupport: hasAskWall,
                        confirmations,
                        reasonCodes: [
                            'ABSORPTION_IN_DECISION_ZONE',
                            'HIGH_AGGRESSIVE_BUY_VOLUME',
                            'PRICE_PROGRESS_CONTAINED',
                        ],
                        sourceRefs: [
                            'true-flow-footprint',
                            matchingZone ? `decision-zone:${matchingZone.id}` : 'market-tape',
                        ],
                    })
                );
            }
        }
    }

    return absorptions;
}

// ============================================================================
// 3. Acceptance Detection (Section 12.12)
// ============================================================================

/**
 * Detects price acceptance above or below a decision zone.
 * Requires price trading through, closing/dwelling beyond, and aligned executed flow.
 */
export function detectAcceptance(options: DetectAcceptanceOptions): AcceptanceObservationV1[] {
    const {
        bars,
        decisionZones,
        minBreakoutVolumeUsd = 30_000,
        minDwellMs = 60_000,
    } = options;

    if (!bars || bars.length === 0 || decisionZones.length === 0) return [];

    const acceptances: AcceptanceObservationV1[] = [];

    for (const zone of decisionZones) {
        // Find consecutive bars dwelling beyond zone
        for (let i = 0; i < bars.length; i++) {
            const bar = bars[i];
            const metrics = getFootprintBarMetrics(bar);
            const { barLow, barHigh, barClose, totalBuy, totalSell, delta } = metrics;

            // Acceptance Above: Price breaks and closes above zone.priceHigh
            if (barHigh > zone.priceHigh && barClose > zone.priceHigh && totalBuy >= minBreakoutVolumeUsd && delta > 0) {
                // Check dwell time across forward bars
                let dwellDuration = bar.closeTime - bar.openTime;
                let j = i + 1;
                while (j < bars.length && getFootprintBarMetrics(bars[j]).barClose >= zone.priceHigh) {
                    dwellDuration = bars[j].closeTime - bar.openTime;
                    j++;
                }

                if (dwellDuration >= minDwellMs) {
                    const accId = `acc-above-${bar.openTime}-${zone.id}`;
                    acceptances.push(
                        AcceptanceObservationV1Schema.parse({
                            id: accId,
                            schemaVersion: ORDERFLOW_SCHEMA_VERSION,
                            side: 'ABOVE',
                            zoneId: zone.id,
                            levelPrice: Number(zone.priceHigh.toFixed(2)),
                            breakoutVolumeUsd: Number(totalBuy.toFixed(2)),
                            breakoutDeltaUsd: Number(delta.toFixed(2)),
                            dwellDurationMs: dwellDuration,
                            closedBeyond: true,
                            startTime: bar.openTime,
                            endTime: bars[Math.min(j - 1, bars.length - 1)].closeTime,
                            reasonCodes: [
                                'PRICE_CLOSED_BEYOND_ZONE',
                                'ALIGNED_BREAKOUT_DELTA',
                                'DWELL_CONDITION_MET',
                            ],
                            sourceRefs: [
                                'true-flow-footprint',
                                `decision-zone:${zone.id}`,
                            ],
                        })
                    );
                    i = j - 1; // Advance
                }
            }

            // Acceptance Below: Price breaks and closes below zone.priceLow
            else if (barLow < zone.priceLow && barClose < zone.priceLow && totalSell >= minBreakoutVolumeUsd && delta < 0) {
                let dwellDuration = bar.closeTime - bar.openTime;
                let j = i + 1;
                while (j < bars.length && getFootprintBarMetrics(bars[j]).barClose <= zone.priceLow) {
                    dwellDuration = bars[j].closeTime - bar.openTime;
                    j++;
                }

                if (dwellDuration >= minDwellMs) {
                    const accId = `acc-below-${bar.openTime}-${zone.id}`;
                    acceptances.push(
                        AcceptanceObservationV1Schema.parse({
                            id: accId,
                            schemaVersion: ORDERFLOW_SCHEMA_VERSION,
                            side: 'BELOW',
                            zoneId: zone.id,
                            levelPrice: Number(zone.priceLow.toFixed(2)),
                            breakoutVolumeUsd: Number(totalSell.toFixed(2)),
                            breakoutDeltaUsd: Number(delta.toFixed(2)),
                            dwellDurationMs: dwellDuration,
                            closedBeyond: true,
                            startTime: bar.openTime,
                            endTime: bars[Math.min(j - 1, bars.length - 1)].closeTime,
                            reasonCodes: [
                                'PRICE_CLOSED_BEYOND_ZONE',
                                'ALIGNED_BREAKOUT_DELTA',
                                'DWELL_CONDITION_MET',
                            ],
                            sourceRefs: [
                                'true-flow-footprint',
                                `decision-zone:${zone.id}`,
                            ],
                        })
                    );
                    i = j - 1; // Advance
                }
            }
        }
    }

    return acceptances;
}

// ============================================================================
// 4. Mutual Exclusion Reconciler (Acceptance vs Absorption)
// ============================================================================

/**
 * Section 12.11 / Section 12.12 Acceptance Criteria:
 * "Acceptance and absorption cannot both remain active for the same side/level/time window."
 * If acceptance is confirmed through a zone, conflicting absorption is revoked.
 */
export function reconcileAbsorptionAndAcceptance(
    absorptions: readonly AbsorptionObservationV1[],
    acceptances: readonly AcceptanceObservationV1[]
): {
    reconciledAbsorptions: AbsorptionObservationV1[];
    reconciledAcceptances: AcceptanceObservationV1[];
} {
    if (acceptances.length === 0) {
        return {
            reconciledAbsorptions: [...absorptions],
            reconciledAcceptances: [],
        };
    }
    if (absorptions.length === 0) {
        return {
            reconciledAbsorptions: [],
            reconciledAcceptances: [...acceptances],
        };
    }

    // Filter out any absorption that conflicts with confirmed acceptance
    const validAbsorptions = absorptions.filter((abs) => {
        const conflictingAcceptance = acceptances.find((acc) => {
            // Same zone or price overlap
            const zoneMatches = abs.zoneId === acc.zoneId;
            const timeOverlaps = Math.max(abs.startTime, acc.startTime) <= Math.min(abs.endTime, acc.endTime);

            // Conflicting behavior:
            // - Bullish absorption held the bid, but Acceptance Below broke and held below.
            // - Bearish absorption held the ask, but Acceptance Above broke and held above.
            const conflictsDirection =
                (abs.side === 'BULLISH' && acc.side === 'BELOW') ||
                (abs.side === 'BEARISH' && acc.side === 'ABOVE');

            return zoneMatches && timeOverlaps && conflictsDirection;
        });

        // If an acceptance broke the absorption level during that window, absorption is invalidated
        return !conflictingAcceptance;
    });

    return {
        reconciledAbsorptions: validAbsorptions,
        reconciledAcceptances: [...acceptances],
    };
}

// ============================================================================
// 5. CVD Divergence Detection (Section 12.13)
// ============================================================================

/**
 * Detects swing-pivot CVD divergence.
 * Exposes exact compared price and CVD pivots for complete auditability.
 */
export function detectCvdDivergence(options: DetectCvdDivergenceOptions): CvdDivergenceV1[] {
    const {
        candles,
        cvdPoints,
        decisionZones = [],
        minDisplacementUsd = 50,
        lookbackBars = 30,
    } = options;

    if (!candles || candles.length < 5 || !cvdPoints || cvdPoints.length < 5) {
        return [];
    }

    // Build map of timestamp to CVD value (nearest match)
    function findCvdAt(time: number): number {
        if (cvdPoints.length === 0) return 0;
        let closest = cvdPoints[0];
        let minDiff = Math.abs(closest.time - time);
        for (let i = 1; i < cvdPoints.length; i++) {
            const diff = Math.abs(cvdPoints[i].time - time);
            if (diff < minDiff) {
                minDiff = diff;
                closest = cvdPoints[i];
            }
        }
        return closest.cvd;
    }

    const recentCandles = candles.slice(-lookbackBars);
    interface PivotCandidate {
        index: number;
        time: number;
        price: number;
        kind: 'HIGH' | 'LOW';
    }

    const pivotLows: PivotCandidate[] = [];
    const pivotHighs: PivotCandidate[] = [];

    // Find local 3-bar swing pivots
    for (let i = 1; i < recentCandles.length - 1; i++) {
        const prev = recentCandles[i - 1];
        const curr = recentCandles[i];
        const next = recentCandles[i + 1];

        if (curr.low < prev.low && curr.low <= next.low) {
            pivotLows.push({ index: i, time: curr.openTime, price: curr.low, kind: 'LOW' });
        }
        if (curr.high > prev.high && curr.high >= next.high) {
            pivotHighs.push({ index: i, time: curr.openTime, price: curr.high, kind: 'HIGH' });
        }
    }

    const divergences: CvdDivergenceV1[] = [];

    // 1. Bullish CVD Divergence: Price Lower Low, CVD Higher Low
    for (let i = 0; i < pivotLows.length - 1; i++) {
        const p1 = pivotLows[i];
        const p2 = pivotLows[i + 1];

        const priceDisplacement = p2.price - p1.price;
        if (priceDisplacement <= -minDisplacementUsd) {
            // Price created a lower low by at least minDisplacementUsd
            const cvd1 = findCvdAt(p1.time);
            const cvd2 = findCvdAt(p2.time);
            const cvdDisplacement = cvd2 - cvd1;

            if (cvdDisplacement > 0) {
                // CVD made higher low!
                const isNearZone = decisionZones.length === 0 || decisionZones.some(
                    (z) => Math.abs(z.midPrice - p2.price) <= z.toleranceUsd * 2
                );

                if (isNearZone) {
                    const pricePivot1: PivotPointV1 = { time: p1.time, price: p1.price, value: p1.price };
                    const pricePivot2: PivotPointV1 = { time: p2.time, price: p2.price, value: p2.price };
                    const cvdPivot1: PivotPointV1 = { time: p1.time, price: p1.price, value: cvd1 };
                    const cvdPivot2: PivotPointV1 = { time: p2.time, price: p2.price, value: cvd2 };

                    divergences.push(
                        CvdDivergenceV1Schema.parse({
                            id: `div-bullish-${p1.time}-${p2.time}`,
                            schemaVersion: ORDERFLOW_SCHEMA_VERSION,
                            kind: 'BULLISH_CVD_DIVERGENCE',
                            pricePivot1,
                            pricePivot2,
                            cvdPivot1,
                            cvdPivot2,
                            priceDisplacementUsd: Number(priceDisplacement.toFixed(2)),
                            cvdDisplacementUsd: Number(cvdDisplacement.toFixed(2)),
                            startTime: p1.time,
                            endTime: p2.time,
                            reasonCodes: [
                                'PRICE_LOWER_LOW',
                                'CVD_HIGHER_LOW',
                                'BULLISH_DELTA_ABSORPTION',
                            ],
                            sourceRefs: [
                                'binance-spot-candles',
                                'true-trade-cvd',
                            ],
                        })
                    );
                }
            }
        }
    }

    // 2. Bearish CVD Divergence: Price Higher High, CVD Lower High
    for (let i = 0; i < pivotHighs.length - 1; i++) {
        const p1 = pivotHighs[i];
        const p2 = pivotHighs[i + 1];

        const priceDisplacement = p2.price - p1.price;
        if (priceDisplacement >= minDisplacementUsd) {
            // Price created a higher high by at least minDisplacementUsd
            const cvd1 = findCvdAt(p1.time);
            const cvd2 = findCvdAt(p2.time);
            const cvdDisplacement = cvd2 - cvd1;

            if (cvdDisplacement < 0) {
                // CVD made lower high!
                const isNearZone = decisionZones.length === 0 || decisionZones.some(
                    (z) => Math.abs(z.midPrice - p2.price) <= z.toleranceUsd * 2
                );

                if (isNearZone) {
                    const pricePivot1: PivotPointV1 = { time: p1.time, price: p1.price, value: p1.price };
                    const pricePivot2: PivotPointV1 = { time: p2.time, price: p2.price, value: p2.price };
                    const cvdPivot1: PivotPointV1 = { time: p1.time, price: p1.price, value: cvd1 };
                    const cvdPivot2: PivotPointV1 = { time: p2.time, price: p2.price, value: cvd2 };

                    divergences.push(
                        CvdDivergenceV1Schema.parse({
                            id: `div-bearish-${p1.time}-${p2.time}`,
                            schemaVersion: ORDERFLOW_SCHEMA_VERSION,
                            kind: 'BEARISH_CVD_DIVERGENCE',
                            pricePivot1,
                            pricePivot2,
                            cvdPivot1,
                            cvdPivot2,
                            priceDisplacementUsd: Number(priceDisplacement.toFixed(2)),
                            cvdDisplacementUsd: Number(cvdDisplacement.toFixed(2)),
                            startTime: p1.time,
                            endTime: p2.time,
                            reasonCodes: [
                                'PRICE_HIGHER_HIGH',
                                'CVD_LOWER_HIGH',
                                'BEARISH_DELTA_EXHAUSTION',
                            ],
                            sourceRefs: [
                                'binance-spot-candles',
                                'true-trade-cvd',
                            ],
                        })
                    );
                }
            }
        }
    }

    return divergences;
}

// ============================================================================
// 6. Flow Evidence Synthesizer
// ============================================================================

/**
 * Transforms microstructures, zones, absorptions, and divergences into unified MarketEvidenceV1 items.
 */
export function synthesizeFlowEvidence(options: SynthesizeFlowEvidenceOptions): MarketEvidenceV1[] {
    const {
        zones = [],
        absorptions = [],
        acceptances = [],
        divergences = [],
        stackedImbalances = [],
        persistentWalls = [],
        coverage,
    } = options;

    const evidence: MarketEvidenceV1[] = [];

    // 1. Absorptions
    absorptions.forEach((abs) => {
        evidence.push(
            MarketEvidenceV1Schema.parse({
                id: `ev-${abs.id}`,
                schemaVersion: ORDERFLOW_SCHEMA_VERSION,
                kind: abs.side === 'BULLISH' ? 'BULLISH_ABSORPTION' : 'BEARISH_ABSORPTION',
                direction: abs.side === 'BULLISH' ? 'BULLISH' : 'BEARISH',
                startTime: abs.startTime,
                endTime: abs.endTime,
                priceLow: abs.priceLow,
                priceHigh: abs.priceHigh,
                strengthPercentile: Math.min(100, Math.round(abs.absorptionRatio * 20)),
                confidence: abs.hasLiquiditySupport ? 'HIGH' : 'MEDIUM',
                reasonCodes: abs.reasonCodes,
                sourceRefs: abs.sourceRefs,
                quality: coverage,
                invalidatedAt: null,
            })
        );
    });

    // 2. Acceptances
    acceptances.forEach((acc) => {
        evidence.push(
            MarketEvidenceV1Schema.parse({
                id: `ev-${acc.id}`,
                schemaVersion: ORDERFLOW_SCHEMA_VERSION,
                kind: acc.side === 'ABOVE' ? 'ACCEPTANCE_ABOVE' : 'ACCEPTANCE_BELOW',
                direction: acc.side === 'ABOVE' ? 'BULLISH' : 'BEARISH',
                startTime: acc.startTime,
                endTime: acc.endTime,
                priceLow: Number((acc.levelPrice - 10).toFixed(2)),
                priceHigh: Number((acc.levelPrice + 10).toFixed(2)),
                strengthPercentile: 75,
                confidence: 'HIGH',
                reasonCodes: acc.reasonCodes,
                sourceRefs: acc.sourceRefs,
                quality: coverage,
                invalidatedAt: null,
            })
        );
    });

    // 3. CVD Divergences
    divergences.forEach((div) => {
        const isBullish = div.kind === 'BULLISH_CVD_DIVERGENCE';
        evidence.push(
            MarketEvidenceV1Schema.parse({
                id: `ev-${div.id}`,
                schemaVersion: ORDERFLOW_SCHEMA_VERSION,
                kind: div.kind,
                direction: isBullish ? 'BULLISH' : 'BEARISH',
                startTime: div.startTime,
                endTime: div.endTime,
                priceLow: Number(Math.min(div.pricePivot1.price, div.pricePivot2.price).toFixed(2)),
                priceHigh: Number(Math.max(div.pricePivot1.price, div.pricePivot2.price).toFixed(2)),
                strengthPercentile: 80,
                confidence: 'MEDIUM',
                reasonCodes: div.reasonCodes,
                sourceRefs: div.sourceRefs,
                quality: coverage,
                invalidatedAt: null,
            })
        );
    });

    // 4. Stacked Imbalances
    stackedImbalances.forEach((zone, idx) => {
        const kind: EvidenceKind = zone.side === 'BUY' ? 'STACKED_BUY_IMBALANCE' : 'STACKED_SELL_IMBALANCE';
        evidence.push(
            MarketEvidenceV1Schema.parse({
                id: `ev-stacked-${zone.candleOpenTime}-${idx}`,
                schemaVersion: ORDERFLOW_SCHEMA_VERSION,
                kind,
                direction: zone.side === 'BUY' ? 'BULLISH' : 'BEARISH',
                startTime: zone.candleOpenTime,
                endTime: null,
                priceLow: zone.priceLow,
                priceHigh: zone.priceHigh,
                strengthPercentile: Math.min(100, Math.round(zone.dominantNotionalUsd / 2_000)),
                confidence: zone.dominantNotionalUsd > 100_000 ? 'HIGH' : 'MEDIUM',
                reasonCodes: [`STACKED_${zone.side}_IMBALANCE`, `${zone.rowCount}_CONSECUTIVE_ROWS`],
                sourceRefs: ['true-flow-footprint'],
                quality: coverage,
                invalidatedAt: null,
            })
        );
    });

    // 5. Persistent Liquidity Walls
    persistentWalls.filter((w) => w.isPersistent).forEach((wall, idx) => {
        evidence.push(
            MarketEvidenceV1Schema.parse({
                id: `ev-persist-${wall.priceBucket}-${idx}`,
                schemaVersion: ORDERFLOW_SCHEMA_VERSION,
                kind: 'PERSISTENT_LIQUIDITY',
                direction: wall.side === 'BID' ? 'BULLISH' : 'BEARISH',
                startTime: wall.firstSeenTime,
                endTime: wall.lastSeenTime,
                priceLow: wall.priceBucket,
                priceHigh: wall.priceBucket + 10,
                strengthPercentile: Math.min(100, Math.round(wall.maxNotionalUsd / 2_000)),
                confidence: wall.persistenceMs > 30_000 ? 'HIGH' : 'MEDIUM',
                reasonCodes: ['LIQUIDITY_PERSISTENCE_TIME_BASED', `DURATION_${Math.round(wall.persistenceMs / 1000)}S`],
                sourceRefs: ['depth-reconstruction'],
                quality: coverage,
                invalidatedAt: null,
            })
        );
    });

    // 6. Structural Zones
    zones.forEach((zone) => {
        evidence.push(
            MarketEvidenceV1Schema.parse({
                id: `ev-zone-${zone.id}`,
                schemaVersion: ORDERFLOW_SCHEMA_VERSION,
                kind: 'STRUCTURAL_LEVEL',
                direction: 'NEUTRAL',
                startTime: zone.asOf,
                endTime: null,
                priceLow: zone.priceLow,
                priceHigh: zone.priceHigh,
                strengthPercentile: zone.strengthScore,
                confidence: zone.sources.length > 1 ? 'HIGH' : 'MEDIUM',
                reasonCodes: zone.contributors.map((c) => c.toUpperCase().replace(/[^A-Z0-9_]/g, '_')).slice(0, 8),
                sourceRefs: zone.sources.map((s) => `source:${s.toLowerCase()}`).slice(0, 8),
                quality: coverage,
                invalidatedAt: null,
            })
        );
    });

    return evidence;
}

// ============================================================================
// 7. Flow Evidence Snapshot
// ============================================================================

export function createFlowEvidenceSnapshot(options: CreateFlowEvidenceSnapshotOptions): FlowEvidenceSnapshotV1 {
    const {
        asOf = Date.now(),
        zones,
        absorptions,
        acceptances,
        divergences,
        coverage,
    } = options;

    const { reconciledAbsorptions, reconciledAcceptances } = reconcileAbsorptionAndAcceptance(absorptions, acceptances);

    return FlowEvidenceSnapshotV1Schema.parse({
        schemaVersion: ORDERFLOW_SCHEMA_VERSION,
        asOf,
        zones: [...zones],
        absorptions: reconciledAbsorptions,
        acceptances: reconciledAcceptances,
        divergences: [...divergences],
        coverage,
    });
}
