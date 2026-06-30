const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const readline = require('readline');
const Jimp = require('jimp'); 
const HttpClient = require('./endcaptcha.js'); // Підключаємо їхню локальну бібліотеку

// ================= НАЛАШТУВАННЯ =================
const USERNAME = 'Romcokek';
const PASSWORD = 'tony0905stark';
const FOLDER_PATH = './captchas';
// ================================================

const client = new HttpClient(USERNAME, PASSWORD);
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});



async function processCaptchas() {
    // 1. Перевіряємо баланс через їхню бібліотеку
    await new Promise(resolve => {
        let balanceReq = client.get_balance();
        balanceReq.on('response', (res) => {
            console.log(`Баланс акаунта: ${res}`);
            resolve();
        });
    });

    if (!fs.existsSync(FOLDER_PATH)) {
        console.log(`Папка ${FOLDER_PATH} не знайдена!`);
        rl.close();
        return;
    }

    const files = fs.readdirSync(FOLDER_PATH).filter(f => f.match(/\.(png|jpg|jpeg|gif)$/i));
    
    if (files.length === 0) {
        console.log("В папці немає картинок!");
        rl.close();
        return;
    }

    const tmpPath = path.join(FOLDER_PATH, 'tmp_with_instruction.png');

    for (const file of files) {
        if (file === 'tmp_with_instruction.png') continue; 
        
        const originalFilePath = path.join(FOLDER_PATH, file);
        console.log(`\n--- Обробка: ${file} ---`);
        
        // Виводимо картинку в термінал через chafa
        exec(`chafa "${tmpPath}"`, (error, stdout) => {
            if (!error) console.log(stdout);
        });
        
        console.log('Відправка на сервер EndCaptcha. Чекаємо на людину...');
        
        // 2. Відправляємо через метод decode, який сам опитує сервер
        await new Promise((resolve) => {
            let captchaReq = client.decode(tmpPath);
            
            captchaReq.on('response', (res) => {
                if (res && res.text) {
                    console.log(`>>> РЕЗУЛЬТАТ РОЗПІЗНАВАННЯ: ${res.text} <<<`);
                    
                    // Якщо ввели фігню — відправляємо репорт для повернення коштів
                    if (res.text.length !== 4 || !/^\d{4}$/.test(res.text)) {
                        console.log('Поганий результат, надсилаємо репорт...');
                        client.report(res.captcha_id);
                    }
                } else {
                    console.log(`Помилка або таймаут:`, res);
                }
                
                rl.question('\nНатисни Enter для наступної картинки...', () => {
                    resolve();
                });
            });
        });
    }
    
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    rl.close();
    console.log('Тестування завершено!');
}

processCaptchas();