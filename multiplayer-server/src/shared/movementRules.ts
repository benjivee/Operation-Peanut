export interface MoveMessage { x: number; y: number; angle?: number }
export interface Position { x: number; y: number; angle?: number }
export interface MovementConfig {
  coordLimit: number;
  maxSpeed: number;
  minUpdateInterval: number;
  maxStepSeconds: number;
  minPositionChange: number;
  minAngleChange: number;
}
export const DEFAULT_MOVEMENT_CONFIG: MovementConfig = {
  coordLimit: 30000, maxSpeed: 520, minUpdateInterval: 25, maxStepSeconds: 0.5,
  minPositionChange: 0.5, minAngleChange: 0.02,
};
export type MoveDecision =
  | { kind: "apply"; x: number; y: number; angle?: number }
  | { kind: "drop"; reason: string }
  | { kind: "skip"; reason: string };

export function parseMoveMessage(raw: unknown, config = DEFAULT_MOVEMENT_CONFIG): MoveMessage | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.x !== "number" || !Number.isFinite(value.x) || Math.abs(value.x) > config.coordLimit) return null;
  if (typeof value.y !== "number" || !Number.isFinite(value.y) || Math.abs(value.y) > config.coordLimit) return null;
  if (value.angle !== undefined && (typeof value.angle !== "number" || !Number.isFinite(value.angle))) return null;
  const angle = typeof value.angle === "number" ? Math.atan2(Math.sin(value.angle), Math.cos(value.angle)) : undefined;
  return { x: value.x, y: value.y, ...(angle === undefined ? {} : { angle }) };
}

export function limitMove(from: Position, to: MoveMessage, elapsedMs: number, config = DEFAULT_MOVEMENT_CONFIG): MoveDecision {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return { kind: "drop", reason: "invalid_elapsed" };
  const seconds = Math.min(elapsedMs / 1000, config.maxStepSeconds);
  const maxDistance = config.maxSpeed * seconds;
  const dx = to.x - from.x, dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  let x = to.x, y = to.y;
  if (distance > maxDistance && distance > 0) {
    const scale = maxDistance / distance;
    x = from.x + dx * scale;
    y = from.y + dy * scale;
  }
  const positionChanged = Math.hypot(x - from.x, y - from.y) >= config.minPositionChange;
  const angleChanged = to.angle !== undefined && (from.angle === undefined || Math.abs(Math.atan2(Math.sin(to.angle - from.angle), Math.cos(to.angle - from.angle))) >= config.minAngleChange);
  if (!positionChanged && !angleChanged) return { kind: "skip", reason: "unchanged" };
  return { kind: "apply", x, y, ...(to.angle === undefined ? {} : { angle: to.angle }) };
}

export class MovementGate {
  private last = new Map<string, number>();
  constructor(private readonly config = DEFAULT_MOVEMENT_CONFIG) {}
  resetAll(): void { this.last.clear(); }
  forget(sessionId: string): void { this.last.delete(sessionId); }
  evaluate(sessionId: string, raw: unknown, current: Position, nowMs: number): MoveDecision {
    const parsed = parseMoveMessage(raw, this.config);
    if (!parsed) return { kind: "drop", reason: "invalid_message" };
    if (!Number.isFinite(nowMs)) return { kind: "drop", reason: "invalid_clock" };
    const previousAt = this.last.get(sessionId);
    // First valid pose seeds the player's position. This is a temporary compromise until the server assigns map spawn positions.
    if (previousAt === undefined) {
      this.last.set(sessionId, nowMs);
      return { kind: "apply", x: parsed.x, y: parsed.y, ...(parsed.angle === undefined ? {} : { angle: parsed.angle }) };
    }
    const elapsed = nowMs - previousAt;
    if (elapsed <= 0) return { kind: "drop", reason: "invalid_elapsed" };
    if (elapsed < this.config.minUpdateInterval) return { kind: "drop", reason: "too_frequent" };
    const result = limitMove(current, parsed, elapsed, this.config);
    if (result.kind === "apply") this.last.set(sessionId, nowMs);
    return result;
  }
}
