module.exports = {
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint", "react-refresh"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  rules: {
    "@typescript-eslint/no-explicit-any": "off",
    "react-refresh/only-export-components": "off",
  },
  ignorePatterns: ["dist/", "lib/", "node_modules/"],
};
