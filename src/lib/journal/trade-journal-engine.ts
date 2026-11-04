/**
 * Automated Trade Journaling Engine (UX19.5)
 *
 * Automatically records executed trades from the simulated execution engine and manual drawing positions.
 * Aggregates performance statistics (Win Rate, Profit Factor, Average R-Multiple, Net P&L).
 * Provides clean CSV export for institutional record-keeping.
 */

export interface TradeRecord {
    id: string;
    tradeNumber: number;
    symbol: string;
    side: 'LONG' | 'SHORT';
    status: 'OPEN' | 'CLOSED' | 'STOPPED_OUT' | 'TAKE_PROFIT';
    entryTime: number; // Unix timestamp in ms
    exitTime?: number;
    quantity: number; // BTC
    entryPrice: number;
    exitPrice?: number;
    stopLossPrice?: number;
    takeProfitPrice?: number;
    realizedPnl: number;
    returnPercent: number;
    rMultiple: number;
    feesPaid: number;
    netPnl: number;
    setupGrade: 'A' | 'AA' | 'AAA' | 'UNCATEGORIZED';
    notes: string;
}

export interface JournalPerformanceMetrics {
    totalTrades: number;
    closedTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRatePercent: number;
    grossProfit: number;
    grossLoss: number;
    profitFactor: number;
    netRealizedPnl: number;
    totalFees: number;
    averageRMultiple: number;
    largestWin: number;
    largestLoss: number;
}

export const JOURNAL_STORAGE_KEY = 'btc-terminal-trade-journal-v1';

export class TradeJournalEngine {
    private trades: TradeRecord[] = [];

    constructor(initialTrades?: TradeRecord[]) {
        if (initialTrades && initialTrades.length > 0) {
            this.trades = [...initialTrades];
        } else {
            this.trades = this.loadFromStorage();
        }
    }

    public getTrades(): ReadonlyArray<TradeRecord> {
        return this.trades;
    }

    public getTrade(id: string): TradeRecord | undefined {
        return this.trades.find((t) => t.id === id);
    }

    /**
     * Record a new trade entry.
     */
    public recordEntry(params: {
        symbol?: string;
        side: 'LONG' | 'SHORT';
        entryTime: number;
        quantity: number;
        entryPrice: number;
        stopLossPrice?: number;
        takeProfitPrice?: number;
        setupGrade?: 'A' | 'AA' | 'AAA' | 'UNCATEGORIZED';
        notes?: string;
    }): TradeRecord {
        const id = `trd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const tradeNumber = this.trades.length + 1;

        const record: TradeRecord = {
            id,
            tradeNumber,
            symbol: params.symbol || 'BTCUSDT',
            side: params.side,
            status: 'OPEN',
            entryTime: params.entryTime,
            quantity: params.quantity,
            entryPrice: params.entryPrice,
            stopLossPrice: params.stopLossPrice,
            takeProfitPrice: params.takeProfitPrice,
            realizedPnl: 0,
            returnPercent: 0,
            rMultiple: 0,
            feesPaid: params.entryPrice * params.quantity * 0.0005, // initial taker fee
            netPnl: -(params.entryPrice * params.quantity * 0.0005),
            setupGrade: params.setupGrade || 'UNCATEGORIZED',
            notes: params.notes || '',
        };

        this.trades.unshift(record); // newest first
        this.saveToStorage();
        return record;
    }

    /**
     * Record a trade exit or partial close.
     */
    public recordExit(
        tradeId: string,
        params: {
            exitTime: number;
            exitPrice: number;
            exitQuantity: number;
            reason: 'STOP_LOSS' | 'TAKE_PROFIT' | 'MANUAL_CLOSE';
            exitFee?: number;
            notes?: string;
        }
    ): TradeRecord | undefined {
        const trade = this.trades.find((t) => t.id === tradeId);
        if (!trade) return undefined;

        const qty = Math.min(trade.quantity, params.exitQuantity);
        const priceDiff =
            trade.side === 'LONG'
                ? params.exitPrice - trade.entryPrice
                : trade.entryPrice - params.exitPrice;

        const grossPnl = priceDiff * qty;
        const exitFee = params.exitFee ?? params.exitPrice * qty * 0.0002; // maker or taker fee

        trade.exitTime = params.exitTime;
        trade.exitPrice = params.exitPrice;
        trade.realizedPnl += grossPnl;
        trade.feesPaid += exitFee;
        trade.netPnl = trade.realizedPnl - trade.feesPaid;
        trade.returnPercent = trade.entryPrice > 0 ? (priceDiff / trade.entryPrice) * 100 : 0;

        if (trade.stopLossPrice && Math.abs(trade.entryPrice - trade.stopLossPrice) > 0) {
            const riskPerUnit = Math.abs(trade.entryPrice - trade.stopLossPrice);
            trade.rMultiple = priceDiff / riskPerUnit;
        } else {
            trade.rMultiple = 0;
        }

        if (params.reason === 'STOP_LOSS') {
            trade.status = 'STOPPED_OUT';
        } else if (params.reason === 'TAKE_PROFIT') {
            trade.status = 'TAKE_PROFIT';
        } else {
            trade.status = 'CLOSED';
        }

        if (params.notes) {
            trade.notes = trade.notes ? `${trade.notes} | ${params.notes}` : params.notes;
        }

        this.saveToStorage();
        return trade;
    }

    /**
     * Computes institutional performance analytics over the journal.
     */
    public calculateMetrics(): JournalPerformanceMetrics {
        const closed = this.trades.filter((t) => t.status !== 'OPEN');
        const total = closed.length;
        if (total === 0) {
            return {
                totalTrades: this.trades.length,
                closedTrades: 0,
                winningTrades: 0,
                losingTrades: 0,
                winRatePercent: 0,
                grossProfit: 0,
                grossLoss: 0,
                profitFactor: 0,
                netRealizedPnl: 0,
                totalFees: this.trades.reduce((sum, t) => sum + t.feesPaid, 0),
                averageRMultiple: 0,
                largestWin: 0,
                largestLoss: 0,
            };
        }

        let wins = 0;
        let losses = 0;
        let grossProfit = 0;
        let grossLoss = 0;
        let totalR = 0;
        let largestWin = 0;
        let largestLoss = 0;
        let totalFees = 0;

        for (const t of this.trades) {
            totalFees += t.feesPaid;
            if (t.status === 'OPEN') continue;

            totalR += t.rMultiple;
            if (t.netPnl > 0) {
                wins++;
                grossProfit += t.netPnl;
                if (t.netPnl > largestWin) largestWin = t.netPnl;
            } else if (t.netPnl < 0) {
                losses++;
                grossLoss += Math.abs(t.netPnl);
                if (t.netPnl < largestLoss) largestLoss = t.netPnl;
            }
        }

        const winRatePercent = total > 0 ? (wins / total) * 100 : 0;
        const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
        const netRealizedPnl = grossProfit - grossLoss;
        const averageRMultiple = total > 0 ? totalR / total : 0;

        return {
            totalTrades: this.trades.length,
            closedTrades: total,
            winningTrades: wins,
            losingTrades: losses,
            winRatePercent: Number(winRatePercent.toFixed(1)),
            grossProfit: Number(grossProfit.toFixed(2)),
            grossLoss: Number(grossLoss.toFixed(2)),
            profitFactor: Number(profitFactor.toFixed(2)),
            netRealizedPnl: Number(netRealizedPnl.toFixed(2)),
            totalFees: Number(totalFees.toFixed(2)),
            averageRMultiple: Number(averageRMultiple.toFixed(2)),
            largestWin: Number(largestWin.toFixed(2)),
            largestLoss: Number(largestLoss.toFixed(2)),
        };
    }

    /**
     * Formats trade records into standard CSV format for download.
     */
    public exportToCsv(): string {
        const headers = [
            'Trade #',
            'ID',
            'Symbol',
            'Side',
            'Status',
            'Entry Time (UTC)',
            'Exit Time (UTC)',
            'Quantity (BTC)',
            'Entry Price ($)',
            'Exit Price ($)',
            'Stop Loss ($)',
            'Take Profit ($)',
            'Realized PnL ($)',
            'Fees ($)',
            'Net PnL ($)',
            'Return (%)',
            'R-Multiple',
            'Setup Grade',
            'Notes',
        ];

        const rows = this.trades.map((t) => [
            t.tradeNumber,
            t.id,
            t.symbol,
            t.side,
            t.status,
            new Date(t.entryTime).toISOString(),
            t.exitTime ? new Date(t.exitTime).toISOString() : '',
            t.quantity.toFixed(4),
            t.entryPrice.toFixed(2),
            t.exitPrice ? t.exitPrice.toFixed(2) : '',
            t.stopLossPrice ? t.stopLossPrice.toFixed(2) : '',
            t.takeProfitPrice ? t.takeProfitPrice.toFixed(2) : '',
            t.realizedPnl.toFixed(2),
            t.feesPaid.toFixed(2),
            t.netPnl.toFixed(2),
            t.returnPercent.toFixed(2) + '%',
            t.rMultiple.toFixed(2) + 'R',
            t.setupGrade,
            `"${(t.notes || '').replace(/"/g, '""')}"`,
        ]);

        return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    }

    /**
     * Clears all journal records.
     */
    public clearAll(): void {
        this.trades = [];
        this.saveToStorage();
    }

    private loadFromStorage(): TradeRecord[] {
        if (typeof window === 'undefined' || !window.localStorage) return [];
        try {
            const raw = window.localStorage.getItem(JOURNAL_STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    }

    private saveToStorage(): void {
        if (typeof window === 'undefined' || !window.localStorage) return;
        try {
            window.localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(this.trades));
        } catch {
            // Storage quota or sandboxed environment
        }
    }
}
