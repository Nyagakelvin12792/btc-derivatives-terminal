import {
    DashboardData,
    DealerEnvironmentSummaryData,
    TerrainGridCell,
    ConfluenceLevelItem,
    KeyContractItem,
} from './types';

export function formatUsd(val: number, options?: { showSign?: boolean; decimals?: number; unit?: 'B' | 'M' | 'K' | 'auto' }): string {
    const sign = val > 0 && options?.showSign ? '+' : val < 0 && options?.showSign ? '-' : '';
    const abs = Math.abs(val);
    const dec = options?.decimals !== undefined ? options.decimals : 2;

    if (options?.unit === 'B' || (options?.unit === 'auto' !== false && abs >= 1e9)) {
        return `${sign}${(abs / 1e9).toFixed(dec)}B`;
    }
    if (options?.unit === 'M' || abs >= 1e6) {
        return `${sign}${(abs / 1e6).toFixed(dec)}M`;
    }
    if (options?.unit === 'K' || abs >= 1e3) {
        return `${sign}${(abs / 1e3).toFixed(dec)}K`;
    }
    return `${sign}$${abs.toFixed(0)}`;
}

export function formatGex(val: number): string {
    const sign = val >= 0 ? '+' : '-';
    const abs = Math.abs(val);
    if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M`;
    return `${sign}$${abs.toFixed(0)}`;
}

export function createCanonicalDashboardData(): DashboardData {
    const spotPrice = 67842.5;
    const strikes = [58000, 60000, 62000, 64000, 66000, 68000, 70000, 72000, 74000, 76000, 78000];
    const dtes = [7, 14, 30, 60, 90, 120, 180, 270];
    const expirations = ['2025-05-23', '2025-05-30', '2025-06-27', '2025-07-25', '2025-08-29', '2025-09-26', '2025-12-26', '2026-03-27'];

    // Generate 2D surface grid matching the reference terrain (peaks around 70k-74k, valley around 60k-64k)
    const surfaceGrid: TerrainGridCell[][] = dtes.map((dte, dteIdx) => {
        const expiry = expirations[dteIdx];
        const tte = dte / 365;

        return strikes.map((strike) => {
            // Mathematical elevation profile modeling dealer gamma mountain
            const normStrike = (strike - spotPrice) / 6000;
            const timeDecayFactor = Math.exp(-dte / 180);

            // Call mountain around 70k - 74k (positive GEX)
            const callMountain = 6.8e9 * Math.exp(-Math.pow((strike - 71500) / 3800, 2)) * (0.6 + 0.4 * Math.sin(dteIdx * 0.8));
            // Put canyon around 60k - 63k (negative GEX)
            const putCanyon = -7.2e9 * Math.exp(-Math.pow((strike - 62000) / 3200, 2)) * (0.7 + 0.3 * Math.cos(dteIdx * 0.6));
            // Secondary peaks
            const secondaryCall = 2.4e9 * Math.exp(-Math.pow((strike - 67500) / 2000, 2));

            const gex = (callMountain + putCanyon + secondaryCall) * (0.8 + 0.3 * timeDecayFactor);

            // Vanna profile (cross derivative ∂Delta/∂σ): peaks on wings
            const vanna = (gex * 0.22) - (normStrike * 0.4e9);

            // Charm profile (cross derivative ∂Delta/∂t): directional time decay
            const charm = -0.15e9 - (0.12e9 * normStrike * timeDecayFactor);

            const callGex = gex > 0 ? gex : 0;
            const putGex = gex < 0 ? gex : 0;
            const oi = Math.max(800, 24000 * Math.exp(-Math.pow((strike - spotPrice) / 8000, 2)));
            const gamma = Math.abs(gex) / (oi * spotPrice * spotPrice || 1);

            return {
                strike,
                dte,
                expiry,
                gex,
                vanna,
                charm,
                callGex,
                putGex,
                openInterest: oi,
                gamma,
                delta: strike >= spotPrice ? 0.5 * Math.exp(-normStrike) : -0.5 * Math.exp(normStrike),
                iv: 54.2 + normStrike * 2.1 + (dteIdx * 0.4),
            };
        });
    });

    const summary: DealerEnvironmentSummaryData = {
        spotPrice,
        spot24hChange: 1243.5,
        spot24hChangePct: 1.86,
        openInterestUsd: 28.47e9,
        openInterestBtc: 419663,
        openInterestChangePct: 2.71,
        iv30d: 54.2,
        iv30dChange: 0.8,
        skew25d: 7.6,
        skew25dChange: 0.3,
        fundingRate: 0.0102,
        fundingPeriod: '8h',
        utcTime: new Date().toISOString().replace('T', ' ').substring(0, 19),
        netGex: 1.28e9,
        netVanna: -0.38e9,
        netCharm: -0.92e9,
        gammaFlip: 65250,
        callWall: 72000,
        putWall: 62000,
        maxPain: 68500,
        totalOiUsd: 28.47e9,
        dealerRegime: 'LONG_GAMMA',
        regimeTitle: 'LONG GAMMA',
        regimeSubtitle: 'stabilizing / mean reverting',
        regimeDescription: 'Dealers are long gamma. Market tends to stabilize around spot. Pullbacks may be bought, rips may fade. Lower realized volatility expected.',
        regimeScore: 78,
    };

    const confluenceLevels: ConfluenceLevelItem[] = [
        {
            id: 'cw-1',
            level: 'Call Wall',
            strike: 72000,
            gex: 5.82e9,
            vanna: 1.12e9,
            charm: -0.45e9,
            wallType: 'CALL WALL',
            confluenceScore: 96,
            tag: 'High Confluence',
        },
        {
            id: 'gf-1',
            level: 'Gamma Flip',
            strike: 65250,
            gex: 0.12e9,
            vanna: -0.05e9,
            charm: -0.15e9,
            wallType: 'FLIP LEVEL',
            confluenceScore: 88,
            tag: 'High Confluence',
        },
        {
            id: 'mp-1',
            level: 'Max Pain',
            strike: 68500,
            gex: 0.35e9,
            vanna: -0.02e9,
            charm: -0.20e9,
            wallType: 'MAX PAIN',
            confluenceScore: 82,
            tag: 'High Confluence',
        },
        {
            id: 'pw-1',
            level: 'Put Wall',
            strike: 62000,
            gex: -5.46e9,
            vanna: -1.08e9,
            charm: -0.62e9,
            wallType: 'PUT WALL',
            confluenceScore: 94,
            tag: 'High Confluence',
        },
        {
            id: 'ds-1',
            level: 'Dealer Support',
            strike: 66500,
            gex: 1.07e9,
            vanna: 0.21e9,
            charm: -0.10e9,
            wallType: 'SUPPORT',
            confluenceScore: 78,
            tag: 'Dealer Support Zone',
        },
    ];

    const keyContracts: KeyContractItem[] = [
        {
            instrument: 'BTC-23MAY25-72000-C',
            type: 'call',
            expiry: '2025-05-23',
            dte: 5,
            strike: 72000,
            spotPct: 6.12,
            gamma: 0.000842,
            gex: 1.86e9,
            vanna: 0.41e9,
            charm: -0.19e9,
            iv: 56.2,
            ivPercentile: 78,
            oiBtc: 22143,
            oiUsd: 1.50e9,
            delta: 0.48,
            volume24h: 3421,
            confluenceBadge: 'Call Wall',
            confluenceTag: 'High Confluence',
        },
        {
            instrument: 'BTC-30MAY25-62000-P',
            type: 'put',
            expiry: '2025-05-30',
            dte: 12,
            strike: 62000,
            spotPct: -8.60,
            gamma: -0.001125,
            gex: -2.03e9,
            vanna: -0.56e9,
            charm: -0.22e9,
            iv: 58.7,
            ivPercentile: 82,
            oiBtc: 24851,
            oiUsd: 1.55e9,
            delta: -0.42,
            volume24h: 4102,
            confluenceBadge: 'Put Wall',
            confluenceTag: 'High Confluence',
        },
        {
            instrument: 'BTC-27JUN25-70000-C',
            type: 'call',
            expiry: '2025-06-27',
            dte: 40,
            strike: 70000,
            spotPct: 3.18,
            gamma: 0.001034,
            gex: 1.45e9,
            vanna: 0.28e9,
            charm: -0.13e9,
            iv: 54.1,
            ivPercentile: 72,
            oiBtc: 18993,
            oiUsd: 1.29e9,
            delta: 0.44,
            volume24h: 2781,
            confluenceBadge: 'Call Wall',
            confluenceTag: 'High Confluence',
        },
        {
            instrument: 'BTC-27JUN25-60000-P',
            type: 'put',
            expiry: '2025-06-27',
            dte: 40,
            strike: 60000,
            spotPct: -11.56,
            gamma: -0.001112,
            gex: -1.62e9,
            vanna: -0.31e9,
            charm: -0.15e9,
            iv: 60.3,
            ivPercentile: 86,
            oiBtc: 16471,
            oiUsd: 1.07e9,
            delta: -0.36,
            volume24h: 2013,
            confluenceBadge: 'Support Zone',
            confluenceTag: 'Dealer Support Zone',
        },
        {
            instrument: 'BTC-25JUL25-75000-C',
            type: 'call',
            expiry: '2025-07-25',
            dte: 68,
            strike: 75000,
            spotPct: 10.55,
            gamma: 0.000956,
            gex: 1.21e9,
            vanna: 0.22e9,
            charm: -0.10e9,
            iv: 53.6,
            ivPercentile: 69,
            oiBtc: 14210,
            oiUsd: 0.96e9,
            delta: 0.41,
            volume24h: 1845,
            confluenceBadge: 'Call Wall',
            confluenceTag: 'Regime Transition',
        },
    ];

    return {
        timestamp: new Date().toISOString(),
        summary,
        strikes,
        expirations,
        dtes,
        surfaceGrid,
        confluenceLevels,
        keyContracts,
    };
}

export function adaptApiResponseToDashboardData(raw: unknown): DashboardData {
    if (!raw || typeof raw !== 'object') {
        return createCanonicalDashboardData();
    }

    const res = raw as Record<string, unknown>;
    if (!res.surfaceGrid || !Array.isArray(res.surfaceGrid)) {
        return createCanonicalDashboardData();
    }

    // Blend live feed with canonical fallbacks
    const canonical = createCanonicalDashboardData();
    const spot = typeof res.spotPrice === 'number' ? res.spotPrice : canonical.summary.spotPrice;
    const summaryRaw = (res.summary as Record<string, number | undefined>) || {};

    const netGex = summaryRaw.netGex ?? canonical.summary.netGex;
    const dealerRegime = netGex > 0.5e9 ? 'LONG_GAMMA' : netGex < -0.5e9 ? 'SHORT_GAMMA' : 'TRANSITIONAL';

    return {
        ...canonical,
        summary: {
            ...canonical.summary,
            spotPrice: spot,
            netGex,
            callWall: summaryRaw.topPositiveGexStrike ?? canonical.summary.callWall,
            putWall: summaryRaw.topNegativeGexStrike ?? canonical.summary.putWall,
            gammaFlip: summaryRaw.gammaFlip ?? canonical.summary.gammaFlip,
            maxPain: summaryRaw.maxPainStrike ?? canonical.summary.maxPain,
            totalOiUsd: (summaryRaw.totalOpenInterest || 420000) * spot * 0.001 * 1e6,
            dealerRegime,
            regimeTitle: dealerRegime === 'LONG_GAMMA' ? 'LONG GAMMA' : dealerRegime === 'SHORT_GAMMA' ? 'SHORT GAMMA' : 'TRANSITIONAL REGIME',
        },
    };
}
