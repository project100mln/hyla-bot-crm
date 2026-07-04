// Дублирует лида в CRM PURE-HOME OS (таблица hyla_leads в Supabase), в
// дополнение к основной записи в Postgres на Railway. Если эта запись не
// удастся (нет переменных окружения, сеть недоступна и т.п.) — бот и основная
// мини-CRM на /public продолжают работать как обычно, ошибка только логируется.

const PRIORITY_CARPETS = "Глубокая очистка ковров";
const PRIORITY_ALLERGENS = "Меньше пыли и аллергенов";
const PRIORITY_FRESHNESS = "Свежесть в доме как после дождя";
const PRIORITY_FAMILY = "Чистота для семьи и детей";

const ZONE_CARPET = "В коврах";
const ZONE_MATTRESS = "В матрасах и подушках";

const RESULT_FRESH_HOME = "Почувствовать чистоту и свежесть";

// Маппинг ответов квиза бота (3 вопроса: важно / зона / результат) на поля
// таблицы hyla_leads (7 да/нет полей). Бот не спрашивает про животных и
// запахи — эти два поля намеренно оставляем null, а не придумываем ответ.
function mapToHylaLeads(lead) {
  const priority = lead.priority || "";
  const zone = lead.zone || "";
  const desiredResult = lead.desiredResult || "";

  return {
    full_name: lead.name,
    phone: lead.phone,
    city: lead.city,
    district: null,
    utm_source: lead.source || null,
    has_carpets: zone === ZONE_CARPET || priority === PRIORITY_CARPETS,
    has_mattresses: zone === ZONE_MATTRESS,
    has_allergy: priority === PRIORITY_ALLERGENS,
    air_quality_interest:
      priority === PRIORITY_FRESHNESS || desiredResult === RESULT_FRESH_HOME,
    has_children: priority === PRIORITY_FAMILY,
    has_pets: null,
    has_odors: null,
    comment:
      "Квиз-бот HYLA:\n" +
      `Важно: ${priority || "—"}\n` +
      `Зона: ${zone || "—"}\n` +
      `Желаемый результат: ${desiredResult || "—"}`,
  };
}

async function syncLeadToHylaLeads(lead) {
  const url = process.env.SUPABASE_URL;
  const sharedSecret = process.env.HYLA_BOT_SHARED_SECRET;

  if (!url || !sharedSecret) {
    console.warn(
      "[supabase-sync] SUPABASE_URL / HYLA_BOT_SHARED_SECRET не заданы — " +
        "лид сохранён только в Railway-базе, в PURE-HOME OS он не появится."
    );
    return;
  }

  const payload = mapToHylaLeads(lead);

  try {
    const res = await fetch(`${url}/functions/v1/hyla-bot-intake`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hyla-bot-secret": sharedSecret,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(
        `[supabase-sync] Не удалось сохранить лида в PURE-HOME OS (${res.status}): ${text}`
      );
    } else {
      console.log("[supabase-sync] Лид продублирован в PURE-HOME OS (hyla_leads)");
    }
  } catch (error) {
    console.error(
      "[supabase-sync] Ошибка сети при синхронизации с PURE-HOME OS:",
      error.message
    );
  }
}

module.exports = { syncLeadToHylaLeads };
