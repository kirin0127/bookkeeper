export const palette = {
  '食物': { color: '#E58A2B', tint: '#FFF3E4', ink: '#9A4D08', glyph: '食' },
  '飲品': { color: '#35A9C7', tint: '#EAF8FC', ink: '#11657C', glyph: '飲' },
  '交通': { color: '#5C86D6', tint: '#EDF3FF', ink: '#315BA3', glyph: '行' },
  '消費': { color: '#D66D9F', tint: '#FCEEF5', ink: '#963B68', glyph: '購' },
  '娛樂': { color: '#9B7BD4', tint: '#F4EEFC', ink: '#68459F', glyph: '樂' },
  '3C': { color: '#526A82', tint: '#EDF2F7', ink: '#354B60', glyph: '3C' },
  '醫藥': { color: '#58A77B', tint: '#EBF7EF', ink: '#286D4A', glyph: '醫' },
  '其他': { color: '#94A0AC', tint: '#F1F4F6', ink: '#53616E', glyph: '其' },
};
export const categoryColor = name => palette[name] || palette['其他'];
export function categoryStyle(name) {
  const color = categoryColor(name);
  return { '--cat-color': color.color, '--cat-tint': color.tint, '--cat-ink': color.ink };
}
