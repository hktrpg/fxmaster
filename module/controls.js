import { filterManager } from "../filterEffects/FilterManager.js";
import { WeatherConfig } from "../weatherEffects/applications/weather-config.js";
import { SpecialsConfig } from "../specialEffects/applications/specials-config.js";
import { FiltersConfig } from "../filterEffects/applications/filters-config.js";

Hooks.on("getSceneControlButtons", (controls) => {
  if (canvas == null) { return };
  controls.push({
    name: "effects",
    title: "CONTROLS.Effects",
    icon: "fas fa-magic",
    layer: "fxmaster",
    visible: game.user.can("EFFECT_CREATE") || game.user.isGM,
    tools: [
      {
        name: "specials",
        title: "CONTROLS.SpecialFX",
        icon: "fas fa-hat-wizard",
        onClick: () => {
          new SpecialsConfig().render(true);
        },
        button: true
      },
      {
        name: "weather",
        title: "CONTROLS.Weather",
        icon: "fas fa-cloud-rain",
        onClick: () => {
          new WeatherConfig().render(true);
        },
        visible: game.user.isGM,
        button: true,
      },
      {
        name: "save",
        title: "CONTROLS.SaveMacro",
        icon: "fas fa-save",
        onClick: () => {
          let flags = canvas.scene.getFlag('fxmaster', 'effects');
          if (!flags) flags = {};
          let objs = Object.values(flags);
          let img = "icons/svg/windmill.svg";
          let name = "Weather";
          objs.forEach(effect => {
            let icon = CONFIG.weatherEffects[effect.type].icon;
            if (icon) {
              img = icon;
            }
            name = CONFIG.weatherEffects[effect.type].label;
          })
          let effects = `Hooks.call('updateWeather', ${JSON.stringify(objs)});`;
          Macro.create({ type: "script", name: name, command: effects, img: img });
          ui.notifications.info(`Macro ${name} has been saved in the macro directory`);
        },
        visible: game.user.isGM,
        button: true,
      },
      {
        name: "colorize",
        title: "CONTROLS.Filters",
        icon: "fas fa-filter",
        onClick: () => {
          new FiltersConfig().render(true);
        },
        visible: game.user.isGM,
        button: true,
      },
      {
        name: "clearfx",
        title: "CONTROLS.ClearFX",
        icon: "fas fa-trash",
        onClick: () => {
          Dialog.confirm({
            title: game.i18n.localize("FXMASTER.Delete"),
            content: game.i18n.localize("FXMASTER.DeleteConfirm"),
            yes: () => {
              filterManager.removeAll();
              canvas.scene.unsetFlag("fxmaster", "effects");
            },
            defaultYes: true,
          });
        },
        visible: game.user.isGM,
        button: true,
      },
    ],
  });
});
