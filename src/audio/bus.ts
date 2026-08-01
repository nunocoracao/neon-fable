/**
 * The AudioBus is the game-facing surface: `play(soundId)` for SFX,
 * `setMusicScene(scene)` for the adaptive score, and the mixer controls.
 * It owns mixer state (persisted), the set of running stems, and the
 * scheduler tick; all actual sound goes through the injected adapter, so
 * tests drive the bus with a fake and the browser gets Web Audio.
 *
 * Screens describe *where the player is and what is happening* — a
 * district theme, a mode, an hour — and never which layers that means.
 * The bus compares the scene it is given against the arrangement it is
 * playing, asks ./score.ts for a crossfade plan on the next bar line,
 * and moves the stems named in it. Everything about which layers and
 * when is pure and lives there; what is here is bookkeeping.
 */
import type { AudioAdapter } from "./adapter";
import {
  busGain,
  busNodeGains,
  isAudible,
  memoryMixerStore,
  setBusMuted as mixerSetBusMuted,
  setBusVolume as mixerSetBusVolume,
  setDuckOnBlur as mixerSetDuckOnBlur,
  toggleBusMuted as mixerToggleBusMuted,
  type MixerState,
  type MixerStore,
} from "./mixer";
import {
  applyFocusEvent,
  ATTENDED,
  duckFactor,
  type FocusEvent,
  type FocusState,
} from "./duck";
import {
  collectDue,
  createSequencer,
  type SequencerState,
  type VoiceSpec,
} from "./music";
import {
  arrangementFor,
  arrangementVoice,
  layerKey,
  planCrossfade,
  sceneEquals,
  type Arrangement,
  type MusicMode,
  type MusicScene,
} from "./score";
import { SOUND_PATCHES, type SoundId } from "./patches";
import { busForEvent, patchForEvent } from "./events";
import type { SoundEventId } from "../data/sfx";
import type { MusicLayerRole } from "../data/music";
import type { MixBusId, PlaybackBusId } from "../data/mixBuses";

/** Seconds of crossfade between arrangements. */
export const MUSIC_FADE_SECONDS = 0.8;
/** Seconds of notes scheduled ahead per tick. */
const LOOKAHEAD_SECONDS = 0.3;
/** Milliseconds between scheduler ticks. */
const TICK_INTERVAL_MS = 100;
/** Seconds ahead of the clock a fresh arrangement starts. */
const START_LEAD_SECONDS = 0.05;

/** One stem, playing. */
interface LiveVoice {
  role: MusicLayerRole;
  spec: VoiceSpec;
  seq: SequencerState;
  /** Stop emitting after this time and drop the layer; null = open. */
  until: number | null;
}

export interface AudioBusOptions {
  adapter: AudioAdapter;
  /** Where the mixer lives; omitted, it lives in memory for this session. */
  mixer?: MixerStore | null;
  /** Tick period; 0 disables the timer (tests call tick() directly). */
  tickIntervalMs?: number;
}

export interface AudioBus {
  /**
   * Say something happened. The one call game code makes: the registry
   * decides which patch that is (see ../data/sfx.ts), so no screen ever
   * names a sound. A safe no-op when audio is unavailable.
   *
   * Sounds that have to land on a beat rather than now — anything in a
   * fight — are queued on the scene clock instead and emitted through
   * here when they come due (see ./cues.ts).
   */
  emit(event: SoundEventId): void;
  /**
   * Play one patch directly, onto a named bus. The registry's own back
   * end: game code emits events, and a test pins that nothing outside
   * src/audio calls this.
   */
  play(id: SoundId, bus: PlaybackBusId): void;
  /** Set what the score is underscoring; null fades music out. */
  setMusicScene(scene: MusicScene | null): void;
  /** Change mode alone — the district and hour carry through the fight. */
  setMusicMode(mode: MusicMode): void;
  getMusicScene(): MusicScene | null;
  /** The stems currently running, in mix order. For tests and dev. */
  getMusicLayers(): readonly MusicLayerRole[];
  /** Call from a user gesture; true once the context is running. */
  unlock(): boolean;
  /** One scheduler step — normally timer-driven, public for tests. */
  tick(): void;

  // --- The mixer -------------------------------------------------------
  getMixer(): MixerState;
  setBusVolume(bus: MixBusId, value: number): void;
  setBusMuted(bus: MixBusId, muted: boolean): void;
  /** Flips one bus's mute and reports where it landed. */
  toggleBusMuted(bus: MixBusId): boolean;
  /** Whether a sound on this bus would be heard, ducking included. */
  isAudible(bus: MixBusId): boolean;
  /**
   * The mixer's calibration tone, played on one named bus — including
   * master, which nothing else is ever played straight onto. Set a
   * fader, hear what you set it to, without leaving the panel.
   */
  playTestTone(bus: MixBusId): void;

  // --- Attention -------------------------------------------------------
  setDuckOnBlur(on: boolean): void;
  /** Feed one browser focus/visibility event; see ./duck.ts. */
  setFocus(event: FocusEvent): void;
  getFocus(): FocusState;
  /** What the master bus is currently being multiplied by. */
  getDuckFactor(): number;
}

export function createAudioBus(options: AudioBusOptions): AudioBus {
  const { adapter } = options;
  const store = options.mixer ?? memoryMixerStore();
  const tickIntervalMs = options.tickIntervalMs ?? TICK_INTERVAL_MS;

  let focus: FocusState = ATTENDED;
  let scene: MusicScene | null = null;
  /** What is actually playing; null while nothing is. */
  let arrangement: Arrangement | null = null;
  /** Bar-grid origin the running arrangement is counting from. */
  let origin = 0;
  let voices = new Map<string, LiveVoice>();
  let timer: ReturnType<typeof setInterval> | null = null;

  /**
   * The mixer is read from the store on every use rather than cached:
   * the store is the settings store in production, and the settings
   * panel is not the only thing that can write it.
   */
  const mixer = (): MixerState => store.get();

  function duck(): number {
    return duckFactor(focus, mixer().duckOnBlur);
  }

  function applyGains(): void {
    adapter.setBusGains(busNodeGains(mixer(), duck()));
  }
  applyGains();

  /** Writes the mixer and pushes the result at the graph immediately. */
  function commit(next: MixerState): void {
    store.set(next);
    applyGains();
  }

  function ensureTimer(): void {
    if (tickIntervalMs <= 0) return;
    if (scene !== null && timer === null) {
      timer = setInterval(tick, tickIntervalMs);
    } else if (scene === null && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  /** Everything stops and is forgotten; the next tick starts afresh. */
  function clearMusic(fadeSeconds: number): void {
    if (voices.size > 0) adapter.stopMusicLayer(fadeSeconds);
    voices = new Map();
    arrangement = null;
    origin = 0;
  }

  /** Moves the running stems onto `target`, fading on a bar line. */
  function transition(target: Arrangement, now: number): void {
    const plan = planCrossfade({
      from: arrangement,
      to: target,
      origin,
      now,
      fadeSeconds: MUSIC_FADE_SECONDS,
      lead: arrangement === null ? START_LEAD_SECONDS : LOOKAHEAD_SECONDS,
    });

    if (arrangement !== null) {
      for (const role of plan.fadeOut) {
        const key = layerKey(arrangement.themeId, arrangement.dayPhase, role);
        const voice = voices.get(key);
        if (!voice) continue;
        voice.until = plan.at + plan.fadeSeconds;
        adapter.rampLayer(key, 0, plan.at, plan.fadeSeconds);
      }
    }

    for (const role of plan.fadeIn) {
      const spec = arrangementVoice(target, role);
      // A stem being brought back before its own fade-out finished: drop
      // the dying voice first so the two never share a gain node.
      if (voices.has(spec.layer)) {
        voices.delete(spec.layer);
        adapter.dropLayer(spec.layer);
      }
      voices.set(spec.layer, {
        role,
        spec,
        seq: createSequencer(plan.at),
        until: null,
      });
      adapter.rampLayer(spec.layer, 1, plan.at, plan.fadeSeconds);
    }

    arrangement = target;
    origin = plan.origin;
  }

  /**
   * A background tab starves the timer, and the schedule falls behind
   * the clock. Rather than flush a backlog of past-due notes, every
   * voice rejoins at the same fresh bar-grid origin — the mix is
   * unchanged, it has simply stopped being where it was.
   */
  function rejoin(now: number): void {
    origin = now + START_LEAD_SECONDS;
    for (const voice of voices.values()) {
      voice.seq = createSequencer(origin);
    }
  }

  function tick(): void {
    if (scene === null || !adapter.running) return;
    if (busGain(mixer(), "music", duck()) <= 0) {
      // Silent — muted, faded to nothing, or the tab is not on screen.
      // Drop everything so coming back restarts cleanly instead of
      // flushing a backlog of past-due notes.
      clearMusic(0.05);
      return;
    }
    const now = adapter.now();

    if (
      voices.size > 0 &&
      [...voices.values()].every(
        (voice) => voice.seq.nextStepTime < now - LOOKAHEAD_SECONDS,
      )
    ) {
      rejoin(now);
    }

    const target = arrangementFor(scene);
    if (
      arrangement === null ||
      arrangement.themeId !== target.themeId ||
      arrangement.dayPhase !== target.dayPhase ||
      arrangement.mode !== target.mode
    ) {
      transition(target, now);
    }

    const horizon = now + LOOKAHEAD_SECONDS;
    for (const [key, voice] of [...voices]) {
      const limit = voice.until === null ? horizon : Math.min(horizon, voice.until);
      const due = collectDue(voice.spec, voice.seq, limit);
      voice.seq = due.state;
      for (const note of due.notes) {
        adapter.scheduleNote(note);
      }
      if (voice.until !== null && voice.until <= now) {
        voices.delete(key);
        adapter.dropLayer(key);
      }
    }
  }

  function play(id: SoundId, bus: PlaybackBusId): void {
    if (!isAudible(mixer(), bus, duck())) return;
    adapter.playPatch(SOUND_PATCHES[id], bus);
  }

  return {
    emit(event: SoundEventId): void {
      play(patchForEvent(event), busForEvent(event));
    },

    play,

    setMusicScene(next: MusicScene | null): void {
      if (sceneEquals(next, scene)) return;
      scene = next;
      if (next === null) clearMusic(MUSIC_FADE_SECONDS);
      ensureTimer();
      tick();
    },

    setMusicMode(mode: MusicMode): void {
      if (scene === null || scene.mode === mode) return;
      scene = { ...scene, mode };
      tick();
    },

    getMusicScene: () => scene,

    getMusicLayers: () =>
      [...voices.values()]
        .filter((voice) => voice.until === null)
        .map((voice) => voice.role),

    unlock(): boolean {
      const running = adapter.unlock();
      applyGains();
      ensureTimer();
      return running;
    },

    tick,

    getMixer: mixer,

    setBusVolume(bus: MixBusId, value: number): void {
      commit(mixerSetBusVolume(mixer(), bus, value));
    },

    setBusMuted(bus: MixBusId, muted: boolean): void {
      commit(mixerSetBusMuted(mixer(), bus, muted));
    },

    toggleBusMuted(bus: MixBusId): boolean {
      commit(mixerToggleBusMuted(mixer(), bus));
      return mixer().mutes[bus] === true;
    },

    isAudible: (bus: MixBusId) => isAudible(mixer(), bus, duck()),

    playTestTone(bus: MixBusId): void {
      if (!isAudible(mixer(), bus, duck())) return;
      adapter.playPatch(SOUND_PATCHES[patchForEvent("ui.mixer.tone")], bus);
    },

    setDuckOnBlur(on: boolean): void {
      commit(mixerSetDuckOnBlur(mixer(), on));
      // Turning ducking off while ducked has to lift it at once, and
      // turning it on while away has to take hold at once.
      tick();
    },

    setFocus(event: FocusEvent): void {
      const next = applyFocusEvent(focus, event);
      if (next === focus) return;
      focus = next;
      applyGains();
      // The score stops and restarts around silence; the tick is what
      // notices either way.
      tick();
    },

    getFocus: () => focus,

    getDuckFactor: duck,
  };
}

/**
 * Retries unlock on user gestures until the context runs, then detaches.
 * Capture phase so the context resumes before the click's own sounds.
 */
export function installAutoUnlock(
  bus: AudioBus,
  target: Pick<Window, "addEventListener" | "removeEventListener"> = window,
): void {
  const onGesture = (): void => {
    if (bus.unlock()) {
      target.removeEventListener("pointerdown", onGesture, true);
      target.removeEventListener("keydown", onGesture, true);
    }
  };
  target.addEventListener("pointerdown", onGesture, true);
  target.addEventListener("keydown", onGesture, true);
}

/** The listener surfaces installFocusDucking needs; window/document fit. */
export interface FocusDuckTargets {
  window: Pick<Window, "addEventListener">;
  document: Pick<Document, "addEventListener"> & { hidden?: boolean };
}

/**
 * Wires the browser's two attention signals onto the bus: window
 * focus/blur, and document visibility. Both, not either — they answer
 * different questions and ./duck.ts treats them differently.
 *
 * Seeds from document.hidden first, because a page can be restored into
 * a background tab and would otherwise start at full volume in a tab
 * nobody is looking at.
 */
export function installFocusDucking(
  bus: AudioBus,
  targets: FocusDuckTargets = { window, document },
): void {
  if (targets.document.hidden === true) bus.setFocus("hide");
  targets.window.addEventListener("focus", () => bus.setFocus("focus"));
  targets.window.addEventListener("blur", () => bus.setFocus("blur"));
  targets.document.addEventListener("visibilitychange", () => {
    bus.setFocus(targets.document.hidden === true ? "hide" : "show");
  });
}
