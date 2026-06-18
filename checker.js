const mineflayer = require('mineflayer');
const express = require('express');
const fs = require('fs');
const path = require('path');
const { saveRawCaptcha } = require('./src/bot/captcha');
const { getItemName } = require('./src/utils/textParser');

// ================= НАЛАШТУВАННЯ =================
const PASSWORD = 'ТВІЙ_ПАРОЛЬ_ТУТ';
const START_ACCOUNT = 1;
const END_ACCOUNT = 200;
const COMPASS_SLOT = 0; // Слот хотбару з компасом (0-8)
const ANARCHY_SLOT = 13; // Слот у меню компаса, який веде на Анархію
// ================================================

// Генеруємо чергу акаунтів
const accountsQueue = Array.from({ length: END_ACCOUNT - START_ACCOUNT + 1 }, (_, i) => `Romcokek${START_ACCOUNT + i}`);
const resultsFile = 'bourgeois_data.json';

// Глобальні змінні для роботи воркера
let currentBot = null;
let state = { isCaptchaWaiting: false };
let resolveCaptcha = null; // Проміс для зупинки бота, поки ти не введеш капчу

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Функція очікування відкриття меню
function waitForWindow(bot, timeout = 10000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Меню не відкрилося вчасно')), timeout);
        bot.once('windowOpen', (window) => {
            clearTimeout(timer);
            resolve(window);
        });
    });
}

// Парсер опису предмета (Lore), щоб дістати ціну
function getLoreText(item) {
    if (!item || !item.nbt) return '';
    try {
        const loreArray = item.nbt.value.display.value.Lore.value.value;
        return loreArray.map(l => {
            let parsed = l;
            try { parsed = JSON.parse(l); } catch(e) {}
            return String(parsed.text || parsed).replace(/§./g, '');
        }).join(' | ');
    } catch(e) { return ''; }
}

// --- ВЕБ-СЕРВЕР ДЛЯ КАПЧІ ---
const app = express();
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    if (state.isCaptchaWaiting) {
        return res.send(`
            <!DOCTYPE html><html><head><meta charset="utf-8"><title>КАПЧА!</title>
            <style>body{text-align:center; background:#1e1e1e; color:#fff; font-family:Arial; margin-top:50px;} img{border:3px solid #e74c3c; border-radius:8px;} input{padding:10px; font-size:20px;} button{padding:10px 20px; font-size:20px; background:#2ecc71; border:none; cursor:pointer;}</style></head>
            <body>
                <h2>🚨 Потрібна капча для акаунта!</h2>
                <img src="/captcha_raw.png?t=${Date.now()}" width="512"><br><br>
                <form action="/submit" method="POST">
                    <input type="text" name="code" autofocus autocomplete="off">
                    <button type="submit">Відправити</button>
                </form>
            </body></html>
        `);
    }
    res.send(`<!DOCTYPE html><html><body style="background:#121212; color:#2ecc71; font-family:Arial; text-align:center; margin-top:100px;"><h2>✅ Бот працює автоматично. Чекаємо на капчу...</h2><script>setTimeout(()=>location.reload(), 2000);</script></body></html>`);
});

app.get('/captcha_raw.png', (req, res) => res.sendFile(path.resolve(__dirname, 'captcha_raw.png')));

app.post('/submit', (req, res) => {
    if (req.body.code && currentBot && state.isCaptchaWaiting) {
        currentBot.chat(req.body.code);
        state.isCaptchaWaiting = false;
        if (resolveCaptcha) resolveCaptcha(); // Продовжуємо роботу скрипта
    }
    res.redirect('/');
});
app.listen(3000, () => console.log('🌐 Сервер для капчі: http://localhost:3000'));


// --- ГОЛОВНА ЛОГІКА АВТОМАТИЗАЦІЇ ---
async function runWorker() {
    for (const username of accountsQueue) {
        console.log(`\n========================================`);
        console.log(`🚀 ЗАПУСК АКАУНТА: ${username}`);
        console.log(`========================================`);
        
        await processAccount(username);
        console.log(`⏳ Чекаємо 5 секунд перед наступним акаунтом...`);
        await sleep(5000);
    }
    console.log(`\n🎉 ВСІ АКАУНТИ ПЕРЕВІРЕНО! Дані збережено у ${resultsFile}`);
    process.exit(0);
}

function processAccount(username) {
    return new Promise((resolveNextAccount) => {
        const mapsCache = {};
        currentBot = mineflayer.createBot({ host: 'mc.holyworld.ru', port: 25565, username: username, version: false });

        currentBot._client.on('map', (packet) => { if (packet.data) mapsCache[packet.itemDamage] = packet.data; });

        let isHubFinished = false;

        currentBot.on('message', async (message) => {
            const cleanMsg = message.toString().replace(/§./g, '');
            if (cleanMsg.includes('Введите цифры с картинки')) {
                console.log('⚠️ Знайдено капчу! Чекаємо зшивання...');
                setTimeout(() => saveRawCaptcha(currentBot, mapsCache, state), 2500);
                
                // Створюємо паузу, поки ти не введеш код на сайті
                await new Promise(r => resolveCaptcha = r);
                console.log('✅ Капча введена! Продовжуємо...');
            }
        });

        currentBot.on('spawn', async () => {
            try {
                // Якщо ми ще не пройшли хаб
                if (!isHubFinished) {
                    isHubFinished = true; // Блокуємо повторне виконання при інших спавнах
                    
                    console.log('🌍 [ХАБ] Авторизація...');
                    await sleep(2000);
                    currentBot.chat(`/login ${PASSWORD}`);
                    
                    console.log('🧭 [ХАБ] Відкриваємо компас...');
                    await sleep(2000);
                    currentBot.setQuickBarSlot(COMPASS_SLOT);
                    currentBot.activateItem();

                    console.log('🔄 [ХАБ] Очікуємо меню серверів...');
                    const hubWindow = await waitForWindow(currentBot);
                    await sleep(500);
                    await currentBot.clickWindow(ANARCHY_SLOT, 0, 0);
                    
                    console.log('🚀 Переходимо на Анархію. Чекаємо завантаження світу (10 сек)...');
                    await sleep(10000); // Даємо час на телепортацію і спавн

                    console.log('📜 [АНАРХІЯ] Відкриваємо /missions...');
                    currentBot.chat('/missions');
                    
                    console.log('🔄 [МЕНЮ] Очікуємо меню місій...');
                    const missionsWindow = await waitForWindow(currentBot);
                    await sleep(1000);
                    console.log('👆 Клікаємо по слоту Буржуя (Слот 23)...');
                    await currentBot.clickWindow(23, 0, 0);

                    console.log('🔄 [БУРЖУЙ] Очікуємо меню Буржуя...');
                    const bourgeoisWindow = await waitForWindow(currentBot);
                    await sleep(1000);

                    console.log('🔍 Парсимо предмети...');
                    const items = bourgeoisWindow.containerItems();
                    const accountData = { account: username, timestamp: new Date().toLocaleString(), items: [] };

                    // Читаємо слоти 20, 21, 22, 23, 24
                    [20, 21, 22, 23, 24].forEach(slotNum => {
                        const item = items.find(i => i.slot === slotNum);
                        const name = getItemName(item);
                        const lore = getLoreText(item);
                        
                        // Спроба витягнути ціну з опису (шукаємо цифри після "цена")
                        let price = "Невідомо";
                        const priceMatch = lore.match(/цена.*?(\d+)\s*монет/i) || lore.match(/(\d+)\s*монет/i);
                        if (priceMatch) price = priceMatch[1];

                        accountData.items.push({ slot: slotNum, name: name, lore: lore, estimatedPrice: price });
                        console.log(`   🔸 Слот ${slotNum}: ${name} | Можлива ціна: ${price}`);
                    });

                    // Зберігаємо результати у файл
                    const currentData = fs.existsSync(resultsFile) ? JSON.parse(fs.readFileSync(resultsFile)) : [];
                    currentData.push(accountData);
                    fs.writeFileSync(resultsFile, JSON.stringify(currentData, null, 4));

                    console.log(`💾 Дані збережено! Виходимо з акаунта...`);
                    currentBot.quit();
                    resolveNextAccount(); // Даємо команду брати наступний акаунт
                }
            } catch (err) {
                console.log(`❌ Помилка алгоритму: ${err.message}. Пропускаємо акаунт...`);
                currentBot.quit();
                resolveNextAccount();
            }
        });

        currentBot.on('error', err => { console.log('❌ Помилка з\'єднання:', err); resolveNextAccount(); });
        currentBot.on('kicked', reason => { console.log('❌ Кікнуто:', reason); resolveNextAccount(); });
    });
}

// Запуск скрипта
runWorker();