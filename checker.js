const mineflayer = require('mineflayer');
const fs = require('fs');
const { createCanvas } = require('canvas');

// ================= НАЛАШТУВАННЯ =================
const PASSWORD = 'ТВІЙ_ПАРОЛЬ';
const START_ACCOUNT = 1;
const END_ACCOUNT = 200;
const SERVER_HOST = 'mc.holyworld.me'; // Заміни на потрібний IP
const WAIT_FOR_CAPTCHA_MS = 15000; // Скільки чекати на капчу після входу (15 сек)

// Створюємо папку для капч, якщо її немає
if (!fs.existsSync('./captchas')) {
    fs.mkdirSync('./captchas');
}
// ================================================

const accountsQueue = Array.from({ length: END_ACCOUNT - START_ACCOUNT + 1 }, (_, i) => `Romcokek${START_ACCOUNT + i}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Функція збереження мапи у PNG
async function saveCaptchaImage(bot, mapsCache, username) {
    const frames = Object.values(bot.entities).filter(e => e.name === 'item_frame' || e.name === 'glow_item_frame');
    if (frames.length === 0) return false;

    const isWallZ = frames.every(f => f.position.z === frames[0].position.z);
    frames.sort((a, b) => {
        if (Math.abs(b.position.y - a.position.y) > 0.5) return b.position.y - a.position.y;
        if (isWallZ) return b.position.x - a.position.x;
        else return b.position.z - a.position.z;
    });

    const canvas = createCanvas(4 * 128, 3 * 128);
    const ctx = canvas.getContext('2d');
    
    // Базова палітра Minecraft (скорочена для читабельності, використовуємо твою логіку)
    const mcColors = [[0,0,0],[127,178,56],[247,233,163],[199,199,199],[255,0,0],[160,160,255],[167,167,167],[0,124,0],[255,255,255],[164,168,184],[151,109,77],[112,112,112],[64,64,255],[143,119,72],[255,252,245],[216,127,51],[178,76,216],[102,153,216],[229,229,51],[127,204,25],[242,127,165],[76,76,76],[153,153,153],[76,127,153],[127,63,178],[51,76,178],[102,76,51],[102,127,51],[153,51,51],[25,25,25],[250,238,77],[92,219,213],[74,128,255],[0,217,58],[129,86,49],[112,2,0],[209,177,161],[159,82,36],[149,87,108],[112,108,138],[186,133,36],[103,117,53],[160,77,78],[57,41,35],[135,107,98],[87,92,92],[122,73,88],[76,62,92],[76,50,35],[76,82,42],[142,60,46],[37,22,16]];
    const shades = [180, 220, 255, 135];
    
    function getMapColor(index) {
        if (index === 0) return [0, 0, 0];
        const baseColor = mcColors[Math.floor(index/4)] || [0,0,0];
        const shade = shades[index%4] || 255;
        return baseColor.map(c => Math.floor(c * shade / 255));
    }

    let i = 0;
    for (const frame of frames) {
        let mapId = null;
        try { if (frame.metadata[9] && frame.metadata[9].components) mapId = frame.metadata[9].components.find(c => c.type === 'map_id').data; } catch (e) {}
        if (mapId === null || !mapsCache[mapId]) { i++; continue; }
        
        const mapData = mapsCache[mapId];
        const imgData = ctx.createImageData(128, 128);
        for (let p = 0; p < mapData.length; p++) {
            const rgb = getMapColor(mapData[p]);
            imgData.data[p*4]=rgb[0]; imgData.data[p*4+1]=rgb[1]; imgData.data[p*4+2]=rgb[2]; imgData.data[p*4+3]=255;
        }
        ctx.putImageData(imgData, (i % 4) * 128, Math.floor(i / 4) * 128);
        i++;
    }
    
    // Зберігаємо з унікальним іменем
    const filePath = `./captchas/captcha_${username}_${Date.now()}.png`;
    fs.writeFileSync(filePath, canvas.toBuffer('image/png'));
    console.log(`🖼️ Капчу збережено: ${filePath}`);
    return true;
}

// --- ГОЛОВНИЙ ЦИКЛ ---
async function runWorker() {
    for (const username of accountsQueue) {
        console.log(`\n🚀 Запуск акаунта: ${username}`);
        await processAccount(username);
        console.log(`⏳ Пауза 3 сек перед наступним...`);
        await sleep(3000);
    }
    console.log(`\n🎉 Всі акаунти перевірено. Датасет зібрано!`);
    process.exit(0);
}

function processAccount(username) {
    return new Promise((resolve) => {
        let isDone = false;
        let captchaTimeout = null;
        const mapsCache = {};

        const bot = mineflayer.createBot({ 
            host: SERVER_HOST, 
            port: 25565, 
            username: username, 
            version: false 
        });

        const finish = () => {
            if (isDone) return;
            isDone = true;
            clearTimeout(captchaTimeout);
            if (bot) {
                if (typeof bot.quit === 'function') {
                    bot.quit();
                } else if (typeof bot.end === 'function') {
                    bot.end();
                }
            }
            resolve();            
        };

        // Ловимо дані мапи
        bot._client.on('map', (packet) => { 
            if (packet.data) mapsCache[packet.itemDamage] = packet.data; 
        });

        bot.on('login', () => {
            console.log(`🟢 [${username}] З'єднано.`);
            // Якщо капчі немає протягом 15 секунд — йдемо далі
            captchaTimeout = setTimeout(() => {
                console.log(`⏩ [${username}] Капча не з'явилася. Пропускаємо...`);
                finish();
            }, WAIT_FOR_CAPTCHA_MS);
        });

        bot.on('messagestr', async (cleanMsg) => {
            // Авторизація
            if (cleanMsg.match(/login/i) || cleanMsg.includes('Авторизуйтесь')) {
                bot.chat(`/login ${PASSWORD}`);
            } else if (cleanMsg.match(/register/i) || cleanMsg.includes('Зарегистрируйтесь')) {
                bot.chat(`/register ${PASSWORD} ${PASSWORD}`);
            }

            // Тригер капчі
            if (cleanMsg.includes('Введите цифры с картинки') || cleanMsg.includes('неправильно')) {
                clearTimeout(captchaTimeout); // Зупиняємо таймер пропуску
                console.log(`⚠️ [${username}] Виявлено капчу! Чекаємо 2.5 сек на рендер мапи...`);
                
                await sleep(2500); // Даємо час серверу надіслати пакети item_frame та map
                
                const saved = await saveCaptchaImage(bot, mapsCache, username);
                if (!saved) {
                    console.log(`❌ [${username}] Не вдалося знайти рамки з мапою.`);
                }
                finish(); // Виходимо одразу після збереження
            }
        });

        bot.on('end', () => finish());
        bot.on('error', () => finish());
    });
}

runWorker();