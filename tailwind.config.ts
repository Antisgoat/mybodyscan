import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [...(defaultTheme as any).fontFamily.sans],
      },
    },
  },
  plugins: [],
} satisfies Config;
