import { useCallback, useEffect, useState } from "react";
import { useActor } from "../hooks/useActor";

// ===================================================
// TYPES
// ===================================================

interface CommunityLevelItem {
  id: string;
  name: string;
  author: string;
  platformsJson: string;
  worldWidth: number;
  bgHue: number;
  createdAt: bigint;
}

interface MyLevelItem {
  id: bigint;
  name: string;
  platformsJson: string;
  worldWidth: number;
  bgHue: number;
}

interface CommunityLevelsProps {
  onBack: () => void;
  onPlayLevel: (level: {
    name: string;
    platformsJson: string;
    worldWidth: number;
    bgHue: number;
  }) => void;
  usernameMap?: Map<string, string>;
  sessionId: string;
}

// ===================================================
// COMPONENT
// ===================================================

export default function CommunityLevels({
  onBack,
  onPlayLevel,
  usernameMap,
  sessionId,
}: CommunityLevelsProps) {
  const { actor } = useActor();
  const [levels, setLevels] = useState<CommunityLevelItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // My published levels state
  const [myLevels, setMyLevels] = useState<MyLevelItem[]>([]);
  const [isMyLevelsLoading, setIsMyLevelsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<bigint | null>(null);

  const OWNER_USERNAME = "tung_master";

  const formatAuthor = (principal: string) => {
    const username = usernameMap?.get(principal);
    if (username) return username;
    if (principal.length <= 12) return principal;
    return `${principal.slice(0, 8)}…${principal.slice(-4)}`;
  };

  const isOwner = (principal: string) => {
    const username = usernameMap?.get(principal);
    return username === OWNER_USERNAME;
  };

  const loadMyLevels = useCallback(async () => {
    if (!actor) return;
    setIsMyLevelsLoading(true);
    try {
      const rawMyLevels = await actor.getMyLevels(sessionId);
      const parsed: MyLevelItem[] = rawMyLevels.map((lvl) => ({
        id: lvl.id,
        name: lvl.name || "Unnamed Level",
        platformsJson: lvl.platformsJson,
        worldWidth: Number(lvl.worldWidth),
        bgHue: Number(lvl.bgHue),
      }));
      // Sort newest first
      parsed.sort((a, b) => {
        // id is auto-incremented so higher = newer
        return a.id < b.id ? 1 : -1;
      });
      setMyLevels(parsed);
    } catch {
      // Silently fail — non-critical
    } finally {
      setIsMyLevelsLoading(false);
    }
  }, [actor, sessionId]);

  const loadPublicLevels = useCallback(async () => {
    if (!actor) return;
    setIsLoading(true);
    try {
      const rawLevels = await actor.getPublicLevels();
      const parsed: CommunityLevelItem[] = rawLevels.map((lvl) => ({
        id: lvl.id.toString(),
        name: lvl.name || "Unnamed Level",
        author: lvl.authorSession,
        platformsJson: lvl.platformsJson,
        worldWidth: Number(lvl.worldWidth),
        bgHue: Number(lvl.bgHue),
        createdAt: lvl.createdAt,
      }));
      parsed.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      setLevels(parsed);
    } catch {
      setError("Failed to load community levels.");
    } finally {
      setIsLoading(false);
    }
  }, [actor]);

  useEffect(() => {
    if (!actor) return;
    void loadMyLevels();
    void loadPublicLevels();
  }, [actor, loadMyLevels, loadPublicLevels]);

  const handleDeleteMyLevel = useCallback(
    async (id: bigint) => {
      if (!actor) return;
      setDeletingId(id);
      try {
        await actor.deleteLevel(sessionId, id);
        // Refresh both lists after deletion
        await Promise.all([loadMyLevels(), loadPublicLevels()]);
      } catch {
        // Silently fail
      } finally {
        setDeletingId(null);
      }
    },
    [actor, sessionId, loadMyLevels, loadPublicLevels],
  );

  const slotsUsed = myLevels.length;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(5, 3, 15, 0.97)",
        backdropFilter: "blur(4px)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Bricolage Grotesque', sans-serif",
        zIndex: 30,
        overflowY: "auto",
      }}
    >
      {/* Header */}
      <div
        style={{
          position: "sticky",
          top: 0,
          background: "rgba(10, 5, 25, 0.97)",
          borderBottom: "1px solid rgba(168,85,247,0.2)",
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          gap: 16,
          zIndex: 10,
        }}
      >
        <button
          type="button"
          onClick={onBack}
          data-ocid="community.back_button"
          style={{
            padding: "8px 18px",
            background: "rgba(168,85,247,0.1)",
            border: "1px solid rgba(168,85,247,0.3)",
            borderRadius: 6,
            color: "rgba(200,180,255,0.8)",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          ← Back
        </button>
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: "clamp(18px, 3vw, 28px)",
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              background: "linear-gradient(135deg, #e879f9, #a855f7, #22d3ee)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            🌐 Community Levels
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: "rgba(200,180,255,0.5)",
              marginTop: 2,
            }}
          >
            Play levels created by the community
          </p>
        </div>
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          padding: "24px",
          maxWidth: 860,
          margin: "0 auto",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {/* ===== MY PUBLISHED LEVELS SECTION ===== */}
        <div
          style={{
            marginBottom: 32,
          }}
        >
          {/* Section header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "#e879f9",
                  marginBottom: 2,
                }}
              >
                📁 My Published Levels
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "rgba(200,180,255,0.4)",
                }}
              >
                You can publish up to 2 levels
              </div>
            </div>
            {/* Slot usage indicator */}
            {!isMyLevelsLoading && (
              <div
                style={{
                  padding: "4px 12px",
                  background:
                    slotsUsed >= 2
                      ? "rgba(248,113,113,0.12)"
                      : "rgba(74,222,128,0.1)",
                  border: `1px solid ${slotsUsed >= 2 ? "rgba(248,113,113,0.35)" : "rgba(74,222,128,0.3)"}`,
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 700,
                  color:
                    slotsUsed >= 2
                      ? "rgba(248,113,113,0.9)"
                      : "rgba(74,222,128,0.9)",
                  letterSpacing: "0.04em",
                }}
              >
                {slotsUsed}/2 slots used
              </div>
            )}
          </div>

          {/* Loading */}
          {isMyLevelsLoading && (
            <div
              data-ocid="my_levels.loading_state"
              style={{
                padding: "20px",
                textAlign: "center",
                color: "rgba(168,85,247,0.5)",
                fontSize: 12,
              }}
            >
              Loading your levels...
            </div>
          )}

          {/* Empty state */}
          {!isMyLevelsLoading && myLevels.length === 0 && (
            <div
              data-ocid="my_levels.empty_state"
              style={{
                padding: "20px 24px",
                background: "rgba(168,85,247,0.04)",
                border: "1px dashed rgba(168,85,247,0.2)",
                borderRadius: 10,
                textAlign: "center",
                color: "rgba(200,180,255,0.4)",
                fontSize: 13,
              }}
            >
              You haven't published any levels yet. Use the{" "}
              <strong style={{ color: "rgba(168,85,247,0.7)" }}>
                Level Editor
              </strong>{" "}
              to build and share your creation!
            </div>
          )}

          {/* My level cards */}
          {!isMyLevelsLoading && myLevels.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {myLevels.map((level, index) => {
                const posIndex = index + 1;
                const isDeleting = deletingId === level.id;
                return (
                  <div
                    key={level.id.toString()}
                    data-ocid={`my_levels.item.${posIndex}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      padding: "14px 18px",
                      background: "rgba(232,121,249,0.06)",
                      border: "1px solid rgba(232,121,249,0.2)",
                      borderRadius: 10,
                      transition: "border-color 0.15s",
                      opacity: isDeleting ? 0.5 : 1,
                    }}
                  >
                    {/* Hue badge */}
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 8,
                        background: `linear-gradient(135deg, hsl(${level.bgHue}, 70%, 20%), hsl(${level.bgHue + 40}, 60%, 10%))`,
                        border: `1px solid hsl(${level.bgHue}, 60%, 35%)`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 18,
                        flexShrink: 0,
                      }}
                    >
                      ✏️
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 800,
                          color: "#e0d0ff",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {level.name}
                      </div>
                      <div
                        style={{
                          fontSize: 9,
                          color: "rgba(200,180,255,0.4)",
                          marginTop: 3,
                          fontFamily: "'Sora', monospace",
                        }}
                      >
                        {level.worldWidth}px wide · Slot {posIndex}
                      </div>
                    </div>

                    {/* Play button */}
                    <button
                      type="button"
                      onClick={() =>
                        onPlayLevel({
                          name: level.name,
                          platformsJson: level.platformsJson,
                          worldWidth: level.worldWidth,
                          bgHue: level.bgHue,
                        })
                      }
                      disabled={isDeleting}
                      data-ocid={`my_levels.play_button.${posIndex}`}
                      style={{
                        padding: "8px 16px",
                        background: "linear-gradient(135deg, #22d3ee, #0891b2)",
                        border: "none",
                        borderRadius: 7,
                        color: "#05030f",
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: isDeleting ? "not-allowed" : "pointer",
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                        boxShadow: "0 0 14px rgba(34,211,238,0.25)",
                        transition: "transform 0.1s",
                        flexShrink: 0,
                        whiteSpace: "nowrap",
                      }}
                    >
                      ▶ Play
                    </button>

                    {/* Delete button */}
                    <button
                      type="button"
                      onClick={() => handleDeleteMyLevel(level.id)}
                      disabled={isDeleting}
                      data-ocid={`my_levels.delete_button.${posIndex}`}
                      style={{
                        padding: "8px 14px",
                        background: "rgba(248,113,113,0.1)",
                        border: "1px solid rgba(248,113,113,0.3)",
                        borderRadius: 7,
                        color: isDeleting
                          ? "rgba(248,113,113,0.4)"
                          : "rgba(248,113,113,0.85)",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: isDeleting ? "not-allowed" : "pointer",
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        transition: "all 0.1s",
                        flexShrink: 0,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {isDeleting ? "..." : "✕ Delete"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Divider */}
        <div
          style={{
            height: 1,
            background:
              "linear-gradient(to right, transparent, rgba(168,85,247,0.3), transparent)",
            marginBottom: 28,
          }}
        />

        {/* ===== COMMUNITY LEVELS SECTION ===== */}
        <div
          style={{
            fontSize: 13,
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "rgba(168,85,247,0.8)",
            marginBottom: 14,
          }}
        >
          🎮 All Community Levels
        </div>

        {/* Loading state */}
        {isLoading && (
          <div
            data-ocid="community.loading_state"
            style={{
              textAlign: "center",
              padding: "60px 0",
              color: "rgba(168,85,247,0.6)",
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                border: "3px solid rgba(168,85,247,0.2)",
                borderTopColor: "#a855f7",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
                margin: "0 auto 16px",
              }}
            />
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Loading levels...
            </div>
            <style>
              {"@keyframes spin { to { transform: rotate(360deg); } }"}
            </style>
          </div>
        )}

        {/* Error state */}
        {!isLoading && error && (
          <div
            data-ocid="community.error_state"
            style={{
              textAlign: "center",
              padding: "60px 0",
              color: "rgba(248,113,113,0.8)",
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚠</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{error}</div>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && levels.length === 0 && (
          <div
            data-ocid="community.empty_state"
            style={{
              textAlign: "center",
              padding: "60px 20px",
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }}>
              🏗️
            </div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: "rgba(200,180,255,0.7)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 8,
              }}
            >
              No community levels yet
            </div>
            <div style={{ fontSize: 13, color: "rgba(200,180,255,0.4)" }}>
              Be the first to publish one! Use the Level Editor to build and
              share your creation.
            </div>
          </div>
        )}

        {/* Level cards */}
        {!isLoading && !error && levels.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {levels.map((level, index) => (
              <div
                key={level.id}
                data-ocid={`community.level.item.${index + 1}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "16px 20px",
                  background: "rgba(168,85,247,0.05)",
                  border: "1px solid rgba(168,85,247,0.2)",
                  borderRadius: 10,
                  transition: "border-color 0.15s, background 0.15s",
                }}
              >
                {/* Hue badge */}
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 8,
                    background: `linear-gradient(135deg, hsl(${level.bgHue}, 70%, 20%), hsl(${level.bgHue + 40}, 60%, 10%))`,
                    border: `1px solid hsl(${level.bgHue}, 60%, 35%)`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 20,
                    flexShrink: 0,
                  }}
                >
                  🎮
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 800,
                        color: "#e0d0ff",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flex: "0 1 auto",
                        minWidth: 0,
                      }}
                    >
                      {level.name}
                    </div>
                    {isOwner(level.author) && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 2,
                          padding: "1px 5px",
                          background: "rgba(34,197,94,0.1)",
                          border: "1px solid rgba(34,197,94,0.3)",
                          borderRadius: 4,
                          fontSize: 9,
                          fontWeight: 700,
                          color: "#22c55e",
                          letterSpacing: "0.05em",
                          textTransform: "uppercase",
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}
                      >
                        🔒 Protected
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: isOwner(level.author)
                        ? "#22c55e"
                        : "rgba(200,180,255,0.45)",
                      fontFamily: "'Sora', monospace",
                      marginTop: 3,
                      textShadow: isOwner(level.author)
                        ? "0 0 6px #22c55e"
                        : "none",
                    }}
                  >
                    by{" "}
                    {isOwner(level.author)
                      ? `👑 ${formatAuthor(level.author)}`
                      : formatAuthor(level.author)}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 12,
                      marginTop: 5,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 9,
                        padding: "2px 6px",
                        background: "rgba(168,85,247,0.1)",
                        border: "1px solid rgba(168,85,247,0.2)",
                        borderRadius: 4,
                        color: "rgba(168,85,247,0.7)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      {level.worldWidth}px wide
                    </span>
                  </div>
                </div>

                {/* Play button */}
                <button
                  type="button"
                  onClick={() =>
                    onPlayLevel({
                      name: level.name,
                      platformsJson: level.platformsJson,
                      worldWidth: level.worldWidth,
                      bgHue: level.bgHue,
                    })
                  }
                  data-ocid={`community.play_button.${index + 1}`}
                  style={{
                    padding: "10px 22px",
                    background: "linear-gradient(135deg, #a855f7, #e879f9)",
                    border: "none",
                    borderRadius: 8,
                    color: "#05030f",
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: "pointer",
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    boxShadow: "0 0 20px rgba(168,85,247,0.3)",
                    transition: "transform 0.1s, box-shadow 0.1s",
                    flexShrink: 0,
                    whiteSpace: "nowrap",
                  }}
                >
                  ▶ Play
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
