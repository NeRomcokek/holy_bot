const mineflayer = require('mineflayer');
const { createCanvas } = require('canvas');
const fs = require('fs');
const express = require('express');

const mapsCache = {};
let bot = null;

// СТАНИ БОТА
let isCaptchaWaiting = false; 
let isSneaking = false;
let currentWindow = null; 
const chatLog = []; 

// Розумний парсер для глибокого JSON тексту Minecraft
function extractMinecraftText(data) {
    if (!data) return '';
    if (typeof data === 'string') return data;
    if (Array.isArray(data)) return data.map(extractMinecraftText).join('');
    
    let text = data.text || '';
    if (data.extra) {
        text += data.extra.map(extractMinecraftText).join('');
    }
    return text;
}

// Безпечна функція для отримання назв предметів
function getItemName(item) {
    if (!item) return 'Порожньо';
    let name = '';
    if (item.customName) {
        let parsed = item.customName;
        if (typeof parsed === 'string' && (parsed.startsWith('{') || parsed.startsWith('['))) {
            try { parsed = JSON.parse(parsed); } catch(e) {}
        }
        name = extractMinecraftText(parsed);
    }
    if (!name || name.trim() === '') {
        name = item.displayName || item.name || 'Невідомий предмет';
    }
    return String(name).replace(/§./g, '').trim();
}

// --- ВЕБ-СЕРВЕР ---
const app = express();
const port = 3000;

app.use(express.urlencoded({ extended: true })); 

app.get('/', (req, res) => {
    if (isCaptchaWaiting) {
        return res.send(`
            <!DOCTYPE html><html><head><meta charset="utf-8"><title>Капча!</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; background: #1e1e1e; color: #fff; }
                img { border: 3px solid #555; border-radius: 8px; margin-bottom: 20px; max-width: 100%; image-rendering: pixelated; width: 512px; }
                input { padding: 12px; font-size: 24px; border-radius: 6px; border: none; text-align: center; font-weight: bold; width: 200px; }
                button { padding: 12px 24px; font-size: 20px; background: #e74c3c; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; margin-left: 10px; }
            </style></head><body>
                <h2 style="color: #e74c3c;">🚨 СЕРВЕР ТРЕБУЄ КАПЧУ:</h2>
                <img src="/captcha_raw.png?t=${Date.now()}" alt="Капча"><br>
                <form action="/submit_captcha" method="POST">
                    <input type="text" name="code" autocomplete="off" autofocus placeholder="Цифри сюди">
                    <button type="submit">Відправити</button>
                </form>
            </body></html>
        `);
    }

    let inventoryHtml = '<div style="display: flex; justify-content: center; gap: 10px; margin-top: 10px; flex-wrap: wrap;">';
    if (bot && bot.inventory && bot.inventory.slots) {
        for (let i = 36; i <= 44; i++) { 
            const item = bot.inventory.slots[i];
            const slotNum = i - 35; 
            const name = getItemName(item);
            const count = item ? item.count : 0;
            const isSelected = bot.quickBarSlot === (slotNum - 1) ? 'border: 3px solid #2ecc71; background: #2c3e50;' : 'border: 1px solid #555;';
            
            inventoryHtml += `
                <div style="background: #1e1e1e; padding: 10px; border-radius: 5px; width: 85px; font-size: 12px; box-sizing: border-box; ${isSelected}">
                    <b style="color:#f1c40f;">[${slotNum}]</b><br>
                    <span style="color: #fff;">${name}</span><br>
                    ${count > 0 ? '<b style="color: #3498db;">x' + count + '</b>' : ''}
                </div>
            `;
        }
    } else {
        inventoryHtml += '<p style="color: #aaa;">Інвентар завантажується...</p>';
    }
    inventoryHtml += '</div>';

    let windowHtml = '';
    if (currentWindow) {
        const items = currentWindow.containerItems(); 
        let itemsList = '';
        items.forEach(item => {
            itemsList += `<div style="padding: 6px; border-bottom: 1px solid #444;">Слот <b style="color: #f1c40f;">${item.slot}</b>: <span style="color: #2ecc71;">${getItemName(item)}</span> (x${item.count})</div>`;
        });

        windowHtml = `
            <div class="panel" style="background: #2c3e50; border: 2px solid #3498db; margin-top: 20px;">
                <h3 style="color: #34dbcc; margin-top: 0;">📂 ВІДКРИТО МЕНЮ СЕРВЕРА</h3>
                <div style="text-align: left; max-height: 250px; overflow-y: auto; background: #1a252f; padding: 10px; border-radius: 5px; margin-bottom: 15px; font-family: monospace;">
                    ${itemsList || '<i>Меню порожнє...</i>'}
                </div>
                <form action="/cmd" method="POST" style="display:inline;">
                    <input type="number" name="slot" placeholder="№ Слота" required style="width: 100px; padding: 10px; font-size: 16px; border-radius: 5px; border: none;">
                    <button class="btn-blue" name="action" value="click_window">👆 Клікнути по слоту</button>
                </form>
                <form action="/cmd" method="POST" style="display:inline;">
                    <button class="btn-red" name="action" value="close_window">❌ Закрити</button>
                </form>
            </div>
        `;
    }

    return res.send(`
        <!DOCTYPE html><html><head><meta charset="utf-8"><title>Панель Керування</title>
        <style>
            body { font-family: Arial, sans-serif; text-align: center; background: #121212; color: #fff; margin-top: 20px; }
            .panel { background: #1c1c1c; padding: 20px; border-radius: 10px; display: inline-block; box-shadow: 0 4px 15px rgba(0,0,0,0.5); width: 750px; margin-bottom: 15px; border: 1px solid #333; }
            button { padding: 12px 18px; margin: 5px; font-size: 16px; font-weight: bold; border: none; border-radius: 5px; cursor: pointer; color: white; transition: 0.2s; }
            button:hover { opacity: 0.9; }
            input[type="number"] { padding: 10px; font-size: 16px; border-radius: 5px; border: none; text-align: center; background: #fff; }
            input[type="text"] { padding: 12px; font-size: 16px; border-radius: 5px; border: none; width: calc(100% - 140px); background: #222; color: #fff; border: 1px solid #444; }
            .btn-blue { background: #3498db; } .btn-green { background: #2ecc71; } .btn-red { background: #e74c3c; } .btn-gray { background: #7f8c8d; }
            .chat-box { background: #000; padding: 12px; height: 220px; overflow-y: scroll; text-align: left; font-family: monospace; font-size: 14px; border: 1px solid #333; border-radius: 5px; margin-bottom: 10px; color: #fff; line-height: 1.4; }
        </style>
        <script>window.onload = function() { var cb = document.getElementById("chatBox"); if(cb) cb.scrollTop = cb.scrollHeight; }</script>
        </head><body>
            <h1>🤖 Панель Керування Romcokek1</h1>
            
            <form action="/cmd" method="POST" style="margin-bottom: 15px;">
                <button class="btn-gray" name="action" value="refresh">🔄 Оновити панель</button>
            </form>

            <div class="panel">
                <h3 style="margin-top:0; text-align:left; color: #7f8c8d;">💬 Чат сервера</h3>
                <div class="chat-box" id="chatBox">${chatLog.join('<br>')}</div>
                <form action="/cmd" method="POST" style="display: flex; justify-content: space-between; align-items: center;">
                    <input type="text" name="chat_msg" placeholder="Введіть текст або команду /login..." autocomplete="off" autofocus>
                    <button class="btn-green" name="action" value="send_chat" style="width: 120px; margin: 0;">Надіслати</button>
                </form>
            </div>

            <div class="panel">
                <h3 style="margin-top:0; color: #7f8c8d;">🎒 Активний Хотбар (Рука)</h3>
                ${inventoryHtml}
                <form action="/cmd" method="POST" style="margin-top: 15px; border-top: 1px solid #333; padding-top: 15px;">
                    Взяти в руку слот хотбару (1-9): 
                    <input type="number" name="slot" min="1" max="9" value="1" required style="width: 60px;">
                    <button class="btn-gray" name="action" value="set_slot">Взяти Предмет</button>
                </form>
            </div>

            <div class="panel">
                <h3 style="margin-top:0; color: #7f8c8d;">🕹️ Дії у світі</h3>
                <form action="/cmd" method="POST" style="display:inline;">
                    <button class="btn-blue" name="action" value="shift">🧍‍♂️ Шифт: ${isSneaking ? '<span style="color:#e74c3c">УВІМКНЕНО</span>' : '<span style="color:#2ecc71">ВИМКНЕНО</span>'}</button>
                </form>
                <form action="/cmd" method="POST" style="display:inline;">
                    <button class="btn-green" name="action" value="use_item">🍎 Натиснути ПКМ</button>
                </form>
                <form action="/cmd" method="POST" style="display:inline; margin-left: 30px;">
                    <button class="btn-red" name="action" value="quit">🔌 ВИКЛЮЧИТИ БОТА</button>
                </form>
            </div>

            ${windowHtml}

        </body></html>
    `);
});

app.get('/captcha_raw.png', (req, res) => res.sendFile(__dirname + '/captcha_raw.png'));

app.post('/submit_captcha', (req, res) => {
    const code = req.body.code;
    if (code && bot && isCaptchaWaiting) {
        bot.chat(code);
        isCaptchaWaiting = false; 
    }
    res.redirect('/');
});

app.post('/cmd', async (req, res) => {
    const action = req.body.action;
    if (!bot) return res.redirect('/');

    switch (action) {
        case 'refresh': break;
        case 'send_chat':
            if (req.body.chat_msg) bot.chat(req.body.chat_msg);
            break;
        case 'shift':
            isSneaking = !isSneaking;
            bot.setControlState('sneak', isSneaking);
            break;
        case 'use_item':
            bot.activateItem(); 
            setTimeout(() => bot.deactivateItem(), 150); 
            break;
        case 'set_slot':
            const slotIndex = parseInt(req.body.slot) - 1;
            if (slotIndex >= 0 && slotIndex <= 8) bot.setQuickBarSlot(slotIndex);
            break;
        case 'click_window':
            if (currentWindow) {
                try { await bot.clickWindow(parseInt(req.body.slot), 0, 0); } catch (err) {}
            }
            break;
        case 'close_window':
            if (currentWindow) bot.closeWindow(currentWindow);
            break;
        case 'quit':
            console.log('\n🛑 [ПАНЕЛЬ] Отримано команду на вимкнення бота. Виходимо...');
            bot.quit();
            process.exit(0);
            break;
    }
    setTimeout(() => res.redirect('/'), 400); 
});

app.listen(port, () => console.log(`\n🌐 ВЕБ-ПАНЕЛЬ АКТИВНА: http://localhost:${port}\n`));


// --- ПАЛІТРА ---
const mcColors = [[0,0,0],[127,178,56],[247,233,163],[199,199,199],[255,0,0],[160,160,255],[167,167,167],[0,124,0],[255,255,255],[164,168,184],[151,109,77],[112,112,112],[64,64,255],[143,119,72],[255,252,245],[216,127,51],[178,76,216],[102,153,216],[229,229,51],[127,204,25],[242,127,165],[76,76,76],[153,153,153],[76,127,153],[127,63,178],[51,76,178],[102,76,51],[102,127,51],[153,51,51],[25,25,25],[250,238,77],[92,219,213],[74,128,255],[0,217,58],[129,86,49],[112,2,0],[209,177,161],[159,82,36],[149,87,108],[112,108,138],[186,133,36],[103,117,53],[160,77,78],[57,41,35],[135,107,98],[87,92,92],[122,73,88],[76,62,92],[76,50,35],[76,82,42],[142,60,46],[37,22,16]];
const shades = [180, 220, 255, 135];
function getMapColor(index) {
    if (index === 0) return [0, 0, 0];
    return [Math.floor((mcColors[Math.floor(index/4)]||[0,0,0])[0]*(shades[index%4]||255)/255), Math.floor((mcColors[Math.floor(index/4)]||[0,0,0])[1]*(shades[index%4]||255)/255), Math.floor((mcColors[Math.floor(index/4)]||[0,0,0])[2]*(shades[index%4]||255)/255)];
}

// --- ІНІЦІАЛІЗАЦІЯ БОТА ---
bot = mineflayer.createBot({ host: 'mc.holyworld.ru', port: 25565, username: 'Romcokek1', version: false });

bot._client.on('map', (packet) => { if (packet.data) mapsCache[packet.itemDamage] = packet.data; });

bot.on('windowOpen', (window) => { currentWindow = window; });
bot.on('windowClose', () => { currentWindow = null; });

// МАГІЯ ВІДШТОВХУВАННЯ: Симулюємо колізію з тілами інших гравців
bot.on('physicsTick', () => {
    if (!bot.entity) return;
    
    // Перебираємо всіх гравців у зоні видимості бота
    for (const playerKey in bot.players) {
        const player = bot.players[playerKey];
        if (!player.entity || player.entity === bot.entity) continue;
        
        // Рахуємо відстань до гравця
        const dist = bot.entity.position.distanceTo(player.entity.position);
        
        // 0.6 блока — це радіус дотику двох моделей гравців (0.3 + 0.3)
        if (dist < 0.6 && dist > 0.01) {
            // Вираховуємо вектор сили (куди штовхати бота — строго у протилежний від гравця бік)
            const dir = bot.entity.position.minus(player.entity.position);
            dir.y = 0; // тільки по горизонталі
            dir.normalize();
            
            // Додаємо м'яке прискорення до поточної швидкості бота
            const pushStrength = 0.08; 
            bot.entity.velocity.x += dir.x * pushStrength;
            bot.entity.velocity.z += dir.z * pushStrength;
        }
    }
});

bot.on('message', (message) => {
    const cleanMsg = message.toString().replace(/§./g, ''); 
    const time = new Date().toLocaleTimeString('uk-UA');
    
    chatLog.push(`[${time}] ${cleanMsg}`);
    if (chatLog.length > 50) chatLog.shift();

    if (cleanMsg.includes('Введите цифры с картинки') || cleanMsg.includes('неправильно, пожалуйста попробуйте')) {
        isLoggedIn = false; 
        isCaptchaWaiting = false;
        setTimeout(saveRawCaptcha, 2500); 
    }
});

function saveRawCaptcha() {
    const frames = Object.values(bot.entities).filter(e => e.name === 'item_frame' || e.name === 'glow_item_frame');
    if (frames.length === 0) {
        setTimeout(saveRawCaptcha, 1000);
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
    isCaptchaWaiting = true; 
}

bot.on('error', err => console.log('Помилка:', err));
