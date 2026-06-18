const { initBot } = require('./src/bot/botCore');
const { startWebServer } = require('./src/web/server');

// Читаємо аргументи запуску (process.argv[2] - це перше слово після node index.js)
// Якщо нічого не передали, ставимо стандартні значення
const botName = process.argv[2] || 'Romcokek1';
const webPort = parseInt(process.argv[3]) || 3000;

const state = {
    isCaptchaWaiting: false,
    isSneaking: false,
    chatLog: [],
    currentWindow: null,
    serverStarted: false
};

console.log(`\n🤖 Ініціалізація бота: ${botName}`);
console.log(`🌐 Панель керування буде на порту: ${webPort}\n`);

// Передаємо ім'я в ядро бота
const bot = initBot(state, botName);

bot.once('spawn', () => {
    if (!state.serverStarted) {
        // Передаємо порт у веб-сервер
        startWebServer(webPort, bot, state);
        state.serverStarted = true;
    }
});