/**
 * Minimal publish / subscribe helper.
 *
 * The simulation announces what happened ("coin", "crash", "flip"...) and
 * the presentation layer (sound, particles, HUD) reacts, without the two
 * knowing about each other.
 */
export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(name, callback) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(callback);
    return () => this.off(name, callback);
  }

  off(name, callback) {
    const list = this.listeners.get(name);
    if (list) this.listeners.set(name, list.filter((fn) => fn !== callback));
  }

  emit(name, payload) {
    for (const callback of this.listeners.get(name) ?? []) callback(payload);
  }
}
