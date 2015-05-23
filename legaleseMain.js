/* TODO
 *
 * does the form submission trigger DTRT if there are multiple forms all callbacking to the same formsubmit?
 *
** import the termsheets from "How to invest in a JFDI Startup"
 *
**  reduce the security threat surface -- find a way to make this work with OnlyCurrentDoc.
 *  https://developers.google.com/apps-script/guides/services/authorization
 * 
 *  the risk is that a malicious commit on the legalese codebase will embed undesirable content in an xml template file
 *  which then runs with user permissions with access to all the user's docs. this is clearly undesirable.
 *  
 *  a functionally equivalent man-in-the-middle attack would intercept the UrlFetch() operation and return a malicious XML template file.
 * 
 *  lodging the XML templates inside the app itself is a seemingly attractive alternative, but it reduces to the same threat scenario because that data
 *  has to populate from somewhere in the first place.
 * 
 *  an alternative design sees the user sharing the spreadsheet with the Legalese Robot, which only has access to that one spreadsheet and no other files.
 *  the legalese robot would run, then share back a folder that contains the output. that limits exposure to user data.
 *  this sharing situation is clumsy -- why not just bring up a REST API that submits the active sheet's data as a sort of RPC to the robot?
 *  the robot would then issue a drive share in response.
 * 
 *  while we work on implementing that approach, we require that all committers with access to GitHub must have 2FA.
 * 
 *  ideally we would reduce the authorization scope of this script to only the current doc.
 *  but we need a way to share the resulting PDF with the user without access to everything in Drive!
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


// ---------------------------------------------------------------------------------------------------------------- onOpen
/**
 * Adds a custom menu to the active spreadsheet.
 * The onOpen() function, when defined, is automatically invoked whenever the
 * spreadsheet is opened.
 * For more information on using the Spreadsheet API, see
 * https://developers.google.com/apps-script/service_spreadsheet
 */
function onOpen(addOnMenu) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getActiveSheet();

  addOnMenu = addOnMenu || SpreadsheetApp.getUi().createAddonMenu();

  addOnMenu
	.addItem("Create Form", "legaleseMain.setupForm")
	.addItem("Generate PDFs", "legaleseMain.fillTemplates");

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

function getSheetById_(ss, id) {
  var sheets = ss.getSheets();
  for (var i=0; i<sheets.length; i++) {
	Logger.log("does sheet " + i + " ( " + sheets[i].getSheetName() + " have id " + id + "?");
    if (sheets[i].getSheetId() == id) {
	  Logger.log("yes: " + sheets[i].getSheetId() + " = " + id + "?");
      return sheets[i];
    }
  }
  return;
}

function formActiveSheetChanged_(sheet) {
  var formActiveSheetId = PropertiesService.getUserProperties().getProperty("legalese."+sheet.getParent().getId()+".formActiveSheetId");
  if (formActiveSheetId == undefined)              { return false }
  if (            sheet == undefined)              { return false }
  if (sheet.getParent().getFormUrl() == undefined) { return false }
  return (formActiveSheetId != sheet.getSheetId());
}

function muteFormActiveSheetWarnings_(setter) {
  if (setter == undefined) { // getter
	var myprop = PropertiesService.getDocumentProperties().getProperty("legalese.muteFormActiveSheetWarnings");
	if (myprop != undefined) {
	  return JSON.parse(myprop);
	}
	else {
	  return false;
	}
  }
  else {
	PropertiesService.getDocumentProperties().setProperty("legalese.muteFormActiveSheetWarnings", JSON.stringify(setter));
  }
}

// todo: rethink all this to work with both controller and native sheet mode. now that we save the sheetid into the uniq'ed 

function templateActiveSheetChanged_(sheet) {
  var templateActiveSheetId = PropertiesService.getDocumentProperties().getProperty("legalese.templateActiveSheetId");
  if (templateActiveSheetId == undefined)          { return false }
  if (                sheet == undefined)          { return false }
  Logger.log("templateActiveSheetChanged: comparing %s with %s, which is %s",
			 templateActiveSheetId, sheet.getSheetId(),
			 templateActiveSheetId == sheet.getSheetId()
			);
  return (templateActiveSheetId != sheet.getSheetId());
}

function muteTemplateActiveSheetWarnings_(setter) {
  if (setter == undefined) { // getter
	var myprop = PropertiesService.getDocumentProperties().getProperty("legalese.muteTemplateActiveSheetWarnings");
	if (myprop != undefined) {
	  return JSON.parse(myprop);
	}
	else {
	  return false;
	}
  }
  else {
	PropertiesService.getDocumentProperties().setProperty("legalese.muteTemplateActiveSheetWarnings", JSON.stringify(setter));
  }
}

// ---------------------------------------------------------------------------------------------------------------- setupForm
/**
 * establish a form for parties to fill in their personal details
 *
 */
function setupForm(sheet) {

  var sheetPassedIn = ! (sheet == undefined);
  if (! sheetPassedIn && SpreadsheetApp.getActiveSpreadsheet().getName().toLowerCase() == "legalese controller") {
	Logger.log("in controller mode, switching to setupOtherForms_()");
	setupOtherForms_();
	return;
  }
  var sheet = sheet || SpreadsheetApp.getActiveSheet();

  var ss = sheet.getParent();
  var entitiesByName = {};
  var readRows = readRows_(sheet, entitiesByName);

  Logger.log("setupForm: readRows complete: %s", readRows);

  if (readRows.principal
	  && readRows.principal._origin_sheet_id
	  && readRows.principal._origin_sheet_id != sheet.getSheetId()) {
	Logger.log("setupForm: switching target of the form to the %s sheet.", sheet.getSheetName());
	sheet = getSheetById_(ss, readRows.principal._origin_sheet_id);
	entitiesByName = {};
	readRows = readRows_(sheet, entitiesByName);
  }
  
  var data   = readRows.terms;
  var config = readRows.config;

  var form = ss.getFormUrl();

  if (form != undefined) {
    var ui = SpreadsheetApp.getUi();
    var response = ui.prompt('A form was previously created.', 'Reset it?', ui.ButtonSet.YES_NO);

	if (response.getSelectedButton() == ui.Button.NO) { return }

	// resetting the form internals isn't enough because the form title may have changed.
	// TODO: delete the old form. delete the old onSubmit Trigger. then recreate the form entirely from scratch.

    form = FormApp.openByUrl(form);
	var items = form.getItems();
	for (var i in items) {
	  form.deleteItem(0);
	}
  }	  
  else {
	var form_title = config.form_title != undefined ? config.form_title.value : ss.getName();
	var form_description = config.form_description != undefined ? config.form_description.value : "Please fill in your details.";
	form = FormApp.create(form_title)
      .setDescription(form_description)
      .setConfirmationMessage('Thanks for responding!')
      .setAllowResponseEdits(true)
      .setAcceptingResponses(true)
	  .setProgressBar(false);

	// don't create a new trigger if there is already one available
	var triggers = ScriptApp.getUserTriggers(ss);
	if (triggers.length > 0 && // is there already a trigger for onFormSubmit?
		triggers.filter(function(t) { return t.getEventType() == ScriptApp.EventType.ON_FORM_SUBMIT }).length > 0) {
	  Logger.log("we already have an onFormSubmit trigger, so no need to add a new one.");
	}
	else {
	  ScriptApp.newTrigger('onFormSubmit').forSpreadsheet(ss).onFormSubmit().create();
	  Logger.log("setting onFormSubmit trigger");
	}
  }

  // Create the form and add a multiple-choice question for each timeslot.
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  Logger.log("setting form destination to %s", ss.getId());
  PropertiesService.getUserProperties().setProperty("legalese."+ss.getId()+".formActiveSheetId", sheet.getSheetId().toString());
  Logger.log("setting formActiveSheetId to %s", sheet.getSheetId().toString());

  var origentityfields = readRows._origentityfields;
  Logger.log("origentityfields = " + origentityfields);
  for (var i in origentityfields) {
	if (i == undefined) { continue }
	var entityfield = origentityfields[i];
	if (entityfield == undefined) { continue }
	Logger.log("entityfield "+i+" = " + entityfield.fieldname);
	if (i == "undefined") { Logger.log("that's, like, literally the string undefined, btw."); continue; } // yes, this actually happens.
	if (entityfield.itemtype.match(/^list/)) {
	  var enums = entityfield.itemtype.split(' ');
	  enums.shift();

	  // TODO: get this out of the Data Validation https://developers.google.com/apps-script/reference/spreadsheet/data-validation
	  // instead of the Config section.
	  form.addListItem()
		.setTitle(entityfield.fieldname)
		.setRequired(entityfield.required)
		.setChoiceValues(enums)
		.setHelpText(entityfield.helptext);
	}
	else if (entityfield.itemtype.match(/^(email|number)/)) {
	  form.addTextItem()
		.setTitle(entityfield.fieldname)
		.setRequired(entityfield.required)
		.setHelpText(entityfield.helptext);
	  // in the future, when Google Apps Scripts adds validation to its FormApp, validate the input as a valid email address or number as appropriate.
	}
	else if (entityfield.itemtype.match(/^paragraph/)) { // for the address field
	  form.addParagraphTextItem()
		.setTitle(entityfield.fieldname)
		.setRequired(entityfield.required)
		.setHelpText(entityfield.helptext);
	}	  
	else if (entityfield.itemtype.match(/^text/)) {
	  form.addTextItem()
		.setTitle(entityfield.fieldname)
		.setRequired(entityfield.required)
		.setHelpText(entityfield.helptext);
	}	  
	else if (entityfield.itemtype.match(/^hidden/)) {
	  // we don't want to display the Legalese Status field.
	}	  
  }

  if (config["form_extras"] != undefined) {
	for (var i in config.form_extras.values) {
	  var field = asvar_(config.form_extras.values[i]);
	  form.addListItem()
		.setTitle(config[field].dict["name"][0])
		.setRequired(config[field].dict["required"][0])
		.setChoiceValues(config[field].dict["choicevalues"])
		.setHelpText(config[field].dict["helptext"][0]);
	}
  }

  var legalese_root = legaleseRootFolder_();
  legalese_root.addFile(DriveApp.getFileById(form.getId()));
  legalese_root.addFile(DriveApp.getFileById(ss.getId()));
  Logger.log("added to legalese root folder");

  DriveApp.getRootFolder().removeFile(DriveApp.getFileById(form.getId()));
  DriveApp.getRootFolder().removeFile(DriveApp.getFileById(ss.getId()));

  var form_url = form.getPublishedUrl();
  var short_url = form.shortenFormUrl(form_url);
  return short_url;
}

function treeify_(root, arr) {
  if      (arr.length == 2) { root[arr[0]] = arr[1] }
  else if (arr.length == 1) { root[arr[0]] = null   }
  else if (arr.length == 0) { return }
  else                      { if (root[arr[0]] == undefined) root[arr[0]] = {};
							  treeify_(root[arr[0]], arr.slice(1)) }
}


// {
//   "form_extras": {
//     "asRange": {},
//     "values": [
//       "Party Types",
//       "Second Element"
//     ],
//     "dict": {
//       "party_types": [
//         "Second Element"
//       ]
//     }
//   },
//   "party_types": {
//     "asRange": {},
//     "values": [
//       "helptext",
//       "Your role, please."
//     ],
//     "dict": {
//       "name": [
//         "Party Role"
//       ],
//       "choicevalues": [
//         "Founder",
//         "Company",
//         "Investor",
//         "Existing Shareholder"
//       ],
//       "required": [],
//       "helptext": [
//         "Your role, please."
//       ]
//     }
//   },
//   "second_element": {
//     "asRange": {},
//     "values": [
//       "",
//       "",
//       " "
//     ],
//     "dict": {
//       "boo": [],
//       "": [
//         "",
//         " "
//       ]
//     }
//   }
// }


// ---------------------------------------------------------------------------------------------------------------- onFormSubmit
/**
 * A trigger-driven function that sends out calendar invitations and a
 * personalized Google Docs itinerary after a user responds to the form.
 *
 * @param {Object} e The event parameter for form submission to a spreadsheet;
 *     see https://developers.google.com/apps-script/understanding_events
 */
function onFormSubmit(e) {
  Logger.log("onFormSubmit: beginning");

  // URGENT TODO: this needs to key off e.source instead.
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetId = PropertiesService.getUserProperties().getProperty("legalese."+ss.getId()+".formActiveSheetId");

  if (sheetId == undefined) { // uh-oh
	Logger.log("onFormSubmit: no formActiveSheetId property, so I don't know which sheet to record party data into. bailing.");
	return;
  }
  else {
	Logger.log("onFormSubmit: formActiveSheetId property = %s", sheetId);
  }

  var sheet = getSheetById_(SpreadsheetApp.getActiveSpreadsheet(), sheetId);
  var entitiesByName = {}
  var readRows = readRows_(sheet, entitiesByName);
  var data   = readRows.terms;
  var config = readRows.config;

  // add a row and insert the investor fields
  Logger.log("onFormSubmit: inserting a row after " + (parseInt(readRows._last_entity_row)+1));
  sheet.insertRowAfter(readRows._last_entity_row+1); // might need to update the commitment sum range
  var newrow = sheet.getRange(readRows._last_entity_row+2,1,1,sheet.getMaxColumns());
//  newrow.getCell(0,0).setValue("bar");

  // loop through the origentityfields inserting the new data in the right place.
  for (names in e.namedValues) {
	Logger.log("onFormSubmit: e.namedValues = " + names + ": "+e.namedValues[names][0]);
  }

  var origentityfields = readRows._origentityfields;
  Logger.log("onFormSubmit: origentityfields = " + origentityfields);

  for (var i = 0; i < origentityfields.length; i++) {
	var entityfield = origentityfields[i];

	// fill in the default party role
	if (i == 0 && entityfield == undefined) {
	  entityfield = { fieldname: "_party_role", column: 1 };
	  e.namedValues["_party_role"] = [ config.default_party_role ? config.default_party_role.value : "" ];
	  Logger.log("setting default party row in column 1 to %s", e.namedValues["_party_role"]);
	}
	  
	else if (entityfield == undefined) { Logger.log("entityfield %s is undefined!", i); continue; }
	
	// fill in any fields which are hidden and have a default value configured. maybe in future we should extend the default-filling to all blank submissions
	else if (e.namedValues[entityfield.fieldname] == undefined) {
	  Logger.log("did not receive form submission for %s", entityfield.fieldname);

	  if (entityfield["default"] != undefined) {
		Logger.log("filling with default value %s", entityfield["default"]);
		e.namedValues[entityfield.fieldname] = [ entityfield["default"] ];
	  }
	  else {
		continue;
	  }
	}

	Logger.log("onFormSubmit: entityfield "+i+" (" + entityfield.fieldname+") (column="+entityfield.column+") = " + e.namedValues[entityfield.fieldname][0]);

	var newcell = newrow.getCell(1,parseInt(entityfield.column));
	Logger.log("onFormSubmit: setting value of cell to " + e.namedValues[entityfield.fieldname]);
	newcell.setValue(e.namedValues[entityfield.fieldname][0]);
  }
}

function hyperlink2sheet_(hyperlink) { // input: either a =HYPERLINK formula or just a regular URL of the form https://docs.google.com/a/jfdi.asia/spreadsheets/d/1y8BdKfGzn3IrXK9qrlzKH2IHo4fR-GulXQnMp0hrVIU/edit#gid=1382748166
  var res = hyperlink.match(/\/([^\/]+)\/edit#gid=(\d+)/); // JS doesn't need us to backslash the / in [] but it helps emacs js-mode
  if (res) {
	return getSheetById_(SpreadsheetApp.openById(res[1]), res[2]);
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------- readRows
/**
 * populate a number of data structures, all kept in "toreturn".
 * you can think of this as a constructor, basically, that represents the sheet, but is agnostic as to the specific data.parties that are needed by each template.
 * the data.parties get filled in by the template matcher, because different templates involve different parties.
 *
 * the ENTITIES go into entitiesByName
 * the TERMS go into data.* directly.
 */
function readRows_(sheet, entitiesByName) {
  Logger.log("readRows_: will use sheet " + sheet.getName());
  var rows = sheet.getDataRange();
  var numRows  = rows.getNumRows();
  var values   = rows.getValues();
  var formulas = rows.getFormulas();
  var formats  = rows.getNumberFormats();

  var toreturn =   { terms            : {},
					 config           : {},
					 entitiesByName   : entitiesByName,
					 _origentityfields: [],
					 _entityfields    : [],
					 _last_entity_row : null,
					 // principal gets filled in later.
				   };

  var terms = toreturn.terms;
  var config = toreturn.config;
  var origentityfields = toreturn._origentityfields; // used by the form
  var entityfields = toreturn._entityfields;
  var principal, roles = {};

  var section = "prologue";
  var entityfieldorder = []; // table that remaps column number to order-in-the-form
  // maybe we should do it this way and just synthesize the partygroups as needed, along with any other filters.
  var previous = [];

  Logger.log("readRows: starting to parse %s / %s", sheet.getParent().getName(), sheet.getSheetName());

// get the formats for the B column -- else we won't know what currency the money fields are in.
  var term_formats = sheet.getRange(1,2,numRows).getNumberFormats();

  var es_num = 1; // for email ordering the EchoSign fields

  var seen_entities_before = false;

  for (var i = 0; i <= numRows - 1; i++) {
    var row = values[i];
	// process header rows
	if (row.filter(function(c){return c.length > 0}).length == 0) { Logger.log("readRows: row %s is blank, skipping", i);  continue; }
	else 	Logger.log("readRows: row " + i + ": processing row "+row[0]);
    if      (row[0] == "KEY TERMS" ||
			 row[0] == "TERMS") { section="TERMS"; continue; }
    else if (row[0] == "IGNORE")    { section = row[0]; continue; }
    else if (row[0] == "CAP TABLE") { section = row[0]; continue; }
    else if (row[0] == "INCLUDE") {
	  // the typical startup agreement sheet INCLUDEs its Entities sheet which INCLUDEs JFDI.2014's Entities which INCLUDEs JFDI.Asia's Entities
	  var include_sheet;
	  var formula = formulas[i][1];
	  if (formula) {
		// =HYPERLINK("https://docs.google.com/a/jfdi.asia/spreadsheets/d/1Ix5OYS7EpmEIqA93S4_JWxV1OO82tRM0MLNj9C8IwHU/edit#gid=1249418813","Entities JFDI.2014")
		include_sheet = hyperlink2sheet_(formula);
	  }
	  else {
		include_sheet = sheet.getParent().getSheetByName(row[1]);
	  }
	  
	  Logger.log("readRows(%s): encountered INCLUDE %s", sheet.getSheetName(), row[1]);
	  if (include_sheet == undefined) { throw("unable to fetch included sheet " + row[1]) }
	  
	  var includedReadRows = readRows_(include_sheet, entitiesByName);
	  Logger.log("readRows(%s): back from INCLUDE %s; returned principal = %s",
				 sheet.getSheetName(), row[1], includedReadRows.principal ? includedReadRows.principal.name : undefined);
	  // hopefully we've learned about a bunch of new Entities directly into the entitiesByName shared dict.
	  // we throw away the returned object because we don't really care about the included sheet's terms or config.

	  if (principal == undefined) { principal = includedReadRows.principal }

	  if (row[2] != undefined && row[2].length) {
		// if row[2] says "TERMS" then we include the TERMS as well.
		if (row[2] == "TERMS") {
		  Logger.log("readRows(%s): including TERMS as well.", sheet.getSheetName());
		  for (var ti in includedReadRows.terms) {
			terms[ti] = includedReadRows.terms[ti];
		  }
		}
		else {
		  Logger.log("WARNING: readRows(%s): unexpected row[2]==%s ... wtf. should only be TERMS if anything", sheet.getSheetName(), row[2]);
		}
	  }

	  continue;
	}
    else if (row[0] == "PARTYFORM_ORDER") { section=row[0]; for (var ki in row) { if (ki<1||row[ki]==undefined||!row[ki]){continue}
																				  entityfieldorder[ki] = row[ki];
																				  // Logger.log("readRows: PARTYFORM_ORDER: entityfieldorder[%s] = %s", ki, row[ki]);
																				  origentityfields[entityfieldorder[ki]] = origentityfields[entityfieldorder[ki]]||{};
																				  origentityfields[entityfieldorder[ki]].column = parseInt(ki)+1;
																				  origentityfields[entityfieldorder[ki]].row    = i+1;
																				  // Logger.log("readRows: learned that field with order "+row[ki]+ " is in row %s column %s ", origentityfields[entityfieldorder[ki]].row, origentityfields[entityfieldorder[ki]].column);
																				}
											continue;
										  }
    else if (row[0] == "PARTYFORM_HELPTEXT") { section=row[0]; for (var ki in row) { if (ki<1||row[ki]==undefined||entityfieldorder[ki]==undefined){continue}
																					 origentityfields[entityfieldorder[ki]].helptext = row[ki];
																				   }
											continue;
										  }
    else if (row[0] == "PARTYFORM_ITEMTYPE") { section=row[0]; for (var ki in row) { if (ki<1||row[ki]==undefined||entityfieldorder[ki]==undefined){continue}
																					 origentityfields[entityfieldorder[ki]].itemtype = row[ki];
																				   }
											continue;
										  }
    else if (row[0] == "PARTYFORM_DEFAULT") { section=row[0]; for (var ki in row) { if (ki<1||row[ki]==undefined||entityfieldorder[ki]==undefined||row[ki].length==0){continue}
																					// Logger.log("readRows: learned default value for %s = %s", entityfieldorder[ki], row[ki]);
																					 origentityfields[entityfieldorder[ki]]["default"] = row[ki];
																				   }
											continue;
										  }
    else if (row[0] == "PARTYFORM_REQUIRED") { section=row[0]; for (var ki in row) { if (ki<1||row[ki]==undefined||entityfieldorder[ki]==undefined){continue}
																					 // Logger.log("readRows: line "+i+" col "+ki+": learned that field with order "+entityfieldorder[ki]+ " has required="+row[ki]);
																					 origentityfields[entityfieldorder[ki]].required = row[ki];
																				   }
											continue;
										  }
    else if (row[0] == "ENTITIES" || row[0] == "PARTIES")   {
	  section = "ENTITIES";
	  if (! seen_entities_before) {
		seen_entities_before = true;
		entityfields = row;
		while (row[row.length-1] === "") { row.pop() }
		
		for (var ki in entityfields) {
		  if (ki < 1 || row[ki] == undefined) { continue }
          origentityfields[entityfieldorder[ki]] = origentityfields[entityfieldorder[ki]] || {};
          origentityfields[entityfieldorder[ki]].fieldname = row[ki];
		  // Logger.log("readRows: learned origentityfields["+entityfieldorder[ki]+"].fieldname="+row[ki]);
          entityfields[ki] = asvar_(entityfields[ki]);
		  // Logger.log("readRows(%s): recorded entityfield[%s]=%s", sheet.getSheetName(), ki, entityfields[ki]);
		}
	  }
	  continue;
	}
	else if (row[0] == "CONFIGURATION") { section = row[0]; continue }
	else if (row[0] == "ROLES") { section = row[0]; continue; }

	// process data rows
    if (section == "TERMS") {
      if ( row[0].length == 0) { continue }

	  // TODO: do we need to ignore situations where row[0] !~ /:$/ ? subsection headings might be noisy.
	  var asvar = asvar_(row[0]);
      terms[           asvar] = formatify_(term_formats[i][0], row[1], sheet, asvar);
	  // formatify_() returns a string. if you want the original value, get it from
	  terms["_orig_"       + asvar] = row[1];
	  terms["_format" + asvar] = term_formats[i][0];
	  Logger.log("readRows(%s): TERMS: %s = %s --> %s (%s)", sheet.getSheetName(), asvar, row[1], terms[asvar], (terms[asvar]==undefined?"undef":terms[asvar].constructor.name));
    }
	else if (section == "ROLES") { // principal relation entity. these are all strings. we attach other details
	  var relation  = asvar_(row[0]);
	  var entityname    = row[1];

	  if (relation == "ignore") { Logger.log("ignoring %s line %s", relation, row[1]); continue }

	  roles[relation] = roles[relation] || [];

	  var matches; // there is similar code elsewhere in buildTemplate()
	  if (matches = entityname.match(/^\[(.*)\]$/)) {
		// Shareholder: [Founder]
		// means all founders are also shareholders and we should populate the Shareholder parties accordinlgy

		var to_import = asvar_(matches[1]);

		// TODO: sanity check so we don't do a reflexive assignment
		
		Logger.log("readRows(%s):         ROLES: merging role %s = %s", sheet.getSheetName(), relation, to_import);
		if (! (roles[to_import] && roles[to_import].length)) {
		  Logger.log("readRows(%s):         ERROR: roles[%s] is useless to us", sheet.getSheetName(), to_import);
		  Logger.log("readRows(%s):         ERROR: maybe we can find it under the principal's roles?");
		  if (principal.roles[to_import] && principal.roles[to_import].length) {
			Logger.log("readRows(%s):         HANDLED: found it in principal.roles");
			roles[relation] = roles[relation].concat(principal.roles[to_import]);
		  }		  
		  continue;
		}
		else {
		  Logger.log("readRows(%s):         ROLES: before, roles[%s] = %s", sheet.getSheetName(), relation, roles[relation]);
		  roles[relation] = roles[relation].concat(roles[to_import]);
		  Logger.log("readRows(%s):         ROLES: after, roles[%s] = %s", sheet.getSheetName(), relation, roles[relation]);
		}

		if (row[2]) {
		  Logger.log("WARNING: readRows(%s): [merge] syntax doesn't currently support extended attributes.");
		  // but there's no reason it couldn't ... just gotta tweak the code below.
		}
	  }
	  else {
		var entity = entitiesByName[entityname];
		roles[relation].push(entityname);
		Logger.log("readRows(%s):         ROLES: learning party role %s = %s", sheet.getSheetName(), relation, entityname);
		
		for (var role_x = 2; role_x < row.length; role_x+=2) {
		  if (row[role_x] && row[role_x+1] != undefined) {
			Logger.log("ROLES: learning attribute %s.%s = %s", entityname, asvar_(row[role_x]), formatify_(formats[i][role_x+1], row[role_x+1], sheet));
			entity[asvar_(row[role_x])] = formatify_(formats[i][role_x+1], row[role_x+1], sheet, asvar_(row[role_x]));
			entity["_format_" + asvar_(row[role_x])] = formats[i][role_x+1];
			entity["_orig_"   + asvar_(row[role_x])] = row[role_x+1];
		  }
		}
	  }
	}
    else if (section == "ENTITIES") {
      var entity = { _origin_spreadsheet_id:sheet.getParent().getId(),
					 _origin_sheet_id:sheet.getSheetId(),
					 _spreadsheet_row:i+1,
					 roleEntities: function(roleName) { return this.roles[roleName].map(function(n){return entitiesByName[n]}) }
				   };
      var entity_formats = sheet.getRange(i+1,1,1,row.length).getNumberFormats();

      var coreRelation = asvar_(row[0]);
	  if (coreRelation == undefined || ! coreRelation.length) { continue }
	  if (coreRelation.toLowerCase() == "ignore") { Logger.log("ignoring %s line %s", coreRelation, row[1]); continue }

	  toreturn._last_entity_row = i;
	  
      for (var ki in entityfields) {
        if (ki < 1) { continue }
        var k = entityfields[ki];
        var v = formatify_(entity_formats[0][ki], row[ki], sheet, k);
        entity[k] = v;
		entity["_format_" + k] = entity_formats[0][ki];
		entity["_orig_"   + k] = row[ki];
		if (v && v.length) { entity["_"+k+"_firstline"] = v.replace(/\n.*/g, ""); }
//		Logger.log("INFO: field %s, ran formatify_(%s, %s) (%s), got %s (%s)",
//				   k, entity_formats[0][ki], row[ki], (row[ki] != undefined ? row[ki].constructor.name : "undef"), v, v.constructor.name);
      }

	  // all coreRelation relations in the ENTITIES section are defined relative to the principal, which is hardcoded as the first Company to appear
	  if (coreRelation == "company" && principal == undefined) { principal = entity }

  // connect up the parties based on the relations learned from the ROLES section.
  // this establishes PRINCIPAL.roles.RELATION_NAME = [ party1, party2, ..., partyN ]
  // for instance, companyParty.roles.shareholder = [ alice, bob ]
      Logger.log("readRows: learning entity (core relation = %s), %s", coreRelation, entity.name);
	  roles[coreRelation] = roles[coreRelation] || [];
	  roles[coreRelation].push(entity.name);

	  if (entitiesByName[entity.name] != undefined) {
		Logger.log("WARNING: entity %s was previously defined somewhere in the include chain ... not clobbering.");
	  } else {
		// Define Global Parties Entity
		entitiesByName[entity.name] = entity;
	  }
    }
	else if (section == "CONFIGURATION") {

	  // each config row produces multiple representations:
	  // config.columna.values is an array of values -- if columna repeats, then values from last line only
	  // config.columna.dict is a dictionary of b: [c,d,e] across multiple lines
	  
	  Logger.log("CONF: row " + i + ": processing row "+row[0]);
	  
	  // populate the previous
	  var columna = asvar_(row[0]) || previous[0];
	  if (columna == "template") { columna = "templates"; Logger.log("CONF: correcting 'template' to 'templates'"); }
	  previous[0] = columna;

	  Logger.log("CONF: columna="+columna);

	  config[columna] = config[columna] || { asRange:null, values:null, dict:{}, tree:{} };
	  Logger.log("CONF: config[columna]="+config[columna]);

	  config[columna].asRange = sheet.getRange(i+1,1,1,sheet.getMaxColumns());
	  Logger.log("CONF: " + columna+".asRange=" + config[columna].asRange.getValues()[0].join(","));

	  var rowvalues = config[columna].asRange.getValues()[0];
	  while (rowvalues[rowvalues.length-1] === "") { rowvalues.pop() }
	  Logger.log("CONF: rowvalues = %s", rowvalues);

	  var descended = [columna];

	  var leftmost_nonblank = -1;
	  for (var j = 0; j < rowvalues.length; j++) {
		if (leftmost_nonblank == -1
			&& (! (rowvalues[j] === ""))) { leftmost_nonblank = j }
	  }
	  Logger.log("CONF: leftmost_nonblank=%s", leftmost_nonblank);

	  for (var j = 0; j < leftmost_nonblank; j++) {
		descended[j] = previous[j];
	  }
	  for (var j = leftmost_nonblank; j < rowvalues.length; j++) {
		if (j >= 1 && ! (rowvalues[j] === "")) { previous[j] = rowvalues[j] }
		descended[j] = rowvalues[j];
	  }
	  Logger.log("CONF: descended = %s", descended);

	  // build value -- config.a.value = b
	  config[columna].value = descended[1];

	  // build values -- config.a.values = [b,c,d]
	  config[columna].values = descended.slice(1);
	  Logger.log("CONF: " + columna+".values=%s", config[columna].values.join(","));

	  // build tree -- config.a.tree.b.c.d.e.f=g
	  treeify_(config[columna].tree, descended.slice(1));

	  // build dict -- config.a.dict.b = [c,d,e]
	  var columns_cde = config[columna].values.slice(1);
	  if (columns_cde[0] == undefined) { continue }
	  var columnb = asvar_(descended[1]);

	  config[columna].dict[columnb] = columns_cde;
	  Logger.log("CONF: %s", columna+".dict."+columnb+"=" + config[columna].dict[columnb].join(","));
	}
  }

  toreturn.principal = principal;
  Logger.log("readRows(%s): setting toreturn.principal = %s", sheet.getSheetName(), principal.name);

  toreturn.principal.roles = toreturn.principal.roles || {};

  // set up the principal's .roles property.
  // also configure the vassals' _role property, though nothing uses this at the moment.
  for (var k in roles) {
	toreturn.principal.roles[k] = roles[k];
	Logger.log("readRows(%s): principal %s now has %s %s roles", sheet.getSheetName(), toreturn.principal.name, roles[k].length, k);
	for (var pi in roles[k]) {
	  var entity = entitiesByName[roles[k][pi]];
	  if (entity == undefined) { throw(k + " role " + roles[k][pi] + " refers to an entity that is not defined!") }
	  entity._role = entity._role || {};
	  entity._role[toreturn.principal.name] = entity._role[toreturn.principal.name] || [];
	  entity._role[toreturn.principal.name].push(k);
	  Logger.log("readRows(%s): VASSAL: entity %s knows that it is a %s to %s",
				 sheet.getSheetName(),
				 entity.name,
				 k,
				 toreturn.principal.name);
	}
  }
  var entityNames = []; for (var eN in entitiesByName) { entityNames.push(eN) }
  Logger.log("readRows(%s): have contributed to entitiesByName = %s", sheet.getSheetName(), entityNames);
  var entityNames = []; for (var eN in toreturn.entitiesByName) { entityNames.push(eN) }
  Logger.log("readRows(%s): toreturn's entitiesByName = %s", sheet.getSheetName(), entityNames);
//  Logger.log("readRows: config = %s\n", JSON.stringify(config,null,"  "));
  return toreturn;
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

// ---------------------------------------------------------------------------------------------------------------- asvar_
function asvar_(str) {
  if (str == undefined) { return undefined }
  return str.toString()
	.replace(/'/g, "")    // "investor's things" becomes "investors_things"
	.replace(/\W/g, "_")
	.replace(/^_+/, "")
	.replace(/_+$/, "")
	.toLowerCase();
}

// ---------------------------------------------------------------------------------------------------------------- formatify_
// the test cases reside at https://docs.google.com/spreadsheets/d/1ePst75jTH4MUimRs0PE-OdSmVHl-_dnXSKGe2ybcrzc/edit#gid=1160659087

// we want to match whatever the spreadsheet displays.
//     INPUT VALUE       INPUT FORMAT           SHOWN BY GOOGLE
// a1  999.9999          ""                     999.9999
// a2  999.9999          [$S$]#,##0.000         S$1,000.000
// a3  999.9999          #,##0.000              1,000.000
// a4  999.9999          #,##0                  1,000
// a5  999.9999          [$S$]#,##0             S$1,000
// a6  999.9999          #,##0.00000            999.99990
// a7  999.9999          0.###############      999.9999
// a8  999.9999          0.00%                  99999.99%
// a9  999.9999          0.0%                   100000.0%
//a10  999.9999          0%                     100000%
//a11  999.9999          0.00                   1000.00
//a12  999.9999          0                      1000
//
// b1  1000              ""                     1000
// b2  1000              [$S$]#,##0.000         S$1,000.000
// b3  1000              #,##0.000              1,000.000
// b4  1000              #,##0                  1,000
// b5  1000              [$S$]#,##0             S$1,000
// b6  1000              #,##0.00000            1,000.00000
// b7  1000              0.###############      1000
//
// c1  not a number lol  #,##0.00               not a number lol
// c2  ""                #,##0.00               ""
// c3  ""                0.###############      ""
// c4  ""                ""                     ""
//
// d1  -999.9999         ""                     -999.9999
// d2  -999.9999         [$S$]#,##0.000         -S$1,000.000
// d3  -999.9999         #,##0.000              -1,000.000
// d4  -999.9999         #,##0                  -1,000
// d5  -999.9999         [$S$]#,##0             -S$1,000
// d6  -999.9999         #,##0.00000            -999.99990
// d7  -999.9999         0.###############      -999.9999
// d8  -999.9999         0.00%                  -99999.99%
// d9  -999.9999         0.0%                   -100000.0%
// d10 -999.9999         0%                     -100000%

// readRows: row 8: processing row  test a var 1:
// formatify_(, 999.9999) called. the input string is a String
// INFO: formatify(String) fell to default; will toString()
// INFO: formatify_(,999.9999) = 999.9999 (String)
// readRows(Incorporation): TERMS: test_a_var_1 = 999.9999 --> 999.9999 (String)

// readRows: row 9: processing row test a var 2:
// formatify_([$S$]#,##0.000, 999.9999) called. the input string is a Number
// asCurrency_([$S$]#,##0.000,999.9999,undefined)
// asCurrency_() chop = 3.0
// digitCommas_(999.9999,3.0,undefined): returning 1,000.000
// INFO: formatify_([$S$]#,##0.000,999.9999) = S$1,000.000 (String)
// readRows(Incorporation): TERMS: test_a_var_2 = 999.9999 --> S$1,000.000 (String)

// readRows: row 10: processing row test a var 3:
// formatify_(#,##0.000, 999.9999) called. the input string is a Number
// digitCommas_(999.9999,3.0,undefined): returning 1,000.000
// INFO: formatify_(#,##0.000,999.9999) = 1,000.000 (String)
// readRows(Incorporation): TERMS: test_a_var_3 = 999.9999 --> 1,000.000 (String)

// readRows: row 11: processing row test a var 4:
// formatify_(#,##0, 999.9999) called. the input string is a Number
// digitCommas_(999.9999,0.0,undefined): returning 1,000
// INFO: formatify_(#,##0,999.9999) = 1,000 (String)
// readRows(Incorporation): TERMS: test_a_var_4 = 999.9999 --> 1,000 (String)

// readRows: row 12: processing row test a var 5:
// formatify_([$S$]#,##0, 999.9999) called. the input string is a Number
// asCurrency_([$S$]#,##0,999.9999,undefined)
// asCurrency_() chop = 0.0
// digitCommas_(999.9999,0.0,undefined): returning 1,000
// INFO: formatify_([$S$]#,##0,999.9999) = S$1,000 (String)
// readRows(Incorporation): TERMS: test_a_var_5 = 999.9999 --> S$1,000 (String)

// readRows: row 13: processing row test a var 6:
// formatify_(#,##0.00000, 999.9999) called. the input string is a Number
// digitCommas_(999.9999,5.0,undefined): returning 999.99990
// INFO: formatify_(#,##0.00000,999.9999) = 999.99990 (String)
// readRows(Incorporation): TERMS: test_a_var_6 = 999.9999 --> 999.99990 (String)

// readRows: row 14: processing row test a var 7:
// formatify_(0.###############, 999.9999) called. the input string is a Number
// INFO: formatify_(0.###############,999.9999) = 999.9999 (String)
// readRows(Incorporation): TERMS: test_a_var_7 = 999.9999 --> 999.9999 (String)

// readRows: row 15: processing row test a var 8:
// formatify_(0.00%, 999.9999) called. the input string is a Number
// INFO: formatify_(0.00%,999.9999) = 99999.99 (String)
// readRows(Incorporation): TERMS: test_a_var_8 = 999.9999 --> 99999.99 (String)

// readRows: row 16: processing row test a var 9:
// formatify_(0.0%, 999.9999) called. the input string is a Number
// INFO: formatify_(0.0%,999.9999) = 100000.0 (String)
// readRows(Incorporation): TERMS: test_a_var_9 = 999.9999 --> 100000.0 (String)

// readRows: row 17: processing row test a var 10:
// formatify_(0%, 999.9999) called. the input string is a Number
// INFO: formatify_(0%,999.9999) = 100000 (String)
// readRows(Incorporation): TERMS: test_a_var_10 = 999.9999 --> 100000 (String)

// readRows: row 18: processing row test a var 11:
// formatify_(0.00, 999.9999) called. the input string is a Number
// INFO: formatify_(0.00,999.9999) = 1000.00 (String)
// readRows(Incorporation): TERMS: test_a_var_11 = 999.9999 --> 1000.00 (String)

// readRows: row 19: processing row test a var 12:
// formatify_(0, 999.9999) called. the input string is a Number
// INFO: formatify_(0,999.9999) = 1000 (String)
// readRows(Incorporation): TERMS: test_a_var_12 = 999.9999 --> 1000 (String)

// readRows: row 20: processing row test b var 1:
// formatify_(, 1000) called. the input string is a String
// INFO: formatify(String) fell to default; will toString()
// INFO: formatify_(,1000) = 1000 (String)
// readRows(Incorporation): TERMS: test_b_var_1 = 1000 --> 1000 (String)

// readRows: row 21: processing row test b var 2:
// formatify_([$S$]#,##0.000, 1000.0) called. the input string is a Number
// asCurrency_([$S$]#,##0.000,1000.0,undefined)
// asCurrency_() chop = 3.0
// digitCommas_(1000.0,3.0,undefined): returning 1,000.000
// INFO: formatify_([$S$]#,##0.000,1000) = S$1,000.000 (String)
// readRows(Incorporation): TERMS: test_b_var_2 = 1000.0 --> S$1,000.000 (String)

// readRows: row 22: processing row test b var 3:
// formatify_(#,##0.000, 1000.0) called. the input string is a Number
// digitCommas_(1000.0,3.0,undefined): returning 1,000.000
// INFO: formatify_(#,##0.000,1000) = 1,000.000 (String)
// readRows(Incorporation): TERMS: test_b_var_3 = 1000.0 --> 1,000.000 (String)

// readRows: row 23: processing row test b var 4:
// formatify_(#,##0, 1000.0) called. the input string is a Number
// digitCommas_(1000.0,0.0,undefined): returning 1,000
// INFO: formatify_(#,##0,1000) = 1,000 (String)
// readRows(Incorporation): TERMS: test_b_var_4 = 1000.0 --> 1,000 (String)

// readRows: row 24: processing row test b var 5:
// formatify_([$S$]#,##0, 1000.0) called. the input string is a Number
// asCurrency_([$S$]#,##0,1000.0,undefined)
// asCurrency_() chop = 0.0
// digitCommas_(1000.0,0.0,undefined): returning 1,000
// INFO: formatify_([$S$]#,##0,1000) = S$1,000 (String)
// readRows(Incorporation): TERMS: test_b_var_5 = 1000.0 --> S$1,000 (String)

// readRows: row 25: processing row test b var 6:
// formatify_(#,##0.00000, 1000.0) called. the input string is a Number
// digitCommas_(1000.0,5.0,undefined): returning 1,000.00000
// INFO: formatify_(#,##0.00000,1000) = 1,000.00000 (String)
// readRows(Incorporation): TERMS: test_b_var_6 = 1000.0 --> 1,000.00000 (String)

// readRows: row 26: processing row test b var 7:
// formatify_(0.###############, 1000.0) called. the input string is a Number
// INFO: formatify_(0.###############,1000) = 1000 (String)
// readRows(Incorporation): TERMS: test_b_var_7 = 1000.0 --> 1000 (String)

// readRows: row 27: processing row test c var 1:
// formatify_(#,##0.00, not a number lol) called. the input string is a String
// INFO: formatify(String) fell to default; will toString()
// INFO: formatify_(#,##0.00,not a number lol) = not a number lol (String)
// readRows(Incorporation): TERMS: test_c_var_1 = not a number lol --> not a number lol (String)

// readRows: row 28: processing row test c var 2:
// formatify_(#,##0.00, ) called. the input string is a String
// INFO: formatify(String) fell to default; will toString()
// INFO: formatify_(#,##0.00,) =  (String)
// readRows(Incorporation): TERMS: test_c_var_2 =  -->  (String)

// readRows: row 29: processing row test c var 3:
// formatify_(0.###############, ) called. the input string is a String
// INFO: formatify(String) fell to default; will toString()
// INFO: formatify_(0.###############,) =  (String)
// readRows(Incorporation): TERMS: test_c_var_3 =  -->  (String)

// readRows: row 30: processing row test c var 4:
// formatify_(, ) called. the input string is a String
// INFO: formatify(String) fell to default; will toString()
// INFO: formatify_(,) =  (String)
// readRows(Incorporation): TERMS: test_c_var_4 =  -->  (String)

// readRows: row 31: processing row  test d var 1:
// formatify_(, -999.9999) called. the input string is a String
// INFO: formatify(String) fell to default; will toString()
// INFO: formatify_(,-999.9999) = -999.9999 (String)
// readRows(Incorporation): TERMS: test_d_var_1 = -999.9999 --> -999.9999 (String)

// readRows: row 32: processing row test d var 2:
// formatify_([$S$]#,##0.000, -999.9999) called. the input string is a Number
// asCurrency_([$S$]#,##0.000,-999.9999,undefined)
// asCurrency_() chop = 3.0
// digitCommas_(-999.9999,3.0,undefined): returning -1,000.000
// INFO: formatify_([$S$]#,##0.000,-999.9999) = S$-1,000.000 (String)
// readRows(Incorporation): TERMS: test_d_var_2 = -999.9999 --> S$-1,000.000 (String)

// readRows: row 33: processing row test d var 3:
// formatify_(#,##0.000, -999.9999) called. the input string is a Number
// digitCommas_(-999.9999,3.0,undefined): returning -1,000.000
// INFO: formatify_(#,##0.000,-999.9999) = -1,000.000 (String)
// readRows(Incorporation): TERMS: test_d_var_3 = -999.9999 --> -1,000.000 (String)

// readRows: row 34: processing row test d var 4:
// formatify_(#,##0, -999.9999) called. the input string is a Number
// digitCommas_(-999.9999,0.0,undefined): returning -1,000
// INFO: formatify_(#,##0,-999.9999) = -1,000 (String)
// readRows(Incorporation): TERMS: test_d_var_4 = -999.9999 --> -1,000 (String)

// readRows: row 35: processing row test d var 5:
// formatify_([$S$]#,##0, -999.9999) called. the input string is a Number
// asCurrency_([$S$]#,##0,-999.9999,undefined)
// asCurrency_() chop = 0.0
// digitCommas_(-999.9999,0.0,undefined): returning -1,000
// INFO: formatify_([$S$]#,##0,-999.9999) = S$-1,000 (String)
// readRows(Incorporation): TERMS: test_d_var_5 = -999.9999 --> S$-1,000 (String)

// readRows: row 36: processing row test d var 6:
// formatify_(#,##0.00000, -999.9999) called. the input string is a Number
// digitCommas_(-999.9999,5.0,undefined): returning -999.99990
// INFO: formatify_(#,##0.00000,-999.9999) = -999.99990 (String)
// readRows(Incorporation): TERMS: test_d_var_6 = -999.9999 --> -999.99990 (String)

// readRows: row 37: processing row test d var 7:
// formatify_(0.###############, -999.9999) called. the input string is a Number
// INFO: formatify_(0.###############,-999.9999) = -999.9999 (String)
// readRows(Incorporation): TERMS: test_d_var_7 = -999.9999 --> -999.9999 (String)

// readRows: row 38: processing row test d var 8:
// formatify_(0.00%, -999.9999) called. the input string is a Number
// INFO: formatify_(0.00%,-999.9999) = -99999.99 (String)
// readRows(Incorporation): TERMS: test_d_var_8 = -999.9999 --> -99999.99 (String)

// readRows: row 39: processing row test d var 9:
// formatify_(0.0%, -999.9999) called. the input string is a Number
// INFO: formatify_(0.0%,-999.9999) = -100000.0 (String)
// readRows(Incorporation): TERMS: test_d_var_9 = -999.9999 --> -100000.0 (String)

// readRows: row 40: processing row test d var 10:
// formatify_(0%, -999.9999) called. the input string is a Number
// INFO: formatify_(0%,-999.9999) = -100000 (String)
// readRows(Incorporation): TERMS: test_d_var_10 = -999.9999 --> -100000 (String)

function formatify_(format, string, sheet, fieldname) {
  var toreturn;
  var chop = 0;
  var mymatch;

  if (format != undefined) {
	// Logger.log("formatify_(%s, %s) called. the input string is a %s", format, string, string != undefined ? string.constructor.name : "undef");
    var matches;
	// currency: [$S$]#,##0.000
    if (matches = format.match(/\[\$(.*)\]/)) {
	  toreturn = asCurrency_(format, string);
    }
	// percentage: 0%  0.0%  0.00%
    else if (format.match(/%$/)) {
	  if (mymatch = format.match(/0\.(0+)/)) { chop = mymatch[1].length }
      toreturn = (string * 100).toFixed(chop);
    }
	// date
    else if (format.match(/yyyy/)) {
    // INFO: expanding term Fri Dec 19 2014 00:00:00 GMT+0800 (HKT) with format yyyy"-"mm"-"dd
    // INFO: expanding term Thu Jan 15 2015 00:00:00 GMT+0800 (HKT) with format yyyy"-"mm"-"dd
      // toreturn = string.toString().substr(0,15).replace(/ 0/, " ");  // Jan 01 2015 => Jan 1 2015

	  if (string.toString().length == 0) { return "" }
//	  Logger.log("input date: " + string.toString().substr(0,15));
	  toreturn = Utilities.formatDate(new Date(string.toString().substr(0,15)),
									  sheet.getParent().getSpreadsheetTimeZone(),
									  "EEEE d MMMM YYYY");
//	  Logger.log("output date: " + toreturn);

    }
	// automatic: 0   0.0   0.00
	else if (format.match(/^0/) && ! format.match(/%|#/) && string.constructor.name == "Number") {
	  if (mymatch = format.match(/0\.(0+)/)) { chop = mymatch[1].length }
	  toreturn = string.toFixed(chop);
	}
	// automatic: 0.###############
	else if (format.match(/^0/) && string.constructor.name == "Number") {
	  toreturn = string.toString();
	}
	// number:  #,##0.000   #,##0
	else if (format.match(/^#.*#0/) && string.constructor.name == "Number") {
	  if (mymatch = format.match(/0\.(0+)/)) { chop = mymatch[1].length }
	  toreturn = digitCommas_(string, chop);
	}
	else {
	  // Logger.log("INFO: formatify(%s) fell to default; will toString()", string.constructor.name);
	  toreturn = string.toString();
	}
  }
  else { toreturn = string }
  // Logger.log("INFO: formatify_("+format+","+string+") = "+toreturn+ " ("+toreturn.constructor.name+")");
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


// ---------------------------------------------------------------------------------------------------------------- otherSheets
function otherSheets_() {
  var activeRange = SpreadsheetApp.getActiveRange(); // user-selected range
  var rangeValues = activeRange.getValues();
  var toreturn = [];
  for (var i = 0; i < rangeValues.length; i++) {
	var myRow = activeRange.getSheet().getRange(activeRange.getRow()+i, 1, 1, 10);
	Logger.log("you are interested in row " + myRow.getValues()[0]);
	var ss;
	try { ss = SpreadsheetApp.openById(myRow.getValues()[0][0]) } catch (e) {
	  Logger.log("couldn't open indicated spreadsheet ... probably on wrong row. %s", e);
	  throw("is your selection on the correct row?");
	  return;
	}
	var sheet = getSheetById_(ss, myRow.getValues()[0][1])
	Logger.log("smoochy says otherSheets: sheet %s is on row %s", i.toString(), myRow.getRowIndex().toString());
	myRow.getCell(1,3).setValue("=HYPERLINK(\""
								+sheet.getParent().getUrl()
								+"#gid="
								+sheet.getSheetId()
								+"\",\""
								+sheet.getParent().getName() + " / " + sheet.getName()
								+"\")");
	toreturn.push(sheet);
  }
  return toreturn;
}

// ---------------------------------------------------------------------------------------------------------------- quicktest
function quicktest() {

  var toreturn = "";
  var mydate = new Date("Mar 1 2015 12:02:03 GMT+0000 (UTC)");
  toreturn = toreturn + "date: " + mydate.toString() + "\n";
  toreturn = toreturn + "mar 1 UTC: " + Utilities.formatDate(mydate, "UTC", "EEEE d MMMM YYYY HH:mm:ss") + "\n";
  toreturn = toreturn + "mar 1 SGT: " + Utilities.formatDate(mydate, "SGT", "EEEE d MMMM YYYY HH:mm:ss") + "\n";
  toreturn = toreturn + "mar 1 HKT: " + Utilities.formatDate(mydate, "HKT", "EEEE d MMMM YYYY HH:mm:ss") + "\n";
  toreturn = toreturn + "mar 1 GMT: " + Utilities.formatDate(mydate, "GMT", "EEEE d MMMM YYYY HH:mm:ss") + "\n";
  toreturn = toreturn + "mar 1 Asia/Singapore:   " + Utilities.formatDate(mydate,     "Asia/Singapore", "EEEE d MMMM YYYY HH:mm:ss") + "\n";
  toreturn = toreturn + "spreadsheet timezone = " + SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() + "\n";
  Logger.log(toreturn);

 // [15-03-10 13:29:05:951 HKT] date: Sun Mar 01 2015 20:02:03 GMT+0800 (HKT)
 // mar 1 UTC: Sunday 1 March 2015 12:02:03
 // mar 1 SGT: Sunday 1 March 2015 12:02:03
 // mar 1 HKT: Sunday 1 March 2015 12:02:03
 // mar 1 GMT: Sunday 1 March 2015 12:02:03
 // mar 1 Asia/Singapore:   Sunday 1 March 2015 20:02:03
 //  spreadsheet timezone = Asia/Singapore

  
}

// ---------------------------------------------------------------------------------------------------------------- uniqueKey_
function uniqueKey_(sheet) {
  var ss = sheet.getParent();
  return ss.getId() + "/" + sheet.getSheetId();
}

// ---------------------------------------------------------------------------------------------------------------- setupOtherForms_
function setupOtherForms_() {
  var sheets = otherSheets_();
  for (var i = 0; i < sheets.length; i++) {
	var sheet = sheets[i];
	var shortUrl = setupForm(sheet);
	var myRow = SpreadsheetApp.getActiveRange().getSheet().getRange(SpreadsheetApp.getActiveRange().getRow()+i, 1, 1, 10);
	Logger.log("smoochy says setupOtherForms_: sheet %s is on row %s", i.toString(), myRow.getRowIndex().toString());
	myRow.getCell(1,7).setValue(shortUrl);
  }
}

// ---------------------------------------------------------------------------------------------------------------- fillOtherTemplates_
function fillOtherTemplates_() {
  var sheets = otherSheets_();
  for (var i = 0; i < sheets.length; i++) {
	var sheet = sheets[i];
	Logger.log("will generate template for " + sheet.getName());
	fillTemplates(sheet);

	var uniq = uniqueKey_(sheet);

	var myRow = SpreadsheetApp.getActiveSheet().getRange(SpreadsheetApp.getActiveRange().getRow()+i, 1, 1, 10);

	myRow.getCell(1,4).setValue("=HYPERLINK(\"https://drive.google.com/drive/u/0/#folders/"
								+JSON.parse(PropertiesService.getDocumentProperties().getProperty("legalese."+uniq+".folder.id"))
								+"\",\""
								+JSON.parse(PropertiesService.getDocumentProperties().getProperty("legalese."+uniq+".folder.name"))
								+"\")");

	// this loses the hyperlink
	// myRow.getCell(1,4).setValue('=IMPORTRANGE(A' +myRow.getRowIndex() +',"Founder Agreement!e6")');

	myRow.getCell(1,5).setValue("unsent");
	if (sheets.length > 1) { SpreadsheetApp.flush(); }
  }
}


/** Template generation is as follows:
  *
  * open up the configuring sheet
  * read the configuring sheet. It tells us which templates exist, and a little bit about those templates.
  * filter the templates, excluding all those which are not suitable for the current configuration.
  * 
  * create a new folder
  * for each suitable template, load the source HTML
  * fill in the HTML template
  * convert the HTMLOutput into Google Docs native
  * put the google docs document into the new folder
  * 
  */

// ---------------------------------------------------------------------------------------------------------------- availableTemplates_
function availableTemplates_() {
  // return a bunch of URLs

  var baseUrl = "http://www.legalese.io/";
  var baseUrl = "http://www.mengwong.com/legalese.io/";
  
  var availables = [

// templates don't always have to live at an HTTP url.
// you can also create an HTML file in the code editor and just give the filename directly.
// the url will be something like termsheet_xml.html instead of termsheet.xml.

// you may be tempted to open this up so that the spreadsheet can specify any URL.
// this is unwise, because the XML template runs with the same privileges as this script,
// and if you randomly execute templates from all over the Internet, sooner or later you will regret it.

//  { name:"", title:"",
//	url:"http://www.legalese.io/templates/jfdi.asia/.xml",
//	parties:{to:["director"], cc:["corporate_secretary"]},
//	nocache:true,
//  },
	{ name:"mod_party_sum", title:"add party attributes",
	   url:baseUrl + "templates/jfdi.asia/mod_party_sum.xml",
	  nocache:true,
	},
	{ name:"mod_test1_modules", title:"test module 1",
	   url:baseUrl + "templates/jfdi.asia/mod_test1_modules.xml",
	  nocache:true,
	},
	{ name:"nda", title:"Nondisclosure Agreement",
	   url:baseUrl + "templates/jfdi.asia/nondisclosure.xml",
	  parties:{to:["company"], cc:[]},
	  explode:"counterparty",
	  nocache:true,
	},
	{ name:"kindle", title:"Kindle Introduction",
	   url:baseUrl + "templates/legalese/kindle.xml",
	  parties:{to:[], cc:[]},
	  explode:"new_participant",
	  nocache:true,
	},
	{ name:"dr_fundraising", title:"Directors' Resolution in favour of Fundraising",
	   url:baseUrl + "templates/jfdi.asia/dr-fundraising.xml",
	  parties:{to:["director"], cc:["corporate_secretary"]},
	  nocache:true,
	},
	{ name:"inc_disclaimer", title:"top securities disclaimer",
	   url:baseUrl + "templates/ycombinator-safe/inc_disclaimer.xml",
	  nocache:true,
	},
	{ name:"safe", title:"Y Combinator SAFE",
	   url:baseUrl + "templates/ycombinator-safe/safe_cap.xml",
	  parties:{to:["company"], cc:["corporate_secretary"]},
	  explode:"investor",
	  nocache:true,
	},
	{ name:"incorporation_corpsec_retention", title:"Retention of Corporate Secretary",
	   url:baseUrl + "templates/jfdi.asia/incorporation_corpsec_retention.xml",
	  parties:{to:["corporate_secretary", "founder"], cc:["investor"]},
	},
	{ name:"jfdi_articles_2015", title:"JFDI Articles",
	   url:baseUrl + "templates/jfdi.asia/jfdi_articles_2015.xml",
//	  nocache:true,
	},
	{ name:"jfdi_volunteer_agreement", title:"Volunteer Agreement",
	   url:baseUrl + "templates/jfdi.asia/jfdi_06_volunteer_agreement.xml",
	  parties:{to:["company"], cc:["corporate_secretary"]},
	  explode:"volunteer",
//	  nocache:true,
	},
	{ name:"form45", title:"Form 45 Consent to Act as a Director",
	   url:baseUrl + "templates/jfdi.asia/form45.xml",
	  parties:{to:[], cc:["corporate_secretary"]},
	  explode:"director",
	  // nocache:true,
	},
	{ name:"jfdi_class_f_agreement", title:"Class F Agreement",
	   url:baseUrl + "templates/jfdi.asia/jfdi_05_class_f_agreement.xml",
	  parties:{to:["founder", "company"], cc:["corporate_secretary", "investor"]},
	  // nocache:true,
	},
	{ name:"jfdi_shareholders_agreement", title:"Shareholders' Agreement",
	   url:baseUrl + "templates/jfdi.asia/jfdi_04_shareholders_agreement.xml",
	  parties:{to:["founder", "existing_investor", "company", "investor"], cc:["corporate_secretary"]},
	},
	{ name:"jfdi_investment_agreement", title:"JFDI Investment Agreement",
	   url:baseUrl + "templates/jfdi.asia/jfdi_03_convertible_note_agreement.xml",
	  parties:{to:["founder", "company", "investor"], cc:["corporate_secretary"]},
	  // nocache:true,
	},
	{ name:"jfdi_articles_table_a", title:"Articles of Association",
	   url:baseUrl + "templates/jfdi.asia/jfdi_02_articles_table_a.xml",
	  parties:{to:[], cc:["corporate_secretary"]},
	},
	{ name:"jfdi_memorandum", title:"Memorandum and Articles of Association",
	   url:baseUrl + "templates/jfdi.asia/jfdi_01_memorandum.xml",
	  parties:{to:["shareholder"], cc:["corporate_secretary"]},
	},
	{ name:"inc_cover_2_parties", title:"JFDI Cover Page with 2 Parties",
	   url:baseUrl + "templates/jfdi.asia/inc_cover_2_parties.xml",
	},
	{ name:"inc_cover_standard_parties", title:"JFDI Cover Page all Parties",
	   url:baseUrl + "templates/jfdi.asia/inc_cover_standard_parties.xml",
	},
	{ name:"inc_cover_jfdi", title:"JFDI Cover Page Bottom",
	   url:baseUrl + "templates/jfdi.asia/inc_cover_jfdi.xml",
	},
	{ name:"ordinary_share_subscription", title:"Ordinary Share Subscription Agreement",
	   url:baseUrl + "templates/jfdi.asia/ordinary_share_subscription_agreement.xml",
	  parties:{to:["company"], cc:["corporate_secretary"]},
	  explode:"new_investor",
	  nocache:true,
	},
	{ name:"tgas_subscription", title:"TradeGecko-A Share Subscription Agreement",
	   url:baseUrl + "templates/jfdi.asia/subscription_agreement_tga.xml",
	  parties:{to:["company"], cc:["corporate_secretary"]},
	  explode:"new_investor",
	},
 { name:"dr_proxy", title:"Appointment of Proxy",
	url:baseUrl + "templates/jfdi.asia/dr_proxy.xml",
	parties:{to:["director"], cc:["corporate_secretary"]},
 },
 { name:"dr_proxy_cert", title:"Certficate of Appointment of Proxy",
	url:baseUrl + "templates/jfdi.asia/dr_proxy_cert.xml",
	parties:{to:["director"], cc:["corporate_secretary"]},
 },
 { name:"dr_corp_rep_cert", title:"Certificate of Appointment of Corporate Representative",
	url:baseUrl + "templates/jfdi.asia/dr_corp_rep_cert.xml",
	parties:{to:["director"], cc:["corporate_secretary"]},
 },
 { name:"dr_corp_rep", title:"Appointment of Corporate Representative",
	url:baseUrl + "templates/jfdi.asia/dr_corp_rep.xml",
	parties:{to:["director"], cc:["corporate_secretary"]},
 },
 { name:"dr_generic", title:"Directors' Resolutions",
	url:baseUrl + "templates/jfdi.asia/dr_generic.xml",
	parties:{to:["director"], cc:["corporate_secretary"]},
 },
 { name:"new_share_class_mr", title:"Members' Resolutions to Create a New Class of Shares",
	url:baseUrl + "templates/jfdi.asia/new_share_class_mr.xml",
	parties:{to:["shareholder"], cc:["corporate_secretary"]},
 },
 { name:"new_share_class_dr", title:"Directors' Resolutions to Create a New Class of Shares",
	url:baseUrl + "templates/jfdi.asia/new_share_class_dr.xml",
	parties:{to:["director"], cc:["corporate_secretary"]},
 },
  { name:"new_share_class_spec", title:"Details of New Share Class",
	url:baseUrl + "templates/jfdi.asia/new_share_class_spec.xml",
  },
  { name:"mr_issue_shares", title:"Members Approve Ordinary Resolution to Issue Shares",
	url:baseUrl + "templates/jfdi.asia/mr-issue_shares.xml",
	parties:{to:["shareholder"], cc:["corporate_secretary"]},
  },
  { name:"dr_egm_notice_issue_shares", title:"Directors Give Notice of New Share Issue",
	url:baseUrl + "templates/jfdi.asia/dr-egm_notice-issue_shares.xml",
	parties:{to:["director"], cc:["corporate_secretary"]},
  },
  { name:"strikeoff_financial_report", title:"Financial Report",
	url:baseUrl + "templates/jfdi.asia/strikeoff_financial_report.xml",
	parties:{to:["director"], cc:["corporate_secretary"]},
  },
  { name:"change_of_address", title:"Resolutions to Change Registered Address",
	url:baseUrl + "templates/jfdi.asia/dr_change_of_address.xml",
	parties:{to:["director"], cc:["corporate_secretary"]},
  },
  { name:"strikeoff_bank_closure", title:"Resolutions to Close Bank Accounts",
	url:baseUrl + "templates/jfdi.asia/strikeoff_directors-bank-closure.xml",
	parties:{to:["director"], cc:["corporate_secretary"]},
	explode:"bank",
  },
  { name:"strikeoff_accountant_retention", title:"Retainer of Accountant for Financial Statements",
	url:baseUrl + "templates/jfdi.asia/strikeoff_accountant-retention.xml",
	parties:{to:[], cc:["accountant"]},
	explode:"director",
  },
  { name:"strikeoff_financials_letter", title:"Letter to Accountant regarding Financial Statements",
	url:baseUrl + "templates/jfdi.asia/strikeoff_financials-letter.xml",
	parties:{to:["director"], cc:["accountant"]},
  },
  { name:"strikeoff_indemnity", title:"Directors' Indemnity regarding Accounts",
	url:baseUrl + "templates/jfdi.asia/strikeoff_indemnity.xml",
	parties:{to:["director"], cc:["corporate_secretary"]},
  },
  { name:"strikeoff_report", title:"DR for Report and Statement",
	url:baseUrl + "templates/jfdi.asia/strikeoff_directors-report-and-statement.xml",
	parties:{to:["director"], cc:["corporate_secretary"]},
  },
  { name:"strikeoff_application", title:"Instruction to Corporate Secretary",
	url:baseUrl + "templates/jfdi.asia/strikeoff_application.xml",
	parties:{to:["director"], cc:["corporate_secretary"]},
  },
  { name:"strikeoff_acra_declaration", title:"Directors' Declaration to ACRA",
	url:baseUrl + "templates/jfdi.asia/strikeoff_directors-declaration.xml",
	parties:{to:["director"], cc:["corporate_secretary"]},
  },
  { name:"corpsec_allotment", title:"Instruction to Corpsec for Allotment",
	url:baseUrl + "templates/jfdi.asia/corpsec-allotment.xml",
	parties:{to:["director"], cc:["corporate_secretary"]},
	// nocache:true,
  },
  { name:"dr_allotment", title:"Directors' Resolution for Allotment",
	url:baseUrl + "templates/jfdi.asia/dr-allotment.xml",
	parties:{to:["director"],cc:["corporate_secretary"]},
	nocache:true,
  },
  { name:"jfdi_2014_rcps", title:"JFDI.2014 Subscription Agreement",
	url:"jfdi_2014_rcps_xml.html",
	parties:{to:["promoter", "company"],cc:["corporate_secretary"]},
	explode:"new_investor",
  },
  { name:"kissing", title:"KISS (Singapore)",
	url:baseUrl + "templates/jfdi.asia/kissing.xml",
	parties:{to:["founder", "company"],cc:["corporate_secretary"]},
	explode:"new_investor",
	nocache:true,
  },
  { name:"strikeoff_shareholders", title:"Striking Off for Shareholders",
	url:baseUrl + "templates/jfdi.asia/strikeoff_shareholders.xml",
	parties:{to:["director[0]",],cc:[]},
	explode:"shareholder",
  },
  { name:"test_templatespec", title:"Test templateSpec",
	url:baseUrl + "templates/jfdi.asia/test-templatespec.xml",
	parties:{to:["company"],cc:["founder"]},
	// nocache:true,
  },
  { name:"employment_agreement", title:"Employment Agreement",
	url:baseUrl + "templates/jfdi.asia/employment-agreement.xml",
	parties:{to:["employee","company"],cc:[]},
  },
  { name:"termsheet", title:"Seed Term Sheet",
	url:baseUrl + "templates/jfdi.asia/termsheet.xml",
	parties:{to:[],cc:[]},
	nocache: true,
  },
  { name:"preemptive_notice", title:"Pre-Emptive Notice to Shareholders",
	url:baseUrl + "templates/jfdi.asia/preemptive_notice.xml",
	parties:{to:[],cc:["company"]},
	explode:"shareholder",
  },
  { name:"preemptive_waiver", title:"Issuance Offer Notice",
	url:baseUrl + "templates/jfdi.asia/preemptive_waiver.xml",
	parties:{to:["company"],cc:["corporate_secretary"]},
	explode: "shareholder",
	nocache:true,
  },
  { name:"loan_waiver", title:"Waiver of Convertible Loan",
	url:baseUrl + "templates/jfdi.asia/convertible_loan_waiver.xml",
	parties:{to:["jfdi_corporate_representative"],cc:["corporate_secretary","accountant"]},
  },
  { name:"simplified_note", title:"Simplified Convertible Loan Agreement",
	url:baseUrl + "templates/jfdi.asia/simplified_note.xml",
	parties:{to:["investor","company"],cc:["corporate_secretary","accountant"]},
  },
  { name:"founder_agreement", title:"JFDI Accelerate Founder Agreement",
	url:baseUrl + "templates/jfdi.asia/founderagreement.xml",
	parties:{to:["founder","investor"], cc:["corporate_secretary"]},
  },
  { name:"dora", title:"DORA",
	url:baseUrl + "templates/jfdi.asia/dora-signatures.xml",
	parties:{to:["new_investor","company","shareholder"],cc:["corporate_secretary"]},
	nocache:true,
  },
  { name:"inc_plain_letterhead", title:"plain letterhead",
	url:baseUrl + "templates/jfdi.asia/inc_plain_letterhead.xml"
  },
  { name:"inc_signature", title:"signature component",
	url:baseUrl + "templates/jfdi.asia/inc_signature.xml",
  },
  { name:"inc_party", title:"party component",
	url:baseUrl + "templates/jfdi.asia/inc_party.xml"
  },
  { name:"inc_dr_start", title:"directors resolutions start",
	url:baseUrl + "templates/jfdi.asia/inc_dr_start.xml"
  },
  { name:"inc_dr_end", title:"directors resolution end",
	url:baseUrl + "templates/jfdi.asia/inc_dr_end.xml"
  },
  { name:"mr_authority_to_issue_shares", title:"members resolution to issue shares",
	url:baseUrl + "templates/jfdi.asia/mr-authority_to_issue_shares.xml"
  },
  { name:"inc_authority_to_bizfile", title:"authority for corp sec to bizfile notice of resolutions",
	url:baseUrl + "templates/jfdi.asia/inc_authority_to_bizfile.xml"
  },
  { name:"inc_member_notices", title:"notice of resolutions at egm agm or written means",
	url:baseUrl + "templates/jfdi.asia/inc_member_notices.xml"
  },
  { name:"inc_additional_resolutions", title:"resolutions 2 and above",
	url:baseUrl + "templates/jfdi.asia/inc_additional_resolutions.xml"
  },
  { name:"inc_resolved_mr", title:"members resolution preface",
	url:baseUrl + "templates/jfdi.asia/inc_resolved_mr.xml"
  },
	{ name:"inc_mediation_arbitration", title:"ruben's mediation and arbitration clause",
	  nocache:true,
	url:baseUrl + "templates/jfdi.asia/inc_mediation_arbitration.xml" // define numberering_level = 3 or whatever. default is 2.
  },

  ];
return availables;
};

// ---------------------------------------------------------------------------------------------------------------- desiredTemplates_
function desiredTemplates_(config) {
  var toreturn = [];
  for (var i in config.templates.tree) {
	var field = asvar_(i);
	toreturn.push(field);
  }
  Logger.log("desiredTemplates_: returning %s", toreturn);
  return toreturn;
}

function suitableTemplates_(config) {
  var availables = availableTemplates_();
  Logger.log("suitableTemplates: available templates are %s", availables);
  var desireds = desiredTemplates_(config);
  var suitables = intersect_(desireds, availables); // the order of these two arguments matters -- we want to preserve the sequence in the spreadsheet of the templates.
  // this is slightly buggy. kissing, kissing1, kissing2, didn't work
  return suitables;
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

// ---------------------------------------------------------------------------------------------------------------- filenameFor_
// create a canonical filename for a given sourceTemplate,entity pair
function filenameFor_ (sourceTemplate, entity) {
  var sequence = sourceTemplate.sequence;
  if (sequence == undefined) { sequence = "" } else { sequence = (sequence < 100 && sequence >= 10  ? "0" : "") + sequence + " - " }
  if (entity) return sequence + sourceTemplate.title + " for " + firstline_(entity.name)
  else        return sequence + sourceTemplate.title;
};

// ---------------------------------------------------------------------------------------------------------------- obtainTemplate_
// obtainTemplate
// we can pull a generic HTML template from somewhere else,
// or it can be one of the project's HTML files.
function obtainTemplate_(url, nocache, readmeDoc) {
  // Logger.log("obtainTemplate_(%s) called", url);

  // we're actually running within a single script invocation so maybe we should find a more intelligent way to cache within a single session.
  // otherwise this risks not picking up changes

  if (url.match(/^http/)) {
	if (nocache != true) {
	  var cache = CacheService.getDocumentCache();
	  var cached = cache.get(url);
	  if (cached != null) {
		return HtmlService.createTemplate(cached);
	  }
	}

	try {
	  var result = UrlFetchApp.fetch(url, { headers: { "Accept-Encoding": "identity" } } );
	} catch (e) {
	  Logger.log("ERROR: caught error (%s) while fetching %s", e, url);
	}
	if (result == undefined) {
	  try {	  
		result = UrlFetchApp.fetch(url, { headers: { "Accept-Encoding": "identity" } } );
	  } catch (e) {
		Logger.log("ERROR: caught error (%s) while fetching %s for the second time!", e, url);
		throw ("during obtainTemplate_(" + url + "): " + e);
	  }
	}
	  
	// by default the good people at Github Pages will gzip compress if we don't explicitly set this

	var contents = result.getContentText();

	if (result.getResponseCode() != 200) {
	  if (readmeDoc) { readmeDoc.getBody().appendParagraph("obtainTemplate(" + url + ") returned response code " + result.getResponseCode()); }
	  result = UrlFetchApp.fetch(url, { headers: { "Accept-Encoding": "identity" } } );
	  contents = result.getContentText();
	  if (readmeDoc) { readmeDoc.getBody().appendParagraph("obtainTemplate(" + url + ") second try returned response code " + result.getResponseCode()); }
	}
	
	if (! contents || ! contents.length) {
	  if (readmeDoc) {
		readmeDoc.getBody().appendParagraph("obtainTemplate(" + url + ") returned no contents");  	  Logger.log("obtainTemplate(" + url + ") returned no contents");
		readmeDoc.getBody().appendParagraph(JSON.stringify(result.getAllHeaders()));                    Logger.log("obtainTemplate(" + url + ") headers: " + result.getAllHeaders());
	  }
	  throw("received zero-length content when fetching " + url);
	}
	
	// the cache service can only store keys of up to 250 characters and content of up to 100k, so over that, we don't cache.
	if (nocache != true && contents.length < 100000 && url.length < 250) {
	  cache.put(url, contents, 300);
	  // a run of the google script may take up to 5 minutes, so cache for that time.
	  // if you're hot and heavy with the updates, set nocache:true in the sourceTemplate properties.
	}
	// Logger.log("obtained template %s, length %s bytes", url, contents.length);
	return HtmlService.createTemplate(contents);
  }
  else return HtmlService.createTemplateFromFile(url);
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

// see documentation in notes-to-self.org
var docsetEmails_ = function (sheet, readRows, parties, suitables) {
  this.sheet = sheet;
  this.readRows = readRows;
  this.parties = parties;
  this.suitables = suitables;

  var readmeDoc = getReadme_(sheet);

  this.sequence;
  if (this.suitables.length > 1) { this.sequence = 1; } // each sourcetemplate gets a sequence ID. exploded templates all share the same sequence id.
  
  this.esNumForTemplate = { };

  Logger.log("docsetEmails(%s): now I will figure out who gets which PDFs.",
			 sheet.getSheetName());

//  Logger.log("docsetEmails(%s): incoming readRows has entitiesByName = %s",
//			 sheet.getSheetName(),
//			 readRows.entitiesByName
//			);

  // populate rcpts
  this._rcpts = { exploders: { }, normals: { } };

  for (var i in suitables) {
    var sourceTemplate = suitables[i];
	if (this.sequence) { sourceTemplate.sequence = this.sequence++ }
	var to_list = [], cc_list = [];
	for (var mailtype in sourceTemplate.parties) {
	  Logger.log("docsetEmails: sourceTemplate %s: expanding mailtype \"%s\"",
				 sourceTemplate.name, mailtype);
	  for (var i in sourceTemplate.parties[mailtype]) {
		var partytype = sourceTemplate.parties[mailtype][i];
		Logger.log("docsetEmails: discovered %s: %s", mailtype, partytype);
		if (readRows.principal.roles[partytype] == undefined) {
		  Logger.log("docsetEmails:   principal does not possess a defined %s role!");
		  continue;
		}
		for (var j in parties[partytype]) {
		  var entity = parties[partytype][j];
		  Logger.log("docsetEmails:     what to do with entity %s?", entity.name);
		  if (mailtype == "to") {
			to_list.push(entity.name);
		  } else { // mailtype == "cc"
			cc_list.push(entity.name);
		  }
		}
	  }
	}
	if (sourceTemplate.explode == undefined) {
	  this._rcpts.normals[sourceTemplate.title]={to:to_list, cc:cc_list};
	  Logger.log("docsetEmails: defining this._rcpts.normals[%s].to=%s",sourceTemplate.title, to_list);
	  Logger.log("docsetEmails: defining this._rcpts.normals[%s].cc=%s",sourceTemplate.title, cc_list);
	} else { // explode first and then set this._rcpts.exploders
	  Logger.log("docsetEmails(): will explode %s", sourceTemplate.explode);
	  readmeDoc.getBody().appendParagraph("docsetEmails(): will explode template with one per doc for " + sourceTemplate.explode);

	  var primary_to_list = to_list;
	  
      for (var j in this.parties[sourceTemplate.explode]) {
		var entity = parties[sourceTemplate.explode][j];
		// we step through the desired {investor,company}.* arrays.
		// we set the singular as we step through.
		var mytitle = filenameFor_(sourceTemplate, entity);
		Logger.log("docsetEmails(): preparing %s exploded %s", sourceTemplate.explode, mytitle);
		var exploder_to_list = primary_to_list.concat([entity.name]);
		// TODO: if the exploder's email is multiline there needs to be a way for it to append to the cc_list.
		
		this._rcpts.exploders[mytitle] = {to:exploder_to_list,cc:cc_list};
		Logger.log("docsetEmails: defining this._rcpts.exploders[%s].to=%s",mytitle,exploder_to_list);
		Logger.log("docsetEmails: defining this._rcpts.exploders[%s].cc=%s",mytitle,cc_list);
	  }
	}
  }

  // return to_cc for a given set of sourceTemplates
  this.Rcpts = function(sourceTemplates, explodeEntity) { // explodeEntity may be null -- that's OK, just means we're not exploding.
	// clear es_nums in entities
	for (var e in this.readRows.entitiesByName) { this.readRows.entitiesByName[e]._es_num = null; this.readRows.entitiesByName[e]._to_email = null; }

	var sourceTemplateNames = sourceTemplates.map(function(st){return st.name});

//	Logger.log("docsetEmails.Rcpts(%s), %s", sourceTemplateNames, explodeEntity);
	// pull up all the entities relevant to this particular set of sourceTemplates
	// this should be easy, we've already done the hard work above.
	var all_to = [], all_cc = [];
	for (var st in sourceTemplates) {
	  var sourceTemplate = sourceTemplates[st];
	  if (explodeEntity) {
		var mytitle = filenameFor_(sourceTemplate, explodeEntity);
		all_to = all_to.concat(this._rcpts.exploders[mytitle].to);
		all_cc = all_cc.concat(this._rcpts.exploders[mytitle].cc);
	  } else {
		all_to = all_to.concat(this._rcpts.normals[sourceTemplate.title].to);
		all_cc = all_cc.concat(this._rcpts.normals[sourceTemplate.title].cc);
	  }
	}

	all_to = uniq_(all_to);
	all_cc = uniq_(all_cc);

	Logger.log("docsetEmails.Rcpts(%s): all_to=%s", sourceTemplateNames, all_to);
	Logger.log("docsetEmails.Rcpts(%s): all_cc=%s", sourceTemplateNames, all_cc);

	var to_emails = [], cc_emails = [];

	var es_num = 1;
	for (var ti in all_to) {
	  var entityName = all_to[ti];
	  var entity = this.readRows.entitiesByName[entityName];

	  if (this.readRows.config.email_override && this.readRows.config.email_override.values[0]
		 &&
		 email_to_cc_(entity.email)[0] && email_to_cc_(entity.email)[0]) {
		entity._to_email = plusNum(es_num, this.readRows.config.email_override.values[0]);
	  }
	  else {
		var email_to_cc = email_to_cc_(entity.email);
		entity._to_email = email_to_cc[0];
		Logger.log("DEBUG: given entity %s, entity.email is %s and _to_email is %s", entityName, entity.email, entity._to_email);
		cc_emails = cc_emails.concat(email_to_cc[1]);
	  }
	  to_emails.push(entity._to_email);
	  entity._es_num = es_num++;
	  entity._unmailed = true;
	}
	for (var ti in all_cc) {
	  var entityName = all_cc[ti]; var entity = this.readRows.entitiesByName[entityName];
	  var email_to_cc = email_to_cc_(entity.email);
	  cc_emails = cc_emails.concat(email_to_cc[0]).concat(email_to_cc[1]); // both top and subsequent will go to CC
	}
	if (this.readRows.config.email_override && this.readRows.config.email_override.values[0]) {
		cc_emails = [this.readRows.config.email_override.values[0]];
	}
	return [to_emails, cc_emails];
  };

  // callback framework for doing things to do with normal sourceTemplates, for both concatenate_pdfs modes
  this.normal = function(individual_callback, group_callback) {
	var normals   = suitables.filter(function(t){return ! t.explode});
	Logger.log("docsetEmails.normal(): concatenateMode %s, templates=%s",
			   this.readRows.config.concatenate_pdfs && this.readRows.config.concatenate_pdfs.values[0] == true,
			   normals.map(function(t){return t.name}));
	if (this.readRows.config.concatenate_pdfs && this.readRows.config.concatenate_pdfs.values[0] == true) {
	                           var rcpts = this.Rcpts(normals);
	  for (var i in normals) {                                       individual_callback([normals[i]], null, rcpts); }
      if (group_callback) {            group_callback(normals, null, rcpts); }
	} else {
	  for (var i in normals) { var rcpts = this.Rcpts([normals[i]]); individual_callback([normals[i]], null, rcpts); }
	}
  };	

  // callback framework for doing things to do with exploded sourceTemplates
  this.explode = function(callback) {
	var exploders = this.suitables.filter(function(t){return   t.explode});
	Logger.log("docsetEmails.explode(): templates=%s",
			   exploders.map(function(t){return t.name}));
	for (var explode_i in exploders) {
	  var sourceTemplate = exploders[explode_i];
	  var partytype = sourceTemplate.explode;
	  Logger.log("template %s will explode = %s", sourceTemplate.name, partytype);
//	  Logger.log("parties[partytype] = %s", parties[partytype]);
	  for (var parties_k in parties[partytype]) {
		var entity = this.readRows.entitiesByName[parties[partytype][parties_k].name];
		Logger.log("docsetEmails.explode(): working with %s %s %s", partytype, entity.name, sourceTemplate.name);
		if (entity.legalese_status
			&& entity.legalese_status.match(/skip explo/)
			&& entity.legalese_status.match(sourceTemplate.name)
		   ) {
		  Logger.log("docsetEmails.explode(%s): SKIPPING because legalese status says %s", entity.name, entity.legalese_status);
		  continue;
		}
		var rcpts = this.Rcpts([sourceTemplate], entity);
		callback([sourceTemplate], entity, rcpts);
	  }
	}
  };

};

// map 
function roles2parties_(readRows) {
  var parties = {};
  // each role shows a list of names. populate the parties array with a list of expanded entity objects.
  for (var role in readRows.principal.roles) {
	for (var i in readRows.principal.roles[role]) {
	  var partyName = readRows.principal.roles[role][i];
	  if (readRows.entitiesByName[partyName]) {
		parties[role] = parties[role] || [];
		parties[role].push(readRows.entitiesByName[partyName]);
		// Logger.log("populated parties[%s] = %s (type=%s)",
		// partyName, readRows.entitiesByName[partyName].email, readRows.entitiesByName[partyName].party_type);
	  }
	  else {
		Logger.log("WARNING: the Roles section defines a party %s which is not defined in an Entities section, so omitting from the data.parties list.", partyName);
	  }
	}
  }
  if (parties["company"] == undefined) { parties["company"] = [readRows.principal]; }
  return parties;
}

// ---------------------------------------------------------------------------------------------------------------- fillTemplates
function fillTemplates(sheet) {

  var sheetPassedIn = ! (sheet == undefined);
  if (! sheetPassedIn && SpreadsheetApp.getActiveSpreadsheet().getName().toLowerCase() == "legalese controller") {
	Logger.log("in controller mode, switching to fillOtherTemplates()");
	fillOtherTemplates_();
	return;
  }
  sheet = sheet || SpreadsheetApp.getActiveSheet();
  var entitiesByName = {};
  var readRows = readRows_(sheet, entitiesByName);
  var templatedata   = readRows.terms;
  var config         = readRows.config;
  templatedata.clauses = {};
  templatedata._config = config;
  templatedata._todays_date = Utilities.formatDate(new Date(), sheet.getParent().getSpreadsheetTimeZone(), "d MMMM YYYY");
  templatedata._todays_date_wdmy = Utilities.formatDate(new Date(), sheet.getParent().getSpreadsheetTimeZone(), "EEEE d MMMM YYYY");

  var entityNames = []; for (var eN in readRows.entityByName) { entityNames.push(eN) }
  Logger.log("fillTemplates(%s): got back readRows.entitiesByName=%s",
			 sheet.getSheetName(),
			 entityNames);

  if (config.templates == undefined) {
	throw("sheet doesn't specify any templates ... are you on a Entities sheet perhaps?");
	return;
  }

  var uniq = uniqueKey_(sheet);
  // in the future we will probably need several subfolders, one for each template family.
  // and when that time comes we won't want to just send all the PDFs -- we'll need a more structured way to let the user decide which PDFs to send to echosign.
  var folder = createFolder_(sheet); var readmeDoc = createReadme_(folder, config, sheet);
  PropertiesService.getDocumentProperties().setProperty("legalese."+uniq+".folder.id", JSON.stringify(folder.getId()));
  PropertiesService.getDocumentProperties().setProperty("legalese."+uniq+".folder.name", JSON.stringify(folder.getName()));
  PropertiesService.getDocumentProperties().setProperty("legalese.templateActiveSheetId", sheet.getSheetId());
  Logger.log("fillTemplates: property set legalese.%s.folder.id = %s", uniq, folder.getId());
  Logger.log("fillTemplates: property set legalese.%s.templateActiveSheetId = %s", uniq, sheet.getSheetId());

  var cell = sheet.getRange("E6");

  // let's insert the Drive version not the Docs version of the folder url
  cell.setValue("=HYPERLINK(\"https://drive.google.com/drive/u/0/#folders/"+folder.getId()+"\",\""+folder.getName()+"\")");
  Logger.log("I have set the value to =HYPERLINK(\"https://drive.google.com/drive/u/0/#folders/"+folder.getId()+"\",\""+folder.getName()+"\")");

  // hardcode some useful expressions
  templatedata.xml_declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  templatedata.whitespace_handling_use_tags = '<?whitespace-handling use-tags?>';
  templatedata.whitespace_handling_use_characters = '<?whitespace-handling use-characters?>';
  templatedata._timezone = sheet.getParent().getSpreadsheetTimeZone();

  var suitables = suitableTemplates_(config);
  Logger.log("resolved suitables = %s", suitables.map(function(e){return e.url}).join(", "));

  // the parties{} for a given docset are always the same -- all the defined roles are available
  var parties = roles2parties_(readRows);

  templatedata.parties = parties;
//  Logger.log("FillTemplates: send: assigning templatedata.parties = %s", templatedata.parties);
  templatedata.company = parties.company[0];
  templatedata._entitiesByName = readRows.entitiesByName;
  
  var docsetEmails = new docsetEmails_(sheet, readRows, parties, suitables);

  // you will see the same pattern in uploadAgreement.
  var buildTemplate = function(sourceTemplates, entity, rcpts) { // this is a callback run within the docsetEmails object.
	var sourceTemplate = sourceTemplates[0];
	var newTemplate = obtainTemplate_(sourceTemplate.url, sourceTemplate.nocache, readmeDoc);
	newTemplate.data = templatedata; // NOTE: this is the  first global inside the XML context
	newTemplate.data.sheet = sheet;  // NOTE: this is the second global inside the XML context

	if (templatedata._origparties == undefined) {
	  templatedata._origparties = {};
	  for (var p in parties) { templatedata._origparties[p] = parties[p] }
	  Logger.log("buildTemplate(%s): preserving original parties", sourceTemplate.name);
	}
	else {
	  for (var p in templatedata._origparties) { templatedata.parties[p] = templatedata._origparties[p] }
	  Logger.log("buildTemplate(%s): restoring original parties", sourceTemplate.name);
	}

	// EXCEPTION SCENARIO -- party overrides
	// 
	// it is possible that in the Templates: line of the config section, one or more party overrides are defined.
	//
	// for instance, Template: | foobar | company | [promoter]
	// means that when filling the foobar template, we should set data.parties.company = data.parties.promoter
	// and, due to the special case, also set data.company = promoter[0].
	// 
	// Template: | foobar | thing | SomeValue Pte. Ltd.
	// means that for the foobar template, data.parties.thing = the entity named SomeValue Pte. Ltd.
	//
	Logger.log("buildTemplate(%s): config.templates.dict is %s", sourceTemplate.name, config.templates.dict);
	if (config.templates.dict[sourceTemplate.name] && config.templates.dict[sourceTemplate.name].length) {
	  var mydict = config.templates.dict[sourceTemplate.name];
	  Logger.log("buildTemplate(%s): WE CAN HAZ OVERRIDE! coping with %s", sourceTemplate.name, config.templates.dict[sourceTemplate.name]);

	  var keyvalues = {};
	  while (config.templates.dict[sourceTemplate.name].length) { keyvalues[mydict.shift()] = mydict.shift() }
	  Logger.log("buildTemplate(%s): keyvalues = %s", sourceTemplate.name, keyvalues);
	  for (var kk in keyvalues) {
		Logger.log("buildTemplate(%s): dealing with %s : %s", sourceTemplate.name, kk, keyvalues[kk]);

		var matches; // there is similar code elsewhere in readRows_() under ROLES
		if (matches = keyvalues[kk].match(/^\[(.*)\]$/)) {
		  // company: [promoter]
		  // means we temporarily substitute promoter for company
		  var to_import = asvar_(matches[1]);
		  // TODO: sanity check so we don't do a reflexive assignment
		  
		  Logger.log("buildTemplate(%s):         substituting %s = %s", sourceTemplate.name, kk, to_import);
		  if (! (templatedata.company.roles[to_import] && templatedata.company.roles[to_import].length)) {
			Logger.log("buildTemplate(%s):         ERROR: substitute [%s] is useless to us", sourceTemplate.name, to_import);
			continue;
		  }
		  else {
			Logger.log("buildTemplate(%s):         substituting: before, parties.%s = %s", sourceTemplate.name, kk, templatedata.company.roles[kk]);
			templatedata.parties[kk] = templatedata.parties[to_import];
			Logger.log("buildTemplate(%s):         substituting: after setting to %s, parties.%s = %s", sourceTemplate.name, to_import, kk, templatedata.parties[kk][0].name);
		  }

		  if (kk == "company") {
			templatedata.company = templatedata.parties.company[0];
			Logger.log("buildTemplate(%s):         final substitution: company =  %s", sourceTemplate.name, templatedata.company.name);
		  }
		}
	  }
	}
	//	Logger.log("buildTemplate: assigning newTemplate.data = %s", templatedata);
//	Logger.log("buildTemplate: newTemplate.data.parties has length = %s", templatedata.data.parties.length);
//	Logger.log("FillTemplates: recv: templatedata.parties = %s", templatedata.parties);
	if (entity) { newTemplate.data.party = newTemplate.data.party || {};
				  newTemplate.data.party[sourceTemplate.explode] = entity;
				  newTemplate.data      [sourceTemplate.explode] = entity; }
	fillTemplate_(newTemplate, sourceTemplate, filenameFor_(sourceTemplate, entity), folder, config);
	// todo: make the title configured in the spreadsheet itself, and get rid of the hardcoded title from the availabletemplates code below.
	readmeDoc.getBody().appendParagraph("created " + sourceTemplate.title);
	if (entity) { readmeDoc.getBody().appendParagraph("doing template for " + entity.name); }
  };

  Logger.log("FillTemplates(): we do the non-exploded normal templates");
  docsetEmails.normal(buildTemplate);

  Logger.log("FillTemplates(): we do the exploded templates");
  docsetEmails.explode(buildTemplate);

  var ROBOT = 'robot@legalese.io';
  Logger.log("fillTemplates(): sharing %s with %s", folder.getName(), ROBOT);
  folder.addEditor(ROBOT);

  if (config.add_to_folder) {
	var folderValues = [];
	for (var i in config.add_to_folder.tree) {
	  var matches;
	  if (matches = i.match(/folders.*\/([^\/]+)/)) { // we want the rightmost folderid
		folderValues.push(matches[1]);
	  }
	}
	for (var i = 0; i<folderValues.length; i++) {
	  var addToFolder = DriveApp.getFolderById(folderValues[i]);
	  if (addToFolder) {
		Logger.log("fillTemplates(): config says we should add the output folder to %s", addToFolder.getName());
		try { addToFolder.addFolder(folder); }
		catch (e) {
		  Logger.log("fillTemplates(): failed to do so. %s", e);
		}
	  }
	  else {
		Logger.log("fillTemplates(): ERROR: unable to getFolderById(%s)!", folderValues[i]);
	  }
	}
  }
  
  Logger.log("that's all folks!");
}

// ---------------------------------------------------------------------------------------------------------------- fillTemplate_
// fill a single template -- inner-loop function for fillTemplates() above.
// 
// it's possible that a template references another template.
// the Google Docs HTMLTemplate engine is pretty basic and has no concept
// of modular components.
//
// so, we define an include() function.

function fillTemplate_(newTemplate, sourceTemplate, mytitle, folder, config) {
  // reset "globals"
  clauseroot = [];
  clausetext2num = {};
  newTemplate.data.signature_comment = null;

  var xmlRootExtras = xmlRootExtras = config.save_indd ? ' saveIndd="true"' : '';
  newTemplate.data.xmlRoot = function(someText) {
	if (someText == undefined) { someText = '' }
	else if (! someText.match(/^ /)) { someText = ' ' + someText }
	return '<Root xmlns:aid="http://ns.adobe.com/AdobeInDesign/4.0/" xmlns:aid5="http://ns.adobe.com/AdobeInDesign/5.0/"'
	  + xmlRootExtras
	  + someText
	  + '>\n';
  };
  
  var filledHTML = newTemplate.evaluate().setSandboxMode(HtmlService.SandboxMode.IFRAME).getContent();
  var xmlfile;

  if (sourceTemplate.url.match(/[._]xml(\.html)?$/)) {
	xmlfile = DriveApp.createFile(mytitle+".xml", filledHTML, 'text/xml');
	folder.addFile(xmlfile);
	DriveApp.getRootFolder().removeFile(xmlfile);
  }
  else {
	Logger.log("we only support xml file types. i am not happy about %s", sourceTemplate.url);
  }

  Logger.log("finished " + mytitle);
}

// ---------------------------------------------------------------------------------------------------------------- include
// used inside <?= ?> and <? ?>
function include(name, data, _include, _include2) {
  Logger.log("include(%s) running", name);
//  Logger.log("include(%s) _include=%s, _include2=%s", name, _include, _include2);
  var origInclude = data._include;
  var origInclude2 = data._include2;
  var filtered = availableTemplates_().filter(function(t){return t.name == name});
  if (filtered.length == 1) {
	var template = filtered[0];
	var childTemplate = obtainTemplate_(template.url, template.nocache);
	childTemplate.data  = data;
	childTemplate.data._include = _include || {};
	childTemplate.data._include2 = _include2 || {};
	var filledHTML = childTemplate.evaluate().setSandboxMode(HtmlService.SandboxMode.IFRAME).getContent();
	Logger.log("include(%s) complete", name);
	data._include = origInclude;
	data._include2 = origInclude2;
	return filledHTML;
  }
  Logger.log("include(): unable to find template named %s", name);
  return;
}

// ---------------------------------------------------------------------------------------------------------------- newlinesToCommas
// used inside <? ?> to convert a multiline address to a singleline address for party-section purposes
function newlinesToCommas(str) {
  if (str == undefined) { Logger.log("newlinesToCommas: undefined!"); return undefined }
  return str.replace(/,?\s*\n\s*/g, ", ");
}

// ---------------------------------------------------------------------------------------------------------------- newlinesToCommas
// used inside <? ?> to convert a multiline name to the first line for party-section purposes
function firstline_(str) {
  if (str == undefined) { Logger.log("firstline: undefined!"); return undefined }
  return str.split(/,?\s*\n\s*/)[0];
}


// ---------------------------------------------------------------------------------------------------------------- legaleseRootFolder_
function legaleseRootFolder_() {
  var legalese_root;

  var legalese_rootfolder_id = PropertiesService.getDocumentProperties().getProperty("legalese.rootfolder");
  if (! legalese_rootfolder_id == undefined) {
	legalese_root = DriveApp.getFolderById(JSON.parse(legalese_rootfolder_id));
  }
  else {
	var legaleses = DriveApp.getFoldersByName("Legalese Root");
	Logger.log("legaleses = " + legaleses);
	if (legaleses.hasNext()) {
	  Logger.log("legaleses is defined");
	  legalese_root = legaleses.next();
	  Logger.log("legalese_root = " + legalese_root);
	} else {
	  Logger.log("WARNING: Google Drive claims that the Legalese Root folder does not exist. really?");
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
  Logger.log("attempting createfolder(%s)", folderName);
  var folder = legalese_root.createFolder(folderName);
  Logger.log("createfolder returned " + folder);

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

  doc.getBody().appendParagraph("this was created by Legalese.");

  var para = doc.getBody().appendParagraph("The origin spreadsheet is ");
  var text = para.appendText(spreadsheet.getName() + ", " + sheet.getName());
  text.setLinkUrl(spreadsheet.getUrl() + "#gid=" + sheet.getSheetId());

  doc.getBody().appendParagraph("You will see a bunch of XMLs in the folder. To create PDFs, share the folder with robot@legalese.io");

  var logs_para = doc.getBody().appendParagraph("Logs");
  logs_para.setHeading(DocumentApp.ParagraphHeading.HEADING1);

  Logger.log("run started");
  var uniq = uniqueKey_(sheet);
  PropertiesService.getDocumentProperties().setProperty("legalese."+uniq+".readme.id", JSON.stringify(doc.getId()));
  return doc;
}

function getReadme_(sheet) {
  var uniq = uniqueKey_(sheet);
  var id = PropertiesService.getDocumentProperties().getProperty("legalese."+uniq+".readme.id");
  if (id != undefined) {
	return DocumentApp.openById(JSON.parse(id));
  }
  return;
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

// ---------------------------------------------------------------------------------------------------------------- resetDocumentProperties_
// utility function to reset userproperties
function resetDocumentProperties_(which) {
  var props = PropertiesService.getDocumentProperties();
  if (which == "all") props.deleteAllProperties();
  else props.deleteProperty(which);
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


// ---------------------------------------------------------------------------------------------------------------- showDocumentProperties_
function showDocumentProperties_() {
  Logger.log("userProperties: %s", JSON.stringify(PropertiesService.getDocumentProperties().getProperties()));
  Logger.log("scriptProperties: %s", JSON.stringify(PropertiesService.getScriptProperties().getProperties()));
}  

function email_to_cc_(email) {
  var to = null;
  var emails = email.split(/\s*[\n\r,]\s*/).filter(function(e){return e.length > 0});
  if (emails.length > 0) {
	to = [emails.shift()];
  }
  return [to, emails];
}


function templateTitles_(templates) {
  if (templates.length == 1) { return templates[0].title }
  return templates.map(function(t){return t.sequence}).join(", ");
}


function getOrdinalFor_ (intNum, includeNumber) {
  return (includeNumber ? intNum : "")
    + ([,"st","nd","rd"][((intNum = Math.abs(intNum % 100)) - 20) % 10] || [,"st","nd","rd"][intNum] || "th");
}
  

// ---------------------------------------------------------------------------------------------------------------- localization

function plural(num, singular, plural, locale) {
  if (locale == undefined) { locale = "en-US" }
  if (num.constructor.name == "Array") { num = num.length }
  if (num.constructor.name == "String") { num = Number(num.replace(/[^0-9.]/, "")) }
  if (locale == "en-US") {
	if (plural == undefined) {
	  if      (singular == "my")  { plural = "our" }
	  else if (singular == "its") { plural = "their" }
	  else                        { plural = singular + "s" }
	}
	if (isNaN(num)) { return plural }
	if (num  > 1)   { return plural }
	if (num == 1)   { return singular }
	if (num == 0)   { return plural }
	Logger.log("WARNING: unable to determine if %s is singular or plural.", num);
  }
}

function asNum_(instr) {
  var num = instr;
  if (instr == undefined) { Logger.log("WARNING: asNum_() received an undefined argument"); return }
  if (instr.constructor.name == "Number") { num = instr.toString() }
  return num.replace(/[^.\d]/g,"");
}


function asCurrency_(currency, amount, chop) {
  // it would be nice to fill in the format string exactly the way Spreadsheets do it, but that doesn't seem to be an option.
  // failing that, it would be nice to get support for the ' option in sprintf, but it looks like formatString doesn't do that one either.
  // failing that, SheetConverter has a convertCell function that should do the job. https://sites.google.com/site/scriptsexamples/custom-methods/sheetconverter
  // but that doesn't work either. so we do it by hand.

  // currency can be either just "S$" or the full numberFormat specification string.

  // Logger.log("asCurrency_(%s, %s, %s)", currency, amount, chop);
  
  var mycurrency = currency;
  Logger.log("asCurrency_(%s,%s,%s)", currency, amount, chop);
  var mymatch;
  if (mymatch = currency.match(/#0\.(0+)/)) { chop = mymatch[1].length }
  if (currency.match(/#0$/))     { chop = 0 }
  Logger.log("asCurrency_() chop = %s", chop);
  
  var matches;
  if (matches = currency.match(/\[\$(.*)\]/)) { // currency
    mycurrency = matches[0].substring(2,matches[0].length-1).replace(/ /g," "); // nbsp
  }
  
  return mycurrency + digitCommas_(amount, chop);
}

function digitCommas_(numstr, chop, formatstr) {
  //  formatstr can be one of
  //             -- plain text
  //  #,##0      -- whole numbers
  //  #,##0.0    -- 1 decimal digits
  //  #,##0.00   -- 2 decimal digits

  if (numstr == undefined) { return }
  var asNum;
  if      (numstr.constructor.name == "Number") { asNum = numstr; }
  else { Logger.log("WARNING: digitCommas given a %s to work with (%s); hope Number() works!",
					numstr.constructor.name, numstr);
		 asNum = Number(numstr);
	   }
  if (chop == undefined && formatstr != undefined) {
	chop = 0;
	if (formatstr.match(/0\.(0+)/)) { chop = formatstr.match(/0\.(0+)/)[1].length }
  }
  asNum = asNum.toFixed(chop);

  var parts = asNum.split(/\./);
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  
  var asString = parts.join(".");
  // Logger.log("digitCommas_(%s,%s,%s): returning %s", numstr, chop, formatstr, asString);
  return asString;
}

function currencyFor_(string) {
  // extract the currency prefix
  var mymatch = string.match(/(.*?)\d/);
  if (mymatch && mymatch[1]) { return mymatch[1] }
}


function plural_verb(num, singular, plural, locale) {
  if (locale == undefined) { locale = "en-US" }
  if (num.constructor.name == "Array") { num = num.length }
  if (locale == "en-US") {
	if (plural == undefined) {
	  if      (singular == "is")  { plural = "are"; }
	  else if (singular == "has") { plural = "have"; }
	  else                        { plural = singular.replace(/s$/,""); }
	}
	if (num  > 1) { return plural }
	if (num == 1) { return singular }
	if (num == 0) { return plural }
  }
}

// ---------------------------------------------------------------------------------------------------------------- commaAnd
function commaAnd(mylist, propertyName) {
  var actualList = mylist.map(function(e){return (propertyName
												  ? (propertyName.constructor.name == "String"   ? e[propertyName] :
													 propertyName.constructor.name == "Function" ? propertyName(e) : e)
												  : e)});
  if      (actualList.length == 0) { return "" }
  else if (actualList.length == 1) { return actualList[0] }
  else if (actualList.length == 2) { return actualList.join(" and ") }
  else                             { return [actualList.splice(0,actualList.length-1).join(", "), actualList[actualList.length-1]].join(", and ") }
}

// ---------------------------------------------------------------------------------------------------------------- mylogger

// ---------------------------------------------------------------------------------------------------------------- mylogger
function mylogger(input) {
  Logger.log(input);
}
// TODO:
// data.parties._investor_plural
// how many parties are there in all of the investors? if there's only one investor and it's a natural person then the answer is 1.
// otherwise the answer is probably plural.
// used by the convertible_loan_waiver.


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
;	sheet.getRange("D2").activate();

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

function cloneSpreadsheet() {
  // only callable from the legalese controller
  // the code below was inspired by otherSheets_()

  var activeRange = SpreadsheetApp.getActiveRange(); // user-selected range
  var toreturn = [];
  var legalese_root = legaleseRootFolder_();
  var mySheet = activeRange.getSheet();
  var insertions = 0;
  for (var i = 0; i < (insertions+activeRange.getValues().length); i++) {
	Logger.log("cloneSpreadsheet: i = %s; activeRange.getValues().length = %s", i, activeRange.getValues().length);
	
	var myRow = mySheet.getRange(activeRange.getRow()+i, 1, 1, mySheet.getLastColumn());

	// specification:
	// column A: literal txt "clone"
	// column B: source spreadsheet to clone either as a URL or a =hyperlink formula
	// column C: the new title of the spreadsheet
	// column D, E, ...: the names of the sheets that should be copied. By default, only Entities will be cloned.
	// then we reset column A and B to the the ssid and the sheetid
	
	Logger.log("you are interested in row " + myRow.getValues()[0]);
	if (myRow.getValues()[0][0] != "clone") { Logger.log("not a cloneable row. skipping"); continue }
	
	var sourceSheet;
	try { sourceSheet = hyperlink2sheet_(myRow.getFormulas()[0][1] || myRow.getValues()[0][1]) } catch (e) {
	  Logger.log("couldn't open source spreadsheet ... probably on wrong row. %s", e);
	  throw("is your selection on the correct row?");
	  return;
	}

	// duplicate the spreadsheet
	var copySS = sourceSheet.getParent().copy(myRow.getValues()[0][2]);
	Logger.log("copied %s to %s", sourceSheet.getParent().getName(), myRow.getValues()[0][2]);

	var SSfile = DriveApp.getFileById(copySS.getId());
	legalese_root.addFile(SSfile);
	DriveApp.getRootFolder().removeFile(SSfile);
	Logger.log("moved to legalese root folder");

	// columns D onward specify the names of desired sheets
	// if user did not specify any sheets then we assume that all sheets were desired
	// if user did specify then we delete all copied sheets which were not specified
	var specified = myRow.getValues()[0].splice(3).filter(function(cellvalue){return cellvalue != undefined && cellvalue.length});
	Logger.log("user specified desired sheets %s", specified);
	if (specified.length) {
	  var sheets = copySS.getSheets();
	  for (var si = 0; si < sheets.length; si++) {
		if (specified.indexOf(sheets[si].getSheetName()) == -1) { // unwanted
		  copySS.deleteSheet(sheets[si]);
		}
	  }
	}
	mySheet.getRange(myRow.getRowIndex(),4,1,myRow.getLastColumn()).clearContent();
	
	// which sheets are left?
	sheets = copySS.getSheets();
	Logger.log("copied spreadsheet now has %s agreement sheets: %s", sheets.length, sheets.map(function(s){return s.getSheetName()}));

	var inner_insertions = 0;
	
	for (var j = 0; j < sheets.length; j++) {
	  var sheet = sheets[j];
	  var newRow;

	  // first response replaces the active row. subsequent responses require row insertions.
	  if (j == 0) newRow = myRow
	  else {
		Logger.log("inserting a new row after index %s", myRow.getRowIndex());
		newRow = mySheet
		  .insertRowAfter(myRow.getRowIndex() + inner_insertions)
		  .getRange(myRow.getRowIndex()+inner_insertions+1,1,1,5);
		inner_insertions++;
	  }
		
	  newRow.getCell(1,1).setValue(copySS.getId());
	  newRow.getCell(1,2).setValue(sheet.getSheetId());
	  newRow.getCell(1,3).setValue("=HYPERLINK(\""
								   +copySS.getUrl()
								   +"#gid="
								   +sheet.getSheetId()
								   +"\",\""
								   +sheet.getParent().getName() + " / " + sheet.getName()
								   +"\")");
	}
	insertions += inner_insertions;
  }
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

var _loaded = true;
