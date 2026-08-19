import { NextResponse } from 'next/server';
import { FALLBACK_SPOT_PRICE, fetchDeribitOptionChain } from '@/lib/deribit/client';
import type { NormalizedDeribitOption, OptionType } from '@/lib/deribit/types';
import { calculateGreeks, calculateNetGEX } from '@/lib/quant/engine';

interface OptionPoint {
    instrument: string;
    strike: number;
    expiryStr: string;
    expiryDate: Date;
    dte: number;
    tte: number;
    type: OptionType;
    openInterest: number;
    iv: number;
    delta: number;
    gamma: number;
    vanna: number;
    charm: number;
    gex: number;
    volume: number;
}

interface SurfaceGridCell {
    strike: number;
    dte: number;
    expiry: string;
    gex: number;
    callGex: number;
    putGex: number;
    openInterest: number;
    gamma: number;
    iv: number;
}

interface SurfaceCellAggregate {
    gex: number;
    callGex: number;
    putGex: number;
    openInterest: number;
    gamma: number;
    ivSum: number;
    count: number;
}

function cellKey(expiryStr: string, strike: number): string {
    return `${expiryStr}:${strike}`;
}

export async function GET() {
    const now = new Date();

    try {
        const chain = await fetchDeribitOptionChain(now);
        return NextResponse.json(buildDeribitSurfaceResponse(chain.options, chain.spotPrice, now));
    } catch (err: unknown) {
        console.error('Error fetching Deribit data:', err);
        return NextResponse.json(generateSyntheticDerivativesData(FALLBACK_SPOT_PRICE));
    }
}

function buildDeribitSurfaceResponse(
    normalizedOptions: NormalizedDeribitOption[],
    spotPrice: number,
    now: Date
) {
    let totalCallGex = 0;
    let totalPutGex = 0;
    let totalOpenInterest = 0;
    const rate = 0.04;

    const options: OptionPoint[] = [];
    const strikeGexMap = new Map<number, number>();
    const cellMap = new Map<string, SurfaceCellAggregate>();
    const expiryMap = new Map<string, Date>();

    for (const item of normalizedOptions) {
        const greeks = calculateGreeks(spotPrice, item.strike, item.tte, item.ivDecimal, rate, item.type);
        const netGex = calculateNetGEX(greeks.gamma, item.openInterest, spotPrice, item.type);

        if (item.type === 'call') {
            totalCallGex += netGex;
        } else {
            totalPutGex += netGex;
        }
        totalOpenInterest += item.openInterest;

        strikeGexMap.set(item.strike, (strikeGexMap.get(item.strike) || 0) + netGex);
        expiryMap.set(item.expiryStr, item.expiryDate);

        const aggregateKey = cellKey(item.expiryStr, item.strike);
        const aggregate = cellMap.get(aggregateKey) || {
            gex: 0,
            callGex: 0,
            putGex: 0,
            openInterest: 0,
            gamma: 0,
            ivSum: 0,
            count: 0,
        };

        aggregate.gex += netGex;
        if (item.type === 'call') aggregate.callGex += netGex;
        else aggregate.putGex += netGex;
        aggregate.openInterest += item.openInterest;
        aggregate.gamma += greeks.gamma;
        aggregate.ivSum += item.ivPercent;
        aggregate.count += 1;
        cellMap.set(aggregateKey, aggregate);

        options.push({
            instrument: item.instrument,
            strike: item.strike,
            expiryStr: item.expiryStr,
            expiryDate: item.expiryDate,
            dte: item.dte,
            tte: item.tte,
            type: item.type,
            openInterest: item.openInterest,
            iv: item.ivPercent,
            delta: greeks.delta,
            gamma: greeks.gamma,
            vanna: greeks.vanna,
            charm: greeks.charm,
            gex: netGex,
            volume: item.volume,
        });
    }

    const netGexTotal = totalCallGex + totalPutGex;
    const sortedExpiries = Array.from(expiryMap.entries())
        .map(([str, date]) => ({ str, date }))
        .filter((expiry) => expiry.date.getTime() > now.getTime())
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .slice(0, 10);

    const allStrikes = Array.from(strikeGexMap.keys()).sort((a, b) => a - b);
    const sampleStrikes = sampleSurfaceStrikes(allStrikes, spotPrice);
    const surfaceGrid: SurfaceGridCell[][] = [];

    for (const exp of sortedExpiries) {
        const row: SurfaceGridCell[] = [];
        const dte = Math.max(0.1, (exp.date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        for (const strike of sampleStrikes) {
            const aggregate = cellMap.get(cellKey(exp.str, strike));

            if (aggregate) {
                row.push({
                    strike,
                    dte: Math.round(dte * 10) / 10,
                    expiry: exp.str,
                    gex: aggregate.gex,
                    callGex: aggregate.callGex,
                    putGex: aggregate.putGex,
                    openInterest: aggregate.openInterest,
                    gamma: aggregate.gamma,
                    iv: aggregate.ivSum / aggregate.count,
                });
                continue;
            }

            const greeks = calculateGreeks(spotPrice, strike, dte / 365, 0.5, rate, 'call');
            row.push({
                strike,
                dte: Math.round(dte * 10) / 10,
                expiry: exp.str,
                gex: 0,
                callGex: 0,
                putGex: 0,
                openInterest: 0,
                gamma: greeks.gamma,
                iv: 50,
            });
        }
        surfaceGrid.push(row);
    }

    const gammaFlip = calculateGammaFlip(strikeGexMap, spotPrice);
    const maxPainStrike = calculateMaxPainStrike(options, sampleStrikes, spotPrice);
    const { topPositiveGexStrike, topNegativeGexStrike } = calculateTopGexWalls(strikeGexMap, spotPrice);

    return {
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
        expirations: sortedExpiries.map((expiry) => expiry.str),
        strikes: sampleStrikes,
        surfaceGrid,
        topContracts: options
            .sort((a, b) => Math.abs(b.gex) - Math.abs(a.gex))
            .slice(0, 15),
    };
}

function sampleSurfaceStrikes(allStrikes: number[], spotPrice: number): number[] {
    if (allStrikes.length === 0) return [];

    const minStrike = Math.max(30000, spotPrice * 0.6);
    const maxStrike = Math.min(180000, spotPrice * 1.5);
    const filteredStrikes = allStrikes.filter((strike) => strike >= minStrike && strike <= maxStrike);
    const candidateStrikes = filteredStrikes.length > 0 ? filteredStrikes : allStrikes;
    const strikeStep = Math.max(1, Math.floor(candidateStrikes.length / 25));
    const sampleStrikes: number[] = [];

    for (let i = 0; i < candidateStrikes.length; i += strikeStep) {
        sampleStrikes.push(candidateStrikes[i]);
    }

    const lastCandidate = candidateStrikes[candidateStrikes.length - 1];
    if (sampleStrikes[sampleStrikes.length - 1] !== lastCandidate) {
        sampleStrikes.push(lastCandidate);
    }

    return sampleStrikes;
}

function calculateGammaFlip(strikeGexMap: Map<number, number>, spotPrice: number): number {
    const sortedStrikeGex = Array.from(strikeGexMap.entries()).sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < sortedStrikeGex.length - 1; i++) {
        const [s1, g1] = sortedStrikeGex[i];
        const [s2, g2] = sortedStrikeGex[i + 1];
        if ((g1 <= 0 && g2 > 0) || (g1 >= 0 && g2 < 0)) {
            return Math.round((s1 + s2) / 2);
        }
    }

    return spotPrice;
}

function calculateMaxPainStrike(options: OptionPoint[], sampleStrikes: number[], spotPrice: number): number {
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

    return maxPainStrike;
}

function calculateTopGexWalls(strikeGexMap: Map<number, number>, spotPrice: number) {
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

    return { topPositiveGexStrike, topNegativeGexStrike };
}

function generateSyntheticDerivativesData(spot: number) {
    const strikes = [
        spot * 0.7,
        spot * 0.75,
        spot * 0.8,
        spot * 0.85,
        spot * 0.9,
        spot * 0.95,
        spot,
        spot * 1.05,
        spot * 1.1,
        spot * 1.15,
        spot * 1.2,
        spot * 1.25,
        spot * 1.3,
    ].map((strike) => Math.round(strike / 1000) * 1000);

    const dtes = [7, 14, 30, 60, 90, 180];
    const expiries = ['7D', '14D', '30D', '60D', '90D', '180D'];

    const surfaceGrid = expiries.map((exp, expIdx) => {
        const dte = dtes[expIdx];
        const tte = dte / 365;
        return strikes.map((strike) => {
            const type: OptionType = strike >= spot ? 'call' : 'put';
            const greeks = calculateGreeks(spot, strike, tte, 0.55, 0.04, type);
            const oi = Math.max(50, 1500 * Math.exp(-Math.pow((strike - spot) / (spot * 0.2), 2)));
            const gex = calculateNetGEX(greeks.gamma, oi, spot, type);
            return {
                strike,
                dte,
                expiry: exp,
                gex,
                callGex: type === 'call' ? gex : 0,
                putGex: type === 'put' ? gex : 0,
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
