import {
    footprintPriceTicks,
    footprintTimeTicks,
    formatFootprintTimeTick,
} from '../../lib/chart-coordination/footprint-viewport';
import type { FootprintWorkspaceCandle } from '../../lib/orderflow/footprint-workspace';

export const FOOTPRINT_DISPLAY_MODES = {
    BID_ASK: 'Bid × Ask',
    DELTA: 'Delta',
    VOLUME: 'Volume',
    DELTA_PROFILE: 'Delta profile',
    VOLUME_PROFILE: 'Volume profile',
    HEATMAP: 'Volume heatmap',
} as const;

export type FootprintDisplayMode = keyof typeof FOOTPRINT_DISPLAY_MODES;

export const FOOTPRINT_STAT_LABELS = {
    ASK: 'Ask volume (BTC)',
    BID: 'Bid volume (BTC)',
    DELTA: 'Delta (BTC)',
    DELTA_PCT: 'Delta (%)',
    VOLUME: 'Total volume (BTC)',
    TRADES: 'Executed trades',
    POC: 'POC price',
    MAX_DELTA: 'Max delta (USDT)',
    MIN_DELTA: 'Min delta (USDT)',
    CVD: 'Session CVD (BTC)',
} as const;

export type FootprintStatRow = keyof typeof FOOTPRINT_STAT_LABELS;
export type FootprintStat = FootprintStatRow;
export const DEFAULT_FOOTPRINT_STAT_ROWS = Object.keys(FOOTPRINT_STAT_LABELS) as FootprintStatRow[];

export interface FootprintRenderBar {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    footprint?: FootprintWorkspaceCandle | null;
}

export interface FootprintRenderViewport {
    from: number;
    to: number;
    minPrice: number;
    maxPrice: number;
}

interface FootprintLayoutInput {
    width: number;
    height: number;
    viewport: FootprintRenderViewport;
    timeframeSeconds: number;
    statsRows: readonly FootprintStatRow[];
    statsHeight: number;
    cvdHeight: number;
}

export function createFootprintLayout({
    width, height, viewport, timeframeSeconds, statsRows, statsHeight, cvdHeight,
}: FootprintLayoutInput) {
    const plotLeft = 0;
    const hasStats = statsRows.length > 0 && statsHeight > 0;
    const axisWidth = hasStats ? Math.min(122, width * 0.28) : Math.min(72, width * 0.19);
    const plotRight = Math.max(1, width - axisWidth);
    const plotTop = 0;
    const axisHeight = 24;
    const studyBudget = Math.max(0, height - 80 - axisHeight);
    const cvdPaneHeight = Math.min(Math.max(0, cvdHeight), studyBudget * 0.4);
    const tableHeight = statsRows.length
        ? Math.min(Math.max(0, statsHeight), studyBudget - cvdPaneHeight)
        : 0;
    const plotBottom = Math.max(1, height - tableHeight - cvdPaneHeight - axisHeight);
    const axisBottom = plotBottom + axisHeight;
    const statsBottom = axisBottom + tableHeight;
    const cvdBottom = statsBottom + cvdPaneHeight;
    const plotWidth = plotRight - plotLeft;
    const plotHeight = plotBottom - plotTop;
    const timeSpan = Math.max(1, viewport.to - viewport.from);
    const priceSpan = Math.max(0.000001, viewport.maxPrice - viewport.minPrice);

    return {
        plotLeft, plotRight, plotTop, plotBottom, axisBottom, cvdBottom, statsBottom,
        plotWidth, plotHeight,
        barWidth: timeframeSeconds / timeSpan * plotWidth,
        xForTime: (time: number) => plotLeft + (time - viewport.from) / timeSpan * plotWidth,
        timeForX: (x: number) => viewport.from + (x - plotLeft) / plotWidth * timeSpan,
        yForPrice: (price: number) => plotTop + (viewport.maxPrice - price) / priceSpan * plotHeight,
        priceForY: (y: number) => viewport.maxPrice - (y - plotTop) / plotHeight * priceSpan,
    };
}

export type FootprintLayout = ReturnType<typeof createFootprintLayout>;

export interface FootprintRenderOptions extends FootprintLayoutInput {
    bars: readonly FootprintRenderBar[];
    mode: FootprintDisplayMode;
    selectedTime: number | null;
    pricePrecision?: number;
    tickSize?: number;
    showImbalances?: boolean;
    buyColor?: string;
    sellColor?: string;
}

const FONT = '11px ui-monospace, SFMono-Regular, Consolas, monospace';
const MUTED = '#94a3b8';
const LIGHT = '#dbe7f4';
const GRID = '#192433';
const BACKGROUND = '#080d14';
const BUY = '#4dd4af';
const SELL = '#f88799';
const POC = '#e3b65f';

const axisPrice = new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 });
const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const utcTime = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
});

export function formatFootprintQuantity(value: number): string {
    if (value === 0) return '0';
    const magnitude = Math.abs(value);
    if (magnitude < 0.0001) return value.toExponential(1);
    return String(Number(value.toFixed(magnitude >= 100 ? 1 : magnitude >= 1 ? 2 : 5)));
}

function formatPrice(value: number, precision?: number) {
    return precision === undefined ? axisPrice.format(value) : value.toFixed(Math.min(8, Math.max(0, precision)));
}

export function getFootprintStat(candle: FootprintWorkspaceCandle, row: FootprintStatRow): number | null {
    switch (row) {
        case 'ASK': return candle.askVolumeBtc;
        case 'BID': return candle.bidVolumeBtc;
        case 'DELTA': return candle.deltaBtc;
        case 'DELTA_PCT': return candle.deltaPercent;
        case 'VOLUME': return candle.totalVolumeBtc;
        case 'TRADES': return candle.executionCount;
        case 'POC': return candle.pocPrice;
        case 'MAX_DELTA': return candle.maxDeltaUsdt;
        case 'MIN_DELTA': return candle.minDeltaUsdt;
        case 'CVD': return candle.cumulativeDeltaBtc;
    }
}

export function formatFootprintStat(candle: FootprintWorkspaceCandle, row: FootprintStatRow): string {
    const value = getFootprintStat(candle, row);
    if (value === null) return '—';
    if (row === 'DELTA_PCT') return `${value.toFixed(1)}%`;
    if (row === 'TRADES') return integer.format(value);
    if (row === 'POC') return formatPrice(value);
    return formatFootprintQuantity(value);
}

function setupCanvas(canvas: HTMLCanvasElement, width: number, height: number) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.font = FONT;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    return ctx;
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
}

function clip(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, Math.max(0, width), Math.max(0, height));
    ctx.clip();
}

function firstBarAtOrAfter(bars: readonly FootprintRenderBar[], time: number) {
    let first = 0;
    let last = bars.length;
    while (first < last) {
        const middle = Math.floor((first + last) / 2);
        if (bars[middle].time < time) first = middle + 1;
        else last = middle;
    }
    return first;
}

const candleIntensity = new WeakMap<FootprintWorkspaceCandle, { volume: number; delta: number }>();

function getCandleIntensity(candle: FootprintWorkspaceCandle) {
    const cached = candleIntensity.get(candle);
    if (cached) return cached;
    let volume = 0;
    let delta = 0;
    for (const cell of candle.cells) {
        volume = Math.max(volume, cell.buyVolumeBtc + cell.sellVolumeBtc);
        delta = Math.max(delta, Math.abs(cell.buyVolumeBtc - cell.sellVolumeBtc));
    }
    const intensity = { volume: volume || 1, delta: delta || 1 };
    candleIntensity.set(candle, intensity);
    return intensity;
}

function firstVisibleCell(cells: FootprintWorkspaceCandle['cells'], minPrice: number) {
    let first = 0;
    let last = cells.length;
    while (first < last) {
        const middle = Math.floor((first + last) / 2);
        if (cells[middle].priceHigh <= minPrice) first = middle + 1;
        else last = middle;
    }
    return first;
}

function renderCell(
    ctx: CanvasRenderingContext2D,
    cell: FootprintWorkspaceCandle['cells'][number],
    mode: FootprintDisplayMode,
    center: number,
    top: number,
    width: number,
    height: number,
    maximum: number,
    maxDelta: number,
    showImbalances: boolean,
    buy: string,
    sell: string,
) {
    const bid = cell.sellVolumeBtc;
    const ask = cell.buyVolumeBtc;
    const total = ask + bid;
    const delta = ask - bid;
    const left = center - width / 2;
    const baseline = top + height / 2;
    const half = Math.max(0, width / 2 - 5);
    const showText = width >= (mode === 'BID_ASK' ? 88 : 46) && height >= 12;
    const signColor = delta >= 0 ? buy : sell;
    const intensity = Math.sqrt(total / maximum);

    ctx.globalAlpha = 0.12 + intensity * 0.22;
    ctx.fillStyle = '#45617a';
    ctx.fillRect(left, top, width, height);
    if (mode === 'BID_ASK') {
        const bidWidth = bid > 0 ? Math.max(1, half * bid / maximum) : 0;
        const askWidth = ask > 0 ? Math.max(1, half * ask / maximum) : 0;
        ctx.globalAlpha = showImbalances && cell.sellImbalance ? 0.58 : 0.28;
        ctx.fillStyle = sell;
        ctx.fillRect(center - 4 - bidWidth, top, bidWidth, height);
        ctx.globalAlpha = showImbalances && cell.buyImbalance ? 0.58 : 0.28;
        ctx.fillStyle = buy;
        ctx.fillRect(center + 4, top, askWidth, height);
        if (showText) {
            ctx.globalAlpha = 1;
            ctx.fillStyle = bid > 0 ? sell : MUTED;
            ctx.textAlign = 'right';
            ctx.fillText(formatFootprintQuantity(bid), center - 6, baseline, Math.max(1, half - 3));
            ctx.fillStyle = ask > 0 ? buy : MUTED;
            ctx.textAlign = 'left';
            ctx.fillText(formatFootprintQuantity(ask), center + 6, baseline, Math.max(1, half - 3));
        }
    } else {
        const isDelta = mode === 'DELTA' || mode === 'DELTA_PROFILE';
        const value = isDelta ? delta : total;
        const ratio = isDelta ? Math.abs(delta) / maxDelta : total / maximum;
        ctx.fillStyle = isDelta ? signColor : mode === 'HEATMAP' ? POC : '#70a1cc';
        ctx.globalAlpha = 0.14 + Math.sqrt(ratio) * 0.48;
        if (mode === 'DELTA_PROFILE') {
            const extent = half * ratio;
            ctx.fillRect(delta < 0 ? center - extent : center, top, extent, height);
        } else {
            ctx.fillRect(left, top, mode === 'VOLUME_PROFILE' ? width * ratio : width, height);
        }
        if (showImbalances && (cell.buyImbalance || cell.sellImbalance)) {
            ctx.globalAlpha = 0.9;
            ctx.fillStyle = cell.buyImbalance ? buy : sell;
            ctx.fillRect(cell.buyImbalance ? left + width - 2 : left, top, 2, height);
        }
        if (showText) {
            ctx.globalAlpha = 1;
            ctx.textAlign = 'center';
            ctx.fillStyle = LIGHT;
            ctx.fillText(formatFootprintQuantity(value), center, baseline, width - 4);
        }
    }
    ctx.globalAlpha = 1;
}

function renderCandle(
    ctx: CanvasRenderingContext2D,
    layout: FootprintLayout,
    options: FootprintRenderOptions,
    bar: FootprintRenderBar,
    x: number,
) {
    const candle = bar.footprint;
    const { yForPrice, barWidth } = layout;
    const buy = options.buyColor ?? BUY;
    const sell = options.sellColor ?? SELL;
    const width = Math.max(1, barWidth - 6);
    const bodyColor = bar.close >= bar.open ? buy : sell;

    if (candle && barWidth >= 28) {
        const firstCell = firstVisibleCell(candle.cells, options.viewport.minPrice);
        const first = candle.cells[firstCell];
        if (first && yForPrice(first.priceLow) - yForPrice(first.priceHigh) >= 2) {
            const intensity = getCandleIntensity(candle);
            for (let i = firstCell; i < candle.cells.length; i++) {
                const cell = candle.cells[i];
                if (cell.priceLow >= options.viewport.maxPrice) break;
                const highY = yForPrice(cell.priceHigh);
                const lowY = yForPrice(cell.priceLow);
                renderCell(ctx, cell, options.mode, x, highY + 0.5, width, lowY - highY - 1,
                    intensity.volume, intensity.delta, options.showImbalances !== false, buy, sell);
            }
        }
    }

    const bodyWidth = candle && barWidth >= 28 ? 3 : Math.max(1, Math.min(11, barWidth * 0.38));
    ctx.strokeStyle = bodyColor;
    ctx.globalAlpha = candle ? 0.82 : 0.45;
    line(ctx, x, yForPrice(bar.high), x, yForPrice(bar.low));
    ctx.fillStyle = bodyColor;
    const top = Math.min(yForPrice(bar.open), yForPrice(bar.close));
    ctx.fillRect(x - bodyWidth / 2, top, bodyWidth, Math.max(2, Math.abs(yForPrice(bar.open) - yForPrice(bar.close))));
    ctx.globalAlpha = 1;

    if (candle?.pocPrice !== null && candle?.pocPrice !== undefined) {
        const y = yForPrice(candle.pocPrice);
        ctx.strokeStyle = POC;
        ctx.globalAlpha = 0.72;
        line(ctx, x - width * 0.45, y, x + width * 0.45, y);
        ctx.globalAlpha = 1;
    }
    if (candle?.developing || (candle && candle.coverageStatus !== 'OBSERVED')) {
        ctx.strokeStyle = candle.coverageStatus === 'GAPPED' ? POC : MUTED;
        ctx.setLineDash(candle.developing ? [3, 3] : [1, 3]);
        line(ctx, x - width / 2, Math.max(2, yForPrice(bar.high) - 6),
            x + width / 2, Math.max(2, yForPrice(bar.high) - 6));
        ctx.setLineDash([]);
    }
}

function renderCvd(
    ctx: CanvasRenderingContext2D,
    layout: FootprintLayout,
    options: FootprintRenderOptions,
    first: number,
    last: number,
) {
    const { plotLeft, plotRight, plotWidth, statsBottom, cvdBottom, xForTime } = layout;
    if (cvdBottom - statsBottom < 12) return;
    let min = 0;
    let max = 0;
    for (let i = first; i < last; i++) {
        const value = options.bars[i].footprint?.cumulativeDeltaBtc;
        if (value === null || value === undefined) continue;
        min = Math.min(min, value);
        max = Math.max(max, value);
    }
    ctx.fillStyle = MUTED;
    ctx.textAlign = 'left';
    ctx.fillText('CVD · BTC', plotRight + 5, statsBottom + 11, Math.max(1, options.width - plotRight - 8));
    clip(ctx, plotLeft, statsBottom, plotWidth, cvdBottom - statsBottom);
    const yForValue = (v: number) => max === min ? (statsBottom + cvdBottom) / 2
        : cvdBottom - 5 - (v - min) / (max - min) * (cvdBottom - statsBottom - 10);
    ctx.strokeStyle = GRID;
    line(ctx, plotLeft, yForValue(0), plotLeft + plotWidth, yForValue(0));
    ctx.strokeStyle = '#79b7ee';
    ctx.fillStyle = '#79b7ee';
    let previous: { x: number; y: number; day: number; segment: string; time: number } | null = null;
    for (let i = first; i < last; i++) {
        const { time, footprint } = options.bars[i];
        const value = footprint?.cumulativeDeltaBtc;
        if (value === null || value === undefined || !footprint) {
            previous = null;
            continue;
        }
        const x = xForTime(time + options.timeframeSeconds / 2);
        const y = yForValue(value);
        const day = Math.floor(time / 86_400);
        if (previous && previous.day === day && previous.segment === footprint.segmentId
            && time - previous.time === options.timeframeSeconds) {
            line(ctx, previous.x, previous.y, x, y);
        } else {
            ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
        }
        previous = { x, y, day, segment: footprint.segmentId, time };
    }
    ctx.restore();
}

function renderStats(
    ctx: CanvasRenderingContext2D,
    layout: FootprintLayout,
    options: FootprintRenderOptions,
    first: number,
    last: number,
) {
    const { plotLeft, plotRight, plotWidth, axisBottom, statsBottom, barWidth, xForTime } = layout;
    if (!options.statsRows.length || statsBottom <= axisBottom) return;
    const rowHeight = (statsBottom - axisBottom) / options.statsRows.length;
    ctx.strokeStyle = GRID;
    for (let i = 0; i < options.statsRows.length; i++) {
        const y = axisBottom + i * rowHeight;
        line(ctx, 0, y, options.width, y);
        if (rowHeight < 11) continue;
        ctx.fillStyle = MUTED;
        ctx.textAlign = 'left';
        ctx.fillText(FOOTPRINT_STAT_LABELS[options.statsRows[i]], plotRight + 5,
            y + rowHeight / 2, Math.max(1, options.width - plotRight - 8));
    }

    clip(ctx, plotLeft, axisBottom, plotWidth, statsBottom - axisBottom);
    if (barWidth >= 9) {
        for (let i = first; i < last; i++) {
            const { time, footprint } = options.bars[i];
            const x = xForTime(time + options.timeframeSeconds / 2);
            line(ctx, x + barWidth / 2, axisBottom, x + barWidth / 2, statsBottom);
            if (rowHeight < 11 || barWidth < 24) continue;
            ctx.textAlign = 'center';
            for (let rowIndex = 0; rowIndex < options.statsRows.length; rowIndex++) {
                const row = options.statsRows[rowIndex];
                const value = footprint ? getFootprintStat(footprint, row) : null;
                const isSigned = row === 'DELTA' || row === 'DELTA_PCT' || row === 'CVD'
                    || row === 'MAX_DELTA' || row === 'MIN_DELTA';
                ctx.fillStyle = value === null ? MUTED : isSigned && value !== 0
                    ? value > 0 ? options.buyColor ?? BUY : options.sellColor ?? SELL
                    : LIGHT;
                ctx.fillText(footprint ? formatFootprintStat(footprint, row) : '—',
                    x, axisBottom + (rowIndex + 0.5) * rowHeight, barWidth - 5);
            }
        }
    }
    ctx.restore();
}

export function renderFootprintWorkspace(canvas: HTMLCanvasElement, options: FootprintRenderOptions) {
    const ctx = setupCanvas(canvas, options.width, options.height);
    const layout = createFootprintLayout(options);
    if (!ctx) return layout;

    const { plotLeft, plotRight, plotWidth, plotBottom, axisBottom, cvdBottom, xForTime, yForPrice, barWidth } = layout;
    const { bars, viewport, timeframeSeconds, selectedTime, width, height, pricePrecision } = options;
    const first = firstBarAtOrAfter(bars, viewport.from - timeframeSeconds);
    const last = firstBarAtOrAfter(bars, viewport.to);
    const timeRange = { from: viewport.from, to: viewport.to };

    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = GRID;
    line(ctx, plotLeft, 0, plotLeft, cvdBottom);
    line(ctx, plotRight, 0, plotRight, cvdBottom);
    line(ctx, 0, plotBottom, width, plotBottom);
    line(ctx, 0, axisBottom, width, axisBottom);

    for (const tick of footprintPriceTicks({ min: viewport.minPrice, max: viewport.maxPrice },
        Math.max(2, Math.floor(plotBottom / 33)), options.tickSize)) {
        const y = yForPrice(tick);
        if (y < 7 || y > plotBottom - 7) continue;
        line(ctx, plotLeft, y, plotRight, y);
        ctx.fillStyle = MUTED;
        ctx.textAlign = 'left';
        ctx.fillText(formatPrice(tick, pricePrecision), plotRight + 5, y, Math.max(1, width - plotRight - 8));
    }

    clip(ctx, plotLeft, 0, plotWidth, cvdBottom);
    if (selectedTime !== null && selectedTime < viewport.to && selectedTime + timeframeSeconds >= viewport.from) {
        ctx.fillStyle = 'rgba(95, 160, 221, 0.15)';
        ctx.fillRect(xForTime(selectedTime), 0, barWidth, cvdBottom);
    }
    ctx.fillStyle = MUTED;
    ctx.textAlign = 'center';
    let lastLabelRight = -Infinity;
    for (const time of footprintTimeTicks(timeRange, Math.max(2, Math.floor(plotWidth / 91)))) {
        const x = xForTime(time);
        line(ctx, x, 0, x, plotBottom + 4);
        const label = formatFootprintTimeTick(time, timeRange);
        const halfLabelWidth = ctx.measureText(label).width / 2;
        const labelX = Math.max(plotLeft + halfLabelWidth + 3, Math.min(plotRight - halfLabelWidth - 3, x));
        if (labelX - halfLabelWidth < lastLabelRight + 5) continue;
        ctx.fillText(label, labelX, plotBottom + 13, plotWidth);
        lastLabelRight = labelX + halfLabelWidth;
    }
    ctx.restore();

    clip(ctx, plotLeft, 0, plotWidth, plotBottom);
    for (let i = first; i < last; i++) {
        const bar = bars[i];
        renderCandle(ctx, layout, options, bar, xForTime(bar.time + timeframeSeconds / 2));
    }
    ctx.restore();

    const currentPrice = bars.at(-1)?.close;
    if (currentPrice !== undefined && currentPrice >= viewport.minPrice && currentPrice <= viewport.maxPrice) {
        const y = Math.max(8, Math.min(plotBottom - 8, yForPrice(currentPrice)));
        ctx.fillStyle = '#20384c';
        ctx.fillRect(plotRight + 1, y - 8, width - plotRight - 1, 16);
        ctx.fillStyle = LIGHT;
        ctx.textAlign = 'left';
        ctx.fillText(formatPrice(currentPrice, pricePrecision), plotRight + 5, y, Math.max(1, width - plotRight - 8));
    }

    renderCvd(ctx, layout, options, first, last);
    renderStats(ctx, layout, options, first, last);
    return layout;
}

export interface FootprintCursorOptions {
    width: number;
    height: number;
    layout: FootprintLayout;
    cursor: { time: number | null; price: number | null } | null;
    levels?: readonly number[];
    pricePrecision?: number;
}

export function renderFootprintCursor(canvas: HTMLCanvasElement, {
    width, height, layout, cursor, levels = [], pricePrecision,
}: FootprintCursorOptions) {
    const ctx = setupCanvas(canvas, width, height);
    if (!ctx) return;
    const { plotLeft, plotRight, plotBottom, cvdBottom, xForTime, yForPrice } = layout;

    ctx.strokeStyle = '#73a6d9';
    ctx.setLineDash([5, 4]);
    for (const price of levels) {
        const y = yForPrice(price);
        if (y >= 0 && y <= plotBottom) line(ctx, plotLeft, y, plotRight, y);
    }
    if (cursor?.time !== null && cursor?.time !== undefined) {
        const x = xForTime(cursor.time);
        if (x >= plotLeft && x <= plotRight) {
            ctx.strokeStyle = '#728597';
            line(ctx, x, 0, x, cvdBottom);
            const label = utcTime.format(cursor.time * 1_000);
            const labelWidth = Math.min(plotRight - plotLeft, ctx.measureText(label).width + 10);
            const left = Math.max(plotLeft, Math.min(plotRight - labelWidth, x - labelWidth / 2));
            ctx.fillStyle = '#25384b';
            ctx.fillRect(left, plotBottom + 4, labelWidth, 18);
            ctx.fillStyle = LIGHT;
            ctx.textAlign = 'center';
            ctx.fillText(label, left + labelWidth / 2, plotBottom + 13, labelWidth - 4);
        }
    }
    if (cursor?.price !== null && cursor?.price !== undefined) {
        const y = yForPrice(cursor.price);
        if (y >= 0 && y <= plotBottom) {
            ctx.strokeStyle = '#728597';
            line(ctx, plotLeft, y, plotRight, y);
            const labelY = Math.max(8, Math.min(plotBottom - 8, y));
            ctx.fillStyle = '#25384b';
            ctx.fillRect(plotRight, labelY - 8, width - plotRight, 16);
            ctx.fillStyle = LIGHT;
            ctx.textAlign = 'left';
            ctx.fillText(formatPrice(cursor.price, pricePrecision), plotRight + 5, labelY, Math.max(1, width - plotRight - 8));
        }
    }
}
