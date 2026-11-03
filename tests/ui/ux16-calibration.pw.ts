import { expect, test } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { buildOracleCapture, oracleScenario } from '../../src/lib/orderflow/true-flow-oracle.test-data';
import { deriveTrueFlowSnapshotV1 } from '../../src/lib/orderflow/true-flow';

test.describe('UX16.8 Replay Calibration and Paper Release Acceptance', () => {
    test('verifies replay calibration badge, paper release status, and zero hindsight mutation across viewports', async ({ page, isMobile }) => {
        test.setTimeout(120_000);

        const scenario = oracleScenario('S01');
        const capture = buildOracleCapture(scenario);
        capture.coverage.dataMode = 'LIVE';
        capture.coverage.source = 'BINANCE_SPOT';
        const snapshot = deriveTrueFlowSnapshotV1(capture, {
            interval: scenario.interval,
            priceBucket: scenario.priceBucket,
            valueAreaFraction: 0.7,
            imbalance: {
                ratioThreshold: 3.0,
                minDominantNotionalUsd: 50_000,
                minDeltaNotionalUsd: 25_000,
                stackedRowCount: 3,
            },
        });

        await page.addInitScript(({ fixture, mobile }) => {
            localStorage.setItem('btc-terminal-ui-v1', JSON.stringify({
                state: {
                    dataMode: 'LIVE',
                    activeWorkspace: 'MARKET STRUCTURE',
                    workspaceMode: 'SETUP',
                    inspectorTab: 'DECISION',
                    inspectorOpen: !mobile,
                },
                version: 1,
            }));
            const NativeWorker = window.Worker;
            class FixtureWorker {
                onmessage: ((event: MessageEvent) => void) | null = null;
                onerror: ((event: ErrorEvent) => void) | null = null;
                postMessage(command: { type?: string }): void {
                    if (command.type !== 'START') return;
                    window.setTimeout(() => {
                        this.onmessage?.(new MessageEvent('message', { data: {
                            type: 'STATUS',
                            connected: true,
                            reconnectAttempt: 0,
                            retainedTradeCount: fixture.totals.tradeCount,
                            lastAggregateTradeId: fixture.totals.tradeCount,
                            coverage: fixture.coverage,
                            stats: { acceptedCount: fixture.totals.tradeCount, duplicateCount: 0, outOfOrderCount: 0, invalidCount: 0, reconnectCount: 0 },
                        } }));
                        this.onmessage?.(new MessageEvent('message', { data: { type: 'TRUE_FLOW_SNAPSHOT', snapshot: fixture } }));
                    }, 10);
                }
                terminate(): void {}
            }
            window.Worker = function WorkerFixture(url: string | URL, options?: WorkerOptions): Worker {
                if (options?.name === 'binance-aggregate-trade-capture') return new FixtureWorker() as unknown as Worker;
                return new NativeWorker(url, options);
            } as unknown as typeof Worker;
        }, { fixture: snapshot, mobile: isMobile });

        await page.route('**/api/orderflow/config', (route) => route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ schemaVersion: 1, enabled: true, dataMode: 'SHADOW', source: 'BINANCE_SPOT', symbol: 'BTCUSDT' }),
        }));

        await page.route('**/api/orderflow/calibration', (route) => route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: { 'Cache-Control': 'no-store' },
            body: JSON.stringify({
                schemaVersion: 1,
                calibration: {
                    schemaVersion: 1,
                    evaluatedAt: new Date().toISOString(),
                    totalFixtures: 12,
                    passedFixtures: 12,
                    reproducibilityRate: 1.0,
                    falsePositiveRatePct: 0.0,
                    architectSignoffStatus: 'APPROVED_FOR_PAPER',
                    gateResults: [],
                },
                paperEvaluation: {
                    schemaVersion: 1,
                    evaluatedAt: new Date().toISOString(),
                    sampleCount: 12,
                    horizons: ['1m', '5m', '15m', '1h'],
                    outcomes: [],
                    hindsightMutationVerified: true,
                },
            }),
        }));

        await page.route('**/api/orderflow/jev', async (route) => {
            const body = JSON.parse(route.request().postData() || '{}');
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                headers: { 'Cache-Control': 'no-store' },
                body: JSON.stringify({
                    schemaVersion: 1,
                    stance: 'AGREE',
                    summary: 'Institutional order flow confirms bullish posture at PW $95,000 Support.',
                    strongestEvidence: ['BULLISH_ABSORPTION'],
                    conflicts: [],
                    confirmationNeeded: ['Reclaim and 1m close above $95,110'],
                    invalidationRestatement: '1m close below $94,870',
                    riskNotes: ['Entry: $94,900', 'Stop: 0.16%'],
                    model: 'jev-v1-shadow',
                    generatedAt: new Date().toISOString(),
                    featurePacketHash: body.featurePacketHash || 'jev-test12345678',
                }),
            });
        });

        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await expect(page.getByRole('button', { name: 'OPTIONS METRICS', exact: true })).toBeVisible({ timeout: 30_000 });
        await page.waitForTimeout(2000);

        // Ensure SETUP mode is active
        if (!isMobile) {
            const setupBtn = page.getByTestId('workspace-mode-setup').first();
            await setupBtn.click();
            await expect(setupBtn).toHaveAttribute('aria-selected', 'true', { timeout: 10_000 });
        } else {
            const optionsBtn = page.getByRole('button', { name: 'OPTIONS METRICS', exact: true });
            await optionsBtn.click();
            const decisionTab = page.getByRole('tab', { name: 'DECISION', exact: true });
            await expect(decisionTab).toBeVisible({ timeout: 15_000 });
            await decisionTab.click();
        }

        const setupContainer = page.getByTestId('setup-mode-container');
        await expect(setupContainer).toBeVisible({ timeout: 15_000 });

        // Verify Decision Dock Calibration Badge
        const dockBadge = page.getByTestId('decision-dock-calibration-badge');
        await expect(dockBadge).toBeVisible();
        await expect(dockBadge).toHaveText('CALIBRATED 12/12');

        // Verify Replay Calibration Section in Setup Mode
        const calContainer = setupContainer.getByTestId('setup-calibration-container');
        await expect(calContainer).toBeVisible();

        const calBadge = calContainer.getByTestId('setup-calibration-badge');
        await expect(calBadge).toBeVisible();
        await expect(calBadge).toHaveText('12/12 PASS (100%)');

        // Verify Paper Release Status and Metrics
        await expect(calContainer.getByText('CALIBRATED · ZERO HINDSIGHT MUTATION')).toBeVisible();
        await expect(calContainer.getByText('100% (Identical Transitions)')).toBeVisible();
        await expect(calContainer.getByText('0.0% (Zero Forbidden Triggers)')).toBeVisible();
        await expect(calContainer.getByText('APPROVED FOR PAPER RELEASE')).toBeVisible();
        await expect(calContainer.getByText('1m · 5m · 15m · 1h (MFE / MAE)')).toBeVisible();

        const artifactDir = path.resolve(process.cwd(), '.artifacts', 'ui-overhaul');
        fs.mkdirSync(artifactDir, { recursive: true });

        const brainDir = 'C:\\Users\\HP\\.gemini\\antigravity\\brain\\d5d35e0e-e87b-4d00-8840-d556b6990df3';

        if (!isMobile) {
            // Desktop 1920x1080
            await page.setViewportSize({ width: 1920, height: 1080 });
            await page.waitForTimeout(500);
            const desktopNoOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
            expect(desktopNoOverflow).toBe(true);
            const desktopPath = path.join(artifactDir, 'ux16-8-calibration-desktop-1920x1080.png');
            await page.screenshot({ path: desktopPath, fullPage: false });
            if (fs.existsSync(brainDir)) {
                fs.copyFileSync(desktopPath, path.join(brainDir, 'ux16-8-calibration-desktop-1920x1080.png'));
            }

            // Compact 1664x936
            await page.setViewportSize({ width: 1664, height: 936 });
            await page.waitForTimeout(500);
            const compactNoOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
            expect(compactNoOverflow).toBe(true);
            const compactPath = path.join(artifactDir, 'ux16-8-calibration-compact-1664x936.png');
            await page.screenshot({ path: compactPath, fullPage: false });
            if (fs.existsSync(brainDir)) {
                fs.copyFileSync(compactPath, path.join(brainDir, 'ux16-8-calibration-compact-1664x936.png'));
            }

            // Laptop 1366x768
            await page.setViewportSize({ width: 1366, height: 768 });
            await page.waitForTimeout(500);
            const laptopNoOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
            expect(laptopNoOverflow).toBe(true);
            const laptopPath = path.join(artifactDir, 'ux16-8-calibration-laptop-1366x768.png');
            await page.screenshot({ path: laptopPath, fullPage: false });
            if (fs.existsSync(brainDir)) {
                fs.copyFileSync(laptopPath, path.join(brainDir, 'ux16-8-calibration-laptop-1366x768.png'));
            }
        } else {
            // Mobile 390x844
            await page.setViewportSize({ width: 390, height: 844 });
            await page.waitForTimeout(500);
            const mobilePath = path.join(artifactDir, 'ux16-8-calibration-mobile-390x844.png');
            await page.screenshot({ path: mobilePath, fullPage: false });
            if (fs.existsSync(brainDir)) {
                fs.copyFileSync(mobilePath, path.join(brainDir, 'ux16-8-calibration-mobile-390x844.png'));
            }
        }
    });
});
