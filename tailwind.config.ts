import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: {
          DEFAULT: "#F0F0EE",
          dark: "#E3E3E1",
        },
        ink: {
          DEFAULT: "#1E1E1E",
          soft: "#5C5C5C",
        },
        olive: {
          DEFAULT: "#79A342",
          dark: "#5C7E30",
          light: "#B3CC85",
        },
        wine: "#6E1423",
        line: "#DCDCDC",
        divider: "#C6C6C6",
      },
      borderRadius: {
        DEFAULT: "2px",
      },
    },
  },
  plugins: [],
};
export default config;
