const mineflayer = require('mineflayer');
const { createCanvas } = require('canvas');
const fs = require('fs');

const mapsCache = {};

const bot = mineflayer.createBot({
    host: 'mc.holyworld.ru',
    port: 25565,
    username: 'Romcokek1', // Залиш англійський
    version: false
});

bot._client.on('map', (packet) => {
    if (packet.data) {
        mapsCache[packet.itemDamage] = packet.data;
        console.log(`[Map] Завантажено пікселі для мапи #${packet.itemDamage}`);
    }
});

bot.on('login', () => console.log('🔌 Авторизація пройдена...'));

bot.on('message', (message) => {
    const msgText = message.toString();
    console.log(`[ЧАТ] ${msgText}`);

    if (msgText.includes('Введите цифры с картинки в чат')) {
        console.log('Капча! Даємо 3 секунди на довантаження...');
        setTimeout(saveRawCaptcha, 3000); 
    }
});

function saveRawCaptcha() {
    const frames = Object.values(bot.entities).filter(e => 
        e.name === 'item_frame' || e.name === 'glow_item_frame'
    );

    if (frames.length === 0) {
        console.log('Рамок не знайдено!');
        process.exit(1);
    }

    // Визначаємо, як стоїть стіна (вздовж осі X чи Z), щоб правильно сортувати зліва направо
    const isWallZ = frames.every(f => f.position.z === frames[0].position.z);

    frames.sort((a, b) => {
        // Спочатку зверху-вниз (по висоті Y)
        if (Math.abs(b.position.y - a.position.y) > 0.5) {
            return b.position.y - a.position.y;
        }
        // Потім зліва-направо
        if (isWallZ) {
            return b.position.x - a.position.x;
        } else {
            return b.position.z - a.position.z;
        }
    });

    const cols = 4; 
    const rows = 3; 
    const canvas = createCanvas(cols * 128, rows * 128);
    const ctx = canvas.getContext('2d');

    let i = 0;
    for (const frame of frames) {
        let mapId = null;

        // ТОЧНИЙ ПАРСИНГ: Шукаємо ID мапи у новому форматі компонентів 1.20.5+
        try {
            if (frame.metadata && frame.metadata[9] && frame.metadata[9].components) {
                const mapComp = frame.metadata[9].components.find(c => c.type === 'map_id');
                if (mapComp) {
                    mapId = mapComp.data;
                }
            }
        } catch (e) {
            console.log("Помилка парсингу:", e);
        }

        if (mapId === null) {
            console.log(`⚠️ Не вдалося знайти ID мапи для рамки ${i}.`);
            i++;
            continue;
        }

        if (!mapsCache[mapId]) {
            console.log(`⚠️ Немає пікселів для мапи #${mapId}`);
            i++;
            continue;
        }

        const mapData = mapsCache[mapId];
        const imgData = ctx.createImageData(128, 128);
        
        for (let p = 0; p < mapData.length; p++) {
            const colorIndex = mapData[p];
            // Робимо картинку чорно-білою (відтінки сірого), щоб прибрати хаос і залишити лише контури
            // Множимо на 2, щоб зробити світлішою
            const gray = Math.min(255, colorIndex * 2);
            imgData.data[p * 4]     = gray; // R
            imgData.data[p * 4 + 1] = gray; // G
            imgData.data[p * 4 + 2] = gray; // B
            imgData.data[p * 4 + 3] = 255;  // Alpha
        }

        const col = i % cols;
        const row = Math.floor(i / cols);
        ctx.putImageData(imgData, col * 128, row * 128);
        i++;
    }

    fs.writeFileSync('captcha_raw.png', canvas.toBuffer('image/png'));
    console.log('\n=== УСПІХ! ===');
    console.log('Пазл складено правильно! Перевір captcha_raw.png');
    process.exit(0); 
}

bot.on('error', err => console.log('Помилка:', err));
