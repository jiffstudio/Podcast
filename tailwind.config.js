/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        'podcast-green': '#1a2e1a', // Dark green background
        'podcast-light': '#d0e0d0', // Light green text
        'podcast-accent': '#4ade80', // Bright accent
      }
    },
  },
  plugins: [],
}

