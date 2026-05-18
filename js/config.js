window.SILBOT = window.SILBOT || {};

SILBOT.Config = Object.freeze({
  LATTICE: Object.freeze({
    DX: 1.0,
    DY: Math.sqrt(3) / 2,
    DZ: Math.sqrt(6) / 3,
    OFFSET_Y: 0.5,
    OFFSET_Z_X: 0.5,
    OFFSET_Z_Y: 1 / (2 * Math.sqrt(3)),
  }),
  BLOCK: Object.freeze({ width: 14, height: 12, depth: 30 }),
  CHANNEL_COLORS: Object.freeze([0xef4444, 0x3b82f6, 0x10b981, 0xf59e0b, 0x8b5cf6]),
  CHANNEL_COUNT: 5,
  AGENT_SPEED: 1.2,
  SPHERE_RADIUS: 0.44,
  BACKGROUND: 0xeef2f5,
  COLORS: Object.freeze({
    structure: 0xe2e8f0,
    wall: 0x94a3b8,
    top: 0xb4a4c4,
    cutEdge: 0x8a7a9e,
  }),
});
