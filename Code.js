// Feste Tabellen-Layout-Konstanten
var HEADER_ROW = 3;
var HEADERS = [
  "Titel",
  "Serie",
  "Episodennummer",
  "Episodentitel",
  "Video-ID",
  "Link",
  "Upload-Datum",
  "Views",
  "Dauer"
];
var FIRST_DATA_ROW = HEADER_ROW + 1;
var UPLOAD_DATE_COL = HEADERS.indexOf('Upload-Datum') + 1; // muss >0 sein
// Vorab kompilierter Regex für RFC3339/ISO-8601 Datumsstrings
var RFC3339_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+\-]\d{2}:\d{2})$/;

// Cache-Helpers: neuestes Upload-Datum (ISO-String) pro Tabellenblatt speichern
function _sheetCacheKey(sheet) {
  return 'lastUploadDate:' + sheet.getSheetId();
}

function _getCachedNewestDate(sheet) {
  var props = PropertiesService.getDocumentProperties();
  var key = _sheetCacheKey(sheet);
  var val = props.getProperty(key);
  return val;
}

function _setCachedNewestDate(sheet, dateStr) {
  if (dateStr) {
    PropertiesService.getDocumentProperties().setProperty(_sheetCacheKey(sheet), dateStr);
  }
}

function _dateMax(a, b) {
  if (!a) return b || null;
  if (!b) return a || null;
  return a >= b ? a : b; // Datums-Strings im ISO-Format sind lexikographisch vergleichbar
}

function _toDateString(value) {
  // Normalisiert Zellwerte: Date → ISO-String, String → unverändert, sonst null/leer → null
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value) {
    // Akzeptiere nur RFC3339/ISO-8601 Zeitstempel (UTC 'Z' oder Offset)
  if (RFC3339_RE.test(value)) return value;
    return null;
  }
  return null;
}


function _getChannelIdFromUrl(url, apiKey) {
  // Wenn es schon eine /channel/ URL ist, direkt extrahieren
  var match = url.match(/youtube\.com\/channel\/([a-zA-Z0-9_-]+)/);
  if (match) {
    return match[1];
  }

  // Für Handles (@name) oder benutzerdefinierte URLs
  // z. B. https://www.youtube.com/@arte
  if (url.includes("@")) {
    var handle = url.split("@")[1];
    var apiUrl = "https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=%40" +
      handle + "&key=" + apiKey;
    var response = UrlFetchApp.fetch(apiUrl);
    var data = JSON.parse(response.getContentText());
    if (data.items && data.items.length > 0) {
      return data.items[0].id;
    }
  }

  // Für "custom URLs" (youtube.com/c/XYZ)
  var custom = url.match(/youtube\.com\/c\/([a-zA-Z0-9_-]+)/);
  if (custom) {
    var username = custom[1];
    var apiUrl = "https://www.googleapis.com/youtube/v3/channels?part=id&forUsername=" +
      username + "&key=" + apiKey;
    var response = UrlFetchApp.fetch(apiUrl);
    var data = JSON.parse(response.getContentText());
    if (data.items && data.items.length > 0) {
      return data.items[0].id;
    }
  }

  throw new Error("Channel-ID konnte nicht gefunden werden.");
}


function _ensureHeaders(sheet) {
  var headerValues = sheet.getRange(HEADER_ROW, 1, 1, HEADERS.length).getValues()[0];
  var headerEmpty = headerValues.every(function (cell) { return cell === ""; });
  if (headerEmpty) {
    sheet.getRange(HEADER_ROW, 1, 1, HEADERS.length).setValues([HEADERS]);
  }
}

// Upload-Datum-Spalte ist fest über HEADERS definiert → UPLOAD_DATE_COL

function _scanNewestDateFromSheet(sheet) {
  if (UPLOAD_DATE_COL <= 0) return null;
  if (sheet.getLastRow() < FIRST_DATA_ROW) return null;
  var dateValues = sheet.getRange(FIRST_DATA_ROW, UPLOAD_DATE_COL, sheet.getLastRow() - FIRST_DATA_ROW + 1, 1).getValues();
  var maxDate = null;
  for (var i = 0; i < dateValues.length; i++) {
    var d = _toDateString(dateValues[i][0]);
    if (d) maxDate = _dateMax(maxDate, d);
  }
  return maxDate;
}

function _getUploadsPlaylistId(channelId, apiKey) {
  var channelApiUrl = "https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=" +
    channelId + "&key=" + apiKey;
  var channelResponse = UrlFetchApp.fetch(channelApiUrl);
  var channelData = JSON.parse(channelResponse.getContentText());
  return channelData.items[0].contentDetails.relatedPlaylists.uploads;
}

function _collectNewRowsFromUploads(uploadsPlaylistId, apiKey, newestDate) {
  var pageToken = "";
  var newRows = [];
  var stop = false;
  var maxInsertedDate = null;

  do {
    var playlistUrl = "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50" +
      "&playlistId=" + uploadsPlaylistId +
      (pageToken ? "&pageToken=" + pageToken : "") +
      "&fields=nextPageToken,items(snippet(resourceId(videoId)))" +
      "&key=" + apiKey;

    var playlistData = JSON.parse(UrlFetchApp.fetch(playlistUrl).getContentText());
    var videoIds = playlistData.items.map(function (item) { return item.snippet.resourceId.videoId; });
    if (videoIds.length === 0) break;

    var statsUrl = "https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics" +
      "&id=" + videoIds.join(",") +
      "&fields=items(id,snippet(publishedAt,title),statistics(viewCount),contentDetails(duration))" +
      "&key=" + apiKey;
    var statsData = JSON.parse(UrlFetchApp.fetch(statsUrl).getContentText());

    for (var k = 0; k < statsData.items.length; k++) {
      var video = statsData.items[k];
      var publishedDate = video.snippet.publishedAt; // ISO 8601 String
      if (newestDate && publishedDate <= newestDate) { stop = true; break; }

      var title = video.snippet.title;
      var id = video.id;
      var vurl = "https://www.youtube.com/watch?v=" + id;
      var views = video.statistics.viewCount;
      var duration = video.contentDetails.duration;
      var seriesInfo = parseSeriesInfo(title);

      newRows.push([
        title,
        seriesInfo.series,
        seriesInfo.episode,
        seriesInfo.rest,
        id,
        vurl,
        publishedDate,
        views,
        duration
      ]);
      maxInsertedDate = _dateMax(maxInsertedDate, publishedDate);
    }

    if (stop) break;
    pageToken = playlistData.nextPageToken;
  } while (pageToken);

  return { rows: newRows, maxInsertedDate: maxInsertedDate };
}

function _insertNewRows(sheet, newRows) {
  sheet.insertRowsAfter(HEADER_ROW, newRows.length);
  sheet.getRange(FIRST_DATA_ROW, 1, newRows.length, newRows[0].length).setValues(newRows);
}

function getNewVideosFromUrl() {
  // API-Key aus config.js, falls vorhanden (Node.js/Tests), sonst leer (GAS)
  var apiKey = (typeof API_KEY !== 'undefined') ? API_KEY : "";
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var channelUrl = sheet.getRange("A1").getValue();
  var channelId = _getChannelIdFromUrl(channelUrl, apiKey);

  // Uploads Playlist ID holen
  var uploadsPlaylistId = _getUploadsPlaylistId(channelId, apiKey);

  // Positionen und Header
  _ensureHeaders(sheet);

  // Neueste bekannte Zeit (ISO) aus Cache oder Tabelle bestimmen
  var newestDate = _getCachedNewestDate(sheet);
  if (!newestDate) {
    newestDate = _scanNewestDateFromSheet(sheet);
    if (newestDate) _setCachedNewestDate(sheet, newestDate);
  }

  // Neue Reihen einsammeln
  var result = _collectNewRowsFromUploads(uploadsPlaylistId, apiKey, newestDate);
  var newRows = result.rows;
  var maxInsertedDate = result.maxInsertedDate;

  // Ausgabe
  var msg = '';
  if (newRows.length > 0) {
    _insertNewRows(sheet, newRows);

      var updatedDate = _dateMax(newestDate, maxInsertedDate);
    if (updatedDate) _setCachedNewestDate(sheet, updatedDate);

    msg = (newRows.length === 1)
      ? 'Es wurde 1 neues Video hinzugefügt.'
      : ('Es wurden ' + newRows.length + ' neue Videos hinzugefügt.');
  } else {
    msg = 'Keine neuen Videos gefunden.';
    // Optional: falls Cache leer aber Tabelle bereits Werte hat, sicherstellen
    if (!newestDate) {
      var maxDate2 = _scanNewestDateFromSheet(sheet);
      if (maxDate2) _setCachedNewestDate(sheet, maxDate2);
    }
  }

  SpreadsheetApp.getActiveSpreadsheet().toast(msg);
}

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('YouTube')
    .addItem('Neue Videos abrufen', 'fetchNewVideosMenu')
    .addToUi();
}
// Menü-Funktion für neue Videos (und initialen Import)
function fetchNewVideosMenu() {
  getNewVideosFromUrl();
}









