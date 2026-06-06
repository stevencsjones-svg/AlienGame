// =============================================================================
// Progression
// Tracks the highest completed level in localStorage so level select can gate
// later levels. Storage is a single JSON blob under 'alienCityProgress':
//   { completed: <highest level number completed> }
// All access is wrapped in try/catch so a disabled/full localStorage never
// breaks the game (it just behaves as "nothing completed").
// =============================================================================
const KEY = 'alienCityProgress';

const Progression = {
  complete(levelNum) {
    try {
      const data = this.load();
      data.completed = Math.max(data.completed || 0, levelNum);
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) { /* storage unavailable — ignore */ }
  },

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : { completed: 0 };
    } catch (e) {
      return { completed: 0 };
    }
  },

  hasCompleted(levelNum) {
    return this.load().completed >= levelNum;
  },

  reset() {
    try {
      localStorage.removeItem(KEY);
    } catch (e) { /* ignore */ }
  },
};

export default Progression;
