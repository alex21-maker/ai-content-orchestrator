import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        accent: "#5c7a63",
        "accent-soft": "#eaf1ea",
      },
    },
  },
  plugins: [],
} satisfies Config;
