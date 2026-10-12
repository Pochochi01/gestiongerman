/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bingo: {
          50: '#eef4ff', 100: '#d9e6ff', 200: '#bcd2ff', 300: '#8eb3ff',
          400: '#598aff', 500: '#3563ff', 600: '#1f40f5', 700: '#1a31e1',
          800: '#1c2cb6', 900: '#1c2d8f',
        },
      },
    },
  },
  plugins: [],
};
