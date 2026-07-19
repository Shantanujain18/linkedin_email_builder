/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  // Avoid resetting the existing dashboard CSS.
  corePlugins: {
    preflight: false
  },
  theme: {
    extend: {
      colors: {
        background: "#0a0a0f",
        surface: "#111118",
        border: "#1e1e2e",
        blue: {
          DEFAULT: "#3b82f6",
          glow: "#3b82f640"
        },
        violet: {
          DEFAULT: "#8b5cf6",
          glow: "#8b5cf640"
        },
        "text-primary": "#f8fafc",
        "text-muted": "#94a3b8"
      },
      fontFamily: {
        display: ["var(--font-jakarta)", "system-ui", "sans-serif"],
        body: ["var(--font-inter)", "system-ui", "sans-serif"]
      },
      boxShadow: {
        "blue-glow": "0 0 40px #3b82f640",
        "violet-glow": "0 0 40px #8b5cf640"
      },
      animation: {
        float: "float 4s ease-in-out infinite",
        "marquee-left": "marquee-left 40s linear infinite",
        "marquee-right": "marquee-right 40s linear infinite",
        "orb-1": "orb-1 18s ease-in-out infinite",
        "orb-2": "orb-2 22s ease-in-out infinite",
        "orb-3": "orb-3 26s ease-in-out infinite"
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(-10px)" },
          "50%": { transform: "translateY(10px)" }
        },
        "marquee-left": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" }
        },
        "marquee-right": {
          "0%": { transform: "translateX(-50%)" },
          "100%": { transform: "translateX(0)" }
        },
        "orb-1": {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "50%": { transform: "translate(40px, -30px) scale(1.1)" }
        },
        "orb-2": {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "50%": { transform: "translate(-50px, 40px) scale(1.15)" }
        },
        "orb-3": {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "50%": { transform: "translate(30px, 50px) scale(0.95)" }
        }
      }
    }
  },
  plugins: []
};
