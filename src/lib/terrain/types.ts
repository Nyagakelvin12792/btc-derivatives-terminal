import type { OptionType } from '../deribit/types';

export const TERRAIN_SCHEMA_VERSION = 2;
export const TERRAIN_ASSUMPTION_MODEL = 'OI_SIGN_PROXY_V1';

export type TerrainSchemaVersion = typeof TERRAIN_SCHEMA_VERSION;
export type TerrainAssumptionModel = typeof TERRAIN_ASSUMPTION_MODEL;
export type TerrainDataMode = 'LIVE' | 'DEMO' | 'DEGRADED';
export type IntensityBand = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
export type DealerBehaviorZone =
    | 'STABILIZATION_ZONE'
    | 'ACCELERATION_ZONE'
    | 'REGIME_TRANSITION'
    | 'VOL_SENSITIVE_ZONE'
    | 'DECAY_PRESSURE_ZONE'
    | 'HIGH_CONFLUENCE_WALL'
    | 'NEUTRAL';

export type HedgeDirection = 'BUY_HEDGE' | 'SELL_HEDGE' | 'NEUTRAL';
export type ContourSign = 'POSITIVE' | 'NEGATIVE' | 'ZERO';

export interface TerrainScale {
    min: number;
    max: number;
    robustAbsMax: number;
    unit: string;
}

export interface TerrainScales {
    gex: TerrainScale;
    vanna: TerrainScale;
    charm: TerrainScale;
    openInterest: TerrainScale;
}

export interface TerrainSurfaceCell {
    strike: number;
    expiry: string;
    dte: number;
    rawDelta: number;
    rawGamma: number;
    rawVanna: number;
    rawCharm: number;
    gexExposure: number;
    vannaExposure: number;
    charmExposure: number;
    callGexExposure: number;
    putGexExposure: number;
    openInterestBtc: number;
    openInterestUsd: number;
    iv: number;
    gexIntensity: number;
    vannaIntensity: number;
    charmIntensity: number;
    oiIntensity: number;
    gexBand: IntensityBand;
    vannaBand: IntensityBand;
    charmBand: IntensityBand;
    oiBand: IntensityBand;
    confluenceScore: number;
    confluenceBand: IntensityBand;
    behaviorZone: DealerBehaviorZone;

    // Legacy Gemini compatibility fields.
    gex: number;
    callGex: number;
    putGex: number;
    openInterest: number;
    gamma: number;
}

export interface KeyLevel {
    strike: number;
    exposure: number;
}

export interface GammaFlipCurvePoint {
    spot: number;
    gexExposure: number;
}

export interface GammaFlipLevel {
    strike: number;
    gexExposure: number;
    curve: GammaFlipCurvePoint[];
}

export interface MaxPainByExpiry {
    expiry: string;
    dte: number;
    strike: number;
    pain: number;
}

export interface TerrainKeyLevels {
    callWall: KeyLevel;
    putWall: KeyLevel;
    gammaFlip: GammaFlipLevel;
    primaryMaxPain: MaxPainByExpiry | null;
}

export interface TerrainSummary {
    totalCallGex: number;
    totalPutGex: number;
    netGex: number;
    totalVannaExposure: number;
    totalCharmExposure: number;
    totalOpenInterest: number;
    gammaFlip: number;
    maxPainStrike: number;
    topPositiveGexStrike: number;
    topNegativeGexStrike: number;
    callWallExposure: number;
    putWallExposure: number;
    contractsCount: number;
}

export interface TerrainConfluenceLevel {
    strike: number;
    expiry: string;
    dte: number;
    confluenceScore: number;
    confluenceBand: IntensityBand;
    behaviorZone: DealerBehaviorZone;
    gexExposure: number;
    vannaExposure: number;
    charmExposure: number;
    openInterestBtc: number;
}

export interface VannaContourPoint {
    x: number;
    y: number;
    strike: number;
    dte: number;
}

export interface VannaContourPrimitive {
    threshold: number;
    sign: ContourSign;
    intensity: number;
    points: VannaContourPoint[];
}

export interface CharmPressureGlyph {
    strike: number;
    dte: number;
    expiry: string;
    charmExposure: number;
    intensity: number;
    hedgeDirection: HedgeDirection;
}

export interface ConfluenceFloorCell {
    strike: number;
    dte: number;
    expiry: string;
    confluenceScore: number;
    confluenceBand: IntensityBand;
}

export interface TerrainKeyContract {
    instrument: string;
    strike: number;
    expiryStr: string;
    expiryDate: Date;
    dte: number;
    tte: number;
    type: OptionType;
    openInterest: number;
    openInterestBtc: number;
    openInterestUsd: number;
    iv: number;
    rawDelta: number;
    rawGamma: number;
    rawVanna: number;
    rawCharm: number;
    delta: number;
    gamma: number;
    vanna: number;
    charm: number;
    gex: number;
    gexExposure: number;
    vannaExposure: number;
    charmExposure: number;
    gexIntensity: number;
    vannaIntensity: number;
    charmIntensity: number;
    confluenceScore: number;
    behaviorZone: DealerBehaviorZone;
    volume: number;
}

export interface TerrainDataContractV2 {
    schemaVersion: TerrainSchemaVersion;
    timestamp: string;
    dataMode: TerrainDataMode;
    assumptionModel: TerrainAssumptionModel;
    spotPrice: number;
    summary: TerrainSummary;
    scales: TerrainScales;
    strikes: number[];
    expirations: string[];
    dtes: number[];
    surfaceGrid: TerrainSurfaceCell[][];
    keyLevels: TerrainKeyLevels;
    maxPainByExpiry: MaxPainByExpiry[];
    confluenceLevels: TerrainConfluenceLevel[];
    vannaContours: VannaContourPrimitive[];
    charmGlyphs: CharmPressureGlyph[];
    confluenceFloor: ConfluenceFloorCell[][];
    keyContracts: TerrainKeyContract[];

    // Legacy Gemini compatibility field for the current dashboard table.
    topContracts: TerrainKeyContract[];
}
