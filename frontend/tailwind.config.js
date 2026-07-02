/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f5ff",
          100: "#dbe6fe",
          500: "#3b5bfd",
          600: "#2d47db",
          700: "#2338ad",
        },
      },
    },
  },
  plugins: [],
};
