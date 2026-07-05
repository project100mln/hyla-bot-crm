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
    return null;
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

    const body = await res.json().catch(() => null);

    if (!res.ok) {
      console.error(
        `[supabase-sync] Не удалось сохранить лида в PURE-HOME OS (${res.status}):`,
        body
      );
      return null;
    }

    console.log("[supabase-sync] Лид продублирован в PURE-HOME OS (hyla_leads)");
    return body && body.id ? body.id : null;
  } catch (error) {
    console.error(
      "[supabase-sync] Ошибка сети при синхронизации с PURE-HOME OS:",
      error.message
    );
    return null;
  }
}

// Меняет статус лида в hyla_leads прямо из Telegram (кнопки под карточкой),
// без захода в CRM. leadId — это id строки в hyla_leads, полученный из
// syncLeadToHylaLeads при создании лида.
async function updateHylaLeadStatus(leadId, status) {
  const url = process.env.SUPABASE_URL;
  const sharedSecret = process.env.HYLA_BOT_SHARED_SECRET;

  if (!url || !sharedSecret || !leadId) {
    console.warn(
      "[supabase-sync] Не могу обновить статус — нет SUPABASE_URL/секрета/leadId."
    );
    return false;
  }

  try {
    const res = await fetch(`${url}/functions/v1/hyla-bot-update-status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hyla-bot-secret": sharedSecret,
      },
      body: JSON.stringify({ lead_id: leadId, status }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(
        `[supabase-sync] Не удалось обновить статус лида (${res.status}): ${text}`
      );
      return false;
    }

    console.log(`[supabase-sync] Статус лида ${leadId} обновлён на "${status}"`);
    return true;
  } catch (error) {
    console.error(
      "[supabase-sync] Ошибка сети при обновлении статуса:",
      error.message
    );
    return false;
  }
}

module.exports = { syncLeadToHylaLeads, updateHylaLeadStatus };
