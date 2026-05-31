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
