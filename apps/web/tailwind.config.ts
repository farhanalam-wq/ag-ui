import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        brand: {
          primary: "var(--brand-primary, #2563eb)",
          secondary: "var(--brand-secondary, #3b82f6)",
        },
      },
      borderRadius: {
        brand: "var(--brand-radius, 0.5rem)",
      },
    },
  },
  plugins: [],
};

export default config;
