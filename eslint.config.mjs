// eslint.config.mjs
import nextPlugin from "@next/eslint-plugin-next";
import tseslint from "typescript-eslint";

export default [
  // игноры, если есть
  {
    ignores: ["**/node_modules/**", "**/.next/**"],
  },

  // базовый next конфиг
  nextPlugin.configs["recommended"],
  ...tseslint.configs.recommended,

  // наш кастомный блок правил
  {
    rules: {
      // не мучаемся с any: сейчас важнее скорость
      "@typescript-eslint/no-explicit-any": "off",

      // твои useEffect с setState нам нужны — правило вырубаем
      "react-hooks/set-state-in-effect": "off",

      // мелочь по стилю, можно отключить
      "prefer-const": "off",

      // чтобы postcss.config.mjs не ругался
      "import/no-anonymous-default-export": "off",
    },
  },
];
