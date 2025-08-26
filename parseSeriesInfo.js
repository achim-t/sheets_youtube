function parseSeriesInfo(title) {
  if (!title) return { series: "", episode: "", rest: "" };

  // Helper to normalize series and strip a leading 'Minecraft' prefix if followed by more text
  const normalizeSeries = (s) => {
    let series = (s || "").trim();
    series = series.replace(/[\-:\s]+$/g, "").trim();
    if (/^Minecraft\b/i.test(series)) {
      const after = series.replace(/^Minecraft\b/i, "").trim();
      if (after) {
        series = after.replace(/^[\-–—:|\s]+/g, "").trim();
      }
    }
    return series;
  };

  // Helper to protect date-like strings from auto-conversion in Google Sheets
  const protectDateLike = (s) => {
    let rest = (s || "").trim();
    if (!rest) return rest;
    if (rest.startsWith("'")) return rest; // already protected
    const dmy = /^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}$/; // 1/1/03, 01-01-2003, 1.1.03
    const ymd = /^\d{4}[\/.\-]\d{1,2}[\/.\-]\d{1,2}$/; // 2003-01-01
    if (dmy.test(rest) || ymd.test(rest)) {
      return "'" + rest;
    }
    return rest;
  };

  // Try common episode tokens: #N, Episode N, Ep. N / Ep N
  const patterns = [
    /\bS(\d+)\s*E(\d+)/i,   // S3E01, S03 E1 -> capture season and episode
  /\bDay\s*0*(\d+)\b/i,   // Day 001 -> capture episode number
    /#(\d+)/i,
    /\bEpisode\s*(\d+)/i,
    /\bEp\.?\s*(\d+)/i
  ];

  let match = null;
  for (const re of patterns) {
    const m = re.exec(title);
    if (m) { match = { re, m }; break; }
  }

  if (!match) {
    // No episode token found: try to split into series and rest.
    // 1) Prefer the last ':' as a title/subtitle separator.
    const lastColon = title.lastIndexOf(":");
    if (lastColon > 0 && lastColon < title.length - 1) {
      let series = title.slice(0, lastColon).trim();
      series = normalizeSeries(series);
  const rest = protectDateLike(title.slice(lastColon + 1).trim());
      return { series, episode: "", rest };
    }

    // 2) Otherwise split on the last dash (hyphen/en-dash/em-dash)
    const dashChars = ["-", "–", "—"];
    let bestIdx = -1;
    for (const ch of dashChars) {
      const idx = title.lastIndexOf(ch);
      if (idx > bestIdx) bestIdx = idx;
    }
    if (bestIdx > 0 && bestIdx < title.length - 1) {
      let series = title.slice(0, bestIdx).trim();
      series = normalizeSeries(series);
  const rest = protectDateLike(title.slice(bestIdx + 1).trim());
      return { series, episode: "", rest };
    }

    // Otherwise: whole title is the series
    return { series: normalizeSeries(title), episode: "", rest: "" };
  }

  const { m } = match;
  let episode;
  if (m.length >= 3) {
    // SxEy form: season in m[1], episode in m[2]
    const seasonNum = parseInt(m[1], 10) || 0;
    const epNum = parseInt(m[2], 10) || 0;
    episode = String(seasonNum * 100 + epNum);
  } else {
    episode = m[1];
  }

  // Series: everything before the token, trim trailing separators like '-' or ':'
  let series = title.slice(0, m.index).trim();
  series = normalizeSeries(series);

  // Rest: everything after the token, trim leading separators like '-', ':', '.'
  let rest = title.slice(m.index + m[0].length);
  rest = rest.replace(/^[\s:.,\-–—]+/g, "").trim();
  rest = protectDateLike(rest);

  return { series, episode, rest };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = parseSeriesInfo;
}