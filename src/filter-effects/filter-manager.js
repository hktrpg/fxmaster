import { packageId } from "../constants.js";
import { logger } from "../logger.js";
import { executeWhenWorldIsMigratedToLatest, isOnTargetMigration } from "../migration/migration.js";
import { isEnabled } from "../settings.js";
import { resetFlag } from "../utils.js";

export class FilterManager {
  /** @private */
  constructor() {
    this.filterInfos = {};
    this.filters = {};
    this._ticker = false;
    this.#registerHooks();
  }

  /**
   * A private reference for the global {@link FilterManager} instance.
   * @type {FilterManager | undefined}
   */
  static #instance;

  /**
   * The singleton {@link FilterManager} instance.
   * @type {FilterManager}
   */
  static get instance() {
    if (!this.#instance) {
      this.#instance = new this();
    }
    return this.#instance;
  }

  /**
   * Activate this {@link FilterManager}. This includes creating all the necessary filters, attaching them to the
   * configured layers, starting their animations.
   * @returns {Promise<void>} A promise that resolves as soon as filters are activated
   */
  async #activate() {
    await this.#update({ skipFading: true });

    if (!this._ticker) {
      canvas.app.ticker.add(this.#animate, this);
      this._ticker = true;
    }
  }

  /**
   * Update the filters to the state that is configured for the active scene.
   * @param {{skipFading?: boolean}} [options]            Additional options to configure this update
   * @param {boolean}                [options.skipFading] Whether or not newly created filters should skip their fading
   * @returns {Promise<void>}                             A promise that resolves as soon as the filters have been updated
   */
  async #update({ skipFading = false } = {}) {
    if (!canvas.scene) {
      return;
    }
    this.filterInfos = Object.fromEntries(
      Object.entries(canvas.scene.getFlag(packageId, "filters") ?? {}).filter(([id, filterInfo]) => {
        if (!(filterInfo.type in CONFIG.fxmaster.filterEffects)) {
          logger.warn(`Filter effect '${id}' is of unknown type '${filterInfo.type}', skipping it.`);
          return false;
        }
        return true;
      }),
    );

    const filtersToCreate = Object.keys(this.filterInfos).filter((key) => !(key in this.filters));
    const filtersToUpdate = Object.keys(this.filterInfos).filter((key) => key in this.filters);
    const filtersToDelete = Object.keys(this.filters).filter((key) => !(key in this.filterInfos));

    for (const key of filtersToCreate) {
      const { type, options } = this.filterInfos[key];
      this.filters[key] = new CONFIG.fxmaster.filterEffects[type](options, key);
      this.filters[key].skipFading = skipFading;
      this.filters[key].play();
    }

    for (const key of filtersToUpdate) {
      const { options } = this.filterInfos[key];
      const filter = this.filters[key];
      filter.configure(options);
      filter.play();
    }

    const deletePromises = filtersToDelete.map(async (key) => {
      const filter = this.filters[key];
      await filter.stop();

      // delete filters preemptively so that they disappear as soon as they have stopped
      FilterManager.#removeFilterFromContainer(canvas.primary, filter);
      delete this.filters[key];
    });
    await Promise.all(deletePromises);

    this.#applyFilters();
  }

  /**
   * Apply the filters to the configured canvas layers.
   */
  #applyFilters() {
    const filters = Object.values(this.filters);
    const otherFilters = canvas.primary.filters?.filter((f) => !filters.includes(f)) ?? [];
    canvas.primary.filters = otherFilters.concat(filters);
  }

  /**
   * Remove a filter from a container.
   * @param {PIXI.container} container A container
   * @param {PIXI.Filter} filter A filter
   */
  static #removeFilterFromContainer(container, filter) {
    container.filters = container.filters?.filter((f) => f !== filter) ?? null;
  }

  /**
   * Set the filters stored in the scene's fxmaster flags to the current values of `filterInfos` of this
   * {@link FilterManager}.
   * @returns {Promise<void>} A promise that resolves as soon as the scene's fxmaster flags have been updated
   */
  async #dump() {
    await resetFlag(canvas.scene, "filters", this.filterInfos);
  }

  /**
   * Stop all filters and remove them from the manager.
   * @remarks This does _not_ remove the filters from the canvas layers.
   * @returns {Promise<void>} A promise that resolves as soon as all filters have been stopped and removed from the
   *                          manager
   */
  async #clear() {
    const promises = Object.values(this.filters).map((filter) => filter.stop());
    this.filters = {};
    await Promise.all(promises);
  }

  /**
   * Add a named filter.
   * @param {string} name    The name of the filter
   * @param {string} type    The type of the filter
   * @param {object} options The options for the filter
   * @returns {Prmise<void>} A promise that resolves as soon as the filter has been added to the scene's fxmaster flags
   */
  async addFilter(name, type, options) {
    name = name ?? randomID();
    this.filterInfos[name] = { type, options };
    await this.#dump();
  }

  /**
   * Remove a named filter.
   * @param {string} name     The name of the filter to remove
   * @returns {Promise<void>} A promise that resolves when the filter has been removed from the scene's fxmaster flags
   */
  async removeFilter(name) {
    if (!canvas.scene) {
      return;
    }
    const filter = this.filters[name];
    if (filter) {
      await filter.stop();
    }
    const rmFilter = {
      [`-=${name}`]: null,
    };
    await canvas.scene.setFlag(packageId, "filters", rmFilter);
  }

  /**
   * Remove all filters.
   * @returns {Promise<void>} A promise that resolves as soon as all filters have been removed from the scene's fxmaster
   *                          flags
   */
  async removeAll() {
    await canvas.scene?.unsetFlag(packageId, "filters");
  }

  /**
   * Toggle a named filter on or off.
   * @param {string} name     The name of the filter
   * @param {string} type     The type of the filter
   * @param {object} options  The options for the filter
   * @returns {Promise<void>} A promise that resolves as soon as the filter has been toggled
   */
  async switch(name, type, options) {
    if (this.filterInfos[name]) {
      return this.removeFilter(name);
    }
    return this.addFilter(name, type, options);
  }

  async setFilters(filterInfoArray) {
    this.filterInfos = Object.fromEntries(filterInfoArray.map((filterInfo) => [foundry.utils.randomID(), filterInfo]));
    await this.#dump();
  }

  #animate() {
    for (const key in this.filters) {
      this.filters[key].step();
    }
  }

  #registerHooks() {
    Hooks.once("ready", () => {
      if (isEnabled()) {
        canvas.primary.filterArea = canvas.app.screen;
      }
    });

    Hooks.on("canvasInit", () => {
      if (isEnabled()) {
        this.#clear();
      }
    });

    Hooks.on("canvasReady", () => {
      executeWhenWorldIsMigratedToLatest(async () => {
        if (isEnabled()) {
          await this.#activate();
        }
      });
    });

    Hooks.on("updateScene", (scene, data) => {
      if (!isEnabled() || !isOnTargetMigration() || scene !== canvas.scene) {
        return;
      }
      if (
        foundry.utils.hasProperty(data, "flags.fxmaster.filters") ||
        foundry.utils.hasProperty(data, "flags.fxmaster.-=filters")
      ) {
        this.#update();
      }
    });
  }
}
