export type DealerRegimeType = 'LONG_GAMMA' | 'SHORT_GAMMA' | 'TRANSITIONAL';
export type DataMode = 'LIVE' | 'DEMO' | 'DEGRADED';
export type AssumptionModel = 'OI_SIGN_PROXY_V1';

export type WorkspaceTab = 
    | 'SURFACE MAP' 
    | 'DASHBOARD' 
    | 'GEX ANALYSIS' 
    | 'VANNA' 
    | 'CHARM' 
    | 'OPEN INTEREST' 
    | 'ALERTS' 
    | 'WATCHLIST' 
    | 'SCREENER' 
    | 'REPORTS' 
    | 'SETTINGS';

export type IntensityBand = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';

export type DealerBehaviorZone = 
    | 'STABILIZATION_ZONE'
    | 'ACCELERATION_ZONE'
    | 'REGIME_TRANSITION'
    | 'VOL_SENSITIVE_ZONE'
    | 'DECAY_PRESSURE_ZONE'
    | 'HIGH_CONFLUENCE_WALL'
    | 'NEUTRAL';

export interface MetricScaleMeta {
    min: number;
    max: number;
    robustAbsMax: number;
    unit: string;
}

export interface ExposureScales {
    gexMax: number;
    gexMin: number;
    gexUnit: string;
    vannaMax: number;
    vannaMin: number;
    vannaUnit: string;
    charmMax: number;
    charmMin: number;
    charmUnit: string;
    gexMeta?: MetricScaleMeta;
    vannaMeta?: MetricScaleMeta;
    charmMeta?: MetricScaleMeta;
}

export interface DealerEnvironmentSummaryData {
    spotPrice: number;
    spot24hChange: number;
    spot24hChangePct: number;
    openInterestUsd: number | null;
    openInterestBtc: number | null;
    openInterestChangePct: number;
    iv30d: number;
    iv30dChange: number;
    skew25d: number;
    skew25dChange: number;
    fundingRate: number;
    fundingPeriod: string;
    utcTime: string;
    netGex: number;
    netVanna: number;
    netCharm: number;
    gammaFlip: number;
    callWall: number;
    putWall: number;
    maxPain: number;
    totalOiUsd: number | null;
    totalOiBtc: number | null;
    dealerRegime: DealerRegimeType;
    regimeTitle: string;
    regimeSubtitle: string;
    regimeDescription: string;
    regimeScore: number; // 0 to 100 for gauge meter
    dataMode: DataMode;
    assumptionModel: AssumptionModel;
    sourceStatus: string;
}

export interface TerrainGridCell {
    strike: number;
    dte: number;
    expiry: string;
    gex: number;
    vanna: number;
    charm: number;
    callGex: number;
    putGex: number;
    openInterest: number;
    gamma: number;
    delta: number;
    iv: number;
    gexIntensity?: number;
    vannaIntensity?: number;
    charmIntensity?: number;
    confluenceScore?: number;
    behaviorZone?: DealerBehaviorZone;
}

export type ConfluenceTag = 'High Confluence' | 'Dealer Support Zone' | 'Regime Transition' | 'Gamma Flip Zone';
export type LevelType = 'CALL WALL' | 'PUT WALL' | 'FLIP LEVEL' | 'MAX PAIN' | 'SUPPORT' | 'RESISTANCE';

export interface ConfluenceLevelItem {
    id: string;
    level: string;
    strike: number;
    gex: number;
    vanna: number;
    charm: number;
    wallType: LevelType;
    confluenceScore: number;
    tag: ConfluenceTag;
    behaviorZone?: DealerBehaviorZone;
}

export interface KeyContractItem {
    instrument: string;
    type: 'call' | 'put';
    expiry: string;
    dte: number;
    strike: number;
    spotPct: number;
    gamma: number;
    gex: number;
    vanna: number;
    charm: number;
    iv: number;
    ivPercentile: number;
    oiBtc: number;
    oiUsd: number | null;
    delta: number;
    volume24h: number;
    confluenceBadge: string;
    confluenceTag: ConfluenceTag;
}

export interface SelectedAnalyticalState {
    strike: number | null;
    dte: number | null;
    expiry: string | null;
    levelId: string | null;
    contractInstrument: string | null;
}

export interface KeyLevelProfileData {
    strike: number;
    distancePct: number;
    gexExposure: number;
    gexIntensity: number;
    gexBand: IntensityBand;
    vannaExposure: number;
    vannaIntensity: number;
    vannaBand: IntensityBand;
    charmExposure: number;
    charmIntensity: number;
    charmBand: IntensityBand;
    callWallStatus: boolean;
    putWallStatus: boolean;
    gammaFlipDistancePct: number;
    maxPainDistancePct: number;
    oiBtc: number;
    oiConcentrationPct: number;
    confluenceScore: number;
    behaviorZone: DealerBehaviorZone;
    behaviorTendencyDescription: string;
}

export interface DashboardData {
    schemaVersion?: number;
    timestamp: string;
    dataMode: DataMode;
    assumptionModel: AssumptionModel;
    summary: DealerEnvironmentSummaryData;
    scales: ExposureScales;
    strikes: number[];
    expirations: string[];
    dtes: number[];
    surfaceGrid: TerrainGridCell[][];
    interpolatedGrid?: TerrainGridCell[][];
    confluenceLevels: ConfluenceLevelItem[];
    keyContracts: KeyContractItem[];
}
