import { describe, expect, it } from 'vitest';
import { TradeJournalEngine, type TradeRecord } from './trade-journal-engine';

describe('TradeJournalEngine (UX19.5)', () => {
    it('records trade entries and exits with correct PnL and R-multiple', () => {
        const journal = new TradeJournalEngine([]);
        // Trade 1: Long 1.0 BTC @ 78,000, SL @ 77,000, TP @ 80,000 (risk = $1,000)
        const entry = journal.recordEntry({
            side: 'LONG',
            entryTime: 1700000000000,
            quantity: 1.0,
            entryPrice: 78000,
            stopLossPrice: 77000,
            takeProfitPrice: 80000,
            setupGrade: 'AAA',
            notes: 'AVWAP bounce confluence with daily VP POC',
        });

        expect(entry.status).toBe('OPEN');
        expect(entry.tradeNumber).toBe(1);

        // Exit at 80,000 (+2.0R, +$2,000 gross)
        const exit = journal.recordExit(entry.id, {
            exitTime: 1700003600000,
            exitPrice: 80000,
            exitQuantity: 1.0,
            reason: 'TAKE_PROFIT',
        });

        expect(exit?.status).toBe('TAKE_PROFIT');
        expect(exit?.realizedPnl).toBe(2000);
        expect(exit?.rMultiple).toBe(2.0);
        expect(exit?.netPnl).toBeGreaterThan(1900); // minus fees
    });

    it('computes accurate performance metrics across multiple trades', () => {
        const initialTrades: TradeRecord[] = [
            {
                id: 't1',
                tradeNumber: 1,
                symbol: 'BTCUSDT',
                side: 'LONG',
                status: 'TAKE_PROFIT',
                entryTime: 1700000000000,
                exitTime: 1700003600000,
                quantity: 1.0,
                entryPrice: 78000,
                exitPrice: 80000,
                stopLossPrice: 77000,
                realizedPnl: 2000,
                returnPercent: 2.56,
                rMultiple: 2.0,
                feesPaid: 50,
                netPnl: 1950,
                setupGrade: 'AAA',
                notes: '',
            },
            {
                id: 't2',
                tradeNumber: 2,
                symbol: 'BTCUSDT',
                side: 'SHORT',
                status: 'STOPPED_OUT',
                entryTime: 1700010000000,
                exitTime: 1700012000000,
                quantity: 0.5,
                entryPrice: 80000,
                exitPrice: 81000,
                stopLossPrice: 81000,
                realizedPnl: -500,
                returnPercent: -1.25,
                rMultiple: -1.0,
                feesPaid: 25,
                netPnl: -525,
                setupGrade: 'AA',
                notes: '',
            },
        ];

        const journal = new TradeJournalEngine(initialTrades);
        const metrics = journal.calculateMetrics();

        expect(metrics.totalTrades).toBe(2);
        expect(metrics.closedTrades).toBe(2);
        expect(metrics.winningTrades).toBe(1);
        expect(metrics.losingTrades).toBe(1);
        expect(metrics.winRatePercent).toBe(50.0);
        expect(metrics.grossProfit).toBe(1950);
        expect(metrics.grossLoss).toBe(525);
        expect(metrics.profitFactor).toBeCloseTo(3.71, 1);
        expect(metrics.netRealizedPnl).toBe(1425);
        expect(metrics.averageRMultiple).toBe(0.5); // (2.0 + (-1.0)) / 2
    });

    it('exports RFC 4180 compliant CSV', () => {
        const journal = new TradeJournalEngine([]);
        journal.recordEntry({
            side: 'LONG',
            entryTime: 1700000000000,
            quantity: 1.0,
            entryPrice: 78000,
            stopLossPrice: 77000,
            setupGrade: 'A',
            notes: 'Test trade with "quoted" notes',
        });

        const csv = journal.exportToCsv();
        expect(csv).toContain('Trade #,ID,Symbol,Side,Status');
        expect(csv).toContain('BTCUSDT,LONG,OPEN');
        expect(csv).toContain('78000.00');
        expect(csv).toContain('Test trade with ""quoted"" notes');
    });
});
