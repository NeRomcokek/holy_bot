const { initBot } = require('./src/bot/botCore');
const { startWebServer } = require('./src/web/server');

const botName = process.argv[2] || 'Romcokek1';
const webPort = parseInt(process.argv[3]) || 3000;

const state = {
    isCaptchaWaiting: false,
    isSneaking: false,
    chatLog: [],
    currentWindow: null
};

console.log(`\n🤖 Ініціалізація бота: ${botName}`);

const bot = initBot(state, botName);

// Запускаємо веб-сервер ОДРАЗУ, щоб панель була доступна 24/7
startWebServer(webPort, bot, state);