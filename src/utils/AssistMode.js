// AssistMode.js
// Singleton that stores the three accessibility toggles and persists them
// to localStorage so settings survive scene restarts and sessions.
// Call AssistMode.load() once on game boot (main.js), then use get()/toggle()
// freely from anywhere.

const STORAGE_KEY = 'alienCityAssist';

const DEFAULTS = {
  reducedEnemySpeed: false,
  slowerGameSpeed: false,
  invincibility: false,
};

const AssistMode = {

  settings: { ...DEFAULTS },

  load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        this.settings = { ...DEFAULTS, ...JSON.parse(saved) };
      }
    } catch (e) {
      this.settings = { ...DEFAULTS };
    }
    return this.settings;
  },

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch (e) { /* storage unavailable */ }
  },

  toggle(key) {
    this.settings[key] = !this.settings[key];
    this.save();
  },

  get(key) {
    return this.settings[key];
  },

  any() {
    return this.settings.reducedEnemySpeed
      || this.settings.slowerGameSpeed
      || this.settings.invincibility;
  },

};

export default AssistMode;
