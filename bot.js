require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require('openai');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.RENDER_EXTERNAL_URL;

const bot = new TelegramBot(TOKEN);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Modus pro User: 'text' (Standard) oder 'sprache'
const userModes = new Map();

const app = express();
app.use(express.json());

app.post(`/bot${TOKEN}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

app.get('/', (req, res) => {
    res.send('Bot läuft!');
});

app.listen(PORT, async () => {
    console.log(`Server läuft auf Port ${PORT}`);
    if (WEBHOOK_URL) {
        await bot.setWebHook(`${WEBHOOK_URL}/bot${TOKEN}`);
        console.log(`Webhook gesetzt: ${WEBHOOK_URL}/bot${TOKEN}`);
    }
});

function splitText(text, maxLength = 4000) {
    if (text.length <= maxLength) return [text];
    const chunks = [];
    let remaining = text;
    while (remaining.length > maxLength) {
        let splitAt = remaining.lastIndexOf('. ', maxLength);
        if (splitAt === -1) splitAt = remaining.lastIndexOf('\n', maxLength);
        if (splitAt === -1) splitAt = maxLength;
        chunks.push(remaining.slice(0, splitAt + 1).trim());
        remaining = remaining.slice(splitAt + 1).trim();
    }
    if (remaining.length > 0) chunks.push(remaining);
    return chunks;
}

async function sprecheText(chatId, text) {
    const chunks = splitText(text);
    for (const chunk of chunks) {
        const response = await openai.audio.speech.create({
            model: 'tts-1',
            voice: 'nova',
            input: chunk,
            response_format: 'opus',
        });
        const buffer = Buffer.from(await response.arrayBuffer());
        await bot.sendVoice(chatId, buffer);
    }
}

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id,
        'Hallo! Ich bin dein KI-Assistent.\n\n' +
        'Befehle:\n' +
        '/text — Antworten als Text (Standard)\n' +
        '/sprache — Antworten als Sprachnachricht\n' +
        '/vorlesen <Text> — Text vorlesen lassen\n\n' +
        'Stell mir einfach eine Frage!'
    );
});

bot.onText(/\/text/, (msg) => {
    userModes.set(msg.chat.id, 'text');
    bot.sendMessage(msg.chat.id, 'Modus: Text ✓');
});

bot.onText(/\/sprache/, (msg) => {
    userModes.set(msg.chat.id, 'sprache');
    bot.sendMessage(msg.chat.id, 'Modus: Sprache ✓ — ich antworte jetzt mit Sprachnachrichten.');
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text) return;

    // /vorlesen <Text>
    if (text.startsWith('/vorlesen')) {
        const inhalt = text.replace('/vorlesen', '').trim();
        if (!inhalt) {
            bot.sendMessage(chatId, 'Bitte Text nach /vorlesen angeben.\nBeispiel: /vorlesen Hallo Welt!');
            return;
        }
        try {
            bot.sendChatAction(chatId, 'record_voice');
            await sprecheText(chatId, inhalt);
        } catch (error) {
            console.error('TTS-Fehler:', error.message);
            bot.sendMessage(chatId, 'Fehler beim Vorlesen. Bitte erneut versuchen.');
        }
        return;
    }

    if (text.startsWith('/')) return;

    const modus = userModes.get(chatId) || 'text';

    try {
        bot.sendChatAction(chatId, modus === 'sprache' ? 'record_voice' : 'typing');

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: text }],
        });

        const reply = response.choices[0].message.content;

        if (modus === 'sprache') {
            await sprecheText(chatId, reply);
        } else {
            bot.sendMessage(chatId, reply);
        }
    } catch (error) {
        console.error('Fehler:', error.message);
        bot.sendMessage(chatId, 'Es ist ein Fehler aufgetreten. Bitte versuche es erneut.');
    }
});
