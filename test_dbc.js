const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const readline = require('readline');
const dbc = require('deathbycaptcha-lib'); // Підключаємо бібліотеку

// ================= НАЛАШТУВАННЯ =================
const USERNAME = 'Romcokek';
const PASSWORD = 'Tony0905stark.';
const FOLDER_PATH = './captchas'; // Шлях до папки з картинками
// ================================================

// Ініціалізуємо HTTP-клієнта з документації
const client = new dbc.HttpClient(USERNAME, PASSWORD);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function processCaptchas() {
    // Перевіряємо баланс перед початком
    await new Promise(resolve => {
        client.get_balance((balance) => {
            console.log(`Баланс акаунта: ${balance} центів`);
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

    console.log(`Знайдено картинок для тесту: ${files.length}\n`);

    for (const file of files) {
        const filePath = path.join(FOLDER_PATH, file);
        console.log(`--- Обробка: ${file} ---`);
        
        // Відкриваємо картинку через стандартний переглядач Ubuntu
        exec(`chafa "${filePath}"`, (error, stdout) => {
            if (error) {
                console.error(`Помилка chafa: ${error.message}`);
                return;
            }
            console.log(stdout); // Вимальовує картинку в консолі
        });
        
        console.log('Відправка на сервер. Чекаємо на людину...');
        
        // Відправляємо завдання
        await new Promise((resolve) => {
            client.decode({captcha: filePath}, (captcha) => {
                if (captcha) {
                    // Якщо капча розв'язана, виводимо її текст
                    console.log(`>>> РЕЗУЛЬТАТ РОЗПІЗНАВАННЯ: ${captcha['text']} <<<`);
                } else {
                    console.log('Помилка розпізнавання або таймаут.');
                }
                
                rl.question('\nНатисни Enter, щоб закрити перегляд і перейти до наступної картинки...', () => {
                    resolve();
                });
            });
        });
    }
    
    rl.close();
    console.log('Тестування завершено!');
}

processCaptchas();