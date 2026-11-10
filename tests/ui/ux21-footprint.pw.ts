import { expect, test, type Locator, type Page } from '@playwright/test';
import type { BinanceInterval, BinanceMarketBar } from '../../src/lib/binance/types';
import { buildOracleCapture, oracleScenario, ORACLE_BASE_TIME } from '../../src/lib/orderflow/true-flow-oracle.test-data';
import { deriveTrueFlowSnapshotV1 } from '../../src/lib/orderflow/true-flow';
import type { TrueFlowInterval, TrueFlowSnapshotV1 } from '../../src/lib/orderflow/true-flow-contracts';

const HOUR = 3_600;
const SOURCE_SECONDS: Record<BinanceInterval, number> = {
    '1m': 60, '5m': 300, '15m': 900, '30m': 1_800, '1h': HOUR, '4h': 4 * HOUR, '1d': 24 * HOUR,
};
const BASE = ORACLE_BASE_TIME / 1_000;
const HOURS = 64;
const FIXTURE_NOW = (BASE + (HOURS - 1) * HOUR + 1_800) * 1_000;
const FIXTURE_PRICE = 75_000;

function marketCandles(interval: BinanceInterval): BinanceMarketBar[] {
    const step = SOURCE_SECONDS[interval];
    const latest = Math.floor(FIXTURE_NOW / 1_000 / step) * step;
    return Array.from({ length: 512 }, (_, index) => {
        const time = latest - (511 - index) * step;
        return {
            time, closeTime: (time + step) * 1_000 - 1,
            open: FIXTURE_PRICE + 20, high: FIXTURE_PRICE + 450, low: FIXTURE_PRICE - 20, close: FIXTURE_PRICE + 330,
            volume: 4, quoteVolume: 300_000, trades: 250, takerBuyVolume: 3, takerSellVolume: 1, delta: 2,
        };
    });
}

/** Large deterministic tape. Every hour has 30 price levels and 240 observed aggregates. */
type FixtureSnapshots = Record<'1h' | '4h', TrueFlowSnapshotV1>;

function buildSnapshots(): { initial: FixtureSnapshots; updated: FixtureSnapshots } {
    const fixture = oracleScenario('S01');
    const trades = Array.from({ length: HOURS * 240 }, (_, index) => {
        const hour = Math.floor(index / 240);
        const print = index % 240;
        return [
            index + 1,
            hour * HOUR + 1 + print * 2,
            FIXTURE_PRICE + (print % 30) * 10,
            print % 2 === 0 ? 0.015625 : 0.0078125,
            print % 2 === 0 ? 'BUY' : 'SELL',
        ] as const;
    });
    const derive = (input: typeof fixture.trades): FixtureSnapshots => {
        const capture = buildOracleCapture({ ...fixture, trades: input });
        capture.coverage.dataMode = 'LIVE';
        capture.coverage.source = 'BINANCE_SPOT';
        const snapshot = (interval: TrueFlowInterval) => deriveTrueFlowSnapshotV1(capture, {
            interval, priceBucket: 10, valueAreaFraction: 0.7,
        });
        return { '1h': snapshot('1h'), '4h': snapshot('4h') };
    };
    const update = [trades.length + 1, (HOURS - 1) * HOUR + 1_799, FIXTURE_PRICE, 0.125, 'BUY'] as const;
    return { initial: derive(trades), updated: derive([...trades, update]) };
}

async function seedTerminal(page: Page, mode: 'LIVE' | 'DEMO', snapshots?: ReturnType<typeof buildSnapshots>) {
    await page.clock.setFixedTime(FIXTURE_NOW);
    await page.addInitScript(({ mode, snapshots }) => {
        const storageKey = 'btc-terminal-ui-v1';
        if (!localStorage.getItem(storageKey)) {
            localStorage.setItem(storageKey, JSON.stringify({
                state: { dataMode: mode, activeWorkspace: 'MARKET STRUCTURE', inspectorOpen: false, studyPaneOpen: false },
                version: 1,
            }));
        }
        if (!snapshots) return;

        const NativeWorker = window.Worker;
        class TradeFixtureWorker {
            onmessage: ((event: MessageEvent) => void) | null = null;
            private main: string | undefined;
            private footprint: string | null | undefined;
            private batch: 'initial' | 'updated' = 'initial';

            private readonly pushTrade = () => {
                this.batch = 'updated';
                this.publish();
            };

            constructor() {
                window.addEventListener('ux21-fixture-trade', this.pushTrade);
            }

            postMessage(command: { type: string; config?: { trueFlowInterval: string }; main?: string; footprint?: string | null; footprintInterval?: string | null }): void {
                if (command.type === 'START') {
                    this.main = command.config?.trueFlowInterval;
                    this.footprint = command.footprintInterval;
                } else if (command.type === 'SET_INTERVALS') {
                    this.main = command.main;
                    this.footprint = command.footprint;
                } else return;
                this.publish();
            }

            private publish(): void {
                const active = snapshots?.[this.batch];
                for (const [interval, type] of [[this.main, 'TRUE_FLOW_SNAPSHOT'], [this.footprint, 'FOOTPRINT_SNAPSHOT']] as const) {
                    if (interval !== '1h' && interval !== '4h') continue;
                    const snapshot = active?.[interval];
                    if (!snapshot) continue;
                    queueMicrotask(() => this.onmessage?.(new MessageEvent('message', { data: { type, snapshot } })));
                }
            }

            terminate(): void {
                window.removeEventListener('ux21-fixture-trade', this.pushTrade);
            }
        }
        window.Worker = function FixtureWorker(url: string | URL, options?: WorkerOptions): Worker {
            if (options?.name === 'binance-aggregate-trade-capture') return new TradeFixtureWorker() as unknown as Worker;
            return new NativeWorker(url, options);
        } as unknown as typeof Worker;
    }, { mode, snapshots });

    if (mode === 'LIVE') {
        await page.route('**/api/orderflow/config', (route) => route.fulfill({
            json: { schemaVersion: 1, enabled: true, dataMode: 'SHADOW', source: 'BINANCE_SPOT', symbol: 'BTCUSDT' },
        }));
        await page.route(/\/api\/binance\/(market|history)\?/, (route) => {
            const url = new URL(route.request().url());
            const requested = url.searchParams.get('interval') ?? '1h';
            const interval = Object.hasOwn(SOURCE_SECONDS, requested) ? requested as BinanceInterval : '1h';
            return route.fulfill({
                json: {
                    schemaVersion: 1, dataMode: 'LIVE', source: 'BINANCE_SPOT', symbol: 'BTCUSDT', interval,
                    timestamp: new Date(FIXTURE_NOW).toISOString(), upstreamLatencyMs: 1,
                    candles: marketCandles(interval), nextEndTime: null, ticker: null, book: null,
                },
            });
        });
    }
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('footprint-chart-surface')).toBeVisible({ timeout: 30_000 });
}

interface CanvasText { text: string; x: number; y: number }
interface CanvasSegment { x1: number; y1: number; x2: number; y2: number }
interface CanvasTrace { text: CanvasText[]; segments: CanvasSegment[] }
type TraceWindow = Window & { ux21CanvasTrace?: WeakMap<HTMLCanvasElement, CanvasTrace> };

async function recordCanvasCommands(page: Page) {
    await page.addInitScript(() => {
        const traces = new WeakMap<HTMLCanvasElement, CanvasTrace>();
        const paths = new WeakMap<CanvasRenderingContext2D, Array<[number, number]>>();
        const prototype = CanvasRenderingContext2D.prototype;
        const { clearRect, fillText, beginPath, moveTo, lineTo, stroke } = prototype;
        prototype.clearRect = function (x, y, width, height) {
            if (this.canvas.parentElement?.dataset.testid === 'footprint-chart-surface') {
                traces.set(this.canvas, { text: [], segments: [] });
            }
            return clearRect.call(this, x, y, width, height);
        };
        prototype.fillText = function (text, x, y, maxWidth) {
            traces.get(this.canvas)?.text.push({ text, x, y });
            return maxWidth === undefined ? fillText.call(this, text, x, y) : fillText.call(this, text, x, y, maxWidth);
        };
        prototype.beginPath = function () {
            if (traces.has(this.canvas)) paths.set(this, []);
            return beginPath.call(this);
        };
        prototype.moveTo = function (x, y) {
            paths.get(this)?.push([x, y]);
            return moveTo.call(this, x, y);
        };
        prototype.lineTo = function (x, y) {
            paths.get(this)?.push([x, y]);
            return lineTo.call(this, x, y);
        };
        prototype.stroke = function (path?: Path2D) {
            const points = paths.get(this);
            if (!path && points?.length === 2) {
                const [[x1, y1], [x2, y2]] = points;
                traces.get(this.canvas)?.segments.push({ x1, y1, x2, y2 });
            }
            return Reflect.apply(stroke, this, path ? [path] : []);
        };
        (window as TraceWindow).ux21CanvasTrace = traces;
    });
}

function readCanvasTrace(surface: Locator): Promise<CanvasTrace | null> {
    return surface.locator('canvas').first().evaluate((canvas) =>
        (window as TraceWindow).ux21CanvasTrace?.get(canvas as HTMLCanvasElement) ?? null);
}

async function assertCandleStats(surface: Locator, askText: string, bidText: string, deltaText: string, volumeText: string, tradeCountText: string) {
    await expect.poll(async () => {
        const trace = await readCanvasTrace(surface);
        const askLabel = trace?.text.find((item) => item.text === 'Ask volume (BTC)');
        if (!trace || !askLabel) return false;
        const column = trace.text.find((item) => item.x !== askLabel.x && item.y === askLabel.y && item.text === askText);
        if (!column) return false;
        const labels = [
            ['Bid volume (BTC)', bidText],
            ['Delta (BTC)', deltaText],
            ['Total volume (BTC)', volumeText],
            ['Executed trades', tradeCountText],
        ];
        return labels.every(([label, expected]) => {
            const row = trace.text.find((item) => item.text === label);
            return row && trace.text.some((item) => item.x === column.x && item.y === row.y && item.text === expected);
        }) && trace.segments.some(({ x1, x2, y1, y2 }) =>
            x1 === x2 && Math.abs(x1 - column.x) < 0.01 && y1 > 0 && y2 > y1 && y2 < askLabel.y);
    }).toBe(true);
}

async function readAxis(surface: Locator) {
    const attributes = await surface.evaluate((node) => {
        return ['time-from', 'time-to', 'price-min', 'price-max'].map((key) => node.getAttribute(`data-${key}`));
    });
    if (attributes.some((value) => value === null)) throw new Error('Footprint viewport attributes missing');
    const [from, to, low, high] = attributes.map(Number);
    expect(to).toBeGreaterThan(from);
    expect(high).toBeGreaterThan(low);
    return { from, to, low, high };
}

test.describe('UX21 Footprint workspace', () => {
    test.setTimeout(90_000);

    test('zooms, pans, inspects truthful OHLC-only bars, and restores preferences', async ({ page, isMobile }) => {
        if (!isMobile) await recordCanvasCommands(page);
        await seedTerminal(page, 'DEMO');
        const surface = page.getByTestId('footprint-chart-surface');
        const pane = page.getByTestId('left-footprint-execution-pane');
        await expect(pane.getByText(/No captured trades/i)).toBeVisible();
        await expect(surface).toHaveAttribute('data-trade-candles', '0');

        const link = pane.getByTestId('exec-sync-toggle');
        if (await link.getAttribute('aria-pressed') === 'true') await link.click();
        await expect(link).toHaveAttribute('aria-pressed', 'false');
        if (!isMobile) {
            const readTimeLabels = async () => (await readCanvasTrace(surface))?.text
                .filter(({ text }) => /^\d{2}[:\-]\d{2}$/.test(text)).map(({ text }) => text) ?? [];
            await expect.poll(async () => (await readTimeLabels()).length).toBeGreaterThan(0);
            const initialLabels = await readTimeLabels();
            await surface.press('Home');
            await expect.poll(readTimeLabels).not.toEqual(initialLabels);
            await surface.press('End');
        }
        const before = await readAxis(surface);
        await pane.getByTestId('exec-zoom-in').click();
        const zoomed = await readAxis(surface);
        expect(zoomed.to - zoomed.from).toBeLessThan(before.to - before.from);
        const box = await surface.boundingBox();
        if (!box) throw new Error('Footprint surface missing');

        // Drag right to move into the past while detached from the candlestick chart.
        const midX = box.x + box.width * 0.48;
        const plotY = box.y + Math.min(64, box.height * 0.16);
        await page.mouse.move(midX, plotY);
        await page.mouse.down();
        await page.mouse.move(midX + box.width * 0.18, plotY, { steps: 8 });
        await page.mouse.up();
        expect((await readAxis(surface)).to).toBeLessThan(zoomed.to);

        // Price-axis wheel scales only the vertical range.
        const beforePrice = await readAxis(surface);
        await page.mouse.move(box.x + box.width - 10, plotY);
        await page.mouse.wheel(0, -250);
        await expect.poll(async () => (await readAxis(surface)).high - (await readAxis(surface)).low)
            .toBeLessThan(beforePrice.high - beforePrice.low);
        expect((await readAxis(surface)).from).toBe(beforePrice.from);

        await page.mouse.click(midX, plotY);
        await expect(page.getByTestId('footprint-candle-inspector')).toBeVisible();
        await expect(page.getByTestId('footprint-candle-inspector')).toContainText(/unavailable|No captured/i);
        await page.getByTestId('footprint-candle-inspector').getByRole('button', { name: 'Close', exact: true }).click();
        await pane.getByTestId('exec-mode').selectOption('DELTA_PROFILE');
        await pane.getByTestId('exec-timeframe').selectOption('4h');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(pane.getByTestId('exec-mode')).toHaveValue('DELTA_PROFILE');
        await expect(pane.getByTestId('exec-timeframe')).toHaveValue('4h');

        if (!isMobile) {
            const divider = page.getByTestId('left-execution-pane-resizer');
            const resize = await divider.boundingBox();
            const initialWidth = (await surface.boundingBox())?.width ?? 0;
            if (!resize) throw new Error('Footprint divider missing');
            await page.mouse.move(resize.x + resize.width / 2, resize.y + 36);
            await page.mouse.down();
            await page.mouse.move(resize.x + 55, resize.y + 36, { steps: 8 });
            await page.mouse.up();
            expect((await surface.boundingBox())?.width).toBeGreaterThan(initialWidth);
        } else {
            expect(await page.evaluate(() => document.documentElement.scrollWidth))
                .toBeLessThanOrEqual(await page.evaluate(() => document.documentElement.clientWidth) + 2);
        }
    });

    test('replays recorded prints without advancing candle statistics past the cursor', async ({ page, isMobile }) => {
        test.skip(isMobile, 'The recorded tape controls and inspector are verified in the desktop workspace.');
        await seedTerminal(page, 'DEMO');
        await page.getByRole('button', { name: 'Tips', exact: true }).click();
        await page.getByRole('dialog', { name: 'Terminal Tips' }).getByRole('button', { name: /Historical Preview/ }).click();
        const file = page.getByLabel('Load BTCUSDT Spot tape', { exact: true });
        await file.setInputFiles({
            name: 'ux21-oracle-tape.json',
            mimeType: 'application/json',
            buffer: Buffer.from(JSON.stringify(buildOracleCapture(oracleScenario('S01')))),
        });
        const position = page.getByRole('slider', { name: 'Replay event position' });
        const next = page.getByRole('button', { name: 'Next print', exact: true });
        const previous = page.getByRole('button', { name: 'Previous print', exact: true });
        const surface = page.getByTestId('footprint-chart-surface');
        await expect(position).toHaveValue('0');

        const inspectAt = async (offset: number, ask: string, bid: string, total: string) => {
            await expect(page.getByText(`Recorded tape · ${new Date(ORACLE_BASE_TIME + offset * 1_000).toISOString()}`)).toBeVisible();
            await expect(surface).toHaveAttribute('data-trade-candles', '1');
            await surface.press('Enter');
            const inspector = page.getByTestId('footprint-candle-inspector');
            const metric = (name: string) => inspector.getByText(name, { exact: true }).locator('..').locator('dd');
            await expect(metric('Ask volume (BTC)')).toHaveText(ask);
            await expect(metric('Bid volume (BTC)')).toHaveText(bid);
            await expect(metric('Total volume (BTC)')).toHaveText(total);
            await inspector.getByRole('button', { name: 'Close', exact: true }).click();
        };
        await inspectAt(5, '1', '0', '1');
        await next.click();
        await expect(position).toHaveValue('1');
        await inspectAt(15, '1', '2', '3');
        await previous.click();
        await inspectAt(5, '1', '0', '1');
    });

    test('renders captured H1 and H4 ladders and records interaction latency', async ({ page, isMobile }, testInfo) => {
        test.skip(isMobile, 'The dense ladder comparison uses the full desktop chart width.');
        await recordCanvasCommands(page);
        await seedTerminal(page, 'LIVE', buildSnapshots());
        const pane = page.getByTestId('left-footprint-execution-pane');
        const surface = page.getByTestId('footprint-chart-surface');
        await expect(surface).toHaveAttribute('data-trade-candles', /^[1-9]\d*$/);
        await expect(surface).toHaveAttribute('data-stats-rows', '10');

        const link = pane.getByTestId('exec-sync-toggle');
        if (await link.getAttribute('aria-pressed') === 'true') await link.click();
        for (let index = 0; index < 3; index += 1) await pane.getByTestId('exec-zoom-in').click();
        // Each H1 interval has 120 buys of 1/64 BTC and 120 sells of 1/128 BTC.
        await assertCandleStats(surface, '1.88', '0.9375', '0.9375', '2.81', '240');
        await testInfo.attach('UX21 H1 captured fixture', { body: await pane.screenshot(), contentType: 'image/png' });

        const h1 = await readAxis(surface);
        await pane.getByTestId('exec-timeframe').selectOption('4h');
        await expect.poll(async () => (await readAxis(surface)).to - (await readAxis(surface)).from)
            .toBeGreaterThan(h1.to - h1.from);
        await expect(surface).toHaveAttribute('data-trade-candles', /^[1-9]\d*$/);
        for (let index = 0; index < 3; index += 1) await pane.getByTestId('exec-zoom-in').click();
        // Four adjacent H1 trade streams collapse into one H4 column without lost volume.
        await assertCandleStats(surface, '7.5', '3.75', '3.75', '11.25', '960');
        await testInfo.attach('UX21 H4 captured fixture', { body: await pane.screenshot(), contentType: 'image/png' });

        await surface.press('End');
        await surface.press('Enter');
        const inspector = page.getByTestId('footprint-candle-inspector');
        const metric = (name: string) => inspector.getByText(name, { exact: true }).locator('..').locator('dd');
        await expect(metric('Ask volume (BTC)')).toHaveText('7.5');
        await expect(metric('Executed trades')).toHaveText('960');
        await page.evaluate(() => window.dispatchEvent(new Event('ux21-fixture-trade')));
        await expect(metric('Ask volume (BTC)')).toHaveText('7.63');
        await expect(metric('Executed trades')).toHaveText('961');
        await inspector.getByRole('button', { name: 'Close', exact: true }).click();

        const settings = pane.getByRole('button', { name: 'Settings', exact: true });
        await settings.click();
        await pane.getByText('Delta statistics and CVD', { exact: true }).click();
        await pane.getByLabel('Captured CVD', { exact: true }).check();
        await settings.click();
        await expect.poll(async () => {
            const trace = await readCanvasTrace(surface);
            const cvd = trace?.text.find((item) => item.text === 'CVD · BTC');
            const stats = trace?.text.find((item) => item.text === 'Ask volume (BTC)');
            if (!trace || !cvd || !stats) return false;
            const candleCenters = new Set(trace.segments
                .filter(({ x1, x2, y1, y2 }) => x1 === x2 && y1 > 0 && y2 > y1 && y2 < cvd.y - 11)
                .map(({ x1 }) => x1));
            return trace.segments.some(({ x1, x2, y1, y2 }) =>
                x1 < x2 && y1 >= cvd.y - 11 && y2 >= cvd.y - 11 && y1 < stats.y && y2 < stats.y
                && candleCenters.has(x1) && candleCenters.has(x2));
        }).toBe(true);

        await link.click();
        await expect(link).toHaveAttribute('aria-pressed', 'true');
        await expect.poll(async () => (await readAxis(surface)).to - (await readAxis(surface)).from)
            .toBeGreaterThan(40 * HOUR);
        const linked = await readAxis(surface);
        const plot = await surface.boundingBox();
        if (!plot) throw new Error('Linked Footprint surface missing');
        const targetH4 = Math.floor((linked.from + (linked.to - linked.from) * 0.58) / (4 * HOUR)) * 4 * HOUR;
        const targetH1 = targetH4 + 2 * HOUR;
        const plotWidth = plot.width - Math.min(122, plot.width * 0.28);
        await page.mouse.move(plot.x + (targetH1 - linked.from) / (linked.to - linked.from) * plotWidth, plot.y + 55);
        await expect(page.getByRole('group', { name: /Live BTC price chart/i }))
            .toHaveAttribute('data-crosshair-time', String(targetH1));
        await link.click();
        await expect(link).toHaveAttribute('aria-pressed', 'false');
        await surface.press('End');

        const latency = await surface.evaluate(async (node) => {
            const bounds = node.getBoundingClientRect();
            const frames: number[] = [];
            const pointerToFrame: number[] = [];
            let previous: number | undefined;
            for (let index = 0; index < 90; index += 1) {
                const start = performance.now();
                node.dispatchEvent(new PointerEvent('pointermove', {
                    bubbles: true, pointerType: 'mouse',
                    clientX: bounds.left + bounds.width * (0.32 + (index % 22) / 100),
                    clientY: bounds.top + Math.min(55, bounds.height * 0.16),
                }));
                const frame = await new Promise<number>((resolve) => requestAnimationFrame(resolve));
                pointerToFrame.push(performance.now() - start);
                if (previous !== undefined) frames.push(frame - previous);
                previous = frame;
            }
            const p95 = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length * 0.95)];
            return { samples: frames.length, frameIntervalP95Ms: p95(frames), pointerToRafP95Ms: p95(pointerToFrame) };
        });
        expect(latency.samples).toBe(89);
        expect(Number.isFinite(latency.frameIntervalP95Ms)).toBe(true);
        await testInfo.attach('UX21 pointer performance', {
            body: Buffer.from(JSON.stringify(latency, null, 2)), contentType: 'application/json',
        });
    });
});
