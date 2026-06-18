const mineflayer = require('mineflayer');
const express = require('express');
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');
const { getItemName } = require('./src/utils/textParser');

// ================= НАЛАШТУВАННЯ =================
const PASSWORD = 'tony0905stark';
const START_ACCOUNT = 1;
const END_ACCOUNT = 200;

const COMPASS_SLOT = 0;           
const ANARCHY_MODE_SLOT = 15;     // Слот режиму "Анархія"
const ANARCHY_SERVER_SLOT = 20;   // Слот підсервера Анархії
const ACCOUNT_TIMEOUT_MS = 180000; 
// ================================================

const accountsQueue = Array.from({ length: END_ACCOUNT - START_ACCOUNT + 1 }, (_, i) => `Romcokek${START_ACCOUNT + i}`);
const resultsFile = 'bourgeois_data.json';

let currentBot = null;
let resolveCaptcha = null; 

// ГЛОБАЛЬНИЙ СТАН
let globalState = { 
    isLocked: false,       
    isImageReady: false    
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function safeChat(bot, msg) {
    while (globalState.isLocked) await sleep(500);
    bot.chat(msg);
}

async function safeClick(bot, slot) {
    while (globalState.isLocked) await sleep(500);
    await bot.clickWindow(slot, 0, 0);
}

function expectWindow(bot, timeout = 8000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Тайм-аут вікна`)), timeout);
        bot.once('windowOpen', (window) => {
            clearTimeout(timer);
            resolve(window);
        });
    });
}

async function waitForSlot(window, slotNum, timeout = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const items = window.containerItems();
        const foundItem = items.find(i => i.slot === slotNum);
        if (foundItem) return foundItem; 
        await sleep(200); 
    }
    throw new Error(`Предмет у слоті ${slotNum} не завантажився`);
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

function saveRawCaptchaLocal(bot, mapsCache, gState) {
    const frames = Object.values(bot.entities).filter(e => e.name === 'item_frame' || e.name === 'glow_item_frame');
    if (frames.length === 0) {
        setTimeout(() => saveRawCaptchaLocal(bot, mapsCache, gState), 1000);
        return;
    }
    const isWallZ = frames.every(f => f.position.z === frames[0].position.z);
    frames.sort((a, b) => {
        if (Math.abs(b.position.y - a.position.y) > 0.5) return b.position.y - a.position.y;
        if (isWallZ) return b.position.x - a.position.x;
        else return b.position.z - a.position.z;
    });

    const canvas = createCanvas(4 * 128, 3 * 128);
    const ctx = canvas.getContext('2d');
    
    const mcColors = [[0,0,0],[127,178,56],[247,233,163],[199,199,199],[255,0,0],[160,160,255],[167,167,167],[0,124,0],[255,255,255],[164,168,184],[151,109,77],[112,112,112],[64,64,255],[143,119,72],[255,252,245],[216,127,51],[178,76,216],[102,153,216],[229,229,51],[127,204,25],[242,127,165],[76,76,76],[153,153,153],[76,127,153],[127,63,178],[51,76,178],[102,76,51],[102,127,51],[153,51,51],[25,25,25],[250,238,77],[92,219,213],[74,128,255],[0,217,58],[129,86,49],[112,2,0],[209,177,161],[159,82,36],[149,87,108],[112,108,138],[186,133,36],[103,117,53],[160,77,78],[57,41,35],[135,107,98],[87,92,92],[122,73,88],[76,62,92],[76,50,35],[76,82,42],[142,60,46],[37,22,16]];
    const shades = [180, 220, 255, 135];
    function getMapColor(index) {
        if (index === 0) return [0, 0, 0];
        return [
            Math.floor((mcColors[Math.floor(index/4)]||[0,0,0])[0]*(shades[index%4]||255)/255), 
            Math.floor((mcColors[Math.floor(index/4)]||[0,0,0])[1]*(shades[index%4]||255)/255), 
            Math.floor((mcColors[Math.floor(index/4)]||[0,0,0])[2]*(shades[index%4]||255)/255)
        ];
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
    fs.writeFileSync('captcha_raw.png', canvas.toBuffer('image/png'));
    gState.isImageReady = true; 
    console.log('🚨 Екран капчі активовано в браузері.');
}

// --- ВЕБ-СЕРВЕР ---
const app = express();
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    if (globalState.isLocked) {
        if (!globalState.isImageReady) {
            return res.send(`<!DOCTYPE html><html><body style="background:#1e1e1e; color:#f1c40f; font-family:Arial; text-align:center; margin-top:100px;"><h2>⏳ Збираємо мапу капчі...</h2><script>setTimeout(()=>location.reload(), 1000);</script></body></html>`);
        }
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
    if (req.body.code && currentBot && globalState.isLocked) {
        currentBot.chat(req.body.code);
        globalState.isLocked = false;
        globalState.isImageReady = false;
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
        const finishAccount = () => {
            if (isDone) return;
            isDone = true;
            clearTimeout(timeoutId);
            clearTimeout(fallbackTimer);
            if (currentBot) currentBot.quit();
            resolveNextAccount();
        };

        const timeoutId = setTimeout(() => {
            console.log(`⏰ [ЧАС ВИЙШОВ] Акаунт завис на 3 хвилини.`);
            finishAccount();
        }, ACCOUNT_TIMEOUT_MS);

        console.log('🔄 [СИСТЕМА] Підключення...');
        const mapsCache = {};
        currentBot = mineflayer.createBot({ host: 'mc.holyworld.ru', port: 25565, username: username, version: false });
        currentBot._client.on('map', (packet) => { if (packet.data) mapsCache[packet.itemDamage] = packet.data; });

        let botState = { 
            step: 'init', 
            waitingForAnarchy: false 
        };
        let fallbackTimer = null;

        // --- ДІЯ 1: ПРОХОДЖЕННЯ ХАБУ ---
        const executeHubRoutine = async () => {
            if (botState.step !== 'init') return;
            botState.step = 'hub';
            try {
                console.log('🧭 [ХАБ] Беремо компас у руку...');
                currentBot.setQuickBarSlot(COMPASS_SLOT);
                await sleep(500); 
                
                let compassWindow = null;
                for (let attempt = 1; attempt <= 3; attempt++) {
                    console.log(`👆 Активуємо компас (спроба ${attempt})...`);
                    let waitCompass = expectWindow(currentBot, 5000);
                    currentBot.activateItem();
                    try { compassWindow = await waitCompass; break; } 
                    catch (e) { await sleep(1000); }
                }
                if (!compassWindow) throw new Error("Не вдалося відкрити компас");
                
                const anarchyItem = await waitForSlot(compassWindow, ANARCHY_MODE_SLOT); 
                await sleep(1000);
                
                let subMenuWindow = null;
                for (let attempt = 1; attempt <= 3; attempt++) {
                    console.log(`👆 [МЕНЮ 1] Клік по слоту ${ANARCHY_MODE_SLOT} (${getItemName(anarchyItem)}) (спроба ${attempt})...`);
                    let waitSub = expectWindow(currentBot, 5000);
                    await safeClick(currentBot, ANARCHY_MODE_SLOT);
                    try { subMenuWindow = await waitSub; break; } 
                    catch (e) { await sleep(1000); }
                }
                if (!subMenuWindow) throw new Error("Не вдалося відкрити підменю");
                
                const serverItem = await waitForSlot(subMenuWindow, ANARCHY_SERVER_SLOT); 
                await sleep(1000);
                
                console.log(`👆 [МЕНЮ 2] Клік по слоту ${ANARCHY_SERVER_SLOT} (${getItemName(serverItem)})...`);
                botState.waitingForAnarchy = true; 
                await safeClick(currentBot, ANARCHY_SERVER_SLOT);
                
                console.log('🚀 [ТЕЛЕПОРТАЦІЯ] Очікуємо підключення до Анархії...');
            } catch (err) {
                console.log(`❌ [ПОМИЛКА ХАБУ] ${err.message}`);
                finishAccount();
            }
        };

        // --- ДІЯ 2: ЗБІР МІСІЙ НА АНАРХІЇ ---
        const executeAnarchyRoutine = async () => {
            if (botState.step === 'anarchy') return;
            botState.step = 'anarchy';
            botState.waitingForAnarchy = false;
            try {
                // ДАЄМО СЕРВЕРУ ЧАС ПОВНІСТЮ ПРОГРУЗИТИ ГРАВЦЯ ПІСЛЯ ТЕЛЕПОРТАЦІЇ
                console.log('🌍 [АНАРХІЯ] Чекаємо 8 сек після телепортації...');
                await sleep(8000);
                
                // Примусово закриваємо примарні вікна, якщо вони залишились від Хабу
                if (currentBot.currentWindow) {
                    currentBot.closeWindow(currentBot.currentWindow);
                    await sleep(500);
                }

                console.log('📜 [АНАРХІЯ] Запитуємо /missions...');
                let missionsWindow = null;
                for (let attempt = 1; attempt <= 3; attempt++) {
                    console.log(`📜 Спроба ${attempt}...`);
                    let waitMissions = expectWindow(currentBot, 8000); // Збільшив час очікування до 8 сек!
                    await safeChat(currentBot, '/missions');
                    try { missionsWindow = await waitMissions; break; } 
                    catch (e) { await sleep(2000); }
                }
                if (!missionsWindow) throw new Error("Не вдалося відкрити /missions");
                
                const missItem = await waitForSlot(missionsWindow, 23); 
                await sleep(1000);
                
                let bourgeoisWindow = null;
                for (let attempt = 1; attempt <= 3; attempt++) {
                    console.log(`👆 [МІСІЇ] Клікаємо по слоту 23 (${getItemName(missItem)}) (спроба ${attempt})...`);
                    let waitBourgeois = expectWindow(currentBot, 8000);
                    await safeClick(currentBot, 23);
                    try { bourgeoisWindow = await waitBourgeois; break; } 
                    catch (e) { await sleep(1000); }
                }
                if (!bourgeoisWindow) throw new Error("Не вдалося відкрити Буржуя");
                
                console.log('📂 [БУРЖУЙ] Меню відкрито. Чекаємо товари...');
                await waitForSlot(bourgeoisWindow, 20); 
                await sleep(1500); 
                
                console.log('🔍 [СИСТЕМА] Парсимо предмети...');
                const items = bourgeoisWindow.containerItems();
                const accountData = { account: username, timestamp: new Date().toLocaleString(), items: [] };

                [20, 21, 22, 23, 24].forEach(slotNum => {
                    const item = items.find(i => i.slot === slotNum);
                    if (!item) return; 
                    const name = getItemName(item);
                    const lore = getLoreText(item);
                    
                    let price = "Не знайдено";
                    const priceMatch = lore.match(/цена.*?(\d+)\s*монет/i) || lore.match(/(\d+)\s*монет/i);
                    if (priceMatch) price = priceMatch[1];

                    accountData.items.push({ slot: slotNum, name: name, price: price, lore: lore });
                    console.log(`   🔸 Слот ${slotNum}: ${name} | Ціна: ${price}`);
                });

                if (accountData.items.length > 0) {
                    const currentData = fs.existsSync(resultsFile) ? JSON.parse(fs.readFileSync(resultsFile)) : [];
                    currentData.push(accountData);
                    fs.writeFileSync(resultsFile, JSON.stringify(currentData, null, 4));
                    console.log(`💾 [СИСТЕМА] Дані збережено!`);
                }

                finishAccount(); 
            } catch (err) {
                console.log(`❌ [ПОМИЛКА АНАРХІЇ] ${err.message}`);
                finishAccount();
            }
        };

        // --- ОБРОБНИКИ ПОДІЙ ---
        currentBot.on('login', () => {
            console.log('🟢 [СЕРВЕР] З\'єднання встановлено. Чекаємо на повідомлення від сервера...');
            
            // НОВИЙ РЕЗЕРВНИЙ ТАЙМЕР: Якщо сервер мовчить 8 секунд, значить ми вже залогінені.
            fallbackTimer = setTimeout(() => {
                if (botState.step === 'init' && !globalState.isLocked) {
                    console.log('⏳ [СИСТЕМА] Сервер мовчить (вхід по IP). Йдемо до компаса...');
                    executeHubRoutine();
                }
            }, 8000);
        });

        currentBot.on('message', async (message) => {
            const cleanMsg = message.toString().replace(/§./g, '');
            if (cleanMsg.trim()) console.log(`[ЧАТ] ${cleanMsg}`); 
            
            // 1. АВТОРИЗАЦІЯ
            if (cleanMsg.match(/login/i) || cleanMsg.includes('Авторизуйтесь')) {
                console.log('🔑 Сервер просить пароль...');
                clearTimeout(fallbackTimer);
                await safeChat(currentBot, `/login ${PASSWORD}`);
            } else if (cleanMsg.match(/register/i) || cleanMsg.includes('Зарегистрируйтесь')) {
                console.log('📝 Сервер просить реєстрацію...');
                clearTimeout(fallbackTimer);
                await safeChat(currentBot, `/register ${PASSWORD} ${PASSWORD}`);
            } 
            
            // 2. УСПІШНИЙ ВХІД АБО ПРОХОДЖЕННЯ АНТИБОТА
            else if (cleanMsg.includes('Успешный вход') || cleanMsg.includes('Вы уже в игре') || cleanMsg.includes('Успешная регистрация') || cleanMsg.includes('Проверка пройдена')) {
                console.log('✅ Вхід дозволено. Даємо 3 сек прогрузитись...');
                clearTimeout(fallbackTimer);
                await sleep(3000);
                if (botState.step === 'init') executeHubRoutine();
            }

            // 3. УСПІШНЕ ПІДКЛЮЧЕННЯ ДО АНАРХІЇ
            else if (cleanMsg.includes('Выполняется подключение...')) {
                console.log('🌐 Переходимо на новий сервер...');
            }
            else if (botState.waitingForAnarchy && (cleanMsg.includes('Добро пожаловать') || cleanMsg.includes('С возвращением') || cleanMsg.includes('Вы зашли на сервер'))) {
                 console.log('✅ Успішно зайшли на Анархію!');
                 executeAnarchyRoutine();
            }

            // 4. КАПЧА
            if (cleanMsg.includes('Введите цифры с картинки') || cleanMsg.includes('неправильно, пожалуйста попробуйте')) {
                if (!globalState.isLocked) {
                    console.log('⚠️ [СИСТЕМА] Тригер капчі! МИТТЄВО БЛОКУЄМО ДІЇ...');
                    clearTimeout(fallbackTimer); 
                    globalState.isLocked = true;
                    globalState.isImageReady = false;
                    
                    setTimeout(() => saveRawCaptchaLocal(currentBot, mapsCache, globalState), 2500);
                    
                    if (!resolveCaptcha) {
                        await new Promise(r => resolveCaptcha = r);
                    }
                }
            }
        });

        currentBot.on('spawn', async () => {
            if (botState.waitingForAnarchy) {
                console.log('🌍 Spawn на новому сервері!');
                executeAnarchyRoutine();
            }
        });

        currentBot.on('end', (reason) => { 
            console.log(`🔴 [СЕРВЕР] З'єднання закрито: ${reason}`); 
            finishAccount(); 
        });
        currentBot.on('error', err => { 
            console.log(`❌ [МЕРЕЖА] Помилка: ${err.message}`); 
            finishAccount(); 
        });
    });
}

runWorker();