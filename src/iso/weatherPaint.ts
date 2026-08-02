/**
 * Canvas side of the weather pass, shared by the exploration scene and
 * the combat arena so rain looks the same in both. Deliberately thin:
 * every position, frame, and alpha comes from the pure helpers in
 * ./weather.ts — this module only draws pre-baked sprites where it is
 * told to.
 */
import { snapToPixelGrid } from "./camera";
import { SPLASH_ART } from "./art/weather";
import { worldToScreen } from "./coords";
import type { SpriteProvider } from "./sprites";
import { RAIN_LAYERS, activeSplashes, rainStreaks, type WeatherView } from "./weather";

/**
 * Splashes where drops land on wet ground. World-space: they sit on the
 * tile diamonds, so they belong in the ground pass under every object.
 * Returns how many sprites it drew, which is what the frame counters
 * (see ./perf.ts) fold into the frame's draw total.
 */
export function paintSplashes(
  ctx: CanvasRenderingContext2D,
  sprites: SpriteProvider,
  weather: WeatherView,
  timeMs: number,
  scale: number,
): number {
  let draws = 0;
  for (const splash of activeSplashes(weather, timeMs, SPLASH_ART.length)) {
    const sprite = sprites.splash(splash.frame);
    const { sx, sy } = worldToScreen(splash.x, splash.y);
    ctx.drawImage(
      sprite.image,
      snapToPixelGrid(sx - sprite.anchorX, scale),
      snapToPixelGrid(sy - sprite.anchorY, scale),
    );
    draws++;
  }
  return draws;
}

/**
 * The falling curtain: two parallax layers of baked streaks over the
 * whole viewport. Screen-space — rain falls in front of the camera, not
 * on the world, so this is drawn after the camera translation is undone.
 * Returns how many streaks it drew — the curtain is already viewport
 * sized, so nothing here is ever culled; the count is for the frame
 * counters (see ./perf.ts).
 */
export function paintRainStreaks(
  ctx: CanvasRenderingContext2D,
  sprites: SpriteProvider,
  weather: WeatherView,
  timeMs: number,
  viewportW: number,
  viewportH: number,
  scale: number,
): number {
  let draws = 0;
  ctx.save();
  RAIN_LAYERS.forEach((layer, index) => {
    const sprite = sprites.rainStreak(index);
    for (const streak of rainStreaks(
      layer,
      index,
      timeMs,
      viewportW,
      viewportH,
      weather.density,
    )) {
      ctx.globalAlpha = streak.alpha;
      ctx.drawImage(
        sprite.image,
        snapToPixelGrid(streak.x, scale),
        snapToPixelGrid(streak.y, scale),
      );
      draws++;
    }
  });
  ctx.restore();
  return draws;
}
