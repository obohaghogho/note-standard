/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    screens: {
      "xs": "400px",
      "sm": "640px",
      "md": "768px",
      "lg": "1024px",
      "xl": "1280px",
      "2xl": "1536px",
    },
    extend: {
      colors: {
        background: "var(--background)",
        surface: "var(--surface)",
        elevated: "var(--elevated)",
        card: "var(--card)",
        border: "var(--border)",
        heading: "var(--heading)",
        body: "var(--body)",
        muted: "var(--muted)",
        primary: {
          DEFAULT: "#2563EB", // Royal Blue
          hover: "#1D4ED8",
          soft: "#DBEAFE",
          foreground: "#FFFFFF",
        },
        success: { DEFAULT: "#16A34A" },
        warning: { DEFAULT: "#F59E0B" },
        danger: { DEFAULT: "#DC2626" },
        info: { DEFAULT: "#0EA5E9" },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      fontWeight: {
        normal: "400",
        medium: "500",
        semibold: "600",
        bold: "700",
        extrabold: "800",
      },
      borderRadius: {
        button: "14px",
        card: "18px",
        dialog: "22px",
        image: "16px",
        input: "14px",
        badge: "999px",
      },
      spacing: {
        4: "4px",
        8: "8px",
        12: "12px",
        16: "16px",
        20: "20px",
        24: "24px",
        32: "32px",
        40: "40px",
        48: "48px",
        64: "64px",
      },
      transitionDuration: {
        fast: "120ms",
        normal: "200ms",
        complex: "300ms",
      },
      transitionTimingFunction: {
        DEFAULT: "ease-in-out",
      },
    },
  },
  plugins: [],
};
