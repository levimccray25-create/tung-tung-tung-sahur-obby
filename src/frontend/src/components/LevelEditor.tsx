import { useCallback, useEffect, useRef, useState } from "react";
import type { Platform, StageConfig } from "./ObbyCoreGame";

// ===================================================
// TYPES
// ===================================================

interface LevelEditorProps {
  onBack: () => void;
  onTestLevel: (stage: StageConfig) => void;
  onPublish: (stage: StageConfig) => Promise<void>;
  sessionId: string;
  existingLevel?: {
    name: string;
    platformsJson: string;
    worldWidth: number;
    bgHue: number;
  } | null;
}

interface PlacingState {
  active: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

type PlatformType =
  | "static"
  | "moving"
  | "jump_pad"
  | "boost"
  | "checkpoint"
  | "finish";

type EditorSlot = 1 | 2;

interface SlotData {
  name: string;
  platformsJson: string;
  worldWidth: number;
  bgHue: number;
}

const PLATFORM_COLORS: Record<PlatformType, string> = {
  static: "#a855f7",
  moving: "#22d3ee",
  jump_pad: "#fbbf24",
  boost: "#4ade80",
  checkpoint: "#4ade80",
  finish: "#fbbf24",
};

const PLATFORM_LABELS: Record<PlatformType, string> = {
  static: "Platform",
  moving: "Moving",
  jump_pad: "Jump Pad",
  boost: "Boost",
  checkpoint: "Checkpoint",
  finish: "Finish",
};

const PLATFORM_ICONS: Record<PlatformType, string> = {
  static: "▬",
  moving: "↔",
  jump_pad: "⬆",
  boost: "⚡",
  checkpoint: "⚑",
  finish: "🏁",
};

const GRID = 40;
const DEFAULT_WORLD_WIDTH = 3200;
const SPAWN_X = 60;
const SPAWN_Y = 440;
const DEFAULT_BG_HUE = 260;
const DEFAULT_LEVEL_NAME = "My Level";

// ===================================================
// SLOT STORAGE HELPERS
// ===================================================

function getSlotKey(
  sessionId: string,
  slot: EditorSlot,
  field: string,
): string {
  return `levelEditor_${sessionId}_slot${slot}_${field}`;
}

function loadSlotData(sessionId: string, slot: EditorSlot): SlotData {
  const name =
    localStorage.getItem(getSlotKey(sessionId, slot, "name")) ??
    DEFAULT_LEVEL_NAME;
  const platformsJson =
    localStorage.getItem(getSlotKey(sessionId, slot, "platforms")) ?? "[]";
  const worldWidth = Number(
    localStorage.getItem(getSlotKey(sessionId, slot, "worldWidth")) ??
      DEFAULT_WORLD_WIDTH,
  );
  const bgHue = Number(
    localStorage.getItem(getSlotKey(sessionId, slot, "bgHue")) ??
      DEFAULT_BG_HUE,
  );
  return { name, platformsJson, worldWidth, bgHue };
}

function saveSlotData(sessionId: string, slot: EditorSlot, data: SlotData) {
  localStorage.setItem(getSlotKey(sessionId, slot, "name"), data.name);
  localStorage.setItem(
    getSlotKey(sessionId, slot, "platforms"),
    data.platformsJson,
  );
  localStorage.setItem(
    getSlotKey(sessionId, slot, "worldWidth"),
    String(data.worldWidth),
  );
  localStorage.setItem(
    getSlotKey(sessionId, slot, "bgHue"),
    String(data.bgHue),
  );
}

// ===================================================
// HELPERS
// ===================================================

function snapToGrid(v: number): number {
  return Math.round(v / GRID) * GRID;
}

function getDefaultSize(type: PlatformType): { w: number; h: number } {
  switch (type) {
    case "jump_pad":
      return { w: 80, h: 16 };
    case "boost":
      return { w: 100, h: 8 };
    case "checkpoint":
      return { w: 20, h: 60 };
    case "finish":
      return { w: 30, h: 80 };
    default:
      return { w: 120, h: 20 };
  }
}

function buildEditorPlatform(
  type: PlatformType,
  x: number,
  y: number,
  w: number,
  h: number,
): Platform {
  const base: Platform = {
    x,
    y,
    w,
    h,
    type: type === "moving" ? "moving" : type,
    glowColor: PLATFORM_COLORS[type],
    active: type !== "checkpoint",
    t: 0,
  };
  if (type === "moving") {
    base.startX = x;
    base.startY = y;
    base.dx = 80;
    base.dy = 0;
    base.rangeX = 150;
    base.rangeY = 0;
  }
  return base;
}

// ===================================================
// EDITOR CANVAS RENDERER
// ===================================================

function renderEditor(
  canvas: HTMLCanvasElement,
  platforms: Platform[],
  cameraX: number,
  worldWidth: number,
  bgHue: number,
  selectedType: PlatformType,
  placing: PlacingState,
  hoveredIndex: number,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;

  // Background
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, `hsl(${bgHue}, 70%, 3%)`);
  grad.addColorStop(1, `hsl(${bgHue + 20}, 50%, 7%)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(-cameraX, 0);

  // World bounds overlay
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  if (cameraX < 0) ctx.fillRect(cameraX, 0, -cameraX, H);
  const worldEnd = worldWidth - cameraX;
  if (worldEnd < W) ctx.fillRect(worldEnd + cameraX, 0, W - worldEnd, H);
  ctx.restore();

  // Grid
  ctx.save();
  ctx.strokeStyle = `hsla(${bgHue}, 60%, 50%, 0.08)`;
  ctx.lineWidth = 0.5;
  const startCol = Math.floor(Math.max(0, cameraX) / GRID);
  const endCol = Math.ceil((cameraX + W) / GRID);
  for (let col = startCol; col <= endCol; col++) {
    const gx = col * GRID;
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, H);
    ctx.stroke();
  }
  for (let row = 0; row <= Math.ceil(H / GRID); row++) {
    const gy = row * GRID;
    ctx.beginPath();
    ctx.moveTo(Math.max(0, cameraX), gy);
    ctx.lineTo(cameraX + W, gy);
    ctx.stroke();
  }
  ctx.restore();

  // World boundary lines
  ctx.save();
  ctx.strokeStyle = "rgba(168,85,247,0.3)";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, H);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(worldWidth, 0);
  ctx.lineTo(worldWidth, H);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Spawn marker
  ctx.save();
  ctx.strokeStyle = "#4ade80";
  ctx.fillStyle = "#4ade80";
  ctx.shadowBlur = 12;
  ctx.shadowColor = "#4ade80";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(SPAWN_X + 14, SPAWN_Y + 20, 14, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = "bold 11px monospace";
  ctx.textAlign = "center";
  ctx.fillText("START", SPAWN_X + 14, SPAWN_Y + 24);
  ctx.restore();

  // Platforms
  for (let i = 0; i < platforms.length; i++) {
    const p = platforms[i];
    const isHovered = i === hoveredIndex;

    ctx.save();
    ctx.shadowBlur = isHovered ? 24 : 12;
    ctx.shadowColor = p.glowColor;

    if (p.type === "checkpoint" || p.type === "finish") {
      // Draw as flag pole
      const cx = p.x + p.w / 2;
      const baseY = p.y + p.h;
      ctx.strokeStyle = p.glowColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, baseY);
      ctx.lineTo(cx, p.y);
      ctx.stroke();
      ctx.fillStyle = p.glowColor;
      ctx.beginPath();
      ctx.moveTo(cx, p.y);
      ctx.lineTo(cx + 18, p.y + 8);
      ctx.lineTo(cx, p.y + 16);
      ctx.closePath();
      ctx.fill();
      // Label
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = p.glowColor;
      ctx.fillText(p.type === "finish" ? "FINISH" : "CP", cx, p.y - 6);
    } else {
      // Draw as rect
      const r = Math.min(4, p.h / 2);
      ctx.fillStyle = isHovered ? `${p.glowColor}55` : `${p.glowColor}22`;
      ctx.beginPath();
      ctx.moveTo(p.x + r, p.y);
      ctx.lineTo(p.x + p.w - r, p.y);
      ctx.quadraticCurveTo(p.x + p.w, p.y, p.x + p.w, p.y + r);
      ctx.lineTo(p.x + p.w, p.y + p.h - r);
      ctx.quadraticCurveTo(p.x + p.w, p.y + p.h, p.x + p.w - r, p.y + p.h);
      ctx.lineTo(p.x + r, p.y + p.h);
      ctx.quadraticCurveTo(p.x, p.y + p.h, p.x, p.y + p.h - r);
      ctx.lineTo(p.x, p.y + r);
      ctx.quadraticCurveTo(p.x, p.y, p.x + r, p.y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = p.glowColor;
      ctx.lineWidth = isHovered ? 2.5 : 1.5;
      ctx.stroke();
      // Label
      if (p.w >= 50) {
        ctx.font = "bold 9px monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = p.glowColor;
        const label =
          p.type === "moving"
            ? "MOVING"
            : p.type === "boost"
              ? "BOOST"
              : p.type === "jump_pad"
                ? "JUMP"
                : "";
        if (label) ctx.fillText(label, p.x + p.w / 2, p.y + p.h / 2 + 3);
      }
    }
    ctx.restore();
  }

  // Currently placing preview
  if (placing.active) {
    const color = PLATFORM_COLORS[selectedType];
    const x = Math.min(placing.startX, placing.currentX);
    const y = Math.min(placing.startY, placing.currentY);
    const w = Math.max(Math.abs(placing.currentX - placing.startX), GRID);
    const h = Math.max(Math.abs(placing.currentY - placing.startY), GRID / 2);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = `${color}33`;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.shadowBlur = 16;
    ctx.shadowColor = color;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  ctx.restore(); // end camera transform

  // Ruler / position indicator
  ctx.save();
  ctx.font = "10px monospace";
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(168,85,247,0.4)";
  const worldPos = Math.round(cameraX);
  ctx.fillText(`x: ${worldPos}  world: 0–${worldWidth}`, 10, H - 10);
  ctx.restore();
}

// ===================================================
// LEVEL EDITOR COMPONENT
// ===================================================

export default function LevelEditor({
  onBack,
  onTestLevel,
  onPublish,
  sessionId,
  existingLevel,
}: LevelEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  // Active slot state — scoped to this session
  const [activeSlot, setActiveSlot] = useState<EditorSlot>(() => {
    const saved = localStorage.getItem(`levelEditor_${sessionId}_activeSlot`);
    return saved === "2" ? 2 : 1;
  });

  // Load initial slot data — prefer existingLevel for slot 1 on first load
  const [platforms, setPlatforms] = useState<Platform[]>(() => {
    const slot1HasData = localStorage.getItem(
      getSlotKey(sessionId, 1, "platforms"),
    );
    if (!slot1HasData && existingLevel) {
      // Migrate existingLevel into slot 1
      try {
        return JSON.parse(existingLevel.platformsJson) as Platform[];
      } catch {
        return [];
      }
    }
    const slotData = loadSlotData(sessionId, 1);
    try {
      return JSON.parse(slotData.platformsJson) as Platform[];
    } catch {
      return [];
    }
  });

  const [levelName, setLevelName] = useState<string>(() => {
    const slot1HasData = localStorage.getItem(
      getSlotKey(sessionId, 1, "platforms"),
    );
    if (!slot1HasData && existingLevel) {
      return existingLevel.name;
    }
    return loadSlotData(sessionId, 1).name;
  });

  const [worldWidth, setWorldWidth] = useState<number>(() => {
    const slot1HasData = localStorage.getItem(
      getSlotKey(sessionId, 1, "platforms"),
    );
    if (!slot1HasData && existingLevel) {
      return existingLevel.worldWidth;
    }
    return loadSlotData(sessionId, 1).worldWidth;
  });

  const [bgHue, setBgHue] = useState<number>(() => {
    const slot1HasData = localStorage.getItem(
      getSlotKey(sessionId, 1, "platforms"),
    );
    if (!slot1HasData && existingLevel) {
      return existingLevel.bgHue;
    }
    return loadSlotData(sessionId, 1).bgHue;
  });

  const [selectedType, setSelectedType] = useState<PlatformType>("static");
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishSuccess, setPublishSuccess] = useState(false);

  const cameraXRef = useRef(0);
  const platformsRef = useRef<Platform[]>(platforms);
  const selectedTypeRef = useRef<PlatformType>(selectedType);
  const worldWidthRef = useRef(worldWidth);
  const bgHueRef = useRef(bgHue);
  const placingRef = useRef<PlacingState>({
    active: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
  });
  const hoveredIndexRef = useRef(-1);
  const isPanningRef = useRef(false);
  const panStartXRef = useRef(0);
  const panCamStartRef = useRef(0);
  const isSpaceRef = useRef(false);

  // Sync refs
  useEffect(() => {
    platformsRef.current = platforms;
  }, [platforms]);
  useEffect(() => {
    selectedTypeRef.current = selectedType;
  }, [selectedType]);
  useEffect(() => {
    worldWidthRef.current = worldWidth;
  }, [worldWidth]);
  useEffect(() => {
    bgHueRef.current = bgHue;
  }, [bgHue]);

  // Auto-save current slot to localStorage whenever data changes
  useEffect(() => {
    saveSlotData(sessionId, activeSlot, {
      name: levelName,
      platformsJson: JSON.stringify(platforms),
      worldWidth,
      bgHue,
    });
  }, [sessionId, activeSlot, levelName, platforms, worldWidth, bgHue]);

  // ===================================================
  // SLOT SWITCHING
  // ===================================================

  const switchSlot = useCallback(
    (newSlot: EditorSlot) => {
      if (newSlot === activeSlot) return;

      // Save current slot state first
      saveSlotData(sessionId, activeSlot, {
        name: levelName,
        platformsJson: JSON.stringify(platformsRef.current),
        worldWidth: worldWidthRef.current,
        bgHue: bgHueRef.current,
      });

      // Load new slot data
      const newData = loadSlotData(sessionId, newSlot);
      let newPlatforms: Platform[] = [];
      try {
        newPlatforms = JSON.parse(newData.platformsJson) as Platform[];
      } catch {
        newPlatforms = [];
      }

      setActiveSlot(newSlot);
      localStorage.setItem(
        `levelEditor_${sessionId}_activeSlot`,
        String(newSlot),
      );
      setPlatforms(newPlatforms);
      setLevelName(newData.name);
      setWorldWidth(newData.worldWidth);
      setBgHue(newData.bgHue);

      // Reset camera and editor state
      cameraXRef.current = 0;
      setError(null);
      setPublishSuccess(false);
    },
    [sessionId, activeSlot, levelName],
  );

  const buildStage = useCallback(
    (): StageConfig => ({
      id: 99,
      name: levelName,
      bgHue,
      worldWidth,
      spinners: [],
      platforms: [...platformsRef.current],
    }),
    [levelName, bgHue, worldWidth],
  );

  const validateLevel = useCallback((): string | null => {
    const plats = platformsRef.current;
    if (plats.length === 0) return "Add at least one platform.";
    const hasFinish = plats.some((p) => p.type === "finish");
    if (!hasFinish) return "Add a Finish flag so the level can be completed.";
    return null;
  }, []);

  // RAF render loop
  useEffect(() => {
    let running = true;
    function loop() {
      if (!running) return;
      const canvas = canvasRef.current;
      if (canvas) {
        renderEditor(
          canvas,
          platformsRef.current,
          cameraXRef.current,
          worldWidthRef.current,
          bgHueRef.current,
          selectedTypeRef.current,
          placingRef.current,
          hoveredIndexRef.current,
        );
      }
      animRef.current = requestAnimationFrame(loop);
    }
    animRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  // Canvas resize
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // Mouse & input events
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getWorldPos = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      return {
        wx: clientX - rect.left + cameraXRef.current,
        wy: clientY - rect.top,
      };
    };

    const getSnapped = (clientX: number, clientY: number) => {
      const { wx, wy } = getWorldPos(clientX, clientY);
      return { wx: snapToGrid(wx), wy: snapToGrid(wy) };
    };

    const getPlatformUnderCursor = (wx: number, wy: number): number => {
      const plats = platformsRef.current;
      for (let i = plats.length - 1; i >= 0; i--) {
        const p = plats[i];
        if (wx >= p.x && wx <= p.x + p.w && wy >= p.y && wy <= p.y + p.h) {
          return i;
        }
      }
      return -1;
    };

    const onMouseDown = (e: MouseEvent) => {
      // Middle mouse or space+drag = pan
      if (e.button === 1 || (e.button === 0 && isSpaceRef.current)) {
        e.preventDefault();
        isPanningRef.current = true;
        panStartXRef.current = e.clientX;
        panCamStartRef.current = cameraXRef.current;
        return;
      }

      if (e.button === 2) {
        // Right click = delete
        e.preventDefault();
        const { wx, wy } = getWorldPos(e.clientX, e.clientY);
        const idx = getPlatformUnderCursor(wx, wy);
        if (idx >= 0) {
          setPlatforms((prev) => prev.filter((_, i) => i !== idx));
        }
        return;
      }

      if (e.button === 0) {
        const type = selectedTypeRef.current;
        const { wx, wy } = getSnapped(e.clientX, e.clientY);

        if (type === "checkpoint" || type === "finish") {
          // Single click place
          const size = getDefaultSize(type);
          const newP = buildEditorPlatform(
            type,
            wx,
            wy - size.h,
            size.w,
            size.h,
          );
          setPlatforms((prev) => [...prev, newP]);
        } else {
          // Start drag to draw rect
          placingRef.current = {
            active: true,
            startX: wx,
            startY: wy,
            currentX: wx,
            currentY: wy,
          };
        }
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (isPanningRef.current) {
        const dx = e.clientX - panStartXRef.current;
        cameraXRef.current = Math.max(0, panCamStartRef.current - dx);
        return;
      }

      const { wx, wy } = getWorldPos(e.clientX, e.clientY);
      hoveredIndexRef.current = getPlatformUnderCursor(wx, wy);

      if (placingRef.current.active) {
        const { wx: swx, wy: swy } = getSnapped(e.clientX, e.clientY);
        placingRef.current = {
          ...placingRef.current,
          currentX: swx,
          currentY: swy,
        };
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (isPanningRef.current) {
        isPanningRef.current = false;
        return;
      }

      if (e.button === 0 && placingRef.current.active) {
        const placing = placingRef.current;
        const rawW = placing.currentX - placing.startX;
        const rawH = placing.currentY - placing.startY;

        const x = rawW >= 0 ? placing.startX : placing.currentX;
        const y = rawH >= 0 ? placing.startY : placing.currentY;
        const w = Math.max(Math.abs(rawW), GRID);
        const h = Math.max(Math.abs(rawH), GRID / 2);

        const type = selectedTypeRef.current;
        const newP = buildEditorPlatform(type, x, y, w, h);
        setPlatforms((prev) => [...prev, newP]);
        placingRef.current = {
          active: false,
          startX: 0,
          startY: 0,
          currentX: 0,
          currentY: 0,
        };
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cameraXRef.current = Math.max(0, cameraXRef.current + e.deltaY * 1.5);
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        isSpaceRef.current = true;
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") isSpaceRef.current = false;
    };

    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const handleTest = useCallback(() => {
    const err = validateLevel();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    onTestLevel(buildStage());
  }, [validateLevel, buildStage, onTestLevel]);

  const handlePublish = useCallback(async () => {
    const err = validateLevel();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setIsPublishing(true);
    try {
      await onPublish(buildStage());
      setPublishSuccess(true);
      setTimeout(() => setPublishSuccess(false), 3000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (
        msg.toLowerCase().includes("2 published") ||
        msg.toLowerCase().includes("already have 2")
      ) {
        setError(
          "You already have 2 published levels. Go to Community Levels → My Published Levels and delete one before publishing again.",
        );
      } else {
        setError("Failed to publish. Try again.");
      }
    } finally {
      setIsPublishing(false);
    }
  }, [validateLevel, buildStage, onPublish]);

  const handleClear = useCallback(() => {
    setPlatforms([]);
  }, []);

  const platformCount = platforms.length;
  const hasFinish = platforms.some((p) => p.type === "finish");
  const hasCheckpoint = platforms.some((p) => p.type === "checkpoint");

  // Slot button style helper
  const slotBtnStyle = (slot: EditorSlot): React.CSSProperties => ({
    flex: 1,
    padding: "7px 0",
    background:
      activeSlot === slot
        ? "linear-gradient(135deg, #a855f7, #e879f9)"
        : "rgba(168,85,247,0.07)",
    border: `1px solid ${activeSlot === slot ? "#a855f7" : "rgba(168,85,247,0.2)"}`,
    borderRadius: 6,
    color: activeSlot === slot ? "#05030f" : "rgba(200,180,255,0.55)",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
    letterSpacing: "0.06em",
    transition: "all 0.15s",
    textTransform: "uppercase" as const,
    boxShadow: activeSlot === slot ? "0 0 12px rgba(168,85,247,0.4)" : "none",
  });

  return (
    <div
      style={{
        display: "flex",
        width: "100vw",
        height: "100vh",
        background: "#05030f",
        fontFamily: "'Bricolage Grotesque', sans-serif",
        overflow: "hidden",
      }}
    >
      {/* === SIDEBAR === */}
      <div
        style={{
          width: 230,
          minWidth: 230,
          height: "100%",
          background: "rgba(15, 8, 30, 0.98)",
          borderRight: "1px solid rgba(168,85,247,0.2)",
          display: "flex",
          flexDirection: "column",
          gap: 0,
          overflowY: "auto",
          overflowX: "hidden",
          zIndex: 10,
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 16px 12px",
            borderBottom: "1px solid rgba(168,85,247,0.15)",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "rgba(168,85,247,0.6)",
              marginBottom: 6,
            }}
          >
            ⚙ Level Editor
          </div>
          <button
            type="button"
            onClick={onBack}
            data-ocid="editor.back_button"
            style={{
              width: "100%",
              padding: "8px 0",
              background: "rgba(168,85,247,0.08)",
              border: "1px solid rgba(168,85,247,0.25)",
              borderRadius: 6,
              color: "rgba(200,180,255,0.8)",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              letterSpacing: "0.05em",
              transition: "all 0.15s",
            }}
          >
            ← Back
          </button>
        </div>

        {/* Slot Toggle */}
        <div
          style={{
            padding: "12px 16px 10px",
            borderBottom: "1px solid rgba(168,85,247,0.1)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "rgba(168,85,247,0.5)",
              marginBottom: 8,
            }}
          >
            Save Slot
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              onClick={() => switchSlot(1)}
              data-ocid="editor.slot1_button"
              style={slotBtnStyle(1)}
            >
              Slot 1
            </button>
            <button
              type="button"
              onClick={() => switchSlot(2)}
              data-ocid="editor.slot2_button"
              style={slotBtnStyle(2)}
            >
              Slot 2
            </button>
          </div>
          <div
            style={{
              fontSize: 9,
              color: "rgba(200,180,255,0.3)",
              marginTop: 5,
              textAlign: "center",
            }}
          >
            Each slot saves independently
          </div>
        </div>

        {/* Level Settings */}
        <div
          style={{
            padding: "14px 16px 10px",
            borderBottom: "1px solid rgba(168,85,247,0.1)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "rgba(168,85,247,0.5)",
              marginBottom: 10,
            }}
          >
            Level Settings
          </div>

          {/* Name */}
          <div style={{ marginBottom: 10 }}>
            <label
              htmlFor="editor-level-name"
              style={{
                display: "block",
                fontSize: 10,
                color: "rgba(200,180,255,0.6)",
                marginBottom: 4,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Name
            </label>
            <input
              id="editor-level-name"
              type="text"
              value={levelName}
              maxLength={40}
              onChange={(e) => setLevelName(e.target.value)}
              data-ocid="editor.name_input"
              style={{
                width: "100%",
                padding: "6px 10px",
                background: "rgba(168,85,247,0.08)",
                border: "1px solid rgba(168,85,247,0.25)",
                borderRadius: 6,
                color: "#e0d0ff",
                fontSize: 12,
                fontFamily: "'Sora', sans-serif",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* World Width */}
          <div style={{ marginBottom: 10 }}>
            <label
              htmlFor="editor-world-width"
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 10,
                color: "rgba(200,180,255,0.6)",
                marginBottom: 4,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              <span>World Width</span>
              <span style={{ color: "rgba(168,85,247,0.8)", fontWeight: 700 }}>
                {worldWidth}px
              </span>
            </label>
            <input
              id="editor-world-width"
              type="range"
              min={1000}
              max={10000}
              step={100}
              value={worldWidth}
              onChange={(e) => setWorldWidth(Number(e.target.value))}
              style={{
                width: "100%",
                accentColor: "#a855f7",
                cursor: "pointer",
              }}
            />
          </div>

          {/* BG Hue */}
          <div>
            <label
              htmlFor="editor-bg-hue"
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 10,
                color: "rgba(200,180,255,0.6)",
                marginBottom: 4,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              <span>Background Hue</span>
              <span
                style={{ color: `hsl(${bgHue}, 70%, 65%)`, fontWeight: 700 }}
              >
                {bgHue}°
              </span>
            </label>
            <input
              id="editor-bg-hue"
              type="range"
              min={0}
              max={360}
              step={5}
              value={bgHue}
              onChange={(e) => setBgHue(Number(e.target.value))}
              style={{
                width: "100%",
                cursor: "pointer",
                background:
                  "linear-gradient(to right, hsl(0,70%,40%), hsl(60,70%,40%), hsl(120,70%,40%), hsl(180,70%,40%), hsl(240,70%,40%), hsl(300,70%,40%), hsl(360,70%,40%))",
                height: 8,
                borderRadius: 4,
                appearance: "none",
                WebkitAppearance: "none",
                border: "1px solid rgba(168,85,247,0.2)",
              }}
            />
          </div>
        </div>

        {/* Platform Types */}
        <div
          style={{
            padding: "14px 16px 10px",
            borderBottom: "1px solid rgba(168,85,247,0.1)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "rgba(168,85,247,0.5)",
              marginBottom: 10,
            }}
          >
            Place Type
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(
              [
                "static",
                "moving",
                "jump_pad",
                "boost",
                "checkpoint",
                "finish",
              ] as PlatformType[]
            ).map((type, idx) => (
              <button
                key={type}
                type="button"
                onClick={() => setSelectedType(type)}
                data-ocid={`editor.platform_type.item.${idx + 1}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  background:
                    selectedType === type
                      ? `${PLATFORM_COLORS[type]}22`
                      : "rgba(168,85,247,0.04)",
                  border: `1px solid ${selectedType === type ? `${PLATFORM_COLORS[type]}88` : "rgba(168,85,247,0.15)"}`,
                  borderRadius: 6,
                  color:
                    selectedType === type
                      ? PLATFORM_COLORS[type]
                      : "rgba(200,180,255,0.6)",
                  fontSize: 12,
                  fontWeight: selectedType === type ? 700 : 500,
                  cursor: "pointer",
                  transition: "all 0.1s",
                  textAlign: "left",
                }}
              >
                <span style={{ fontSize: 14 }}>{PLATFORM_ICONS[type]}</span>
                <span>{PLATFORM_LABELS[type]}</span>
                {(type === "checkpoint" || type === "finish") && (
                  <span
                    style={{ fontSize: 9, marginLeft: "auto", opacity: 0.6 }}
                  >
                    click
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div
          style={{
            padding: "12px 16px 10px",
            borderBottom: "1px solid rgba(168,85,247,0.1)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "rgba(168,85,247,0.5)",
              marginBottom: 8,
            }}
          >
            Level Info
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {[
              ["Platforms", platformCount.toString()],
              [
                "Checkpoints",
                platforms
                  .filter((p) => p.type === "checkpoint")
                  .length.toString(),
              ],
              ["Has Finish", hasFinish ? "✓" : "—"],
            ].map(([label, val]) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 11,
                  color: "rgba(200,180,255,0.7)",
                }}
              >
                <span>{label}</span>
                <span
                  style={{
                    fontWeight: 700,
                    color:
                      val === "✓"
                        ? "#4ade80"
                        : val === "—"
                          ? "rgba(248,113,113,0.7)"
                          : "rgba(168,85,247,0.9)",
                  }}
                >
                  {val}
                </span>
              </div>
            ))}
          </div>

          {/* Tips */}
          <div
            style={{
              marginTop: 10,
              fontSize: 9,
              color: "rgba(200,180,255,0.35)",
              lineHeight: 1.5,
            }}
          >
            <div>Left drag: draw platform</div>
            <div>Right click: delete</div>
            <div>Scroll / Space+drag: pan</div>
          </div>
        </div>

        {/* Error / Success */}
        {error && (
          <div
            data-ocid="editor.error_state"
            style={{
              margin: "10px 16px 0",
              padding: "8px 12px",
              background: "rgba(248,113,113,0.1)",
              border: "1px solid rgba(248,113,113,0.3)",
              borderRadius: 6,
              color: "#f87171",
              fontSize: 11,
              lineHeight: 1.5,
            }}
          >
            {error}
          </div>
        )}
        {publishSuccess && (
          <div
            data-ocid="editor.success_state"
            style={{
              margin: "10px 16px 0",
              padding: "8px 12px",
              background: "rgba(74,222,128,0.1)",
              border: "1px solid rgba(74,222,128,0.3)",
              borderRadius: 6,
              color: "#4ade80",
              fontSize: 11,
            }}
          >
            ✓ Published! (Slot {activeSlot})
          </div>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Actions */}
        <div
          style={{
            padding: "14px 16px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            borderTop: "1px solid rgba(168,85,247,0.15)",
          }}
        >
          <button
            type="button"
            onClick={handleTest}
            data-ocid="editor.test_button"
            style={{
              width: "100%",
              padding: "10px 0",
              background: "linear-gradient(135deg, #22d3ee, #0891b2)",
              border: "none",
              borderRadius: 8,
              color: "#05030f",
              fontSize: 13,
              fontWeight: 800,
              cursor: "pointer",
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              boxShadow: "0 0 20px rgba(34,211,238,0.3)",
              transition: "transform 0.1s, box-shadow 0.1s",
            }}
          >
            ▶ Test Level
          </button>
          <button
            type="button"
            onClick={handlePublish}
            disabled={isPublishing}
            data-ocid="editor.publish_button"
            style={{
              width: "100%",
              padding: "10px 0",
              background: isPublishing
                ? "rgba(168,85,247,0.3)"
                : "linear-gradient(135deg, #a855f7, #e879f9)",
              border: "none",
              borderRadius: 8,
              color: isPublishing ? "rgba(200,180,255,0.6)" : "#05030f",
              fontSize: 13,
              fontWeight: 800,
              cursor: isPublishing ? "not-allowed" : "pointer",
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              boxShadow: isPublishing
                ? "none"
                : "0 0 20px rgba(168,85,247,0.4)",
              transition: "all 0.1s",
            }}
          >
            {isPublishing ? "Publishing..." : `⬆ Publish (Slot ${activeSlot})`}
          </button>
          <button
            type="button"
            onClick={handleClear}
            data-ocid="editor.clear_button"
            style={{
              width: "100%",
              padding: "8px 0",
              background: "rgba(248,113,113,0.08)",
              border: "1px solid rgba(248,113,113,0.25)",
              borderRadius: 6,
              color: "rgba(248,113,113,0.7)",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              transition: "all 0.1s",
            }}
          >
            ✕ Clear All
          </button>
        </div>
      </div>

      {/* === CANVAS AREA === */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <canvas
          ref={canvasRef}
          data-ocid="editor.canvas_target"
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            cursor: "crosshair",
          }}
        />

        {/* Empty state hint */}
        {platforms.length === 0 && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              textAlign: "center",
              pointerEvents: "none",
              color: "rgba(168,85,247,0.3)",
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 12 }}>🏗️</div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              Click & drag to place platforms
            </div>
            <div style={{ fontSize: 11, marginTop: 6, opacity: 0.7 }}>
              Select a type from the left sidebar, then draw on the canvas
            </div>
          </div>
        )}

        {/* Missing finish warning */}
        {platforms.length > 0 && !hasFinish && (
          <div
            style={{
              position: "absolute",
              bottom: 16,
              right: 16,
              padding: "8px 14px",
              background: "rgba(251,191,36,0.1)",
              border: "1px solid rgba(251,191,36,0.3)",
              borderRadius: 6,
              color: "rgba(251,191,36,0.85)",
              fontSize: 11,
              fontWeight: 700,
              pointerEvents: "none",
            }}
          >
            ⚠ Add a Finish flag to complete the level
          </div>
        )}

        {/* Has checkpoint hint */}
        {!hasCheckpoint && platforms.length > 3 && (
          <div
            style={{
              position: "absolute",
              bottom: hasFinish ? 16 : 52,
              right: 16,
              padding: "6px 12px",
              background: "rgba(74,222,128,0.08)",
              border: "1px solid rgba(74,222,128,0.2)",
              borderRadius: 6,
              color: "rgba(74,222,128,0.6)",
              fontSize: 10,
              pointerEvents: "none",
            }}
          >
            💡 Tip: Add a checkpoint so players can respawn mid-level
          </div>
        )}
      </div>
    </div>
  );
}
