import { expect, test } from '@playwright/test';
import * as path from 'path';
import { buildOracleCapture, oracleScenario } from '../../src/lib/orderflow/true-flow-oracle.test-data';
import { deriveTrueFlowSnapshotV1 } from '../../src/lib/orderflow/true-flow';

test.describe('UX16.7 Jev Shadow Explanation Acceptance', () => {
    test('verifies Jev shadow explanation, stance badge, and audit provenance across viewports', async ({ page, isMobile }) => {
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

        // Mock /api/orderflow/jev to provide a verified deterministic Jev shadow response
        await page.route('**/api/orderflow/jev', async (route) => {
            const body = JSON.parse(route.request().postData() || '{}');
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                headers: { 'Cache-Control': 'no-store' },
                body: JSON.stringify({
                    schemaVersion: 1,
                    stance: 'AGREE',
                    summary: 'Institutional order flow confirms bullish posture at PW $95,000 Support. All 7 mandatory gates pass with aligned microstructure.',
                    strongestEvidence: [
                        'BULLISH_ABSORPTION (HIGH confidence at $94,950-$95,050)',
                        'STACKED_BUY_IMBALANCE (HIGH confidence)',
                    ],
                    conflicts: [],
                    confirmationNeeded: ['Reclaim and 1m close above $95,110 with positive delta'],
                    invalidationRestatement: '1m close below structural zone floor ($94,870)',
                    riskNotes: ['Entry reference: $94,900', 'Structural stop: 0.16% displacement'],
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
        const setupBtn = page.getByTestId('workspace-mode-setup').first();
        await setupBtn.click();
        await expect(setupBtn).toHaveAttribute('aria-selected', 'true');
        if (isMobile) {
            await page.getByRole('button', { name: 'OPTIONS METRICS', exact: true }).click();
            const decisionTab = page.getByRole('tab', { name: 'DECISION', exact: true });
            await expect(decisionTab).toBeVisible({ timeout: 15_000 });
            await decisionTab.click();
        }

        const setupContainer = page.getByTestId('setup-mode-container');
        await expect(setupContainer).toBeVisible({ timeout: 15_000 });

        // Expand Jev Shadow Explanation
        const jevContainer = setupContainer.getByTestId('setup-jev-shadow-container');
        await expect(jevContainer).toBeVisible();

        const toggleBtn = jevContainer.getByTestId('setup-jev-toggle-button');
        await toggleBtn.click();

        // Verify Jev body is visible
        const jevBody = jevContainer.getByTestId('setup-jev-body');
        await expect(jevBody).toBeVisible();

        // Verify Stance Badge
        const stanceBadge = jevContainer.getByTestId('setup-jev-stance-badge');
        await expect(stanceBadge).toBeVisible();
        await expect(stanceBadge).toHaveText('AGREE');

        // Verify Summary
        const summary = jevBody.getByTestId('setup-jev-summary');
        await expect(summary).toBeVisible();
        await expect(summary).toContainText('Institutional order flow confirms bullish posture');

        // Verify non-negotiable disclaimer
        await expect(jevBody.getByText('Bounded AI explanation only. Jev cannot alter deterministic states')).toBeVisible();

        const artifactDir = path.resolve(process.cwd(), '.artifacts', 'ui-overhaul');

        if (!isMobile) {
            // Desktop 1920x1080
            await page.setViewportSize({ width: 1920, height: 1080 });
            await page.waitForTimeout(500);
            const desktopNoOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
            expect(desktopNoOverflow).toBe(true);
            await page.screenshot({ path: path.join(artifactDir, 'ux16-7-jev-desktop-1920x1080.png'), fullPage: false });

            // Compact 1664x936
            await page.setViewportSize({ width: 1664, height: 936 });
            await page.waitForTimeout(500);
            const compactNoOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
            expect(compactNoOverflow).toBe(true);
            await page.screenshot({ path: path.join(artifactDir, 'ux16-7-jev-compact-1664x936.png'), fullPage: false });

            // Laptop 1366x768
            await page.setViewportSize({ width: 1366, height: 768 });
            await page.waitForTimeout(500);
            const laptopNoOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
            expect(laptopNoOverflow).toBe(true);
            await page.screenshot({ path: path.join(artifactDir, 'ux16-7-jev-laptop-1366x768.png'), fullPage: false });
        } else {
            // Mobile 390x844
            await page.setViewportSize({ width: 390, height: 844 });
            await page.waitForTimeout(500);
            await page.screenshot({ path: path.join(artifactDir, 'ux16-7-jev-mobile-390x844.png'), fullPage: false });
        }
    });
});
