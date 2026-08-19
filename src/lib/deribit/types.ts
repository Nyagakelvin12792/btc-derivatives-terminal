export type OptionType = 'call' | 'put';

export interface ParsedDeribitInstrument {
    instrument: string;
    currency: 'BTC';
    expiryStr: string;
    expiryDate: Date;
    strike: number;
    type: OptionType;
}

export interface DeribitBookSummaryItem {
    instrumentName: string;
    openInterest: number;
    markIv: number | null;
    volume: number;
}

export interface NormalizedDeribitOption extends ParsedDeribitInstrument {
    dte: number;
    tte: number;
    openInterest: number;
    ivDecimal: number;
    ivPercent: number;
    volume: number;
}

export interface NormalizedDeribitChain {
    spotPrice: number;
    options: NormalizedDeribitOption[];
}
