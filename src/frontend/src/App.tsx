import { useCallback, useEffect, useRef, useState } from "react";
import CommunityLevels from "./components/CommunityLevels";
import LeaderboardScreen from "./components/Leaderboard";
import type { SpeedLeaderboardEntry } from "./components/Leaderboard";
import { formatTime } from "./components/Leaderboard";
import LevelEditor from "./components/LevelEditor";
import ObbyCoreGame from "./components/ObbyCoreGame";
import type { Platform, StageConfig } from "./components/ObbyCoreGame";
import { useActor } from "./hooks/useActor";

// ===================================================
// SESSION ID — stable device-local identity
// ===================================================

function getOrCreateSessionId(): string {
  const KEY = "tung_obby_session_id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    const arr = new Uint8Array(8);
    crypto.getRandomValues(arr);
    id = Array.from(arr)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    localStorage.setItem(KEY, id);
  }
  return id;
}

// ===================================================
// OWNER TAG
// ===================================================

const OWNER_USERNAME = "tung_master";
function isOwner(name: string | null | undefined): boolean {
  return name === OWNER_USERNAME;
}

// ===================================================
// USERNAME VALIDATION
// ===================================================

function validateUsername(name: string): string | null {
  if (name.length < 3) return "Username must be at least 3 characters.";
  if (name.length > 20) return "Username must be 20 characters or less.";
  if (!/^[a-zA-Z0-9_]+$/.test(name))
    return "Only letters, numbers, and underscores are allowed.";
  return null;
}

// ===================================================
// USERNAME SETUP MODAL
// ===================================================

interface UsernameModalProps {
  onConfirm: (name: string) => Promise<void>;
}

function UsernameModal({ onConfirm }: UsernameModalProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    const validationError = validateUsername(trimmed);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await onConfirm(trimmed);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.toLowerCase().includes("already") ||
        msg.toLowerCase().includes("taken")
      ) {
        setError("That name is already taken. Try another one.");
      } else if (
        msg.toLowerCase().includes("has username") ||
        msg.toLowerCase().includes("already registered")
      ) {
        setError("You already have a username registered.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="username-modal-overlay" data-ocid="username.modal">
      <div className="username-modal-bg" />
      <div className="username-modal-card">
        <div className="username-modal-icon" aria-hidden="true">
          🥁
        </div>
        <h2 className="username-modal-title">CHOOSE YOUR NAME</h2>
        <p className="username-modal-subtitle">
          Pick a unique name to appear on the leaderboard
        </p>
        <form onSubmit={handleSubmit} className="username-modal-form">
          <div className="username-input-wrapper">
            <input
              type="text"
              className="username-input"
              placeholder="e.g. TungMaster99"
              value={value}
              onChange={(e) => {
                setValue(e.target.value.slice(0, 20));
                setError(null);
              }}
              maxLength={20}
              disabled={isSubmitting}
              data-ocid="username.input"
              autoComplete="off"
              spellCheck={false}
            />
            <span className="username-char-counter">{value.length}/20</span>
          </div>
          {error && (
            <div className="username-error" data-ocid="username.error_state">
              {error}
            </div>
          )}
          <button
            type="submit"
            className={`game-button game-button-primary username-submit-btn ${isSubmitting ? "username-submit-loading" : ""}`}
            disabled={isSubmitting || value.trim().length < 3}
            data-ocid="username.submit_button"
          >
            {isSubmitting ? (
              <span className="username-loading-ring" />
            ) : (
              "✓ CONFIRM NAME"
            )}
          </button>
        </form>
        <p className="username-modal-hint">
          3–20 characters · letters, numbers, underscores only
        </p>
      </div>
    </div>
  );
}

// ===================================================
// TYPES
// ===================================================

type GameScreen =
  | "start"
  | "playing"
  | "gameover"
  | "win"
  | "editor"
  | "community"
  | "playing_custom"
  | "leaderboard";

interface LeaderboardEntry {
  sessionId: string;
  username?: string;
  totalDeaths: bigint;
  totalWins: bigint;
  bestStage: bigint;
}

// ===================================================
// HELPER FUNCTION
// ===================================================

function buildCustomStageFromLevel(level: {
  name: string;
  platformsJson: string;
  worldWidth: number;
  bgHue: number;
}): StageConfig {
  return {
    id: 99,
    name: level.name,
    bgHue: level.bgHue,
    worldWidth: level.worldWidth,
    spinners: [],
    platforms: JSON.parse(level.platformsJson) as Platform[],
  };
}

// ===================================================
// LEADERBOARD SECTION
// ===================================================

function shortenId(id: string): string {
  if (id.length <= 16) return id;
  return `${id.slice(0, 8)}...${id.slice(-4)}`;
}

function LeaderboardSection({
  entries,
}: {
  entries: LeaderboardEntry[];
}) {
  if (entries.length === 0) return null;

  const rankClasses = ["lb-rank-1", "lb-rank-2", "lb-rank-3"];
  const rankEmoji = ["👑", "🥈", "🥉"];

  return (
    <div className="leaderboard-card">
      <div className="leaderboard-title">Top Survivors</div>
      {entries.map((entry, i) => {
        const displayName = entry.username || shortenId(entry.sessionId);
        const hasUsername = !!entry.username;
        return (
          <div key={entry.sessionId} className="leaderboard-row">
            <span className={`lb-rank ${rankClasses[i] ?? ""}`}>
              {rankEmoji[i] ?? `#${i + 1}`}
            </span>
            <span
              className={hasUsername ? "lb-username" : "lb-principal"}
              title={entry.sessionId}
              style={
                isOwner(displayName)
                  ? { color: "#22c55e", textShadow: "0 0 6px #22c55e" }
                  : {}
              }
            >
              {isOwner(displayName) ? `👑 ${displayName}` : displayName}
            </span>
            <span className="lb-stat">
              <span>
                Stage{" "}
                <span className="lb-stat-val">
                  {entry.bestStage.toString()}
                </span>
              </span>
              <span>
                Wins{" "}
                <span className="lb-stat-val">
                  {entry.totalWins.toString()}
                </span>
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ===================================================
// HEART ICON
// ===================================================

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <span
      style={{
        color: filled ? "#f87171" : "rgba(248,113,113,0.25)",
        textShadow: filled ? "0 0 8px #f87171" : "none",
        transition: "all 0.3s ease",
      }}
    >
      ❤
    </span>
  );
}

// ===================================================
// DRUM PULSE HUD ELEMENT
// ===================================================

function DrumPulse({ active }: { active: boolean }) {
  return (
    <div className="drum-pulse-container" data-ocid="hud.drum_pulse">
      <span className="drum-pulse-label">TUNG</span>
      <div className={`drum-ring ${active ? "pulse-active" : ""}`} />
      <span className="drum-pulse-label">TUNG</span>
      <div
        className={`drum-ring ${active ? "pulse-active" : ""}`}
        style={{ animationDelay: "0.15s" }}
      />
      <span className="drum-pulse-label">TUNG</span>
      <div
        className={`drum-ring ${active ? "pulse-active" : ""}`}
        style={{ animationDelay: "0.3s" }}
      />
    </div>
  );
}

// ===================================================
// START SCREEN
// ===================================================

interface StartScreenProps {
  onStart: () => void;
  onEditor: () => void;
  onCommunity: () => void;
  onLeaderboard: () => void;
  leaderboard: LeaderboardEntry[];
  personalBest: bigint | null;
  isLoading: boolean;
  username: string | null;
  onResetNames?: () => void;
  onTeleport?: (stage: number) => void;
}

function StartScreen({
  onStart,
  onEditor,
  onCommunity,
  onLeaderboard,
  leaderboard: _leaderboard,
  personalBest,
  isLoading,
  username,
  onResetNames,
  onTeleport,
}: StartScreenProps) {
  return (
    <div className="screen-overlay">
      <div className="screen-overlay-bg" />
      <div className="screen-content">
        {/* Creature silhouette decoration */}
        <svg
          className="creature-silhouette"
          viewBox="0 0 60 90"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-label="Tung Tung Tung Sahur creature silhouette"
          role="img"
        >
          <ellipse
            cx="30"
            cy="12"
            rx="9"
            ry="12"
            fill="#2d0a5e"
            stroke="#7c3aed"
            strokeWidth="2"
          />
          <line
            x1="30"
            y1="24"
            x2="30"
            y2="56"
            stroke="#2d0a5e"
            strokeWidth="3"
          />
          <line
            x1="30"
            y1="28"
            x2="10"
            y2="44"
            stroke="#2d0a5e"
            strokeWidth="3"
          />
          <line
            x1="30"
            y1="28"
            x2="50"
            y2="44"
            stroke="#2d0a5e"
            strokeWidth="3"
          />
          <line
            x1="30"
            y1="56"
            x2="18"
            y2="78"
            stroke="#2d0a5e"
            strokeWidth="3"
          />
          <line
            x1="30"
            y1="56"
            x2="42"
            y2="78"
            stroke="#2d0a5e"
            strokeWidth="3"
          />
          <circle cx="30" cy="40" r="10" stroke="#7c3aed" strokeWidth="2" />
        </svg>

        <h1 className="game-title">
          TUNG TUNG TUNG
          <br />
          SAHUR OBBY
        </h1>
        <p className="game-subtitle">
          Can you escape the creature? 10 stages of terror await.
        </p>

        {username && (
          <div className="playing-as-badge" data-ocid="start.username_badge">
            <span className="playing-as-label">Playing as</span>
            <span
              className="playing-as-name"
              style={
                isOwner(username)
                  ? { color: "#22c55e", textShadow: "0 0 8px #22c55e" }
                  : {}
              }
            >
              {isOwner(username) ? `👑 ${username}` : username}
            </span>
          </div>
        )}

        {personalBest !== null && (
          <div className="personal-best">
            <span className="personal-best-label">Personal Best</span>
            <span style={{ fontWeight: 800 }}>
              Stage {personalBest.toString()} / 10
            </span>
          </div>
        )}

        <div className="controls-card">
          <div className="controls-title">Controls</div>
          <div className="controls-row">
            <span className="key-hint">
              <span className="key-badge">W / ↑</span> Move left
            </span>
            <span className="key-hint">
              <span className="key-badge">A / ←</span> Move left
            </span>
            <span className="key-hint">
              <span className="key-badge">D / →</span> Move right
            </span>
            <span className="key-hint">
              <span className="key-badge">SPACE</span> Jump (×2)
            </span>
          </div>
        </div>

        <button
          type="button"
          className="game-button game-button-primary"
          onClick={onStart}
          disabled={isLoading}
          data-ocid="start.primary_button"
        >
          {isLoading ? "Loading..." : "▶ START GAME"}
        </button>

        <div style={{ display: "flex", gap: 12, width: "100%" }}>
          <button
            type="button"
            className="game-button game-button-secondary"
            onClick={onEditor}
            data-ocid="start.editor_button"
            style={{ flex: 1, fontSize: 14, padding: "12px 16px" }}
          >
            ⚙ LEVEL EDITOR
          </button>
          <button
            type="button"
            className="game-button game-button-secondary"
            onClick={onCommunity}
            data-ocid="start.community_button"
            style={{ flex: 1, fontSize: 14, padding: "12px 16px" }}
          >
            🌐 COMMUNITY
          </button>
        </div>

        <button
          type="button"
          className="lb-nav-btn"
          onClick={onLeaderboard}
          data-ocid="start.leaderboard_button"
        >
          🏆 LEADERBOARD
        </button>

        {isOwner(username) && onResetNames && (
          <button
            type="button"
            className="game-button"
            onClick={onResetNames}
            data-ocid="start.reset_names_button"
            style={{
              marginTop: 8,
              fontSize: 11,
              padding: "6px 14px",
              background: "rgba(239,68,68,0.15)",
              border: "1px solid rgba(239,68,68,0.4)",
              color: "rgba(239,68,68,0.8)",
            }}
          >
            🔴 Reset All Names (Owner Only)
          </button>
        )}
        {isOwner(username) && onTeleport && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 14px",
              background: "rgba(0,0,0,0.45)",
              border: "1px solid rgba(250,204,21,0.3)",
              borderRadius: 8,
              maxWidth: 320,
              width: "100%",
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "rgba(250,204,21,0.8)",
                marginBottom: 7,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              ⚡ Teleport to Stage
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 5,
                justifyContent: "center",
              }}
            >
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  data-ocid={`owner.teleport_button.${n}`}
                  onClick={() => onTeleport(n)}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 6,
                    border: "1px solid rgba(250,204,21,0.45)",
                    background: "rgba(250,204,21,0.1)",
                    color: "rgba(250,204,21,0.95)",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "rgba(250,204,21,0.25)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "rgba(250,204,21,0.1)";
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ===================================================
// WIN SCREEN
// ===================================================

interface WinScreenProps {
  deaths: number;
  onReplay: () => void;
  leaderboard: LeaderboardEntry[];
  isCustomLevel?: boolean;
  completionTimeMs?: number;
}

function WinScreen({
  deaths,
  onReplay,
  leaderboard,
  isCustomLevel,
  completionTimeMs,
}: WinScreenProps) {
  return (
    <div className="screen-overlay">
      <div className="screen-overlay-bg" />
      <div className="screen-content">
        <div className="win-title">
          {isCustomLevel ? (
            <>
              LEVEL COMPLETE!
              <br />
              YOU MADE IT!
            </>
          ) : (
            <>
              YOU ESCAPED
              <br />
              TUNG TUNG TUNG SAHUR!
            </>
          )}
        </div>
        <p className="game-subtitle">
          {isCustomLevel
            ? "You completed the custom level!"
            : "The creature's drum beats fade into the distance..."}
        </p>

        <div className="stats-row">
          <div className="stat-pill">
            <span className="stat-label">Deaths</span>
            <span className="stat-value">{deaths}</span>
          </div>
          <div className="stat-pill">
            <span className="stat-label">Stage</span>
            <span className="stat-value">
              {isCustomLevel ? "Custom ✓" : "10/10 ✓"}
            </span>
          </div>
          {completionTimeMs !== undefined && completionTimeMs > 0 && (
            <div className="stat-pill">
              <span className="stat-label">Time</span>
              <span
                className="stat-value"
                style={{ color: "var(--neon-cyan)" }}
              >
                {formatTime(completionTimeMs)}
              </span>
            </div>
          )}
        </div>

        {!isCustomLevel && (
          <LeaderboardSection entries={leaderboard.slice(0, 5)} />
        )}

        <button
          type="button"
          className="game-button game-button-primary"
          onClick={onReplay}
          data-ocid="win.primary_button"
        >
          {isCustomLevel ? "← Back to Menu" : "↺ PLAY AGAIN"}
        </button>
      </div>
    </div>
  );
}

// ===================================================
// GAME OVER SCREEN
// ===================================================

interface GameOverScreenProps {
  deaths: number;
  stage: number;
  onRetry: () => void;
  isCustomLevel?: boolean;
}

function GameOverScreen({
  deaths,
  stage,
  onRetry,
  isCustomLevel,
}: GameOverScreenProps) {
  return (
    <div className="screen-overlay">
      <div className="screen-overlay-bg" />
      <div className="screen-content">
        <div className="gameover-title">THE CREATURE GOT YOU...</div>
        <p className="game-subtitle" style={{ color: "rgba(248,113,113,0.7)" }}>
          Tung... tung... tung...
        </p>

        <div className="stats-row">
          <div className="stat-pill">
            <span className="stat-label">Deaths</span>
            <span className="stat-value">{deaths}</span>
          </div>
          <div className="stat-pill">
            <span className="stat-label">Reached Stage</span>
            <span className="stat-value">
              {isCustomLevel ? "Custom" : `${stage}/10`}
            </span>
          </div>
        </div>

        <button
          type="button"
          className="game-button game-button-secondary"
          onClick={onRetry}
          data-ocid="gameover.primary_button"
        >
          {isCustomLevel ? "← Back to Menu" : "↺ TRY AGAIN"}
        </button>
      </div>
    </div>
  );
}

// ===================================================
// STOPWATCH
// ===================================================

function formatStopwatch(ms: number): string {
  const totalMs = Math.floor(ms);
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const centiseconds = Math.floor((totalMs % 1000) / 10);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

interface StopwatchProps {
  running: boolean;
  resetSignal: number;
}

function Stopwatch({ running, resetSignal }: StopwatchProps) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const stateRef = useRef({ startTime: 0, running: false, rafId: 0 });

  // Unified effect: reacts to both running and resetSignal changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: resetSignal is an intentional trigger signal, not a ref
  useEffect(() => {
    const state = stateRef.current;
    cancelAnimationFrame(state.rafId);

    if (!running) {
      state.running = false;
      setElapsedMs(0);
      return;
    }

    state.running = true;
    state.startTime = Date.now();

    const tick = () => {
      if (!state.running) return;
      setElapsedMs(Date.now() - state.startTime);
      state.rafId = requestAnimationFrame(tick);
    };
    state.rafId = requestAnimationFrame(tick);

    return () => {
      state.running = false;
      cancelAnimationFrame(state.rafId);
    };
  }, [running, resetSignal]);

  return (
    <div className="hud-stopwatch" data-ocid="hud.stopwatch_panel">
      <span className="hud-stopwatch-label">TIME</span>
      <span className="hud-stopwatch-value">{formatStopwatch(elapsedMs)}</span>
    </div>
  );
}

// ===================================================
// HUD OVERLAY
// ===================================================

interface HUDProps {
  stage: number;
  lives: number;
  deaths: number;
  drumActive: boolean;
  isCustomLevel?: boolean;
  onMenu: () => void;
  username?: string | null;
  stopwatchRunning?: boolean;
  stopwatchResetSignal?: number;
}

function HUD({
  stage,
  lives,
  deaths,
  drumActive,
  isCustomLevel,
  onMenu,
  username,
  stopwatchRunning = false,
  stopwatchResetSignal = 0,
}: HUDProps) {
  return (
    <div className="game-hud">
      <div className="hud-top">
        <div className="hud-top-left">
          <button
            type="button"
            className="hud-menu-btn"
            onClick={onMenu}
            data-ocid="hud.menu_button"
            title="Back to Menu"
          >
            ← Menu
          </button>
          {!isCustomLevel && (
            <Stopwatch
              running={stopwatchRunning}
              resetSignal={stopwatchResetSignal}
            />
          )}
        </div>
        <div className="hud-panel hud-stage" data-ocid="hud.stage_panel">
          {isCustomLevel ? "Custom Level" : `Stage ${stage} / 10`}
        </div>
        <div className="hud-panel hud-lives" data-ocid="hud.lives_panel">
          <HeartIcon filled={lives >= 1} />
          <HeartIcon filled={lives >= 2} />
          <HeartIcon filled={lives >= 3} />
        </div>
        <div className="hud-panel hud-deaths" data-ocid="hud.deaths_panel">
          💀 {deaths}
        </div>
        {username &&
          (isOwner(username) ? (
            <div
              className="hud-panel hud-username"
              data-ocid="hud.username_panel"
              style={{ color: "#22c55e", textShadow: "0 0 8px #22c55e" }}
            >
              👑 {username}
            </div>
          ) : (
            <div
              className="hud-panel hud-username"
              data-ocid="hud.username_panel"
            >
              👤 {username}
            </div>
          ))}
      </div>
      <div className="hud-bottom">
        <DrumPulse active={drumActive} />
      </div>
    </div>
  );
}

// ===================================================
// TOUCH CONTROLS
// ===================================================

function TouchControls({ onJump }: { onJump: () => void }) {
  return (
    <div className="touch-controls">
      <div className="touch-left-zone">
        <span
          style={{
            color: "rgba(168,85,247,0.3)",
            fontSize: 12,
            fontFamily: "Sora",
          }}
        >
          ← drag →
        </span>
      </div>
      <div className="touch-right-zone">
        <button
          type="button"
          className="touch-jump-btn"
          onTouchStart={(e) => {
            e.preventDefault();
            onJump();
          }}
          data-ocid="touch.jump_button"
        >
          ↑
        </button>
      </div>
    </div>
  );
}

// ===================================================
// MAIN APP
// ===================================================

export default function App() {
  const { actor } = useActor();
  const sessionIdRef = useRef<string>(getOrCreateSessionId());
  const [screen, setScreen] = useState<GameScreen>("start");
  const [stage, setStage] = useState(1);
  const [lives, setLives] = useState(3);
  const [deaths, setDeaths] = useState(0);
  const [drumActive, setDrumActive] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [speedLeaderboard, setSpeedLeaderboard] = useState<
    SpeedLeaderboardEntry[]
  >([]);
  const [personalBest, setPersonalBest] = useState<bigint | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(false);
  const [finalDeaths, setFinalDeaths] = useState(0);
  const [finalStage, setFinalStage] = useState(1);
  const [finalCompletionTimeMs, setFinalCompletionTimeMs] = useState(0);

  // Username state — do NOT pre-populate from localStorage.
  // Always verify against the backend first so different users on the
  // same device don't inherit a previous player's name/owner tag.
  const [username, setUsername] = useState<string | null>(null);
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [usernameMap, setUsernameMap] = useState<Map<string, string>>(
    new Map(),
  );

  // Timer for speed runs
  const startTimeRef = useRef<number | null>(null);

  // Stopwatch state for HUD display
  const [stopwatchRunning, setStopwatchRunning] = useState(false);
  const [stopwatchResetSignal, setStopwatchResetSignal] = useState(0);

  // Custom level state
  const [customStageToPlay, setCustomStageToPlay] =
    useState<StageConfig | null>(null);
  const [userExistingLevel, setUserExistingLevel] = useState<{
    name: string;
    platformsJson: string;
    worldWidth: number;
    bgHue: number;
  } | null>(null);

  const [startStageOverride, setStartStageOverride] = useState<number>(1);
  const gameActiveRef = useRef(false);

  // Load leaderboard + user's saved level
  const loadLeaderboard = useCallback(async () => {
    if (!actor) return;
    setIsLeaderboardLoading(true);
    try {
      const [lb, speedLb, stats] = await Promise.all([
        actor.getLeaderboard(),
        actor.getSpeedLeaderboard(),
        actor.getMyStats(sessionIdRef.current),
      ]);

      // Build usernameMap keyed by sessionId for community levels and other uses
      const newUsernameMap = new Map<string, string>();
      for (const row of lb) {
        if (row.username) newUsernameMap.set(row.sessionId, row.username);
      }
      for (const row of speedLb) {
        if (row.username && !newUsernameMap.has(row.sessionId)) {
          newUsernameMap.set(row.sessionId, row.username);
        }
      }
      setUsernameMap(newUsernameMap);

      const entries: LeaderboardEntry[] = lb
        .map((row) => ({
          sessionId: row.sessionId,
          username: row.username || undefined,
          totalDeaths: row.totalDeaths,
          totalWins: row.totalWins,
          bestStage: row.bestStage,
        }))
        .sort((a, b) => {
          if (a.bestStage > b.bestStage) return -1;
          if (a.bestStage < b.bestStage) return 1;
          return Number(a.totalDeaths) - Number(b.totalDeaths);
        })
        .slice(0, 100);

      const speedEntries: SpeedLeaderboardEntry[] = speedLb
        .filter((row) => row.bestCompletionTimeMs > 0n)
        .map((row) => ({
          sessionId: row.sessionId,
          username: row.username || undefined,
          bestCompletionTimeMs: row.bestCompletionTimeMs,
          totalWins: row.totalWins,
        }))
        .sort(
          (a, b) =>
            Number(a.bestCompletionTimeMs) - Number(b.bestCompletionTimeMs),
        )
        .slice(0, 100);

      setLeaderboard(entries);
      setSpeedLeaderboard(speedEntries);

      if (stats && stats.bestStage > 0n) {
        setPersonalBest(stats.bestStage);
      }
    } catch {
      // Silently fail if backend unavailable
    } finally {
      setIsLeaderboardLoading(false);
    }
  }, [actor]);

  // Load user's existing custom level
  const loadUserLevel = useCallback(async () => {
    if (!actor) return;
    try {
      const myLevel = await actor.getMyLevel(sessionIdRef.current);
      if (myLevel) {
        setUserExistingLevel({
          name: myLevel.name,
          platformsJson: myLevel.platformsJson,
          worldWidth: Number(myLevel.worldWidth),
          bgHue: Number(myLevel.bgHue),
        });
      }
    } catch {
      // Silently fail
    }
  }, [actor]);

  useEffect(() => {
    if (actor) {
      loadLeaderboard();
      loadUserLevel();
    }
  }, [actor, loadLeaderboard, loadUserLevel]);

  // On actor ready, check username status using stable session ID
  useEffect(() => {
    if (!actor) return;
    const checkUsername = async () => {
      try {
        const sessionId = sessionIdRef.current;
        const backendName = await actor.getMyUsername(sessionId);
        if (backendName) {
          setUsername(backendName);
          setShowUsernameModal(false);
          if (backendName === "tung_master") {
            actor.claimOwnerPrincipal("tungmaster2024owner").catch(() => {});
          }
        } else {
          // No name for this session — prompt to register
          setUsername(null);
          setShowUsernameModal(true);
        }
      } catch {
        // Silently fail — don't block gameplay
      }
    };
    checkUsername();
  }, [actor]);

  // Handle username registration
  const handleConfirmUsername = useCallback(
    async (name: string) => {
      if (!actor) throw new Error("Not connected");
      const sessionId = sessionIdRef.current;
      try {
        await actor.registerUsername(sessionId, name);
        setUsername(name);
        setShowUsernameModal(false);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const isTakenError =
          msg.toLowerCase().includes("already") ||
          msg.toLowerCase().includes("taken");

        // Special owner reclaim path — tung_master can always reclaim their name
        if (name === "tung_master" && isTakenError) {
          try {
            await actor.adminResetUsernames("tungmaster2024owner");
            await actor.registerUsername(sessionId, name);
            setUsername(name);
            setShowUsernameModal(false);
            return;
          } catch {
            // Fall through to throw original error
          }
        }

        // Check if they already have a username (edge case)
        if (isTakenError) {
          // Try to retrieve their existing name from the backend
          try {
            const existing = await actor.getMyUsername(sessionId);
            if (existing) {
              setUsername(existing);
              setShowUsernameModal(false);
              return;
            }
          } catch {
            // Fall through to throw original error
          }
        }
        throw err;
      }
    },
    [actor],
  );

  const handleStart = useCallback(() => {
    setStartStageOverride(1);
    setScreen("playing");
    setStage(1);
    setLives(3);
    setDeaths(0);
    setDrumActive(false);
    gameActiveRef.current = true;
    startTimeRef.current = Date.now();
    setStopwatchResetSignal((s) => s + 1);
    setStopwatchRunning(true);
  }, []);

  const handleTeleport = useCallback((stageNum: number) => {
    setStartStageOverride(stageNum);
    setScreen("playing");
    setStage(stageNum);
    setLives(3);
    setDeaths(0);
    setDrumActive(false);
    gameActiveRef.current = true;
    startTimeRef.current = Date.now();
    setStopwatchResetSignal((s) => s + 1);
    setStopwatchRunning(true);
  }, []);

  const handleDeath = useCallback((totalDeaths: number) => {
    setDeaths(totalDeaths);
    setLives((prev) => Math.max(0, prev - 1));
  }, []);

  const handleStageChange = useCallback((newStage: number) => {
    setStage(newStage);
  }, []);

  const handleGameOver = useCallback(
    async (stageReached: number, totalDeaths: number) => {
      setFinalDeaths(totalDeaths);
      setFinalStage(stageReached);
      setFinalCompletionTimeMs(0);
      setScreen("gameover");
      gameActiveRef.current = false;
      setStopwatchRunning(false);

      if (actor) {
        try {
          await actor.saveGameResult(
            sessionIdRef.current,
            BigInt(stageReached),
            BigInt(totalDeaths),
            0n,
          );
          await loadLeaderboard();
        } catch {
          // Silently fail
        }
      }
    },
    [actor, loadLeaderboard],
  );

  const handleWin = useCallback(
    async (totalDeaths: number) => {
      const elapsedMs =
        startTimeRef.current !== null ? Date.now() - startTimeRef.current : 0;
      setFinalDeaths(totalDeaths);
      setFinalStage(10);
      setFinalCompletionTimeMs(elapsedMs);
      setScreen("win");
      gameActiveRef.current = false;
      setStopwatchRunning(false);

      if (actor) {
        try {
          await actor.saveGameResult(
            sessionIdRef.current,
            BigInt(10),
            BigInt(totalDeaths),
            BigInt(elapsedMs),
          );
          await loadLeaderboard();
        } catch {
          // Silently fail
        }
      }
    },
    [actor, loadLeaderboard],
  );

  const handleRetry = useCallback(() => {
    setIsLoading(true);
    setStopwatchRunning(false);
    setTimeout(() => {
      setScreen("playing");
      setStage(1);
      setLives(3);
      setDeaths(0);
      setDrumActive(false);
      gameActiveRef.current = true;
      startTimeRef.current = Date.now();
      setStopwatchResetSignal((s) => s + 1);
      setStopwatchRunning(true);
      setIsLoading(false);
    }, 100);
  }, []);

  const handleCheckpoint = useCallback(() => {
    // Checkpoint activated — just a feedback hook
  }, []);

  const handleResetNames = useCallback(async () => {
    if (!actor) return;
    if (
      !window.confirm(
        "Reset ALL usernames? Everyone will need to re-register. This cannot be undone.",
      )
    )
      return;
    try {
      await actor.adminResetUsernames("tungmaster2024owner");
      // Clear own username state so owner is also re-prompted
      setUsername(null);
      setShowUsernameModal(true);
    } catch (err) {
      alert(`Failed to reset: ${String(err)}`);
    }
  }, [actor]);

  const handleDrumPulse = useCallback((active: boolean) => {
    setDrumActive(active);
  }, []);

  // Custom level game over (from playing_custom)
  const handleCustomGameOver = useCallback(
    (_stageReached: number, totalDeaths: number) => {
      setFinalDeaths(totalDeaths);
      setFinalStage(99);
      setScreen("gameover");
      gameActiveRef.current = false;
    },
    [],
  );

  const handleCustomWin = useCallback((totalDeaths: number) => {
    setFinalDeaths(totalDeaths);
    setFinalStage(99);
    setScreen("win");
    gameActiveRef.current = false;
  }, []);

  // Editor handlers
  const handleEditorTest = useCallback((stage: StageConfig) => {
    setCustomStageToPlay(stage);
    setScreen("playing_custom");
    setStage(99);
    setLives(3);
    setDeaths(0);
    setDrumActive(false);
    gameActiveRef.current = true;
  }, []);

  const handleEditorPublish = useCallback(
    async (stage: StageConfig) => {
      if (!actor) throw new Error("Not connected");
      await actor.saveCustomLevel(
        sessionIdRef.current,
        stage.name,
        JSON.stringify(stage.platforms),
        BigInt(stage.worldWidth),
        BigInt(stage.bgHue),
      );
      setUserExistingLevel({
        name: stage.name,
        platformsJson: JSON.stringify(stage.platforms),
        worldWidth: stage.worldWidth,
        bgHue: stage.bgHue,
      });
    },
    [actor],
  );

  // Community play handler
  const handlePlayCommunityLevel = useCallback(
    (level: {
      name: string;
      platformsJson: string;
      worldWidth: number;
      bgHue: number;
    }) => {
      const stage = buildCustomStageFromLevel(level);
      setCustomStageToPlay(stage);
      setScreen("playing_custom");
      setStage(99);
      setLives(3);
      setDeaths(0);
      setDrumActive(false);
      gameActiveRef.current = true;
    },
    [],
  );

  const year = new Date().getFullYear();
  const hostname =
    typeof window !== "undefined"
      ? encodeURIComponent(window.location.hostname)
      : "";

  const isCustomLevel = screen === "playing_custom";
  const isGameplaying = screen === "playing" || screen === "playing_custom";
  const isNonGameScreen =
    screen === "editor" || screen === "community" || screen === "leaderboard";

  return (
    <div className="game-container">
      {/* Canvas game - hidden when editor, community, or leaderboard is open */}
      <div
        style={{
          display: isNonGameScreen ? "none" : "block",
          width: "100%",
          height: "100%",
        }}
      >
        <ObbyCoreGame
          onDeath={handleDeath}
          onStageChange={handleStageChange}
          onGameOver={isCustomLevel ? handleCustomGameOver : handleGameOver}
          onWin={isCustomLevel ? handleCustomWin : handleWin}
          onCheckpoint={handleCheckpoint}
          gameActive={isGameplaying}
          drumPulseSignal={handleDrumPulse}
          startStage={startStageOverride}
          customStage={
            isCustomLevel ? (customStageToPlay ?? undefined) : undefined
          }
        />
      </div>

      {/* Editor screen */}
      {screen === "editor" && (
        <LevelEditor
          onBack={() => setScreen("start")}
          onTestLevel={handleEditorTest}
          onPublish={handleEditorPublish}
          sessionId={sessionIdRef.current}
          existingLevel={userExistingLevel}
        />
      )}

      {/* Community screen */}
      {screen === "community" && (
        <CommunityLevels
          onBack={() => setScreen("start")}
          onPlayLevel={handlePlayCommunityLevel}
          usernameMap={usernameMap}
          sessionId={sessionIdRef.current}
        />
      )}

      {/* Leaderboard screen */}
      {screen === "leaderboard" && (
        <LeaderboardScreen
          leaderboard={leaderboard}
          speedLeaderboard={speedLeaderboard}
          isLoading={isLeaderboardLoading}
          onBack={() => setScreen("start")}
          usernameMap={usernameMap}
        />
      )}

      {/* Fog + scanlines overlay (only during gameplay) */}
      {!isNonGameScreen && (
        <>
          <div className="fog-overlay" />
          <div className="scanlines" />
        </>
      )}

      {/* HUD (only during gameplay) */}
      {isGameplaying && (
        <HUD
          stage={stage}
          lives={lives}
          deaths={deaths}
          drumActive={drumActive}
          isCustomLevel={isCustomLevel}
          onMenu={() => {
            gameActiveRef.current = false;
            setStopwatchRunning(false);
            setScreen("start");
          }}
          username={username}
          stopwatchRunning={stopwatchRunning && !isCustomLevel}
          stopwatchResetSignal={stopwatchResetSignal}
        />
      )}

      {/* Touch controls (only during gameplay) */}
      {isGameplaying && (
        <TouchControls
          onJump={() => {
            /* jump handled via touch events in canvas */
          }}
        />
      )}

      {/* Screen overlays */}
      {screen === "start" && (
        <StartScreen
          onStart={handleStart}
          onEditor={() => setScreen("editor")}
          onCommunity={() => setScreen("community")}
          onLeaderboard={() => {
            loadLeaderboard();
            setScreen("leaderboard");
          }}
          leaderboard={leaderboard}
          personalBest={personalBest}
          isLoading={isLoading}
          username={username}
          onResetNames={handleResetNames}
          onTeleport={handleTeleport}
        />
      )}

      {screen === "win" && (
        <WinScreen
          deaths={finalDeaths}
          onReplay={isCustomLevel ? () => setScreen("start") : handleRetry}
          leaderboard={leaderboard}
          isCustomLevel={finalStage === 99}
          completionTimeMs={finalCompletionTimeMs}
        />
      )}

      {screen === "gameover" && (
        <GameOverScreen
          deaths={finalDeaths}
          stage={finalStage}
          onRetry={finalStage === 99 ? () => setScreen("start") : handleRetry}
          isCustomLevel={finalStage === 99}
        />
      )}

      {/* Footer */}
      {!isNonGameScreen && (
        <footer className="game-footer">
          © {year}.{" "}
          <a
            href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${hostname}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Built with ❤ using caffeine.ai
          </a>
        </footer>
      )}

      {/* Username setup modal — blocks everything when shown */}
      {showUsernameModal && <UsernameModal onConfirm={handleConfirmUsername} />}
    </div>
  );
}
