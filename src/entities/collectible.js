// =============================================================================
// Shared collectible helpers (used by Level 2 and future levels). A layered
// rotating diamond + a pickup shard burst. The scene owns the overlap and
// counting; these just build the visuals + carry the static body.
// (Level 1's Game.js keeps its own inline version and is left untouched.)
// =============================================================================

// Returns the middle rect `c` (which carries the static body). `c.extras` holds
// the other visual layers, and `c.hidden` flags a secret.
export function createCollectible(scene, x, y, color, hidden = false) {
  const shadow = scene.add.ellipse(x, y + 12, 18, 5, color, 0.1).setDepth(1.8);
  const outer = scene.add.rectangle(x, y, 16, 16, color, 0.25).setAngle(45).setDepth(2);
  const c = scene.add.rectangle(x, y, 12, 12, color, 0.6).setAngle(45).setDepth(2.1);
  const inner = scene.add.rectangle(x, y, 6, 6, color, 1).setAngle(45).setDepth(2.2);

  scene.physics.add.existing(c, true);
  c.hidden = hidden;
  c.extras = [outer, inner, shadow];

  const spin = hidden ? 2000 / 1.5 : 2000; // secrets spin 1.5x faster
  scene.tweens.add({ targets: [c, inner], angle: '+=360', duration: spin, repeat: -1, ease: 'Linear' });
  scene.tweens.add({ targets: outer, angle: '-=180', duration: spin, repeat: -1, ease: 'Linear' });
  inner.setScale(0.8);
  scene.tweens.add({ targets: inner, scale: 1.2, duration: 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  outer.setScale(0.95);
  scene.tweens.add({ targets: outer, scale: 1.05, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

  return c;
}

// A burst of shards + a brief flash where a collectible was taken.
export function spawnPickupShards(scene, x, y, color, count, travel) {
  for (let i = 0; i < count; i++) {
    const ang = (i * (360 / count)) * (Math.PI / 180);
    const r = scene.add.rectangle(x, y, 3, 3, color, 1).setDepth(3);
    scene.tweens.add({
      targets: r,
      x: x + Math.cos(ang) * travel,
      y: y + Math.sin(ang) * travel,
      alpha: 0,
      duration: 250,
      ease: 'Quad.easeOut',
      onComplete: () => r.destroy(),
    });
  }
  const flash = scene.add.rectangle(x, y, 20, 20, 0xffffff, 0.8).setDepth(3);
  scene.tweens.add({ targets: flash, alpha: 0, duration: 150, onComplete: () => flash.destroy() });
}
