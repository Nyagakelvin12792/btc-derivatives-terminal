import type { OptionType } from '@/lib/deribit/types';

// Standard normal probability density function (PDF).
export function normalPDF(x: number): number {
    if (!Number.isFinite(x)) return 0;
    return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x);
}

// Approximation of the cumulative normal distribution function (CDF).
export function normalCDF(x: number): number {
    if (!Number.isFinite(x)) return x > 0 ? 1 : 0;

    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x) / Math.sqrt(2.0);
    const t = 1.0 / (1.0 + p * absX);
    const erf = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

    return 0.5 * (1.0 + sign * erf);
}

export interface GreeksResult {
    delta: number;
    gamma: number;
    vanna: number;
    charm: number;
}

export function calculateGreeks(
    spot: number,
    strike: number,
    tte: number,
    iv: number,
    rate: number,
    type: OptionType
): GreeksResult {
    if (
        !Number.isFinite(spot) ||
        !Number.isFinite(strike) ||
        !Number.isFinite(tte) ||
        !Number.isFinite(iv) ||
        !Number.isFinite(rate) ||
        tte <= 0 ||
        iv <= 0 ||
        spot <= 0 ||
        strike <= 0
    ) {
        return { delta: 0, gamma: 0, vanna: 0, charm: 0 };
    }

    const sqrtT = Math.sqrt(tte);
    const d1 = (Math.log(spot / strike) + (rate + 0.5 * iv * iv) * tte) / (iv * sqrtT);
    const d2 = d1 - iv * sqrtT;

    const nd1 = normalCDF(d1);
    const npd1 = normalPDF(d1);

    const delta = type === 'call' ? nd1 : nd1 - 1;
    const gamma = npd1 / (spot * iv * sqrtT);
    const vanna = (-npd1 * d2) / iv;
    const charm = -npd1 * ((rate / (iv * sqrtT)) - (d2 / (2 * tte)));

    return { delta, gamma, vanna, charm };
}

export function calculateNetGEX(
    gamma: number,
    openInterest: number,
    spot: number,
    type: OptionType
): number {
    if (
        !Number.isFinite(gamma) ||
        !Number.isFinite(openInterest) ||
        !Number.isFinite(spot) ||
        gamma < 0 ||
        openInterest < 0 ||
        spot <= 0
    ) {
        return 0;
    }

    const dollarGex = gamma * openInterest * (spot * spot);
    return type === 'call' ? dollarGex : -dollarGex;
}
