function parseSeriesInfo(title) {
  var seriesMatch = title.match(/^(.*?)(?:\s*#\d+|\s*Episode\s*\d+)/);
  var series = seriesMatch ? seriesMatch[1].trim() : title;
  series = series.replace(/[-\s]+$/," ").trim();

  var epMatch = title.match(/#(\d+)/);
  if (!epMatch) epMatch = title.match(/Episode\s*(\d+)/);
  var episode = epMatch ? epMatch[1] : "";

  var rest = title.replace(/^(.*?)(?:\s*(?:#|Episode)\s*\d+[:\-]?\s*)/, "").trim();
  rest = rest.replace(/^-\s*/, "");

  // Korrigiere: Wenn keine Episode gefunden wurde, ist rest leer
  if (!epMatch) rest = "";

  return { series: series, episode: episode, rest: rest };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = parseSeriesInfo;
}