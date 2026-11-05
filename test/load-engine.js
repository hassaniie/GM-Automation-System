// Loads src/02-engine.js headlessly (it targets the browser and sets window.MGE).
const fs = require('fs'), path = require('path'), vm = require('vm');
module.exports = function loadEngine() {
  const ctx = { window: {}, console, Math, Date };
  vm.createContext(ctx);
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', '02-engine.js'), 'utf8');
  vm.runInContext('(function(){' + src + '\n})();', ctx, { filename: '02-engine.js' });
  return ctx.window.MGE;
};
