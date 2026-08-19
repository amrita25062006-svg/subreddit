module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx,html}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fff8ed',
          100: '#fff1db',
          300: '#ffd29a',
          500: '#f97316',
          700: '#c2410c'
        },
        vibe: {
          blue: '#1d4ed8',
          orange: '#f97316',
          green: '#16a34a',
        }
      },
      boxShadow: {
        'soft-lg': '0 8px 30px rgba(2,6,23,0.08)'
      }
    }
  },
  plugins: [],
}
