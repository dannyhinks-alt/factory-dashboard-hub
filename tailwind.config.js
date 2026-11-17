/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: { colors: {
    ink: '#1b2430', steel: { 50: '#f4f6f8', 100: '#e7ebef', 200: '#cfd6dd', 300: '#aab4bf', 500: '#5d6b79', 700: '#34414e', 900: '#1b2430' },
    good: '#1f8a4c', watch: '#c98a00', bad: '#c0392b', accent: '#0b5cab' },
    fontFamily: { sans: ['Segoe UI', 'Arial', 'Helvetica', 'sans-serif'] } } },
  plugins: [],
};
