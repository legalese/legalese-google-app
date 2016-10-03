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
  myLog(params,"code.js", loglevel, logconfig);
}

function crLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
	params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  myLog(params,"controller.js", loglevel, logconfig);
}

function esLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
	params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  myLog(params,"esop.js", loglevel, logconfig);
}

function ctLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
	params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  myLog(params,"captable.js", loglevel, logconfig);
}

function deLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
	params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  myLog(params,"dependencies.js", loglevel, logconfig);
}

function fmLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
	params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  myLog(params,"form.js", loglevel, logconfig);
}

function ftLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
	params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  myLog(params,"format.js", loglevel, logconfig);
}

function liLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
	params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  myLog(params,"lingua.js", loglevel, logconfig);
}

function lmLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
	params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  myLog(params,"legaleseMain.js", loglevel, logconfig);
}

function lsLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
	params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  myLog(params,"legaleseSignature.js", loglevel, logconfig);
}

function rlLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
	params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  myLog(params,"robot-legalese.js", loglevel, logconfig);
}

function rrLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
	params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  myLog(params,"readrows.js", loglevel, logconfig);
}

function svLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
	params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  myLog(params,"svg.js", loglevel, logconfig);
}

function teLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
	params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  myLog(params,"templates.js", loglevel, logconfig);
}

function utLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
	params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  myLog(params,"util.js", loglevel, logconfig);
}

function xmLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
    params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  myLog(params, "(XML) " + currentTemplate, loglevel, logconfig);
}

