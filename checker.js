const mineflayer = require('mineflayer');
const express = require('express');
const fs = require('fs');
const path = require('path');
const { saveRawCaptcha } = require('./src/bot/captcha');
const { getItemName } = require('./src/utils/textParser');

// ================= НАЛАШТУВАННЯ =================
const PASSWORD = 'ТВІЙ_ПАРОЛЬ';
const START_ACCOUNT = 1;
const END_ACCOUNT = 200;

const COMPASS_SLOT = 0;           // Слот компаса в інвентарі (0-8)
const ANARCHY_MODE_SLOT = 13;     // Клік у компасі для вибору "Анархія"
const ANARCHY_SERVER_SLOT = 20;   // Клік у підменю для вибору сервера (20-24)
const ACCOUNT_TIMEOUT_MS = 180000; // 3 хвилини максимум на один акаунт (запобіжник зависання)
// ================================================

const accountsQueue = Array.from({ length: END_ACCOUNT - START_ACCOUNT + 1 }, (_, i) => `Romcokek${START_ACCOUNT + i}`);
const resultsFile = 'bourgeois_data.json';

let currentBot = null;
let state = { isCaptchaWaiting: false };
let resolveCaptcha = null; 

const sleep = ms => new Promise(r => setTimeout(r, ms));

function expectWindow(bot, timeout = 10000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Меню не відкрилося вчасно')), timeout);
        bot.once('windowOpen', (window) => {
            clearTimeout(timer);
            resolve(window);
        });
    });
}

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

// --- ВЕБ-СЕРВЕР ---
const app = express();
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    if (state.isCaptchaWaiting) {
        return res.send(`
            <!DOCTYPE html><html><head><meta charset="utf-8"><title>КАПЧА!</title>
            <style>body{text-align:center; background:#1e1e1e; color:#fff; font-family:Arial; margin-top:50px;} img{border:3px solid #e74c3c; border-radius:8px;} input{padding:10px; font-size:20px;} button{padding:10px 20px; font-size:20px; background:#2ecc71; border:none; cursor:pointer;}</style></head>
            <body>
                <h2 style="color: #e74c3c;">🚨 Потрібна капча!</h2>
                <img src="/captcha_raw.png?t=${Date.now()}" width="512"><br><br>
                <form action="/submit" method="POST">
                    <input type="text" name="code" autofocus autocomplete="off">
                    <button type="submit">Відправити</button>
                </form>
            </body></html>
        `);
    }
    res.send(`<!DOCTYPE html><html><body style="background:#121212; color:#2ecc71; font-family:Arial; text-align:center; margin-top:100px;"><h2>✅ Бот працює...</h2><script>setTimeout(()=>location.reload(), 2000);</script></body></html>`);
});
app.get('/captcha_raw.png', (req, res) => res.sendFile(path.resolve(__dirname, 'captcha_raw.png')));
app.post('/submit', (req, res) => {
    if (req.body.code && currentBot && state.isCaptchaWaiting) {
        currentBot.chat(req.body.code);
        state.isCaptchaWaiting = false;
        if (resolveCaptcha) resolveCaptcha(); 
    }
    res.redirect('/');
});
app.listen(3000, () => console.log('🌐 Сервер капчі: http://localhost:3000'));


// --- ЛОГІКА ВОКЕРА ---
async function runWorker() {
    for (const username of accountsQueue) {
        console.log(`\n========================================`);
        console.log(`🚀 АКАУНТ: ${username}`);
        console.log(`========================================`);
        
        await processAccount(username);
        console.log(`⏳ Пауза 5 сек перед наступним...`);
        await sleep(5000);
    }
    console.log(`\n🎉 ВСІ АКАУНТИ ОБРОБЛЕНО!`);
    process.exit(0);
}

function processAccount(username) {
    return new Promise((resolveNextAccount) => {
        let isDone = false;
        
        // Функція для безпечного завершення акаунта (щоб не викликати resolve двічі)
        const finishAccount = () => {
            if (isDone) return;
            isDone = true;
            clearTimeout(timeoutId);
            if (currentBot) currentBot.quit();
            resolveNextAccount();
        };

        // Запобіжник: якщо акаунт висить більше 3 хвилин - жорстко йдемо далі
        const timeoutId = setTimeout(() => {
            console.log(`⏰ [ЧАС ВИЙШОВ] Акаунт ${username} завис. Примусово йдемо далі.`);
            finishAccount();
        }, ACCOUNT_TIMEOUT_MS);

        console.log('🔄 [СИСТЕМА] Ініціалізація підключення до mc.holyworld.ru:25565...');
        const mapsCache = {};
        
        currentBot = mineflayer.createBot({ host: 'mc.holyworld.ru', port: 25565, username: username, version: false });

        currentBot._client.on('map', (packet) => { if (packet.data) mapsCache[packet.itemDamage] = packet.data; });

        // Нові детальні логери з'єднання
        currentBot.on('login', () => console.log('🟢 [СЕРВЕР] Вхід на сервер успішний. Очікуємо спавну...'));
        
        currentBot.on('end', (reason) => {
            console.log(`🔴 [СЕРВЕР] З'єднання закрито (можливо кік або рестарт). Причина: ${reason}`);
            finishAccount();
        });

        let isHubFinished = false;

        currentBot.on('message', async (message) => {
            const cleanMsg = message.toString().replace(/§./g, '');
            // Виводимо всі повідомлення чату, щоб бачити, що там відбувається
            console.log(`[ЧАТ] ${cleanMsg}`); 
            
            if (cleanMsg.includes('Введите цифры с картинки') || cleanMsg.includes('неправильно, пожалуйста попробуйте')) {
                console.log('⚠️ [СИСТЕМА] Тригер капчі! Збираємо мапу...');
                state.isCaptchaWaiting = false;
                setTimeout(() => saveRawCaptcha(currentBot, mapsCache, state), 2500);
                
                await new Promise(r => resolveCaptcha = r);
                console.log('✅ [СИСТЕМА] Капча введена!');
            }
        });

        currentBot.on('spawn', async () => {
            console.log('🌍 [СЕРВЕР] Бот успішно з\'явився у світі!');
            try {
                if (!isHubFinished) {
                    isHubFinished = true; 
                    
                    console.log('🔑 [ХАБ] Вводимо пароль...');
                    await sleep(2000);
                    currentBot.chat(`/login ${PASSWORD}`);
                    
                    console.log('🧭 [ХАБ] Беремо компас у руку...');
                    await sleep(2000);
                    currentBot.setQuickBarSlot(COMPASS_SLOT);
                    
                    let waitCompass = expectWindow(currentBot);
                    currentBot.activateItem();
                    await waitCompass;
                    console.log('📂 [МЕНЮ 1] Компас відкрито.');

                    console.log(`👆 [МЕНЮ 1] Клік по слоту ${ANARCHY_MODE_SLOT} (Анархія)...`);
                    let waitSubMenu = expectWindow(currentBot);
                    await currentBot.clickWindow(ANARCHY_MODE_SLOT, 0, 0);
                    await waitSubMenu;
                    console.log('📂 [МЕНЮ 2] Вибір сервера відкрито.');

                    console.log(`👆 [МЕНЮ 2] Клік по слоту ${ANARCHY_SERVER_SLOT} (Підсервер)...`);
                    await currentBot.clickWindow(ANARCHY_SERVER_SLOT, 0, 0);
                    
                    console.log('🚀 [ТЕЛЕПОРТАЦІЯ] Чекаємо 10 сек завантаження мапи...');
                    await sleep(10000); 

                    console.log('📜 [АНАРХІЯ] Запитуємо /missions...');
                    let waitMissions = expectWindow(currentBot);
                    currentBot.chat('/missions');
                    await waitMissions;
                    console.log('📂 [МІСІЇ] Меню місій відкрито.');
                    
                    console.log('👆 [МІСІЇ] Клікаємо по слоту 23 (Буржуй)...');
                    let waitBourgeois = expectWindow(currentBot);
                    await currentBot.clickWindow(23, 0, 0);
                    const bourgeoisWindow = await waitBourgeois;
                    console.log('📂 [БУРЖУЙ] Меню Буржуя відкрито!');
                    
                    await sleep(1500); 
                    console.log('🔍 [СИСТЕМА] Парсимо предмети...');
                    
                    const items = bourgeoisWindow.containerItems();
                    const accountData = { account: username, timestamp: new Date().toLocaleString(), items: [] };

                    [20, 21, 22, 23, 24].forEach(slotNum => {
                        const item = items.find(i => i.slot === slotNum);
                        const name = getItemName(item);
                        const lore = getLoreText(item);
                        
                        let price = "Не знайдено";
                        const priceMatch = lore.match(/цена.*?(\d+)\s*монет/i) || lore.match(/(\d+)\s*монет/i);
                        if (priceMatch) price = priceMatch[1];

                        accountData.items.push({ slot: slotNum, name: name, price: price, lore: lore });
                        console.log(`   🔸 Слот ${slotNum}: ${name} | Ціна: ${price}`);
                    });

                    const currentData = fs.existsSync(resultsFile) ? JSON.parse(fs.readFileSync(resultsFile)) : [];
                    currentData.push(accountData);
                    fs.writeFileSync(resultsFile, JSON.stringify(currentData, null, 4));

                    console.log(`💾 [СИСТЕМА] Дані збережено! Виходимо...`);
                    finishAccount(); 
                }
            } catch (err) {
                console.log(`❌ [ПОМИЛКА] Збій на етапі алгоритму: ${err.message}`);
                finishAccount();
            }
        });

        currentBot.on('error', err => { 
            console.log('❌ [МЕРЕЖА] Помилка з\'єднання:', err.message); 
            finishAccount(); 
        });
        currentBot.on('kicked', reason => { 
            console.log('❌ [МЕРЕЖА] Сервер кікнув бота:', reason); 
            finishAccount(); 
        });
    });
}

runWorker();