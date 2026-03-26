const { Client, GatewayIntentBits, Collection } = require('@jubbio/core');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fetch = require('node-fetch');

// ========== BOT AYARLARI ==========
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

// ========== VERİTABANLARI ==========
let kufurListesi = ['amk', 'mk', 'sik', 'sikik', 'orosbu', 'orospu', 'piç', 'göt', 'yarrak', 'amcık', 'ananı', 'bacını', 'ebeni', 'sikerim', 'sikeyim'];
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
let akinatorVeri = new Map();
let piyangoCekilis = { aktif: false, havuz: 0, katilimcilar: [] };
let hatirlaticilar = [];

// ========== YARDIMCI FONKSİYONLAR ==========
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

function kufurTemizle(mesaj) {
  let yeniMesaj = mesaj;
  kufurListesi.forEach(kufur => {
    const regex = new RegExp(kufur, 'gi');
    yeniMesaj = yeniMesaj.replace(regex, '***');
  });
  return yeniMesaj;
}

function xpEkle(kullaniciId) {
  if (!xpData.has(kullaniciId)) {
    xpData.set(kullaniciId, { xp: 0, level: 0 });
  }
  let data = xpData.get(kullaniciId);
  data.xp += Math.floor(Math.random() * 10) + 5;
  let yeniLevel = Math.floor(data.xp / 100);
  if (yeniLevel > data.level) {
    data.level = yeniLevel;
    return true;
  }
  xpData.set(kullaniciId, data);
  return false;
}

function seviyeHesapla(xp) {
  return Math.floor(xp / 100);
}

function coinEkle(kullaniciId, miktar) {
  if (!ekonomiData.has(kullaniciId)) {
    ekonomiData.set(kullaniciId, { coin: 0, envanter: [] });
  }
  let data = ekonomiData.get(kullaniciId);
  data.coin += miktar;
  ekonomiData.set(kullaniciId, data);
}

function coinCikar(kullaniciId, miktar) {
  if (!ekonomiData.has(kullaniciId)) {
    ekonomiData.set(kullaniciId, { coin: 0, envanter: [] });
  }
  let data = ekonomiData.get(kullaniciId);
  if (data.coin >= miktar) {
    data.coin -= miktar;
    ekonomiData.set(kullaniciId, data);
    return true;
  }
  return false;
}

const marketUrunleri = [
  { id: 1, ad: 'Özel Rol', fiyat: 500, aciklama: 'Kendine özel renkli rol alırsın' },
  { id: 2, ad: 'VIP Üyelik', fiyat: 1000, aciklama: '1 ay VIP üyeliği' },
  { id: 3, ad: 'Boost', fiyat: 200, aciklama: 'Sunucuya +1 boost' }
];

// ========== KÜFÜR FİLTRESİ ==========
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
    await message.reply(`👋 **${message.author.username}** AFK modundan çıktı. (Sebep: ${sebep})`);
  }
  
  // Etiketlenen AFK kontrolü
  if (message.mentions.users.size > 0) {
    for (const [id, user] of message.mentions.users) {
      if (afkKullanicilar.has(id)) {
        const sebep = afkKullanicilar.get(id);
        await message.reply(`💤 **${user.username}** AFK: ${sebep}`);
      }
    }
  }
  
  // XP ekle
  const levelUp = xpEkle(message.author.id);
  if (levelUp) {
    const data = xpData.get(message.author.id);
    await message.channel.send(`🎉 **${message.author.username}** seviye **${data.level}** oldu!`);
  }
  
  // Susturma kontrolü
  if (susturulanlar.has(message.author.id)) {
    const until = susturulanlar.get(message.author.id);
    if (until > Date.now()) {
      await message.delete().catch(() => {});
      return;
    } else {
      susturulanlar.delete(message.author.id);
    }
  }
  
  // Kilitli kanal kontrolü
  if (kilitliKanallar.has(message.channel.id)) {
    if (!yetkiliMi(message.member)) {
      await message.delete().catch(() => {});
      return;
    }
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
  
  // Prefix kontrolü
  if (!message.content.startsWith(botPrefix)) return;
  
  const args = message.content.slice(botPrefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  
  // ========== YÖNETİCİ KOMUTLARI ==========
  if (command === 'temizle') {
    if (!yetkiliMi(message.member)) return message.reply('❌ Yetkin yok!');
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount < 1 || amount > 100) return message.reply('❌ 1-100 arası sayı gir!');
    const fetched = await message.channel.messages.fetch({ limit: amount + 1 });
    await message.channel.bulkDelete(fetched);
    const msg = await message.channel.send(`🗑️ **${amount}** mesaj silindi.`);
    setTimeout(() => msg.delete(), 3000);
    logGonder(`🗑️ **${message.author.username}** ${amount} mesaj sildi (${message.channel.name})`);
  }
  
  else if (command === 'temizle-kullanici') {
    if (!yetkiliMi(message.member)) return message.reply('❌ Yetkin yok!');
    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Kullanıcı etiketle!');
    const amount = parseInt(args[1]);
    if (isNaN(amount) || amount < 1 || amount > 100) return message.reply('❌ 1-100 arası sayı gir!');
    const fetched = await message.channel.messages.fetch({ limit: 100 });
    const userMessages = fetched.filter(m => m.author.id === target.id).first(amount);
    await message.channel.bulkDelete(userMessages);
    const msg = await message.channel.send(`🗑️ **${target.user.username}**'in **${amount}** mesajı silindi.`);
    setTimeout(() => msg.delete(), 3000);
    logGonder(`🗑️ **${message.author.username}** ${target.user.username} adlı kullanıcının ${amount} mesajını sildi`);
  }
  
  else if (command === 'uyar') {
    if (!yetkiliMi(message.member)) return message.reply('❌ Yetkin yok!');
    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Kullanıcı etiketle!');
    const sebep = args.slice(1).join(' ') || 'Belirtilmemiş';
    let uyariSayisi = uyarilar.get(target.id) || 0;
    uyariSayisi++;
    uyarilar.set(target.id, uyariSayisi);
    await message.reply(`⚠️ **${target.user.username}** uyarıldı! (Toplam: ${uyariSayisi}/3)`);
    logGonder(`⚠️ **${target.user.username}** uyarıldı - Sebep: ${sebep} - Uyaran: ${message.author.username}`);
    if (uyariSayisi >= 3) {
      await target.ban({ reason: '3 uyarı sonucu otomatik ban' });
      await message.channel.send(`🚫 **${target.user.username}** 3 uyarı aldığı için banlandı!`);
      logGonder(`🚫 **${target.user.username}** 3 uyarı sonucu banlandı`);
      uyarilar.delete(target.id);
    }
  }
  
  else if (command === 'uyarilar') {
    if (!yetkiliMi(message.member)) return message.reply('❌ Yetkin yok!');
    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Kullanıcı etiketle!');
    const uyariSayisi = uyarilar.get(target.id) || 0;
    await message.reply(`⚠️ **${target.user.username}** toplam **${uyariSayisi}/3** uyarı aldı.`);
  }
  
  else if (command === 'sustur') {
    if (!yetkiliMi(message.member)) return message.reply('❌ Yetkin yok!');
    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Kullanıcı etiketle!');
    const sure = parseInt(args[1]);
    if (isNaN(sure) || sure < 1) return message.reply('❌ Geçerli süre gir (dakika)!');
    susturulanlar.set(target.id, Date.now() + (sure * 60 * 1000));
    await message.reply(`🔇 **${target.user.username}** ${sure} dakika susturuldu!`);
    logGonder(`🔇 **${target.user.username}** ${sure} dakika susturuldu (${message.author.username})`);
  }
  
  else if (command === 'susturma-kaldir') {
    if (!yetkiliMi(message.member)) return message.reply('❌ Yetkin yok!');
    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Kullanıcı etiketle!');
    susturulanlar.delete(target.id);
    await message.reply(`🔊 **${target.user.username}** susturması kaldırıldı!`);
  }
  
  else if (command === 'ban') {
    if (!message.member.permissions.has('BanMembers')) return message.reply('❌ Ban yetkin yok!');
    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Kullanıcı etiketle!');
    const sebep = args.slice(1).join(' ') || 'Belirtilmemiş';
    await target.ban({ reason: sebep });
    await message.reply(`🚫 **${target.user.username}** banlandı! Sebep: ${sebep}`);
    logGonder(`🚫 **${target.user.username}** banlandı - Sebep: ${sebep} - Banlayan: ${message.author.username}`);
  }
  
  else if (command === 'kick') {
    if (!yetkiliMi(message.member)) return message.reply('❌ Yetkin yok!');
    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Kullanıcı etiketle!');
    const sebep = args.slice(1).join(' ') || 'Belirtilmemiş';
    await target.kick(sebep);
    await message.reply(`👢 **${target.user.username}** kicklendi! Sebep: ${sebep}`);
    logGonder(`👢 **${target.user.username}** kicklendi - Sebep: ${sebep} - Kickleyen: ${message.author.username}`);
  }
  
  else if (command === 'banlist') {
    if (!message.member.permissions.has('BanMembers')) return message.reply('❌ Yetkin yok!');
    const bans = await message.guild.bans.fetch();
    if (bans.size === 0) return message.reply('📭 Banlanmış kullanıcı yok.');
    let list = '🚫 **Banlanan Kullanıcılar:**\n';
    bans.forEach(ban => {
      list += `- ${ban.user.username} (${ban.user.id})\n`;
    });
    await message.reply(list);
  }
  
  else if (command === 'duyuru') {
    if (!yetkiliMi(message.member)) return message.reply('❌ Yetkin yok!');
    const duyuruMsg = args.join(' ');
    if (!duyuruMsg) return message.reply('❌ Duyuru mesajı yaz!');
    await message.channel.send(`📢 **DUYURU** 📢\n\n${duyuruMsg}`);
    logGonder(`📢 **${message.author.username}** duyuru yaptı: ${duyuruMsg}`);
  }
  
  else if (command === 'kilit') {
    if (!yetkiliMi(message.member)) return message.reply('❌ Yetkin yok!');
    if (kilitliKanallar.has(message.channel.id)) {
      kilitliKanallar.delete(message.channel.id);
      await message.reply(`🔓 **${message.channel.name}** kanalının kilidi açıldı!`);
    } else {
      kilitliKanallar.add(message.channel.id);
      await message.reply(`🔒 **${message.channel.name}** kanalı kilitlendi!`);
    }
  }
  
  else if (command === 'yavasmod') {
    if (!yetkiliMi(message.member)) return message.reply('❌ Yetkin yok!');
    const sure = parseInt(args[0]);
    if (isNaN(sure) || sure < 1) return message.reply('❌ Geçerli süre gir (saniye)!');
    await message.channel.setRateLimitPerUser(sure);
    await message.reply(`⏱️ Yavaş mod **${sure}** saniye olarak ayarlandı!`);
}
    // ========== OYUN KOMUTLARI ==========
  else if (command === 'zar') {
    const zar1 = Math.floor(Math.random() * 6) + 1;
    const zar2 = Math.floor(Math.random() * 6) + 1;
    const toplam = zar1 + zar2;
    let mesaj = `🎲 **${message.author.username}** zar attı!\n${zar1} + ${zar2} = **${toplam}**`;
    if (zar1 === zar2) {
      mesaj += '\n🎉 **ÇİFT GELDİ!** 20 coin kazandın!';
      coinEkle(message.author.id, 20);
    }
    await message.reply(mesaj);
  }
  
  else if (command === 'yazitura') {
    const sonuc = Math.random() < 0.5 ? 'Yazı' : 'Tura';
    await message.reply(`🪙 **${message.author.username}** parayı attı!\nSonuç: **${sonuc}**`);
  }
  
  else if (command === 'sayitahmin') {
    const hedef = Math.floor(Math.random() * 100) + 1;
    let hak = 5;
    let tahminler = [];
    const filter = m => m.author.id === message.author.id;
    await message.reply('🎯 **Sayı Tahmin Oyunu!**\n1-100 arasında bir sayı tuttum. 5 hakkın var. Tahminini yaz!');
    
    const collector = message.channel.createMessageCollector({ filter, time: 60000 });
    collector.on('collect', async (m) => {
      const tahmin = parseInt(m.content);
      if (isNaN(tahmin)) return m.reply('❌ Lütfen sayı gir!');
      hak--;
      tahminler.push(tahmin);
      
      if (tahmin === hedef) {
        collector.stop();
        coinEkle(message.author.id, 100);
        return m.reply(`🎉 **Tebrikler!** ${hedef} sayısını bildin! 100 coin kazandın!`);
      } else if (hak === 0) {
        collector.stop();
        return m.reply(`❌ **Kaybettin!** Sayı **${hedef}** idi.`);
      } else {
        const ipucu = tahmin < hedef ? '📈 Daha büyük' : '📉 Daha küçük';
        m.reply(`${ipucu}. Kalan hak: ${hak}\nTahminlerin: ${tahminler.join(', ')}`);
      }
    });
    collector.on('end', () => {});
  }
  
  else if (command === 'bilgiyarisma') {
    const sorular = [
      { soru: 'Türkiye\'nin başkenti neresidir?', cevap: 'ankara' },
      { soru: 'Dünyanın en büyük okyanusu hangisidir?', cevap: 'pasifik' },
      { soru: '2+2 kaç eder?', cevap: '4' },
      { soru: 'Python hangi tür bir dildir?', cevap: 'yorumlanan' },
      { soru: 'HTML açılımı nedir?', cevap: 'hypertext markup language' }
    ];
    const soru = sorular[Math.floor(Math.random() * sorular.length)];
    let hak = 3;
    await message.reply(`❓ **Bilgi Yarışması!**\n${soru.soru}\n3 hakkın var.`);
    
    const filter = m => m.author.id === message.author.id;
    const collector = message.channel.createMessageCollector({ filter, time: 30000 });
    collector.on('collect', async (m) => {
      if (m.content.toLowerCase().trim() === soru.cevap) {
        collector.stop();
        coinEkle(message.author.id, 50);
        return m.reply(`✅ **Doğru cevap!** 50 coin kazandın!`);
      } else {
        hak--;
        if (hak === 0) {
          collector.stop();
          return m.reply(`❌ **Kaybettin!** Doğru cevap: **${soru.cevap}**`);
        }
        m.reply(`❌ Yanlış! Kalan hak: ${hak}`);
      }
    });
  }
  
  else if (command === 'akinatör') {
    if (akinatorVeri.has(message.author.id)) return message.reply('❌ Zaten oynuyorsun! !cik yaz çık.');
    
    const sorular = [
      'Canlı mı?', 'Nesne mi?', 'İnsan mı?', 'Hayvan mı?', 'Yiyecek mi?',
      'Evcil mi?', 'Taşıt mı?', 'Elektronik mi?', 'Spor mu?', 'Sanat mı?'
    ];
    let soruIndex = 0;
    let cevaplar = [];
    
    akinatorVeri.set(message.author.id, { soruIndex, cevaplar, sorular });
    await message.reply(`🧠 **Akinatör Oyunu!** Aklında bir şey tut. Hazır mısın?\n${sorular[0]} (evet/hayır/bilmiyorum)`);
    
    const filter = m => m.author.id === message.author.id;
    const collector = message.channel.createMessageCollector({ filter, time: 120000 });
    
    collector.on('collect', async (m) => {
      const data = akinatorVeri.get(message.author.id);
      const cevap = m.content.toLowerCase();
      
      if (cevap === 'cik') {
        akinatorVeri.delete(message.author.id);
        collector.stop();
        return message.reply('👋 Oyun sonlandırıldı.');
      }
      
      if (['evet', 'hayır', 'bilmiyorum'].includes(cevap)) {
        data.cevaplar.push(cevap);
        data.soruIndex++;
        
        if (data.soruIndex >= data.sorular.length) {
          akinatorVeri.delete(message.author.id);
          collector.stop();
          const tahminler = ['Kedi', 'Köpek', 'Telefon', 'Bilgisayar', 'Araba', 'Pizza', 'Kitap'];
          const tahmin = tahminler[Math.floor(Math.random() * tahminler.length)];
          const msg = await message.reply(`🤔 Tahminim: **${tahmin}**. Bildim mi? (evet/hayır)`);
          
          const tahminFilter = m2 => m2.author.id === message.author.id;
          const tahminCollector = message.channel.createMessageCollector({ filter: tahminFilter, time: 30000, max: 1 });
          tahminCollector.on('collect', async (m2) => {
            if (m2.content.toLowerCase() === 'evet') {
              coinEkle(message.author.id, 50);
              await message.reply(`🎉 Yaşasın! 50 coin kazandın!`);
            } else {
              await message.reply(`❌ Tamam, bilemedim. Oynadığın için teşekkürler!`);
            }
          });
          return;
        }
        
        await message.reply(data.sorular[data.soruIndex] + ' (evet/hayır/bilmiyorum)');
      } else {
        await message.reply('❌ Lütfen evet/hayır/bilmiyorum cevapla!');
      }
    });
  }
  
  else if (command === 'espri') {
    const espiriler = [
      'Telefonum şarj oluyor, o da beni aramıyor...',
      'Bir bilgisayar düşünün, odasını topluyor...',
      'Bir programcı marketten ekmek almaya gider, "1 ekmek al, eğer yumurta varsa 2 tane al" der. Marketçi yumurta var deyince programcı "O zaman 2 ekmek al" der.',
      'Bir kedi neden bilgisayar kullanmaz? Fareyi tutamaz çünkü.',
      'Bir koyun neden programlama öğrenemez? Çünkü RAM’i yok.',
      'Neden programcılar doğum günlerini sevmez? Çünkü her yıl bir sürü hata (bug) çıkar.'
    ];
    await message.reply(`😂 ${espiriler[Math.floor(Math.random() * espiriler.length)]}`);
  }
  
  else if (command === 'kedi') {
    try {
      const fetch = require('node-fetch');
      const res = await fetch('https://api.thecatapi.com/v1/images/search');
      const data = await res.json();
      await message.reply({ content: '🐱 **Rastgele Kedi**', files: [data[0].url] });
    } catch (err) {
      await message.reply('❌ Kedi fotoğrafı alınamadı!');
    }
  }
  
  else if (command === 'köpek') {
    try {
      const fetch = require('node-fetch');
      const res = await fetch('https://dog.ceo/api/breeds/image/random');
      const data = await res.json();
      await message.reply({ content: '🐶 **Rastgele Köpek**', files: [data.message] });
    } catch (err) {
      await message.reply('❌ Köpek fotoğrafı alınamadı!');
    }
  }
  
  // ========== GENEL KOMUTLAR ==========
  else if (command === 'ping') {
    await message.reply('🏓 **Pong!** Bot çalışıyor!');
  }
  
  else if (command === 'yardim') {
    let yardimMsg = `📋 **ProBot Komutları**\n\n`;
    yardimMsg += `🛡️ **Küfür Filtresi** - Otomatik küfür engelleme\n`;
    yardimMsg += `👑 **Yönetici** - !temizle, !uyar, !sustur, !ban, !kick, !duyuru, !kilit, !yavasmod\n`;
    yardimMsg += `🎮 **Oyunlar** - !zar, !yazitura, !sayitahmin, !bilgiyarisma, !akinatör, !espri, !kedi, !köpek\n`;
    yardimMsg += `📝 **Genel** - !ping, !kullanici, !sunucu, !avatar, !random, !istatistik, !afk, !not, !havadurumu, !davet, !destek, !hatırlat\n`;
    yardimMsg += `💰 **Ekonomi** - !günlük, !çal, !market, !envanter, !kumar, !piyango\n`;
    yardimMsg += `📈 **Seviye** - !seviye, !liderlik\n`;
    yardimMsg += `🎵 **Sesli** - !sesligel, !seslicik, !sesli-katil\n`;
    yardimMsg += `🤖 **Yapay Zeka** - !ai, !sohbet, !resim, !yorumla, !ozetle, !cevir\n`;
    yardimMsg += `⚙️ **Bot Ayarları** - !prefix, !logkanal, !kufurlistesi\n\n`;
    yardimMsg += `🔍 Detay için: !yardim <komut> (örnek: !yardim temizle)`;
    await message.reply(yardimMsg);
  }
  
  else if (command === 'kullanici') {
    const target = message.mentions.users.first() || message.author;
    const member = await message.guild.members.fetch(target.id);
    const joinedAt = new Date(member.joinedAt).toLocaleDateString('tr-TR');
    const createdAt = new Date(target.createdAt).toLocaleDateString('tr-TR');
    await message.reply(`
👤 **Kullanıcı Bilgileri**
• İsim: ${target.username}
• ID: ${target.id}
• Sunucuya Katılma: ${joinedAt}
• Hesap Oluşturma: ${createdAt}
• Roller: ${member.roles.cache.map(r => r.name).join(', ') || 'Yok'}
    `);
  }
  
  else if (command === 'sunucu') {
    const guild = message.guild;
    const owner = await guild.fetchOwner();
    await message.reply(`
🏰 **Sunucu Bilgileri**
• İsim: ${guild.name}
• ID: ${guild.id}
• Üye Sayısı: ${guild.memberCount}
• Sahip: ${owner.user.username}
• Kanal Sayısı: ${guild.channels.cache.size}
• Oluşturulma: ${new Date(guild.createdAt).toLocaleDateString('tr-TR')}
    `);
  }
  
  else if (command === 'avatar') {
    const target = message.mentions.users.first() || message.author;
    await message.reply({ content: `🖼️ **${target.username}** avatarı:`, files: [target.displayAvatarURL({ size: 1024 })] });
  }
  
  else if (command === 'random') {
    const sayi = Math.floor(Math.random() * 100) + 1;
    await message.reply(`🎲 Rastgele sayı: **${sayi}**`);
  }
  
  else if (command === 'istatistik') {
    const uptime = Math.floor(process.uptime());
    const saat = Math.floor(uptime / 3600);
    const dakika = Math.floor((uptime % 3600) / 60);
    await message.reply(`
📊 **Bot İstatistikleri**
• Çalışma Süresi: ${saat}s ${dakika}d
• Komut Sayısı: 60+
• Sunucu Sayısı: ${client.guilds.cache.size}
• Kullanıcı Sayısı: ${client.users.cache.size}
    `);
  }
  
  else if (command === 'afk') {
    const sebep = args.join(' ') || 'Belirtilmemiş';
    afkKullanicilar.set(message.author.id, sebep);
    await message.reply(`💤 **${message.author.username}** AFK moduna girdi! Sebep: ${sebep}`);
  }
  
  else if (command === 'not') {
    const notMsg = args.join(' ');
    if (!notMsg) return message.reply('❌ Not mesajı yaz!');
    const notId = Date.now();
    if (!notlar.has(message.author.id)) notlar.set(message.author.id, []);
    notlar.get(message.author.id).push({ id: notId, mesaj: notMsg, tarih: new Date().toLocaleString() });
    await message.reply(`📝 Not eklendi! ID: ${notId}\n!notlar ile görüntüleyebilirsin.`);
  }
  
  else if (command === 'notlar') {
    const userNotes = notlar.get(message.author.id);
    if (!userNotes || userNotes.length === 0) return message.reply('📭 Hiç notun yok.');
    let list = '📝 **Notların:**\n';
    userNotes.forEach(n => {
      list += `**${n.id}** - ${n.mesaj.substring(0, 50)} (${n.tarih})\n`;
    });
    await message.reply(list);
  }
  
  else if (command === 'notsil') {
    const notId = parseInt(args[0]);
    if (!notId) return message.reply('❌ Not ID gir!');
    const userNotes = notlar.get(message.author.id);
    if (!userNotes) return message.reply('❌ Not bulunamadı.');
    const index = userNotes.findIndex(n => n.id === notId);
    if (index === -1) return message.reply('❌ Not bulunamadı.');
    userNotes.splice(index, 1);
    await message.reply(`✅ Not silindi.`);
  }
  
  else if (command === 'havadurumu') {
    const sehir = args.join(' ');
    if (!sehir) return message.reply('❌ Şehir adı gir!');
    await message.reply(`🌤️ **${sehir}** için hava durumu bilgisi yakında eklenecek.`);
  }
  
  else if (command === 'davet') {
    await message.reply('🔗 **Bot Davet Linki:** https://jubbio.com/invite/bot');
  }
  
  else if (command === 'destek') {
    await message.reply('🆘 **Destek Sunucusu:** https://discord.gg/probot');
  }
  
  else if (command === 'hatırlat') {
    const sure = args[0];
    const mesaj = args.slice(1).join(' ');
    if (!sure || !mesaj) return message.reply('❌ Kullanım: !hatırlat 10m <mesaj>');
    let ms = 0;
    if (sure.endsWith('s')) ms = parseInt(sure) * 1000;
    else if (sure.endsWith('m')) ms = parseInt(sure) * 60 * 1000;
    else if (sure.endsWith('h')) ms = parseInt(sure) * 60 * 60 * 1000;
    else return message.reply('❌ Süre: 10s, 5m, 2h');
    
    hatirlaticilar.push({ userId: message.author.id, channelId: message.channel.id, mesaj, sure: Date.now() + ms });
    await message.reply(`⏰ **${sure}** sonra hatırlatacağım: "${mesaj}"`);
    
    setTimeout(async () => {
      const h = hatirlaticilar.find(h => h.userId === message.author.id && h.mesaj === mesaj);
      if (h && h.sure <= Date.now()) {
        const channel = client.channels.cache.get(h.channelId);
        if (channel) channel.send(`⏰ **${message.author.username}** hatırlatma: ${mesaj}`);
        hatirlaticilar = hatirlaticilar.filter(h2 => h2 !== h);
      }
    }, ms);
  }
  
  // ========== EKONOMİ KOMUTLARI ==========
  else if (command === 'günlük') {
    if (!ekonomiData.has(message.author.id)) ekonomiData.set(message.author.id, { coin: 0, envanter: [] });
    const data = ekonomiData.get(message.author.id);
    const günlükMiktar = Math.floor(Math.random() * 100) + 50;
    data.coin += günlükMiktar;
    ekonomiData.set(message.author.id, data);
    await message.reply(`💰 Günlük ödülün: **${günlükMiktar}** coin! Toplam: ${data.coin} coin`);
  }
  
  else if (command === 'çal') {
    const hedef = message.mentions.members.first();
    if (!hedef) return message.reply('❌ Çalmak için birini etiketle!');
    if (hedef.id === message.author.id) return message.reply('❌ Kendinden çalamazsın!');
    const hedefData = ekonomiData.get(hedef.id);
    if (!hedefData || hedefData.coin < 10) return message.reply('❌ Bu kişide çalınacak coin yok!');
    const basari = Math.random() < 0.3;
    if (basari) {
      const miktar = Math.min(hedefData.coin, Math.floor(Math.random() * 50) + 10);
      coinCikar(hedef.id, miktar);
      coinEkle(message.author.id, miktar);
      await message.reply(`🦹 **Başarılı!** ${hedef.user.username}'den **${miktar}** coin çaldın!`);
      logGonder(`🦹 **${message.author.username}** ${hedef.user.username}'den ${miktar} coin çaldı`);
    } else {
      const ceza = Math.floor(Math.random() * 30) + 10;
      coinCikar(message.author.id, ceza);
      await message.reply(`😵 **Başarısız!** Yakalandın! **${ceza}** coin ceza ödedin.`);
    }
  }
  
  else if (command === 'market') {
    let marketMsg = '🛒 **Market**\n\n';
    marketUrunleri.forEach(u => {
      marketMsg += `**${u.id}.** ${u.ad} - ${u.fiyat} coin\n   ${u.aciklama}\n`;
    });
    marketMsg += '\n!satinal <id> ile satın alabilirsin.';
    await message.reply(marketMsg);
  }
  
  else if (command === 'satinal') {
    const urunId = parseInt(args[0]);
    if (!urunId) return message.reply('❌ Ürün ID gir!');
    const urun = marketUrunleri.find(u => u.id === urunId);
    if (!urun) return message.reply('❌ Geçersiz ürün ID!');
    if (!coinCikar(message.author.id, urun.fiyat)) return message.reply(`❌ Yeterli coinin yok! (${urun.fiyat} coin gerekli)`);
    if (!ekonomiData.has(message.author.id)) ekonomiData.set(message.author.id, { coin: 0, envanter: [] });
    ekonomiData.get(message.author.id).envanter.push(urun.ad);
    await message.reply(`✅ **${urun.ad}** satın aldın! ${urun.fiyat} coin harcandı.`);
  }
  
  else if (command === 'envanter') {
    const data = ekonomiData.get(message.author.id);
    if (!data || !data.envanter.length) return message.reply('📦 Envanterin boş!');
    let envanterMsg = '📦 **Envanterin:**\n';
    data.envanter.forEach((e, i) => {
      envanterMsg += `${i+1}. ${e}\n`;
    });
    await message.reply(envanterMsg);
  }
  
  else if (command === 'kumar') {
    const miktar = parseInt(args[0]);
    if (isNaN(miktar) || miktar < 10) return message.reply('❌ En az 10 coin yatır!');
    if (!coinCikar(message.author.id, miktar)) return message.reply('❌ Yeterli coinin yok!');
    const zar = Math.floor(Math.random() * 6) + 1;
    const kazanma = zar === 6;
    if (kazanma) {
      const kazanc = miktar * 2;
      coinEkle(message.author.id, kazanc);
      await message.reply(`🎲 Zar: **${zar}**\n🎉 **KAZANDIN!** ${kazanc} coin kazandın!`);
    } else {
      await message.reply(`🎲 Zar: **${zar}**\n😭 **KAYBETTİN!** ${miktar} coin kaybettin.`);
    }
  }
  
  else if (command === 'piyango') {
    const miktar = parseInt(args[0]);
    if (isNaN(miktar) || miktar < 10) return message.reply('❌ En az 10 coin yatır!');
    if (!coinCikar(message.author.id, miktar)) return message.reply('❌ Yeterli coinin yok!');
    
    if (!piyangoCekilis.aktif) {
      piyangoCekilis = { aktif: true, havuz: 0, katilimcilar: [] };
    }
    piyangoCekilis.havuz += miktar;
    piyangoCekilis.katilimcilar.push({ userId: message.author.id, miktar });
    await message.reply(`🎟️ Piyango bileti aldın! Toplam havuz: ${piyangoCekilis.havuz} coin`);
    
    if (piyangoCekilis.katilimcilar.length >= 3) {
      const kazanan = piyangoCekilis.katilimcilar[Math.floor(Math.random() * piyangoCekilis.katilimcilar.length)];
      coinEkle(kazanan.userId, piyangoCekilis.havuz);
      await message.channel.send(`🎉 **PİYANGO KAZANANI!** <@${kazanan.userId}> **${piyangoCekilis.havuz}** coin kazandı!`);
      piyangoCekilis = { aktif: false, havuz: 0, katilimcilar: [] };
    }
  }
  
  // ========== SEVİYE KOMUTLARI ==========
  else if (command === 'seviye') {
    const target = message.mentions.users.first() || message.author;
    const data = xpData.get(target.id) || { xp: 0, level: 0 };
    await message.reply(`📈 **${target.username}** - Seviye: **${data.level}** | XP: **${data.xp}**`);
  }
  
  else if (command === 'liderlik') {
    const sirali = Array.from(xpData.entries()).sort((a, b) => b[1].xp - a[1].xp).slice(0, 10);
    let leaderboard = '🏆 **Liderlik Tablosu**\n\n';
    for (let i = 0; i < sirali.length; i++) {
      const user = await client.users.fetch(sirali[i][0]).catch(() => null);
      if (user) leaderboard += `${i+1}. ${user.username} - Seviye ${sirali[i][1].level}\n`;
    }
    await message.reply(leaderboard);
  }
  
  // ========== SESLİ KOMUTLAR ==========
  else if (command === 'sesligel') {
    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) return message.reply('❌ Bir ses kanalına gir!');
    const { joinVoiceChannel } = require('@jubbio/voice');
    joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: message.guild.id,
      adapterCreator: message.guild.voiceAdapterCreator
    });
    await message.reply(`✅ **${voiceChannel.name}** kanalına katıldım!`);
  }
  
  else if (command === 'seslicik') {
    const { getVoiceConnection } = require('@jubbio/voice');
    const connection = getVoiceConnection(message.guild.id);
    if (!connection) return message.reply('❌ Zaten kanalda değilim!');
    connection.destroy();
    await message.reply('👋 Kanal terk edildi!');
  }
  
  else if (command === 'sesli-katil') {
    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Kullanıcı etiketle!');
    const voiceChannel = target.voice?.channel;
    if (!voiceChannel) return message.reply('❌ Bu kullanıcı ses kanalında değil!');
    const { joinVoiceChannel } = require('@jubbio/voice');
    joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: message.guild.id,
      adapterCreator: message.guild.voiceAdapterCreator
    });
    await message.reply(`✅ **${target.user.username}**'ın ses kanalına katıldım!`);
  }
  
  // ========== YAPAY ZEKA KOMUTLARI ==========
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
  
  else if (command === 'sohbet') {
    if (aiSohbetModu.has(message.author.id)) {
      aiSohbetModu.delete(message.author.id);
      await message.reply('👋 Sohbet modundan çıkıldı.');
    } else {
      aiSohbetModu.set(message.author.id, true);
      await message.reply('💬 Sohbet moduna girildi. !cik yazarak çıkabilirsin.');
    }
  }
  
  else if (command === 'resim') {
    const aciklama = args.join(' ');
    if (!aciklama) return message.reply('❌ Resim açıklaması yaz! Örnek: !resim kedi');
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
      const result = await model.generateContent(`Çizim yap: ${aciklama}`);
      await message.reply(`🎨 **${aciklama}** için oluşturulan görsel:\n${result.response.text()}`);
    } catch (err) {
      await message.reply('❌ Görsel oluşturulamadı.');
    }
  }
  
  else if (command === 'yorumla') {
    const metin = args.join(' ');
    if (!metin) return message.reply('❌ Yorumlanacak metin yaz!');
    try {
      const result = await aiModel.generateContent(`Şu metni analiz et: Duygu durumu (pozitif/negatif/nötr), anahtar kelimeler, ton. Metin: ${metin}`);
      await message.reply(`📊 **Metin Analizi:**\n${result.response.text()}`);
    } catch (err) {
      await message.reply('❌ Analiz yapılamadı.');
    }
  }
  
  else if (command === 'ozetle') {
    const metin = args.join(' ');
    if (!metin) return message.reply('❌ Özetlenecek metin yaz!');
    try {
      const result = await aiModel.generateContent(`Şu metni özetle (3 cümle): ${metin}`);
      await message.reply(`📝 **Özet:**\n${result.response.text()}`);
    } catch (err) {
      await message.reply('❌ Özet çıkarılamadı.');
    }
  }
  
  else if (command === 'cevir') {
    const hedefDil = args[0];
    const metin = args.slice(1).join(' ');
    if (!hedefDil || !metin) return message.reply('❌ Kullanım: !cevir <dil> <metin>');
    try {
      const result = await aiModel.generateContent(`Şu metni ${hedefDil} diline çevir: ${metin}`);
      await message.reply(`🌐 **${hedefDil}:** ${result.response.text()}`);
    } catch (err) {
      await message.reply('❌ Çeviri yapılamadı.');
    }
  }
  
  // ========== BOT AYARLARI ==========
  else if (command === 'prefix') {
    if (!yetkiliMi(message.member)) return message.reply('❌ Yetkin yok!');
    const yeniPrefix = args[0];
    if (!yeniPrefix) return message.reply('❌ Yeni prefix gir!');
    botPrefix = yeniPrefix;
    await message.reply(`✅ Prefix **${yeniPrefix}** olarak değiştirildi!`);
  }
  
  else if (command === 'logkanal') {
    if (!yetkiliMi(message.member)) return message.reply('❌ Yetkin yok!');
    const kanal = message.mentions.channels.first();
    if (!kanal) return message.reply('❌ Kanal etiketle!');
    logKanal = kanal.id;
    await message.reply(`✅ Log kanalı **${kanal.name}** olarak ayarlandı!`);
  }
  
  else if (command === 'kufurlistesi') {
    if (!yetkiliMi(message.member)) return message.reply('❌ Yetkin yok!');
    let list = '📝 **Küfür Listesi:**\n';
    kufurListesi.forEach(k => list += `- ${k}\n`);
    await message.reply(list);
  }
});

// ========== BOTU BAŞLAT ==========
client.login(BOT_TOKEN).catch(err => console.error('❌ Bot başlatılamadı:', err.message));
