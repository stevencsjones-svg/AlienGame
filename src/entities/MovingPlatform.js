import { buildPlatformVisual } from './platformVisual.js';

// =============================================================================
// MovingPlatform — a platform that loops between two points. The physics body
// is a static body manually repositioned each frame (and only updated when the
// player is near; see Level2.update). Visuals reuse buildPlatformVisual.
//
//   axis : 'x' | 'y'
//   range: distance travelled in each direction (px)
//   speed: px/s
// =============================================================================
export default class MovingPlatform {
  constructor(scene, x, topY, w, h, axis, range, speed, palette) {
    const { body, layers } = buildPlatformVisual(scene, x, topY, w, h, palette, true);
    scene.physics.add.existing(body, true); // static body

    this.scene = scene;
    this.bodyRect = body;       // the rect that carries the static body
    this.body = body.body;      // Arcade static body (Level2 colliders use bodyRect)
    this.layers = layers;

    // ---- Moving-platform visual distinction ----
    // Destructure the layers built by buildPlatformVisual (moving=true):
    //   [0] underside  [1] mainBody  [2] edge  [3] glow  [4] movingGlow
    const [, mainBody, edge, glow, movingGlow] = layers;

    // Teal-shifted body fill (#006644 vs static #003322) at higher opacity.
    mainBody.setFillStyle(0x006644, 0.75);

    // Amber top edge — primary signal that this platform moves.
    edge.setFillStyle(0xff6a00, 1.0);

    // Hide the standard green glow lines; amber edge is the only accent.
    glow.setAlpha(0);
    if (movingGlow) movingGlow.setAlpha(0);

    // Mechanical indicator rects below the underside — suggest it runs on rails.
    // Underside: centred at topY+h+4, height 8 → bottom at topY+h+8. +4 gap +2 halfHeight = topY+h+14.
    const indCY = topY + h + 14;
    const ind1 = scene.add.rectangle(x - w * 0.25, indCY, 6, 4, 0xff6a00, 0.35).setDepth(0);
    const ind2 = scene.add.rectangle(x + w * 0.25, indCY, 6, 4, 0xff6a00, 0.35).setDepth(0);
    layers.push(ind1, ind2); // include in layers so they move with the platform

    // Amber edge pulses between 70 % and 100 % opacity over 1.2 s.
    scene.tweens.add({
      targets: edge,
      alpha: { from: 0.70, to: 1.0 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.axis = axis;
    this.range = range;
    this.speed = speed;
    this.t = 0;
    this.direction = 1;

    // Origin = the body rect's centre; everything moves relative to it.
    this.originX = body.x;
    this.originY = body.y;
    this.prevX = body.x;
    this.prevY = body.y;
    this.deltaX = 0; // movement applied this frame (used to carry the player)
    this.deltaY = 0;
  }

  update(delta) {
    this.t += this.direction * this.speed * (delta / 1000);
    if (this.t >= this.range || this.t <= 0) {
      this.t = Math.max(0, Math.min(this.range, this.t));
      this.direction *= -1;
    }
    const nx = this.axis === 'x' ? this.originX + this.t : this.originX;
    const ny = this.axis === 'y' ? this.originY + this.t : this.originY;

    // Move every visual layer (the body rect is one of them).
    const dx = nx - this.prevX;
    const dy = ny - this.prevY;
    for (let i = 0; i < this.layers.length; i++) {
      this.layers[i].setPosition(this.layers[i].x + dx, this.layers[i].y + dy);
    }
    // Re-sync the static body to the (moved) body rect.
    this.body.updateFromGameObject();
    this.deltaX = dx;
    this.deltaY = dy;
    this.prevX = nx;
    this.prevY = ny;
  }
}
