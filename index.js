const { initBot } = require('./src/bot/botCore');
const { startWebServer } = require('./src/web/server');

// Спільний стан, який об'єднує всі модулі
const state = {
    isCaptchaWaiting: false,
    isSneaking: false,
    chatLog: [],
    currentWindow: null
};

// 1. Ініціалізуємо бота
const bot = initBot(state);

// 2. Запускаємо веб-сервер ВІДРАЗУ, не чекаючи спавну бота
startWebServer(3000, bot, state);