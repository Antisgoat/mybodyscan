import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";
import tailwindcssAnimate from "tailwindcss-animate";
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "2rem", screens: { "2xl": "1400px" } },
    extend: { fontFamily: { sans: ["Inter", ...defaultTheme.fontFamily.sans] } }
  },
  plugins: [tailwindcssAnimate]
} satisfies Config;
