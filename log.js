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
  if (loglevel == undefined) { loglevel = 7 }
  params[0] = module + " " + params[0];

  // If we're logging from an xml file, check logconfig's "xml" property
  var logkey = (module.toUpperCase().indexOf("XML") !== -1) ? "xml" : module;
  // by default, display INFO and above but not DEBUG
  var logfilter = logconfig[logkey] == undefined ? 6 : logconfig[logkey];

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

function xxLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
	params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  myLog(params,"XXX", loglevel, logconfig);
}

/* Logging function naming convention for JS modules:
   The logging function is named xyLog, where xy is a function of the module filename:
   If it contains multiple words, xy = initials of first two words (legaleseMain = lm)
   If it is a single word, xy = first two letters, unless there is a conflict, in which case,
     x = first letter and y = last consonant of the filename for all conflicting filenames
       If a conflict still occurs, this convention may be revised, so check back often!
*/

function cdLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
	params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  myLog(params,"code", loglevel, logconfig);
}

function crLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
	params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  myLog(params,"controller", loglevel, logconfig);
}

function esLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
	params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  myLog(params,"esop", loglevel, logconfig);
}

function ctLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
	params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  myLog(params,"captable", loglevel, logconfig);
}

function deLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
	params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  myLog(params,"dependencies", loglevel, logconfig);
}

function fmLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
	params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  myLog(params,"form", loglevel, logconfig);
}

function ftLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
	params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  myLog(params,"format", loglevel, logconfig);
}

function liLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
	params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  myLog(params,"lingua", loglevel, logconfig);
}

function lmLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
	params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  myLog(params,"legaleseMain", loglevel, logconfig);
}

function lsLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
	params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  myLog(params,"legaleseSignature", loglevel, logconfig);
}

function rlLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
	params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  myLog(params,"robot-legalese", loglevel, logconfig);
}

function rrLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
	params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  myLog(params,"readrows", loglevel, logconfig);
}

function svLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
	params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  myLog(params,"svg", loglevel, logconfig);
}

function teLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
	params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  myLog(params,"templates", loglevel, logconfig);
}

function utLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
	params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  myLog(params,"util", loglevel, logconfig);
}

function xmLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
    params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  myLog(params, "(XML) " + currentTemplate, loglevel, logconfig);
}

