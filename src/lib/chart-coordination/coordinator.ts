import type { DemoMarketBar } from '../ui/market-fixtures';
import type {
    ChartSplitLayoutMode,
    FootprintPresetId,
    PriceScaleFitMode,
} from '../ui/design-tokens';

export type SemanticZoomTier = 'WIDE' | 'MEDIUM' | 'CLOSE';
export type RangeSyncMode = 'LOCKED_1_TO_1' | 'LINKED_CURSOR_FOCUS';

export interface CoordinatedRangeWindow {
    startIndex: number;
    endIndex: number;
    startTime: number;
    endTime: number;
    barCount: number;
}

export interface CoordinatedPriceScaleBounds {
    minPrice: number;
    maxPrice: number;
    priceSpan: number;
    fitMode: PriceScaleFitMode;
}

export interface FootprintPriceBin {
    price: number;
    buyVolume: number;
    sellVolume: number;
    totalVolume: number;
    delta: number;
    askImbalance: boolean;
    bidImbalance: boolean;
    inValueArea: boolean;
    isPoc: boolean;
}

export interface StackedImbalanceZone {
    side: 'BUY' | 'SELL';
    lowPrice: number;
    highPrice: number;
    levelCount: number;
    totalSideVolume: number;
}

export interface AggregatedFootprintBar {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    bucketStep: number;
    totalVolume: number;
    totalBuyVolume: number;
    totalSellVolume: number;
    barDelta: number;
    deltaPercent: number;
    pocPrice: number;
    vahPrice: number;
    valPrice: number;
    bins: FootprintPriceBin[];
    stackedImbalances: StackedImbalanceZone[];
    unfinishedHigh: boolean;
    unfinishedLow: boolean;
    absorptionCandidate: 'BULLISH_ABSORPTION' | 'BEARISH_ABSORPTION' | null;
    exhaustionCandidate: 'BULLISH_EXHAUSTION' | 'BEARISH_EXHAUSTION' | null;
    priceDeltaRegime:
        | 'PRICE_UP_DELTA_UP'
        | 'PRICE_DOWN_DELTA_DOWN'
        | 'PRICE_UP_DELTA_DOWN'
        | 'PRICE_DOWN_DELTA_UP'
        | 'FLAT_PRICE_POSITIVE_DELTA'
        | 'FLAT_PRICE_NEGATIVE_DELTA';
    provenance: 'LIVE_TAPE' | 'INTRABAR_KLINES';
}

export interface FootprintPresetConfig {
    id: FootprintPresetId;
    label: string;
    description: string;
    displayMode: 'FOOTPRINT' | 'DELTA_LADDER' | 'CANDLE_VP' | 'HEATMAP';
    showImbalances: boolean;
    showStackedZones: boolean;
    showPocMigration: boolean;
    showAbsorptionMarkers: boolean;
    showUnfinishedAuctions: boolean;
    footerRows: ('DELTA' | 'VOLUME' | 'DELTA_PCT' | 'POC')[];
}

export const FOOTPRINT_PRESETS: Record<FootprintPresetId, FootprintPresetConfig> = {
    CLEAN_FOOTPRINT: {
        id: 'CLEAN_FOOTPRINT',
        label: 'Clean Footprint',
        description: 'Candles + volume histogram + gold POC + compact Delta footer.',
        displayMode: 'CANDLE_VP',
        showImbalances: false,
        showStackedZones: false,
        showPocMigration: false,
        showAbsorptionMarkers: false,
        showUnfinishedAuctions: false,
        footerRows: ['DELTA', 'VOLUME'],
    },
    BID_ASK: {
        id: 'BID_ASK',
        label: 'Bid × Ask',
        description: 'Traditional Bid × Ask split ladder with diagonal imbalances and gold POC.',
        displayMode: 'FOOTPRINT',
        showImbalances: true,
        showStackedZones: false,
        showPocMigration: false,
        showAbsorptionMarkers: false,
        showUnfinishedAuctions: false,
        footerRows: ['DELTA', 'DELTA_PCT'],
    },
    DELTA_IMBALANCE: {
        id: 'DELTA_IMBALANCE',
        label: 'Delta & Imbalance',
        description: 'Price-level delta ladder with stacked imbalance zones and diagonal ratio highlights.',
        displayMode: 'DELTA_LADDER',
        showImbalances: true,
        showStackedZones: true,
        showPocMigration: true,
        showAbsorptionMarkers: true,
        showUnfinishedAuctions: false,
        footerRows: ['DELTA', 'DELTA_PCT'],
    },
    VOLUME_POC: {
        id: 'VOLUME_POC',
        label: 'Volume POC',
        description: 'Per-candle volume profile with cVAH/cVAL shading and POC migration path.',
        displayMode: 'CANDLE_VP',
        showImbalances: false,
        showStackedZones: false,
        showPocMigration: true,
        showAbsorptionMarkers: false,
        showUnfinishedAuctions: false,
        footerRows: ['VOLUME', 'POC'],
    },
    ABSORPTION_ANALYSIS: {
        id: 'ABSORPTION_ANALYSIS',
        label: 'Absorption Analysis',
        description: 'Location-gated absorption/exhaustion candidates and price-delta divergence.',
        displayMode: 'HEATMAP',
        showImbalances: true,
        showStackedZones: true,
        showPocMigration: true,
        showAbsorptionMarkers: true,
        showUnfinishedAuctions: false,
        footerRows: ['DELTA', 'DELTA_PCT', 'VOLUME'],
    },
    DETAILED_RESEARCH: {
        id: 'DETAILED_RESEARCH',
        label: 'Detailed Research',
        description: 'Full Bid × Ask matrix, stacked imbalances, unfinished auctions, and 4-row statistical footer.',
        displayMode: 'FOOTPRINT',
        showImbalances: true,
        showStackedZones: true,
        showPocMigration: true,
        showAbsorptionMarkers: true,
        showUnfinishedAuctions: true,
        footerRows: ['DELTA', 'DELTA_PCT', 'VOLUME', 'POC'],
    },
};

/**
 * Determines the semantic zoom tier from column pixel width and cell pixel height.
 */
export function resolveSemanticZoomTier(colWidthPx: number, cellHeightPx: number): SemanticZoomTier {
    if (colWidthPx >= 64 && cellHeightPx >= 12) {
        return 'CLOSE';
    }
    if (colWidthPx >= 34 && cellHeightPx >= 9) {
        return 'MEDIUM';
    }
    return 'WIDE';
}

/**
 * Computes the coordinated visible bar range for the Footprint pane so it stays synchronized
 * with the Candlestick chart and hovered/selected candle timestamp.
 */
export function resolveCoordinatedBarWindow(input: {
    bars: readonly DemoMarketBar[];
    logicalRange: { from: number; to: number } | null;
    syncMode: RangeSyncMode;
    maxFocusBars: number;
    focusTimestamp?: number | null;
}): CoordinatedRangeWindow {
    const { bars, logicalRange, syncMode, maxFocusBars, focusTimestamp } = input;
    if (bars.length === 0) {
        return { startIndex: 0, endIndex: 0, startTime: 0, endTime: 0, barCount: 0 };
    }

    const rawStart = logicalRange ? Math.max(0, Math.floor(logicalRange.from)) : Math.max(0, bars.length - maxFocusBars);
    const rawEnd = logicalRange ? Math.min(bars.length, Math.ceil(logicalRange.to) + 1) : bars.length;
    const clampedStart = Math.min(rawStart, Math.max(0, bars.length - 1));
    const clampedEnd = Math.max(clampedStart + 1, Math.min(bars.length, rawEnd));
    const span = clampedEnd - clampedStart;

    if (syncMode === 'LOCKED_1_TO_1' || span <= maxFocusBars) {
        const s = clampedStart;
        const e = Math.min(bars.length, Math.max(s + 1, clampedEnd));
        return {
            startIndex: s,
            endIndex: e,
            startTime: Number(bars[s].time),
            endTime: Number(bars[e - 1].time),
            barCount: e - s,
        };
    }

    // LINKED_CURSOR_FOCUS: center or anchor around focusTimestamp if inside the visible range, else latest visible bar
    let centerIdx = clampedEnd - 1;
    if (focusTimestamp !== null && focusTimestamp !== undefined) {
        const foundIdx = bars.findIndex((b) => Number(b.time) === focusTimestamp);
        if (foundIdx >= clampedStart && foundIdx < clampedEnd) {
            centerIdx = foundIdx;
        }
    }

    const half = Math.floor(maxFocusBars / 2);
    let focusStart = Math.max(clampedStart, centerIdx - half);
    let focusEnd = Math.min(clampedEnd, focusStart + maxFocusBars);
    if (focusEnd - focusStart < maxFocusBars) {
        focusStart = Math.max(clampedStart, focusEnd - maxFocusBars);
    }

    return {
        startIndex: focusStart,
        endIndex: focusEnd,
        startTime: Number(bars[focusStart].time),
        endTime: Number(bars[focusEnd - 1].time),
        barCount: focusEnd - focusStart,
    };
}

/**
 * Computes Y-axis price bounds decoupled from distant option walls by default (`CANDLE_FIT`),
 * preventing the 85% vertical compression bug when Call/Put walls are $5,000 away from spot.
 */
export function computeCoordinatedPriceBounds(input: {
    visibleBars: readonly DemoMarketBar[];
    fitMode: PriceScaleFitMode;
    structuralLevels?: readonly number[];
    paddingRatio?: number;
}): CoordinatedPriceScaleBounds {
    const paddingRatio = input.paddingRatio ?? 0.08;
    if (input.visibleBars.length === 0) {
        return { minPrice: 0, maxPrice: 100, priceSpan: 100, fitMode: input.fitMode };
    }

    let rawMin = Math.min(...input.visibleBars.map((b) => b.low));
    let rawMax = Math.max(...input.visibleBars.map((b) => b.high));

    if (input.fitMode === 'INCLUDE_WALLS' && input.structuralLevels && input.structuralLevels.length > 0) {
        for (const lvl of input.structuralLevels) {
            if (Number.isFinite(lvl) && lvl > 0) {
                rawMin = Math.min(rawMin, lvl);
                rawMax = Math.max(rawMax, lvl);
            }
        }
    }

    const baseSpan = Math.max(10, rawMax - rawMin);
    const pad = baseSpan * paddingRatio;
    const minPrice = rawMin - pad;
    const maxPrice = rawMax + pad;
    return {
        minPrice,
        maxPrice,
        priceSpan: Math.max(1, maxPrice - minPrice),
        fitMode: input.fitMode,
    };
}

/**
 * Selects an adaptive price bin step so that the average visible candle contains ~14 readable price rows.
 */
export function selectAdaptiveFootprintStep(
    visibleBars: readonly DemoMarketBar[],
    manualStep: number | 'AUTO',
): number {
    if (manualStep !== 'AUTO' && Number.isFinite(manualStep) && manualStep > 0) {
        return manualStep;
    }
    if (visibleBars.length === 0) return 25;
    const avgRange =
        visibleBars.reduce((acc, b) => acc + Math.max(1, b.high - b.low), 0) / visibleBars.length;
    const target = avgRange / 14;
    if (target <= 5) return 5;
    if (target <= 10) return 10;
    if (target <= 25) return 25;
    if (target <= 50) return 50;
    if (target <= 100) return 100;
    return 250;
}

/**
 * Aggregates raw price-level executions into fixed `bucketStep` bins while strictly conserving
 * total buy volume, total sell volume, total volume, and net delta.
 */
export function aggregateFootprintBarWithConservation(input: {
    bar: DemoMarketBar;
    rawCells: ReadonlyArray<{ price: number; buyVolume: number; sellVolume: number }>;
    bucketStep: number;
    imbalanceRatio?: number;
    minImbalanceVolume?: number;
    stackedThreshold?: number;
    structuralLevels?: readonly number[];
    provenance: 'LIVE_TAPE' | 'INTRABAR_KLINES';
}): AggregatedFootprintBar {
    const {
        bar,
        rawCells,
        bucketStep,
        imbalanceRatio = 3.0,
        minImbalanceVolume = 0.25,
        stackedThreshold = 3,
        structuralLevels = [],
        provenance,
    } = input;

    const step = Math.max(1, bucketStep);
    const lowBucket = Math.floor(bar.low / step) * step;
    const highBucket = Math.ceil(bar.high / step) * step;

    const bucketMap = new Map<number, { buy: number; sell: number }>();
    for (let p = lowBucket; p <= highBucket; p += step) {
        bucketMap.set(p, { buy: 0, sell: 0 });
    }

    for (const cell of rawCells) {
        const bPrice = Math.floor(cell.price / step) * step;
        const curr = bucketMap.get(bPrice) ?? { buy: 0, sell: 0 };
        curr.buy += Math.max(0, cell.buyVolume);
        curr.sell += Math.max(0, cell.sellVolume);
        bucketMap.set(bPrice, curr);
    }

    const sortedPrices = Array.from(bucketMap.keys()).sort((a, b) => b - a); // High to Low
    let totalBuyVolume = 0;
    let totalSellVolume = 0;
    let pocPrice = sortedPrices[0] ?? Math.round(bar.close / step) * step;
    let maxBinVol = -1;

    const prelimBins: FootprintPriceBin[] = sortedPrices.map((price) => {
        const entry = bucketMap.get(price) ?? { buy: 0, sell: 0 };
        const buyVolume = Number(entry.buy.toFixed(6));
        const sellVolume = Number(entry.sell.toFixed(6));
        const totalVolume = Number((buyVolume + sellVolume).toFixed(6));
        const delta = Number((buyVolume - sellVolume).toFixed(6));

        totalBuyVolume += buyVolume;
        totalSellVolume += sellVolume;
        if (totalVolume > maxBinVol) {
            maxBinVol = totalVolume;
            pocPrice = price;
        }

        return {
            price,
            buyVolume,
            sellVolume,
            totalVolume,
            delta,
            askImbalance: false,
            bidImbalance: false,
            inValueArea: false,
            isPoc: false,
        };
    });

    totalBuyVolume = Number(totalBuyVolume.toFixed(6));
    totalSellVolume = Number(totalSellVolume.toFixed(6));
    const totalVolume = Number((totalBuyVolume + totalSellVolume).toFixed(6));
    const barDelta = Number((totalBuyVolume - totalSellVolume).toFixed(6));
    const deltaPercent = totalVolume > 0 ? Number(((barDelta / totalVolume) * 100).toFixed(2)) : 0;

    // Mark POC & compute 70% Candle Value Area (cVAH / cVAL)
    const pocIndex = prelimBins.findIndex((b) => b.price === pocPrice);
    if (pocIndex >= 0) {
        prelimBins[pocIndex].isPoc = true;
        prelimBins[pocIndex].inValueArea = true;
    }

    let vaAccum = pocIndex >= 0 ? prelimBins[pocIndex].totalVolume : 0;
    const vaTarget = totalVolume * 0.7;
    let upIdx = pocIndex > 0 ? pocIndex - 1 : 0; // higher price
    let downIdx = pocIndex >= 0 && pocIndex < prelimBins.length - 1 ? pocIndex + 1 : prelimBins.length - 1; // lower price

    while (vaAccum < vaTarget && (upIdx >= 0 || downIdx < prelimBins.length)) {
        const upVol = upIdx >= 0 && !prelimBins[upIdx].inValueArea ? prelimBins[upIdx].totalVolume : -1;
        const downVol =
            downIdx < prelimBins.length && !prelimBins[downIdx].inValueArea
                ? prelimBins[downIdx].totalVolume
                : -1;

        if (upVol < 0 && downVol < 0) break;
        if (upVol >= downVol && upIdx >= 0) {
            prelimBins[upIdx].inValueArea = true;
            vaAccum += Math.max(0, upVol);
            upIdx -= 1;
        } else if (downIdx < prelimBins.length) {
            prelimBins[downIdx].inValueArea = true;
            vaAccum += Math.max(0, downVol);
            downIdx += 1;
        } else {
            break;
        }
    }

    const vaPrices = prelimBins.filter((b) => b.inValueArea).map((b) => b.price);
    const vahPrice = vaPrices.length > 0 ? Math.max(...vaPrices) : bar.high;
    const valPrice = vaPrices.length > 0 ? Math.min(...vaPrices) : bar.low;

    // Diagonal Imbalances:
    // prelimBins is sorted High to Low (index i is price P, index i+1 is price P - step)
    for (let i = 0; i < prelimBins.length; i += 1) {
        const curr = prelimBins[i];
        const lowerBin = prelimBins[i + 1];
        const higherBin = prelimBins[i - 1];

        if (lowerBin && curr.buyVolume >= minImbalanceVolume) {
            const denom = Math.max(0.0001, lowerBin.sellVolume);
            if (curr.buyVolume / denom >= imbalanceRatio) {
                curr.askImbalance = true;
            }
        }
        if (higherBin && curr.sellVolume >= minImbalanceVolume) {
            const denom = Math.max(0.0001, higherBin.buyVolume);
            if (curr.sellVolume / denom >= imbalanceRatio) {
                curr.bidImbalance = true;
            }
        }
    }

    // Stacked Imbalances (>= stackedThreshold contiguous levels)
    const stackedImbalances: StackedImbalanceZone[] = [];
    let askRun: FootprintPriceBin[] = [];
    let bidRun: FootprintPriceBin[] = [];

    const flushAskRun = () => {
        if (askRun.length >= stackedThreshold) {
            stackedImbalances.push({
                side: 'BUY',
                lowPrice: Math.min(...askRun.map((b) => b.price)),
                highPrice: Math.max(...askRun.map((b) => b.price)),
                levelCount: askRun.length,
                totalSideVolume: Number(askRun.reduce((s, b) => s + b.buyVolume, 0).toFixed(4)),
            });
        }
        askRun = [];
    };

    const flushBidRun = () => {
        if (bidRun.length >= stackedThreshold) {
            stackedImbalances.push({
                side: 'SELL',
                lowPrice: Math.min(...bidRun.map((b) => b.price)),
                highPrice: Math.max(...bidRun.map((b) => b.price)),
                levelCount: bidRun.length,
                totalSideVolume: Number(bidRun.reduce((s, b) => s + b.sellVolume, 0).toFixed(4)),
            });
        }
        bidRun = [];
    };

    for (const b of prelimBins) {
        if (b.askImbalance) askRun.push(b);
        else flushAskRun();

        if (b.bidImbalance) bidRun.push(b);
        else flushBidRun();
    }
    flushAskRun();
    flushBidRun();

    // Unfinished Auctions at High (index 0) and Low (last index)
    const topBin = prelimBins[0];
    const bottomBin = prelimBins[prelimBins.length - 1];
    const unfinishedHigh = Boolean(topBin && topBin.buyVolume > 0 && topBin.sellVolume > 0);
    const unfinishedLow = Boolean(bottomBin && bottomBin.buyVolume > 0 && bottomBin.sellVolume > 0);

    // Price-Delta Regime Classification (6 canonical states)
    const barRange = Math.max(1, bar.high - bar.low);
    const bodyRatio = Math.abs(bar.close - bar.open) / barRange;
    let priceDeltaRegime: AggregatedFootprintBar['priceDeltaRegime'];

    if (bodyRatio < 0.15) {
        priceDeltaRegime = barDelta >= 0 ? 'FLAT_PRICE_POSITIVE_DELTA' : 'FLAT_PRICE_NEGATIVE_DELTA';
    } else if (bar.close >= bar.open) {
        priceDeltaRegime = barDelta >= 0 ? 'PRICE_UP_DELTA_UP' : 'PRICE_UP_DELTA_DOWN';
    } else {
        priceDeltaRegime = barDelta <= 0 ? 'PRICE_DOWN_DELTA_DOWN' : 'PRICE_DOWN_DELTA_UP';
    }

    // Location-Gated Absorption & Exhaustion Candidates
    const nearStructuralLow =
        structuralLevels.length === 0 ||
        structuralLevels.some((lvl) => Math.abs(bar.low - lvl) / Math.max(1, lvl) <= 0.0035);
    const nearStructuralHigh =
        structuralLevels.length === 0 ||
        structuralLevels.some((lvl) => Math.abs(bar.high - lvl) / Math.max(1, lvl) <= 0.0035);

    let absorptionCandidate: AggregatedFootprintBar['absorptionCandidate'] = null;
    let exhaustionCandidate: AggregatedFootprintBar['exhaustionCandidate'] = null;

    const lowerWickRatio = (Math.min(bar.open, bar.close) - bar.low) / barRange;
    const upperWickRatio = (bar.high - Math.max(bar.open, bar.close)) / barRange;

    if (nearStructuralLow && lowerWickRatio >= 0.35 && barDelta < 0 && bar.close >= bar.open) {
        absorptionCandidate = 'BULLISH_ABSORPTION';
    } else if (nearStructuralHigh && upperWickRatio >= 0.35 && barDelta > 0 && bar.close <= bar.open) {
        absorptionCandidate = 'BEARISH_ABSORPTION';
    }

    const avgBinVol = prelimBins.length > 0 ? totalVolume / prelimBins.length : 0;
    if (bottomBin && lowerWickRatio >= 0.3 && bottomBin.totalVolume < avgBinVol * 0.28) {
        exhaustionCandidate = 'BULLISH_EXHAUSTION';
    } else if (topBin && upperWickRatio >= 0.3 && topBin.totalVolume < avgBinVol * 0.28) {
        exhaustionCandidate = 'BEARISH_EXHAUSTION';
    }

    return {
        time: Number(bar.time),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        bucketStep: step,
        totalVolume,
        totalBuyVolume,
        totalSellVolume,
        barDelta,
        deltaPercent,
        pocPrice,
        vahPrice,
        valPrice,
        bins: prelimBins,
        stackedImbalances,
        unfinishedHigh,
        unfinishedLow,
        absorptionCandidate,
        exhaustionCandidate,
        priceDeltaRegime,
        provenance,
    };
}
