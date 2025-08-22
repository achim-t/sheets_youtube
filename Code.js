function _getFirstDataRow(sheet) {
  // Wir gehen davon aus: erste Spalte enthält "Titel" als Spaltenüberschrift
  var range = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
  for (var i = 0; i < range.length; i++) {
    if (String(range[i][0]).toLowerCase() === "titel") {
      return i + 2; // Zeile nach den Überschriften
    }
  }
  // Fallback: falls nichts gefunden → Zeile 2
  return 4;
}

// Cache-Helpers: neuestes Upload-Datum (ISO-String) pro Tabellenblatt speichern
function _sheetCacheKey(sheet) {
  return 'lastUploadIso:' + sheet.getSheetId();
}

function _getCachedNewestIso(sheet) {
  return PropertiesService.getDocumentProperties().getProperty(_sheetCacheKey(sheet));
}

function _setCachedNewestIso(sheet, iso) {
  if (iso) {
    PropertiesService.getDocumentProperties().setProperty(_sheetCacheKey(sheet), iso);
  }
}

function _isoMax(a, b) {
  if (!a) return b || null;
  if (!b) return a || null;
  return a >= b ? a : b; // ISO-Strings sind lexikographisch vergleichbar
}

function _toIsoStringIfDate(value) {
  // Normalisiert Zellwerte: Date → ISO, String → unverändert, sonst null/leer → null
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value) return value;
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


function getNewVideosFromUrl() {
  // API-Key aus config.js, falls vorhanden (Node.js/Tests), sonst leer (GAS)
  var apiKey = (typeof API_KEY !== 'undefined') ? API_KEY : "";
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var channelUrl = sheet.getRange("A1").getValue(); 
  var channelId = _getChannelIdFromUrl(channelUrl, apiKey);

  // Uploads Playlist ID holen
  var channelApiUrl = "https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=" +
                      channelId + "&key=" + apiKey;
  var channelResponse = UrlFetchApp.fetch(channelApiUrl);
  var channelData = JSON.parse(channelResponse.getContentText());
  var uploadsPlaylistId = channelData.items[0].contentDetails.relatedPlaylists.uploads;

  // Neueste bekannte Zeit (ISO) aus Cache oder Tabelle bestimmen
  var firstDataRow = _getFirstDataRow(sheet);
  var newestIso = _getCachedNewestIso(sheet);
  // Fallback: Tabelle scannen (Spalte 'Upload-Datum' ab erster Datenzeile)
  if (!newestIso) {
    var headers = sheet.getRange(3, 1, 1, sheet.getLastColumn()).getValues()[0] || [];
    var uploadDateCol = headers.indexOf('Upload-Datum') + 1; // +1, weil indexOf 0-basiert
    if (uploadDateCol > 0 && sheet.getLastRow() >= firstDataRow) {
      var dateValues = sheet.getRange(firstDataRow, uploadDateCol, sheet.getLastRow() - firstDataRow + 1, 1).getValues();
      var maxIso = null;
      for (var i = 0; i < dateValues.length; i++) {
        var iso = _toIsoStringIfDate(dateValues[i][0]);
        if (iso) maxIso = _isoMax(maxIso, iso);
      }
      newestIso = maxIso;
      if (newestIso) _setCachedNewestIso(sheet, newestIso);
    }
  }

  var pageToken = "";
  var newRows = [];
  var stop = false;

  do {
    var playlistUrl = "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50" +
                      "&playlistId=" + uploadsPlaylistId +
                      (pageToken ? "&pageToken=" + pageToken : "") +
                      "&key=" + apiKey;

    var playlistData = JSON.parse(UrlFetchApp.fetch(playlistUrl).getContentText());
    var videoIds = playlistData.items.map(function (item) { return item.snippet.resourceId.videoId; });
    if (videoIds.length === 0) break;

    var statsUrl = "https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics" +
                   "&id=" + videoIds.join(",") + "&key=" + apiKey;
    var statsData = JSON.parse(UrlFetchApp.fetch(statsUrl).getContentText());

    // WICHTIG: normale for-Schleife → echtes break möglich
    for (var k = 0; k < statsData.items.length; k++) {
      var video = statsData.items[k];
      var dateIso = video.snippet.publishedAt; // ISO 8601 von der API

      // Sobald nicht-neuer → abbrechen (alles Folgende ist noch älter)
      if (newestIso && dateIso <= newestIso) { stop = true; break; }

      var title = video.snippet.title;
      var id = video.id;
      var vurl = "https://www.youtube.com/watch?v=" + id;
      var views = video.statistics.viewCount;
      var duration = video.contentDetails.duration;

      // --- Serien-Logik ausgelagert ---
      var seriesInfo = parseSeriesInfo(title);
      newRows.push([
        title,
        seriesInfo.series,
        seriesInfo.episode,
        seriesInfo.rest,
        id,
        vurl,
        dateIso,
        views,
        duration
      ]);
    }

    if (stop) break;                     // äußere Schleife beenden
    pageToken = playlistData.nextPageToken;
  } while (pageToken);

  // Wenn neue Videos gefunden → oberhalb einfügen (unterhalb Header)
  var msg = '';
  if (newRows.length > 0) {
    // Sortieren: neueste zuerst (YouTube API liefert zwar schon so, aber sicherheitshalber)
    newRows.sort(function(a, b) { return b[6].localeCompare(a[6]); });

    // Spalten: Titel, Serie, Episodennummer, Episodentitel, Video-ID, Link, Upload-Datum, Views, Dauer
    // Header ggf. setzen
    var headerRow = 3;
    var headers = ["Titel", "Serie", "Episodennummer", "Episodentitel", "Video-ID", "Link", "Upload-Datum", "Views", "Dauer"];
    var headerValues = sheet.getRange(headerRow, 1, 1, headers.length).getValues()[0];
    var headerEmpty = headerValues.every(function(cell){ return cell === ""; });
    if (headerEmpty) {
      sheet.getRange(headerRow, 1, 1, headers.length).setValues([headers]);
    }

    sheet.insertRowsAfter(firstDataRow - 1, newRows.length);
    sheet.getRange(firstDataRow, 1, newRows.length, newRows[0].length).setValues(newRows);

    // Cache aktualisieren: max(neuestes bisher, max aus neuen Zeilen)
    var maxInsertedIso = null;
    for (var r = 0; r < newRows.length; r++) {
      maxInsertedIso = _isoMax(maxInsertedIso, newRows[r][6]);
    }
    var updatedIso = _isoMax(newestIso, maxInsertedIso);
    if (updatedIso) _setCachedNewestIso(sheet, updatedIso);
    if (newRows.length === 1) {
      msg = 'Es wurde 1 neues Video hinzugefügt.';
    } else {
      msg = 'Es wurden ' + newRows.length + ' neue Videos hinzugefügt.';
    }
  } else {
    msg = 'Keine neuen Videos gefunden.';
    // Optional: falls Cache leer aber Tabelle bereits Werte hat, sicherstellen
    if (!newestIso) {
      var headers2 = sheet.getRange(3, 1, 1, sheet.getLastColumn()).getValues()[0] || [];
      var uploadDateCol2 = headers2.indexOf('Upload-Datum') + 1;
      if (uploadDateCol2 > 0 && sheet.getLastRow() >= firstDataRow) {
        var dateValues2 = sheet.getRange(firstDataRow, uploadDateCol2, sheet.getLastRow() - firstDataRow + 1, 1).getValues();
        var maxIso2 = null;
        for (var j = 0; j < dateValues2.length; j++) {
          var iso2 = _toIsoStringIfDate(dateValues2[j][0]);
          if (iso2) maxIso2 = _isoMax(maxIso2, iso2);
        }
        if (maxIso2) _setCachedNewestIso(sheet, maxIso2);
      }
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









