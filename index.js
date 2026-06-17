const { initBot } = require('./src/bot/botCore');
const { startWebServer } = require('./src/web/server');

// Спільний стан, який об'єднує всі модулі
const state = {
    isCaptchaWaiting: false,
    isSneaking: false,
    chatLog: [],
    currentWindow: null,
    serverStarted: false
};

// 1. Ініціалізуємо бота
const bot = initBot(state);

// 2. Запускаємо веб-сервер при першому спавні
bot.once('spawn', () => {
    if (!state.serverStarted) {
        startWebServer(3000, bot, state);
        state.serverStarted = true;
    }
});