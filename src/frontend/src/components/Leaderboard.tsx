import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ===================================================
// TYPES
// ===================================================

export interface LeaderboardEntry {
  sessionId: string;
  username?: string;
  totalDeaths: bigint;
  totalWins: bigint;
  bestStage: bigint;
}

export interface SpeedLeaderboardEntry {
  sessionId: string;
  username?: string;
  bestCompletionTimeMs: bigint;
  totalWins: bigint;
}

// ===================================================
// OWNER TAG
// ===================================================

const OWNER_USERNAME = "tung_master";
function isOwner(name: string): boolean {
  return name === OWNER_USERNAME;
}

// ===================================================
// HELPERS
// ===================================================

export function formatTime(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = Math.floor((ms % 1000) / 10);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(2, "0")}`;
}

function shortenId(id: string): string {
  if (id.length <= 16) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

// ===================================================
// RANK MEDAL
// ===================================================

function RankMedal({ rank }: { rank: number }) {
  if (rank === 0) return <span className="lb-full-rank lb-rank-1">👑</span>;
  if (rank === 1) return <span className="lb-full-rank lb-rank-2">🥈</span>;
  if (rank === 2) return <span className="lb-full-rank lb-rank-3">🥉</span>;
  return <span className="lb-full-rank lb-rank-default">#{rank + 1}</span>;
}

// ===================================================
// FASTEST TIMES ROW
// ===================================================

function SpeedRow({
  entry,
  rank,
}: {
  entry: SpeedLeaderboardEntry;
  rank: number;
}) {
  const rowClass =
    rank === 0
      ? "lb-full-row lb-full-row-gold"
      : rank === 1
        ? "lb-full-row lb-full-row-silver"
        : rank === 2
          ? "lb-full-row lb-full-row-bronze"
          : "lb-full-row";

  const displayName = entry.username || shortenId(entry.sessionId);
  const hasUsername = !!entry.username;

  return (
    <div className={rowClass}>
      <RankMedal rank={rank} />
      <span
        className={hasUsername ? "lb-full-username" : "lb-full-principal"}
        title={entry.sessionId}
        style={
          isOwner(displayName)
            ? { color: "#22c55e", textShadow: "0 0 6px #22c55e" }
            : {}
        }
      >
        {isOwner(displayName) ? `👑 ${displayName}` : displayName}
      </span>
      <span className="lb-full-time">
        ⏱ {formatTime(Number(entry.bestCompletionTimeMs))}
      </span>
    </div>
  );
}

// ===================================================
// TOP PLAYERS ROW
// ===================================================

function TopRow({
  entry,
  rank,
}: {
  entry: LeaderboardEntry;
  rank: number;
}) {
  const rowClass =
    rank === 0
      ? "lb-full-row lb-full-row-gold"
      : rank === 1
        ? "lb-full-row lb-full-row-silver"
        : rank === 2
          ? "lb-full-row lb-full-row-bronze"
          : "lb-full-row";

  const displayName = entry.username || shortenId(entry.sessionId);
  const hasUsername = !!entry.username;

  return (
    <div className={rowClass}>
      <RankMedal rank={rank} />
      <span
        className={hasUsername ? "lb-full-username" : "lb-full-principal"}
        title={entry.sessionId}
        style={
          isOwner(displayName)
            ? { color: "#22c55e", textShadow: "0 0 6px #22c55e" }
            : {}
        }
      >
        {isOwner(displayName) ? `👑 ${displayName}` : displayName}
      </span>
      <span className="lb-full-stats">
        <span className="lb-full-stat-item">
          <span className="lb-full-stat-label">Stage</span>
          <span className="lb-full-stat-val">{entry.bestStage.toString()}</span>
        </span>
        <span className="lb-full-stat-item">
          <span className="lb-full-stat-label">Wins</span>
          <span className="lb-full-stat-val">{entry.totalWins.toString()}</span>
        </span>
      </span>
    </div>
  );
}

// ===================================================
// LEADERBOARD SCREEN
// ===================================================

interface LeaderboardScreenProps {
  leaderboard: LeaderboardEntry[];
  speedLeaderboard: SpeedLeaderboardEntry[];
  isLoading: boolean;
  onBack: () => void;
  usernameMap?: Map<string, string>; // kept for API compat, unused internally
}

export default function LeaderboardScreen({
  leaderboard,
  speedLeaderboard,
  isLoading,
  onBack,
}: LeaderboardScreenProps) {
  return (
    <div className="screen-overlay lb-full-screen">
      <div className="screen-overlay-bg" />
      <div className="lb-full-content">
        {/* Header */}
        <div className="lb-full-header">
          <button
            type="button"
            className="lb-full-back-btn"
            onClick={onBack}
            data-ocid="leaderboard.back_button"
          >
            ← Back
          </button>
          <h1 className="lb-full-title">LEADERBOARD</h1>
          <div className="lb-full-header-spacer" />
        </div>

        {/* Decorative trophy */}
        <div className="lb-full-trophy" aria-hidden="true">
          🏆
        </div>

        {/* Loading state */}
        {isLoading && (
          <div
            className="lb-full-loading"
            data-ocid="leaderboard.loading_state"
          >
            <div className="lb-full-loading-ring" />
            <span>Loading rankings...</span>
          </div>
        )}

        {/* Tabs */}
        {!isLoading && (
          <Tabs defaultValue="speed" className="lb-full-tabs-wrapper">
            <TabsList className="lb-full-tabs-list">
              <TabsTrigger
                value="speed"
                className="lb-full-tab"
                data-ocid="leaderboard.fastest_tab"
              >
                ⚡ Fastest Times
              </TabsTrigger>
              <TabsTrigger
                value="top"
                className="lb-full-tab"
                data-ocid="leaderboard.top_tab"
              >
                🏆 Top Players
              </TabsTrigger>
            </TabsList>

            {/* Fastest Times */}
            <TabsContent value="speed" className="lb-full-tab-content">
              <div
                className="lb-full-list"
                data-ocid="leaderboard.fastest_list"
              >
                {speedLeaderboard.length === 0 ? (
                  <div
                    className="lb-full-empty"
                    data-ocid="leaderboard.empty_state"
                  >
                    <span className="lb-full-empty-icon">⏱</span>
                    <p>No completions yet.</p>
                    <p className="lb-full-empty-sub">
                      Be the first to finish all 10 stages!
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="lb-full-list-header">
                      <span>Rank</span>
                      <span>Player</span>
                      <span>Time</span>
                    </div>
                    {speedLeaderboard.map((entry, i) => (
                      <SpeedRow key={entry.sessionId} entry={entry} rank={i} />
                    ))}
                  </>
                )}
              </div>
            </TabsContent>

            {/* Top Players */}
            <TabsContent value="top" className="lb-full-tab-content">
              <div className="lb-full-list" data-ocid="leaderboard.top_list">
                {leaderboard.length === 0 ? (
                  <div
                    className="lb-full-empty"
                    data-ocid="leaderboard.empty_state"
                  >
                    <span className="lb-full-empty-icon">🎮</span>
                    <p>No players yet.</p>
                    <p className="lb-full-empty-sub">
                      Play the game to appear here!
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="lb-full-list-header">
                      <span>Rank</span>
                      <span>Player</span>
                      <span>Stats</span>
                    </div>
                    {leaderboard.map((entry, i) => (
                      <TopRow key={entry.sessionId} entry={entry} rank={i} />
                    ))}
                  </>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
