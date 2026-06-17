const mineflayer = require('mineflayer');

const bot = mineflayer.createBot({
    host: 'mc.holyworld.ru',
    port: 25565,
    username: 'Romcokek1', // Англійський нік
    version: false
});

bot.on('message', (message) => {
    const msgText = message.toString();
    console.log(`[ЧАТ] ${msgText}`);

    if (msgText.includes('Введите цифры с картинки в чат')) {
        setTimeout(() => {
            const frames = Object.values(bot.entities).filter(e => 
                e.name === 'item_frame' || e.name === 'glow_item_frame'
            );

            if (frames.length > 0) {
                console.log('\n=== РЕНТГЕН ПЕРШОЇ РАМКИ ===');
                console.log('Координати:', frames[0].position);
                console.log('Напрямок (objectData/yaw):', frames[0].objectData, frames[0].yaw);
                
                // Виводимо всі метадані, щоб знайти ID мапи та кут обертання
                console.log('\nМетадані (тут ховається ItemRotation):');
                console.log(JSON.stringify(frames[0].metadata, null, 2));
                
                console.log('===========================\n');
                process.exit(0);
            } else {
                console.log('Рамок не знайдено.');
                process.exit(1);
            }
        }, 3000);
    }
});
