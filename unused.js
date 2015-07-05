
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
