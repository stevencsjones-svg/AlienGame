import { MOVING_PLATFORM_GLOW_OPACITY } from '../constants.js';

// =============================================================================
// buildPlatformVisual — the layered look shared by Level 2's static and moving
// platforms: a dim underside face, a recessed body, a bright top edge and a
// glow line. Moving platforms get an extra faint glow line to read as "alive".
//
// (cx, topY) = centre-x / top-y of the platform. Returns the body rect (for the
// physics body) and every layer (so moving platforms can reposition them).
// =============================================================================
export function buildPlatformVisual(scene, cx, topY, w, h, palette, moving = false) {
  const underside = scene.add.rectangle(cx, topY + h + 4, w, 8, palette.PLATFORM_DIM, 1).setDepth(0);
  const body = scene.add.rectangle(cx, topY + h / 2, w, h, palette.PLATFORM, 0.2).setDepth(0.1);
  const edge = scene.add.rectangle(cx, topY + 2, w, 4, palette.PLATFORM, 1).setDepth(0.2);
  const glow = scene.add.rectangle(cx, topY - 1, w, 2, palette.PLATFORM, 0.35).setDepth(0.2);

  const layers = [underside, body, edge, glow];

  if (moving) {
    const movingGlow = scene.add
      .rectangle(cx, topY - 4, w, 2, palette.PLATFORM, MOVING_PLATFORM_GLOW_OPACITY)
      .setDepth(0.2);
    layers.push(movingGlow);
  }

  return { body, layers };
}
