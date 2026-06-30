const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const readline = require('readline');
const HttpClient = require('./endcaptcha.js'); // Підключаємо їхню локальну бібліотеку

// ================= НАЛАШТУВАННЯ =================
const USERNAME = 'ТВІЙ_ЛОГІН_ENDCAPTCHA';
const PASSWORD = 'ТВІЙ_ПАРОЛЬ_ENDCAPTCHA';
// Робимо шлях абсолютним, щоб уникнути проблем з пошуком папки
const FOLDER_PATH = path.resolve(__dirname, './captcha_tests'); 
// ================================================

const client = new HttpClient(USERNAME, PASSWORD);
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function processCaptchas() {
    // 1. Перевіряємо баланс 
    await new Promise(resolve => {
        let balanceReq = client.get_balance();
        balanceReq.on('response', (res) => {
            // Витягуємо значення з об'єкта
            console.log(`Баланс акаунта: ${res.balance || JSON.stringify(res)}`);
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

    for (const file of files) {
        const originalFilePath = path.join(FOLDER_PATH, file);
        console.log(`\n--- Обробка: ${file} ---`);
        
        // Виводимо оригінальну картинку в термінал через chafa
        exec(`chafa "${originalFilePath}"`, (error, stdout) => {
            if (!error) console.log(stdout);
        });
        
        console.log('Відправка на сервер EndCaptcha. Чекаємо на людину...');
        
        // 2. Відправляємо оригінальний файл напряму через ReadStream
        await new Promise((resolve) => {
            let captchaReq = client.decode(fs.createReadStream(originalFilePath));
            
            captchaReq.on('response', (res) => {
                if (res && res.text) {
                    console.log(`>>> РЕЗУЛЬТАТ РОЗПІЗНАВАННЯ: ${res.text} <<<`);
                    
                    // Залишаємо авто-репорт, якщо працівник ввів букви замість цифр або менше/більше 4 символів
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
    
    rl.close();
    console.log('Тестування завершено!');
}

processCaptchas();