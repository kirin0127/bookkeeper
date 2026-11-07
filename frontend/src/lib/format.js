export const TIME_ZONE = 'Asia/Taipei';
export const pad = value => String(value).padStart(2, '0');
export const money = value => 'NT$ ' + value.toLocaleString('zh-TW');
export const sum = records => records.reduce((total, record) => total + record.amount, 0);
export function dayKey(timestamp = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(timestamp);
  const part = type => parts.find(item => item.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export const timeText = timestamp => new Intl.DateTimeFormat('zh-TW', {
  timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false,
}).format(timestamp);
export function shiftDay(day, step) {
  const date = new Date(`${day}T12:00:00+08:00`);
  date.setUTCDate(date.getUTCDate() + step);
  return dayKey(date);
}
export const dayStart = day => Date.parse(`${day}T00:00:00+08:00`);
export const dayRange = day => [dayStart(day), dayStart(shiftDay(day, 1))];
export function periodRange(year, month, scale) {
  const firstMonth = scale === 'year' ? 1 : month;
  const nextYear = scale === 'year' || month === 12 ? year + 1 : year;
  const nextMonth = scale === 'year' || month === 12 ? 1 : month + 1;
  return [dayStart(`${year}-${pad(firstMonth)}-01`), dayStart(`${nextYear}-${pad(nextMonth)}-01`)];
}
export function prettyDate(day) {
  const [year, month, date] = day.split('-').map(Number);
  return `${year}年${month}月${date}日`;
}
export const weekday = day => new Intl.DateTimeFormat('zh-TW', {
  timeZone: TIME_ZONE, weekday: 'long',
}).format(new Date(`${day}T12:00:00+08:00`));
export function recordedTime(day) {
  // Today uses the actual time; a historical entry has no time input, so use noon.
  return day === dayKey() ? Date.now() : Date.parse(`${day}T12:00:00+08:00`);
}
