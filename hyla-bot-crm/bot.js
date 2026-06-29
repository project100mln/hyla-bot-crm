const TelegramBot = require("node-telegram-bot-api");
const { pool, scoreOf } = require("./db");

const PAIN_POINTS = ["Аллергия", "Шерсть животных", "Пыль и запахи", "Просто интересно"];
const HOUSING = ["Квартира", "Дом"];

// Простое хранение состояния диалога в памяти. Для MVP этого достаточно —
// если бот перезапустится, незавершённые диалоги начнутся заново.
const sessions = new Map();

function startBot() {
  const token = process.env.BOT_TOKEN;
  if (!token) {
    console.warn("[bot] BOT_TOKEN не задан — бот не запущен. Добавь токен в переменные окружения.");
    return null;
  }

  const bot = new TelegramBot(token, { polling: true });
  const ownerChatId = process.env.OWNER_CHAT_ID; // куда слать уведомления о горячих лидах

  bot.onText(/\/start(.*)/, (msg, match) => {
    const chatId = msg.chat.id;
    // Параметр после /start — это метка источника, например "meta_petowners"
    // или "meta_parents". Telegram передаёт её, если ссылка была
    // t.me/your_bot?start=meta_petowners — так мы узнаём, с какой именно
    // рекламы/аудитории пришёл лид, и видим это прямо в CRM.
    const rawParam = (match && match[1] ? match[1].trim() : "") || "";
    const source = rawParam ? `ad:${rawParam}` : "telegram_organic";
    sessions.set(chatId, { step: "intro", data: { source } });
    bot.sendMessage(
      chatId,
      "👋 Узнайте, как HYLA очищает воздух и избавляет от аллергии, шерсти и пыли — бесплатная демонстрация прямо у вас дома.",
      {
        reply_markup: {
          inline_keyboard: [[{ text: "Хочу узнать больше", callback_data: "begin" }]],
        },
      }
    );
  });

  bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const session = sessions.get(chatId) || { step: "intro", data: {} };

    if (data === "begin") {
      session.step = "pain";
      sessions.set(chatId, session);
      return bot.sendMessage(chatId, "Что больше всего беспокоит?", {
        reply_markup: {
          inline_keyboard: PAIN_POINTS.map((p) => [{ text: p, callback_data: `pain:${p}` }]),
        },
      });
    }

    if (data.startsWith("pain:")) {
      session.data.pain = data.split(":")[1];
      session.step = "pets";
      sessions.set(chatId, session);
      return bot.sendMessage(chatId, "Есть домашние животные?", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Да", callback_data: "pets:yes" }, { text: "Нет", callback_data: "pets:no" }],
          ],
        },
      });
    }

    if (data.startsWith("pets:")) {
      session.data.pets = data.endsWith("yes");
      session.step = "housing";
      sessions.set(chatId, session);
      return bot.sendMessage(chatId, "Какой тип жилья?", {
        reply_markup: {
          inline_keyboard: HOUSING.map((h) => [{ text: h, callback_data: `housing:${h}` }]),
        },
      });
    }

    if (data.startsWith("housing:")) {
      session.data.housing = data.split(":")[1];
      session.step = "name";
      sessions.set(chatId, session);
      return bot.sendMessage(chatId, "Отлично! Как вас зовут?");
    }
  });

  bot.on("message", async (msg) => {
    if (!msg.text || msg.text.startsWith("/")) return;
    const chatId = msg.chat.id;
    const session = sessions.get(chatId);
    if (!session) return;

    if (session.step === "name") {
      session.data.name = msg.text.trim();
      session.step = "phone";
      sessions.set(chatId, session);
      return bot.sendMessage(chatId, "Оставьте номер телефона для записи на демонстрацию:");
    }

    if (session.step === "phone") {
      session.data.phone = msg.text.trim();
      session.step = "city";
      sessions.set(chatId, session);
      return bot.sendMessage(chatId, "В каком городе вы находитесь?");
    }

    if (session.step === "city") {
      session.data.city = msg.text.trim();
      // source уже выставлен при /start (ad:meta_xxx или telegram_organic)
      session.data.telegram_chat_id = String(chatId);

      const lead = session.data;
      const score = scoreOf(lead);

      try {
        await pool.query(
          `INSERT INTO leads (name, phone, city, source, pain, pets, housing, stage, telegram_chat_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'new', $8)`,
          [lead.name, lead.phone, lead.city, lead.source, lead.pain, lead.pets, lead.housing, lead.telegram_chat_id]
        );
      } catch (e) {
        console.error("[bot] ошибка сохранения лида:", e.message);
        return bot.sendMessage(chatId, "Что-то пошло не так при сохранении заявки. Попробуйте ещё раз позже.");
      }

      sessions.delete(chatId);
      bot.sendMessage(
        chatId,
        `Спасибо, ${lead.name}! Заявка принята — мы свяжемся с вами по номеру ${lead.phone} для записи на бесплатную демонстрацию.`
      );

      if (ownerChatId && score === "hot") {
        bot.sendMessage(
          ownerChatId,
          `🔥 Горячий лид!\nИмя: ${lead.name}\nТелефон: ${lead.phone}\nГород: ${lead.city}\nБеспокоит: ${lead.pain}\nЖивотные: ${lead.pets ? "да" : "нет"}`
        );
      }
    }
  });

  console.log("[bot] Telegram-бот запущен (polling)");
  return bot;
}

module.exports = { startBot };
