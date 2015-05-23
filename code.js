// most of the code for legalese lives inside libraries:
// legaleseMain M6YlbsVrWR18KeWvOMc3708UQWaHMB8in
// go to Resources / Libraries and import it.

//---------------------------------------------------------------------------------------------------------------- onOpen
/**
 * Adds a custom menu to the active spreadsheet.
 * The onOpen() function, when defined, is automatically invoked whenever the
 * spreadsheet is opened.
 * For more information on using the Spreadsheet API, see
 * https://developers.google.com/apps-script/service_spreadsheet
 */
function onOpen() {
  var legaleseMainExists = false;
  try { if (legaleseMain) { legaleseMainExists = legaleseMain._loaded } }
  catch (e) { Logger.log("caught error %s while testing legaleseMain", e) }

  var legaleseSignatureExists = false;
  try { if (legaleseSignature) { legaleseSignatureExists = legaleseSignature._loaded } }
  catch (e) { Logger.log("caught error %s while testing legaleseSignature", e) }

  if (legaleseMainExists) {
	legaleseMain.onOpen(SpreadsheetApp.getUi().createAddonMenu(),
						legaleseSignatureExists ? legaleseSignature : null
					   );
  }
};

