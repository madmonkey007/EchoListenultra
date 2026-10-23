/** Build the same utilities and reset formerly supplied by the browser CDN. */
export default {
  content: ['./index.html', './*.tsx', './components/**/*.{ts,tsx}', './views/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#367f71',
        accent: '#9ce6c4',
        'background-dark': '#10171e',
        'surface-dark': '#19242d',
        'background-light': '#f6f8f7',
        'surface-light': '#ffffff',
      },
      fontFamily: {
        display: ['Space Grotesk', 'sans-serif'],
        body: ['Plus Jakarta Sans', 'sans-serif'],
      },
    },
  },
};
