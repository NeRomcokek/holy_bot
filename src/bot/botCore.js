const mineflayer = require('mineflayer');
const { saveRawCaptcha } = require('./captcha');

function initBot(state, botName) {
    const mapsCache = {};
    
    const bot = mineflayer.createBot({ 
        host: 'mc.holyworld.me', 
        port: 25565, 
        username: botName,
        version: false 
    });

    bot._client.on('map', (packet) => { 
        if (packet.data) mapsCache[packet.itemDamage] = packet.data; 
    });

    bot.on('windowOpen', (window) => {
        console.log('[GUI] Сервер відкрив меню!');
        state.currentWindow = window; 
    });
    
    bot.on('windowClose', () => { 
        state.currentWindow = null; 
    });

    // Фізика відштовхування від гравців
    bot.on('physicsTick', () => {
        if (!bot.entity) return;
        for (const playerKey in bot.players) {
            const player = bot.players[playerKey];
            if (!player.entity || player.entity === bot.entity) continue;
            
            const dist = bot.entity.position.distanceTo(player.entity.position);
            if (dist < 0.6 && dist > 0.01) {
                const dir = bot.entity.position.minus(player.entity.position);
                dir.y = 0; 
                dir.normalize();
                
                const pushStrength = 0.08; 
                bot.entity.velocity.x += dir.x * pushStrength;
                bot.entity.velocity.z += dir.z * pushStrength;
            }
        }
    });

    bot.on('message', (message) => {
        const cleanMsg = message.toString().replace(/§./g, ''); 
        const time = new Date().toLocaleTimeString('uk-UA');
        
        state.chatLog.push(`[${time}] ${cleanMsg}`);
        if (state.chatLog.length > 50) state.chatLog.shift();

        if (cleanMsg.includes('Введите цифры с картинки') || cleanMsg.includes('неправильно, пожалуйста попробуйте')) {
            console.log('⏳ Виявлено тригер капчі. Запуск збору мап...');
            state.isCaptchaWaiting = false;
            setTimeout(() => saveRawCaptcha(bot, mapsCache, state), 2500); 
        }
    });

    bot.on('error', err => console.log('Помилка:', err));
    
    return bot;
}

module.exports = { initBot };