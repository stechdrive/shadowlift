/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './components/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        gray: {
          750: '#2b2b2b',
          850: '#1a1a1a',
          950: '#0a0a0a'
        }
      }
    }
  },
  plugins: []
};
