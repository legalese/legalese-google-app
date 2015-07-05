
function onEdit(e){
  // Set a comment on the edited cell to indicate when it was changed.
  var range = e.range;
  var sheet = range.getSheet();
  Logger.log("onEdit trigger firing: "+ e.range.getA1Notation());
  if (range.getA1Notation() == "C2") { // selected Entity Group
	sheet.getRange("D2").setFontStyle("italic");
	sheet.getRange("D2").setValue("wait...");
	sheet.getRange("D2").setBackground('yellow');

	sheet.getRange("C4").setBackground('white');
	sheet.getRange("C4").setValue("");

	Logger.log("updated C2, so we need to set D2");
	var sectionRange = sectionRangeNamed(sheet,"Entity Groups");
	var myv = myVLookup_(sheet, range.getValue(), sectionRange[0], sectionRange[1], 2);
	Logger.log("myVLookup returned " + myv);
	setDataValidation(sheet, "D2", myv);

	sheet.getRange("D2").setValue("");
	sheet.getRange("D2").setFontStyle("normal");
	sheet.getRange("D2").activate();

	sheet.getRange("C3").setValue("");
	sheet.getRange("C3").setBackground('white');

	sheet.getRange("C2").setBackground('lightyellow');
  }
  if (range.getA1Notation() == "D2") { // selected Entity
	sheet.getRange("D2").setBackground('lightyellow');

	sheet.getRange("C4").setBackground('white');
	sheet.getRange("C4").setValue("");

	sheet.getRange("C3").setValue("");
	sheet.getRange("C3").setBackground('yellow');
	sheet.getRange("C3").activate();
  }
  if (range.getA1Notation() == "C3") { // selected Template
	sheet.getRange("C3").setBackground('lightyellow');
	sheet.getRange("C4").setFontStyle("italic");
	sheet.getRange("C4").setValue("processing...");
	sheet.getRange("C4").activate();
  }
}

function sectionRangeNamed(sheet, sectionName) {
  // the rows that have data, after the row where [0]=="SOURCES" && [1]==sectionName

  // manual runtesting from the web ui
  if (sheet == null) { sheet = SpreadsheetApp.getActiveSheet(); }
  if (sectionName == null) { sectionName = "Entity Groups" }

  var dataRange = sheet.getDataRange();
  var dataRangeValues = dataRange.getValues();

  var startRow;
  var endRow;
  var inRange = false;

  for (var i = 0; i < dataRangeValues.length; i++) {
	var row = dataRangeValues[i];
	if      (! inRange && row[0] == "SOURCES" && row[1] == sectionName) { startRow = i+2; inRange=true;  continue }
	else if (  inRange && row[0] == "SOURCES" && row[1] != sectionName) {                 inRange=false; break    }
	else if (  inRange &&                        row[1]               ) {   endRow = i+1;                         }
  }
  Logger.log("found section named "+sectionName+" from row " + startRow + " to " + endRow );
  return [startRow, endRow];
}

function myVLookup_(sheet, str, rowStart, rowEnd, colIndex) {
  // return the data range for the row in which str matches col
  Logger.log("myVLookup: starting with rowStart="+rowStart+", rowEnd="+rowEnd + ", colIndex="+colIndex);
  var searchRange = sheet.getRange(rowStart, colIndex, rowEnd-rowStart+1);
  Logger.log("myVLookup: searching range " + searchRange.getA1Notation());
  for (var i = 1; i <= searchRange.getNumRows(); i++) {
	Logger.log("myVLookup: considering row " + (rowStart + i - 1) + " whose getCell("+i+",1) value is " + searchRange.getCell(i, 1).getValue());
	if (searchRange.getCell(i, 1).getValue() == str) { var toreturn = sheet.getRange(rowStart + i - 1, 3, 1, sheet.getLastColumn()).getA1Notation();
													   // SpreadsheetApp.getUi().alert("found " + str + "; returning " + toreturn);
													   return toreturn;
													 }
  }
  SpreadsheetApp.getUi().alert("falling off the end");
  return null;
}


function setDataValidation(sheet, dest, source) {
 var destinationRange = sheet.getRange(dest);
 var sourceRange = sheet.getRange(source);
 var rule = SpreadsheetApp.newDataValidation().requireValueInRange(sourceRange).build();
 var rules = destinationRange.getDataValidations();
 for (var i = 0; i < rules.length; i++) {
   for (var j = 0; j < rules[i].length; j++) {
     rules[i][j] = rule;
   }
 }
 destinationRange.setDataValidations(rules);
}


function partiesWearingManyHats(data, principal, hats) {
  var candidates = {};
  for (var hi in hats) {
	var role = hats[hi];
	for (var ei in principal.roles[role]) {
	  var entity = principal.roles[role][ei];
	  Logger.log("partiesWearingManyHats: entity %s wears the %s hat",
				 entity, role);
	  candidates[entity] = candidates[entity] || 0;
	  candidates[entity]++;
	}
  }
  var toreturn = [];
  for (var ci in candidates) {
	if (candidates[ci] == hats.length) { toreturn.push(data._entitiesByName[ci]) }
  }
  Logger.log("returning %s", toreturn);
  return toreturn;
}

function BootcampTeamsImportRange () {
  var activeRange = SpreadsheetApp.getActiveRange(); // user-selected range
  var mySheet = activeRange.getSheet();
  for (var i = 0; i < (activeRange.getValues().length); i++) {
	var myRow = mySheet.getRange(activeRange.getRow()+i, 1, 1, 10);
	// we expect column B to contain the URL of the Entities sheet
	// column A will become the importrange indicated by the current value

	Logger.log("you are interested in row " + myRow.getValues()[0]);
	if (! myRow.getValues()[0][1].match(/http/)) { Logger.log("not an importable row. skipping"); continue }

	var sourceSheet;
	try { sourceSheet = hyperlink2sheet_(myRow.getFormulas()[0][1] || myRow.getValues()[0][1]) } catch (e) {
	  Logger.log("couldn't open source spreadsheet ... probably on wrong row. %s", e);
	  throw("is your selection on the correct row?");
	  return;
	}
	myRow.getCell(1,1).setValue("=IMPORTRANGE('"+sourceSheet.getParent().getId()+"','"+
								sourceSheet.getSheetName()+
								"!"+myRow.getValues()[0][0]+"')");
  }
}


function allPDFs_(folder) {
  var folders = folder.getFolders();
  var files = folder.getFilesByType("application/pdf");
  var pdfs = [];
  while (  files.hasNext()) { pdfs= pdfs.concat(          files.next());  }
  while (folders.hasNext()) { pdfs= pdfs.concat(allPDFs_(folders.next())); }
  Logger.log("all PDFs under folder = %s", pdfs);
  return pdfs;
}



// ---------------------------------------------------------------------------------------------------------------- resetStyles_
function resetStyles_(doc) {
  var body = doc.getBody();

  var listitems = body.getListItems();
  for (var p in listitems) {
    var para = listitems[p];
    var atts = para.getAttributes();
    atts.INDENT_START = 36;
    atts.INDENT_FIRST_LINE = 18;
    para.setAttributes(atts);
  }
}

// ---------------------------------------------------------------------------------------------------------------- showStyleAttributes_
function showStyleAttributes_() {
  var body = DocumentApp.getActiveDocument.getBody();
  var listitems = body.getListItems();
  for (var p in listitems) {
    var para = listitems[p];
    var atts = para.getAttributes();
    for (i in atts) {
      para.appendText("attribute " + i + " = " + atts[i]);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------- getPartyCells
// TODO: make this go away -- let's just log the mailing output in one place, rather than row by row.
function getPartyCells(sheet, readrows, party) {
  Logger.log("getPartyCells: looking to return a dict of entityfieldname to cell, for party %s", party.name);
  Logger.log("getPartyCells: party %s comes from spreadsheet row %s", party.name, party._spreadsheet_row);
  Logger.log("getPartyCells: the fieldname map looks like this: %s", readrows._entityfields);
  Logger.log("getPartyCells: calling (getRange %s,%s,%s,%s)", party._spreadsheet_row, 1, 1, readrows._entityfields.length+1);
  var range = sheet.getRange(party._spreadsheet_row, 1, 1, readrows._entityfields.length+1);
  Logger.log("pulled range %s", JSON.stringify(range.getValues()));
  var toreturn = {};
  for (var f = 0; f < readrows._entityfields.length ; f++) {
	Logger.log("toreturn[%s] = range.getCell(%s,%s)", readrows._entityfields[f], 0+1,f+1);
	toreturn[readrows._entityfields[f]] = range.getCell(0+1,f+1);
  }
  return toreturn;
}

// ---------------------------------------------------------------------------------------------------------------- clauseroot / clausetext2num
// this is a hints db which hasn't been implemented yet. For InDesign we indicate cross-references in the XML already.
// but for the non-InDesign version we have to then number by hand.
//
var clauseroot = [];
var clausetext2num = {};
var hintclause2num = {};

// ---------------------------------------------------------------------------------------------------------------- clausehint
// xml2html musters a hint database of clause text to pathindex.
// at the start of the .ghtml file all the hints are passed to the HTMLTemplate engine by calling
// a whole bunch of clausehint_()s at the front of the file
function clausehint_(clausetext, pathindex, uniqtext) {
  hintclause2num[uniqtext || clausetext] = pathindex.join(".");
}

// ---------------------------------------------------------------------------------------------------------------- newclause
function newclause_(level, clausetext, uniqtext, tag) {
  var clause = clauseroot; // navigate to the desired clause depending on the level
  var pathindex = [clause.length];
  for (var i = 1; i < level; i++) {
    clause = clause[clause.length-1][0];
    pathindex.push(clause.length);
  }
  clause.push([[],clausetext]);

  pathindex[pathindex.length-1]++;
  clausetext2num[uniqtext || clausetext] = pathindex.join(".");
  if (clausetext == undefined) { // bullet
	var myid = pathindex.join("_");
//	return "<style>#"+myid+":before { display:block; content: \"" + pathindex.join(".") + ". \" } </style>" + "<li id=\"" + myid + "\">";
	return "<p class=\"ol_li level" + level+ "\">" + pathindex.join(".") + " ";
  } else {
      return "<h"+(level+0)+">"+pathindex.join(".") + ". " + clausetext + "</h"+(level+0)+">";
  }
}

// ---------------------------------------------------------------------------------------------------------------- clausenum
// this is going to have to make use of a hinting facility.
// the HTML template is filled in a single pass, so forward references from showclause_() to newclause_() will dangle.
// fortunately the newclauses are populated by xml2html so we can muster a hint database.
//
function clausenum_(clausetext) {
  return clausetext2num[clausetext] || hintclause2num[clausetext] || "<<CLAUSE XREF MISSING>>";
}

// ---------------------------------------------------------------------------------------------------------------- showclause
function showclause_(clausetext) {
    return clausenum + " (" + clausetext + ")";
}

