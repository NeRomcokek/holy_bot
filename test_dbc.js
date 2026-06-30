require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const readline = require('readline');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ================= НАЛАШТУВАННЯ =================
const API_KEY = process.env.GEMINI_API_KEY;
const FOLDER_PATH = path.resolve(__dirname, './captchas');
// ================================================

const genAI = new GoogleGenerativeAI(API_KEY);
// Перемикаємось на найрозумнішу PRO-модель
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Функція для створення паузи
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function fileToGenerativePart(filePath, mimeType) {
    return {
        inlineData: {
            data: Buffer.from(fs.readFileSync(filePath)).toString("base64"),
            mimeType
        },
    };
}

async function processCaptchas() {
    if (!fs.existsSync(FOLDER_PATH)) {
        console.log(`Папка ${FOLDER_PATH} не знайдена!`);
        rl.close();
        return;
    }

    const files = fs.readdirSync(FOLDER_PATH).filter(f => f.match(/\.(png|jpg|jpeg)$/i));
    
    if (files.length === 0) {
        console.log("В папці немає картинок!");
        rl.close();
        return;
    }

    console.log(`Знайдено картинок для тесту: ${files.length}\n`);

    // Новий хитрий промпт: змушуємо ШІ "думати вголос"
    const prompt = `
        Ти експерт з комп'ютерного зору. Перед тобою графічна капча.
        На ній зображено рівно 4 цифри, але вони сильно перекреслені лініями (шумом), які часто співпадають за кольором з самими цифрами.
        Щоб не помилитися, застосуй такий підхід:
        1. Спочатку уважно подивись на зображення і коротко опиши свої міркування (наприклад: "Бачу на фоні сітки червоні цифри. Перша цифра має округлу форму, схожа на 9...").
        2. Тільки після міркувань, з нового рядка напиши фінальну відповідь СУВОРО у такому форматі: 
        ВІДПОВІДЬ: 1234
    `;

    for (const file of files) {
        const originalFilePath = path.join(FOLDER_PATH, file);
        console.log(`\n--- Обробка: ${file} ---`);
        
        exec(`chafa "${originalFilePath}"`, (error, stdout) => {
            if (!error) console.log(stdout);
        });
        
        console.log('Gemini 1.5 Pro аналізує картинку (це може зайняти 5-10 секунд)...');
        
        const ext = path.extname(file).toLowerCase();
        const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
        const imagePart = fileToGenerativePart(originalFilePath, mimeType);

        let success = false;
        
        // Цикл спроб для обходу помилки 429
        while (!success) {
            try {
                const result = await model.generateContent([prompt, imagePart]);
                const response = await result.response;
                const text = response.text().trim();
                
                console.log(`\n[Міркування ШІ та результат]:\n${text}\n`);
                success = true; // Якщо помилки немає, йдемо далі
                
            } catch (error) {
                // Якщо зловили ліміт - просто чекаємо і повторюємо
                if (error.message.includes('429') || error.message.includes('Quota')) {
                    console.log('⏳ Досягнуто ліміту запитів (API відпочиває). Чекаємо 20 секунд...');
                    await delay(20000); 
                } else {
                    console.error('Невідома помилка Gemini:', error.message);
                    success = true; // Пропускаємо картинку, якщо помилка критична
                }
            }
        }
        
        await new Promise(resolve => {
            rl.question('Натисни Enter для наступної картинки...', () => resolve());
        });
    }
    
    rl.close();
    console.log('Тестування завершено!');
}

processCaptchas();