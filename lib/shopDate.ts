const DEFAULT_TIME_ZONE = 'Africa/Addis_Ababa';

export function getShopTimeZone(): string {
  return process.env.SHOP_TIMEZONE || DEFAULT_TIME_ZONE;
}

export function getShopDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: getShopTimeZone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}