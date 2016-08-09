// what does this script do?
// It runs every minute from a timed trigger.
// It looks for any new folders that have been Shared With Me.
// (where do such folders come from? from the "Generate PDFs" command in Legalese.)
// If it sees any new folders, it moves them into incoming/
// The InDesign "server" then sees that folder, because it's synced using Google Drive.
// The InDesign "server" converts XML to PDF.
// Once that task is complete, this script then removes the incoming/ data into done/
// 
// in future, get rid of that data entirely -- i don't want other people's confidential information sititng on my hard drives.
// so, after the PDFs have been sent to echosign, the Legalese code should unshare the folder with robot@legalese.io.
//
// mengwong@jfdi.asia 20150308

/**
 * The onOpen() function, when defined, is automatically invoked whenever the
 * spreadsheet is opened.
 * For more information on using the Spreadsheet API, see
 * https://developers.google.com/apps-script/service_spreadsheet
 */
function onOpen() {
  SpreadsheetApp.getUi().createAddonMenu()
      .addItem('Read Drive', 'readDrive')
      .addItem('Main',       'main')
      .addToUi();
};

function main() {
  // TODO: do some kind of mutex lock using scriptproperties, so that only one script runs at any given time
  // though maybe it's okay to have multiple things running … maybe there's no harm in collision
                  
  // update the ls -R sheet
  // look at everything that has been shared with me
  var notInMyDrive = readDrive();
  
  var incomingFolder = DriveApp.getRootFolder().getFoldersByName("incoming");
  if (incomingFolder.hasNext()) incomingFolder = incomingFolder.next()
  else                          incomingFolder = DriveApp.getRootFolder().createFolder("incoming");

  var doneFolder = DriveApp.getRootFolder().getFoldersByName("done");
  if (doneFolder.hasNext()) doneFolder = doneFolder.next()
  else                      doneFolder = DriveApp.getRootFolder().createFolder("done");

  // move any descendants of incoming/, which appear to have been processed correctly (i.e. a .pdf exists for each .xml), into done/
  moveFoldersToDone(incomingFolder, DriveApp.getRootFolder(), doneFolder);
  
  Logger.log("notInMyDrive has %s elements", notInMyDrive.length);

  // move any shared items (that are not in My Drive already) into the incoming/ or done/ folder depending on whether they're complete
  for (var i = 0; i < notInMyDrive.length; i++) {
    var item_as_file = DriveApp.getFileById(notInMyDrive[i].id);
    if (item_as_file.getMimeType() == "application/vnd.google-apps.folder") {
      var item_as_folder = DriveApp.getFolderById(notInMyDrive[i].id);
      if (folderIsComplete(item_as_folder)) {
        Logger.log("weird -- %s seems to be complete, so moving directly to done/", item_as_folder.getName());
        doneFolder.addFolder(item_as_folder);      
      }
      else {
        Logger.log("moving %s to incoming/", item_as_folder.getName());
        incomingFolder.addFolder(item_as_folder);      
      }        
    } else {
      Logger.log("%s has mimetype (%s) -- not a folder, so not moving", item_as_file.getName(), item_as_file.getMimeType());
    }
  }

  // off-stage, google drive will sync robot@legalese's google drive to the InDesign server instance
  // InDesign runs a job every 10 seconds to monitor the incoming/ folder
  // if it finds a .xml files without a .pdf or a .fail it will run the xml2pdf job and save a new PDF in place.
  
  // maybe in the future premium customers get to share their legalese root with robot@legalese.io, and keep a child folder permanently under incoming/
  // so they get high-frequency monitoring.
  // 
  // regular customers rely on the hourly cronjob trigger to notice incomings, and get low-frequency updates.
  //
  
  // TODO: add some sanity check error handling for when there are multiple incoming/ or done/ folders under the root

}

function folderIsComplete(folder) {
  var files = folder.getFiles();
  var xmls = {};
  var pdfs = {};
  var anyLacking = 1; // if there are no XMLs or PDFs, there's a problem.
  while (files.hasNext()) {
    var file = files.next();
    var re;
    re = file.getName().match(/(.+)\.xml$/); if (re) { xmls[re[1]] = file.getId(); anyLacking = 0; }
    re = file.getName().match(/(.+)\.pdf$/); if (re) { pdfs[re[1]] = file.getId(); anyLacking = 0; }
  }
  // a folder with one PDF for every XML should be considered complete.
  // we sometimes delete the xml files after generating the PDFs.
  // a folder with at least one PDFs, and with no XMLs, should be considered complete.
  
  Logger.log("found xml files: %s", xmls);
  Logger.log("found pdf files: %s", pdfs);
  if (anyLacking) { Logger.log("%s lacks XMLs, so not Complete.", folder.getName());
                   return false; }
    
  for (var filename in xmls) {
    if (pdfs[filename] == undefined) { anyLacking++ }
  }
  if (anyLacking) { Logger.log("%s lacks %s PDFs, so not Complete.", folder.getName(), anyLacking.toString());
                   return false; }

  Logger.log("%s is Complete.", folder.getName());
  return true;
}

// (recursive) if the current folder is Complete, move it to done/, otherwise, recurse into descendants
function moveFoldersToDone(folder, parentFolder, doneFolder) {
  if (folder.getName() != "incoming" && folderIsComplete(folder)) {
    Logger.log("moving %s from %s/ to %s/", folder.getName(), parentFolder.getName(), doneFolder.getName());
    doneFolder.addFolder(folder);
    parentFolder.removeFolder(folder);    
  }
  else {
    var childFolders = folder.getFolders();

    while (childFolders.hasNext()) {
      moveFoldersToDone(childFolders.next(), folder, doneFolder);
    }
  }
}


/**
 * Lists all the folders and files shared with me in Google Drive.
 */
function readDrive() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("ls -R");
  if (sheet == undefined) sheet = ss.insertSheet("ls -R");

  var range = sheet.getDataRange();
  sheet.clear();
  
  // things in my drive
  var rootFolder = DriveApp.getRootFolder();
  var toplevels = {};
  var folders = rootFolder.getFolders();
  while (folders.hasNext()) {
    var folder = folders.next();
    toplevels[folder.getId()] = folder.getName();
  }

  var height = showTree(sheet, [1, 1], rootFolder, "folder", ["done"]);

  height++;
  // things shared with me
  setCellLink(sheet, [1, height], "Shared With Me", "https://drive.google.com/drive/#shared-with-me");
  var shared = listShared();
  var notInMyDrive = [];
  var now = Utilities.formatDate(new Date(), SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), "yyyyMMdd-HHmmss");
  for (var i = 0; i < shared.length; i++) {
    setCellLink(sheet, [2, height+i], shared[i].title, shared[i].alternateLink);
    var parents = shared[i].parents.map(function toDriveApp(parent) { return DriveApp.getFolderById(parent.id) })
    .filter(function(p){return (p.getName() == "done" || p.getName() == "incoming")});
    
    sheet.getRange(height+i, 6 ).setValue(parents.length ? '=HYPERLINK("' + parents[0].getUrl() + '","' + parents[0].getName() + '")' : "new");
    sheet.getRange(height+i, 7 ).setValue(shared[i].id);
    sheet.getRange(height+i, 10).setValue(now);

    if (parents.length == 0) { notInMyDrive.push(shared[i]) }
  }
  height = height + shared.length;
  if (shared.length == 0) sheet.setActiveSelection(sheet.getRange(height  ,1))
  else                    sheet.setActiveSelection(sheet.getRange(height-1,2));
  
  return notInMyDrive;
}

function listShared() {
  var query = 'sharedWithMe=true and trashed=false';
  var folders, pageToken;
  var toreturn = [];
  do {
    folders = Drive.Files.list({
      q: query,
      maxResults: 100,
      pageToken: pageToken
    });
    if (folders.items && folders.items.length > 0) {
      for (var i = 0; i < folders.items.length; i++) {
        var folder = folders.items[i];
        toreturn.push(folder);
      }
    }
    pageToken = folders.nextPageToken;
  } while (pageToken);
  Logger.log("shared with me: %s", toreturn.map(function(f){return f.title}));
  return toreturn;
}


function showTree(sheet, xy, me, filetype, exclusions) {
  var height = 0;
  // first display myself
  // then display child folders
  // then display child files  

  setCellLink(sheet, xy, me.getName() + (filetype == 'folder' ? "/" : ""), me.getUrl()); // sometimes i am a file, sometimes a folder.

  if (filetype == "folder") {
	var exclusions_match = exclusions.filter(function(e){return e === me.getName()});
	if (exclusions_match.length) {
	  Logger.log("pruning exclusion %s", exclusions_match);
	  setCellLink(sheet, [xy[0]+1, xy[1]], "pruned");
	}
	else {
      var fo = []; var folders = me.getFolders(); while (folders.hasNext()) { fo.push(folders.next()); }
      // todo: sort by last-modified
      var fi = []; var files = me.getFiles(); while (files.hasNext()) { fi.push(files.next()); }
	  
      for (var i = 0; i < fo.length; i++) {
		height = height + showTree(sheet, [xy[0]+1, xy[1]+height], fo[i], "folder", exclusions);
      }

      for (var i = 0; i < fi.length; i++) {
		height = height + showTree(sheet, [xy[0]+1, xy[1]+height], fi[i], "file", exclusions);
      }
	}
  }
  if (height == 0) height++;
  return height;
}

function setCellLink(sheet, xy, text, url) {
  var cell = sheet.getRange(xy[1], xy[0]);
  if (url) { cell.setValue('=HYPERLINK("'+ url + '","' + text +'")'); }
  else     { cell.setValue(text) }
}
