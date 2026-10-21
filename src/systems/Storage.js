/**
 * Persists level progress and settings in localStorage.
 * Storage can be unavailable (private mode, blocked cookies), so every access
 * is wrapped and the game keeps working with in-memory defaults.
 */
import { STORAGE_KEY } from '../config.js';

const DEFAULTS = { unlocked: 1, levels: {}, muted: false };

export class Storage {
  constructor() {
    const saved = this.read();
    this.data = { ...DEFAULTS, ...saved, levels: { ...(saved.levels ?? {}) } };
  }

  read() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
    } catch {
      return {};
    }
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Ignore: progress simply won't survive a reload.
    }
  }

  get muted() {
    return this.data.muted;
  }

  set muted(value) {
    this.data.muted = value;
    this.save();
  }

  /** { unlocked, levels } for the level select screen. */
  get progress() {
    return { unlocked: this.data.unlocked, levels: this.data.levels };
  }

  isUnlocked(levelId) {
    return levelId <= this.data.unlocked;
  }

  /**
   * Records the result of an attempt.
   * @returns {boolean} true if it set a new best for that level
   */
  recordAttempt(levelId, { outcome, stats }, levelCount) {
    const best = this.data.levels[levelId] ?? { completed: false, bestTime: null, bestKills: 0, bestDistance: 0 };
    let newBest = false;

    if (outcome === 'complete') {
      newBest = !best.completed || stats.time < best.bestTime;
      best.completed = true;
      best.bestTime = best.bestTime === null ? stats.time : Math.min(best.bestTime, stats.time);
      this.data.unlocked = Math.max(this.data.unlocked, Math.min(levelCount, levelId + 1));
    } else if (!best.completed && stats.distance > best.bestDistance + 1) {
      newBest = best.bestDistance > 0;
    }
    best.bestKills = Math.max(best.bestKills, stats.kills);
    best.bestDistance = Math.max(best.bestDistance, stats.distance);

    this.data.levels[levelId] = best;
    this.save();
    return newBest;
  }
}
