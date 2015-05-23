// ---------------------------------------------------------------------------------------------------------------- onOpen
/**
 * Adds a custom menu to the active spreadsheet.
 * The onOpen() function, when defined, is automatically invoked whenever the
 * spreadsheet is opened.
 * For more information on using the Spreadsheet API, see
 * https://developers.google.com/apps-script/service_spreadsheet
 */
function onOpen() {
  if (legaleseMain && legaleseMain._loaded) {
	legaleseMain.onOpen(SpreadsheetApp.getUi().createAddonMenu());
  }
};

