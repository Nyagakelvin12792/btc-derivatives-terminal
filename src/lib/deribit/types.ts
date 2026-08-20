export type OptionType = 'call' | 'put';

type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type DeribitInstrumentName = Brand<string, 'DeribitInstrumentName'>;
export type ExpiryCode = Brand<string, 'ExpiryCode'>;
export type Usd = Brand<number, 'Usd'>;
export type Days = Brand<number, 'Days'>;
export type YearFraction = Brand<number, 'YearFraction'>;
export type VolatilityDecimal = Brand<number, 'VolatilityDecimal'>;
export type VolatilityPercent = Brand<number, 'VolatilityPercent'>;
export type BtcOpenInterest = Brand<number, 'BtcOpenInterest'>;
export type BtcVolume = Brand<number, 'BtcVolume'>;

export interface ParsedDeribitInstrument {
    readonly instrument: DeribitInstrumentName;
    readonly currency: 'BTC';
    readonly expiryStr: ExpiryCode;
    readonly expiryDate: Date;
    readonly strike: Usd;
    readonly type: OptionType;
}

export interface DeribitBookSummaryItem {
    readonly instrumentName: DeribitInstrumentName;
    readonly openInterest: BtcOpenInterest;
    readonly markIv: VolatilityPercent | null;
    readonly volume: BtcVolume;
}

export interface NormalizedDeribitOption extends ParsedDeribitInstrument {
    readonly dte: Days;
    readonly tte: YearFraction;
    readonly openInterest: BtcOpenInterest;
    readonly ivDecimal: VolatilityDecimal;
    readonly ivPercent: VolatilityPercent;
    readonly volume: BtcVolume;
}

export interface NormalizedDeribitChain {
    readonly spotPrice: Usd;
    readonly options: readonly NormalizedDeribitOption[];
}
