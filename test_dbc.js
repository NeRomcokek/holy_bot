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

// Ініціалізуємо клієнт Gemini
const genAI = new GoogleGenerativeAI(API_KEY);
// Використовуємо 1.5 Flash - вона безкоштовна, швидка і чудово бачить картинки
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Функція для підготовки картинки у формат, який розуміє Gemini
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

    // Це наша "інструкція" для ШІ. Чим вона точніша, тим краще він ігнорує лінії.
    const prompt = `
        Це графічна капча. На ній зображено рівно 4 цифри.
        Ці цифри перекреслені лініями (шумом), які можуть співпадати за кольором з цифрами.
        Твоя задача: проігнорувати всі лінії на фоні і розпізнати тільки 4 цифри.
        У відповіді напиши ТІЛЬКИ 4 цифри. Жодних букв, жодних пробілів, крапок чи інших пояснень.
    `;

    for (const file of files) {
        const originalFilePath = path.join(FOLDER_PATH, file);
        console.log(`\n--- Обробка: ${file} ---`);
        
        // Виводимо картинку в термінал через chafa
        exec(`chafa "${originalFilePath}"`, (error, stdout) => {
            if (!error) console.log(stdout);
        });
        
        console.log('Gemini дивиться на картинку...');
        
        try {
            // Визначаємо MIME-тип на основі розширення (PNG або JPEG)
            const ext = path.extname(file).toLowerCase();
            const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
            
            // Готуємо картинку
            const imagePart = fileToGenerativePart(originalFilePath, mimeType);

            // Відправляємо картинку + текст до Gemini
            const result = await model.generateContent([prompt, imagePart]);
            const response = await result.response;
            const text = response.text().trim(); // Отримуємо текст і відрізаємо зайві пробіли/переноси
            
            console.log(`>>> РЕЗУЛЬТАТ РОЗПІЗНАВАННЯ: ${text} <<<`);
            
        } catch (error) {
            console.error('Помилка Gemini:', error.message);
        }
        
        // Чекаємо команди для переходу до наступної
        await new Promise(resolve => {
            rl.question('\nНатисни Enter для наступної картинки...', () => resolve());
        });
    }
    
    rl.close();
    console.log('Тестування завершено!');
}

processCaptchas();