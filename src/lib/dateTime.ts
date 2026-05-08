function padDatePart(value: number): string {
  return value.toString().padStart(2, "0");
}

export function formatSlashTimestampWithSeconds(date: Date): string {
  const day = [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join("/");
  const time = [
    padDatePart(date.getHours()),
    padDatePart(date.getMinutes()),
    padDatePart(date.getSeconds()),
  ].join(":");

  return `${day} ${time}`;
}

export function formatDashedTimestampWithMinutes(date: Date): string {
  const day = [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join("-");
  const time = [padDatePart(date.getHours()), padDatePart(date.getMinutes())].join(":");

  return `${day} ${time}`;
}

export function formatCompactTimestamp(date: Date): string {
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
    "-",
    padDatePart(date.getHours()),
    padDatePart(date.getMinutes()),
    padDatePart(date.getSeconds()),
  ].join("");
}
