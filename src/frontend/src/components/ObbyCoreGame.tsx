import { useCallback, useEffect, useRef } from "react";

// ===================================================
// TYPES
// ===================================================

interface Platform {
  x: number;
  y: number;
  w: number;
  h: number;
  type:
    | "static"
    | "moving"
    | "rhythm"
    | "boost"
    | "jump_pad"
    | "checkpoint"
    | "finish"
    | "spinner_base";
  glowColor: string;
  active?: boolean;
  rhythmPhase?: number;
  // Moving platform
  startX?: number;
  startY?: number;
  dx?: number;
  dy?: number;
  rangeX?: number;
  rangeY?: number;
  t?: number;
  // Stage 9 mirror
  targetX?: number;
  targetY?: number;
  mirrorX?: number;
  mirrorY?: number;
}

interface Spinner {
  cx: number;
  cy: number;
  radius: number;
  angle: number;
  speed: number; // rad/s
  length: number;
  color: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface Shockwave {
  x: number;
  y: number;
  progress: number; // 0..1
  speed: number;
  alive: boolean;
}

interface GameState {
  phase: "start" | "playing" | "gameover" | "win";
  stage: number;
  lives: number;
  deaths: number;
  checkpointIndex: number;
  checkpointX: number;
  checkpointY: number;
  playerVisible: boolean;
  respawnTimer: number;
  stageName: string;
  stageNameTimer: number;
}

interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
  jumpsLeft: number;
  speedBoostTimer: number;
  isDead: boolean;
}

interface Effects {
  deathFlashAlpha: number;
  checkpointFlashAlpha: number;
  drumPulseTimer: number;
  drumPulseActive: boolean;
  particles: Particle[];
  shockwaves: Shockwave[];
  bossShockwaveTimer: number;
  shadowX: number;
  shadowTargetX: number;
  darknessFogAlpha: number;
  windDir: number;
  windTimer: number;
  mirrorTimer: number;
  mirrorCountdown: number;
}

type StageConfig = {
  id: number;
  name: string;
  bgHue: number;
  platforms: Platform[];
  spinners: Spinner[];
  worldWidth: number;
};

// ===================================================
// CONSTANTS
// ===================================================

const GRAVITY = 1800;
const JUMP_VEL = -620;
const MAX_SPEED = 320;
const ACCELERATION = 2400;
const FRICTION = 3500;
const TERMINAL_VEL = 900;
const PLAYER_W = 28;
const PLAYER_H = 40;
const VIEWPORT_H = 600;
const DEATH_Y = VIEWPORT_H + 250;
const DRUM_INTERVAL = 2.0;
const RHYTHM_PERIOD = 2.0;
const RHYTHM_VISIBLE = 1.0;
const WIND_CHANGE_INTERVAL = 3.0;
const MIRROR_INTERVAL = 4.0;
const SHADOW_SPEED = 60; // px/s

// ===================================================
// STAGE DATA BUILDER HELPERS
// ===================================================

function makePlatform(
  x: number,
  y: number,
  w: number,
  h: number,
  type: Platform["type"] = "static",
  glowColor = "#a855f7",
  extras: Partial<Platform> = {},
): Platform {
  return { x, y, w, h, type, glowColor, active: true, t: 0, ...extras };
}

function makeMoving(
  x: number,
  y: number,
  w: number,
  h: number,
  dx: number,
  dy: number,
  rangeX: number,
  rangeY: number,
  glowColor = "#22d3ee",
): Platform {
  return {
    x,
    y,
    w,
    h,
    type: "moving",
    glowColor,
    startX: x,
    startY: y,
    dx,
    dy,
    rangeX,
    rangeY,
    t: 0,
    active: true,
  };
}

function makeRhythm(
  x: number,
  y: number,
  w: number,
  h: number,
  phase = 0,
): Platform {
  return {
    x,
    y,
    w,
    h,
    type: "rhythm",
    glowColor: "#e879f9",
    active: true,
    rhythmPhase: phase,
    t: 0,
  };
}

function makeCheckpoint(x: number, y: number): Platform {
  return {
    x,
    y,
    w: 20,
    h: 60,
    type: "checkpoint",
    glowColor: "#4ade80",
    active: false,
  };
}

function makeCheckpointBase(x: number, y: number): Platform {
  // A solid platform centered under the checkpoint pole, for the player to stand on
  const pw = 120;
  return makePlatform(x - pw / 2 + 10, y + 60, pw, 20, "static", "#4ade80");
}

function makeFinish(x: number, y: number): Platform {
  return {
    x,
    y,
    w: 30,
    h: 80,
    type: "finish",
    glowColor: "#fbbf24",
    active: true,
  };
}

function makeFinishBase(x: number, y: number): Platform {
  // A solid platform centered under the finish flag pole, for the player to stand on
  const pw = 140;
  return makePlatform(x - pw / 2 + 15, y + 80, pw, 20, "static", "#fbbf24");
}

function makeJumpPad(x: number, y: number): Platform {
  return {
    x,
    y,
    w: 80,
    h: 16,
    type: "jump_pad",
    glowColor: "#fbbf24",
    active: true,
  };
}

function makeBoost(x: number, y: number): Platform {
  return {
    x,
    y,
    w: 100,
    h: 8,
    type: "boost",
    glowColor: "#4ade80",
    active: true,
  };
}

// ===================================================
// STAGE DEFINITIONS
// ===================================================

function buildStages(): StageConfig[] {
  return [
    // Stage 1 - "The Void Begins"
    {
      id: 1,
      name: "The Void Begins",
      bgHue: 285,
      worldWidth: 4200,
      spinners: [],
      platforms: [
        // Start platform
        makePlatform(0, 480, 240, 20),
        makePlatform(320, 420, 160, 20),
        makePlatform(560, 360, 120, 20),
        makePlatform(760, 400, 100, 20),
        makeCheckpoint(900, 360),
        makeCheckpointBase(900, 360),
        makePlatform(980, 360, 140, 20),
        makePlatform(1200, 300, 120, 20),
        makePlatform(1400, 340, 100, 20),
        makePlatform(1600, 280, 120, 20),
        makePlatform(1800, 310, 140, 20),
        makePlatform(2000, 350, 100, 20),
        makePlatform(2180, 290, 120, 20),
        makePlatform(2380, 320, 100, 20),
        makePlatform(2560, 360, 140, 20),
        makePlatform(2760, 300, 100, 20),
        makePlatform(2940, 280, 120, 20),
        makePlatform(3120, 320, 100, 20),
        makePlatform(3300, 350, 140, 20),
        makeCheckpoint(3500, 290),
        makeCheckpointBase(3500, 290),
        makePlatform(3560, 290, 160, 20),
        makePlatform(3780, 330, 120, 20),
        makeFinish(4050, 220),
        makeFinishBase(4050, 220),
      ],
    },

    // Stage 2 - "The Moving Floor"
    {
      id: 2,
      name: "The Moving Floor",
      bgHue: 260,
      worldWidth: 4400,
      spinners: [],
      platforms: [
        makePlatform(0, 480, 220, 20),
        makePlatform(300, 440, 120, 20),
        makeMoving(520, 400, 120, 20, 80, 0, 150, 0),
        makePlatform(780, 380, 100, 20),
        makeMoving(960, 350, 110, 20, 0, 60, 0, 100),
        makeCheckpoint(1100, 300),
        makeCheckpointBase(1100, 300),
        makePlatform(1180, 300, 130, 20),
        makeMoving(1400, 340, 120, 20, 100, 0, 180, 0),
        makePlatform(1700, 360, 100, 20),
        makeMoving(1880, 310, 110, 20, -90, 0, 140, 0),
        makePlatform(2080, 280, 120, 20),
        makeMoving(2300, 340, 100, 20, 0, 80, 0, 120),
        makePlatform(2520, 360, 130, 20),
        makeMoving(2740, 300, 120, 20, 110, 0, 160, 0),
        makePlatform(2960, 330, 100, 20),
        makeCheckpoint(3100, 280),
        makeCheckpointBase(3100, 280),
        makePlatform(3180, 280, 140, 20),
        makeMoving(3400, 320, 110, 20, -80, 40, 120, 80),
        makePlatform(3640, 350, 120, 20),
        makeMoving(3840, 290, 100, 20, 100, 0, 150, 0),
        makeFinish(4100, 220),
        makeFinishBase(4100, 220),
      ],
    },

    // Stage 3 - "Spinning Danger"
    {
      id: 3,
      name: "Spinning Danger",
      bgHue: 300,
      worldWidth: 4600,
      spinners: [
        {
          cx: 700,
          cy: 380,
          radius: 60,
          angle: 0,
          speed: 1.8,
          length: 55,
          color: "#f87171",
        },
        {
          cx: 1400,
          cy: 320,
          radius: 70,
          angle: 1.0,
          speed: -2.2,
          length: 65,
          color: "#e879f9",
        },
        {
          cx: 2200,
          cy: 350,
          radius: 65,
          angle: 2.5,
          speed: 2.5,
          length: 60,
          color: "#f87171",
        },
        {
          cx: 3100,
          cy: 290,
          radius: 75,
          angle: 0.8,
          speed: -1.9,
          length: 70,
          color: "#e879f9",
        },
        {
          cx: 3900,
          cy: 330,
          radius: 60,
          angle: 1.5,
          speed: 2.1,
          length: 55,
          color: "#f87171",
        },
      ],
      platforms: [
        makePlatform(0, 480, 240, 20),
        makePlatform(300, 440, 140, 20),
        makePlatform(540, 400, 120, 20),
        makePlatform(740, 430, 100, 20),
        makePlatform(950, 400, 120, 20),
        makeCheckpoint(1100, 360),
        makeCheckpointBase(1100, 360),
        makePlatform(1200, 360, 130, 20),
        makePlatform(1450, 380, 120, 20),
        makePlatform(1680, 350, 110, 20),
        makePlatform(1880, 370, 120, 20),
        makePlatform(2100, 390, 100, 20),
        makePlatform(2340, 360, 120, 20),
        makeCheckpoint(2500, 320),
        makeCheckpointBase(2500, 320),
        makePlatform(2580, 320, 130, 20),
        makePlatform(2800, 350, 110, 20),
        makePlatform(2980, 370, 120, 20),
        makePlatform(3200, 340, 100, 20),
        makePlatform(3440, 360, 120, 20),
        makePlatform(3640, 380, 100, 20),
        makePlatform(3860, 360, 120, 20),
        makePlatform(4060, 340, 110, 20),
        makeCheckpoint(4200, 300),
        makeCheckpointBase(4200, 300),
        makePlatform(4280, 300, 130, 20),
        makeFinish(4450, 230),
        makeFinishBase(4450, 230),
      ],
    },

    // Stage 4 - "Drum Beat Platforms"
    {
      id: 4,
      name: "Drum Beat Platforms",
      bgHue: 315,
      worldWidth: 4400,
      spinners: [],
      platforms: [
        makePlatform(0, 480, 200, 20),
        makePlatform(280, 440, 130, 20),
        makeRhythm(480, 400, 100, 18, 0),
        makePlatform(680, 440, 100, 20),
        makeRhythm(840, 390, 110, 18, 0.5),
        makeRhythm(1020, 360, 100, 18, 0),
        makeCheckpoint(1160, 320),
        makeCheckpointBase(1160, 320),
        makePlatform(1230, 320, 140, 20),
        makeRhythm(1450, 360, 110, 18, 0.5),
        makePlatform(1640, 390, 100, 20),
        makeRhythm(1820, 350, 100, 18, 0),
        makeRhythm(2000, 310, 110, 18, 0.25),
        makePlatform(2180, 340, 130, 20),
        makeRhythm(2380, 360, 100, 18, 0.5),
        makeCheckpoint(2550, 320),
        makeCheckpointBase(2550, 320),
        makePlatform(2620, 320, 120, 20),
        makeRhythm(2820, 280, 100, 18, 0),
        makePlatform(3000, 320, 100, 20),
        makeRhythm(3180, 300, 110, 18, 0.5),
        makeRhythm(3360, 280, 100, 18, 0),
        makeRhythm(3540, 300, 100, 18, 0.25),
        makePlatform(3700, 330, 130, 20),
        makeRhythm(3920, 280, 100, 18, 0.5),
        makePlatform(4120, 310, 110, 20),
        makeFinish(4300, 240),
        makeFinishBase(4300, 240),
      ],
    },

    // Stage 5 - "The Narrow Way" (wind mechanic)
    {
      id: 5,
      name: "The Narrow Way",
      bgHue: 200,
      worldWidth: 4800,
      spinners: [],
      platforms: [
        makePlatform(0, 480, 180, 20),
        makePlatform(260, 450, 60, 12, "static", "#22d3ee"), // narrow
        makePlatform(420, 420, 55, 12, "static", "#22d3ee"),
        makePlatform(570, 390, 60, 12, "static", "#22d3ee"),
        makePlatform(720, 410, 50, 12, "static", "#22d3ee"),
        makeCheckpoint(850, 370),
        makeCheckpointBase(850, 370),
        makePlatform(920, 370, 65, 12, "static", "#22d3ee"),
        makePlatform(1080, 340, 55, 12, "static", "#22d3ee"),
        makePlatform(1230, 360, 60, 12, "static", "#22d3ee"),
        makePlatform(1380, 330, 55, 12, "static", "#22d3ee"),
        makePlatform(1530, 310, 60, 12, "static", "#22d3ee"),
        makePlatform(1700, 340, 50, 12, "static", "#22d3ee"),
        makePlatform(1860, 310, 65, 12, "static", "#22d3ee"),
        makeCheckpoint(2020, 270),
        makeCheckpointBase(2020, 270),
        makePlatform(2090, 270, 60, 12, "static", "#22d3ee"),
        makePlatform(2250, 290, 55, 12, "static", "#22d3ee"),
        makePlatform(2410, 260, 60, 12, "static", "#22d3ee"),
        makePlatform(2570, 280, 55, 12, "static", "#22d3ee"),
        makePlatform(2730, 300, 60, 12, "static", "#22d3ee"),
        makePlatform(2890, 270, 55, 12, "static", "#22d3ee"),
        makePlatform(3050, 250, 60, 12, "static", "#22d3ee"),
        makePlatform(3210, 270, 55, 12, "static", "#22d3ee"),
        makeCheckpoint(3380, 230),
        makeCheckpointBase(3380, 230),
        makePlatform(3440, 230, 65, 12, "static", "#22d3ee"),
        makePlatform(3610, 250, 55, 12, "static", "#22d3ee"),
        makePlatform(3780, 220, 60, 12, "static", "#22d3ee"),
        makePlatform(3940, 240, 55, 12, "static", "#22d3ee"),
        makePlatform(4100, 220, 65, 12, "static", "#22d3ee"),
        makePlatform(4280, 240, 55, 12, "static", "#22d3ee"),
        makePlatform(4460, 260, 60, 12, "static", "#22d3ee"),
        makeFinish(4640, 180),
        makeFinishBase(4640, 180),
      ],
    },

    // Stage 6 - "Launch Zone" (vertical layout)
    {
      id: 6,
      name: "Launch Zone",
      bgHue: 60,
      worldWidth: 5000,
      spinners: [],
      platforms: [
        makePlatform(0, 480, 200, 20),
        makeJumpPad(280, 480),
        makePlatform(280, 280, 120, 20, "static", "#fbbf24"),
        makeBoost(480, 280),
        makePlatform(680, 260, 120, 20, "static", "#4ade80"),
        makeJumpPad(800, 260),
        makePlatform(800, 80, 120, 20, "static", "#fbbf24"),
        makePlatform(1020, 100, 130, 20),
        makeCheckpoint(1200, 60),
        makeCheckpointBase(1200, 60),
        makePlatform(1280, 60, 200, 20),
        makeBoost(1560, 60),
        makePlatform(1760, 40, 120, 20, "static", "#4ade80"),
        makeJumpPad(1960, 40),
        makePlatform(1960, -160, 130, 20, "static", "#fbbf24"),
        makePlatform(2190, -140, 120, 20),
        makeBoost(2390, -140),
        makePlatform(2590, -160, 110, 20, "static", "#4ade80"),
        makeJumpPad(2800, -160),
        makePlatform(2800, -360, 120, 20, "static", "#fbbf24"),
        makeCheckpoint(3020, -400),
        makeCheckpointBase(3020, -400),
        makePlatform(3090, -400, 150, 20),
        makeBoost(3340, -400),
        makePlatform(3540, -420, 120, 20, "static", "#4ade80"),
        makeJumpPad(3740, -420),
        makePlatform(3740, -620, 130, 20, "static", "#fbbf24"),
        makePlatform(3970, -600, 120, 20),
        makePlatform(4180, -620, 110, 20),
        makePlatform(4390, -600, 130, 20),
        makeFinish(4700, -700),
        makeFinishBase(4700, -700),
      ],
    },

    // Stage 7 - "The Shadow Follows" (creature shadow)
    {
      id: 7,
      name: "The Shadow Follows",
      bgHue: 270,
      worldWidth: 4500,
      spinners: [],
      platforms: [
        makePlatform(0, 480, 200, 20),
        makePlatform(280, 450, 120, 20),
        makePlatform(480, 420, 100, 20),
        makePlatform(660, 440, 120, 20),
        makePlatform(860, 410, 110, 20),
        makeCheckpoint(1000, 370),
        makeCheckpointBase(1000, 370),
        makePlatform(1080, 370, 130, 20),
        makePlatform(1300, 390, 110, 20),
        makePlatform(1490, 360, 120, 20),
        makePlatform(1700, 380, 100, 20),
        makePlatform(1890, 350, 110, 20),
        makePlatform(2080, 370, 120, 20),
        makeCheckpoint(2250, 330),
        makeCheckpointBase(2250, 330),
        makePlatform(2330, 330, 130, 20),
        makePlatform(2560, 350, 110, 20),
        makePlatform(2750, 320, 120, 20),
        makePlatform(2960, 340, 100, 20),
        makePlatform(3150, 310, 120, 20),
        makePlatform(3370, 330, 110, 20),
        makeCheckpoint(3530, 290),
        makeCheckpointBase(3530, 290),
        makePlatform(3610, 290, 130, 20),
        makePlatform(3840, 310, 110, 20),
        makePlatform(4030, 280, 120, 20),
        makePlatform(4240, 300, 110, 20),
        makeFinish(4380, 210),
        makeFinishBase(4380, 210),
      ],
    },

    // Stage 8 - "Darkness Falls" (spotlight only)
    {
      id: 8,
      name: "Darkness Falls",
      bgHue: 250,
      worldWidth: 4400,
      spinners: [],
      platforms: [
        makePlatform(0, 480, 200, 20),
        makePlatform(280, 450, 120, 20),
        makePlatform(480, 420, 100, 20),
        makePlatform(660, 440, 120, 20),
        makePlatform(860, 410, 100, 20),
        makeCheckpoint(990, 370),
        makeCheckpointBase(990, 370),
        makePlatform(1060, 370, 120, 20),
        makePlatform(1260, 390, 110, 20),
        makePlatform(1450, 360, 100, 20),
        makePlatform(1630, 380, 120, 20),
        makePlatform(1830, 350, 100, 20),
        makeCheckpoint(1980, 310),
        makeCheckpointBase(1980, 310),
        makePlatform(2060, 310, 130, 20),
        makePlatform(2280, 330, 110, 20),
        makePlatform(2470, 300, 100, 20),
        makePlatform(2660, 320, 120, 20),
        makePlatform(2860, 290, 110, 20),
        makePlatform(3050, 310, 100, 20),
        makeCheckpoint(3200, 270),
        makeCheckpointBase(3200, 270),
        makePlatform(3280, 270, 130, 20),
        makePlatform(3510, 290, 110, 20),
        makePlatform(3710, 260, 100, 20),
        makePlatform(3900, 280, 120, 20),
        makePlatform(4100, 250, 110, 20),
        makeFinish(4270, 180),
        makeFinishBase(4270, 180),
      ],
    },

    // Stage 9 - "Mirror Maze" (platforms shuffle position)
    {
      id: 9,
      name: "Mirror Maze",
      bgHue: 180,
      worldWidth: 4600,
      spinners: [],
      platforms: [
        makePlatform(0, 480, 200, 20),
        {
          ...makePlatform(280, 450, 120, 20, "static", "#22d3ee"),
          mirrorX: 600,
          mirrorY: 420,
          targetX: 280,
          targetY: 450,
        },
        {
          ...makePlatform(600, 420, 100, 20, "static", "#22d3ee"),
          mirrorX: 280,
          mirrorY: 450,
          targetX: 600,
          targetY: 420,
        },
        {
          ...makePlatform(780, 440, 120, 20, "static", "#22d3ee"),
          mirrorX: 960,
          mirrorY: 410,
          targetX: 780,
          targetY: 440,
        },
        {
          ...makePlatform(960, 410, 100, 20, "static", "#22d3ee"),
          mirrorX: 780,
          mirrorY: 440,
          targetX: 960,
          targetY: 410,
        },
        makeCheckpoint(1120, 370),
        makeCheckpointBase(1120, 370),
        makePlatform(1200, 370, 130, 20),
        {
          ...makePlatform(1420, 390, 110, 20, "static", "#22d3ee"),
          mirrorX: 1640,
          mirrorY: 360,
          targetX: 1420,
          targetY: 390,
        },
        {
          ...makePlatform(1640, 360, 100, 20, "static", "#22d3ee"),
          mirrorX: 1420,
          mirrorY: 390,
          targetX: 1640,
          targetY: 360,
        },
        {
          ...makePlatform(1840, 380, 120, 20, "static", "#22d3ee"),
          mirrorX: 2060,
          mirrorY: 350,
          targetX: 1840,
          targetY: 380,
        },
        {
          ...makePlatform(2060, 350, 110, 20, "static", "#22d3ee"),
          mirrorX: 1840,
          mirrorY: 380,
          targetX: 2060,
          targetY: 350,
        },
        makeCheckpoint(2250, 310),
        makeCheckpointBase(2250, 310),
        makePlatform(2330, 310, 130, 20),
        {
          ...makePlatform(2560, 330, 110, 20, "static", "#22d3ee"),
          mirrorX: 2780,
          mirrorY: 300,
          targetX: 2560,
          targetY: 330,
        },
        {
          ...makePlatform(2780, 300, 100, 20, "static", "#22d3ee"),
          mirrorX: 2560,
          mirrorY: 330,
          targetX: 2780,
          targetY: 300,
        },
        {
          ...makePlatform(2980, 320, 120, 20, "static", "#22d3ee"),
          mirrorX: 3200,
          mirrorY: 290,
          targetX: 2980,
          targetY: 320,
        },
        {
          ...makePlatform(3200, 290, 110, 20, "static", "#22d3ee"),
          mirrorX: 2980,
          mirrorY: 320,
          targetX: 3200,
          targetY: 290,
        },
        makeCheckpoint(3380, 250),
        makeCheckpointBase(3380, 250),
        makePlatform(3460, 250, 130, 20),
        {
          ...makePlatform(3700, 270, 110, 20, "static", "#22d3ee"),
          mirrorX: 3920,
          mirrorY: 240,
          targetX: 3700,
          targetY: 270,
        },
        {
          ...makePlatform(3920, 240, 100, 20, "static", "#22d3ee"),
          mirrorX: 3700,
          mirrorY: 270,
          targetX: 3920,
          targetY: 240,
        },
        {
          ...makePlatform(4120, 260, 120, 20, "static", "#22d3ee"),
          mirrorX: 4320,
          mirrorY: 230,
          targetX: 4120,
          targetY: 260,
        },
        makePlatform(4320, 230, 110, 20),
        makeFinish(4480, 160),
        makeFinishBase(4480, 160),
      ],
    },

    // Stage 10 - "The Final Boss"
    {
      id: 10,
      name: "The Final Boss",
      bgHue: 300,
      worldWidth: 4800,
      spinners: [],
      platforms: [
        makePlatform(0, 480, 200, 20),
        makePlatform(280, 460, 120, 20),
        makePlatform(480, 440, 100, 20),
        makePlatform(660, 460, 120, 20),
        makePlatform(860, 440, 100, 20),
        makeCheckpoint(1000, 400),
        makeCheckpointBase(1000, 400),
        makePlatform(1080, 400, 130, 20),
        makePlatform(1300, 420, 110, 20),
        makePlatform(1500, 400, 100, 20),
        makePlatform(1700, 420, 120, 20),
        makePlatform(1900, 400, 110, 20),
        makeCheckpoint(2060, 360),
        makeCheckpointBase(2060, 360),
        makePlatform(2140, 360, 130, 20),
        makePlatform(2360, 380, 110, 20),
        makePlatform(2560, 360, 100, 20),
        makePlatform(2760, 380, 120, 20),
        makePlatform(2960, 350, 110, 20),
        makePlatform(3150, 370, 100, 20),
        makeCheckpoint(3320, 330),
        makeCheckpointBase(3320, 330),
        // Boss arena area - bigger platforms
        makePlatform(3400, 330, 200, 20),
        makePlatform(3700, 310, 180, 20),
        makePlatform(4000, 290, 160, 20),
        // Tall pillar to reach finish
        makePlatform(4300, 400, 80, 300), // tall pillar left side
        makePlatform(4380, 180, 180, 20), // top platform where finish is
        makeFinish(4460, 100),
        makeFinishBase(4460, 100),
      ],
    },
  ];
}

// ===================================================
// DRAWING FUNCTIONS
// ===================================================

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawPlayer(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const cx = x + PLAYER_W / 2;

  // Body shadow
  ctx.save();
  ctx.shadowColor = "#7c3aed";
  ctx.shadowBlur = 15;

  // Legs
  ctx.fillStyle = "#4f46e5";
  ctx.fillRect(cx - 9, y + 26, 8, 14);
  ctx.fillRect(cx + 1, y + 26, 8, 14);

  // Body
  ctx.fillStyle = "#c7d2fe";
  drawRoundedRect(ctx, cx - 10, y + 12, 20, 16, 2);
  ctx.fill();

  // Arms
  ctx.fillStyle = "#a5b4fc";
  ctx.fillRect(cx - 16, y + 13, 6, 10);
  ctx.fillRect(cx + 10, y + 13, 6, 10);

  // Head
  ctx.fillStyle = "#e0e7ff";
  ctx.fillRect(cx - 10, y, 20, 14);

  // Eyes
  ctx.fillStyle = "#1e1b4b";
  ctx.fillRect(cx - 5, y + 4, 4, 4);
  ctx.fillRect(cx + 1, y + 4, 4, 4);

  ctx.restore();
}

function drawPlatform(
  ctx: CanvasRenderingContext2D,
  p: Platform,
  timeMs: number,
) {
  if (!p.active) return;

  let alpha = 1;
  if (p.type === "rhythm") {
    const phase = (p.rhythmPhase ?? 0) * RHYTHM_PERIOD;
    const t = (timeMs / 1000 + phase) % RHYTHM_PERIOD;
    const visible = t < RHYTHM_VISIBLE;
    if (!visible) return;
    // Fade effect near edges
    const fadeIn = Math.min(t / 0.15, 1);
    const fadeOut = Math.min((RHYTHM_VISIBLE - t) / 0.15, 1);
    alpha = Math.min(fadeIn, fadeOut);
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowBlur = 12;
  ctx.shadowColor = p.glowColor;

  let topColor = "#2e1065";
  let bottomColor = "#1e0050";

  if (p.type === "jump_pad") {
    topColor = "#fbbf24";
    bottomColor = "#d97706";
    ctx.shadowColor = "#fbbf24";
    ctx.shadowBlur = 20;
  } else if (p.type === "boost") {
    topColor = "#4ade80";
    bottomColor = "#16a34a";
    ctx.shadowColor = "#4ade80";
    ctx.shadowBlur = 20;
  } else if (p.type === "rhythm") {
    topColor = "#7c2d92";
    bottomColor = "#581c87";
    ctx.shadowColor = "#e879f9";
    ctx.shadowBlur = 18;
  } else if (p.type === "moving") {
    topColor = "#1e3a5f";
    bottomColor = "#0f172a";
    ctx.shadowColor = "#22d3ee";
    ctx.shadowBlur = 14;
  } else if (p.glowColor === "#22d3ee") {
    topColor = "#0c3b4a";
    bottomColor = "#061e26";
  }

  const grad = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
  grad.addColorStop(0, topColor);
  grad.addColorStop(1, bottomColor);
  ctx.fillStyle = grad;

  const r = Math.min(4, p.h / 2);
  drawRoundedRect(ctx, p.x, p.y, p.w, p.h, r);
  ctx.fill();

  // Top edge highlight
  ctx.strokeStyle = p.glowColor;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = alpha * 0.7;
  ctx.beginPath();
  ctx.moveTo(p.x + r, p.y);
  ctx.lineTo(p.x + p.w - r, p.y);
  ctx.stroke();

  ctx.restore();
}

function drawCheckpoint(
  ctx: CanvasRenderingContext2D,
  p: Platform,
  time: number,
) {
  const active = p.active;
  const cx = p.x + p.w / 2;
  const baseY = p.y + p.h;
  const color = active ? "#4ade80" : "#7c3aed";
  const glowStr = active ? 20 : 8;

  ctx.save();
  ctx.shadowBlur = glowStr;
  ctx.shadowColor = color;

  // Pole
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, baseY);
  ctx.lineTo(cx, p.y);
  ctx.stroke();

  // Flag wave
  const wave = active ? Math.sin(time * 3) * 5 : 0;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, p.y);
  ctx.lineTo(cx + 16 + wave, p.y + 6);
  ctx.lineTo(cx + 16 + wave * 0.5, p.y + 12);
  ctx.lineTo(cx, p.y + 12);
  ctx.closePath();
  ctx.fill();

  // Base glow ball
  ctx.beginPath();
  ctx.arc(cx, baseY, 5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  ctx.restore();
}

function drawFinish(
  ctx: CanvasRenderingContext2D,
  p: Platform,
  playerX: number,
  time: number,
) {
  const cx = p.x + p.w / 2;
  const baseY = p.y + p.h;
  const dist = Math.abs(playerX - cx);
  const glow = Math.max(30 - dist / 30, 8);

  ctx.save();
  ctx.shadowBlur = glow + Math.sin(time * 4) * 5;
  ctx.shadowColor = "#fbbf24";

  // Pole
  ctx.strokeStyle = "#fbbf24";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, baseY);
  ctx.lineTo(cx, p.y);
  ctx.stroke();

  // Checkered flag
  const fw = 32;
  const fh = 24;
  const fx = cx;
  const fy = p.y;
  const waveAmt = Math.sin(time * 5) * 3;
  const cellSize = 8;
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 3; row++) {
      const isDark = (col + row) % 2 === 0;
      const wave2 = Math.sin(time * 5 + col * 0.5) * waveAmt;
      ctx.fillStyle = isDark ? "#fbbf24" : "#1a0040";
      ctx.fillRect(
        fx + col * cellSize,
        fy + row * cellSize + wave2,
        cellSize,
        cellSize,
      );
    }
  }
  ctx.strokeStyle = "#fbbf24";
  ctx.lineWidth = 1;
  ctx.strokeRect(fx, fy, fw, fh);

  ctx.restore();
}

function drawSpinner(ctx: CanvasRenderingContext2D, sp: Spinner) {
  ctx.save();
  ctx.shadowBlur = 18;
  ctx.shadowColor = sp.color;
  ctx.strokeStyle = sp.color;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";

  const angle = sp.angle;
  const x1 = sp.cx + Math.cos(angle) * sp.length;
  const y1 = sp.cy + Math.sin(angle) * sp.length;
  const x2 = sp.cx + Math.cos(angle + Math.PI) * sp.length;
  const y2 = sp.cy + Math.sin(angle + Math.PI) * sp.length;

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // Center dot
  ctx.fillStyle = sp.color;
  ctx.shadowBlur = 25;
  ctx.beginPath();
  ctx.arc(sp.cx, sp.cy, 5, 0, Math.PI * 2);
  ctx.fill();

  // Danger tips
  ctx.beginPath();
  ctx.arc(x1, y1, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x2, y2, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawCreature(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  opacity: number,
  time: number,
) {
  if (opacity <= 0) return;
  ctx.save();
  ctx.globalAlpha = opacity;

  const drumBob = Math.sin(time * 2.5) * 3;
  const cy = y + drumBob;

  ctx.shadowBlur = 25;
  ctx.shadowColor = "#4c1d95";
  ctx.strokeStyle = "#2d0a5e";
  ctx.fillStyle = "#1a0040";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";

  // Head (elongated oval)
  ctx.beginPath();
  ctx.ellipse(x, cy, 10, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Body
  ctx.beginPath();
  ctx.moveTo(x, cy + 14);
  ctx.lineTo(x, cy + 50);
  ctx.stroke();

  // Arms (long, angled down forward ominously)
  const armSway = Math.sin(time * 1.5) * 5;
  ctx.beginPath();
  ctx.moveTo(x, cy + 20);
  ctx.lineTo(x - 22 + armSway, cy + 38);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, cy + 20);
  ctx.lineTo(x + 22 - armSway, cy + 38);
  ctx.stroke();

  // Legs
  ctx.beginPath();
  ctx.moveTo(x, cy + 50);
  ctx.lineTo(x - 12, cy + 72);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, cy + 50);
  ctx.lineTo(x + 12, cy + 72);
  ctx.stroke();

  // Drum circle at waist
  ctx.beginPath();
  ctx.arc(x, cy + 35, 12, 0, Math.PI * 2);
  ctx.strokeStyle = "#7c3aed";
  ctx.shadowColor = "#a855f7";
  ctx.shadowBlur = 20;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Drum sticks
  ctx.strokeStyle = "#c4b5fd";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - 18, cy + 28);
  ctx.lineTo(x - 8, cy + 38);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 18, cy + 28);
  ctx.lineTo(x + 8, cy + 38);
  ctx.stroke();

  ctx.restore();
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]) {
  for (const p of particles) {
    const alpha = p.life / p.maxLife;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.shadowBlur = 8;
    ctx.shadowColor = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    ctx.restore();
  }
}

function drawShockwaves(
  ctx: CanvasRenderingContext2D,
  waves: Shockwave[],
  _canvasW: number,
) {
  for (const w of waves) {
    if (!w.alive) continue;
    const alpha = (1 - w.progress) * 0.85;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#a855f7";
    ctx.shadowBlur = 12;
    ctx.shadowColor = "#e879f9";
    ctx.lineWidth = 3;

    // Draw wave as a horizontal arc/ellipse at y position
    ctx.beginPath();
    ctx.ellipse(w.x, w.y, 50 + w.progress * 80, 12, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Inner ring
    ctx.globalAlpha = alpha * 0.4;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(w.x, w.y, 30 + w.progress * 50, 8, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cameraX: number,
  bgHue: number,
  time: number,
) {
  // Base dark gradient
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, `hsl(${bgHue}, 70%, 3%)`);
  grad.addColorStop(1, `hsl(${bgHue + 20}, 50%, 6%)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Star particles
  ctx.save();
  ctx.fillStyle = "rgba(200, 180, 255, 0.25)";
  for (let i = 0; i < 60; i++) {
    // Deterministic star positions based on index, parallax with camera
    const sx = (((i * 137 + 50) % 8000) - cameraX * 0.15) % w;
    const sy = (i * 97 + 30) % h;
    const wink = Math.sin(time * 2 + i) * 0.5 + 0.5;
    ctx.globalAlpha = wink * 0.3;
    ctx.fillRect((sx + w) % w, (sy + h) % h, 2, 2);
  }
  ctx.restore();

  // Fog wisps
  ctx.save();
  for (let i = 0; i < 4; i++) {
    const fx = ((i * 1200 - cameraX * 0.3) % (w + 400)) - 200;
    const fy = 100 + i * 80;
    const fogAlpha = (Math.sin(time * 0.3 + i * 1.5) * 0.5 + 0.5) * 0.04;
    const fogGrad = ctx.createRadialGradient(fx, fy, 10, fx, fy, 300);
    fogGrad.addColorStop(0, `hsla(${bgHue}, 80%, 20%, ${fogAlpha})`);
    fogGrad.addColorStop(1, "transparent");
    ctx.fillStyle = fogGrad;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

function drawDrumPulse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  progress: number, // 0..1
) {
  if (progress <= 0) return;
  const alpha = (1 - progress) * 0.6;
  const radius = 20 + progress * 200;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = "#e879f9";
  ctx.shadowBlur = 15;
  ctx.shadowColor = "#e879f9";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// ===================================================
// COLLISION
// ===================================================

function collideAABB(
  px: number,
  py: number,
  pw: number,
  ph: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): { overlapX: number; overlapY: number } | null {
  const overlapX = Math.min(px + pw, rx + rw) - Math.max(px, rx);
  const overlapY = Math.min(py + ph, ry + rh) - Math.max(py, ry);
  if (overlapX > 0 && overlapY > 0) {
    return { overlapX, overlapY };
  }
  return null;
}

// ===================================================
// PROPS & COMPONENT
// ===================================================

interface ObbyCoreGameProps {
  onDeath: (deaths: number) => void;
  onStageChange: (stage: number) => void;
  onGameOver: (stage: number, deaths: number) => void;
  onWin: (deaths: number) => void;
  onCheckpoint: () => void;
  gameActive: boolean;
  drumPulseSignal: (active: boolean) => void;
  customStage?: StageConfig;
  startStage?: number;
}

const STAGES = buildStages();

export default function ObbyCoreGame({
  onDeath,
  onStageChange,
  onGameOver,
  onWin,
  onCheckpoint,
  gameActive,
  drumPulseSignal,
  customStage,
  startStage,
}: ObbyCoreGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // All game state lives in refs for RAF loop
  const gsRef = useRef<GameState>({
    phase: "start",
    stage: 1,
    lives: 3,
    deaths: 0,
    checkpointIndex: -1,
    checkpointX: 60,
    checkpointY: 440,
    playerVisible: true,
    respawnTimer: 0,
    stageName: "",
    stageNameTimer: 0,
  });

  const playerRef = useRef<Player>({
    x: 60,
    y: 440,
    vx: 0,
    vy: 0,
    onGround: false,
    jumpsLeft: 2,
    speedBoostTimer: 0,
    isDead: false,
  });

  const platformsRef = useRef<Platform[]>([]);
  const spinnersRef = useRef<Spinner[]>([]);

  const effectsRef = useRef<Effects>({
    deathFlashAlpha: 0,
    checkpointFlashAlpha: 0,
    drumPulseTimer: 0,
    drumPulseActive: false,
    particles: [],
    shockwaves: [],
    bossShockwaveTimer: 0,
    shadowX: 0,
    shadowTargetX: 0,
    darknessFogAlpha: 0,
    windDir: 1,
    windTimer: 0,
    mirrorTimer: 0,
    mirrorCountdown: MIRROR_INTERVAL,
  });

  const keysRef = useRef<Record<string, boolean>>({});
  const touchRef = useRef<{
    left: boolean;
    right: boolean;
    jump: boolean;
    joystickDx: number;
    _jumpConsumed: boolean;
  }>({
    left: false,
    right: false,
    jump: false,
    joystickDx: 0,
    _jumpConsumed: false,
  });

  const cameraRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const gameActiveRef = useRef(gameActive);

  useEffect(() => {
    gameActiveRef.current = gameActive;
  }, [gameActive]);

  // Touch tracking
  const touchStartRef = useRef<{ id: number; x: number; y: number } | null>(
    null,
  );

  const customStageRef = useRef<StageConfig | undefined>(customStage);
  useEffect(() => {
    customStageRef.current = customStage;
  }, [customStage]);

  const loadStage = useCallback((stageId: number) => {
    const cfg =
      stageId === 99 && customStageRef.current
        ? customStageRef.current
        : STAGES.find((s) => s.id === stageId);
    if (!cfg) return;

    // Deep copy platforms
    platformsRef.current = cfg.platforms.map((p) => ({ ...p }));
    spinnersRef.current = cfg.spinners.map((s) => ({ ...s }));

    // Reset effects
    const eff = effectsRef.current;
    eff.bossShockwaveTimer = 0;
    eff.shockwaves = [];
    eff.particles = [];
    eff.windDir = 1;
    eff.windTimer = 0;
    eff.mirrorTimer = 0;
    eff.mirrorCountdown = MIRROR_INTERVAL;
    eff.shadowX = -200;
    eff.shadowTargetX = 0;

    // Set player to start
    playerRef.current.x = 60;
    playerRef.current.y = 380;
    playerRef.current.vx = 0;
    playerRef.current.vy = 0;
    playerRef.current.onGround = false;
    playerRef.current.jumpsLeft = 2;
    playerRef.current.speedBoostTimer = 0;
    playerRef.current.isDead = false;

    gsRef.current.checkpointIndex = -1;
    gsRef.current.checkpointX = 60;
    gsRef.current.checkpointY = 380;
    gsRef.current.playerVisible = true;
    gsRef.current.stageName = cfg.name;
    gsRef.current.stageNameTimer = 2.5;

    cameraRef.current.x = 0;
    cameraRef.current.y = 0;
  }, []);

  const spawnParticles = useCallback((x: number, y: number, color: string) => {
    const particles = effectsRef.current.particles;
    for (let i = 0; i < 15; i++) {
      const angle = (i / 15) * Math.PI * 2 + Math.random() * 0.5;
      const speed = 80 + Math.random() * 120;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        life: 0.8 + Math.random() * 0.4,
        maxLife: 1.0,
        color,
        size: 4 + Math.random() * 4,
      });
    }
  }, []);

  const triggerDeath = useCallback(() => {
    const gs = gsRef.current;
    if (gs.respawnTimer > 0 || playerRef.current.isDead) return;

    gs.deaths++;
    gs.lives--;
    playerRef.current.isDead = true;
    gs.playerVisible = false;
    effectsRef.current.deathFlashAlpha = 1.0;

    onDeath(gs.deaths);

    if (gs.lives <= 0) {
      setTimeout(() => {
        onGameOver(gs.stage, gs.deaths);
        gs.phase = "gameover";
      }, 800);
    } else {
      gs.respawnTimer = 0.8;
    }
  }, [onDeath, onGameOver]);

  const respawnPlayer = useCallback(() => {
    const gs = gsRef.current;
    const p = playerRef.current;
    p.x = gs.checkpointX;
    p.y = gs.checkpointY - PLAYER_H;
    p.vx = 0;
    p.vy = 0;
    p.onGround = false;
    p.jumpsLeft = 2;
    p.isDead = false;
    gs.playerVisible = true;
    gs.respawnTimer = 0;
  }, []);

  const activateCheckpoint = useCallback(
    (platformIndex: number) => {
      const platforms = platformsRef.current;
      const cp = platforms[platformIndex];
      if (!cp || cp.active) return;

      cp.active = true;
      const gs = gsRef.current;
      gs.checkpointIndex = platformIndex;
      gs.checkpointX = cp.x + cp.w / 2;
      gs.checkpointY = cp.y;

      effectsRef.current.checkpointFlashAlpha = 1.0;
      spawnParticles(gs.checkpointX, gs.checkpointY, "#4ade80");
      onCheckpoint();
    },
    [spawnParticles, onCheckpoint],
  );

  const advanceStage = useCallback(() => {
    const gs = gsRef.current;
    if (gs.stage === 99) {
      gs.phase = "win";
      onWin(gs.deaths);
      return;
    }
    if (gs.stage >= 10) {
      gs.phase = "win";
      onWin(gs.deaths);
      return;
    }
    gs.stage++;
    onStageChange(gs.stage);
    loadStage(gs.stage);
  }, [loadStage, onStageChange, onWin]);

  const update = useCallback(
    (dt: number) => {
      const gs = gsRef.current;
      if (!gameActiveRef.current || gs.phase !== "playing") return;

      const p = playerRef.current;
      const eff = effectsRef.current;
      const platforms = platformsRef.current;
      const spinners = spinnersRef.current;
      const keys = keysRef.current;
      const touch = touchRef.current;
      const time = timeRef.current;
      const stageId = gs.stage;

      // === Respawn timer ===
      if (gs.respawnTimer > 0) {
        gs.respawnTimer -= dt;
        if (gs.respawnTimer <= 0) {
          respawnPlayer();
        }
        return;
      }

      // === Stage name timer ===
      if (gs.stageNameTimer > 0) gs.stageNameTimer -= dt;

      // === Moving platforms ===
      for (const plat of platforms) {
        if (plat.type === "moving") {
          plat.t = (plat.t ?? 0) + dt;
          const sx = plat.startX ?? plat.x;
          const sy = plat.startY ?? plat.y;
          const rx = plat.rangeX ?? 0;
          const ry = plat.rangeY ?? 0;
          const dx = plat.dx ?? 0;
          const dy = plat.dy ?? 0;

          if (rx > 0) {
            const speed = Math.abs(dx);
            const period = (rx * 2) / speed;
            const phase = (plat.t % period) / period;
            plat.x = sx + Math.sin(phase * Math.PI * 2) * (rx / 2);
          }
          if (ry > 0) {
            const speed = Math.abs(dy);
            const period = (ry * 2) / speed;
            const phase = (plat.t % period) / period;
            plat.y = sy + Math.sin(phase * Math.PI * 2) * (ry / 2);
          }
        }
      }

      // === Spinners ===
      for (const sp of spinners) {
        sp.angle += sp.speed * dt;
      }

      // === Mirror platforms (stage 9) ===
      if (stageId === 9) {
        eff.mirrorTimer += dt;
        eff.mirrorCountdown =
          MIRROR_INTERVAL - (eff.mirrorTimer % MIRROR_INTERVAL);
        const phase = eff.mirrorTimer % MIRROR_INTERVAL;
        for (const plat of platforms) {
          if (plat.mirrorX !== undefined && plat.mirrorY !== undefined) {
            const tx = plat.targetX ?? plat.x;
            const ty = plat.targetY ?? plat.y;
            const mx = plat.mirrorX;
            const my = plat.mirrorY;

            if (phase < 0.5) {
              // Transition to mirror
              const t2 = phase / 0.5;
              const ease = t2 < 0.5 ? 2 * t2 * t2 : 1 - (-2 * t2 + 2) ** 2 / 2;
              plat.x = tx + (mx - tx) * ease;
              plat.y = ty + (my - ty) * ease;
            } else if (phase < MIRROR_INTERVAL - 0.5) {
              plat.x = mx;
              plat.y = my;
            } else {
              // Transition back
              const t3 = (phase - (MIRROR_INTERVAL - 0.5)) / 0.5;
              const ease = t3 < 0.5 ? 2 * t3 * t3 : 1 - (-2 * t3 + 2) ** 2 / 2;
              plat.x = mx + (tx - mx) * ease;
              plat.y = my + (ty - my) * ease;
            }
          }
        }
      }

      // === Wind mechanic (stage 5) ===
      if (stageId === 5) {
        eff.windTimer += dt;
        if (eff.windTimer >= WIND_CHANGE_INTERVAL) {
          eff.windTimer = 0;
          eff.windDir *= -1;
        }
      }

      // === Shadow creature (stage 7) ===
      if (stageId === 7) {
        const targetX = p.x + 400; // Approaches from right
        eff.shadowX +=
          (targetX - eff.shadowX) * Math.min(dt * SHADOW_SPEED * 0.01, 1);
        // If shadow catches player
        if (Math.abs(eff.shadowX - p.x) < 60 && !p.isDead) {
          triggerDeath();
        }
      }

      // === Drum beat / boss shockwaves (stage 4, 10) ===
      eff.drumPulseTimer += dt;
      if (eff.drumPulseTimer >= DRUM_INTERVAL) {
        eff.drumPulseTimer = 0;
        eff.drumPulseActive = true;
        drumPulseSignal(true);
        setTimeout(() => {
          effectsRef.current.drumPulseActive = false;
          drumPulseSignal(false);
        }, 400);

        if (stageId === 10) {
          // Boss at x=4400 in world
          const bossWorldX = 4400;
          eff.shockwaves.push({
            x: bossWorldX,
            y: 300 + Math.random() * 100,
            progress: 0,
            speed: 0.6,
            alive: true,
          });
        }
      }

      // Update shockwaves
      for (const sw of eff.shockwaves) {
        sw.progress += dt * sw.speed;
        sw.x -= 200 * dt; // Move left
        if (sw.progress >= 1 || sw.x < -200) sw.alive = false;
      }
      eff.shockwaves = eff.shockwaves.filter((sw) => sw.alive);

      // Check shockwave collision (stage 10)
      if (stageId === 10) {
        for (const sw of eff.shockwaves) {
          // Both sw.x and p.x are in world space
          const dx = Math.abs(sw.x - (p.x + PLAYER_W / 2));
          const dy = Math.abs(sw.y - (p.y + PLAYER_H / 2));
          const shockR = 50 + sw.progress * 80;
          if (dx < shockR && dy < 20) {
            triggerDeath();
          }
        }
      }

      // === Particles ===
      for (const pt of eff.particles) {
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.vy += 200 * dt;
        pt.life -= dt;
      }
      eff.particles = eff.particles.filter((pt) => pt.life > 0);

      // === Flash effects decay ===
      eff.deathFlashAlpha = Math.max(0, eff.deathFlashAlpha - dt * 2.5);
      eff.checkpointFlashAlpha = Math.max(
        0,
        eff.checkpointFlashAlpha - dt * 2.5,
      );

      // === Player input ===
      if (!p.isDead) {
        const left =
          keys.ArrowLeft ||
          keys.a ||
          keys.A ||
          touch.left ||
          touch.joystickDx < -0.3;
        const right =
          keys.ArrowRight ||
          keys.d ||
          keys.D ||
          touch.right ||
          touch.joystickDx > 0.3;
        const jumpPressed = keys[" "] || keys.ArrowUp || keys.w || keys.W;

        const maxSpd = p.speedBoostTimer > 0 ? MAX_SPEED * 1.5 : MAX_SPEED;

        if (left) {
          p.vx = Math.max(p.vx - ACCELERATION * dt, -maxSpd);
        } else if (right) {
          p.vx = Math.min(p.vx + ACCELERATION * dt, maxSpd);
        } else {
          // Friction
          const friction = FRICTION * dt;
          if (Math.abs(p.vx) <= friction) {
            p.vx = 0;
          } else {
            p.vx -= Math.sign(p.vx) * friction;
          }
        }

        // Wind (stage 5)
        if (stageId === 5) {
          p.vx += eff.windDir * 60 * dt;
          p.vx = Math.max(-maxSpd, Math.min(maxSpd, p.vx));
        }

        // Speed boost decay
        if (p.speedBoostTimer > 0) p.speedBoostTimer -= dt;

        // Jump
        if (jumpPressed && !keys._jumpConsumed && p.jumpsLeft > 0) {
          p.vy = JUMP_VEL;
          p.jumpsLeft--;
          keys._jumpConsumed = true;
          p.onGround = false;
        }
        if (!jumpPressed) {
          keys._jumpConsumed = false;
        }
        if (touch.jump && !touch._jumpConsumed) {
          if (p.jumpsLeft > 0) {
            p.vy = JUMP_VEL;
            p.jumpsLeft--;
            touch._jumpConsumed = true;
          }
        }
        if (!touch.jump) {
          touch._jumpConsumed = false;
        }

        // Gravity
        p.vy = Math.min(p.vy + GRAVITY * dt, TERMINAL_VEL);

        // Move
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        p.onGround = false;

        // Platform collision
        for (let i = 0; i < platforms.length; i++) {
          const plat = platforms[i];

          // Skip rhythm platforms when not visible
          if (plat.type === "rhythm") {
            const phase = (plat.rhythmPhase ?? 0) * RHYTHM_PERIOD;
            const t2 = (time + phase) % RHYTHM_PERIOD;
            if (t2 >= RHYTHM_VISIBLE) continue;
          }

          if (!plat.active && plat.type === "checkpoint") {
            // Checkpoints collide even when not "active" (for triggering)
          } else if (!plat.active) {
            continue;
          }

          if (plat.type === "checkpoint" || plat.type === "finish") {
            // Overlap check
            const col = collideAABB(
              p.x,
              p.y,
              PLAYER_W,
              PLAYER_H,
              plat.x,
              plat.y,
              plat.w,
              plat.h,
            );
            if (col) {
              if (plat.type === "checkpoint") {
                activateCheckpoint(i);
              } else if (plat.type === "finish") {
                advanceStage();
                return;
              }
            }
            continue;
          }

          // Normal collision
          const col = collideAABB(
            p.x,
            p.y,
            PLAYER_W,
            PLAYER_H,
            plat.x,
            plat.y,
            plat.w,
            plat.h,
          );
          if (!col) continue;

          if (col.overlapY < col.overlapX) {
            // Vertical resolution
            const prevY = p.y - p.vy * dt;
            if (prevY + PLAYER_H <= plat.y + 4) {
              // Landing on top
              p.y = plat.y - PLAYER_H;
              p.vy = 0;
              p.onGround = true;
              p.jumpsLeft = 2;

              // Special platform effects
              if (plat.type === "jump_pad") {
                p.vy = -1100;
                p.jumpsLeft = 2;
              } else if (plat.type === "boost") {
                p.speedBoostTimer = 1.5;
              }
            } else {
              p.y = plat.y + plat.h;
              if (p.vy < 0) p.vy = 0;
            }
          } else {
            // Horizontal resolution
            if (p.x + PLAYER_W / 2 < plat.x + plat.w / 2) {
              p.x = plat.x - PLAYER_W;
            } else {
              p.x = plat.x + plat.w;
            }
            p.vx = 0;
          }
        }

        // Spinner collision (stage 3)
        for (const sp of spinners) {
          const spX = sp.cx + Math.cos(sp.angle) * sp.length;
          const spY = sp.cy + Math.sin(sp.angle) * sp.length;
          const spX2 = sp.cx + Math.cos(sp.angle + Math.PI) * sp.length;
          const spY2 = sp.cy + Math.sin(sp.angle + Math.PI) * sp.length;

          const checkTip = (tx: number, ty: number) => {
            const dx = tx - (p.x + PLAYER_W / 2);
            const dy = ty - (p.y + PLAYER_H / 2);
            return Math.sqrt(dx * dx + dy * dy) < 22;
          };
          if (checkTip(spX, spY) || checkTip(spX2, spY2)) {
            triggerDeath();
          }
        }

        // Death by void
        if (p.y > DEATH_Y) {
          triggerDeath();
        }
      }

      // === Camera ===
      const canvas = canvasRef.current;
      if (!canvas) return;
      const W = canvas.width;
      const H = canvas.height;

      const targetCamX = p.x - W / 2 + PLAYER_W / 2;
      const targetCamY = p.y - H / 2 + PLAYER_H / 2 - 60;

      cameraRef.current.x +=
        (targetCamX - cameraRef.current.x) * Math.min(dt * 6, 1);
      cameraRef.current.y +=
        (targetCamY - cameraRef.current.y) * Math.min(dt * 6, 1);
    },
    [
      triggerDeath,
      activateCheckpoint,
      advanceStage,
      respawnPlayer,
      drumPulseSignal,
    ],
  );

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const gs = gsRef.current;
    const p = playerRef.current;
    const eff = effectsRef.current;
    const cam = cameraRef.current;
    const time = timeRef.current;
    const stageId = gs.stage;
    const cfg =
      stageId === 99 && customStageRef.current
        ? customStageRef.current
        : (STAGES.find((s) => s.id === stageId) ?? STAGES[0]);

    ctx.clearRect(0, 0, W, H);

    // Background
    drawBackground(ctx, W, H, cam.x, cfg.bgHue, time);

    ctx.save();
    ctx.translate(-cam.x, -cam.y);

    // === Draw platforms ===
    for (const plat of platformsRef.current) {
      if (plat.type === "checkpoint") {
        drawCheckpoint(ctx, plat, time);
      } else if (plat.type === "finish") {
        drawFinish(ctx, plat, p.x + PLAYER_W / 2, time);
      } else {
        drawPlatform(ctx, plat, time * 1000);
      }
    }

    // === Draw spinners (stage 3) ===
    for (const sp of spinnersRef.current) {
      drawSpinner(ctx, sp);
    }

    // === Drum shockwaves (stage 4 pulse, stage 10 rings) ===
    drawShockwaves(ctx, eff.shockwaves, W);

    // Stage 4: drum pulse from player position
    if (stageId === 4 && eff.drumPulseActive) {
      drawDrumPulse(
        ctx,
        p.x + PLAYER_W / 2,
        p.y + PLAYER_H / 2,
        eff.drumPulseTimer / DRUM_INTERVAL,
      );
    }

    // === Shadow creature (stage 7) ===
    if (stageId === 7) {
      const shadowAlpha = 0.55;
      drawCreature(ctx, eff.shadowX, p.y - 30, shadowAlpha, time);
    }

    // === Boss creature (stage 10) ===
    if (stageId === 10) {
      const bossX = 4400;
      const bossY = 260;
      drawCreature(ctx, bossX, bossY, 0.85, time);
      // Boss drum shockwave emit glow
      const bossGlow = Math.sin((time * Math.PI) / DRUM_INTERVAL) * 0.5 + 0.5;
      ctx.save();
      ctx.globalAlpha = bossGlow * 0.4;
      ctx.shadowBlur = 40;
      ctx.shadowColor = "#a855f7";
      ctx.strokeStyle = "#a855f7";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(bossX, bossY + 35, 20 + bossGlow * 15, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // === Wind arrows (stage 5) ===
    if (stageId === 5) {
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = "#22d3ee";
      ctx.fillStyle = "#22d3ee";
      ctx.lineWidth = 2;
      ctx.shadowColor = "#22d3ee";
      ctx.shadowBlur = 8;
      const arrowY = H / 2 + cam.y;
      const arrowSpacing = 200;
      const startX = Math.floor(cam.x / arrowSpacing) * arrowSpacing;
      for (let ax = startX; ax < cam.x + W + arrowSpacing; ax += arrowSpacing) {
        const aw = 40;
        const dir = eff.windDir;
        ctx.beginPath();
        ctx.moveTo(ax, arrowY);
        ctx.lineTo(ax + aw * dir, arrowY);
        ctx.stroke();
        // Arrowhead
        ctx.beginPath();
        ctx.moveTo(ax + aw * dir, arrowY);
        ctx.lineTo(ax + (aw - 10) * dir, arrowY - 8);
        ctx.lineTo(ax + (aw - 10) * dir, arrowY + 8);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // === Mirror maze countdown bar (stage 9) ===
    if (stageId === 9) {
      const barW = 200;
      const barH = 6;
      const barX = p.x + PLAYER_W / 2 - barW / 2;
      const barY = p.y - 25;
      const progress = eff.mirrorCountdown / MIRROR_INTERVAL;
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = "#1a0040";
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = `hsl(${180 + (1 - progress) * 100}, 80%, 60%)`;
      ctx.shadowBlur = 8;
      ctx.shadowColor = "#22d3ee";
      ctx.fillRect(barX, barY, barW * progress, barH);
      ctx.restore();
    }

    // === Particles ===
    ctx.save();
    ctx.translate(cam.x, cam.y);
    drawParticles(ctx, eff.particles);
    ctx.restore();

    // === Player ===
    if (gs.playerVisible && !p.isDead) {
      drawPlayer(ctx, p.x, p.y);
    }

    ctx.restore(); // end camera transform

    // === Darkness effect (stage 8) ===
    if (stageId === 8) {
      const spotR = 140;
      const playerScreenX = p.x - cam.x + PLAYER_W / 2;
      const playerScreenY = p.y - cam.y + PLAYER_H / 2;

      const darknessGrad = ctx.createRadialGradient(
        playerScreenX,
        playerScreenY,
        spotR * 0.4,
        playerScreenX,
        playerScreenY,
        spotR,
      );
      darknessGrad.addColorStop(0, "rgba(0,0,0,0)");
      darknessGrad.addColorStop(1, "rgba(5,3,15,0.97)");

      ctx.fillStyle = "rgba(5,3,15,0.97)";
      ctx.fillRect(0, 0, W, H);

      // Cut out spotlight
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      const spotGrad = ctx.createRadialGradient(
        playerScreenX,
        playerScreenY,
        0,
        playerScreenX,
        playerScreenY,
        spotR,
      );
      spotGrad.addColorStop(0, "rgba(0,0,0,1)");
      spotGrad.addColorStop(0.6, "rgba(0,0,0,0.9)");
      spotGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = spotGrad;
      ctx.beginPath();
      ctx.arc(playerScreenX, playerScreenY, spotR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Soft edge gradient overlay
      ctx.save();
      ctx.fillStyle = darknessGrad;
      ctx.beginPath();
      ctx.arc(playerScreenX, playerScreenY, spotR * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // === Death flash ===
    if (eff.deathFlashAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = eff.deathFlashAlpha * 0.7;
      ctx.fillStyle = "#f87171";
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // === Checkpoint flash ===
    if (eff.checkpointFlashAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = eff.checkpointFlashAlpha * 0.4;
      ctx.fillStyle = "#4ade80";
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // === Stage name ===
    if (gs.stageNameTimer > 0 && gs.phase === "playing") {
      const fadeAlpha =
        Math.min(gs.stageNameTimer / 0.5, 1) *
        Math.min((2.5 - gs.stageNameTimer + 0.5) / 0.5, 1);
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, fadeAlpha));
      ctx.font = `bold ${Math.min(36, W * 0.05)}px "Bricolage Grotesque", sans-serif`;
      ctx.textAlign = "center";
      ctx.fillStyle = "#e2e8f0";
      ctx.shadowBlur = 30;
      ctx.shadowColor = "#22d3ee";
      ctx.fillText(
        `STAGE ${gs.stage}: ${gs.stageName.toUpperCase()}`,
        W / 2,
        H / 2,
      );
      ctx.restore();
    }
  }, []);

  const gameLoop = useCallback(
    (timestamp: number) => {
      if (!gameActiveRef.current) {
        rafRef.current = requestAnimationFrame(gameLoop);
        return;
      }

      const dt = Math.min((timestamp - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = timestamp;
      timeRef.current += dt;

      update(dt);
      render();

      rafRef.current = requestAnimationFrame(gameLoop);
    },
    [update, render],
  );

  // Setup canvas resize
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }, []);

  // Keyboard handlers
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.key] = true;
      if (
        [" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
      ) {
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.key] = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Touch handlers
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        const x = t.clientX;
        const W = window.innerWidth;
        if (x < W / 2) {
          touchStartRef.current = { id: t.identifier, x, y: t.clientY };
        } else {
          touchRef.current.jump = true;
        }
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (
          touchStartRef.current &&
          t.identifier === touchStartRef.current.id
        ) {
          const dx = t.clientX - touchStartRef.current.x;
          touchRef.current.joystickDx = dx / 60;
          touchRef.current.left = dx < -15;
          touchRef.current.right = dx > 15;
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (
          touchStartRef.current &&
          t.identifier === touchStartRef.current.id
        ) {
          touchStartRef.current = null;
          touchRef.current.left = false;
          touchRef.current.right = false;
          touchRef.current.joystickDx = 0;
        }
        const x = t.clientX;
        const W = window.innerWidth;
        if (x >= W / 2) {
          touchRef.current.jump = false;
        }
      }
    };

    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: false });
    return () => {
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  // Init
  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    loadStage(1);
    gsRef.current.phase = "start";
    lastTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [resizeCanvas, loadStage, gameLoop]);

  // Expose start/restart methods via imperative handle
  // Actually, we handle this through props/gameActive

  // Start game
  useEffect(() => {
    if (gameActive) {
      gsRef.current.phase = "playing";
      const startStageId = customStageRef.current ? 99 : (startStage ?? 1);
      gsRef.current.stage = startStageId;
      gsRef.current.lives = 3;
      gsRef.current.deaths = 0;
      loadStage(startStageId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameActive, loadStage, startStage]);

  return (
    <canvas
      ref={canvasRef}
      className="game-canvas"
      data-ocid="game.canvas_target"
      style={{ touchAction: "none" }}
    />
  );
}

export type { GameState, Platform, StageConfig };
