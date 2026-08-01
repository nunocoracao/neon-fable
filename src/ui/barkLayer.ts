/**
 * Speech chips: the thin DOM layer that puts a bark over somebody's
 * head while they are exploring. It owns no rules — the scene says who
 * is standing where (SceneSpeakerFrame), the scheduler in
 * src/narrative/barks.ts decides who speaks and for how long, and this
 * file only moves elements around and sets their opacity.
 *
 * Three properties this layer is responsible for, all of them about
 * staying out of the way:
 *
 * - **It never takes input.** The layer and every chip are
 *   `pointer-events: none`, so a chip over an NPC can never eat the
 *   click that would talk to them.
 * - **It is invisible to assistive tech.** The layer is `aria-hidden`
 *   and holds nothing focusable. Barks are decoration — no bark ever
 *   carries information the player needs — so a screen-reader user
 *   loses nothing by never hearing one, and gains not having the
 *   street read out over the dialogue they are actually in.
 * - **A setting silences it.** With `barks` off nothing is scheduled
 *   and nothing is drawn, and the same happens while an overlay is
 *   open: chatter under a dialogue box is noise, so the layer is
 *   paused and cleared rather than left to fade behind the panel.
 */
import { audio } from "../audio";
import type { BarkTrigger } from "../data/barks";
import { activeMember } from "../state";
import type { GameState } from "../state/gameState";
import type { SceneSpeaker, SceneSpeakerFrame } from "../iso";
import {
  barkAlphaAt,
  createBarkSchedule,
  cueBark,
  silenceBarks,
  stepBarks,
  type BarkSchedule,
  type BarkSpeaker,
  type LiveBark,
} from "../narrative/barks";
import { reducedMotionActive, settings } from "../settings";

export interface BarkLayerOptions {
  /** The live game state; read for gating, never written. */
  state(): GameState;
  /**
   * Seeds the schedule's RNG. The same seed on the same map hears the
   * same street, which is what makes a bug in the chatter reproducible.
   */
  seed: number | string;
}

export interface BarkLayerHandle {
  /** The fixed-position element to mount under the HUD. */
  el: HTMLElement;
  /** Feed one scene frame: expire, offer, and reposition. */
  update(frame: SceneSpeakerFrame): void;
  /** Queue an event line — a district entered, rain, a bad fight. */
  cue(trigger: BarkTrigger): void;
  /**
   * Hold the street quiet (an overlay is open). Pausing takes every
   * chip down; resuming lets the scheduler start again from the
   * cooldowns it had already earned.
   */
  setPaused(paused: boolean): void;
  /** Chips on screen right now — the cap test reads this. */
  chips(): number;
  destroy(): void;
}

/** How a speaker id maps onto a chip element. */
interface Chip {
  el: HTMLElement;
  barkId: string;
}

/**
 * Who the companion chip's lines belong to. The scene reports the
 * follower's *sprite* id (it knows nothing about companions); the
 * catalog is written against companion ids, so the join happens here,
 * off the party state that put them on the street in the first place.
 */
function companionRefId(state: GameState): string | null {
  return activeMember(state.party)?.companionId ?? null;
}

/** The scene's speakers as the scheduler wants them: ids, not pixels. */
function toBarkSpeaker(speaker: SceneSpeaker, state: GameState): BarkSpeaker {
  return {
    id: speaker.id,
    kind: speaker.kind,
    refId: speaker.kind === "companion" ? companionRefId(state) : speaker.refId,
    zoneId: speaker.zoneId,
    distance: speaker.distance,
  };
}

export function createBarkLayer(options: BarkLayerOptions): BarkLayerHandle {
  const el = document.createElement("div");
  el.className = "nf-bark-layer";
  // Decoration end to end: no pointer events, and nothing here is worth
  // reading out. Both are pinned by tests.
  el.setAttribute("aria-hidden", "true");

  let schedule: BarkSchedule = createBarkSchedule(options.seed);
  let paused = false;
  /** One chip per speaker, keyed by speaker id. */
  const chips = new Map<string, Chip>();

  function clearChips(): void {
    for (const chip of chips.values()) chip.el.remove();
    chips.clear();
  }

  function silence(): void {
    schedule = silenceBarks(schedule);
    clearChips();
  }

  /** The chip for a speaker, made on first use. */
  function chipFor(live: LiveBark): Chip {
    const existing = chips.get(live.speakerId);
    if (existing && existing.barkId === live.barkId) return existing;
    existing?.el.remove();
    const chip = document.createElement("div");
    chip.className = "nf-bark-chip";
    chip.textContent = live.text;
    el.append(chip);
    const made = { el: chip, barkId: live.barkId };
    chips.set(live.speakerId, made);
    return made;
  }

  function paint(frame: SceneSpeakerFrame, reducedMotion: boolean): void {
    const anchors = new Map(frame.speakers.map((s) => [s.id, s]));
    const spoken = new Set(schedule.live.map((live) => live.speakerId));

    // A speaker who walked off the map (or out of the frame) loses
    // their chip rather than leaving it hanging over empty ground.
    for (const [speakerId, chip] of chips) {
      if (!spoken.has(speakerId)) {
        chip.el.remove();
        chips.delete(speakerId);
      }
    }

    for (const live of schedule.live) {
      const speaker = anchors.get(live.speakerId);
      const alpha = barkAlphaAt(frame.timeMs - live.startedAt, reducedMotion);
      const fresh = chips.get(live.speakerId)?.barkId !== live.barkId;
      const chip = chipFor(live);
      if (!speaker || !speaker.onScreen || alpha === null) {
        chip.el.style.opacity = "0";
        continue;
      }
      // A line opening over somebody in frame gets its pop; one that
      // started off-screen is already half said by the time it is
      // visible, and announcing it then would be a lie about when.
      if (fresh) audio.emit("ui.bark.pop");
      chip.el.style.opacity = String(alpha);
      chip.el.style.left = `${Math.round(speaker.anchorX)}px`;
      chip.el.style.top = `${Math.round(speaker.anchorY)}px`;
    }
  }

  return {
    el,

    update(frame: SceneSpeakerFrame): void {
      const current = settings.get();
      if (!current.barks || paused) {
        if (chips.size > 0 || schedule.live.length > 0) silence();
        return;
      }
      const state = options.state();
      schedule = stepBarks(schedule, {
        state,
        context: {
          mapId: frame.mapId,
          weather: frame.weather,
          dayPhase: frame.dayPhase,
        },
        // Only figures actually in frame are offered a line: a chip
        // over somebody off-screen is a chip nobody sees.
        speakers: frame.speakers
          .filter((speaker) => speaker.onScreen)
          .map((speaker) => toBarkSpeaker(speaker, state)),
        now: frame.timeMs,
        lingerMs: frame.lingerMs,
      });
      paint(frame, reducedMotionActive(current));
    },

    cue(trigger: BarkTrigger): void {
      if (!settings.get().barks) return;
      schedule = cueBark(schedule, trigger);
    },

    setPaused(next: boolean): void {
      if (next === paused) return;
      paused = next;
      if (paused) silence();
    },

    chips(): number {
      return chips.size;
    },

    destroy(): void {
      clearChips();
      el.remove();
    },
  };
}
