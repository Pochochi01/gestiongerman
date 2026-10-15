/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Color de marca de DGG Gestion. Se usa `marca-*` en toda la app para
        // que un cambio de identidad se resuelva en este unico lugar.
        marca: {
          50: '#eef4ff', 100: '#d9e6ff', 200: '#bcd2ff', 300: '#8eb3ff',
          400: '#598aff', 500: '#3563ff', 600: '#1f40f5', 700: '#1a31e1',
          800: '#1c2cb6', 900: '#1c2d8f',
        },
      },
      // Altura minima de un objetivo tactil (WCAG 2.5.5 / guia de iOS y Android).
      // Los vendedores cargan jugadores desde el telefono, de pie y apurados.
      minHeight: { touch: '2.75rem' },
      minWidth: { touch: '2.75rem' },
    },
  },
  plugins: [],
};
