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

module.exports = { getItemName };