export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      colors: { mint: { 50:'#f0fdf6',100:'#dcfce9',400:'#34d399',500:'#10b981',600:'#059669',700:'#047857' } },
      boxShadow: { soft: '0 10px 30px -12px rgba(15,23,42,0.15)' },
    },
  },
  plugins: [],
};
