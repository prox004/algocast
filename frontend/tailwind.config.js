/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f0f4ff',
          100: '#dde6ff',
          500: '#4f6ef7',
          600: '#3b55e6',
          700: '#2c42cc',
          900: '#1a2a8c',
        },
      },
    },
  },
  plugins: [],
};
