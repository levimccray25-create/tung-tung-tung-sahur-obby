import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface CustomLevel {
    id: bigint;
    worldWidth: bigint;
    name: string;
    createdAt: bigint;
    authorSession: string;
    author: Principal;
    platformsJson: string;
    bgHue: bigint;
}
export interface UserStats {
    bestCompletionTimeMs: bigint;
    totalDeaths: bigint;
    totalWins: bigint;
    bestStage: bigint;
}
export interface LeaderboardRow {
    username: string;
    bestCompletionTimeMs: bigint;
    totalDeaths: bigint;
    totalWins: bigint;
    bestStage: bigint;
    sessionId: string;
}
export interface backendInterface {
    adminResetUsernames(secret: string): Promise<void>;
    claimOwnerPrincipal(secret: string): Promise<boolean>;
    deleteLevel(sessionId: string, id: bigint): Promise<void>;
    deleteMyLevel(sessionId: string): Promise<void>;
    getAllUsernames(): Promise<Array<[string, string]>>;
    getLeaderboard(): Promise<Array<LeaderboardRow>>;
    getLevelById(id: bigint): Promise<CustomLevel | null>;
    getMyLevel(sessionId: string): Promise<CustomLevel | null>;
    getMyLevels(sessionId: string): Promise<Array<CustomLevel>>;
    getMyStats(sessionId: string): Promise<UserStats | null>;
    getMyUsername(sessionId: string): Promise<string | null>;
    getPublicLevels(): Promise<Array<CustomLevel>>;
    getSpeedLeaderboard(): Promise<Array<LeaderboardRow>>;
    registerUsername(sessionId: string, name: string): Promise<void>;
    resetMyUsername(sessionId: string): Promise<void>;
    saveCustomLevel(sessionId: string, name: string, platformsJson: string, worldWidth: bigint, bgHue: bigint): Promise<void>;
    saveGameResult(sessionId: string, stageReached: bigint, deathsThisRun: bigint, completionTimeMs: bigint): Promise<void>;
}
