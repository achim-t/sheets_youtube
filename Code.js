function _getFirstDataRow(sheet) {
  // Wir gehen davon aus: erste Spalte enthält "Titel" als Spaltenüberschrift
  var range = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
  for (var i = 0; i < range.length; i++) {
    if (String(range[i][0]).toLowerCase() === "titel") {
      return i + 2; // Zeile nach den Überschriften
    }
  }
  // Fallback: falls nichts gefunden → Zeile 2
  return 2;
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

  // Neueste bekannte Zeit aus der Tabelle (erste Datenzeile nach Header, Spalte 4)
  var firstDataRow = _getFirstDataRow(sheet);
  var newestDate = null;
  if (sheet.getLastRow() >= firstDataRow) {
    newestDate = new Date(sheet.getRange(firstDataRow, 4).getValue());
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
      var dateIso = video.snippet.publishedAt;
      var date = new Date(dateIso);

      // Sobald nicht-neuer → abbrechen (alles Folgende ist noch älter)
      if (newestDate && date <= newestDate) { stop = true; break; }

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
  if (newRows.length > 0) {
    // Sortieren: neueste zuerst (YouTube API liefert zwar schon so, aber sicherheitshalber)
    newRows.sort(function(a, b) {
      return new Date(b[6]) - new Date(a[6]);
    });

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
  }
}

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('YouTube')
    .addItem('Neue Videos abrufen', 'fetchNewVideosMenu')
    .addToUi();
}
// Menü-Funktion für neue Videos (und initialen Import)
function fetchNewVideosMenu() {
  updateYoutubeVideos(getNewVideosFromUrl);
}
function generateSeriesColumns() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 4) return; // keine Daten
  
  // Titel-Spalte A, Daten ab Zeile 4
  var titles = sheet.getRange(4, 1, lastRow - 3, 1).getValues();
  
  var seriesCol = [];
  var episodeCol = [];
  var restCol = [];
  
  for (var i = 0; i < titles.length; i++) {
    var title = titles[i][0] || "";
    
    // Serie / Gruppe
    var seriesMatch = title.match(/^(.*?)(?:\s*#\d+|\s*Episode\s*\d+)/);
    var series = seriesMatch ? seriesMatch[1].trim() : title;
    series = series.replace(/[-\s]+$/,"").trim();

    
    // Episodennummer
    var epMatch = title.match(/#(\d+)/);
    if (!epMatch) epMatch = title.match(/Episode\s*(\d+)/);
    var episode = epMatch ? epMatch[1] : "";
    
    // Resttitel (vorher Trim + führendes "- " entfernen)
    var rest = title.replace(/^(.*?)(?:\s*(?:#|Episode)\s*\d+[:\-]?\s*)/, "").trim();
    rest = rest.replace(/^-\s*/, ""); // führendes "- " entfernen
    
    seriesCol.push([series]);
    episodeCol.push([episode]);
    restCol.push([rest]);
  }
  
  // Spalten einfügen: nach Spalte A einfügen (jetzt B, C, D)
  sheet.insertColumnsAfter(1, 3);
  
  // Überschriften in Zeile 3
  sheet.getRange(3, 2).setValue("Serie");
  sheet.getRange(3, 3).setValue("Episodennummer");
  sheet.getRange(3, 4).setValue("Episodentitel");
  
  // Daten ab Zeile 4
  sheet.getRange(4, 2, seriesCol.length, 1).setValues(seriesCol);
  sheet.getRange(4, 3, episodeCol.length, 1).setValues(episodeCol);
  sheet.getRange(4, 4, restCol.length, 1).setValues(restCol);
}

function sortByUploadDateDynamic() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var headerRow = 3;
  var firstDataRow = headerRow + 1;
  var lastRow = sheet.getLastRow();
  if (lastRow < firstDataRow) return; // Keine Daten

  // Überschriften aus Zeile 3 auslesen
  var headers = sheet.getRange(headerRow, 1, 1, sheet.getLastColumn()).getValues()[0];

  // Index der Spalte "Upload-Datum" suchen
  var dateColumn = headers.indexOf("Upload-Datum") + 1; // +1, weil indexOf nullbasiert ist
  if (dateColumn === 0) {
    return;
  }

  // Bereich der Daten (ohne Überschrift)
  var range = sheet.getRange(firstDataRow, 1, lastRow - firstDataRow + 1, sheet.getLastColumn());

  // Sortieren nach Upload-Datum absteigend (neueste zuerst)
  range.sort({column: dateColumn, ascending: false});
}

function updateYoutubeVideos(fetchFunction) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  // Filter sichern
  var savedFilter = saveCurrentFilter(sheet);

  // Daten sortieren (neueste Uploads oben)
  sortByUploadDateDynamic();

  // Youtube-Videos abrufen
  fetchFunction();

  // Filter wiederherstellen
  restoreFilter(sheet, savedFilter);
}

// Beispiel Hilfsfunktionen zum Speichern/Restaurieren von Filtern:
function saveCurrentFilter(sheet) {
  var filter = sheet.getFilter();
  if (!filter) return null;
  
  var filterRange = filter.getRange();
  var filterSettings = [];
  
  for (var i = 1; i <= filterRange.getNumColumns(); i++) {
    var criteria = filter.getColumnFilterCriteria(i);
    filterSettings.push(criteria ? criteria.copy() : null);
  }
  
  return {range: filterRange, criteria: filterSettings};
}

function restoreFilter(sheet, savedFilter) {
  if (!savedFilter) return;
  
  if (sheet.getFilter()) sheet.getFilter().remove();
  sheet.getRange(savedFilter.range.getA1Notation()).createFilter();
  var filter = sheet.getFilter();
  
  for (var i = 0; i < savedFilter.criteria.length; i++) {
    if (savedFilter.criteria[i]) filter.setColumnFilterCriteria(i + 1, savedFilter.criteria[i]);
  }
}









