const express = require('express');
const path = require('path');
const { getItemName } = require('../utils/textParser');

const app = express();

function startWebServer(port, bot, state) {
    app.use(express.urlencoded({ extended: true })); 

    app.get('/', (req, res) => {
        if (state.isCaptchaWaiting) {
            return res.send(`
                <!DOCTYPE html><html><head><meta charset="utf-8"><title>Капча!</title>
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; background: #1e1e1e; color: #fff; }
                    img { border: 3px solid #555; border-radius: 8px; margin-bottom: 20px; max-width: 100%; image-rendering: pixelated; width: 512px; }
                    input { padding: 12px; font-size: 24px; border-radius: 6px; border: none; text-align: center; font-weight: bold; width: 200px; }
                    button { padding: 12px 24px; font-size: 20px; background: #e74c3c; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; margin-left: 10px; }
                    button:hover { background: #c0392b; }
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
        if (state.currentWindow) {
            const items = state.currentWindow.containerItems(); 
            let itemsList = '';
            items.forEach(item => {
                itemsList += `<div style="padding: 6px; border-bottom: 1px solid #444;">Слот <b style="color: #f1c40f;">${item.slot}</b>: <span style="color: #2ecc71;">${getItemName(item)}</span> (x${item.count})</div>`;
            });

            windowHtml = `
                <div class="panel" style="background: #2c3e50; border: 2px solid #3498db; margin-top: 20px;">
                    <h3 style="color: #34dbcc; margin-top: 0;">📂 ВІДКРИТО МЕНЮ СЕРВЕРА</h3>
                    <div style="text-align: left; max-height: 250px; overflow-y: auto; background: #1a252f; padding: 10px; border-radius: 5px; margin-bottom: 15px; font-family: monospace;">
                        ${itemsList || '<i>Меню порожнє або завантажується...</i>'}
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
                    <div class="chat-box" id="chatBox">${state.chatLog.join('<br>')}</div>
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

                <div class="panel" style="width: 750px;">
                    <h3 style="margin-top:0; color: #7f8c8d;">🕹️ Дії у світі</h3>
                    <form action="/cmd" method="POST" style="display:inline;">
                        <button class="btn-blue" name="action" value="shift">🧍‍♂️ Шифт: ${state.isSneaking ? '<span style="color:#e74c3c">УВІМКНЕНО</span>' : '<span style="color:#2ecc71">ВИМКНЕНО</span>'}</button>
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

    app.get('/captcha_raw.png', (req, res) => {
        // Беремо картинку з головної папки проекту
        res.sendFile(path.resolve(__dirname, '../../captcha_raw.png'));
    });

    app.post('/submit_captcha', (req, res) => {
        const code = req.body.code;
        if (code && bot && state.isCaptchaWaiting) {
            bot.chat(code);
            state.isCaptchaWaiting = false; 
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
                state.isSneaking = !state.isSneaking;
                bot.setControlState('sneak', state.isSneaking);
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
                if (state.currentWindow) {
                    try { await bot.clickWindow(parseInt(req.body.slot), 0, 0); } catch (err) { console.log('Помилка кліку:', err); }
                }
                break;
            case 'close_window':
                if (state.currentWindow) bot.closeWindow(state.currentWindow);
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
}

module.exports = { startWebServer };