const { Client, GatewayIntentBits, Collection } = require('@jubbio/core');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fetch = require('node-fetch');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ]
});

const BOT_TOKEN = process.env.BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const aiModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

let kufurListesi = ['amk', 'mk', 'sik', 'sikik', 'orosbu', 'orospu', 'piç', 'göt', 'yarrak', 'amcık'];
let uyarilar = new Map();
let afkKullanicilar = new Map();
let xpData = new Map();
let ekonomiData = new Map();
let notlar = new Map();
let susturulanlar = new Map();
let kilitliKanallar = new Set();
let logKanal = null;
let botPrefix = '!';
let aiSohbetModu = new Map();

function logGonder(icerik) {
  if (logKanal && client.channels.cache.get(logKanal)) {
    client.channels.cache.get(logKanal).send(icerik).catch(() => {});
  }
}

function yetkiliMi(member) {
  return member.permissions.has('Administrator') || member.permissions.has('ManageMessages');
}

function kufurVar(mesaj) {
  const msg = mesaj.toLowerCase();
  return kufurListesi.some(kufur => msg.includes(kufur));
}

function coinEkle(kullaniciId, miktar) {
  if (!ekonomiData.has(kullaniciId)) {
    ekonomiData.set(kullaniciId, { coin: 0, envanter: [] });
  }
  let data = ekonomiData.get(kullaniciId);
  data.coin += miktar;
  ekonomiData.set(kullaniciId, data);
}

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  
  // Küfür kontrolü
  if (kufurVar(message.content)) {
    await message.delete().catch(() => {});
    const uyariMsg = await message.channel.send(`⚠️ **${message.author.username}**, küfür etmek yasak!`);
    setTimeout(() => uyariMsg.delete().catch(() => {}), 3000);
    logGonder(`🚫 **${message.author.username}** küfür etti: ${message.content}`);
    return;
  }
  
  // AFK kontrolü
  if (afkKullanicilar.has(message.author.id)) {
    const sebep = afkKullanicilar.get(message.author.id);
    afkKullanicilar.delete(message.author.id);
    await message.reply(`👋 **${message.author.username}** AFK modundan çıktı.`);
  }
  
  // AI Sohbet Modu
  if (aiSohbetModu.has(message.author.id)) {
    try {
      const result = await aiModel.generateContent(message.content);
      await message.reply(result.response.text());
    } catch (err) {
      await message.reply('❌ AI yanıt veremedi.');
    }
    return;
  }
  
  // PREFIX KONTROLÜ (DÜZELTİLDİ)
  if (!message.content.startsWith(botPrefix)) return;
  
  const args = message.content.slice(botPrefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  
  console.log(`📢 Komut alındı: ${command} - ${message.author.username}`); // DEBUG
  
  // ========== KOMUTLAR ==========
  if (command === 'ping') {
    await message.reply('🏓 **Pong!** Bot çalışıyor!');
  }
  
  else if (command === 'yardim') {
    await message.reply(`
📋 **ProBot Komutları**

!ping - Bot test
!yardim - Bu menü
!kullanici - Kullanıcı bilgileri
!sunucu - Sunucu bilgileri
!günlük - Günlük coin al
!ai <soru> - Yapay zekaya soru sor
!kedi - Rastgele kedi fotoğrafı
!köpek - Rastgele köpek fotoğrafı
!espri - Rastgele fıkra
!zar - Zar at
!yazitura - Yazı tura
!sayitahmin - Sayı tahmin oyunu
!afk <sebep> - AFK modu
!not <mesaj> - Not al
!notlar - Notlarını göster
    `);
  }
  
  else if (command === 'kullanici') {
    const target = message.mentions.users.first() || message.author;
    const member = await message.guild.members.fetch(target.id);
    await message.reply(`👤 **${target.username}**\nID: ${target.id}\nKatılma: ${new Date(member.joinedAt).toLocaleDateString('tr-TR')}`);
  }
  
  else if (command === 'sunucu') {
    const guild = message.guild;
    const owner = await guild.fetchOwner();
    await message.reply(`🏰 **${guild.name}**\nÜye: ${guild.memberCount}\nSahip: ${owner.user.username}`);
  }
  
  else if (command === 'günlük') {
    const miktar = Math.floor(Math.random() * 100) + 50;
    coinEkle(message.author.id, miktar);
    await message.reply(`💰 Günlük ödülün: **${miktar}** coin!`);
  }
  
  else if (command === 'ai') {
    const soru = args.join(' ');
    if (!soru) return message.reply('❌ Soru sor! Örnek: !ai nasılsın?');
    try {
      const result = await aiModel.generateContent(soru);
      await message.reply(`🤖 **AI:** ${result.response.text()}`);
    } catch (err) {
      await message.reply('❌ AI yanıt veremedi.');
    }
  }
  
  else if (command === 'kedi') {
    try {
      const res = await fetch('https://api.thecatapi.com/v1/images/search');
      const data = await res.json();
      await message.reply({ content: '🐱 **Rastgele Kedi**', files: [data[0].url] });
    } catch (err) {
      await message.reply('❌ Kedi fotoğrafı alınamadı!');
    }
  }
  
  else if (command === 'köpek') {
    try {
      const res = await fetch('https://dog.ceo/api/breeds/image/random');
      const data = await res.json();
      await message.reply({ content: '🐶 **Rastgele Köpek**', files: [data.message] });
    } catch (err) {
      await message.reply('❌ Köpek fotoğrafı alınamadı!');
    }
  }
  
  else if (command === 'espri') {
    const espiriler = [
      'Telefonum şarj oluyor, o da beni aramıyor...',
      'Bir kedi neden bilgisayar kullanmaz? Fareyi tutamaz çünkü.',
      'Neden programcılar doğum günlerini sevmez? Çünkü her yıl bir sürü hata (bug) çıkar.'
    ];
    await message.reply(`😂 ${espiriler[Math.floor(Math.random() * espiriler.length)]}`);
  }
  
  else if (command === 'zar') {
    const zar1 = Math.floor(Math.random() * 6) + 1;
    const zar2 = Math.floor(Math.random() * 6) + 1;
    await message.reply(`🎲 **${message.author.username}** zar attı!\n${zar1} + ${zar2} = **${zar1 + zar2}**`);
  }
  
  else if (command === 'yazitura') {
    const sonuc = Math.random() < 0.5 ? 'Yazı' : 'Tura';
    await message.reply(`🪙 **${message.author.username}** parayı attı!\nSonuç: **${sonuc}**`);
  }
  
  else if (command === 'sayitahmin') {
    const hedef = Math.floor(Math.random() * 100) + 1;
    let hak = 5;
    await message.reply('🎯 **Sayı Tahmin Oyunu!**\n1-100 arasında sayı tuttum. 5 hakkın var.');
    
    const filter = m => m.author.id === message.author.id;
    const collector = message.channel.createMessageCollector({ filter, time: 60000 });
    collector.on('collect', async (m) => {
      const tahmin = parseInt(m.content);
      if (isNaN(tahmin)) return m.reply('❌ Sayı gir!');
      hak--;
      if (tahmin === hedef) {
        collector.stop();
        coinEkle(message.author.id, 100);
        return m.reply(`🎉 Tebrikler! ${hedef} sayısını bildin! 100 coin kazandın!`);
      } else if (hak === 0) {
        collector.stop();
        return m.reply(`❌ Kaybettin! Sayı ${hedef} idi.`);
      } else {
        const ipucu = tahmin < hedef ? '📈 Daha büyük' : '📉 Daha küçük';
        m.reply(`${ipucu}. Kalan hak: ${hak}`);
      }
    });
  }
  
  else if (command === 'afk') {
    const sebep = args.join(' ') || 'Belirtilmemiş';
    afkKullanicilar.set(message.author.id, sebep);
    await message.reply(`💤 **${message.author.username}** AFK moduna girdi!`);
  }
  
  else if (command === 'not') {
    const notMsg = args.join(' ');
    if (!notMsg) return message.reply('❌ Not mesajı yaz!');
    if (!notlar.has(message.author.id)) notlar.set(message.author.id, []);
    notlar.get(message.author.id).push({ id: Date.now(), mesaj: notMsg });
    await message.reply(`📝 Not eklendi! !notlar ile görüntüleyebilirsin.`);
  }
  
  else if (command === 'notlar') {
    const userNotes = notlar.get(message.author.id);
    if (!userNotes || userNotes.length === 0) return message.reply('📭 Hiç notun yok.');
    let list = '📝 **Notların:**\n';
    userNotes.forEach(n => {
      list += `- ${n.mesaj.substring(0, 50)}\n`;
    });
    await message.reply(list);
  }
  
  else {
    await message.reply(`❌ Bilinmeyen komut: **${command}**\n!yardim yazarak komutları görebilirsin.`);
  }
});

client.login(BOT_TOKEN).catch(err => console.error('❌ Bot başlatılamadı:', err.message));

const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', bot: client.user?.username }));
});
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`✅ HTTP sunucusu ${PORT} portunda çalışıyor`);
});
