/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/renderer/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'vscode-bg': '#1e1e1e',
        'vscode-sidebar': '#252526',
        'vscode-editor': '#1e1e1e',
        'vscode-panel': '#252526',
        'vscode-border': '#3c3c3c',
        'vscode-accent': '#007acc',
        'vscode-text': '#cccccc',
        'vscode-text-secondary': '#858585',
      },
    },
  },
  plugins: [],
};
