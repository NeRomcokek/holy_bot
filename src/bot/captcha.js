const { createCanvas } = require('canvas');
const fs = require('fs');

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

function saveRawCaptcha(bot, mapsCache, state) {
    const frames = Object.values(bot.entities).filter(e => e.name === 'item_frame' || e.name === 'glow_item_frame');
    
    if (frames.length === 0) {
        console.log('❌ Об\'єкти рамок ще не завантажились у пам\'ять. Повторна спроба за 1 сек...');
        setTimeout(() => saveRawCaptcha(bot, mapsCache, state), 1000);
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
        try { 
            if (frame.metadata[9] && frame.metadata[9].components) {
                mapId = frame.metadata[9].components.find(c => c.type === 'map_id').data; 
            }
        } catch (e) {}
        
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
    state.isCaptchaWaiting = true; 
    console.log('🚨 Екран капчі активовано в браузері.');
}

module.exports = { saveRawCaptcha };