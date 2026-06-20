/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        felt: '#0a241a',          // casino table green (page background)
        'felt-light': '#0f3527',
        gold: '#f3c969',
        'gold-dark': '#caa648',
        crimson: '#e0465f',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Playfair Display"', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
