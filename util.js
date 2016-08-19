// ---------------------------------------------------------------------------------------------------------------- legaleseRootFolder_
function legaleseRootFolder_() {
  var legalese_root;

  var legalese_rootfolder_id = PropertiesService.getDocumentProperties().getProperty("legalese.rootfolder");
  if (! legalese_rootfolder_id == undefined) {
	legalese_root = DriveApp.getFolderById(JSON.parse(legalese_rootfolder_id));
  }
  else {
	var legaleses = DriveApp.getFoldersByName("Legalese Root");
	utLog("legaleses = " + legaleses);
	if (legaleses.hasNext()) {
	  utLog("legaleses is defined");
	  // TODO: exclude any Legalese Root folders that are in the trash.
	  legalese_root = legaleses.next();
	  utLog("legalese_root = " + legalese_root);
	} else {
	  utLog("WARNING: Google Drive claims that the Legalese Root folder does not exist. really?");
	  legalese_root = DriveApp.createFolder("Legalese Root");
	}
	PropertiesService.getDocumentProperties().setProperty("legalese.rootfolder", JSON.stringify(legalese_root.getId));
  }
  return legalese_root;
}

// ---------------------------------------------------------------------------------------------------------------- createFolder_
function createFolder_(sheet) {
  var legalese_root = legaleseRootFolder_();
  var folderName = sheet.getParent().getName() + " "
	  + sheet.getSheetName() + " "
	  + Utilities.formatDate(new Date(), sheet.getParent().getSpreadsheetTimeZone(), "yyyyMMdd-HHmmss");
  utLog("attempting createfolder(%s)", folderName);
  var folder = legalese_root.createFolder(folderName);
  utLog("createfolder returned " + folder);

  legalese_root.addFile(DriveApp.getFileById(sheet.getParent().getId()));

  return folder;
};

// ---------------------------------------------------------------------------------------------------------------- createReadme_
function createReadme_(folder, config, sheet) { // under the parent folder
  var spreadsheet = sheet.getParent();
  var doc = DocumentApp.create("README for " + spreadsheet.getName());
  var docfile = DriveApp.getFileById(doc.getId());
  folder.addFile(docfile);
  DriveApp.getRootFolder().removeFile(docfile);

  doc.getBody().appendParagraph("Hey there, Curious!").setHeading(DocumentApp.ParagraphHeading.TITLE);

  doc.getBody().appendParagraph("This README was created by Legalese, so you can peek behind the scenes and understand what's going on.");

  var para = doc.getBody().appendParagraph("This folder was created when you clicked Add-Ons/Legalese/Generate PDFs, in the spreadsheet named ");
  var text = para.appendText(spreadsheet.getName() + ", " + sheet.getName());
  text.setLinkUrl(spreadsheet.getUrl() + "#gid=" + sheet.getSheetId());

  doc.getBody().appendParagraph("You will see a bunch of XMLs in the folder. In a couple minutes, you should see a bunch of PDFs as well. If you don't see the PDFs, try reloading the page after two or three minutes.");

  doc.getBody().appendParagraph("Okay, so what next?").setHeading(DocumentApp.ParagraphHeading.HEADING1);;
  doc.getBody().appendParagraph("Review the PDFs. If you're not satisfied, go back to the yellow spreadsheet and keep tweaking.");
  doc.getBody().appendParagraph("When you are satisfied, if you have EchoSign set up, go back to the spreadsheet and run Add-Ons / Legalese / Send to EchoSign.");
  doc.getBody().appendParagraph("Not everybody has EchoSign set up to work with Legalese. If that menu option doesn't appear for you, you will have to do it manually. In Google Drive, add the Add-On for EchoSign, or another e-signature service like DocuSign or HelloSign; right-click the PDF and send it for signature via your chosen e-signature service.");
  doc.getBody().appendParagraph("When it asks you who to send the document to, enter the email addresses, in the order shown below. Review the PDF before it goes out; you may need to position the signature fields on the page.");


  var logs_para = doc.getBody().appendParagraph("Output PDFs").setHeading(DocumentApp.ParagraphHeading.HEADING1);

  doc.getBody().appendParagraph("Each PDF, when sent for signature, has its own To: and CC: email addresses. They are shown below. Order matters! The signature blocks in the PDF are indexed against the email addresses you enter. If you swap the email addresses around, then signatures will end up appearning against the wrong block.");

  utLog("run started");
  var uniq = uniqueKey(sheet);
  PropertiesService.getDocumentProperties().setProperty("legalese."+uniq+".readme.id", JSON.stringify(doc.getId()));
  return doc;
}

function getReadme(sheet) {
  var uniq = uniqueKey(sheet);
  var id = PropertiesService.getDocumentProperties().getProperty("legalese."+uniq+".readme.id");
  if (id != undefined) {
	return DocumentApp.openById(JSON.parse(id));
  }
  return;
}


// ---------------------------------------------------------------------------------------------------------------- resetDocumentProperties_
// utility function to reset userproperties
function resetDocumentProperties_(which) {
  var props = PropertiesService.getDocumentProperties();
  if (which == "all") props.deleteAllProperties();
  else props.deleteProperty(which);
}



// ---------------------------------------------------------------------------------------------------------------- showDocumentProperties_
function showDocumentProperties_() {
  utLog("userProperties: %s", JSON.stringify(PropertiesService.getDocumentProperties().getProperties()));
  utLog("scriptProperties: %s", JSON.stringify(PropertiesService.getScriptProperties().getProperties()));
}

function getSheetByURL_(url){
  var ss = SpreadsheetApp.openByUrl(url);
  var id = url.match(/gid=(\d+)/);
  // maybe there was a gid component.
  if (id) { return getSheetById_(ss, id[1]) }
  else {
	// should we return the first sheet, or should we fail?
	// i think we should fail.
	// see http://www.jwz.org/doc/worse-is-better.html
	utLog("getSheetByURL_(%s): doesn't specify a sheet id! dying. (expected a gid=NNN parameter in the URL)", url);
	throw("getSheetByURL() doesn't specify a 'gid' sheet id in the url! "+url);
  }
}


function getSheetById_(ss, id) {
  var sheets = ss.getSheets();
  for (var i=0; i<sheets.length; i++) {
	utLog("does sheet " + i + " ( " + sheets[i].getSheetName() + " have id " + id + "?");
    if (sheets[i].getSheetId() == id) {
	  utLog("yes: " + sheets[i].getSheetId() + " = " + id + "?");
      return sheets[i];
    }
  }
  return;
}

function hyperlink2sheet_(hyperlink) { // input: either a =HYPERLINK formula or just a regular URL of the form https://docs.google.com/a/jfdi.asia/spreadsheets/d/1y8BdKfGzn3IrXK9qrlzKH2IHo4fR-GulXQnMp0hrVIU/edit#gid=1382748166
  var res = hyperlink.match(/\/([^\/]+)\/edit#gid=(\d+)/); // JS doesn't need us to backslash the / in [] but it helps emacs js-mode
  if (res) {
	return getSheetById_(SpreadsheetApp.openById(res[1]), res[2]);
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------- uniqueKey_
function uniqueKey(sheet) {
  var ss = sheet.getParent();
  return ss.getId() + "/" + sheet.getSheetId();
}

// ---------------------------------------------------------------------------------------------------------------- intersect_
// yes, this is O(nm) but for small n,m it should be OK
function intersect_(array1, array2) {
  var array2_names = array2.map(function(st){ return st.name });
  var toreturn = [];
  var found = array1.filter(function(n) { return array2_names.indexOf(n) != -1 });
  for (var i in found) {
	toreturn.push(array2[array2_names.indexOf(found[i])]);
  }
  return toreturn;
}

function plusNum (num, email) {
  // turn (0, mengwong@jfdi.asia) to mengwong+0@jfdi.asia
  var localpart, domain;
  localpart = email.split("@")[0];
  domain    = email.split("@")[1];
  return localpart + "+" + num.toString() + "@" + domain;
}

function uniq_( arr ) {
  return arr.reverse().filter(function (e, i, arr) {
    return arr.indexOf(e, i+1) === -1;
  }).reverse();
}

function getDocumentProperty(sheet, propertyname) {
  var uniq = uniqueKey(sheet);
  return JSON.parse(PropertiesService.getDocumentProperties().getProperty("legalese."+uniq+"." + propertyname));
}


// ---------------------------------------------------------------------------------------------------------------- newlinesToCommas
// used inside <? ?> to convert a multiline address to a singleline address for party-section purposes
function newlinesToCommas(str) {
  if (str == undefined) { utLog("newlinesToCommas: undefined!"); return undefined }
  return str.replace(/,?\s*\n\s*/g, ", ");
}

// ---------------------------------------------------------------------------------------------------------------- newlinesToCommas
// used inside <? ?> to convert a multiline name to the first line for party-section purposes
function firstline_(str) {
  if (str == undefined) { utLog("firstline: undefined!"); return undefined }
  return str.split(/,?\s*\n\s*/)[0];
}



function email_to_cc(email) {
  var to = null;
  var emails = email.split(/\s*[\n\r,]\s*/).filter(function(e){return e.length > 0});
  if (emails.length > 0) {
	to = [emails.shift()];
  }
  return [to, emails];
}

var myLogStats = {};
var myLogConfig = { readrows: 6,
					templates: 6,
					XXX: 8,  // raise to 8 when you are frustrated. reduce to 6 when you stop caring. 7 is obviously the threshold.
				  };

// README: a more elegant way to change debug verbosity,
// rather than edit the global legaleseMain or development legaleseMain,
// is to add a line at the top of the local spreadsheet's script editor
//   legaleseMain.myLogConfig.readrows = 8;

function myLog(params, module, loglevel, logconfig) {
  logconfig = logconfig || myLogConfig;
  params[0] = module + " " + params[0];

  // by default, display INFO and above but not DEBUG
  var logfilter = logconfig[module] == undefined ? 6 : logconfig[module];

  if (myLogStats[module] == undefined) { myLogStats[module] = { displayed: [], discarded: [] } };
  if (loglevel <= logfilter) {
	myLogStats[module].displayed[loglevel] = myLogStats[module].displayed[loglevel] || 0;
	myLogStats[module].displayed[loglevel]++;
	Logger.log.apply(Logger, params);
  }
  else {
	myLogStats[module].discarded[loglevel] = myLogStats[module].discarded[loglevel] || 0;
	myLogStats[module].discarded[loglevel]++;
  }
}

function dumpMyLogStats() {
  Logger.log("myLog stats: %s", myLogStats);
  Logger.log("myLog to view DEBUG level output, set util.js's myLog logconfig per-module level to 7.");
}

function utLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
	params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  if (loglevel == undefined) { loglevel = 7 }
  myLog(params,"util", loglevel, logconfig);
}

function xxLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
	params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  if (loglevel == undefined) { loglevel = 7 }
  myLog(params,"XXX", loglevel, logconfig);
}

function getFixedNotation(address, notation) {
  var newString = notation.split("$").join("$$").replace("1", "$2").replace("A", "$1");
  var regex = /([A-Z]+)(\d+)/;
  return address.replace(regex, newString);
}

function xmLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
    params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  if (loglevel == undefined) { loglevel = 7 }
  myLog(params, "(XML) " + currentTemplate, loglevel, logconfig);
}
