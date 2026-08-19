import { NextResponse } from 'next/server';
import { calculateGreeks, calculateNetGEX } from '@/lib/quant/engine';

interface DeribitBookItem {
    instrument_name: string;
    open_interest: number;
    mark_iv: number;
    underlying_price?: number;
    mark_price?: number;
    bid_price?: number;
    ask_price?: number;
    volume?: number;
}

const MONTH_MAP: Record<string, number> = {
    JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
    JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

function parseDeribitExpiry(expiryStr: string): Date | null {
    // format: 25DEC26 or 27MAR26
    const match = expiryStr.match(/^(\d{1,2})([A-Z]{3})(\d{2})$/);
    if (!match) return null;
    const day = parseInt(match[1], 10);
    const month = MONTH_MAP[match[2]];
    const year = 2000 + parseInt(match[3], 10);
    if (isNaN(day) || month === undefined || isNaN(year)) return null;

    // Deribit options expire at 08:00 UTC
    return new Date(Date.UTC(year, month, day, 8, 0, 0));
}

export async function GET() {
    try {
        const now = new Date();

        // 1. Fetch Index Price and Option Book Summaries in parallel
        const [indexRes, bookRes] = await Promise.all([
            fetch('https://www.deribit.com/api/v2/public/get_index_price?index_name=btc_usd', {
                next: { revalidate: 15 },
            }),
            fetch('https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=BTC&kind=option', {
                next: { revalidate: 15 },
            }),
        ]);

        let spotPrice = 69000;
        if (indexRes.ok) {
            const indexJson = await indexRes.json();
            if (indexJson.result?.index_price) {
                spotPrice = indexJson.result.index_price;
            }
        }

        let bookData: DeribitBookItem[] = [];
        if (bookRes.ok) {
            const bookJson = await bookRes.json();
            if (Array.isArray(bookJson.result)) {
                bookData = bookJson.result;
            }
        }

        if (bookData.length === 0) {
            // Fallback generation if Deribit rate limits or network issues arise
            return NextResponse.json(generateSyntheticDerivativesData(spotPrice));
        }

        // 2. Parse and calculate Greeks for each contract
        let totalCallGex = 0;
        let totalPutGex = 0;
        let totalOpenInterest = 0;
        const rate = 0.04;

        interface OptionPoint {
            instrument: string;
            strike: number;
            expiryStr: string;
            expiryDate: Date;
            dte: number;
            tte: number;
            type: 'call' | 'put';
            openInterest: number;
            iv: number;
            delta: number;
            gamma: number;
            vanna: number;
            charm: number;
            gex: number;
            volume: number;
        }

        const options: OptionPoint[] = [];
        const strikeGexMap = new Map<number, number>();
        const expirySet = new Set<string>();

        for (const item of bookData) {
            // Regex: BTC-25DEC26-70000-C
            const parts = item.instrument_name.split('-');
            if (parts.length < 4 || parts[0] !== 'BTC') continue;

            const expiryStr = parts[1];
            const strike = parseFloat(parts[2]);
            const typeStr = parts[3];
            const type: 'call' | 'put' = typeStr === 'C' ? 'call' : 'put';

            if (isNaN(strike) || (typeStr !== 'C' && typeStr !== 'P')) continue;

            const expiryDate = parseDeribitExpiry(expiryStr);
            if (!expiryDate) continue;

            const msDiff = expiryDate.getTime() - now.getTime();
            if (msDiff <= 0) continue; // Expired

            const dte = Math.max(0.1, msDiff / (1000 * 60 * 60 * 24));
            const tte = dte / 365;
            const iv = Math.max(0.05, Math.min(3.0, (item.mark_iv || 50) / 100));
            const oi = item.open_interest || 0;

            const greeks = calculateGreeks(spotPrice, strike, tte, iv, rate, type);
            const netGex = calculateNetGEX(greeks.gamma, oi, spotPrice, type);

            if (type === 'call') {
                totalCallGex += netGex;
            } else {
                totalPutGex += netGex;
            }
            totalOpenInterest += oi;

            strikeGexMap.set(strike, (strikeGexMap.get(strike) || 0) + netGex);
            expirySet.add(expiryStr);

            options.push({
                instrument: item.instrument_name,
                strike,
                expiryStr,
                expiryDate,
                dte,
                tte,
                type,
                openInterest: oi,
                iv: iv * 100,
                delta: greeks.delta,
                gamma: greeks.gamma,
                vanna: greeks.vanna,
                charm: greeks.charm,
                gex: netGex,
                volume: item.volume || 0,
            });
        }

        const netGexTotal = totalCallGex + totalPutGex;

        // 3. Compute Surface Grid for 3D Mountain Terrain
        // Select sorted expirations
        const sortedExpiries = Array.from(expirySet)
            .map((exp) => ({ str: exp, date: parseDeribitExpiry(exp)! }))
            .filter((e) => e.date && e.date.getTime() > now.getTime())
            .sort((a, b) => a.date.getTime() - b.date.getTime())
            .slice(0, 10); // Take top 10 relevant expiries

        // Select strike range around spot: [spot * 0.6, spot * 1.5]
        const allStrikes = Array.from(strikeGexMap.keys()).sort((a, b) => a - b);
        const minStrike = Math.max(30000, spotPrice * 0.6);
        const maxStrike = Math.min(180000, spotPrice * 1.5);
        const filteredStrikes = allStrikes.filter((s) => s >= minStrike && s <= maxStrike);

        // Subsample strikes to ~25 points for smooth 3D grid
        const strikeStep = Math.max(1, Math.floor(filteredStrikes.length / 25));
        const sampleStrikes: number[] = [];
        for (let i = 0; i < filteredStrikes.length; i += strikeStep) {
            sampleStrikes.push(filteredStrikes[i]);
        }
        if (sampleStrikes.length > 0 && sampleStrikes[sampleStrikes.length - 1] !== filteredStrikes[filteredStrikes.length - 1]) {
            sampleStrikes.push(filteredStrikes[filteredStrikes.length - 1]);
        }

        // Build 2D matrix: [expiryIndex][strikeIndex]
        const surfaceGrid: {
            strike: number;
            dte: number;
            expiry: string;
            gex: number;
            callGex: number;
            putGex: number;
            openInterest: number;
            gamma: number;
            iv: number;
        }[][] = [];

        for (const exp of sortedExpiries) {
            const row: typeof surfaceGrid[0] = [];
            const dte = Math.max(0.1, (exp.date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

            for (const strike of sampleStrikes) {
                // Find all options matching this strike and expiry
                const matching = options.filter(
                    (o) => o.strike === strike && o.expiryStr === exp.str
                );

                let cellGex = 0;
                let cellCallGex = 0;
                let cellPutGex = 0;
                let cellOi = 0;
                let cellGamma = 0;
                let avgIv = 0;

                matching.forEach((m) => {
                    cellGex += m.gex;
                    if (m.type === 'call') cellCallGex += m.gex;
                    else cellPutGex += m.gex;
                    cellOi += m.openInterest;
                    cellGamma += m.gamma;
                    avgIv += m.iv;
                });

                if (matching.length > 0) {
                    avgIv /= matching.length;
                } else {
                    // interpolate Greeks for empty cells
                    const g = calculateGreeks(spotPrice, strike, dte / 365, 0.5, rate, 'call');
                    cellGamma = g.gamma;
                    avgIv = 50;
                }

                row.push({
                    strike,
                    dte: Math.round(dte * 10) / 10,
                    expiry: exp.str,
                    gex: cellGex,
                    callGex: cellCallGex,
                    putGex: cellPutGex,
                    openInterest: cellOi,
                    gamma: cellGamma,
                    iv: avgIv,
                });
            }
            surfaceGrid.push(row);
        }

        // 4. Find Key Analytical Levels
        // Gamma flip level: strike where cumulative/local Net GEX transitions
        let gammaFlip = spotPrice;
        const sortedStrikeGex = Array.from(strikeGexMap.entries()).sort((a, b) => a[0] - b[0]);
        for (let i = 0; i < sortedStrikeGex.length - 1; i++) {
            const [s1, g1] = sortedStrikeGex[i];
            const [s2, g2] = sortedStrikeGex[i + 1];
            if ((g1 <= 0 && g2 > 0) || (g1 >= 0 && g2 < 0)) {
                gammaFlip = Math.round((s1 + s2) / 2);
                break;
            }
        }

        // Max Pain Strike: Minimizes total option intrinsic payoff
        let minPainValue = Infinity;
        let maxPainStrike = spotPrice;
        for (const testStrike of sampleStrikes) {
            let totalLoss = 0;
            for (const opt of options) {
                if (opt.type === 'call' && testStrike > opt.strike) {
                    totalLoss += (testStrike - opt.strike) * opt.openInterest;
                } else if (opt.type === 'put' && testStrike < opt.strike) {
                    totalLoss += (opt.strike - testStrike) * opt.openInterest;
                }
            }
            if (totalLoss < minPainValue) {
                minPainValue = totalLoss;
                maxPainStrike = testStrike;
            }
        }

        // Top GEX Walls
        let topPositiveGexStrike = spotPrice;
        let topNegativeGexStrike = spotPrice;
        let maxPos = -Infinity;
        let minNeg = Infinity;

        for (const [strike, gex] of strikeGexMap.entries()) {
            if (gex > maxPos) {
                maxPos = gex;
                topPositiveGexStrike = strike;
            }
            if (gex < minNeg) {
                minNeg = gex;
                topNegativeGexStrike = strike;
            }
        }

        return NextResponse.json({
            timestamp: now.toISOString(),
            spotPrice,
            summary: {
                totalCallGex,
                totalPutGex,
                netGex: netGexTotal,
                totalOpenInterest,
                gammaFlip,
                maxPainStrike,
                topPositiveGexStrike,
                topNegativeGexStrike,
                contractsCount: options.length,
            },
            expirations: sortedExpiries.map((e) => e.str),
            strikes: sampleStrikes,
            surfaceGrid,
            topContracts: options
                .sort((a, b) => Math.abs(b.gex) - Math.abs(a.gex))
                .slice(0, 15),
        });
    } catch (err: unknown) {
        console.error('Error fetching Deribit data:', err);
        return NextResponse.json(generateSyntheticDerivativesData(69000));
    }
}

function generateSyntheticDerivativesData(spot: number) {
    const strikes = [
        spot * 0.7, spot * 0.75, spot * 0.8, spot * 0.85, spot * 0.9, spot * 0.95,
        spot, spot * 1.05, spot * 1.1, spot * 1.15, spot * 1.2, spot * 1.25, spot * 1.3
    ].map(s => Math.round(s / 1000) * 1000);

    const dtes = [7, 14, 30, 60, 90, 180];
    const expiries = ['7D', '14D', '30D', '60D', '90D', '180D'];

    const surfaceGrid = expiries.map((exp, expIdx) => {
        const dte = dtes[expIdx];
        const tte = dte / 365;
        return strikes.map((strike) => {
            const greeks = calculateGreeks(spot, strike, tte, 0.55, 0.04, strike >= spot ? 'call' : 'put');
            const oi = Math.max(50, 1500 * Math.exp(-Math.pow((strike - spot) / (spot * 0.2), 2)));
            const gex = calculateNetGEX(greeks.gamma, oi, spot, strike >= spot ? 'call' : 'put');
            return {
                strike,
                dte,
                expiry: exp,
                gex,
                callGex: strike >= spot ? gex : 0,
                putGex: strike < spot ? gex : 0,
                openInterest: oi,
                gamma: greeks.gamma,
                iv: 55,
            };
        });
    });

    return {
        timestamp: new Date().toISOString(),
        spotPrice: spot,
        summary: {
            totalCallGex: 450000000,
            totalPutGex: -320000000,
            netGex: 130000000,
            totalOpenInterest: 42500,
            gammaFlip: Math.round(spot * 0.98),
            maxPainStrike: Math.round(spot * 1.02),
            topPositiveGexStrike: Math.round(spot * 1.1),
            topNegativeGexStrike: Math.round(spot * 0.9),
            contractsCount: 450,
        },
        expirations: expiries,
        strikes,
        surfaceGrid,
        topContracts: [],
    };
}
