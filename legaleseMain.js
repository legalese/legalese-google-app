/* legaleseMain MANIFEST
 *
 * inside a legaleseMain project file you will find multiple scripts:
 * legaleseMain
 * controller
 * svg
 * owl
 * esop
 * captable
 * form
 * format
 * lingua
 * unused
 * templates
 * readrows
 *
 * these subsidiary modules represent chunks of functionality that reside in separate files both in the source repo and in the production google app.
 * why? because that's better than having everything in one file, that's why.
 *
*/


// ---------------------------------------------------------------------------------------------------- state
//
// a brief discussion regarding state.
//
// A spreadsheet may contain one or more sheets with deal-terms and entity particulars.
//
// When the user launches a routine from the Legalese menu, the routine usually takes its configuration from the ActiveSheet.
//
// But some routines are not launched from the Legalese menu. The form's submission callback writes to a sheet. How will it know which sheet to write to?
//
// Whenever we create a form, we shall record the ID of the then activeSheet into a UserProperty, "formActiveSheetId".
// Until the form is re-created, all submissions will feed that sheet.
//
// What happens if the user starts working on a different sheet? The user may expect that form submissions will magically follow their activity.
//
// To correct this impression, we give the user some feedback whenever the activeSheet is not the formActiveSheet.
//
// The showSidebar shall check and complain.
//
// That same test is also triggered when a function is called: if the activesheet is different to the form submission sheet, we alert() a warning.
//
//


var DEFAULT_AVAILABLE_TEMPLATES = "https://docs.google.com/spreadsheets/d/1rBuKOWSqRE7QgKgF6uVWR9www4LoLho4UjOCHPQplhw/edit#gid=981127052";
var DEFAULT_CAPTABLE_TEMPLATE = "https://docs.google.com/spreadsheets/d/1rBuKOWSqRE7QgKgF6uVWR9www4LoLho4UjOCHPQplhw/edit#gid=827871932";

// ---------------------------------------------------------------------------------------------------------------- onOpen
/**
 * Adds a custom menu to the active spreadsheet.
 * The onOpen() function, when defined, is automatically invoked whenever the
 * spreadsheet is opened.
 * For more information on using the Spreadsheet API, see
 * https://developers.google.com/apps-script/service_spreadsheet
 */
function onOpen(addOnMenu, legaleseSignature) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getActiveSheet();

  addOnMenu = addOnMenu || SpreadsheetApp.getUi().createAddonMenu();

  addOnMenu
	.addItem("Create Form", "legaleseMain.setupForm")
	.addItem("Generate PDFs", "legaleseMain.fillTemplates")
  	.addItem("Compute Dependencies", "legaleseMain.computeDependencies")
  	.addItem("Do Dependency Thing", "legaleseMain.depWriteForceLayout")
  //    .addItem("Do Nothing", "legaleseMain.DoNothing")
  //    .addItem("Update TOTAL Column", "legaleseMain.updateTotal")
  //	.addItem("Add a new Investor or other Party", "legaleseMain.addEntity")
  //   	.addItem("Add a Round to the Cap Table", "legaleseMain.addRound")
  ;

  if (legaleseSignature && legaleseSignature._loaded) {
	var echosignService = legaleseSignature.getEchoSignService();
	if (echosignService != null) {
	  addOnMenu.addItem("Send to EchoSign", "legaleseSignature.uploadAgreement");
	}
  }

  addOnMenu.addItem("Clone Spreadsheet", "legaleseMain.cloneSpreadsheet");
  addOnMenu.addToUi();

  // when we release this as an add-on the menu-adding will change.

//  resetDocumentProperties_("oauth2.echosign");

// next time we uncomment this we need to take legalese.uniq.x into account
// resetDocumentProperties_("legalese.folder.id");
// resetDocumentProperties_("legalese.rootfolder");

  PropertiesService.getDocumentProperties().deleteProperty("legalese.muteFormActiveSheetWarnings");

  // if we're on the Natural Language UI, reset C2's data validation to the appropriate range.
  if (sheet.getName() == "UI") {
	var sectionRange = sectionRangeNamed(sheet,"Entity Groups");
	var myRange = sheet.getRange(sectionRange[0], 2, sectionRange[1]-sectionRange[0]+1, 1);
	Logger.log("resetting C2 datavalidation range to " + myRange.getA1Notation());
	setDataValidation(sheet, "C2", myRange.getA1Notation());
  }

  if (legaleseSignature && legaleseSignature._loaded) {
	legaleseSignature.showSidebar(sheet);
  }
};



// ---------------------------------------------------------------------------------------------------------------- quicktest
function quicktest() {
  Logger.log("i will run new capTable_()");
  var capTable = new capTable_();
  // Logger.log("i haz run new capTable_() and got back %s", capTable);
  capTable.columnNames();
}



// spreadsheet functions.
// code.js needs to pass these through

function LOOKUP2D(wanted, range, left_right_top_bottom) {
  // LOOKUP2D will search for the wanted element in the range %s and return the top/bottom/left/right element corresponding from the range"
  for (var i in range) {
    for (var j in range[i]) {
      if (range[i][j] == wanted) {
        // "found it at "+i+","+j+"; returning "
        switch (left_right_top_bottom) {
          case "top":    return range[0][j];
          case "right":  return range[i][range[i].length-1];
          case "bottom": return range[range.length-1][j];
          default:       return range[i][0];
        }
      }
    }
  }
  return null;
}

function DoNothing() {
  SpreadsheetApp.getUi().alert("noop succeeded!");
}


// -----------------------

var _loaded = true;

