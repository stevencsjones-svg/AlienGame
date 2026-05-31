// =============================================================================
// glassPanel — simulated glassmorphism via layered rectangles.
// Returns a Container (positioned at x,y) holding 4 layers:
//   back (dark) -> glass tint -> border outline -> top highlight.
// Callers set depth / scrollFactor on the returned container and add their
// own text on top.
// =============================================================================
export function makeGlassPanel(scene, x, y, w, h) {
  const back = scene.add.rectangle(0, 0, w, h, 0x050a08, 0.55);
  const glass = scene.add.rectangle(0, 0, w, h, 0x00ff88, 0.04);
  const border = scene.add.rectangle(0, 0, w, h).setStrokeStyle(1, 0x00ff88, 0.25);
  border.isFilled = false;
  const highlight = scene.add.rectangle(0, -h / 2 + 0.5, w, 1, 0xffffff, 0.15);

  return scene.add.container(x, y, [back, glass, border, highlight]);
}
