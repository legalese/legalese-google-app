// this is the stub file which lives inside a bound container -- a spreadsheet that uses Legalese.
// it loads up the legaleseMain library and passes a handful of key function calls over to that.
// the bulk of the work happens inside the legaleseMain library. (and the legaleseSignature library).

// most of the code for legalese lives inside libraries:
// legaleseMain       M6YlbsVrWR18KeWvOMc3708UQWaHMB8in
// legaleseSignature  M_Wuaitt08FDk5mzAwEoxpXYH5ITXFjPS
// go to Resources / Libraries and import it. the first is needed.
// the second requires an API key and is local to each installation.

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
  catch (e) { Logger.log("code.js: caught error %s while testing legaleseMain", e) }

  var legaleseSignatureExists = false;
  try { if (legaleseSignature) { legaleseSignatureExists = legaleseSignature._loaded } }
  catch (e) { cdLog("caught error %s while testing legaleseSignature", e) }

  if (legaleseMainExists) {
	legaleseMain.onOpen(SpreadsheetApp.getUi().createAddonMenu(),
						legaleseSignatureExists ? legaleseSignature : null
					   );
  }
};


function onFormSubmit(e) {
  var legaleseMainExists = false;
  try { if (legaleseMain) { legaleseMainExists = legaleseMain._loaded } }
  catch (e) { Logger.log("code.js: caught error %s while testing legaleseMain", e) }

  if (! legaleseMainExists) return;

  var legaleseSignatureExists = false;
  try { if (legaleseSignature) { legaleseSignatureExists = legaleseSignature._loaded } }
  catch (e) { cdLog("caught error %s while testing legaleseSignature", e) }

  if (legaleseSignatureExists) legaleseMain.onFormSubmit(e, legaleseSignature);
  else                         legaleseMain.onFormSubmit(e, null);
}


function LOOKUP2D(w,r,lrtb) {
  return legaleseMain.LOOKUP2D(w,r,lrtb);
}

function quicktest() {
  return legaleseMain.quicktest();
}
