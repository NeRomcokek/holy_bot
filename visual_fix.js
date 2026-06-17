const mineflayer = require('mineflayer');
const { createCanvas, Image } = require('canvas');
const fs = require('fs');

const mapsCache = {};

// --- КОНФІГУРАЦІЯ ОЮБЕРТАННЯ ---
// Тут ти будеш вказувати, як обернути кожну карту.
// Доступні значення: 0, 90, 180, 270 (градусів за годинниковою стрілкою).
// mapId: rotation
const rotationConfig = {
    0: 180, 1: 180, 2: 180, 3: 180,
    4: 180, 5: 180, 6: 180, 7: 180,
    8: 180, 9: 180, 10: 180, 11: 180
};

// --- КОНФІГУРАЦІЯ ПЕРЕМІЩЕННЯ (ХАКЕРСЬКА) ---
// Якщо ти хочеш переставити мапи місцями, ти можеш створити масив,
// де вкажеш mapId для кожного слоту від 0 до 11 (зліва-направо, зверху-вниз).
// const tileOrderConfig = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]; // Наприклад, зворотний порядок
const tileOrderConfig = null; // null - використовувати стандартний порядок за координатами рамок

const bot = mineflayer.createBot({
    host: 'mc.holyworld.ru',
    port: 25565,
    username: 'Romcokek1', // Англійський нік!
    version: false
});

// Збираємо пікселі
bot._client.on('map', (packet) => {
    if (packet.data) {
        mapsCache[packet.itemDamage] = packet.data;
        console.log(`[Map] Завантажено пікселі для мапи #${packet.itemDamage}`);
    }
});

bot.on('login', () => console.log('🔌 Авторизація пройдена, заходимо...'));
bot.on('spawn', () => console.log('🌍 Бот з\'явився у світі!'));

// Слухаємо чат
bot.on('message', (message) => {
    const msgText = message.toString();
    console.log(`[ЧАТ] ${msgText}`);

    if (msgText.includes('Введите цифры с картинки в чат')) {
        console.log('Капча виявлена! Чекаємо 3 секунди...');
        setTimeout(saveRawCaptcha, 3000); 
    }
});

// Допоміжна функція для створення видимих кольорів Minecraft -> RGB
function getAcidPalette(colorIndex) {
    return {
        r: (colorIndex * 35) % 256,
        g: (colorIndex * 75) % 256,
        b: (colorIndex * 115) % 256
    };
}

async function saveRawCaptcha() {
    const frames = Object.values(bot.entities).filter(e => 
        e.name === 'item_frame' || e.name === 'glow_item_frame'
    );

    if (frames.length === 0) {
        console.log('Рамок не знайдено!');
        process.exit(1);
    }

    console.log(`Знайдено рамок: ${frames.length}. Склеюємо полотно 4х3...`);

    frames.sort((a, b) => {
        if (Math.abs(b.position.y - a.position.y) > 0.5) return b.position.y - a.position.y;
        const horizontalA = a.position.x + a.position.z;
        const horizontalB = b.position.x + b.position.z;
        return horizontalA - horizontalB;
    });

    const cols = 4;
    const rows = Math.ceil(frames.length / cols);
    const mainCanvas = createCanvas(cols * 128, rows * 128);
    const mainCtx = mainCanvas.getContext('2d');

    let i = 0;
    for (const frame of frames) {
        let mapId = i; // Фолбек на порядковий номер
        
        // Спроба розпарсити ID мапи (можна видалити, якщо фолбек працює)
        try { if (frame.metadata) { for (const key in frame.metadata) { const item = frame.metadata[key]; if (item && typeof item === 'object') { if (item.itemDamage !== undefined) { mapId = item.itemDamage; break; }}}}} catch (e) {}
        
        // Використовуємо кастомний порядок, якщо він заданий
        if (tileOrderConfig) {
            mapId = tileOrderConfig[i];
        }

        if (!mapsCache[mapId]) {
            console.log(`⚠️ Немає пікселів для мапи ID #${mapId}, пропускаємо слот ${i}`);
            i++;
            continue;
        }

        const mapData = mapsCache[mapId];
        
        // Створюємо тимчасовий canvas для обробки однієї карти
        const tempCanvas = createCanvas(128, 128);
        const tempCtx = tempCanvas.getContext('2d');
        const imgData = tempCtx.createImageData(128, 128);
        
        // Заповнюємо кислотною палітрою
        for (let p = 0; p < mapData.length; p++) {
            const rgb = getAcidPalette(mapData[p]);
            imgData.data[p * 4]     = rgb.r;
            imgData.data[p * 4 + 1] = rgb.g;
            imgData.data[p * 4 + 2] = rgb.b;
            imgData.data[p * 4 + 3] = 255;
        }
        
        // Малюємо сирі пікселі на тимчасовий canvas
        tempCtx.putImageData(imgData, 0, 0);

        // --- МАГІЯ ОБЕРТАННЯ ---
        const rotation = rotationConfig[mapId] || 0; // Отримуємо кут з конфігу (за замовчуванням 0)
        
        const finalMapCanvas = createCanvas(128, 128);
        const finalMapCtx = finalMapCanvas.getContext('2d');
        
        if (rotation !== 0) {
            finalMapCtx.translate(128 / 2, 128 / 2); // Зміщуємо початок координат у центр карти
            finalMapCtx.rotate(rotation * Math.PI / 180); // Обертаємо
            finalMapCtx.drawImage(tempCanvas, -128 / 2, -128 / 2); // Малюємо карту з центром у новому початку координат
        } else {
            finalMapCtx.drawImage(tempCanvas, 0, 0); // Без обертання
        }

        // Клеїмо фінальну оброблену карту на основне полотно
        const col = i % cols;
        const row = Math.floor(i / cols);
        mainCtx.drawImage(finalMapCanvas, col * 128, row * 128);
        i++;
    }

    fs.writeFileSync('captcha_raw.png', mainCanvas.toBuffer('image/png'));
    console.log('\n=== УСПІХ! ===');
    console.log('Файл captcha_raw.png оновлено. Витягуй його на ноутбук і подивись!');
    process.exit(0); 
}

bot.on('error', err => console.log('Помилка:', err));
