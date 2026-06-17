require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require('openai');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.RENDER_EXTERNAL_URL; // wird von Render automatisch gesetzt

const bot = new TelegramBot(TOKEN);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
    } else {
        console.log('Kein RENDER_EXTERNAL_URL gesetzt — Webhook nicht registriert (lokal?)');
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text) return;

    if (text === '/start') {
        bot.sendMessage(chatId, 'Hallo! Ich bin dein KI-Assistent. Stell mir eine Frage!');
        return;
    }

    try {
        bot.sendChatAction(chatId, 'typing');

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: text }],
        });

        const reply = response.choices[0].message.content;
        bot.sendMessage(chatId, reply);
    } catch (error) {
        console.error('Fehler:', error.message);
        bot.sendMessage(chatId, 'Es ist ein Fehler aufgetreten. Bitte versuche es erneut.');
    }
});
