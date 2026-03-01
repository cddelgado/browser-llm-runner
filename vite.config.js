const { defineConfig } = require('vite');

module.exports = defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
});
