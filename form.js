// ---------------------------------------------------------------------------------------------------------------- setupForm
/**
 * establish a form for parties to fill in their personal details
 *
 */
function setupForm(sheet) {

  var sheetPassedIn = ! (sheet == undefined);
  if (! sheetPassedIn && (SpreadsheetApp.getActiveSpreadsheet().getName().toLowerCase() == "legalese controller"
						  ||
						  SpreadsheetApp.getActiveSheet().getSheetName().toLowerCase() == "controller")
						 ) {
	fmLog("in controller mode, switching to setupOtherForms_()");
	setupOtherForms_();
	return;
  }
  var sheet = sheet || SpreadsheetApp.getActiveSheet();

  var ss = sheet.getParent();
  var entitiesByName = {};
  var readRows_ = new readRows(sheet, entitiesByName);

//  fmLog("setupForm: readRows complete: %s", readRows_);

  if (readRows_.principal
	  && readRows_.principal._origin_sheet_id
	  && readRows_.principal._origin_sheet_id != sheet.getSheetId()) {
	fmLog("setupForm: switching target of the form to the %s sheet.", sheet.getSheetName());
	sheet = getSheetById_(ss, readRows_.principal._origin_sheet_id);
	entitiesByName = {};
	readRows_ = new readRows(sheet, entitiesByName);
  }
  
  var data   = readRows_.terms;
  var config = readRows_.config;

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
	var form_confirmation = config.form_confirmation || 'Thanks for responding!';
	form = FormApp.create(form_title)
      .setDescription(form_description)
      .setConfirmationMessage(form_confirmation)
      .setAllowResponseEdits(true)
      .setAcceptingResponses(true)
	  .setProgressBar(false);

	// don't create a new trigger if there is already one available
	var triggers = ScriptApp.getUserTriggers(ss);
	if (triggers.length > 0 && // is there already a trigger for onFormSubmit?
		triggers.filter(function(t) { return t.getEventType() == ScriptApp.EventType.ON_FORM_SUBMIT }).length > 0) {
	  fmLog("we already have an onFormSubmit trigger, so no need to add a new one.");
	}
	else {
	  ScriptApp.newTrigger('onFormSubmit').forSpreadsheet(ss).onFormSubmit().create();
	  fmLog("setting onFormSubmit trigger");
	}
  }

  // Create the form and add a multiple-choice question for each timeslot.
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  fmLog("setting form destination to %s", ss.getId());
  PropertiesService.getUserProperties().setProperty("legalese."+ss.getId()+".formActiveSheetId", sheet.getSheetId().toString());
  fmLog("setting formActiveSheetId to %s", sheet.getSheetId().toString());

  var origentityfields = readRows_._origentityfields;
  fmLog("origentityfields = " + origentityfields);
  for (var i in origentityfields) {
	if (i == undefined) { continue }
	var entityfield = origentityfields[i];
	if (entityfield == undefined) { continue }
	fmLog("entityfield "+i+" = " + entityfield.fieldname);
	if (i == "undefined") { fmLog("that's, like, literally the string undefined, btw."); continue; } // yes, this actually happens.
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
  fmLog("added to legalese root folder");

  DriveApp.getRootFolder().removeFile(DriveApp.getFileById(form.getId()));
  DriveApp.getRootFolder().removeFile(DriveApp.getFileById(ss.getId()));

  var form_url = form.getPublishedUrl();
  var short_url = form.shortenFormUrl(form_url);
  return short_url;
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
function onFormSubmit(e, legaleseSignature) {
  fmLog("onFormSubmit: beginning");

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetId = PropertiesService.getUserProperties().getProperty("legalese."+ss.getId()+".formActiveSheetId");

  if (sheetId == undefined) { // uh-oh
	fmLog("onFormSubmit: no formActiveSheetId property, so I don't know which sheet to record party data into. bailing.");
	return;
  }
  else {
	fmLog("onFormSubmit: formActiveSheetId property = %s", sheetId);
  }

  var sheet = getSheetById_(SpreadsheetApp.getActiveSpreadsheet(), sheetId);
  var entitiesByName = {}
  var readRows_ = new readRows(sheet, entitiesByName);
  var data   = readRows_.terms;
  var config = readRows_.config;

  if (config.demo_mode) {
	// delete any existing user lines, then add this new one.
	
	var parties = roles2parties(readRows_);
	if (parties.user) {
	  for (var pui = parties.user.length - 1; pui >=0; pui--) {
		var party = parties.user[pui];
		fmLog("onFormSubmit: demo_mode = true, so deleting existing party %s on row %s", party.name, party._spreadsheet_row);
		sheet.deleteRow(party._spreadsheet_row);
	  }

	  SpreadsheetApp.flush();
	
	// reread.
	  readRows_ = new readRows(sheet, entitiesByName);
	  data   = readRows_.terms;
	  config = readRows_.config;
	}
  }
  
  // add a row and insert the received fields
  fmLog("onFormSubmit: inserting a row after " + (parseInt(readRows_._last_entity_row)+1));
  sheet.insertRowAfter(readRows_._last_entity_row+1); // might need to update the commitment sum range
  var newrow = sheet.getRange(readRows_._last_entity_row+2,1,1,sheet.getMaxColumns());
//  newrow.getCell(0,0).setValue("bar");

  // loop through the origentityfields inserting the new data in the right place.
  for (names in e.namedValues) {
	fmLog("onFormSubmit: e.namedValues = " + names + ": "+e.namedValues[names][0]);
  }

  var origentityfields = readRows_._origentityfields;
  fmLog("onFormSubmit: origentityfields = " + origentityfields);

  for (var i = 0; i < origentityfields.length; i++) {
	var entityfield = origentityfields[i];

	// fill in the default party role
	if (i == 0 && entityfield == undefined) {
	  entityfield = { fieldname: "_party_role", column: 1 };
	  e.namedValues["_party_role"] = [ config.default_party_role ? config.default_party_role.value : "" ];
	  fmLog("setting default party row in column 1 to %s", e.namedValues["_party_role"]);
	}
	  
	else if (entityfield == undefined) { fmLog("entityfield %s is undefined!", i); continue; }
	
	// fill in any fields which are hidden and have a default value configured. maybe in future we should extend the default-filling to all blank submissions
	else if (e.namedValues[entityfield.fieldname] == undefined) {
	  fmLog("did not receive form submission for %s", entityfield.fieldname);

	  if (entityfield["default"] != undefined) {
		fmLog("filling with default value %s", entityfield["default"]);
		e.namedValues[entityfield.fieldname] = [ entityfield["default"] ];
	  }
	  else {
		continue;
	  }
	}

	// TODO: set the time and date of submission if there is a timestamp
	
	fmLog("onFormSubmit: entityfield "+i+" (" + entityfield.fieldname+") (column="+entityfield.column+") = " + e.namedValues[entityfield.fieldname][0]);

	var newcell = newrow.getCell(1,parseInt(entityfield.column));
	fmLog("onFormSubmit: setting value of cell to " + e.namedValues[entityfield.fieldname]);
	newcell.setValue(e.namedValues[entityfield.fieldname][0]);
  }

  if (config.demo_mode) {
	fmLog("onFormSubmit: demo_mode = TRUE ... will proceed to create templates and mail out");
	fillTemplates(sheet);
	fmLog("onFormSubmit: demo_mode = TRUE ... fillTemplates() completed. next we should inject into echosign.");

	SpreadsheetApp.flush();
	
	if (legaleseSignature) {
	  fmLog("onFormSubmit: demo_mode = TRUE ... injecting into echosign. but first we will sleep for 3 minutes.");
	  // we might have to move this to a separate run loop
	  // because sometimes the InDesign script is busy and will take more than 3 minutes to produce results.
	  Utilities.sleep(1000*60*3);
	  fmLog("onFormSubmit: demo_mode = TRUE ... injecting into echosign by calling uploadAgreement().");
	  legaleseSignature.uploadAgreement(sheet, false);
	}
	else {
	  fmLog("onFormSubmit: demo_mode = TRUE ... but the legaleseSignature library is not available, so no echosign.");
	}
  }
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

// for the controller
// ---------------------------------------------------------------------------------------------------------------- setupOtherForms_
function setupOtherForms_() {
  var sheets = otherSheets();
  for (var i = 0; i < sheets.length; i++) {
	var sheet = sheets[i];
	var shortUrl = setupForm(sheet);
	var myRow = SpreadsheetApp.getActiveRange().getSheet().getRange(SpreadsheetApp.getActiveRange().getRow()+i, 1, 1, 10);
	fmLog("smoochy says setupOtherForms_: sheet %s is on row %s", i.toString(), myRow.getRowIndex().toString());
	myRow.getCell(1,7).setValue(shortUrl);
  }
}

