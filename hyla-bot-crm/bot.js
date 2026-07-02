const TelegramBot = require("node-telegram-bot-api");
const { pool } = require("./db");

const sessions = new Map();

const PRIORITIES = [
  { id: "family", text: "Чистота для семьи и детей" },
  { id: "allergens", text: "Меньше пыли и аллергенов" },
  { id: "sleep", text: "Чистые матрасы и подушки" },
  { id: "carpets", text: "Глубокая очистка ковров" },
  { id: "freshness", text: "Свежесть в доме как после дождя" },
  { id: "all", text: "Всё перечисленное" },
];

const ZONES = [
  { id: "mattress", text: "В матрасах и подушках" },
  { id: "sofa", text: "В диване и мягкой мебели" },
  { id: "carpet", text: "В коврах" },
  { id: "textile", text: "В шторах и текстиле" },
  { id: "several", text: "Сразу в нескольких местах" },
  { id: "unknown", text: "Не знаю, хочу проверить" },
];

const RESULTS = [
  { id: "see_dust", text: "Увидеть скрытую пыль" },
  { id: "clean_sleep", text: "Сделать спальные места чище" },
  { id: "less_dust", text: "Уменьшить количество пыли дома" },
  { id: "deep_clean", text: "Глубоко очистить ковры и мебель" },
  { id: "fresh_home", text: "Почувствовать чистоту и свежесть" },
  { id: "all_features", text: "Узнать все возможности HYLA" },
];

function optionText(options, id) {
  return options.find((item) => item.id === id)?.text || id;
}

function oneButtonPerRow(options, prefix) {
  return options.map((item) => [
    { text: item.text, callback_data: `${prefix}:${item.id}` },
  ]);
}

async function closeOldButtons(bot, query) {
  await bot.answerCallbackQuery(query.id).catch(() => {});
  await bot
    .editMessageReplyMarkup(
      { inline_keyboard: [] },
      {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
      }
    )
    .catch(() => {});
}

function startBot() {
  const token = process.env.BOT_TOKEN;

  if (!token) {
    console.warn(
      "[bot] BOT_TOKEN не задан — бот не запущен. Добавьте токен в переменные окружения."
    );
    return null;
  }

  const bot = new TelegramBot(token, { polling: true });
  const ownerChatId = process.env.OWNER_CHAT_ID;

  bot.onText(/\/start(.*)/, (msg, match) => {
    const chatId = msg.chat.id;
    const rawParam = (match && match[1] ? match[1].trim() : "") || "";
    const source = rawParam ? `ad:${rawParam}` : "telegram_organic";

    sessions.set(chatId, {
      step: "intro",
      data: {
        source,
        username: msg.from?.username || "",
      },
    });

    return bot.sendMessage(
      chatId,
      "👋 Что скрывается в вашем доме после обычной уборки?\n\n" +
        "Пыль может оставаться внутри матрасов, подушек, ковров и мягкой мебели, даже если всё выглядит чисто.\n\n" +
        "Ответьте на 3 коротких вопроса и узнайте, чему стоит уделить внимание именно у вас дома.",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔎 Узнать результат", callback_data: "begin" }],
          ],
        },
      }
    );
  });

  bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const session = sessions.get(chatId);

    await closeOldButtons(bot, query);

    if (!session) {
      return bot.sendMessage(
        chatId,
        "Сессия завершилась. Нажмите /start, чтобы пройти проверку заново."
      );
    }

    if (data === "begin") {
      session.step = "priority";
      sessions.set(chatId, session);

      return bot.sendMessage(
        chatId,
        "1 из 3. Что для вас важнее всего в домашней чистоте?",
        {
          reply_markup: {
            inline_keyboard: oneButtonPerRow(PRIORITIES, "priority"),
          },
        }
      );
    }

    if (data.startsWith("priority:")) {
      const id = data.split(":")[1];
      session.data.priority = optionText(PRIORITIES, id);
      session.step = "zone";
      sessions.set(chatId, session);

      return bot.sendMessage(
        chatId,
        "2 из 3. Где чаще всего может скапливаться скрытая пыль у вас дома?",
        {
          reply_markup: {
            inline_keyboard: oneButtonPerRow(ZONES, "zone"),
          },
        }
      );
    }

    if (data.startsWith("zone:")) {
      const id = data.split(":")[1];
      session.data.zone = optionText(ZONES, id);
      session.step = "result";
      sessions.set(chatId, session);

      return bot.sendMessage(
        chatId,
        "3 из 3. Какой результат вы хотели бы получить?",
        {
          reply_markup: {
            inline_keyboard: oneButtonPerRow(RESULTS, "result"),
          },
        }
      );
    }

    if (data.startsWith("result:")) {
      const id = data.split(":")[1];
      session.data.desiredResult = optionText(RESULTS, id);
      session.step = "quiz_result";
      sessions.set(chatId, session);

      return bot.sendMessage(
        chatId,
        "✅ Ваша проверка завершена\n\n" +
          `Для вас особенно важно: ${session.data.priority}.\n` +
          `В первую очередь стоит проверить: ${session.data.zone.toLowerCase()}.\n` +
          `Желаемый результат: ${session.data.desiredResult.toLowerCase()}.\n\n` +
          "HYLA использует воду для связывания собранной пыли и загрязнений. После работы в комнате может ощущаться чистота и свежесть, которую часто сравнивают со свежестью после дождя.\n\n" +
          "Хотите увидеть, что может оставаться именно в вашем доме?",
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "✅ Да, хочу проверить",
                  callback_data: "demo_offer",
                },
              ],
              [
                {
                  text: "ℹ️ Сначала узнать о HYLA",
                  callback_data: "about_hyla",
                },
              ],
            ],
          },
        }
      );
    }

    if (data === "about_hyla") {
      session.step = "about";
      sessions.set(chatId, session);

      return bot.sendMessage(
        chatId,
        "HYLA — система глубокой уборки и очистки воздуха через воду.\n\n" +
          "Она помогает:\n" +
          "✓ очищать матрасы, подушки и мягкую мебель;\n" +
          "✓ глубоко очищать ковры;\n" +
          "✓ собирать пыль без одноразовых мешков;\n" +
          "✓ связывать собранные загрязнения водой;\n" +
          "✓ освежать воздух в помещении;\n" +
          "✓ выполнять несколько видов уборки одним аппаратом.",
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🎁 Проверить HYLA у себя дома",
                  callback_data: "demo_offer",
                },
              ],
            ],
          },
        }
      );
    }

    if (data === "demo_offer") {
      session.step = "demo_offer";
      sessions.set(chatId, session);

      return bot.sendMessage(
        chatId,
        "🎁 Бесплатная демонстрация HYLA у вас дома\n\n" +
          "Специалист покажет:\n" +
          "— очистку выбранных вами поверхностей;\n" +
          "— работу водной системы;\n" +
          "— результат после уборки;\n" +
          "— дополнительные возможности аппарата.\n\n" +
          "Демонстрация бесплатная и не обязывает к покупке.",
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "📝 Записаться бесплатно",
                  callback_data: "signup",
                },
              ],
            ],
          },
        }
      );
    }

    if (data === "signup") {
      session.step = "name";
      sessions.set(chatId, session);
      return bot.sendMessage(chatId, "Как к вам обращаться?");
    }
  });

  async function saveLead(chatId, session) {
    const lead = session.data;
    lead.telegram_chat_id = String(chatId);

    try {
      await pool.query(
        `INSERT INTO leads
          (name, phone, city, source, pain, pets, housing, notes, stage, telegram_chat_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'new', $9)`,
        [
          lead.name,
          lead.phone,
          lead.city,
          lead.source,
          lead.priority,
          false,
          lead.zone,
          `Желаемый результат: ${lead.desiredResult}`,
          lead.telegram_chat_id,
        ]
      );
    } catch (error) {
      console.error("[bot] ошибка сохранения лида:", error.message);
      await bot.sendMessage(
        chatId,
        "Не удалось сохранить заявку. Попробуйте ещё раз позже или нажмите /start."
      );
      return;
    }

    sessions.delete(chatId);

    await bot.sendMessage(
      chatId,
      `✅ Спасибо, ${lead.name}! Ваша заявка принята.\n\n` +
        `Мы свяжемся с вами по номеру ${lead.phone}.\n` +
        `Город: ${lead.city}.\n\n` +
        "Специалист уточнит удобное время бесплатной демонстрации HYLA.",
      { reply_markup: { remove_keyboard: true } }
    );

    if (ownerChatId) {
      await bot
        .sendMessage(
          ownerChatId,
          "🔥 Новая заявка HYLA\n\n" +
            `Имя: ${lead.name}\n` +
            `Телефон: ${lead.phone}\n` +
            `Город: ${lead.city}\n` +
            `Что важно: ${lead.priority}\n` +
            `Зона: ${lead.zone}\n` +
            `Желаемый результат: ${lead.desiredResult}\n` +
            `Источник: ${lead.source}\n` +
            (lead.username ? `Telegram: @${lead.username}` : "")
        )
        .catch((error) =>
          console.error("[bot] ошибка уведомления владельца:", error.message)
        );
    }
  }

  bot.on("message", async (msg) => {
    if (msg.text && msg.text.startsWith("/")) return;

    const chatId = msg.chat.id;
    const session = sessions.get(chatId);
    if (!session) return;

    if (session.step === "name") {
      const name = (msg.text || "").trim();
      if (!name) {
        return bot.sendMessage(chatId, "Напишите, пожалуйста, ваше имя.");
      }

      session.data.name = name;
      session.step = "phone";
      sessions.set(chatId, session);

      return bot.sendMessage(
        chatId,
        `Приятно познакомиться, ${name}!\n\n` +
          "Нажмите кнопку ниже, чтобы отправить номер телефона, или введите его вручную.",
        {
          reply_markup: {
            keyboard: [
              [
                {
                  text: "📱 Отправить номер телефона",
                  request_contact: true,
                },
              ],
            ],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }
      );
    }

    if (session.step === "phone") {
      const phone = msg.contact?.phone_number || (msg.text || "").trim();
      if (!phone) {
        return bot.sendMessage(
          chatId,
          "Отправьте номер кнопкой ниже или введите его вручную."
        );
      }

      session.data.phone = phone;
      session.step = "city_choice";
      sessions.set(chatId, session);

      return bot.sendMessage(chatId, "В каком городе вы находитесь?", {
        reply_markup: {
          keyboard: [["Шымкент"], ["Другой город"]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
    }

    if (session.step === "city_choice") {
      const cityChoice = (msg.text || "").trim();
      if (!cityChoice) {
        return bot.sendMessage(chatId, "Выберите город или напишите его название.");
      }

      if (cityChoice === "Другой город") {
        session.step = "city_manual";
        sessions.set(chatId, session);
        return bot.sendMessage(chatId, "Напишите название вашего города.", {
          reply_markup: { remove_keyboard: true },
        });
      }

      session.data.city = cityChoice;
      return saveLead(chatId, session);
    }

    if (session.step === "city_manual") {
      const city = (msg.text || "").trim();
      if (!city) {
        return bot.sendMessage(chatId, "Напишите название вашего города.");
      }

      session.data.city = city;
      return saveLead(chatId, session);
    }
  });

  console.log("[bot] Telegram-бот HYLA запущен (polling)");
  return bot;
}

module.exports = { startBot };
